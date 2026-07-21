import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface TransformConfig {
  scale: number;
  x: number;
  y: number;
}

export interface ScaleAction {
  actionCode: string;
  gifUrl: string;
  transform: TransformConfig;
}

type ScaleConfig = Record<string, Record<string, Record<string, TransformConfig>>>;

const STAGE_SCALE_KEY = '__stageScale';

function rootQuery(animalsRoot: string): string {
  return `?saveRoot=${encodeURIComponent(animalsRoot)}`;
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function normalizeTransform(value: unknown): TransformConfig {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { scale: value, x: 0, y: 0 };
  }
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<TransformConfig>)
    : {};
  return {
    scale: typeof source.scale === 'number' && Number.isFinite(source.scale) ? source.scale : 1,
    x: typeof source.x === 'number' && Number.isFinite(source.x) ? source.x : 0,
    y: typeof source.y === 'number' && Number.isFinite(source.y) ? source.y : 0,
  };
}

export class ScaleStore {
  private readonly configJsonPath: string;
  private readonly configTsPath: string;

  constructor(
    private readonly projectRoot: string,
    private readonly animalsRoot: string,
  ) {
    this.configJsonPath = path.join(
      projectRoot,
      'apps/teacher-web/src/components/pet-animation-scale-config.json',
    );
    this.configTsPath = path.join(
      projectRoot,
      'apps/teacher-web/src/components/pet-animation-scale-config.ts',
    );
  }

  async load(petName: string, stage: string): Promise<{
    actions: ScaleAction[];
    species: string;
    stageTransform: TransformConfig;
  }> {
    this.assertTarget(petName, stage);
    const species = (await this.resolveSpecies(petName).catch(() => null)) ?? petName;
    const config = await this.readConfig();
    const stageConfig = config[species]?.[stage] ?? {};
    let actions = await this.databaseActions(species, Number(stage.replace('stage', ''))).catch(
      () => [],
    );
    if (actions.length === 0) actions = await this.localActions(petName, stage);
    return {
      actions: actions.map((action) => ({
        ...action,
        transform: normalizeTransform(stageConfig[action.actionCode]),
      })),
      species,
      stageTransform: normalizeTransform(stageConfig[STAGE_SCALE_KEY]),
    };
  }

  async save(
    species: string,
    stage: string,
    actionTransforms: Record<string, TransformConfig>,
    stageTransform: TransformConfig,
  ): Promise<void> {
    this.assertTarget(species, stage);
    const config = await this.readConfig();
    config[species] ??= {};
    config[species][stage] ??= {};
    config[species][stage][STAGE_SCALE_KEY] = normalizeTransform(stageTransform);
    for (const [action, transform] of Object.entries(actionTransforms)) {
      if (!/^[\w-]+$/.test(action)) continue;
      config[species][stage][action] = normalizeTransform(transform);
    }
    await fs.writeFile(this.configJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await fs.writeFile(this.configTsPath, this.serializeTs(config), 'utf8');
  }

  resolveLocalGif(petName: string, stage: string, file: string): string {
    this.assertTarget(petName, stage);
    if (!/^[\w-]+\.gif$/i.test(file)) throw new Error('GIF 文件名不合法');
    return path.join(this.animalsRoot, petName, stage, 'gif', file);
  }

  private assertTarget(petName: string, stage: string): void {
    if (!/^[\p{L}\p{N}_-]+$/u.test(petName)) throw new Error('动物名不合法');
    if (!/^stage[1-5]$/.test(stage)) throw new Error('Stage 必须是 stage1 到 stage5');
  }

  private async readConfig(): Promise<ScaleConfig> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.configJsonPath, 'utf8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as ScaleConfig)
        : {};
    } catch {
      return {};
    }
  }

  private async resolveSpecies(input: string): Promise<string | null> {
    const rows = await this.mysqlQuery(`
      SELECT code, name FROM pet_species WHERE deleted_at IS NULL ORDER BY id;
    `);
    const normalized = input.trim().toLowerCase().replace(/[\s_]+/g, '-');
    for (const line of rows.trim().split('\n').filter(Boolean)) {
      const [code = '', name = ''] = line.split('\t');
      const aliases = [code, name, name.startsWith('小') ? name.slice(1) : ''];
      if (aliases.some((alias) => alias.trim().toLowerCase().replace(/[\s_]+/g, '-') === normalized)) {
        return code;
      }
    }
    return null;
  }

  private async databaseActions(species: string, stageNumber: number): Promise<ScaleAction[]> {
    const rows = await this.mysqlQuery(`
      SELECT par.action_code, COALESCE(par.gif_url, '')
      FROM pet_action_resources par
      JOIN pet_species ps ON ps.id = par.species_id
      WHERE ps.code = ${sqlString(species)}
        AND par.stage_number = ${stageNumber}
        AND par.deleted_at IS NULL
      ORDER BY par.action_code;
    `);
    return rows.trim().split('\n').filter(Boolean).map((line) => {
      const [actionCode = '', gifUrl = ''] = line.split('\t');
      return { actionCode, gifUrl, transform: normalizeTransform(null) };
    });
  }

  private async localActions(petName: string, stage: string): Promise<ScaleAction[]> {
    const gifDir = path.join(this.animalsRoot, petName, stage, 'gif');
    const files = await fs.readdir(gifDir).catch(() => []);
    return files.filter((file) => file.endsWith('.gif')).sort().map((file) => ({
      actionCode: file.replace(/\.gif$/i, ''),
      gifUrl: `/api/animation-workbench/local-gifs/${encodeURIComponent(petName)}/${stage}/${file}${rootQuery(this.animalsRoot)}`,
      transform: normalizeTransform(null),
    }));
  }

  private mysqlQuery(sql: string): Promise<string> {
    const container = process.env.MYSQL_CONTAINER ?? 'petpals-local-mysql-1';
    const user = process.env.MYSQL_USER ?? 'petpals';
    const password = process.env.MYSQL_PASSWORD ?? 'petpals';
    const database = process.env.MYSQL_DATABASE ?? 'petpals';
    return new Promise((resolve, reject) => {
      execFile(
        'docker',
        ['exec', container, 'mysql', '--default-character-set=utf8mb4', `-u${user}`, `-p${password}`, '-D', database, '--batch', '--raw', '--skip-column-names', '-e', sql],
        { maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve(stdout);
        },
      );
    });
  }

  private serializeTs(config: ScaleConfig): string {
    return `export interface PetAnimationTransformConfig {
  scale?: number;
  x?: number;
  y?: number;
}

export type PetAnimationConfigValue = number | PetAnimationTransformConfig;
export type PetAnimationScaleConfig = Record<string, Record<string, Record<string, PetAnimationConfigValue | undefined> | undefined> | undefined>;

// 缩放系数由动画工作台固化，生产包无需运行时读取 JSON。
export const PET_ANIMATION_SCALE_CONFIG = ${JSON.stringify(config, null, 2)} as PetAnimationScaleConfig;
`;
  }
}
