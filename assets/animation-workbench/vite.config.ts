import react from '@vitejs/plugin-react';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

import { ImagePipeline } from './server/image-pipeline';
import { ScaleStore, type TransformConfig } from './server/scale-store';
import { TimingStore, type TimingConfig } from './server/timing-store';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(appDir, '../..');
const defaultAnimalsRoot = path.join(projectRoot, 'workspace/animals');
const actionSkillDir = path.join(projectRoot, 'references/source-skills/petpals-action-animation-skill');
const eggSkillDir = path.join(projectRoot, 'references/source-skills/petpals-egg-animation-skill');
const sleepSkillDir = path.join(projectRoot, 'references/source-skills/sleep-animator-skill');
const refreshSkillDir = path.join(projectRoot, 'references/source-skills/refresh-pet-gifs');
const pipelineSvg = path.join(projectRoot, 'assets/final_petpals_pipeline.svg');
const codexBinary = process.env.CODEX_BINARY ?? '/Applications/ChatGPT.app/Contents/Resources/codex';
const generatedImagesDir = '/Users/cxy/.codex/generated_images';
const promptDir = path.join(projectRoot, 'references/prompts');
const slicerSkillDir = path.join(projectRoot, 'references/source-skills/sprite-slicer-skill');
const imagegenSkillDir = process.env.IMAGEGEN_SKILL_DIR ?? path.join(process.env.HOME ?? '', '.codex/skills/.system/imagegen');
const workbenchDataRoot = path.join(appDir, '.data');
const imageOutputRoot = path.join(workbenchDataRoot, 'images');
const imagePipeline = new ImagePipeline({
  codexBinary,
  generatedImagesDir,
  imagegenSkillDir,
  outputRoot: imageOutputRoot,
});
const defaultQiniuApiKey = process.env.QINIU_API_KEY ?? '';

type RunKind = 'actions' | 'slice' | 'gif';
type Stage1Style = 'egg' | 'sleep';
type RunStatus = 'running' | 'success' | 'failed';

interface StartRunBody {
  actionName?: string;
  actionPrompt?: string;
  includeSnapshot?: boolean;
  includeUpload?: boolean;
  kind?: RunKind;
  petName?: string;
  qiniuApiKey?: string;
  saveRoot?: string;
  stage?: string;
  stage1Style?: Stage1Style;
}

interface SpeciesCreateBody {
  code?: string;
  description?: string;
  isLegendary?: boolean;
  name?: string;
  originstatus?: string;
  petName?: string;
  sortOrder?: number;
}

interface SpeciesCheckResult {
  code?: string;
  database?: {
    error?: string;
    exists: boolean;
    reachable: boolean;
  };
  exists: boolean;
  missing: string[];
  name?: string;
  species: string;
}

interface RunRecord {
  actionName?: string;
  completedAt?: string;
  id: string;
  kind: RunKind;
  logs: string[];
  petName: string;
  saveRoot: string;
  startedAt: string;
  status: RunStatus;
  stage?: string;
  summary?: string;
}

interface CommandSpec {
  args: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  label: string;
}

interface ImageToolStage {
  imagePath?: string;
  imageUrl?: string;
  status: string;
}

interface ImageToolJob {
  animalName: string;
  stages: Record<string, ImageToolStage>;
  status: string;
}

const runs = new Map<string, RunRecord>();
const actionResourceDefaults = [
  { code: 'idle', durationMs: 3000, isLoop: 1, preloadTier: 1, priority: 0 },
  { code: 'waving', durationMs: 1200, isLoop: 1, preloadTier: 2, priority: 10 },
  { code: 'jumping', durationMs: 1200, isLoop: 0, preloadTier: 3, priority: 10 },
  { code: 'walk_left', durationMs: 1200, isLoop: 1, preloadTier: 3, priority: 5 },
  { code: 'walk_right', durationMs: 1200, isLoop: 1, preloadTier: 3, priority: 5 },
  { code: 'eat', durationMs: 1200, isLoop: 0, preloadTier: 2, priority: 30 },
  { code: 'failed', durationMs: 1600, isLoop: 0, preloadTier: 3, priority: 20 },
  { code: 'levelup', durationMs: 1200, isLoop: 0, preloadTier: 2, priority: 40 },
  { code: 'happy', durationMs: 1200, isLoop: 0, preloadTier: 2, priority: 30 },
];

function isSafePetName(value: string): boolean {
  // 资源目录允许中文动物名，但禁止斜杠和 shell 元字符，避免前端输入越过动物目录。
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(value);
}

function assertPetName(petName: unknown): string {
  if (typeof petName !== 'string' || !isSafePetName(petName)) {
    throw new Error('动物名只能包含中英文、数字、下划线和中划线');
  }
  return petName;
}

function normalizeSaveRoot(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return defaultAnimalsRoot;
  const expanded = value.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? '');
  return path.resolve(expanded);
}

