import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface GeneratedImage {
  imagePath: string;
  imageUrl: string;
}

export interface ImageStage {
  error?: string;
  imagePath?: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'ready' | 'saved' | 'error' | 'cancelled';
}

export interface ImageJob {
  animalName: string;
  currentProcess: ChildProcess | null;
  id: string;
  stages: Record<string, ImageStage>;
  status: 'running' | 'done' | 'error' | 'cancelled';
}

interface PipelineOptions {
  codexBinary: string;
  generatedImagesDir: string;
  imagegenSkillDir: string;
  outputRoot: string;
}

const STAGE_SPECS: Record<number, string> = {
  0: '宠物蛋形态：单个平滑蛋壳，继承主色与标志花纹；无五官、无四肢、不破壳、不要毛绒质感。',
  1: '初生睡眠形态：比 Stage 2 更小、更奶，朝右趴下蜷缩熟睡，头在画面右侧，完整面部清晰可见。',
  3: '第一次进化：明显长大，身体更高更长、四肢更有力量，仍保持儿童向可爱和同一角色识别度。',
  4: '第二次进化：接近青年守护兽，轮廓更完整，并出现少量与物种匹配的元素化实体结构，不要盔甲武器。',
  5: '最终进化：成年高级宠物伙伴或守护兽，体格、姿态和元素结构明显强于 Stage 4，不要盔甲武器。',
  6: '超进化：基于 Stage 5 做显著突变式传说级进化，加入契合物种的一体化神兽盔甲、元素实体结构、能量核心和更强姿态；必须保留原角色识别点。',
};

export class ImagePipeline {
  private readonly jobs = new Map<string, ImageJob>();

  constructor(private readonly options: PipelineOptions) {}

