import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clapperboard,
  Clock3,
  Database,
  Egg,
  Film,
  Image as ImageIcon,
  Layers3,
  Loader2,
  type LucideIcon,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Scissors,
  Server,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import {
  type MouseEvent,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type FlowStepId = 'images' | 'actions' | 'timing' | 'gifs' | 'scale';
type RunKind = 'actions' | 'slice' | 'gif';
type RunStatus = 'running' | 'success' | 'failed';
type Stage1Style = 'egg' | 'sleep';
type UploadStage = '0' | '1' | '2' | '3' | '4' | '5' | '6';

interface ImageHistoryItem {
  imagePath: string;
  imageUrl: string;
  label: string;
  stage: UploadStage;
  ts: string;
}

interface RgbColor {
  b: number;
  g: number;
  r: number;
}

interface ImageTaskSnapshot {
  activeImageStage: UploadStage;
  description: string;
  history: ImageHistoryItem[];
  id: string;
  imageJob: ImageJob | null;
  imageJobId: string;
  petName: string;
  primitive: GeneratedImage | null;
  stage1Style: Stage1Style;
  title: string;
  uploadStage: UploadStage;
}

interface ModuleWindow {
  id: string;
  petName: string;
  title: string;
}

interface FlowStep {
  description: string;
  icon: LucideIcon;
  id: FlowStepId;
  label: string;
}

interface InventoryStage {
  actionAssets: Record<string, {
    frameCount: number;
    frames: string[];
    gif: boolean;
    longFrame: boolean;
    raw: boolean;
    updatedAt: string | null;
  }>;
  base: boolean;
  gifs: string[];
  longFrames: string[];
  rawFrames: string[];
  singleActions: string[];
  stage: string;
  timing: boolean;
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

interface SpeciesForm {
  code: string;
  description: string;
  isLegendary: boolean;
  name: string;
  originstatus: 'egg' | 'sleep';
  sortOrder: number;
}

interface GeneratedImage {
  imagePath: string;
  imageUrl: string;
}

interface ImageStage {
  error?: string;
  imagePath?: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'ready' | 'saved' | 'error' | 'cancelled';
}

interface ImageJob {
  animalName: string;
  stages: Record<string, ImageStage>;
  status: 'running' | 'done' | 'error' | 'cancelled';
}

interface ActionTarget {
  actions: string[];
  id: string;
  label: string;
  stage: string;
  style?: Stage1Style;
}

interface TimingConfig {
  frameDurations: Record<string, number>;
  loop: boolean;
  sequence: number[];
}

interface TimingAction {
  frameCount: number;
  frames: string[];
  name: string;
  timing: TimingConfig;
}

interface TransformConfig {
  scale: number;
  x: number;
  y: number;
}

interface ScaleAction {
  actionCode: string;
  gifUrl: string;
  transform: TransformConfig;
}

interface ScalePreviewPreset {
  disableInternalPatrol?: boolean;
  key: string;
  label: string;
  petSize?: number;
  size: number;
}

const FLOW_STEPS: FlowStep[] = [
  { description: '五阶段 base.png', icon: ImageIcon, id: 'images', label: '生成形象图' },
  { description: '长帧与单帧', icon: Clapperboard, id: 'actions', label: '动作动画制作' },
  { description: '序列与帧时长', icon: Clock3, id: 'timing', label: 'Timing' },
  { description: '打包与上传', icon: Film, id: 'gifs', label: 'GIF 生成' },
  { description: 'Scale 与偏移', icon: SlidersHorizontal, id: 'scale', label: '动作缩放' },
];

const STAGES = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'];
const UPLOAD_STAGE_OPTIONS: Array<{ label: string; value: UploadStage }> = [
  { label: 'Stage 0 — 宠物蛋形态', value: '0' },
  { label: 'Stage 1 — 初生右趴睡眠形态', value: '1' },
  { label: 'Stage 2 — 原始形态', value: '2' },
  { label: 'Stage 3 — 第一次进化', value: '3' },
  { label: 'Stage 4 — 第二次进化', value: '4' },
  { label: 'Stage 5 — 最终进化', value: '5' },
  { label: 'Stage 6 — 超进化', value: '6' },
];
const STANDARD_ACTIONS = [
  'idle',
  'running-right',
  'running-left',
  'jumping',
  'waving',
  'failed',
  'eat',
  'happy',
  'levelup',
];
const SCALE_CONFIG_BASE_RENDER_SIZE = 230;
const SCALE_PRESETS: ScalePreviewPreset[] = [
  { key: 'student-detail', label: '学生详情页 size 368 / petSize 192', petSize: 192, size: 368 },
  { key: 'pet-home', label: '宠物家园 size 280 / petSize 230', petSize: 230, size: 280 },
  { key: 'class-wall', label: '班级墙 stage2-4 size 80 / petSize 74', petSize: 74, size: 80 },
  { key: 'class-wall-final', label: '班级墙最终形态 size 80 / petSize 62', petSize: 62, size: 80 },
  { disableInternalPatrol: true, key: 'playground', label: '游乐园基准 size 150 / petSize 默认', size: 150 },
  { key: 'legacy-320', label: '旧版 320px 对照', petSize: 230, size: 320 },
];
const ACTION_TARGETS: ActionTarget[] = [
  {
    actions: ['idle', 'failed', 'jumping', 'levelup'],
    id: 'stage1-egg',
    label: 'Stage 1 · Egg',
    stage: 'stage1',
    style: 'egg',
  },
  {
    actions: ['idle', 'waving', 'eat', 'failed', 'levelup'],
    id: 'stage1-sleep',
    label: 'Stage 1 · Sleep',
    stage: 'stage1',
    style: 'sleep',
  },
  ...['stage2', 'stage3', 'stage4', 'stage5'].map((stage) => ({
    actions: STANDARD_ACTIONS,
    id: stage,
    label: stage.replace('stage', 'Stage '),
    stage,
  })),
];

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('1234 工作台服务未连接，请刷新页面或重新启动工作台');
  }

  const data = (await response.json()) as T;
  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data ? String(data.message) : '请求失败';
    throw new Error(message);
  }
  return data;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('文件读取结果异常'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function getImageStatus(status?: string, saved = false): string {
  if (status === 'generating') return '生成中';
  if (status === 'ready') return '待保存';
  if (status === 'saved' || saved) return '已保存';
  if (status === 'error') return '失败';
  if (status === 'cancelled') return '已取消';
  return '待生成';
}

function getStageDisplayStatus(status?: ImageStage['status'], saved = false): ImageStage['status'] {
  // 复用 3721 的阶段灯语义：运行态优先，其次保存态，最后才是待生成。
  if (status === 'generating' || status === 'error' || status === 'cancelled') return status;
  if (status === 'saved' || saved) return 'saved';
  if (status === 'ready') return 'ready';
  return 'pending';
}

function getStageBadgeClass(status: ImageStage['status']): string {
  return status === 'pending' ? 'state' : `state ${status}`;
}

function saveRootParam(saveRoot: string): string {
  return `saveRoot=${encodeURIComponent(saveRoot)}`;
}

function getAssetUrl(petName: string, stage: string, saveRoot: string, file = 'base.png'): string {
  return `/api/animation-workbench/assets/${encodeURIComponent(petName)}/${stage}/${file}?${saveRootParam(saveRoot)}`;
}

function getStageBasePath(saveRoot: string, petName: string, stage: string): string {
  return `${saveRoot.replace(/\/+$/, '')}/${petName.trim()}/${stage}/base.png`;
}

function getStageAssetUrl(
  petName: string,
  stage: string,
  relativePath: string,
  saveRoot: string,
): string {
  return `/api/animation-workbench/stage-assets/${encodeURIComponent(petName)}/${stage}/${relativePath.split('/').map(encodeURIComponent).join('/')}?${saveRootParam(saveRoot)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}分${seconds.toString().padStart(2, '0')}秒` : `${seconds}秒`;
}

function getPetRenderSize(preset: ScalePreviewPreset): number {
  return Math.min(preset.size, preset.petSize ?? Math.round(preset.size * 0.72));
}

function getScalePreviewMetrics(
  actionTransform: TransformConfig,
  stageTransform: TransformConfig,
  preset: ScalePreviewPreset,
) {
  const petRenderSize = getPetRenderSize(preset);
  const finalRenderSize = Math.round(
    petRenderSize * actionTransform.scale * stageTransform.scale,
  );
  const offsetRatio = petRenderSize / SCALE_CONFIG_BASE_RENDER_SIZE;
  const sizeBonus = Math.max(0, finalRenderSize - petRenderSize);
  const xOffset = Math.round((actionTransform.x + stageTransform.x) * offsetRatio);
  const yOffset =
    -Math.round(sizeBonus * 0.8) +
    Math.round((actionTransform.y + stageTransform.y) * offsetRatio);
  return {
    finalRenderSize,
    marginLeft: -Math.round(finalRenderSize / 2) + xOffset,
    marginTop: -Math.round(finalRenderSize / 2) + yOffset,
    petRenderSize,
    sizeBonus,
    xOffset,
    yOffset,
  };
}

function hexToRgb(hex: string): RgbColor {
  return {
    b: Number.parseInt(hex.slice(5, 7), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    r: Number.parseInt(hex.slice(1, 3), 16),
  };
}

function rgbToName({ b, g, r }: RgbColor): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 510;
  const saturation = max === min ? 0 : (max - min) / (255 * (1 - Math.abs(2 * lightness - 1)));
  if (lightness < 0.15) return '黑色';
  if (lightness > 0.85) return '白色';
  if (saturation < 0.15) return lightness > 0.5 ? '浅灰色' : '深灰色';
  const hue = rgbToHue(r, g, b);
  if (hue < 30) return r > 200 && g < 80 ? '红色' : '橙红色';
  if (hue < 60) return '橙色';
  if (hue < 90) return '黄色';
  if (hue < 150) return '绿色';
  if (hue < 200) return '青色';
  if (hue < 260) return '蓝色';
  if (hue < 290) return '紫色';
  if (hue < 330) return '紫红色';
  return '红色';
}

function rgbToHue(red: number, green: number, blue: number): number {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return 0;
  if (max === r) return (((g - b) / delta + (g < b ? 6 : 0)) / 6) * 360;
  if (max === g) return (((b - r) / delta + 2) / 6) * 360;
  return (((r - g) / delta + 4) / 6) * 360;
}

export default function App(): JSX.Element {
  const initialTaskId = useMemo(() => crypto.randomUUID(), []);
  const initialActionWindowId = useMemo(() => crypto.randomUUID(), []);
  const initialTimingWindowId = useMemo(() => crypto.randomUUID(), []);
  const initialGifWindowId = useMemo(() => crypto.randomUUID(), []);
  const initialScaleWindowId = useMemo(() => crypto.randomUUID(), []);
  const [activeStep, setActiveStep] = useState<FlowStepId>('images');
  const [petName, setPetName] = useState('');
  const [description, setDescription] = useState('');
  const [stage1Style, setStage1Style] = useState<Stage1Style>('sleep');
  const [uploadStage, setUploadStage] = useState<UploadStage>('2');
  const [activeImageStage, setActiveImageStage] = useState<UploadStage>('2');
  const [iterationPrompt, setIterationPrompt] = useState('');
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  const [replaceColor, setReplaceColor] = useState('#ffffff');
  const [selectedMaskDataURL, setSelectedMaskDataURL] = useState('');
  const [tolerance, setTolerance] = useState(40);
  const [inventory, setInventory] = useState<InventoryStage[]>([]);
  const [primitive, setPrimitive] = useState<GeneratedImage | null>(null);
  const [imageJobId, setImageJobId] = useState('');
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);
  const [selectedActionTargetId, setSelectedActionTargetId] = useState('stage1-sleep');
  const [timingStage, setTimingStage] = useState('stage1');
  const [scaleStage, setScaleStage] = useState('stage1');
  const [includeUpload, setIncludeUpload] = useState(false);
  const [includeSnapshot, setIncludeSnapshot] = useState(false);
  const [qiniuApiKey, setQiniuApiKey] = useState('');
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [serviceOnline, setServiceOnline] = useState(true);
  const [animals, setAnimals] = useState<string[]>([]);
  const [saveRoot, setSaveRoot] = useState('');
  const [activeImageTaskId, setActiveImageTaskId] = useState<string>(initialTaskId);
  const [imageTasks, setImageTasks] = useState<ImageTaskSnapshot[]>([
    {
      activeImageStage: '2',
      description: '',
      history: [],
      id: initialTaskId,
      imageJob: null,
      imageJobId: '',
      petName: '',
      primitive: null,
      stage1Style: 'sleep',
      title: '窗口 1',
      uploadStage: '2',
    },
  ]);
  const [activeModuleWindowIds, setActiveModuleWindowIds] = useState<Record<'actions' | 'timing' | 'gifs' | 'scale', string>>({
    actions: initialActionWindowId,
    gifs: initialGifWindowId,
    scale: initialScaleWindowId,
    timing: initialTimingWindowId,
  });
  const [moduleWindows, setModuleWindows] = useState<Record<'actions' | 'timing' | 'gifs' | 'scale', ModuleWindow[]>>({
    actions: [{ id: initialActionWindowId, petName: '', title: '窗口 1' }],
    gifs: [{ id: initialGifWindowId, petName: '', title: '窗口 1' }],
    scale: [{ id: initialScaleWindowId, petName: '', title: '窗口 1' }],
    timing: [{ id: initialTimingWindowId, petName: '', title: '窗口 1' }],
  });
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const activeStageData = imageJob?.stages[activeImageStage];

  const selectedActionTarget =
    ACTION_TARGETS.find((target) => target.id === selectedActionTargetId) ?? ACTION_TARGETS[1];
  const activeStepIndex = FLOW_STEPS.findIndex((step) => step.id === activeStep);

  const imageCards = useMemo(() => {
    const sourceIds = [stage1Style === 'egg' ? '0' : '1', '2', '3', '4', '5'];
    const cards = STAGES.map((stage, index) => ({
      data: imageJob?.stages[sourceIds[index] ?? ''],
      label: index === 0 ? `Stage 1 · ${stage1Style === 'egg' ? 'Egg' : 'Sleep'}` : `Stage ${index + 1}`,
      sourceId: sourceIds[index] ?? '',
      stage,
    }));
    if (imageJob?.stages['6']?.imagePath) {
      cards.push({
        data: imageJob.stages['6'],
        label: 'Stage 6 · Ultra',
        sourceId: '6',
        stage: 'stage6',
      });
    }
    return cards;
  }, [imageJob, stage1Style]);

  const savedStage2Ready = Boolean(inventory.find((item) => item.stage === 'stage2')?.base);
  const stage2ReferencePath = primitive?.imagePath
    ?? (petName.trim() && savedStage2Ready ? getStageBasePath(saveRoot, petName, 'stage2') : '');
  const stage2ReferenceUrl = primitive?.imageUrl
    ?? (petName.trim() && savedStage2Ready ? getAssetUrl(petName, 'stage2', saveRoot) : '');
  const fiveStageReady = imageCards.every((card) => card.data?.imagePath);
  const completedSteps = useMemo(() => {
    const allBases = STAGES.every((stage) => inventory.find((item) => item.stage === stage)?.base);
    const allActions = STAGES.every(
      (stage) => (inventory.find((item) => item.stage === stage)?.singleActions.length ?? 0) > 0,
    );
    const allTiming = STAGES.every((stage) => inventory.find((item) => item.stage === stage)?.timing);
    const allGifs = STAGES.every(
      (stage) => (inventory.find((item) => item.stage === stage)?.gifs.length ?? 0) > 0,
    );
    return new Set<FlowStepId>([
      ...(allBases ? (['images'] as FlowStepId[]) : []),
      ...(allActions ? (['actions'] as FlowStepId[]) : []),
      ...(allTiming ? (['timing'] as FlowStepId[]) : []),
      ...(allGifs ? (['gifs'] as FlowStepId[]) : []),
    ]);
  }, [inventory]);

  const loadInventoryFor = useCallback(async (targetPetName: string) => {
    if (!targetPetName.trim()) {
      setInventory([]);
      return;
    }
    try {
      const data = await readJson<{ inventory: InventoryStage[] }>(
        `/api/animation-workbench/inventory?petName=${encodeURIComponent(targetPetName.trim())}&${saveRootParam(saveRoot)}`,
      );
      setInventory(data.inventory);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '读取资源状态失败');
    }
  }, [saveRoot]);

  const refreshInventory = useCallback(async () => {
    await loadInventoryFor(petName);
  }, [loadInventoryFor, petName]);

  useEffect(() => {
    void readJson('/api/animation-workbench/image-tool/start', { method: 'POST' }).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    void readJson<{ defaultQiniuApiKey: string; defaultSaveRoot: string }>('/api/animation-workbench/settings')
      .then((data) => {
        setSaveRoot(data.defaultSaveRoot);
        setQiniuApiKey(data.defaultQiniuApiKey);
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : '读取默认保存路径失败'));
  }, []);

  useEffect(() => {
    void readJson<{ animals: string[] }>(`/api/animation-workbench/animals?${saveRootParam(saveRoot)}`)
      .then((data) => setAnimals(data.animals))
      .catch((error) => setNotice(error instanceof Error ? error.message : '读取已有宠物失败'));
  }, [saveRoot]);

  useEffect(() => {
    let mounted = true;
    const checkService = async () => {
      try {
        const response = await fetch('/api/animation-workbench/health', { cache: 'no-store' });
        if (mounted) setServiceOnline(response.ok);
      } catch {
        if (mounted) setServiceOnline(false);
      }
    };
    void checkService();
    const timer = window.setInterval(() => void checkService(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!imageJobId) return undefined;
    const timer = window.setInterval(() => {
      void readJson<ImageJob>(`/api/animation-workbench/image-tool/stages-status/${imageJobId}`)
        .then((data) => setImageJob(data))
        .catch((error) => setNotice(error instanceof Error ? error.message : '刷新生成状态失败'));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [imageJobId]);

  useEffect(() => {
    if (!run || run.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      void readJson<{ run: RunRecord }>(`/api/animation-workbench/runs/${run.id}`).then((data) =>
        setRun(data.run),
      );
    }, 1500);
    return () => window.clearInterval(timer);
  }, [run]);

  const activeActionWindow = getModuleWindow('actions');
  const activeTimingWindow = getModuleWindow('timing');
  const activeGifWindow = getModuleWindow('gifs');
  const activeScaleWindow = getModuleWindow('scale');
  const activeModulePetName =
    activeStep === 'actions'
      ? activeActionWindow.petName
      : activeStep === 'timing'
        ? activeTimingWindow.petName
        : activeStep === 'gifs'
          ? activeGifWindow.petName
          : activeStep === 'scale'
            ? activeScaleWindow.petName
            : '';

  useEffect(() => {
    void loadInventoryFor(activeStep === 'images' ? petName : activeModulePetName);
  }, [activeModulePetName, activeStep, loadInventoryFor, petName]);

  useEffect(() => {
    if (run && run.status !== 'running') {
      void loadInventoryFor(activeStep === 'images' ? petName : activeModulePetName);
    }
  }, [activeModulePetName, activeStep, loadInventoryFor, petName, run?.id, run?.status]);

  useEffect(() => {
    if (!run || run.status === 'running') return;
    setRunHistory((current) =>
      current.some((item) => item.id === run.id) ? current : [run, ...current].slice(0, 20),
    );
  }, [run]);

  function setMessage(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4200);
  }

  function makeImageTaskSnapshot(id = activeImageTaskId): ImageTaskSnapshot {
    const titleSource = petName.trim() || description.trim();
    const fallback = imageTasks.find((task) => task.id === id)?.title ?? `窗口 ${imageTasks.length}`;
    return {
      activeImageStage,
      description,
      history: imageHistory,
      id,
      imageJob,
      imageJobId,
      petName,
      primitive,
      stage1Style,
      title: titleSource ? (titleSource.length > 18 ? `${titleSource.slice(0, 18)}...` : titleSource) : fallback,
      uploadStage,
    };
  }

  function restoreImageTask(task: ImageTaskSnapshot) {
    setPetName(task.petName);
    setDescription(task.description);
    setStage1Style(task.stage1Style);
    setUploadStage(task.uploadStage);
    setActiveImageStage(task.activeImageStage);
    setPrimitive(task.primitive);
    setImageJob(task.imageJob);
    setImageJobId(task.imageJobId);
    setImageHistory(task.history);
    setIterationPrompt('');
    setInventory([]);
    setPickedColor(null);
    setSelectedMaskDataURL('');
  }

  function persistActiveImageTask() {
    const snapshot = makeImageTaskSnapshot();
    setImageTasks((tasks) => tasks.map((task) => (task.id === snapshot.id ? snapshot : task)));
    return snapshot;
  }

  function createImageTask() {
    persistActiveImageTask();
    const id = crypto.randomUUID();
    const task: ImageTaskSnapshot = {
      activeImageStage: '2',
      description: '',
      history: [],
      id,
      imageJob: null,
      imageJobId: '',
      petName: '',
      primitive: null,
      stage1Style: 'sleep',
      title: `窗口 ${imageTasks.length + 1}`,
      uploadStage: '2',
    };
    setImageTasks((tasks) => [...tasks, task]);
    setActiveImageTaskId(id);
    restoreImageTask(task);
  }

  function switchImageTask(taskId: string) {
    if (taskId === activeImageTaskId) return;
    const snapshot = makeImageTaskSnapshot();
    const nextTasks = imageTasks.map((task) => (task.id === snapshot.id ? snapshot : task));
    const target = nextTasks.find((task) => task.id === taskId);
    if (!target) return;
    setImageTasks(nextTasks);
    setActiveImageTaskId(taskId);
    restoreImageTask(target);
  }

  function deleteImageTask(taskId: string) {
    if (imageTasks.length <= 1) {
      setMessage('至少保留一个窗口');
      return;
    }
    const snapshot = makeImageTaskSnapshot();
    const nextTasks = imageTasks
      .map((task) => (task.id === snapshot.id ? snapshot : task))
      .filter((task) => task.id !== taskId);
    const nextActiveId = activeImageTaskId === taskId ? nextTasks[0]?.id : activeImageTaskId;
    setImageTasks(nextTasks);
    if (nextActiveId && nextActiveId !== activeImageTaskId) {
      setActiveImageTaskId(nextActiveId);
      const nextTask = nextTasks.find((task) => task.id === nextActiveId);
      if (nextTask) restoreImageTask(nextTask);
    }
  }

  function renameImageTask(taskId: string) {
    const currentTitle =
      taskId === activeImageTaskId
        ? makeImageTaskSnapshot(taskId).title
        : imageTasks.find((task) => task.id === taskId)?.title;
    const value = window.prompt('重命名窗口', currentTitle ?? '');
    if (!value?.trim()) return;
    setImageTasks((tasks) =>
      tasks.map((task) => (task.id === taskId ? { ...task, title: value.trim() } : task)),
    );
  }

  function connectImageTaskPet(taskId: string, value: string) {
    if (taskId === activeImageTaskId) {
      changePetName(value);
    }
    setImageTasks((tasks) =>
      tasks.map((task) => (task.id === taskId ? { ...task, petName: value } : task)),
    );
  }

  function getModuleWindow(step: 'actions' | 'timing' | 'gifs' | 'scale'): ModuleWindow {
    return (
      moduleWindows[step].find((item) => item.id === activeModuleWindowIds[step]) ??
      moduleWindows[step][0] ??
      { id: '', petName: '', title: '窗口 1' }
    );
  }

  function createModuleWindow(step: 'actions' | 'timing' | 'gifs' | 'scale') {
    const id = crypto.randomUUID();
    const next: ModuleWindow = {
      id,
      petName: '',
      title: `窗口 ${moduleWindows[step].length + 1}`,
    };
    setModuleWindows((current) => ({ ...current, [step]: [...current[step], next] }));
    setActiveModuleWindowIds((current) => ({ ...current, [step]: id }));
    setInventory([]);
  }

  function deleteModuleWindow(step: 'actions' | 'timing' | 'gifs' | 'scale', id: string) {
    const currentWindows = moduleWindows[step];
    if (currentWindows.length <= 1) {
      setMessage('至少保留一个窗口');
      return;
    }
    const nextWindows = currentWindows.filter((item) => item.id !== id);
    const nextActive = activeModuleWindowIds[step] === id ? nextWindows[0]?.id : activeModuleWindowIds[step];
    setModuleWindows((current) => ({ ...current, [step]: nextWindows }));
    setActiveModuleWindowIds((current) => ({ ...current, [step]: nextActive ?? current[step] }));
  }

  function renameModuleWindow(step: 'actions' | 'timing' | 'gifs' | 'scale', id: string) {
    const target = moduleWindows[step].find((item) => item.id === id);
    const value = window.prompt('重命名窗口', target?.title ?? '');
    if (!value?.trim()) return;
    setModuleWindows((current) => ({
      ...current,
      [step]: current[step].map((item) => (item.id === id ? { ...item, title: value.trim() } : item)),
    }));
  }

  function connectModulePet(step: 'actions' | 'timing' | 'gifs' | 'scale', id: string, value: string) {
    setModuleWindows((current) => ({
      ...current,
      [step]: current[step].map((item) => (item.id === id ? { ...item, petName: value } : item)),
    }));
  }

  function chooseActionTarget(target: ActionTarget) {
    setSelectedActionTargetId(target.id);
    if (target.style) setStage1Style(target.style);
  }

  function chooseUploadStage(stage: UploadStage) {
    setUploadStage(stage);
    setActiveImageStage(stage);
    if (stage === '0') setStage1Style('egg');
    if (stage === '1') setStage1Style('sleep');
  }

  function addImageHistory(stage: UploadStage, label: string, image: GeneratedImage) {
    setImageHistory((items) => [
      {
        imagePath: image.imagePath,
        imageUrl: image.imageUrl,
        label,
        stage,
        ts: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      },
      ...items,
    ]);
  }

  function upsertImageStage(stage: UploadStage, image: GeneratedImage, status: ImageStage['status'] = 'ready') {
    setImageJob((current) => ({
      animalName: petName.trim(),
      stages: {
        ...(current?.stages ?? {}),
        [stage]: { ...image, status },
      },
      status: current?.status ?? 'running',
    }));
    setActiveImageStage(stage);
    if (stage === '0') setStage1Style('egg');
    if (stage === '1') setStage1Style('sleep');
    if (stage === '2') setPrimitive(image);
    setPickedColor(null);
    setSelectedMaskDataURL('');
  }

  function pickImageColor(event: MouseEvent<HTMLImageElement>, imageUrl: string) {
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor(((event.clientX - rect.left) / rect.width) * img.naturalWidth)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor(((event.clientY - rect.top) / rect.height) * img.naturalHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const source = new Image();
    source.onload = () => {
      context.drawImage(source, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const offset = (y * canvas.width + x) * 4;
      const color = {
        b: imageData.data[offset + 2] ?? 0,
        g: imageData.data[offset + 1] ?? 0,
        r: imageData.data[offset] ?? 0,
      };
      const mask = context.createImageData(canvas.width, canvas.height);
      const limit = tolerance * tolerance * 3;
      for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += 1) {
        const base = pixel * 4;
        const dr = (imageData.data[base] ?? 0) - color.r;
        const dg = (imageData.data[base + 1] ?? 0) - color.g;
        const db = (imageData.data[base + 2] ?? 0) - color.b;
        mask.data[base] = 0;
        mask.data[base + 1] = 0;
        mask.data[base + 2] = 0;
        mask.data[base + 3] = dr * dr + dg * dg + db * db <= limit ? 0 : 255;
      }
      context.putImageData(mask, 0, 0);
      setPickedColor(color);
      setSelectedMaskDataURL(canvas.toDataURL('image/png'));
      setMessage('已选中相近颜色区域');
    };
    source.src = imageUrl;
  }

  async function applyColorEdit() {
    if (!activeStageData?.imagePath) {
      setMessage(`Stage ${activeImageStage} 还没有图片`);
      return;
    }
    if (!selectedMaskDataURL || !pickedColor) {
      setMessage('请先点击图片选择颜色区域');
      return;
    }
    setBusy('color-edit');
    setImageJob((current) =>
      current
        ? {
            ...current,
            stages: {
              ...current.stages,
              [activeImageStage]: { ...current.stages[activeImageStage], status: 'generating' },
            },
          }
        : current,
    );
    try {
      const data = await readJson<GeneratedImage>('/api/animation-workbench/image-tool/edit-color', {
        body: JSON.stringify({
          imagePath: activeStageData.imagePath,
          maskDataURL: selectedMaskDataURL,
          prompt: `在选中区域将颜色替换为 ${rgbToName(hexToRgb(replaceColor))}（${replaceColor}），保持周围区域、角色外形、材质和光照完全不变`,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      upsertImageStage(activeImageStage, data);
      addImageHistory(activeImageStage, `Stage ${activeImageStage} 换色`, data);
      setMessage(`Stage ${activeImageStage} 颜色替换完成`);
    } catch (error) {
      setImageJob((current) =>
        current
          ? {
              ...current,
              stages: {
                ...current.stages,
                [activeImageStage]: { ...current.stages[activeImageStage], status: 'error' },
              },
            }
          : current,
      );
      setMessage(error instanceof Error ? error.message : '颜色替换失败');
    } finally {
      setBusy('');
    }
  }

  function changePetName(value: string) {
    // 输入动物名表示开启新任务，不能自动带入同名历史资源。
    setPetName(value);
    setPrimitive(null);
    setImageJobId('');
    setImageJob(null);
    setInventory([]);
    setImageHistory([]);
  }

  async function uploadLocalImage(file: File | null) {
    if (!file) return;
    if (!petName.trim()) {
      setMessage('请先输入动物类型');
      return;
    }
    setBusy('upload-image');
    try {
      const dataURL = await readFileAsDataURL(file);
      const data = await readJson<GeneratedImage>('/api/animation-workbench/image-tool/upload-image', {
        body: JSON.stringify({ dataURL, filename: file.name }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const stage = uploadStage;
      upsertImageStage(stage, data);
      addImageHistory(stage, `上传到 Stage ${stage}`, data);
      setMessage(`图片已上传到 Stage ${stage}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传图片失败');
    } finally {
      setBusy('');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  async function generatePrimitive() {
    if (!petName.trim()) {
      setMessage('请先输入动物类型');
      return;
    }
    setBusy('primitive');
    setActiveImageStage('2');
    setImageJob({
      animalName: petName.trim(),
      stages: { 2: { status: 'generating' } },
      status: 'running',
    });
    try {
      const data = await readJson<GeneratedImage>(
        '/api/animation-workbench/image-tool/generate-stage2',
        {
          body: JSON.stringify({ animalName: petName.trim(), description }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      setPrimitive(data);
      addImageHistory('2', '生成原始形态', data);
      setImageJob({
        animalName: petName.trim(),
        stages: { 2: { ...data, status: 'ready' } },
        status: 'running',
      });
      setMessage('Stage 2 原始形象已生成');
    } catch (error) {
      setImageJob((current) =>
        current
          ? {
              ...current,
              stages: {
                ...current.stages,
                2: { status: 'error' },
              },
              status: 'error',
            }
          : current,
      );
      setMessage(error instanceof Error ? error.message : '生成原始形象失败');
    } finally {
      setBusy('');
    }
  }

  async function generateStages() {
    if (!stage2ReferencePath) {
      setMessage('请先生成 Stage 2 原始形象');
      return;
    }
    setBusy('stages');
    try {
      const data = await readJson<{ jobId: string }>(
        '/api/animation-workbench/image-tool/generate-stages',
        {
          body: JSON.stringify({
            animalName: petName.trim(),
            description,
            referenceImagePath: stage2ReferencePath,
            referenceImageUrl: stage2ReferenceUrl,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      setImageJobId(data.jobId);
      const status = await readJson<ImageJob>(
        `/api/animation-workbench/image-tool/stages-status/${data.jobId}`,
      );
      setImageJob(status);
      setMessage('五阶段生成任务已启动');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '启动阶段生成失败');
    } finally {
      setBusy('');
    }
  }

  async function cancelImageGeneration() {
    if (!imageJobId) return;
    try {
      await readJson(`/api/animation-workbench/image-tool/cancel-job/${imageJobId}`, { method: 'POST' });
      setImageJobId('');
      setMessage('已发送停止请求');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '停止生成失败');
    }
  }

  async function iterateCurrentImage() {
    if (!activeStageData?.imagePath) {
      setMessage(`Stage ${activeImageStage} 还没有图片`);
      return;
    }
    if (!iterationPrompt.trim()) {
      setMessage('请填写文字迭代描述');
      return;
    }
    setBusy('iterate-image');
    setImageJob((current) =>
      current
        ? {
            ...current,
            stages: {
              ...current.stages,
              [activeImageStage]: { ...current.stages[activeImageStage], status: 'generating' },
            },
          }
        : current,
    );
    try {
      const data = await readJson<GeneratedImage>('/api/animation-workbench/image-tool/edit', {
        body: JSON.stringify({
          imagePath: activeStageData.imagePath,
          prompt: iterationPrompt.trim(),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      upsertImageStage(activeImageStage, data);
      addImageHistory(activeImageStage, `Stage ${activeImageStage} 迭代`, data);
      setMessage(`Stage ${activeImageStage} 迭代完成`);
    } catch (error) {
      setImageJob((current) =>
        current
          ? {
              ...current,
              stages: {
                ...current.stages,
                [activeImageStage]: { ...current.stages[activeImageStage], status: 'error' },
              },
            }
          : current,
      );
      setMessage(error instanceof Error ? error.message : '文字迭代失败');
    } finally {
      setBusy('');
    }
  }

  async function generateNextImageStage() {
    if (!activeStageData?.imagePath) {
      setMessage(`Stage ${activeImageStage} 还没有图片`);
      return;
    }
    const sourceStage = Number(activeImageStage);
    const targetStage = sourceStage + 1;
    if (targetStage > 6) {
      setMessage('Stage 6 已经是最终阶段');
      return;
    }
    setBusy('next-stage');
    setImageJob((current) =>
      current
        ? {
            ...current,
            stages: {
              ...current.stages,
              [String(targetStage)]: { status: 'generating' },
            },
          }
        : current,
    );
    try {
      const data = await readJson<GeneratedImage>(
        '/api/animation-workbench/image-tool/generate-stage-from-image',
        {
          body: JSON.stringify({
            animalName: petName.trim(),
            description,
            sourceImagePath: activeStageData.imagePath,
            sourceStageNum: sourceStage,
            targetStageNum: targetStage,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      const stage = String(targetStage) as UploadStage;
      upsertImageStage(stage, data);
      addImageHistory(stage, `Stage ${sourceStage} → Stage ${targetStage}`, data);
      setUploadStage(stage);
      setMessage(`Stage ${targetStage} 已生成`);
    } catch (error) {
      setImageJob((current) =>
        current
          ? {
              ...current,
              stages: {
                ...current.stages,
                [String(targetStage)]: { status: 'error' },
              },
            }
          : current,
      );
      setMessage(error instanceof Error ? error.message : '生成下一阶段失败');
    } finally {
      setBusy('');
    }
  }

  async function saveFiveStages() {
    if (!imageJob) return;
    setBusy('save-five');
    try {
      await readJson('/api/animation-workbench/image-tool/save-five-stage-set', {
        body: JSON.stringify({
          animalName: petName.trim(),
          saveRoot,
          stage1Style,
          stages: imageJob.stages,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      await refreshInventory();
      setMessage('五阶段 base.png 已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存五阶段失败');
    } finally {
      setBusy('');
    }
  }

  async function saveSelectedImageStage() {
    const stageData = imageJob?.stages[activeImageStage];
    if (!petName.trim()) {
      setMessage('请先输入动物类型');
      return;
    }
    if (!stageData?.imagePath) {
      setMessage(`Stage ${activeImageStage} 还没有图片`);
      return;
    }
    setBusy('save-stage');
    try {
      await readJson('/api/animation-workbench/image-tool/save-stage', {
        body: JSON.stringify({
          animalName: petName.trim(),
          imagePath: stageData.imagePath,
          saveRoot,
          stageNum: activeImageStage,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setImageJob((current) =>
        current
          ? {
              ...current,
              stages: {
                ...current.stages,
                [activeImageStage]: { ...current.stages[activeImageStage], status: 'saved' },
              },
            }
          : current,
      );
      await refreshInventory();
      setMessage(`Stage ${activeImageStage} base.png 已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存当前阶段失败');
    } finally {
      setBusy('');
    }
  }

  async function startRun(
    kind: RunKind,
    targetPetName = petName,
    options: { actionName?: string; actionPrompt?: string } = {},
  ) {
    setBusy(kind);
    try {
      const data = await readJson<{ run: RunRecord }>('/api/animation-workbench/runs', {
        body: JSON.stringify({
          includeSnapshot,
          includeUpload,
          actionName: options.actionName,
          actionPrompt: options.actionPrompt,
          kind,
          petName: targetPetName.trim(),
          qiniuApiKey,
          saveRoot,
          stage: selectedActionTarget?.stage ?? 'stage1',
          stage1Style: selectedActionTarget?.style ?? stage1Style,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setRun(data.run);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '启动任务失败');
    } finally {
      setBusy('');
    }
  }

  function goRelative(offset: number) {
    const next = FLOW_STEPS[activeStepIndex + offset];
    if (next) setActiveStep(next.id);
  }

  return (
    <main className="workbench-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark"><Clapperboard size={21} /></span>
          <div>
            <h1>PetPals 动画工作台</h1>
            <p>本地资源制作</p>
          </div>
        </div>
        <div className="context-fields">
          <label className="save-root-field">
            <span>保存根目录</span>
            <input
              title="动物资源根目录，保存时会自动写入 <根目录>/<动物名>/stageN"
              value={saveRoot}
              onChange={(event) => setSaveRoot(event.target.value)}
            />
          </label>
          <button className="icon-button" disabled={!petName.trim()} title="加载同名已有资源" type="button" onClick={() => void refreshInventory()}>
            <RefreshCw size={17} />
          </button>
          <span className={serviceOnline ? 'port-status' : 'port-status offline'}>
            <Server size={15} /> {serviceOnline ? '1234 在线' : '1234 已断开'}
          </span>
        </div>
      </header>
      <datalist id="petpals-existing-animals">
        {animals.map((animal) => <option key={animal} value={animal} />)}
      </datalist>

      <nav className="flow-nav" aria-label="动画制作流程">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const active = step.id === activeStep;
          const complete = completedSteps.has(step.id);
          return (
            <button
              className={active ? 'flow-step active' : complete ? 'flow-step complete' : 'flow-step'}
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
            >
              <span className="step-number">{complete ? <Check size={15} /> : index + 1}</span>
              <span className="step-copy"><strong>{step.label}</strong><small>{step.description}</small></span>
              <Icon className="step-icon" size={18} />
            </button>
          );
        })}
      </nav>

      <section className="workspace">
        {activeStep === 'images' ? (
          <ImageStep
            busy={busy}
            activeImageStage={activeImageStage}
            description={description}
            fiveStageReady={fiveStageReady}
            history={imageHistory}
            activeImageTaskId={activeImageTaskId}
            imageCards={imageCards}
            imageTasks={imageTasks.map((task) =>
              task.id === activeImageTaskId ? makeImageTaskSnapshot(task.id) : task,
            )}
            inventory={inventory}
            iterationPrompt={iterationPrompt}
            onApplyColorEdit={() => void applyColorEdit()}
            onActiveImageStageChange={(stage) => {
              setActiveImageStage(stage);
              setUploadStage(stage);
              if (stage === '0') setStage1Style('egg');
              if (stage === '1') setStage1Style('sleep');
            }}
            onCancelGeneration={() => void cancelImageGeneration()}
            onConnectImageTaskPet={connectImageTaskPet}
            onCreateImageTask={createImageTask}
            onDeleteImageTask={deleteImageTask}
            onDescriptionChange={setDescription}
            onGeneratePrimitive={() => void generatePrimitive()}
            onGenerateStages={() => void generateStages()}
            onGenerateNextStage={() => void generateNextImageStage()}
            onIterationPromptChange={setIterationPrompt}
            onIterate={() => void iterateCurrentImage()}
            onPetNameChange={changePetName}
            onRestoreHistory={(item) => {
              upsertImageStage(item.stage, { imagePath: item.imagePath, imageUrl: item.imageUrl });
              setUploadStage(item.stage);
            }}
            onImagePick={pickImageColor}
            onSave={() => void saveFiveStages()}
            onSaveSelectedStage={() => void saveSelectedImageStage()}
            onStage1StyleChange={setStage1Style}
            onRenameImageTask={renameImageTask}
            onSwitchImageTask={switchImageTask}
            onUploadClick={() => uploadInputRef.current?.click()}
            onUploadFile={(file) => void uploadLocalImage(file)}
            onUploadStageChange={chooseUploadStage}
            petName={petName}
            primitiveReady={Boolean(stage2ReferencePath)}
            serviceOnline={serviceOnline}
            saveRoot={saveRoot}
            stage1Style={stage1Style}
            pickedColor={pickedColor}
            replaceColor={replaceColor}
            selectedMaskReady={Boolean(selectedMaskDataURL)}
            tolerance={tolerance}
            onReplaceColorChange={setReplaceColor}
            onToleranceChange={(value) => {
              setTolerance(value);
              setSelectedMaskDataURL('');
              setPickedColor(null);
            }}
            uploadInputRef={uploadInputRef}
            uploadStage={uploadStage}
            imageJobRunning={Boolean(imageJobId)}
          />
        ) : null}

        {activeStep === 'actions' && selectedActionTarget ? (
          <ActionStep
            activeWindowId={activeModuleWindowIds.actions}
            busy={busy}
            inventory={inventory}
            onConnectPet={(id, value) => connectModulePet('actions', id, value)}
            onCreateWindow={() => createModuleWindow('actions')}
            onDeleteWindow={(id) => deleteModuleWindow('actions', id)}
            onGenerate={() => void startRun('actions', activeActionWindow.petName)}
            onGenerateAction={(actionName, actionPrompt) =>
              void startRun('actions', activeActionWindow.petName, { actionName, actionPrompt })
            }
            onRenameWindow={(id) => renameModuleWindow('actions', id)}
            onSelectTarget={chooseActionTarget}
            onSelectWindow={(id) => setActiveModuleWindowIds((current) => ({ ...current, actions: id }))}
            onSlice={() => void startRun('slice', activeActionWindow.petName)}
            petName={activeActionWindow.petName}
            run={run}
            runHistory={runHistory}
            saveRoot={saveRoot}
            selectedTarget={selectedActionTarget}
            windows={moduleWindows.actions}
          />
        ) : null}

        {activeStep === 'timing' ? (
          <TimingStep
            activeWindowId={activeModuleWindowIds.timing}
            onConnectPet={(id, value) => connectModulePet('timing', id, value)}
            onCreateWindow={() => createModuleWindow('timing')}
            onDeleteWindow={(id) => deleteModuleWindow('timing', id)}
            onMessage={setMessage}
            onRenameWindow={(id) => renameModuleWindow('timing', id)}
            onSelectWindow={(id) => setActiveModuleWindowIds((current) => ({ ...current, timing: id }))}
            onStageChange={setTimingStage}
            petName={activeTimingWindow.petName}
            saveRoot={saveRoot}
            stage={timingStage}
            windows={moduleWindows.timing}
          />
        ) : null}

        {activeStep === 'gifs' ? (
          <GifStep
            activeWindowId={activeModuleWindowIds.gifs}
            busy={busy === 'gif'}
            includeSnapshot={includeSnapshot}
            includeUpload={includeUpload}
            inventory={inventory.filter((item) => STAGES.includes(item.stage))}
            onConnectPet={(id, value) => connectModulePet('gifs', id, value)}
            onCreateWindow={() => createModuleWindow('gifs')}
            onDeleteWindow={(id) => deleteModuleWindow('gifs', id)}
            onIncludeSnapshotChange={setIncludeSnapshot}
            onIncludeUploadChange={setIncludeUpload}
            onMessage={setMessage}
            onQiniuApiKeyChange={setQiniuApiKey}
            onRenameWindow={(id) => renameModuleWindow('gifs', id)}
            onRun={() => void startRun('gif', activeGifWindow.petName)}
            onSelectWindow={(id) => setActiveModuleWindowIds((current) => ({ ...current, gifs: id }))}
            petName={activeGifWindow.petName}
            qiniuApiKey={qiniuApiKey}
            run={run}
            saveRoot={saveRoot}
            windows={moduleWindows.gifs}
          />
        ) : null}

        {activeStep === 'scale' ? (
          <ScaleStep
            activeWindowId={activeModuleWindowIds.scale}
            onConnectPet={(id, value) => connectModulePet('scale', id, value)}
            onCreateWindow={() => createModuleWindow('scale')}
            onDeleteWindow={(id) => deleteModuleWindow('scale', id)}
            onMessage={setMessage}
            onRenameWindow={(id) => renameModuleWindow('scale', id)}
            onSelectWindow={(id) => setActiveModuleWindowIds((current) => ({ ...current, scale: id }))}
            onStageChange={setScaleStage}
            petName={activeScaleWindow.petName}
            saveRoot={saveRoot}
            stage={scaleStage}
            windows={moduleWindows.scale}
          />
        ) : null}
      </section>

      <footer className="workspace-footer">
        <button disabled={activeStepIndex === 0} type="button" onClick={() => goRelative(-1)}>
          <ArrowLeft size={16} /> 上一步
        </button>
        <span>{activeStepIndex + 1} / {FLOW_STEPS.length}</span>
        <button disabled={activeStepIndex === FLOW_STEPS.length - 1} type="button" onClick={() => goRelative(1)}>
          下一步 <ArrowRight size={16} />
        </button>
      </footer>

      {notice ? <div className="toast" role="status">{notice}</div> : null}
    </main>
  );
}

function WindowBar({
  activeId,
  onAdd,
  onConnectPet,
  onDelete,
  onRename,
  onSelect,
  windows,
}: {
  activeId: string;
  onAdd: () => void;
  onConnectPet: (id: string, petName: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onSelect: (id: string) => void;
  windows: Array<{ id: string; petName: string; title: string }>;
}): JSX.Element {
  const activeWindow = windows.find((item) => item.id === activeId) ?? windows[0];

  return (
    <div className="module-window-bar">
      <div className="window-tab-list">
        {windows.map((windowItem) => (
          <div className={windowItem.id === activeId ? 'window-tab active' : 'window-tab'} key={windowItem.id}>
            <button className="window-tab-main" type="button" onClick={() => onSelect(windowItem.id)}>
              <span />{windowItem.title}
            </button>
            <button className="window-icon-button" title="重命名窗口" type="button" onClick={() => onRename(windowItem.id)}>
              <Pencil size={12} />
            </button>
            <button
              className="window-icon-button"
              disabled={windows.length <= 1}
              title="删除窗口"
              type="button"
              onClick={() => onDelete(windowItem.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button className="window-add-button" type="button" onClick={onAdd}>+ 新窗口</button>
      </div>
      <label className="window-pet-link">
        <span>连接动物文件夹</span>
        <input
          list="petpals-existing-animals"
          placeholder="选择已有宠物"
          value={activeWindow?.petName ?? ''}
          onChange={(event) => activeWindow && onConnectPet(activeWindow.id, event.target.value)}
        />
      </label>
    </div>
  );
}

function ImageStep({
  activeImageTaskId,
  activeImageStage,
  busy,
  description,
  fiveStageReady,
  history,
  imageCards,
  imageTasks,
  inventory,
  imageJobRunning,
  iterationPrompt,
  onApplyColorEdit,
  onActiveImageStageChange,
  onCancelGeneration,
  onConnectImageTaskPet,
  onCreateImageTask,
  onDeleteImageTask,
  onDescriptionChange,
  onGeneratePrimitive,
  onGenerateStages,
  onGenerateNextStage,
  onIterationPromptChange,
  onIterate,
  onImagePick,
  onPetNameChange,
  onRestoreHistory,
  onSave,
  onSaveSelectedStage,
  onStage1StyleChange,
  onRenameImageTask,
  onSwitchImageTask,
  onUploadClick,
  onUploadFile,
  onUploadStageChange,
  petName,
  pickedColor,
  primitiveReady,
  replaceColor,
  saveRoot,
  serviceOnline,
  selectedMaskReady,
  stage1Style,
  tolerance,
  onReplaceColorChange,
  onToleranceChange,
  uploadInputRef,
  uploadStage,
}: {
  activeImageTaskId: string;
  activeImageStage: UploadStage;
  busy: string;
  description: string;
  fiveStageReady: boolean;
  history: ImageHistoryItem[];
  imageCards: Array<{ data?: ImageStage; label: string; sourceId: string; stage: string }>;
  imageTasks: ImageTaskSnapshot[];
  inventory: InventoryStage[];
  imageJobRunning: boolean;
  iterationPrompt: string;
  onApplyColorEdit: () => void;
  onActiveImageStageChange: (stage: UploadStage) => void;
  onCancelGeneration: () => void;
  onConnectImageTaskPet: (taskId: string, petName: string) => void;
  onCreateImageTask: () => void;
  onDeleteImageTask: (taskId: string) => void;
  onDescriptionChange: (value: string) => void;
  onGeneratePrimitive: () => void;
  onGenerateStages: () => void;
  onGenerateNextStage: () => void;
  onIterationPromptChange: (value: string) => void;
  onIterate: () => void;
  onImagePick: (event: MouseEvent<HTMLImageElement>, imageUrl: string) => void;
  onPetNameChange: (value: string) => void;
  onRestoreHistory: (item: ImageHistoryItem) => void;
  onSave: () => void;
  onSaveSelectedStage: () => void;
  onStage1StyleChange: (value: Stage1Style) => void;
  onRenameImageTask: (taskId: string) => void;
  onSwitchImageTask: (taskId: string) => void;
  onUploadClick: () => void;
  onUploadFile: (file: File | null) => void;
  onUploadStageChange: (value: UploadStage) => void;
  petName: string;
  pickedColor: RgbColor | null;
  primitiveReady: boolean;
  replaceColor: string;
  saveRoot: string;
  serviceOnline: boolean;
  selectedMaskReady: boolean;
  stage1Style: Stage1Style;
  tolerance: number;
  onReplaceColorChange: (value: string) => void;
  onToleranceChange: (value: number) => void;
  uploadInputRef: MutableRefObject<HTMLInputElement | null>;
  uploadStage: UploadStage;
}): JSX.Element {
  const activeCard = imageCards.find((card) => card.sourceId === activeImageStage);
  const selectedStageReady = Boolean(activeCard?.data?.imagePath);
  const canGenerateNext = selectedStageReady && Number(activeImageStage) < 6;

  return (
    <div className="split-workspace">
      <aside className="settings-panel">
        <div className="section-heading"><Wand2 size={18} /><div><h2>形象生成</h2><p>五阶段基准图</p></div></div>
        {!serviceOnline ? <p className="service-warning">工作台服务已断开，请重新启动 1234 后刷新页面。</p> : null}
        <label className="field-label pet-name-label" htmlFor="pet-name">动物类型</label>
        <input
          className="panel-input pet-name-input"
          id="pet-name"
          placeholder="例：云朵猫 / blue-robin"
          value={petName}
          onChange={(event) => onPetNameChange(event.target.value)}
        />
        <label className="field-label description-field-label" htmlFor="description">外观描述</label>
        <textarea
          className="description-input"
          id="description"
          placeholder="品种、颜色、元素属性、性格气质"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
        <span className="field-label stage1-field-label">Stage 1 形态</span>
        <div className="segmented-control stage1-style-control">
          <button className={stage1Style === 'egg' ? 'selected' : ''} type="button" onClick={() => onStage1StyleChange('egg')}><Egg size={16} /> Egg</button>
          <button className={stage1Style === 'sleep' ? 'selected' : ''} type="button" onClick={() => onStage1StyleChange('sleep')}><Sparkles size={16} /> Sleep</button>
        </div>
        <label className="field-label upload-stage-label" htmlFor="upload-stage">上传到阶段</label>
        <select
          className="stage-select upload-stage-select"
          id="upload-stage"
          value={uploadStage}
          onChange={(event) => onUploadStageChange(event.target.value as UploadStage)}
        >
          {UPLOAD_STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          className="upload-button"
          disabled={!serviceOnline || busy === 'upload-image'}
          type="button"
          onClick={onUploadClick}
        >
          {busy === 'upload-image' ? <Loader2 className="spin" size={17} /> : <UploadCloud size={17} />}
          上传本地图片到所选阶段
        </button>
        <input
          ref={uploadInputRef}
          accept="image/png,image/jpeg,image/webp"
          hidden
          type="file"
          onChange={(event) => onUploadFile(event.target.files?.[0] ?? null)}
        />
        <div className="primary-actions">
          <div className="action-group">
            <button className="generate-stage2-action" type="button" disabled={!serviceOnline || busy === 'primitive'} onClick={onGeneratePrimitive}>
              {busy === 'primitive' ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}生成 Stage 2
            </button>
            <button className="generate-rest-action" type="button" disabled={!primitiveReady || busy === 'stages'} onClick={onGenerateStages}>
              {busy === 'stages' ? <Loader2 className="spin" size={17} /> : <Layers3 size={17} />}生成其余阶段
            </button>
            <button className="secondary-action next-stage-action" type="button" disabled={!canGenerateNext || busy === 'next-stage'} onClick={onGenerateNextStage}>
              {busy === 'next-stage' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}生成下一阶段
            </button>
          </div>
          {imageJobRunning ? (
            <button className="danger-action" type="button" onClick={onCancelGeneration}>
              停止生成
            </button>
          ) : null}
          <div className="action-group">
            <label className="field-label iteration-field-label" htmlFor="iteration-prompt">文字迭代（当前阶段）</label>
            <textarea
              className="iteration-prompt-input"
              id="iteration-prompt"
              placeholder="例：把肚子颜色改得更白，眼睛再大一点"
              value={iterationPrompt}
              onChange={(event) => onIterationPromptChange(event.target.value)}
            />
            <button className="secondary-action iterate-action" type="button" disabled={!selectedStageReady || busy === 'iterate-image'} onClick={onIterate}>
              {busy === 'iterate-image' ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}文字迭代
            </button>
          </div>
          <div className="action-group">
            <button className="accent save-five-action" type="button" disabled={!fiveStageReady || busy === 'save-five'} onClick={onSave}>
              {busy === 'save-five' ? <Loader2 className="spin" size={17} /> : <Save size={17} />}保存五阶段
            </button>
            <button className="single-save save-selected-action" type="button" disabled={!selectedStageReady || busy === 'save-stage'} onClick={onSaveSelectedStage}>
              {busy === 'save-stage' ? <Loader2 className="spin" size={17} /> : <Save size={17} />}保存所选阶段
            </button>
          </div>
        </div>
        <div className="history-panel">
          <p className="history-title">历史记录</p>
          {history.length ? (
            history.slice(0, 8).map((item, index) => (
              <button className="history-item-button" key={`${item.imagePath}-${index}`} type="button" onClick={() => onRestoreHistory(item)}>
                <img alt={item.label} src={item.imageUrl} />
                <span><strong>{item.label}</strong><small>{item.ts}</small></span>
              </button>
            ))
          ) : (
            <p className="history-empty">还没有生成记录</p>
          )}
        </div>
      </aside>
      <div className="content-panel image-content-panel">
        <WindowBar
          activeId={activeImageTaskId}
          onAdd={onCreateImageTask}
          onConnectPet={onConnectImageTaskPet}
          onDelete={onDeleteImageTask}
          onRename={onRenameImageTask}
          onSelect={onSwitchImageTask}
          windows={imageTasks}
        />
        <div className="content-header"><div><p className="eyebrow">{petName || '等待输入动物类型'}</p><h2>阶段形象</h2></div><span className="summary-badge">{inventory.filter((item) => STAGES.includes(item.stage) && item.base).length}/5 已保存</span></div>
        <div className="image-stage-tabs" aria-label="形象阶段页签">
          {UPLOAD_STAGE_OPTIONS.map((option) => {
            const stage = option.value;
            const card = imageCards.find((item) => item.sourceId === stage);
            const saved = Boolean(card && inventory.find((item) => item.stage === card.stage)?.base);
            const status = getStageDisplayStatus(card?.data?.status, saved);
            return (
              <button
                className={activeImageStage === stage ? 'active' : ''}
                key={stage}
                type="button"
                onClick={() => onActiveImageStageChange(stage)}
              >
                <span className={`tab-dot ${status}`} />Stage {stage}
              </button>
            );
          })}
        </div>
        <div className="color-edit-toolbar">
          <span>点击图片选色</span>
          <span className={pickedColor ? 'color-chip picked' : 'color-chip'} style={pickedColor ? { backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})` } : undefined} />
          <span>替换为</span>
          <input aria-label="替换颜色" type="color" value={replaceColor} onChange={(event) => onReplaceColorChange(event.target.value)} />
          <label>
            容差
            <input type="range" min={5} max={120} value={tolerance} onChange={(event) => onToleranceChange(Number(event.target.value))} />
            <strong>{tolerance}</strong>
          </label>
          <button type="button" disabled={!selectedMaskReady || busy === 'color-edit'} onClick={onApplyColorEdit}>
            {busy === 'color-edit' ? <Loader2 className="spin" size={15} /> : <SlidersHorizontal size={15} />}颜色替换
          </button>
        </div>
        <div className="image-stage-grid">
          {imageCards.map((card) => {
            const saved = Boolean(inventory.find((item) => item.stage === card.stage)?.base);
            const status = getStageDisplayStatus(card.data?.status, saved);
            const imageUrl = card.data?.imageUrl ?? (saved ? getAssetUrl(petName, card.stage, saveRoot) : '');
            return (
              <article className={card.sourceId === activeImageStage ? 'image-stage-card active' : 'image-stage-card'} key={`${card.stage}-${card.sourceId}`}>
                <div className="asset-preview">
                  {imageUrl ? <img alt={card.label} src={imageUrl} onClick={(event) => onImagePick(event, imageUrl)} /> : <ImageIcon size={34} />}
                  {status === 'generating' ? <span className="preview-loading"><Loader2 className="spin" /></span> : null}
                </div>
                <div className="asset-caption"><div><strong>{card.label}</strong><small>来源 Tool Stage {card.sourceId}</small></div><span className={getStageBadgeClass(status)}>{getImageStatus(status)}</span></div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionStep({
  activeWindowId,
  busy,
  inventory,
  onConnectPet,
  onCreateWindow,
  onDeleteWindow,
  onGenerate,
  onGenerateAction,
  onRenameWindow,
  onSelectTarget,
  onSelectWindow,
  onSlice,
  petName,
  run,
  runHistory,
  saveRoot,
  selectedTarget,
  windows,
}: {
  activeWindowId: string;
  busy: string;
  inventory: InventoryStage[];
  onConnectPet: (id: string, petName: string) => void;
  onCreateWindow: () => void;
  onDeleteWindow: (id: string) => void;
  onGenerate: () => void;
  onGenerateAction: (actionName: string, actionPrompt: string) => void;
  onRenameWindow: (id: string) => void;
  onSelectTarget: (target: ActionTarget) => void;
  onSelectWindow: (id: string) => void;
  onSlice: () => void;
  petName: string;
  run: RunRecord | null;
  runHistory: RunRecord[];
  saveRoot: string;
  selectedTarget: ActionTarget;
  windows: ModuleWindow[];
}): JSX.Element {
  const selectedInventory = inventory.find((item) => item.stage === selectedTarget.stage);
  const [actionPrompt, setActionPrompt] = useState('');
  const [selectedActionName, setSelectedActionName] = useState(selectedTarget.actions[0] ?? '');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setSelectedActionName(selectedTarget.actions[0] ?? '');
  }, [selectedTarget.id, selectedTarget.actions]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedActionAssets = selectedInventory?.actionAssets[selectedActionName];
  const visibleRunHistory = [run, ...runHistory]
    .filter((item): item is RunRecord => Boolean(item))
    .filter((item) => item.kind === 'actions' || item.kind === 'slice')
    .filter((item) => !petName || item.petName === petName)
    .slice(0, 8);

  return (
    <div className="action-workspace">
      <aside className="stage-rail">
        <p className="rail-label">制作阶段</p>
        {ACTION_TARGETS.map((target) => {
          const targetInventory = inventory.find((item) => item.stage === target.stage);
          const targetComplete = target.actions.every((action) =>
            targetInventory?.singleActions.includes(action),
          );
          return (
            <button className={target.id === selectedTarget.id ? 'active' : ''} key={target.id} type="button" onClick={() => onSelectTarget(target)}>
              <span>{target.style === 'egg' ? <Egg size={16} /> : target.style === 'sleep' ? <Sparkles size={16} /> : <Layers3 size={16} />}</span>
              <span><strong>{target.label}</strong><small>{target.actions.length} 个动作</small></span>
              {targetComplete ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </button>
          );
        })}
      </aside>
      <div className="action-main">
        <WindowBar
          activeId={activeWindowId}
          onAdd={onCreateWindow}
          onConnectPet={onConnectPet}
          onDelete={onDeleteWindow}
          onRename={onRenameWindow}
          onSelect={onSelectWindow}
          windows={windows}
        />
        <div className="content-header">
          <div><p className="eyebrow">{petName} / {selectedTarget.stage}</p><h2>{selectedTarget.label}</h2></div>
          <div className="header-actions">
            <button className="secondary-button" disabled={!selectedInventory?.base || busy === 'slice'} type="button" onClick={onSlice}><Scissors size={16} />仅切帧</button>
            <button className="primary-button" disabled={!selectedInventory?.base || busy === 'actions'} type="button" onClick={onGenerate}>{busy === 'actions' ? <Loader2 className="spin" size={16} /> : <Play size={16} />}生成 raw / 长帧 / 单帧</button>
          </div>
        </div>
        <div className="action-dashboard">
          <section className="base-preview-panel">
            <div className="asset-preview large">{selectedInventory?.base ? <img alt={`${selectedTarget.label} base`} src={getAssetUrl(petName, selectedTarget.stage, saveRoot)} /> : <ImageIcon size={38} />}</div>
            <div className="base-status"><strong>base.png</strong><span className={selectedInventory?.base ? 'state success' : 'state danger'}>{selectedInventory?.base ? '已就绪' : '缺失'}</span></div>
          </section>
          <section className="resource-panel">
            <div className="metric-row">
              <Metric
                label="长帧"
                value={selectedTarget.actions.filter((action) =>
                  selectedInventory?.longFrames.includes(`${action}.png`),
                ).length}
                target={selectedTarget.actions.length}
              />
              <Metric
                label="单帧动作"
                value={selectedTarget.actions.filter((action) =>
                  selectedInventory?.singleActions.includes(action),
                ).length}
                target={selectedTarget.actions.length}
              />
              <Metric label="Timing" value={selectedInventory?.timing ? 1 : 0} target={1} />
            </div>
            <div className="action-list">
              {selectedTarget.actions.map((action) => {
                const ready = selectedInventory?.singleActions.includes(action) ?? false;
                return (
                  <button
                    className={action === selectedActionName ? 'action-chip active' : ready ? 'action-chip ready' : 'action-chip'}
                    key={action}
                    type="button"
                    onClick={() => setSelectedActionName(action)}
                  >
                    {ready ? <Check size={13} /> : <Circle size={12} />}{action}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <section className="action-assets-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">动作产物</p>
              <h3>{selectedActionName || '选择动作'}</h3>
            </div>
            <span className="state">{formatDateTime(selectedActionAssets?.updatedAt)}</span>
          </div>
          <div className="asset-flow-strip">
            <AssetSlot
              href={selectedActionAssets?.raw ? getStageAssetUrl(petName, selectedTarget.stage, `raw_generated/${selectedActionName}.png`, saveRoot) : ''}
              label="Raw"
              step="01"
            />
            <AssetSlot
              href={selectedActionAssets?.longFrame ? getStageAssetUrl(petName, selectedTarget.stage, `长帧/${selectedActionName}.png`, saveRoot) : ''}
              label="长帧"
              step="02"
            />
            <AssetSlot
              href={selectedActionAssets?.frameCount ? getStageAssetUrl(petName, selectedTarget.stage, `单帧/${selectedActionName}/${selectedActionAssets.frames[0] ?? '000.png'}`, saveRoot) : ''}
              label={`单帧 ${selectedActionAssets?.frameCount ?? 0}`}
              step="03"
            />
          </div>
          <div className="action-regenerate">
            <textarea
              placeholder="对这个动作的修改要求，例如：尾巴摆动幅度小一点，角色不要变大，保持睡姿更稳定"
              value={actionPrompt}
              onChange={(event) => setActionPrompt(event.target.value)}
            />
            <button
              className="secondary-button"
              disabled={!selectedInventory?.base || busy === 'actions' || !selectedActionName}
              type="button"
              onClick={() => onGenerateAction(selectedActionName, actionPrompt)}
            >
              <RefreshCw size={16} />按对话重生成该动作
            </button>
          </div>
        </section>
        <section className="run-history-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">运行历史</p>
              <h3>动物 / Stage / 动作耗时</h3>
            </div>
          </div>
          {visibleRunHistory.length ? (
            <div className="run-history-list">
              {visibleRunHistory.map((item) => {
                const elapsed = item.completedAt
                  ? new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()
                  : now - new Date(item.startedAt).getTime();
                return (
                  <div className="run-history-row" key={item.id}>
                    <span className={`run-state ${item.status}`}>{item.status === 'running' ? '运行中' : item.status === 'success' ? '已完成' : '失败'}</span>
                    <strong>{item.petName} / {item.stage ?? '-'} / {item.actionName ?? '全部动作'}</strong>
                    <small>{formatDateTime(item.startedAt)} · {item.status === 'running' ? '已运行' : '耗时'} {formatDuration(elapsed)}</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty-inline">暂无历史生成记录</p>}
        </section>
        <RunLog run={run?.kind === 'actions' || run?.kind === 'slice' ? run : null} />
      </div>
    </div>
  );
}

function AssetSlot({ href, label, step }: { href: string; label: string; step: string }): JSX.Element {
  return (
    <a
      className={href ? 'asset-slot ready' : 'asset-slot'}
      href={href || undefined}
      rel="noreferrer"
      target="_blank"
    >
      <em>{step}</em>
      <span>{href ? <img alt={label} src={href} /> : <ImageIcon size={28} />}</span>
      <strong>{label}</strong>
      <small>{href ? '点击查看' : '未生成'}</small>
    </a>
  );
}

function Metric({ label, target, value }: { label: string; target: number; value: number }): JSX.Element {
  const complete = value >= target;
  return <div className={complete ? 'metric complete' : 'metric'}><span>{label}</span><strong>{value}<small>/{target}</small></strong></div>;
}

function TimingStep({
  activeWindowId,
  onConnectPet,
  onCreateWindow,
  onDeleteWindow,
  onMessage,
  onRenameWindow,
  onSelectWindow,
  onStageChange,
  petName,
  saveRoot,
  stage,
  windows,
}: {
  activeWindowId: string;
  onConnectPet: (id: string, petName: string) => void;
  onCreateWindow: () => void;
  onDeleteWindow: (id: string) => void;
  onMessage: (message: string) => void;
  onRenameWindow: (id: string) => void;
  onSelectWindow: (id: string) => void;
  onStageChange: (stage: string) => void;
  petName: string;
  saveRoot: string;
  stage: string;
  windows: ModuleWindow[];
}): JSX.Element {
  const [actions, setActions] = useState<TimingAction[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [config, setConfig] = useState<TimingConfig | null>(null);
  const [sequenceText, setSequenceText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedAction = actions.find((action) => action.name === selectedName);
  const frameIndex = config?.sequence[cursor % Math.max(config.sequence.length, 1)] ?? 0;

  const chooseAction = useCallback((action: TimingAction) => {
    setSelectedName(action.name);
    setConfig({
      frameDurations: { ...action.timing.frameDurations },
      loop: action.timing.loop,
      sequence: [...action.timing.sequence],
    });
    setSequenceText(action.timing.sequence.join(','));
    setCursor(0);
    setPlaying(false);
  }, []);

  const loadTiming = useCallback(async () => {
    if (!petName.trim()) {
      setActions([]);
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const data = await readJson<{ actions: TimingAction[] }>(
        `/api/animation-workbench/timing?petName=${encodeURIComponent(petName.trim())}&stage=${stage}&${saveRootParam(saveRoot)}`,
      );
      setActions(data.actions);
      if (data.actions[0]) chooseAction(data.actions[0]);
      else {
        setSelectedName('');
        setConfig(null);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '读取 Timing 失败');
    } finally {
      setLoading(false);
    }
  }, [chooseAction, onMessage, petName, saveRoot, stage]);

  useEffect(() => {
    void loadTiming();
  }, [loadTiming]);

  useEffect(() => {
    if (!playing || !config || config.sequence.length === 0) return undefined;
    const currentFrame = config.sequence[cursor % config.sequence.length] ?? 0;
    const timer = window.setTimeout(
      () => setCursor((value) => (value + 1) % config.sequence.length),
      config.frameDurations[String(currentFrame)] ?? 90,
    );
    return () => window.clearTimeout(timer);
  }, [config, cursor, playing]);

  async function saveTiming() {
    if (!selectedAction || !config) return;
    const sequence = sequenceText
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value));
    try {
      const data = await readJson<{ config: TimingConfig }>('/api/animation-workbench/timing', {
        body: JSON.stringify({
          actionName: selectedAction.name,
          config: { ...config, sequence },
          petName: petName.trim(),
          saveRoot,
          stage,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setConfig(data.config);
      setSequenceText(data.config.sequence.join(','));
      setActions((current) =>
        current.map((action) =>
          action.name === selectedAction.name ? { ...action, timing: data.config } : action,
        ),
      );
      onMessage('Timing 已保存');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存 Timing 失败');
    }
  }

  return (
    <div className="native-tool-workspace">
      <aside className="native-tool-rail">
        <div className="section-heading"><Clock3 size={18} /><div><h2>Timing</h2><p>帧顺序与时长</p></div></div>
        <select value={stage} onChange={(event) => onStageChange(event.target.value)}>
          {STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="native-action-list">
          {actions.map((action) => (
            <button className={action.name === selectedName ? 'active' : ''} key={action.name} type="button" onClick={() => chooseAction(action)}>
              <span>{action.name}</span><small>{action.frameCount} 帧</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="native-tool-main">
        <WindowBar
          activeId={activeWindowId}
          onAdd={onCreateWindow}
          onConnectPet={onConnectPet}
          onDelete={onDeleteWindow}
          onRename={onRenameWindow}
          onSelect={onSelectWindow}
          windows={windows}
        />
        <div className="content-header">
          <div><p className="eyebrow">{petName || '等待输入动物类型'} / {stage}</p><h2>{selectedAction?.name ?? '暂无单帧动作'}</h2></div>
          <div className="header-actions">
            <button className="secondary-button" disabled={loading} type="button" onClick={() => void loadTiming()}><RefreshCw size={16} />刷新</button>
            <button className="primary-button" disabled={!config} type="button" onClick={() => void saveTiming()}><Save size={16} />保存 Timing</button>
          </div>
        </div>
        {selectedAction && config ? (
          <div className="timing-editor">
            <div className="timing-preview">
              <div className="asset-preview large">
                <img alt={`${selectedAction.name} frame ${frameIndex}`} src={selectedAction.frames[frameIndex]} />
              </div>
              <div className="preview-controls">
                <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? '暂停' : '播放'}</button>
                <span>Frame {frameIndex} · {cursor + 1}/{config.sequence.length}</span>
              </div>
            </div>
            <div className="timing-settings">
              <label><span>帧序列</span><input value={sequenceText} onChange={(event) => setSequenceText(event.target.value)} /></label>
              <label className="toggle-row compact"><span><strong>循环播放</strong></span><input checked={config.loop} type="checkbox" onChange={(event) => setConfig({ ...config, loop: event.target.checked })} /></label>
              <div className="frame-duration-grid">
                {Array.from({ length: selectedAction.frameCount }, (_, index) => (
                  <label key={index}><span>#{index}</span><input min="20" max="5000" type="number" value={config.frameDurations[String(index)] ?? 90} onChange={(event) => setConfig({ ...config, frameDurations: { ...config.frameDurations, [String(index)]: Number(event.target.value) } })} /><small>ms</small></label>
                ))}
              </div>
            </div>
          </div>
        ) : <div className="empty-tool-state">{loading ? <Loader2 className="spin" /> : '请先完成当前 Stage 的动作单帧制作'}</div>}
      </section>
    </div>
  );
}

function ScaleStep({
  activeWindowId,
  onConnectPet,
  onCreateWindow,
  onDeleteWindow,
  onMessage,
  onRenameWindow,
  onSelectWindow,
  onStageChange,
  petName,
  saveRoot,
  stage,
  windows,
}: {
  activeWindowId: string;
  onConnectPet: (id: string, petName: string) => void;
  onCreateWindow: () => void;
  onDeleteWindow: (id: string) => void;
  onMessage: (message: string) => void;
  onRenameWindow: (id: string) => void;
  onSelectWindow: (id: string) => void;
  onStageChange: (stage: string) => void;
  petName: string;
  saveRoot: string;
  stage: string;
  windows: ModuleWindow[];
}): JSX.Element {
  const [actions, setActions] = useState<ScaleAction[]>([]);
  const [species, setSpecies] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [actionTransforms, setActionTransforms] = useState<Record<string, TransformConfig>>({});
  const [stageTransform, setStageTransform] = useState<TransformConfig>({ scale: 1, x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const selectedAction = actions.find((action) => action.actionCode === selectedName);
  const actionTransform = actionTransforms[selectedName] ?? { scale: 1, x: 0, y: 0 };
  const [previewPresetKey, setPreviewPresetKey] = useState(SCALE_PRESETS[0]?.key ?? 'student-detail');
  const [internalMoveX, setInternalMoveX] = useState(0);
  const previewPreset = SCALE_PRESETS.find((preset) => preset.key === previewPresetKey) ?? SCALE_PRESETS[0];
  const selectedIndex = actions.findIndex((action) => action.actionCode === selectedName);
  const previousAction = selectedIndex > 0 ? actions[selectedIndex - 1] : null;
  const previousTransform = previousAction
    ? actionTransforms[previousAction.actionCode] ?? previousAction.transform
    : null;
  const currentMetrics = previewPreset
    ? getScalePreviewMetrics(actionTransform, stageTransform, previewPreset)
    : null;
  const previousMetrics = previousTransform && previewPreset
    ? getScalePreviewMetrics(previousTransform, stageTransform, previewPreset)
    : null;

  const loadScale = useCallback(async () => {
    if (!petName.trim()) {
      setActions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await readJson<{ actions: ScaleAction[]; species: string; stageTransform: TransformConfig }>(
        `/api/animation-workbench/scale?petName=${encodeURIComponent(petName.trim())}&stage=${stage}&${saveRootParam(saveRoot)}`,
      );
      setActions(data.actions);
      setSpecies(data.species);
      setStageTransform(data.stageTransform);
      setActionTransforms(Object.fromEntries(data.actions.map((action) => [action.actionCode, action.transform])));
      setSelectedName(data.actions[0]?.actionCode ?? '');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '读取缩放配置失败');
    } finally {
      setLoading(false);
    }
  }, [onMessage, petName, saveRoot, stage]);

  useEffect(() => {
    void loadScale();
  }, [loadScale]);

  async function saveScale() {
    try {
      await readJson('/api/animation-workbench/scale', {
        body: JSON.stringify({ actionTransforms, species, stage, stageTransform }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      onMessage('动作缩放配置已保存');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存缩放配置失败');
    }
  }

  function alignToPreviousAction() {
    if (!selectedName || !previousTransform) return;
    setActionTransforms({
      ...actionTransforms,
      [selectedName]: { ...previousTransform },
    });
  }

  function matchPreviousActionSize() {
    if (!selectedName || !previousTransform) return;
    setActionTransforms({
      ...actionTransforms,
      [selectedName]: { ...actionTransform, scale: previousTransform.scale },
    });
  }

  return (
    <div className="native-tool-workspace scale-workspace">
      <aside className="native-tool-rail">
        <div className="section-heading"><SlidersHorizontal size={18} /><div><h2>动作缩放</h2><p>Scale 与偏移</p></div></div>
        <select value={stage} onChange={(event) => onStageChange(event.target.value)}>
          {STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="native-action-list">
          {actions.map((action) => (
            <button className={action.actionCode === selectedName ? 'active' : ''} key={action.actionCode} type="button" onClick={() => setSelectedName(action.actionCode)}>{action.actionCode}</button>
          ))}
        </div>
      </aside>
      <section className="native-tool-main">
        <WindowBar
          activeId={activeWindowId}
          onAdd={onCreateWindow}
          onConnectPet={onConnectPet}
          onDelete={onDeleteWindow}
          onRename={onRenameWindow}
          onSelect={onSelectWindow}
          windows={windows}
        />
        <div className="content-header">
          <div><p className="eyebrow">{species || petName || '等待输入动物类型'} / {stage}</p><h2>{selectedAction?.actionCode ?? '暂无 GIF 动作'}</h2></div>
          <div className="header-actions">
            <button className="secondary-button" disabled={loading} type="button" onClick={() => void loadScale()}><RefreshCw size={16} />刷新</button>
            <button className="primary-button" disabled={!selectedAction} type="button" onClick={() => void saveScale()}><Save size={16} />保存配置</button>
          </div>
        </div>
        {selectedAction ? (
          <div className="scale-editor scale-debug-editor">
            <div className="scale-preview-column">
              <div className="scale-preview-toolbar">
                <label>
                  <span>前端展示场景</span>
                  <select
                    value={previewPresetKey}
                    onChange={(event) => setPreviewPresetKey(event.target.value)}
                  >
                    {SCALE_PRESETS.map((preset) => (
                      <option key={preset.key} value={preset.key}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>前端内部移动 x</span>
                  <input
                    disabled={previewPreset?.disableInternalPatrol}
                    max={220}
                    min={-220}
                    type="number"
                    value={previewPreset?.disableInternalPatrol ? 0 : internalMoveX}
                    onChange={(event) => setInternalMoveX(Number(event.target.value))}
                  />
                </label>
              </div>
              <div
                className="scale-preview-stage scale-overlay-stage"
                style={{ height: Math.max((previewPreset?.size ?? 320) + 88, 360) }}
              >
                <div
                  className="scale-preview-viewport"
                  style={{ height: previewPreset?.size ?? 320, width: previewPreset?.size ?? 320 }}
                >
                  {previousAction && previousMetrics ? (
                    <img
                      alt={`上一动作 ${previousAction.actionCode}`}
                      className="previous"
                      src={previousAction.gifUrl}
                      style={{
                        height: previousMetrics.finalRenderSize,
                        left: '50%',
                        marginLeft: previousMetrics.marginLeft,
                        marginTop: previousMetrics.marginTop,
                        top: '50%',
                        transform: `translateX(${previewPreset?.disableInternalPatrol ? 0 : internalMoveX}px)`,
                        width: previousMetrics.finalRenderSize,
                      }}
                    />
                  ) : null}
                  {currentMetrics ? (
                    <img
                      alt={selectedAction.actionCode}
                      className="current"
                      src={selectedAction.gifUrl}
                      style={{
                        height: currentMetrics.finalRenderSize,
                        left: '50%',
                        marginLeft: currentMetrics.marginLeft,
                        marginTop: currentMetrics.marginTop,
                        top: '50%',
                        transform: `translateX(${previewPreset?.disableInternalPatrol ? 0 : internalMoveX}px)`,
                        width: currentMetrics.finalRenderSize,
                      }}
                    />
                  ) : null}
                </div>
                <span className="scale-preview-label previous">
                  上一动作：{previousAction?.actionCode ?? '无'}
                </span>
                <span className="scale-preview-label current">
                  当前动作：{selectedAction.actionCode}
                </span>
              </div>
              <div className="scale-action-strip">
                {actions.map((action) => {
                  const transform = actionTransforms[action.actionCode] ?? action.transform;
                  const metrics = previewPreset
                    ? getScalePreviewMetrics(transform, stageTransform, previewPreset)
                    : null;
                  return (
                    <button
                      className={action.actionCode === selectedName ? 'active' : ''}
                      key={action.actionCode}
                      type="button"
                      onClick={() => setSelectedName(action.actionCode)}
                    >
                      <span>{action.actionCode}</span>
                      <strong>{metrics?.finalRenderSize ?? 0}px</strong>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="scale-controls">
              <section className="scale-align-tools">
                <h3>上一动作对齐</h3>
                <div>
                  <button
                    className="secondary-button"
                    disabled={!previousTransform}
                    type="button"
                    onClick={alignToPreviousAction}
                  >
                    对齐上一动作
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!previousTransform}
                    type="button"
                    onClick={matchPreviousActionSize}
                  >
                    只匹配大小
                  </button>
                </div>
                <p>蓝色虚线是上一动作，绿色是当前动作；保存后同步 JSON 和 TS 配置。</p>
              </section>
              <TransformEditor label="当前动作" value={actionTransform} onChange={(value) => setActionTransforms({ ...actionTransforms, [selectedName]: value })} />
              <TransformEditor label="当前 Stage 整体" value={stageTransform} onChange={setStageTransform} />
            </div>
          </div>
        ) : <div className="empty-tool-state">{loading ? <Loader2 className="spin" /> : '请先生成当前 Stage 的 GIF'}</div>}
      </section>
    </div>
  );
}

function TransformEditor({ label, onChange, value }: { label: string; onChange: (value: TransformConfig) => void; value: TransformConfig }): JSX.Element {
  return (
    <section className="transform-editor">
      <h3>{label}</h3>
      <label><span>缩放</span><input min="0.5" max="2" step="0.01" type="range" value={value.scale} onChange={(event) => onChange({ ...value, scale: Number(event.target.value) })} /><input min="0.5" max="2" step="0.01" type="number" value={value.scale} onChange={(event) => onChange({ ...value, scale: Number(event.target.value) })} /></label>
      <label><span>X</span><input type="number" value={value.x} onChange={(event) => onChange({ ...value, x: Number(event.target.value) })} /></label>
      <label><span>Y</span><input type="number" value={value.y} onChange={(event) => onChange({ ...value, y: Number(event.target.value) })} /></label>
    </section>
  );
}

function createDefaultSpeciesForm(petName: string): SpeciesForm {
  return {
    code: petName.trim(),
    description: petName.trim() ? `${petName.trim()}宠物动画资源` : '',
    isLegendary: true,
    name: petName.trim(),
    originstatus: 'sleep',
    sortOrder: 99,
  };
}

function GifStep({
  activeWindowId,
  busy,
  includeSnapshot,
  includeUpload,
  inventory,
  onConnectPet,
  onCreateWindow,
  onDeleteWindow,
  onIncludeSnapshotChange,
  onIncludeUploadChange,
  onMessage,
  onQiniuApiKeyChange,
  onRenameWindow,
  onRun,
  onSelectWindow,
  petName,
  qiniuApiKey,
  run,
  saveRoot,
  windows,
}: {
  activeWindowId: string;
  busy: boolean;
  includeSnapshot: boolean;
  includeUpload: boolean;
  inventory: InventoryStage[];
  onConnectPet: (id: string, petName: string) => void;
  onCreateWindow: () => void;
  onDeleteWindow: (id: string) => void;
  onIncludeSnapshotChange: (value: boolean) => void;
  onIncludeUploadChange: (value: boolean) => void;
  onMessage: (message: string) => void;
  onQiniuApiKeyChange: (value: string) => void;
  onRenameWindow: (id: string) => void;
  onRun: () => void;
  onSelectWindow: (id: string) => void;
  petName: string;
  qiniuApiKey: string;
  run: RunRecord | null;
  saveRoot: string;
  windows: ModuleWindow[];
}): JSX.Element {
  const [speciesCheck, setSpeciesCheck] = useState<SpeciesCheckResult | null>(null);
  const [speciesForm, setSpeciesForm] = useState<SpeciesForm>(() => createDefaultSpeciesForm(petName));
  const [checkingSpecies, setCheckingSpecies] = useState(false);
  const [creatingSpecies, setCreatingSpecies] = useState(false);

  const trimmedPetName = petName.trim();
  const needsSpeciesSetup = includeSnapshot && trimmedPetName && speciesCheck && !speciesCheck.exists;
  const canRunGif =
    !busy && (!includeUpload || qiniuApiKey.trim()) && (!includeSnapshot || speciesCheck?.exists === true);

  const refreshSpeciesCheck = useCallback(async () => {
    if (!trimmedPetName) {
      setSpeciesCheck(null);
      return;
    }
    setCheckingSpecies(true);
    try {
      const result = await readJson<SpeciesCheckResult>(
        `/api/animation-workbench/species/check?petName=${encodeURIComponent(trimmedPetName)}`,
      );
      setSpeciesCheck(result);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '检测 species 失败');
    } finally {
      setCheckingSpecies(false);
    }
  }, [onMessage, trimmedPetName]);

  useEffect(() => {
    setSpeciesForm(createDefaultSpeciesForm(trimmedPetName));
  }, [trimmedPetName]);

  useEffect(() => {
    if (includeSnapshot) void refreshSpeciesCheck();
  }, [includeSnapshot, refreshSpeciesCheck]);

  async function createSpecies() {
    if (!trimmedPetName) {
      onMessage('请先连接动物文件夹');
      return;
    }
    setCreatingSpecies(true);
    try {
      const result = await readJson<{
        code: string;
        database?: SpeciesCheckResult['database'];
        name: string;
        snapshotUpdated: boolean;
      }>('/api/animation-workbench/species/create', {
        body: JSON.stringify({
          ...speciesForm,
          petName: trimmedPetName,
          saveRoot,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      await refreshSpeciesCheck();
      const dbText = result.database?.reachable
        ? '本地数据库已写入'
        : `snapshot 已写入，本地数据库未连通：${result.database?.error ?? '未知原因'}`;
      onMessage(`species「${result.name}」已补齐，${dbText}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '创建 species 失败');
    } finally {
      setCreatingSpecies(false);
    }
  }

  return (
    <div className="gif-workspace">
      <section className="gif-config-panel">
        <div className="section-heading"><Film size={18} /><div><h2>GIF 生成</h2><p>本地打包与资源同步</p></div></div>
        <label className="toggle-row"><span><UploadCloud size={17} /><span><strong>上传 CDN</strong><small>生成后更新 URL 清单</small></span></span><input checked={includeUpload} type="checkbox" onChange={(event) => onIncludeUploadChange(event.target.checked)} /></label>
        {includeUpload ? (
          <label className="qiniu-key-field">
            <span>七牛 API Key</span>
            <input
              value={qiniuApiKey}
              onChange={(event) => onQiniuApiKeyChange(event.target.value)}
            />
          </label>
        ) : null}
        <label className="toggle-row"><span><Database size={17} /><span><strong>同步 Snapshot</strong><small>更新 URL、时长和循环配置</small></span></span><input checked={includeSnapshot} type="checkbox" onChange={(event) => onIncludeSnapshotChange(event.target.checked)} /></label>
        {includeSnapshot ? (
          <section className={needsSpeciesSetup ? 'species-setup missing' : 'species-setup'}>
            <div className="species-setup-head">
              <span>{checkingSpecies ? <Loader2 className="spin" size={15} /> : speciesCheck?.exists ? <CheckCircle2 size={15} /> : <Database size={15} />}</span>
              <div>
                <strong>{speciesCheck?.exists ? 'species 已就绪' : 'species 检测'}</strong>
                <small>
                  {speciesCheck?.exists
                    ? `${speciesCheck.code ?? trimmedPetName} 可同步 Snapshot`
                    : trimmedPetName
                      ? '检测到新动物，需要先补齐数据库配置'
                      : '请先连接动物文件夹'}
                </small>
              </div>
              <button className="ghost-button" disabled={checkingSpecies || !trimmedPetName} type="button" onClick={() => void refreshSpeciesCheck()}>
                <RefreshCw size={13} />检测
              </button>
            </div>
            {needsSpeciesSetup ? (
              <div className="species-form">
                <label><span>species code</span><input value={speciesForm.code} onChange={(event) => setSpeciesForm({ ...speciesForm, code: event.target.value })} /></label>
                <label><span>展示名称</span><input value={speciesForm.name} onChange={(event) => setSpeciesForm({ ...speciesForm, name: event.target.value })} /></label>
                <label><span>初始状态</span><select value={speciesForm.originstatus} onChange={(event) => setSpeciesForm({ ...speciesForm, originstatus: event.target.value === 'egg' ? 'egg' : 'sleep' })}><option value="sleep">sleep 睡眠</option><option value="egg">egg 蛋形态</option></select></label>
                <label><span>排序</span><input min="0" type="number" value={speciesForm.sortOrder} onChange={(event) => setSpeciesForm({ ...speciesForm, sortOrder: Number(event.target.value) })} /></label>
                <label className="species-form-check"><input checked={speciesForm.isLegendary} type="checkbox" onChange={(event) => setSpeciesForm({ ...speciesForm, isLegendary: event.target.checked })} /><span>标记为神兽 / legendary</span></label>
                <label className="species-form-wide"><span>描述</span><textarea value={speciesForm.description} onChange={(event) => setSpeciesForm({ ...speciesForm, description: event.target.value })} /></label>
                <button className="primary-button wide" disabled={creatingSpecies || !speciesForm.code.trim() || !speciesForm.name.trim()} type="button" onClick={() => void createSpecies()}>
                  {creatingSpecies ? <Loader2 className="spin" size={15} /> : <Database size={15} />}补齐 species 并写入数据库
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        <button className="primary-button wide" disabled={!canRunGif} type="button" onClick={onRun}>{busy ? <Loader2 className="spin" size={17} /> : <Film size={17} />}开始生成 GIF</button>
      </section>
      <section className="gif-status-panel">
        <WindowBar
          activeId={activeWindowId}
          onAdd={onCreateWindow}
          onConnectPet={onConnectPet}
          onDelete={onDeleteWindow}
          onRename={onRenameWindow}
          onSelect={onSelectWindow}
          windows={windows}
        />
        <div className="content-header"><div><p className="eyebrow">Output</p><h2>阶段产物</h2></div></div>
        <div className="gif-stage-list">
          {inventory.map((item) => (
            <div className="gif-stage-row" key={item.stage}><strong>{item.stage}</strong><span>{item.singleActions.length} 个单帧动作</span><span>{item.gifs.length} 个 GIF</span>{item.gifs.length > 0 ? <CheckCircle2 size={17} /> : <Circle size={17} />}</div>
          ))}
        </div>
        <RunLog run={run?.kind === 'gif' ? run : null} />
      </section>
    </div>
  );
}

function RunLog({ run }: { run: RunRecord | null }): JSX.Element {
  return (
    <section className="run-log">
      <div className="run-log-header"><span><Film size={15} />运行日志</span>{run ? <span className={`run-state ${run.status}`}>{run.status === 'running' ? '运行中' : run.status === 'success' ? '已完成' : '失败'}</span> : null}</div>
      {run ? <pre>{run.logs.join('\n') || '任务已进入队列...'}</pre> : <p>暂无运行记录</p>}
    </section>
  );
}