async function saveFiveStageSet(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体不能为空');
  }

  const source = body as {
    animalName?: unknown;
    stage1Style?: Stage1Style;
    saveRoot?: unknown;
    stages?: Record<string, ImageToolStage>;
  };
  const petName = assertPetName(source.animalName);
  const saveRoot = normalizeSaveRoot(source.saveRoot);
  const stages = source.stages ?? {};
  const stage1Source = source.stage1Style === 'sleep' ? '1' : '0';
  const mapping = [
    { from: stage1Source, label: source.stage1Style === 'sleep' ? '初生睡眠形态' : '蛋形态', to: 'stage1' },
    { from: '2', label: '幼年原始形态', to: 'stage2' },
    { from: '3', label: '少年形态', to: 'stage3' },
    { from: '4', label: '成年形态', to: 'stage4' },
    { from: '5', label: '最终形态', to: 'stage5' },
  ];
  const saved = [];

  for (const item of mapping) {
    const imagePath = stages[item.from]?.imagePath;
    if (!imagePath || typeof imagePath !== 'string') {
      throw new Error(`缺少 ${item.label} 图片，不能保存五阶段`);
    }
    if (!imagePipeline.isManagedOutput(imagePath)) {
      throw new Error(`图片路径不在工作台输出目录中: ${imagePath}`);
    }
    if (!(await exists(imagePath))) {
      throw new Error(`图片文件不存在: ${imagePath}`);
    }

    const targetDir = path.join(saveRoot, petName, item.to);
    const targetPath = path.join(targetDir, 'base.png');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(imagePath, targetPath);
    saved.push({ from: `tool-stage${item.from}`, path: targetPath, to: item.to });
  }

  return { saved };
}

async function saveSingleImageStage(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体不能为空');
  }

  const source = body as {
    animalName?: unknown;
    imagePath?: unknown;
    saveRoot?: unknown;
    stageNum?: unknown;
  };
  const petName = assertPetName(source.animalName);
  const saveRoot = normalizeSaveRoot(source.saveRoot);
  const stageNum = normalizeImageToolStage(source.stageNum);
  if (typeof source.imagePath !== 'string') throw new Error('缺少图片路径');
  if (!imagePipeline.isManagedOutput(source.imagePath)) {
    throw new Error(`图片路径不在工作台输出目录中: ${source.imagePath}`);
  }
  if (!(await exists(source.imagePath))) {
    throw new Error(`图片文件不存在: ${source.imagePath}`);
  }

  const targetDir = path.join(saveRoot, petName, `stage${stageNum}`);
  const targetPath = path.join(targetDir, 'base.png');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(source.imagePath, targetPath);
  return { savedPath: targetPath };
}

function runCommand(spec: CommandSpec, record: RunRecord): Promise<void> {
  record.logs.push(`\n$ ${spec.label}`);
  record.logs.push(`${spec.command} ${spec.args.join(' ')}`);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutMs = 6 * 60 * 60 * 1000;
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      if (settled) return;
      record.logs.push(`\nERROR: ${spec.label} 超过 6 小时未完成，已自动停止`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => record.logs.push(String(chunk).trimEnd()));
    child.stderr.on('data', (chunk) => record.logs.push(String(chunk).trimEnd()));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${spec.label} 失败，退出码 ${code ?? 'unknown'}`));
    });
  });
}

async function listAnimals(saveRoot: string): Promise<string[]> {
  const entries = await fs.readdir(saveRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

async function getInventory(petName: string, saveRoot: string) {
  const petDir = path.join(saveRoot, petName);
  const result = [];

  for (const stage of ['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6']) {
    const stageDir = path.join(petDir, stage);
    const singleDir = path.join(stageDir, '单帧');
    const gifDir = path.join(stageDir, 'gif');
    const longDir = path.join(stageDir, '长帧');
    const rawDir = path.join(stageDir, 'raw_generated');

    const [base, timing, singleActions, longFrames, rawFrames, gifs] = await Promise.all([
      exists(path.join(stageDir, 'base.png')),
      exists(path.join(stageDir, 'animation-timing.json')),
      listChildDirs(singleDir),
      listFiles(longDir, '.png'),
      listFiles(rawDir, '.png'),
      listFiles(gifDir, '.gif'),
    ]);
    const actionNames = Array.from(
      new Set([
        ...singleActions,
        ...longFrames.map((file) => file.replace(/\.png$/i, '')),
        ...rawFrames.map((file) => file.replace(/\.png$/i, '')),
        ...gifs.map((file) => file.replace(/\.gif$/i, '')),
      ]),
    ).sort();
    const actionAssets = Object.fromEntries(
      await Promise.all(actionNames.map(async (action) => {
        const frames = await listFiles(path.join(singleDir, action), '.png');
        const files = [
          path.join(rawDir, `${action}.png`),
          path.join(longDir, `${action}.png`),
          path.join(gifDir, `${action}.gif`),
          ...frames.map((frame) => path.join(singleDir, action, frame)),
        ];
        const updatedAt = await latestMtime(files);
        return [
          action,
          {
            frameCount: frames.length,
            frames,
            gif: gifs.includes(`${action}.gif`),
            longFrame: longFrames.includes(`${action}.png`),
            raw: rawFrames.includes(`${action}.png`),
            updatedAt,
          },
        ];
      })),
    );

    result.push({
      actionAssets,
      base,
      gifs,
      longFrames,
      rawFrames,
      singleActions,
      stage,
      timing,
    });
  }

  return result;
}

async function latestMtime(files: string[]): Promise<string | null> {
  const times = await Promise.all(
    files.map(async (file) => {
      try {
        return (await fs.stat(file)).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  const latest = Math.max(...times, 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listChildDirs(targetPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function listFiles(targetPath: string, ext: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function sqlLiteral(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.trunc(value)) : '0';
}

function timestampSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function getInsertValues(sql: string, table: string): string {
  const match = new RegExp(`INSERT INTO \`${table}\` VALUES ([\\s\\S]*?);`).exec(sql);
  if (!match?.[1]) throw new Error(`snapshot 缺少 ${table} INSERT`);
  return match[1];
}