  async uploadLocalImage(dataURL: string, filename: string): Promise<GeneratedImage> {
    const match = dataURL.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) throw new Error('只支持 PNG、JPEG、WebP 图片上传');
    const ext = match[1]?.toLowerCase() === 'jpeg' ? 'jpg' : (match[1]?.toLowerCase() ?? 'png');
    const rawBase64 = match[2] ?? '';
    const outputDir = path.join(this.options.outputRoot, randomUUID());
    const safeName = filename.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 80) || `upload.${ext}`;
    const outputPath = path.join(outputDir, `upload-${safeName.replace(/\.[^.]+$/, '')}.${ext}`);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(rawBase64, 'base64'));
    await this.assertFile(outputPath);
    return this.toGeneratedImage(outputPath);
  }

  async generatePrimitive(animalName: string, description: string): Promise<GeneratedImage> {
    const outputDir = path.join(this.options.outputRoot, randomUUID());
    const outputPath = path.join(outputDir, 'stage2.png');
    await fs.mkdir(outputDir, { recursive: true });
    const userInput = description.trim() || animalName;
    const prompt = [
      '使用 imagegen skill 生成 PetPals 宠物 Stage 2 原始形态图片。只生成这一张，不做其他操作。',
      '【PetPals Stage 2 原始形态生成任务】',
      `动物类型：${animalName}`,
      `外观描述：${userInput}`,
      '只生成 Stage 2 原始形态这一张，不生成睡眠形态、进化形态或合集图。',
      '设计成儿童向可爱的 3D 动画宠物吉祥物：最 Q 版、最幼态、大头小身体、圆润短小附肢、眼睛清澈、表情友好。',
      '必须保留物种最典型的纯动物识别特征，但高度简化；禁止人类元素、衣服、武器、文字、水印、复杂背景和写实摄影。',
      '单个角色居中完整展示，干净浅色背景，高质量精致 3D 卡通渲染，明亮配色与手办质感。',
    ].join('\n\n');
    await this.runImageTask(prompt, outputPath);
    return this.toGeneratedImage(outputPath);
  }

  async editImage(imagePath: string, prompt: string): Promise<GeneratedImage> {
    await this.assertManagedOrGeneratedFile(imagePath);
    const outputDir = path.join(this.options.outputRoot, randomUUID());
    const outputPath = path.join(outputDir, 'edit.png');
    await fs.mkdir(outputDir, { recursive: true });
    await this.runImageTask(
      [
        '使用 imagegen skill 编辑一张已有图片，只生成这一张修改后的结果。',
        `使用 view_image 加载原始图片：${imagePath}`,
        `修改指令：${prompt}`,
        '保持角色主体、材质、光照和构图连续；不要生成多图、文字、水印或合集。',
      ].join('\n\n'),
      outputPath,
      [path.dirname(imagePath)],
    );
    return this.toGeneratedImage(outputPath);
  }

  async editColor(imagePath: string, maskDataURL: string, prompt: string): Promise<GeneratedImage> {
    await this.assertManagedOrGeneratedFile(imagePath);
    const outputDir = path.join(this.options.outputRoot, randomUUID());
    const outputPath = path.join(outputDir, 'color-edit.png');
    const maskPath = path.join(outputDir, 'mask.png');
    const match = maskDataURL.match(/^data:image\/png;base64,(.+)$/);
    if (!match) throw new Error('遮罩必须是 PNG dataURL');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(maskPath, Buffer.from(match[1] ?? '', 'base64'));
    await this.runImageTask(
      [
        '使用 imagegen skill 对图片指定区域做颜色替换，只生成一张结果图。',
        `使用 view_image 加载原始图片：${imagePath}`,
        `遮罩文件路径：${maskPath}（透明区域是需要修改的区域，不透明区域保持不变）`,
        `修改指令：${prompt}`,
        '保持未选区域、角色外形、材质和光照不变；不要生成多图、文字、水印或合集。',
      ].join('\n\n'),
      outputPath,
      [path.dirname(imagePath), outputDir],
    );
    return this.toGeneratedImage(outputPath);
  }

  async generateStageFromImage(
    animalName: string,
    description: string,
    sourceImagePath: string,
    sourceStageNum: number,
    targetStageNum: number,
  ): Promise<GeneratedImage> {
    await this.assertManagedOrGeneratedFile(sourceImagePath);
    if (!Number.isInteger(sourceStageNum) || !Number.isInteger(targetStageNum)) {
      throw new Error('阶段编号必须是整数');
    }
    if (sourceStageNum < 0 || sourceStageNum > 6 || targetStageNum < 0 || targetStageNum > 6) {
      throw new Error('阶段编号必须在 0 到 6 之间');
    }
    if (sourceStageNum === targetStageNum) throw new Error('源阶段和目标阶段不能相同');
    const outputDir = path.join(this.options.outputRoot, randomUUID());
    const outputPath = path.join(outputDir, `stage${targetStageNum}.png`);
    await fs.mkdir(outputDir, { recursive: true });
    await this.runImageTask(
      [
        '使用 imagegen skill 生成一个 PetPals 单阶段进化图片。',
        `使用 view_image 加载源阶段图片：${sourceImagePath}`,
        `把宠物「${animalName}」从 Stage ${sourceStageNum} 进化/调整为 Stage ${targetStageNum}。`,
        `目标要求：${STAGE_SPECS[targetStageNum] ?? '保持同一角色血缘和 3D 卡通宠物风格，生成目标阶段单图。'}`,
        `外观补充：${description || '继承源图的物种、主色、脸型、比例和核心识别特征'}`,
        '只输出目标阶段单个角色，主体居中完整，背景干净；不要合集图、对比图、文字或水印。',
      ].join('\n\n'),
      outputPath,
      [path.dirname(sourceImagePath)],
    );
    return this.toGeneratedImage(outputPath);
  }

  async startStageJob(
    animalName: string,
    description: string,
    referenceImagePath: string,
    referenceImageUrl?: string,
  ): Promise<string> {
    await this.assertFile(referenceImagePath);
    const id = randomUUID();
    const outputDir = path.join(this.options.outputRoot, id);
    await fs.mkdir(outputDir, { recursive: true });
    const job: ImageJob = {
      animalName,
      currentProcess: null,
      id,
      stages: {
        0: { status: 'pending' },
        1: { status: 'pending' },
        2: {
          ...(referenceImageUrl
            ? { imagePath: referenceImagePath, imageUrl: referenceImageUrl }
            : this.toGeneratedImage(referenceImagePath)),
          status: 'ready',
        },
        3: { status: 'pending' },
        4: { status: 'pending' },
        5: { status: 'pending' },
        6: { status: 'pending' },
      },
      status: 'running',
    };
    this.jobs.set(id, job);

    void this.runStageJob(job, description, referenceImagePath, outputDir);
    return id;
  }

  getJob(id: string): Omit<ImageJob, 'currentProcess'> {
    const job = this.jobs.get(id);
    if (!job) throw new Error('生成任务不存在');
    return {
      animalName: job.animalName,
      id: job.id,
      stages: job.stages,
      status: job.status,
    };
  }

  cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new Error('生成任务不存在');
    job.status = 'cancelled';
    job.currentProcess?.kill('SIGTERM');
  }

  resolveOutputPath(relativePath: string): string {
    const target = path.resolve(this.options.outputRoot, relativePath);
    const root = path.resolve(this.options.outputRoot);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('生成图片路径越界');
    return target;
  }

  isManagedOutput(filePath: string): boolean {
    const target = path.resolve(filePath);
    const root = path.resolve(this.options.outputRoot);
    return target.startsWith(`${root}${path.sep}`);
  }

  private async runStageJob(
    job: ImageJob,
    description: string,
    referenceImagePath: string,
    outputDir: string,
  ): Promise<void> {
    const plan = [
      { source: 2, target: 0 },
      { source: 2, target: 1 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
      { source: 5, target: 6 },
    ];

    try {
      for (const item of plan) {
        if (job.status === 'cancelled') return;
        const sourcePath =
          item.source === 2 ? referenceImagePath : job.stages[String(item.source)]?.imagePath;
        if (!sourcePath) throw new Error(`Stage ${item.target} 缺少 Stage ${item.source} 源图`);
        const outputPath = path.join(outputDir, `stage${item.target}.png`);
        job.stages[String(item.target)] = { status: 'generating' };
        const prompt = [
          '使用 imagegen skill 编辑一张已有图片，只生成本阶段目标图。',
          `使用 view_image 加载源图：${sourcePath}`,
          `为 PetPals 宠物「${job.animalName}」生成 Stage ${item.target} 单阶段形象。`,
          `目标要求：${STAGE_SPECS[item.target]}`,
          `外观补充：${description || '继承源图的物种、主色、脸型和 3D 卡通质感'}`,
          '必须保持同一只宠物的连续性。只输出目标阶段单个角色，主体居中完整，背景干净；不要合集图、排版、文字或水印。',
        ].join('\n\n');
        await this.runImageTask(prompt, outputPath, [path.dirname(sourcePath)], job);
        job.stages[String(item.target)] = {
          ...this.toGeneratedImage(outputPath),
          status: 'ready',
        };
      }
      if (job.status !== 'cancelled') job.status = 'done';
    } catch (error) {
      if (job.status === 'cancelled') return;
      job.status = 'error';
      const activeStage = Object.keys(job.stages).find(
        (stage) => job.stages[stage]?.status === 'generating',
      );
      if (activeStage) {
        job.stages[activeStage] = {
          error: error instanceof Error ? error.message : '生成失败',
          status: 'error',
        };
      }
    }
  }

  private runImageTask(
    prompt: string,
    outputPath: string,
    extraDirs: string[] = [],
    job?: ImageJob,
  ): Promise<void> {
    const isolatedPrompt = `${prompt}\n\n生成完成后，只需要报告本次 imagegen 生成的图片路径。总台会把它复制到：${outputPath}`;
    const args = [
      'exec',
      '-s',
      'workspace-write',
      '--add-dir',
      this.options.imagegenSkillDir,
      '--add-dir',
      this.options.generatedImagesDir,
      '--add-dir',
      path.dirname(outputPath),
      ...extraDirs.flatMap((dir) => ['--add-dir', dir]),
      '--skip-git-repo-check',
      isolatedPrompt,
    ];

    return new Promise((resolve, reject) => {
      // Codex exec 会继续读取仍然打开的 stdin；显式 ignore 才会立即开始执行提示词。
      const child = spawn(this.options.codexBinary, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (job) job.currentProcess = child;
      let output = '';
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (job) job.currentProcess = null;
        if (child.exitCode === null) child.kill('SIGTERM');
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const copyGeneratedImageIfReady = async (): Promise<void> => {
        if (settled) return;
        const generatedPath = this.findGeneratedImagePath(output);
        if (!generatedPath) return;
        await fs.copyFile(generatedPath, outputPath);
        await this.assertFile(outputPath);
        finish();
      };
      const onOutput = (chunk: Buffer): void => {
        output += String(chunk);
        void copyGeneratedImageIfReady().catch((error: unknown) => {
          finish(error instanceof Error ? error : new Error('复制生成图片失败'));
        });
      };
      const timer = setTimeout(() => {
        finish(new Error(`Codex 生成超时，未返回图片。${output.slice(-500)}`));
      }, 30 * 60 * 1000);
      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);
      child.on('error', (error) => {
        finish(new Error(`Codex CLI 启动失败：${error.message}`));
      });
      child.on('close', (code) => {
        void (async () => {
          if (settled) return;
          if (job?.status === 'cancelled') {
            finish(new Error('任务已取消'));
            return;
          }
          try {
            await copyGeneratedImageIfReady();
            if (settled) return;
            await this.assertFile(outputPath);
            finish();
          } catch {
            finish(new Error(`Codex 退出码 ${code ?? 'unknown'}，未返回图片。${output.slice(-500)}`));
          }
        })();
      });
    });
  }

  private findGeneratedImagePath(output: string): string | null {
    const escapedRoot = this.options.generatedImagesDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...output.matchAll(new RegExp(`${escapedRoot}/[^\\s"'<>]+?\\.png`, 'g'))];
    for (const match of matches.reverse()) {
      const candidate = path.resolve(match[0]);
      const root = path.resolve(this.options.generatedImagesDir);
      if (candidate.startsWith(`${root}${path.sep}`)) return candidate;
    }
    return null;
  }

  private async assertFile(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size === 0) throw new Error(`图片文件不存在：${filePath}`);
  }

  private async assertManagedOrGeneratedFile(filePath: string): Promise<void> {
    const target = path.resolve(filePath);
    const outputRoot = path.resolve(this.options.outputRoot);
    const generatedRoot = path.resolve(this.options.generatedImagesDir);
    if (!target.startsWith(`${outputRoot}${path.sep}`) && !target.startsWith(`${generatedRoot}${path.sep}`)) {
      throw new Error(`图片路径不在工作台输出目录中: ${filePath}`);
    }
    await this.assertFile(filePath);
  }

  private toGeneratedImage(imagePath: string): GeneratedImage {
    const relative = path.relative(this.options.outputRoot, imagePath).split(path.sep).join('/');
    return {
      imagePath,
      imageUrl: `/api/animation-workbench/generated-images/${relative
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
    };
  }
}
