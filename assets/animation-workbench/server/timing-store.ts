import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DURATION = 90;

export interface TimingConfig {
  frameDurations: Record<string, number>;
  loop: boolean;
  sequence: number[];
}

export interface TimingAction {
  frameCount: number;
  frames: string[];
  name: string;
  timing: TimingConfig;
}

function isSafeSegment(value: string): boolean {
  return /^[\p{L}\p{N}_-]+$/u.test(value);
}

function rootQuery(animalsRoot: string): string {
  return `?saveRoot=${encodeURIComponent(animalsRoot)}`;
}

function defaultTiming(frameCount: number): TimingConfig {
  return {
    frameDurations: Object.fromEntries(
      Array.from({ length: frameCount }, (_, index) => [String(index), DEFAULT_DURATION]),
    ),
    loop: true,
    sequence: Array.from({ length: frameCount }, (_, index) => index),
  };
}

export class TimingStore {
  constructor(private readonly animalsRoot: string) {}

  async load(petName: string, stage: string): Promise<{ actions: TimingAction[] }> {
    this.assertTarget(petName, stage);
    const stageDir = path.join(this.animalsRoot, petName, stage);
    const framesRoot = path.join(stageDir, '单帧');
    const timingPath = path.join(stageDir, 'animation-timing.json');
    const timing = await this.readTiming(timingPath);
    const entries = await fs.readdir(framesRoot, { withFileTypes: true }).catch(() => []);
    const actions: TimingAction[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeSegment(entry.name)) continue;
      const frameDir = path.join(framesRoot, entry.name);
      const frames = (await fs.readdir(frameDir))
        .filter((file) => /^\d+\.png$/i.test(file))
        .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
      if (frames.length === 0) continue;
      const normalized = this.normalize(timing[entry.name], frames.length);
      timing[entry.name] = normalized;
      actions.push({
        frameCount: frames.length,
        frames: frames.map(
          (file) =>
            `/api/animation-workbench/frame-assets/${encodeURIComponent(petName)}/${stage}/${encodeURIComponent(entry.name)}/${file}${rootQuery(this.animalsRoot)}`,
        ),
        name: entry.name,
        timing: normalized,
      });
    }

    actions.sort((left, right) => left.name.localeCompare(right.name));
    await fs.writeFile(timingPath, `${JSON.stringify(timing, null, 2)}\n`, 'utf8').catch(
      () => undefined,
    );
    return { actions };
  }

  async save(
    petName: string,
    stage: string,
    actionName: string,
    config: TimingConfig,
  ): Promise<TimingConfig> {
    this.assertTarget(petName, stage);
    if (!isSafeSegment(actionName)) throw new Error('动作名称不合法');
    const frameDir = path.join(this.animalsRoot, petName, stage, '单帧', actionName);
    const frameCount = (await fs.readdir(frameDir)).filter((file) => /^\d+\.png$/i.test(file)).length;
    if (frameCount === 0) throw new Error('动作没有可用单帧');
    const normalized = this.normalize(config, frameCount, true);
    const timingPath = path.join(this.animalsRoot, petName, stage, 'animation-timing.json');
    const timing = await this.readTiming(timingPath);
    timing[actionName] = normalized;
    await fs.writeFile(timingPath, `${JSON.stringify(timing, null, 2)}\n`, 'utf8');
    return normalized;
  }

  resolveFramePath(petName: string, stage: string, action: string, file: string): string {
    this.assertTarget(petName, stage);
    if (!isSafeSegment(action) || !/^\d+\.png$/i.test(file)) throw new Error('帧路径不合法');
    return path.join(this.animalsRoot, petName, stage, '单帧', action, file);
  }

  private assertTarget(petName: string, stage: string): void {
    if (!isSafeSegment(petName)) throw new Error('动物名不合法');
    if (!/^stage[1-5]$/.test(stage)) throw new Error('Stage 必须是 stage1 到 stage5');
  }

  private async readTiming(filePath: string): Promise<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private normalize(value: unknown, frameCount: number, strict = false): TimingConfig {
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<TimingConfig>)
      : {};
    const sequence = Array.isArray(source.sequence)
      ? source.sequence.map(Number).filter((frame) => Number.isInteger(frame) && frame >= 0 && frame < frameCount)
      : defaultTiming(frameCount).sequence;
    if (strict && sequence.length === 0) throw new Error('sequence 不能为空');
    const safeSequence = sequence.length > 0 ? sequence : defaultTiming(frameCount).sequence;
    const sourceDurations =
      source.frameDurations && typeof source.frameDurations === 'object'
        ? source.frameDurations
        : {};
    const frameDurations: Record<string, number> = {};
    for (let index = 0; index < frameCount; index += 1) {
      const raw = Number(sourceDurations[String(index)] ?? DEFAULT_DURATION);
      if (strict && (!Number.isFinite(raw) || raw < 20 || raw > 5000)) {
        throw new Error(`第 ${index} 帧时长必须在 20ms 到 5000ms 之间`);
      }
      frameDurations[String(index)] = Number.isFinite(raw) && raw >= 20 && raw <= 5000
        ? Math.round(raw)
        : DEFAULT_DURATION;
    }
    return { frameDurations, loop: source.loop !== false, sequence: safeSequence };
  }
}