function splitSqlFields(tuple: string): string[] {
  const source = tuple.trim().replace(/^\(/, '').replace(/\)$/, '');
  const fields: string[] = [];
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      continue;
    }
    if (char === ',') {
      fields.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  fields.push(source.slice(start).trim());
  return fields;
}

function splitSqlTuples(values: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < values.length; index += 1) {
    const char = values[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      continue;
    }
    if (char === '(') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0 && start >= 0) tuples.push(values.slice(start, index + 1));
    }
  }
  return tuples;
}

function unquoteSql(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'NULL') return '';
  return trimmed.replace(/^'/, '').replace(/'$/, '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function nextInsertId(sql: string, table: string): number {
  const ids = splitSqlTuples(getInsertValues(sql, table))
    .map((tuple) => Number(splitSqlFields(tuple)[0]))
    .filter((value) => Number.isFinite(value));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function appendInsertTuples(sql: string, table: string, tuples: string[]): string {
  const pattern = new RegExp(`(INSERT INTO \`${table}\` VALUES )([\\s\\S]*?)(;)`);
  const match = pattern.exec(sql);
  if (!match) throw new Error(`snapshot 缺少 ${table} INSERT`);
  const nextValues = `${match[2]?.trim() ?? ''},${tuples.join(',')}`;
  return sql.slice(0, match.index) + match[1] + nextValues + sql.slice(match.index + match[0].length - 1);
}

function snapshotSpeciesRows(sql: string): Array<{ code: string; id: number; name: string }> {
  try {
    return splitSqlTuples(getInsertValues(sql, 'pet_species')).map((tuple) => {
      const fields = splitSqlFields(tuple);
      return {
        code: unquoteSql(fields[1] ?? ''),
        id: Number(fields[0]),
        name: unquoteSql(fields[2] ?? ''),
      };
    });
  } catch {
    return [];
  }
}

function mysqlExec(sql: string): Promise<string> {
  const container = process.env.MYSQL_CONTAINER ?? 'petpals-local-mysql-1';
  const user = process.env.MYSQL_USER ?? 'petpals';
  const password = process.env.MYSQL_PASSWORD ?? 'petpals';
  const database = process.env.MYSQL_DATABASE ?? 'petpals';
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      [
        'exec',
        container,
        'mysql',
        '--default-character-set=utf8mb4',
        `-u${user}`,
        `-p${password}`,
        '-D',
        database,
        '--batch',
        '--raw',
        '--skip-column-names',
        '-e',
        sql,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout);
      },
    );
  });
}

async function checkDatabaseSpecies(petName: string): Promise<SpeciesCheckResult['database']> {
  try {
    const rows = await mysqlExec(`
      SELECT code, name
      FROM pet_species
      WHERE deleted_at IS NULL
        AND (code = ${sqlLiteral(petName)} OR name = ${sqlLiteral(petName)})
      LIMIT 1;
    `);
    return { exists: rows.trim().length > 0, reachable: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '数据库不可访问',
      exists: false,
      reachable: false,
    };
  }
}

async function checkSnapshotSpecies(petName: string): Promise<SpeciesCheckResult> {
  const snapshotPath = path.join(projectRoot, 'docs/handover/petpals-dev-snapshot.sql');
  const sql = await fs.readFile(snapshotPath, 'utf8').catch(() => '');
  const row = snapshotSpeciesRows(sql).find((item) => item.code === petName || item.name === petName);
  const exists = Boolean(row);
  return {
    code: row?.code,
    database: await checkDatabaseSpecies(petName),
    exists,
    missing: exists
      ? []
      : [
          'pet_species 宠物种类',
          'pet_stages 五阶段配置',
          'pet_action_resources 动作资源行',
          '神兽/标签/展示分类等运营标签',
        ],
    species: petName,
  };
}

function normalizeSpeciesCreateBody(body: SpeciesCreateBody): Required<SpeciesCreateBody> {
  const petName = assertPetName(body.petName);
  const code = assertPetName(body.code?.trim() || petName);
  const name = assertPetName(body.name?.trim() || petName);
  const originstatus = body.originstatus === 'egg' ? 'egg' : 'sleep';
  const description = typeof body.description === 'string' && body.description.trim()
    ? body.description.trim().slice(0, 1024)
    : `${name}宠物动画资源`;
  return {
    code,
    description,
    isLegendary: Boolean(body.isLegendary),
    name,
    originstatus,
    petName,
    sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 99,
  };
}

async function createSpeciesScaffold(body: SpeciesCreateBody): Promise<{
  code: string;
  database: SpeciesCheckResult['database'];
  name: string;
  snapshotUpdated: boolean;
}> {
  const input = normalizeSpeciesCreateBody(body);
  const snapshotPath = path.join(projectRoot, 'docs/handover/petpals-dev-snapshot.sql');
  let sql = await fs.readFile(snapshotPath, 'utf8');
  const existing = snapshotSpeciesRows(sql).find(
    (item) => item.code === input.code || item.name === input.name || item.code === input.petName,
  );
  let snapshotUpdated = false;
  const now = timestampSql();
  const coverUrl = `/uploads/pets/animals/${input.petName}/stage1/base.png`;

  if (!existing) {
    const speciesId = nextInsertId(sql, 'pet_species');
    const speciesTuple = `(${speciesId},${sqlLiteral(input.code)},${sqlLiteral(input.name)},${sqlLiteral(input.description)},${sqlLiteral(coverUrl)},${sqlLiteral(input.originstatus)},${input.isLegendary ? 1 : 0},${sqlNumber(input.sortOrder)},'active',${sqlLiteral(now)},${sqlLiteral(now)},NULL)`;
    const stageStartId = nextInsertId(sql, 'pet_stages');
    const stageNames = ['蛋', '幼年', '少年', '成年', '最终形态'];
    const stageExperience = [30, 100, 300, 700, 1200];
    const stageTuples = stageNames.map((stageName, index) => {
      const stageNumber = index + 1;
      return `(${stageStartId + index},${speciesId},${stageNumber},${sqlLiteral(stageName)},NULL,${stageExperience[index] ?? 0},0,${stageNumber === 1 ? 1 : 0},${stageNumber === 5 ? 1 : 0},${sqlLiteral(now)},${sqlLiteral(now)},NULL)`;
    });
    let resourceId = nextInsertId(sql, 'pet_action_resources');
    const resourceTuples = [1, 2, 3, 4, 5].flatMap((stageNumber) =>
      actionResourceDefaults.map((action) => {
        const staticUrl = `/uploads/pets/animals/${input.petName}/stage${stageNumber}/base.png`;
        const tuple = `(${resourceId},${speciesId},${stageNumber},${sqlLiteral(action.code)},${action.durationMs},${action.isLoop},${action.priority},${action.preloadTier},'',NULL,${sqlLiteral(staticUrl)},256,256,NULL,${sqlLiteral(now)},${sqlLiteral(now)},NULL)`;
        resourceId += 1;
        return tuple;
      }),
    );
    let poolId = nextInsertId(sql, 'pet_self_action_pools');
    const poolTuples = [1, 2, 3, 4, 5].flatMap((stageNumber) =>
      ['waving', 'jumping'].map((actionCode) => {
        const tuple = `(${poolId},${speciesId},${stageNumber},${sqlLiteral(actionCode)},1,${sqlLiteral(now)},${sqlLiteral(now)})`;
        poolId += 1;
        return tuple;
      }),
    );

    sql = appendInsertTuples(sql, 'pet_species', [speciesTuple]);
    sql = appendInsertTuples(sql, 'pet_stages', stageTuples);
    sql = appendInsertTuples(sql, 'pet_action_resources', resourceTuples);
    sql = appendInsertTuples(sql, 'pet_self_action_pools', poolTuples);
    await fs.writeFile(snapshotPath, sql, 'utf8');
    snapshotUpdated = true;
  }

  const stageValueSql = [1, 2, 3, 4, 5].map((stageNumber, index) => {
    const stageName = ['蛋', '幼年', '少年', '成年', '最终形态'][index] ?? `Stage ${stageNumber}`;
    const exp = [30, 100, 300, 700, 1200][index] ?? 0;
    return `(@species_id,${stageNumber},${sqlLiteral(stageName)},NULL,${exp},0,${stageNumber === 1 ? 1 : 0},${stageNumber === 5 ? 1 : 0},${sqlLiteral(now)},${sqlLiteral(now)},NULL)`;
  }).join(',');
  const resourceValueSql = [1, 2, 3, 4, 5].flatMap((stageNumber) =>
    actionResourceDefaults.map((action) => {
      const staticUrl = `/uploads/pets/animals/${input.petName}/stage${stageNumber}/base.png`;
      return `(@species_id,${stageNumber},${sqlLiteral(action.code)},${action.durationMs},${action.isLoop},${action.priority},${action.preloadTier},'',NULL,${sqlLiteral(staticUrl)},256,256,NULL,${sqlLiteral(now)},${sqlLiteral(now)},NULL)`;
    }),
  ).join(',');
  const poolValueSql = [1, 2, 3, 4, 5].flatMap((stageNumber) =>
    ['waving', 'jumping'].map(
      (actionCode) => `(@species_id,${stageNumber},${sqlLiteral(actionCode)},1,${sqlLiteral(now)},${sqlLiteral(now)})`,
    ),
  ).join(',');
  const dbSql = `
    INSERT INTO pet_species (code,name,description,cover_image_url,originstatus,is_legendary,sort_order,status,created_at,updated_at,deleted_at)
    VALUES (${sqlLiteral(input.code)},${sqlLiteral(input.name)},${sqlLiteral(input.description)},${sqlLiteral(coverUrl)},${sqlLiteral(input.originstatus)},${input.isLegendary ? 1 : 0},${sqlNumber(input.sortOrder)},'active',${sqlLiteral(now)},${sqlLiteral(now)},NULL)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), cover_image_url=VALUES(cover_image_url), originstatus=VALUES(originstatus), is_legendary=VALUES(is_legendary), updated_at=VALUES(updated_at);
    SET @species_id := (SELECT id FROM pet_species WHERE code = ${sqlLiteral(input.code)} LIMIT 1);
    INSERT IGNORE INTO pet_stages (species_id,stage_number,name,description,experience_required,daily_decay_rate,is_hatching_stage,is_final_form,created_at,updated_at,deleted_at) VALUES ${stageValueSql};
    INSERT IGNORE INTO pet_action_resources (species_id,stage_number,action_code,duration_ms,is_loop,priority,preload_tier,gif_url,webp_url,static_first_frame_url,width,height,file_size,created_at,updated_at,deleted_at) VALUES ${resourceValueSql};
    INSERT IGNORE INTO pet_self_action_pools (species_id,stage_number,action_code,weight,created_at,updated_at) VALUES ${poolValueSql};
  `;
  let database = await checkDatabaseSpecies(input.code);
  try {
    await mysqlExec(dbSql);
    database = { exists: true, reachable: true };
  } catch (error) {
    database = {
      error: error instanceof Error ? error.message : '数据库写入失败',
      exists: false,
      reachable: false,
    };
  }

  return { code: input.code, database, name: input.name, snapshotUpdated };
}

function normalizeStage(stage: unknown): string {
  if (typeof stage !== 'string' || !/^stage[1-5]$/.test(stage)) {
    throw new Error('阶段必须是 stage1 到 stage5');
  }
  return stage;
}

function normalizeStageAssetPath(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  if (
    normalized.startsWith('..')
    || path.isAbsolute(normalized)
    || !/^(raw_generated|长帧|单帧|gif)\//.test(normalized)
  ) {
    throw new Error('资源路径不合法');
  }
  return normalized;
}

function normalizeImageToolStage(stage: unknown): number {
  const value = typeof stage === 'number' ? stage : Number(stage);
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new Error('图片阶段必须是 Stage 0 到 Stage 6');
  }
  return value;
}

function getImageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function buildGifCommands(body: StartRunBody, petName: string, saveRoot: string): CommandSpec[] {
  const qiniuApiKey =
    typeof body.qiniuApiKey === 'string' && body.qiniuApiKey.trim()
      ? body.qiniuApiKey.trim()
      : defaultQiniuApiKey;
  const commands: CommandSpec[] = [
    {
      args: ['scripts/make_gifs.py', petName],
      command: 'python3',
      cwd: projectRoot,
      env: { ANIMALS_ROOT: saveRoot },
      label: '生成本地 GIF（跳过 debug / scale）',
    },
  ];

  if (body.includeUpload) {
    commands.push({
      args: [path.join(refreshSkillDir, 'scripts/upload_gifs.py'), petName],
      command: 'python3',
      cwd: projectRoot,
      env: { ANIMALS_ROOT: saveRoot, QINIU_API_KEY: qiniuApiKey },
      label: '上传 GIF 到 CDN',
    });
  }

  if (body.includeSnapshot) {
    commands.push({
      args: [path.join(refreshSkillDir, 'scripts/update_snapshot_urls.py'), petName],
      command: 'python3',
      cwd: projectRoot,
      env: { ANIMALS_ROOT: saveRoot },
      label: '同步 snapshot SQL',
    });
  }

  return commands;
}

function buildSliceCommands(body: StartRunBody, petName: string, saveRoot: string): CommandSpec[] {
  const commands: CommandSpec[] = [];
  const stage = normalizeStage(body.stage);
  const stage1Style = body.stage1Style ?? 'sleep';
  const skillDir =
    stage === 'stage1' ? (stage1Style === 'egg' ? eggSkillDir : sleepSkillDir) : actionSkillDir;

  if (stage === 'stage1' && stage1Style === 'sleep') {
    commands.push({
      args: [path.join(skillDir, 'scripts/sync_alias_actions.sh'), saveRoot, petName, stage],
      command: 'bash',
      cwd: projectRoot,
      label: `${stage} 同步 eat/waving 别名`,
    });
  }

  commands.push({
    args: [path.join(skillDir, 'scripts/slice_all_actions.sh'), saveRoot, petName, stage],
    command: 'bash',
    cwd: projectRoot,
    label: `${stage} 切长帧为单帧`,
  });

  if (stage === 'stage1' && stage1Style === 'sleep') {
    commands.push({
      args: [path.join(skillDir, 'scripts/sync_alias_actions.sh'), saveRoot, petName, stage],
      command: 'bash',
      cwd: projectRoot,
      label: `${stage} 切帧后再次同步别名`,
    });
  }

  commands.push({
    args: [
      path.join(skillDir, 'scripts/generate_timing.py'),
      '--frames-dir',
      path.join(saveRoot, petName, stage, '单帧'),
      '--output',
      path.join(saveRoot, petName, stage, 'animation-timing.json'),
    ],
    command: 'python3',
    cwd: projectRoot,
    label: `${stage} 生成/补齐 animation-timing.json`,
  });

  return commands;
}

function buildActionCommands(body: StartRunBody, petName: string, saveRoot: string): CommandSpec[] {
  const stage = normalizeStage(body.stage);
  const stage1Style = body.stage1Style ?? 'sleep';
  const skillDir =
    stage === 'stage1' ? (stage1Style === 'egg' ? eggSkillDir : sleepSkillDir) : actionSkillDir;
  const skillName =
    stage === 'stage1'
      ? stage1Style === 'egg'
        ? 'petpals-egg-animation'
        : 'sleep-animator'
      : 'petpals-action-animation';
  const actionInstruction = body.actionName
    ? `本次只重新生成动作「${body.actionName}」。保留其他动作文件不动。用户对话修改要求：${body.actionPrompt || '按当前 base.png 重新生成该动作，保持角色一致。'}`
    : '本次生成该阶段完整动作素材。';
  const prompt = `使用 ${skillName} skill，为宠物「${petName}」的「${stage}」生成动作动画资源。base.png 已存在于 ANIMALS_ROOT="${saveRoot}"。${actionInstruction} 严格按 skill 生成 raw_generated、长帧、单帧和 animation-timing.json；所有输出必须写入 ${path.join(saveRoot, petName, stage)}，不要修改 H5、admin 或 teacher 页面。`;

  return [
    {
      args: [
        'exec',
        '-C',
        projectRoot,
        '-s',
        'workspace-write',
        '--add-dir',
        saveRoot,
        '--add-dir',
        slicerSkillDir,
        '--add-dir',
        promptDir,
        '--add-dir',
        skillDir,
        '--add-dir',
        generatedImagesDir,
        '--skip-git-repo-check',
        '--ephemeral',
        prompt,
      ],
      command: codexBinary,
      cwd: projectRoot,
      env: { ANIMALS_ROOT: saveRoot },
      label: `${stage} 调用 ${skillName}`,
    },
  ];
}

async function startRun(body: StartRunBody): Promise<RunRecord> {
  const petName = assertPetName(body.petName);
  const saveRoot = normalizeSaveRoot(body.saveRoot);
  const kind: RunKind =
    body.kind === 'actions' || body.kind === 'slice' || body.kind === 'gif' ? body.kind : 'gif';
  if (kind === 'gif' && body.includeSnapshot) {
    const speciesCheck = await checkSnapshotSpecies(petName);
    if (!speciesCheck.exists) {
      throw new Error(
        `snapshot 里还没有宠物种类「${petName}」。请先在 GIF 页面点击“补齐 species 并写入数据库”，确认必要字段后再同步 Snapshot。缺少：${speciesCheck.missing.join('、')}。`,
      );
    }
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const record: RunRecord = {
    actionName: typeof body.actionName === 'string' ? body.actionName : undefined,
    id,
    kind,
    logs: [],
    petName,
    saveRoot,
    startedAt: new Date().toISOString(),
    status: 'running',
    stage: typeof body.stage === 'string' ? body.stage : undefined,
  };

  runs.set(id, record);

  void (async () => {
    try {
      const commands =
        kind === 'actions'
          ? buildActionCommands(body, petName, saveRoot)
          : kind === 'slice'
            ? buildSliceCommands(body, petName, saveRoot)
            : buildGifCommands(body, petName, saveRoot);

      record.logs.push(`开始 ${kind} 任务：${petName}`);
      if (record.stage) record.logs.push(`目标阶段：${record.stage}`);
      if (record.actionName) record.logs.push(`目标动作：${record.actionName}`);
      record.logs.push(`保存根目录：${saveRoot}`);
      for (const command of commands) {
        await runCommand(command, record);
      }
      record.status = 'success';
      record.summary = '流程完成';
    } catch (error) {
      record.status = 'failed';
      record.summary = error instanceof Error ? error.message : '未知错误';
      record.logs.push(`\nERROR: ${record.summary}`);
    } finally {
      record.completedAt = new Date().toISOString();
    }
  })();

  return record;
}

function sendJson(response: http.ServerResponse, statusCode: number, data: unknown) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(data));
}

function readBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('error', reject);
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function animationWorkbenchApi(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/animation-workbench')) {
          next();
          return;
        }

        try {
          const url = new URL(request.url, 'http://127.0.0.1');
          const route = url.pathname.replace('/api/animation-workbench', '');

          if (request.method === 'GET' && route === '/health') {
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === 'GET' && route === '/settings') {
            sendJson(response, 200, {
              defaultQiniuApiKey,
              defaultSaveRoot: defaultAnimalsRoot,
            });
            return;
          }

          const assetMatch = route.match(/^\/assets\/([^/]+)\/(stage[0-6])\/(base\.png)$/);
          if ((request.method === 'GET' || request.method === 'HEAD') && assetMatch) {
            const petName = assertPetName(decodeURIComponent(assetMatch[1] ?? ''));
            const stage = assetMatch[2] ?? 'stage2';
            const fileName = assetMatch[3] ?? 'base.png';
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            const assetPath = path.join(saveRoot, petName, stage, fileName);
            if (!(await exists(assetPath))) {
              sendJson(response, 404, { message: '资源不存在' });
              return;
            }
            response.statusCode = 200;
            response.setHeader('cache-control', 'no-store');
            response.setHeader('content-type', 'image/png');
            if (request.method === 'HEAD') {
              response.end();
              return;
            }
            response.end(await fs.readFile(assetPath));
            return;
          }

          const stageAssetMatch = route.match(/^\/stage-assets\/([^/]+)\/(stage[0-6])\/(.+)$/);
          if ((request.method === 'GET' || request.method === 'HEAD') && stageAssetMatch) {
            const petName = assertPetName(decodeURIComponent(stageAssetMatch[1] ?? ''));
            const stage = stageAssetMatch[2] ?? 'stage2';
            const relativeFilePath = normalizeStageAssetPath(
              decodeURIComponent(stageAssetMatch[3] ?? ''),
            );
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            const assetPath = path.join(saveRoot, petName, stage, relativeFilePath);
            if (!(await exists(assetPath))) {
              sendJson(response, 404, { message: '资源不存在' });
              return;
            }
            response.statusCode = 200;
            response.setHeader('cache-control', 'no-store');
            response.setHeader(
              'content-type',
              assetPath.endsWith('.gif') ? 'image/gif' : 'image/png',
            );
            response.end(request.method === 'HEAD' ? undefined : await fs.readFile(assetPath));
            return;
          }

          if ((request.method === 'GET' || request.method === 'HEAD') && route.startsWith('/generated-images/')) {
            const relativeImagePath = decodeURIComponent(route.replace('/generated-images/', ''));
            const imagePath = imagePipeline.resolveOutputPath(relativeImagePath);
            if (!(await exists(imagePath))) {
              sendJson(response, 404, { message: '图片不存在' });
              return;
            }
            response.statusCode = 200;
            response.setHeader('content-type', getImageContentType(imagePath));
            if (request.method === 'HEAD') {
              response.end();
              return;
            }
            response.end(await fs.readFile(imagePath));
            return;
          }

          const frameMatch = route.match(
            /^\/frame-assets\/([^/]+)\/(stage[1-5])\/([^/]+)\/(\d+\.png)$/,
          );
          if ((request.method === 'GET' || request.method === 'HEAD') && frameMatch) {
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            const framePath = new TimingStore(saveRoot).resolveFramePath(
              decodeURIComponent(frameMatch[1] ?? ''),
              frameMatch[2] ?? '',
              decodeURIComponent(frameMatch[3] ?? ''),
              frameMatch[4] ?? '',
            );
            response.statusCode = 200;
            response.setHeader('content-type', 'image/png');
            response.end(request.method === 'HEAD' ? undefined : await fs.readFile(framePath));
            return;
          }

          const gifMatch = route.match(/^\/local-gifs\/([^/]+)\/(stage[1-5])\/([^/]+\.gif)$/);
          if ((request.method === 'GET' || request.method === 'HEAD') && gifMatch) {
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            const gifPath = new ScaleStore(projectRoot, saveRoot).resolveLocalGif(
              decodeURIComponent(gifMatch[1] ?? ''),
              gifMatch[2] ?? '',
              gifMatch[3] ?? '',
            );
            response.statusCode = 200;
            response.setHeader('content-type', 'image/gif');
            response.end(request.method === 'HEAD' ? undefined : await fs.readFile(gifPath));
            return;
          }

          if (request.method === 'GET' && route === '/animals') {
            sendJson(response, 200, {
              animals: await listAnimals(normalizeSaveRoot(url.searchParams.get('saveRoot'))),
            });
            return;
          }

          if (request.method === 'GET' && route === '/species/check') {
            const petName = assertPetName(url.searchParams.get('petName'));
            sendJson(response, 200, await checkSnapshotSpecies(petName));
            return;
          }

          if (request.method === 'POST' && route === '/species/create') {
            sendJson(
              response,
              200,
              await createSpeciesScaffold((await readBody(request)) as SpeciesCreateBody),
            );
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/start') {
            sendJson(response, 200, { status: 'internal' });
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/generate-stage2') {
            const body = (await readBody(request)) as { animalName?: string; description?: string };
            const animalName = assertPetName(body.animalName);
            sendJson(response, 200, await imagePipeline.generatePrimitive(animalName, body.description ?? ''));
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/upload-image') {
            const body = (await readBody(request)) as { dataURL?: string; filename?: string };
            if (!body.dataURL) throw new Error('dataURL 不能为空');
            sendJson(response, 200, await imagePipeline.uploadLocalImage(body.dataURL, body.filename ?? 'upload.png'));
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/generate-stages') {
            const body = (await readBody(request)) as {
              animalName?: string;
              description?: string;
              referenceImagePath?: string;
              referenceImageUrl?: string;
            };
            const animalName = assertPetName(body.animalName);
            if (!body.referenceImagePath) throw new Error('缺少 Stage 2 参考图');
            const jobId = await imagePipeline.startStageJob(
              animalName,
              body.description ?? '',
              body.referenceImagePath,
              body.referenceImageUrl,
            );
            sendJson(response, 200, { jobId });
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/edit') {
            const body = (await readBody(request)) as { imagePath?: string; prompt?: string };
            if (!body.imagePath || !body.prompt) throw new Error('imagePath 和 prompt 不能为空');
            sendJson(response, 200, await imagePipeline.editImage(body.imagePath, body.prompt));
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/edit-color') {
            const body = (await readBody(request)) as {
              imagePath?: string;
              maskDataURL?: string;
              prompt?: string;
            };
            if (!body.imagePath || !body.maskDataURL || !body.prompt) {
              throw new Error('imagePath、maskDataURL、prompt 都不能为空');
            }
            sendJson(
              response,
              200,
              await imagePipeline.editColor(body.imagePath, body.maskDataURL, body.prompt),
            );
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/generate-stage-from-image') {
            const body = (await readBody(request)) as {
              animalName?: string;
              description?: string;
              sourceImagePath?: string;
              sourceStageNum?: number | string;
              targetStageNum?: number | string;
            };
            const animalName = assertPetName(body.animalName);
            if (!body.sourceImagePath) throw new Error('缺少源阶段图片');
            sendJson(
              response,
              200,
              await imagePipeline.generateStageFromImage(
                animalName,
                body.description ?? '',
                body.sourceImagePath,
                normalizeImageToolStage(body.sourceStageNum),
                normalizeImageToolStage(body.targetStageNum),
              ),
            );
            return;
          }

          const imageToolStatusMatch = route.match(/^\/image-tool\/stages-status\/([^/]+)$/);
          if (request.method === 'GET' && imageToolStatusMatch?.[1]) {
            sendJson(response, 200, imagePipeline.getJob(imageToolStatusMatch[1]));
            return;
          }

          const imageToolCancelMatch = route.match(/^\/image-tool\/cancel-job\/([^/]+)$/);
          if (request.method === 'POST' && imageToolCancelMatch?.[1]) {
            imagePipeline.cancelJob(imageToolCancelMatch[1]);
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/save-five-stage-set') {
            sendJson(response, 200, await saveFiveStageSet(await readBody(request)));
            return;
          }

          if (request.method === 'POST' && route === '/image-tool/save-stage') {
            sendJson(response, 200, await saveSingleImageStage(await readBody(request)));
            return;
          }

          if ((request.method === 'GET' || request.method === 'HEAD') && route === '/pipeline-svg') {
            response.statusCode = 200;
            response.setHeader('content-type', 'image/svg+xml; charset=utf-8');
            if (request.method === 'HEAD') {
              response.end();
              return;
            }
            response.end(await fs.readFile(pipelineSvg, 'utf8'));
            return;
          }

          if (request.method === 'GET' && route === '/inventory') {
            const petName = assertPetName(url.searchParams.get('petName'));
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            sendJson(response, 200, { inventory: await getInventory(petName, saveRoot) });
            return;
          }

          if (request.method === 'GET' && route === '/timing') {
            const petName = assertPetName(url.searchParams.get('petName'));
            const stage = normalizeStage(url.searchParams.get('stage'));
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            sendJson(response, 200, await new TimingStore(saveRoot).load(petName, stage));
            return;
          }

          if (request.method === 'POST' && route === '/timing') {
            const body = (await readBody(request)) as {
              actionName?: string;
              config?: TimingConfig;
              petName?: string;
              saveRoot?: string;
              stage?: string;
            };
            const petName = assertPetName(body.petName);
            const stage = normalizeStage(body.stage);
            const saveRoot = normalizeSaveRoot(body.saveRoot);
            if (!body.actionName || !body.config) throw new Error('缺少 Timing 配置');
            sendJson(response, 200, {
              config: await new TimingStore(saveRoot).save(petName, stage, body.actionName, body.config),
            });
            return;
          }

          if (request.method === 'GET' && route === '/scale') {
            const petName = assertPetName(url.searchParams.get('petName'));
            const stage = normalizeStage(url.searchParams.get('stage'));
            const saveRoot = normalizeSaveRoot(url.searchParams.get('saveRoot'));
            sendJson(response, 200, await new ScaleStore(projectRoot, saveRoot).load(petName, stage));
            return;
          }

          if (request.method === 'POST' && route === '/scale') {
            const body = (await readBody(request)) as {
              actionTransforms?: Record<string, TransformConfig>;
              species?: string;
              stage?: string;
              stageTransform?: TransformConfig;
            };
            const species = assertPetName(body.species);
            const stage = normalizeStage(body.stage);
            if (!body.stageTransform) throw new Error('缺少 Stage 缩放配置');
            await new ScaleStore(projectRoot, defaultAnimalsRoot).save(
              species,
              stage,
              body.actionTransforms ?? {},
              body.stageTransform,
            );
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === 'POST' && route === '/runs') {
            sendJson(response, 202, { run: await startRun((await readBody(request)) as StartRunBody) });
            return;
          }

          const runMatch = route.match(/^\/runs\/([^/]+)$/);
          if (request.method === 'GET' && runMatch?.[1]) {
            const run = runs.get(runMatch[1]);
            sendJson(response, run ? 200 : 404, run ? { run } : { message: 'run 不存在' });
            return;
          }

          sendJson(response, 404, { message: '接口不存在' });
        } catch (error) {
          sendJson(response, 400, {
            message: error instanceof Error ? error.message : '请求失败',
          });
        }
      });
    },
    name: 'animation-workbench-api',
  };
}

export default defineConfig({
  plugins: [animationWorkbenchApi(), react()],
  server: {
    host: '127.0.0.1',
    port: 1234,
    strictPort: true,
  },
});
