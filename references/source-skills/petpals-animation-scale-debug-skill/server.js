#!/usr/bin/env node
"use strict";

const { execFile } = require("node:child_process");
const { createServer } = require("node:http");
const { createReadStream } = require("node:fs");
const { access, readFile, stat, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3521);
const HOST = "127.0.0.1";
const PROJECT_ROOT = "<skill root>";
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "apps/api/public");
const CONFIG_CANDIDATES = [
  path.join(
    PROJECT_ROOT,
    "apps/teacher-web/src/components/pet-animation-scale-config.json",
  ),
];
const CONFIG_TS_CANDIDATES = [
  path.join(
    PROJECT_ROOT,
    "apps/teacher-web/src/components/pet-animation-scale-config.ts",
  ),
];

const STAGE_SCALE_KEY = "__stageScale";
const CONFIG_BASE_SIZE = 320;
const CONFIG_BASE_RENDER_SIZE = Math.round(CONFIG_BASE_SIZE * 0.72);
const EXTRA_SPECIES_ALIASES = new Map([
  ["dog", ["小狗", "狗", "犬"]],
  ["tiger", ["小老虎", "老虎", "虎"]],
  ["hamster", ["小仓鼠", "仓鼠"]],
  ["blue-robin", ["blue robin", "蓝知更鸟", "知更鸟", "小鸟", "鸟"]],
  ["whale", ["小鲸鱼", "鲸鱼", "鲸"]],
]);

let configPathCache = null;
let configTsPathCache = null;

function normalizeTransform(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { scale: value, x: 0, y: 0 };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { scale: 1, x: 0, y: 0 };
  }

  return {
    scale:
      typeof value.scale === "number" && Number.isFinite(value.scale)
        ? value.scale
        : 1,
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(html);
}

async function sendLocalPublicFile(res, pathname) {
  const decodedPathname = decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_ROOT, `.${decodedPathname}`);
  const publicRoot = path.resolve(PUBLIC_ROOT);

  if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
    sendJson(res, 403, { message: "Forbidden" });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(res, 404, { message: "Not Found" });
      return;
    }
  } catch {
    sendJson(res, 404, { message: "Not Found" });
    return;
  }

  res.writeHead(200, {
    "Cache-Control": "public, max-age=60",
    "Content-Type": filePath.endsWith(".gif")
      ? "image/gif"
      : filePath.endsWith(".png")
        ? "image/png"
        : "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function getConfigPath() {
  if (configPathCache) return configPathCache;

  for (const candidate of CONFIG_CANDIDATES) {
    try {
      await access(candidate);
      configPathCache = candidate;
      return configPathCache;
    } catch {
      // 调参工具在不同分支里目录名不一致，逐个探测可以避免保存到不存在的旧路径。
    }
  }

  configPathCache = CONFIG_CANDIDATES[0];
  return configPathCache;
}

async function getConfigTsPath() {
  if (configTsPathCache) return configTsPathCache;

  for (const candidate of CONFIG_TS_CANDIDATES) {
    try {
      await access(candidate);
      configTsPathCache = candidate;
      return configTsPathCache;
    } catch {
      // PetPals 前端存在 TS 内联配置；如果分支没有该文件则跳过同步。
    }
  }

  return null;
}

async function readConfig() {
  try {
    const raw = await readFile(await getConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

async function saveConfig(config) {
  await writeFile(
    await getConfigPath(),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  const configTsPath = await getConfigTsPath();
  if (configTsPath) {
    await writeFile(configTsPath, serializeTsConfig(config), "utf8");
  }
}

function serializeTsConfig(config) {
  return `export interface PetAnimationTransformConfig {
  scale?: number;
  x?: number;
  y?: number;
}

export type PetAnimationConfigValue = number | PetAnimationTransformConfig;

export type PetAnimationScaleConfig = Record<
  string,
  | Record<
      string,
      Record<string, PetAnimationConfigValue | undefined> | undefined
    >
  | undefined
>;

// 缩放系数由 pet-animation-scale-config.json 固化而来，避免生产包依赖 JSON import。
export const PET_ANIMATION_SCALE_CONFIG = ${JSON.stringify(config, null, 2)} as PetAnimationScaleConfig;
`;
}

function mysqlQuery(sql) {
  const container = process.env.MYSQL_CONTAINER || "petpals-local-mysql-1";
  const user = process.env.MYSQL_USER || "petpals";
  const password = process.env.MYSQL_PASSWORD || "petpals";
  const database = process.env.MYSQL_DATABASE || "petpals";

  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      [
        "exec",
        container,
        "mysql",
        "--default-character-set=utf8mb4",
        `-u${user}`,
        `-p${password}`,
        "-D",
        database,
        "--batch",
        "--raw",
        "--skip-column-names",
        "-e",
        sql,
      ],
      { maxBuffer: 1024 * 1024 * 8 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function normalizeSpeciesInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function speciesAliases(species) {
  const values = new Set([species.code, species.name]);
  for (const alias of EXTRA_SPECIES_ALIASES.get(species.code) || []) {
    values.add(alias);
  }

  if (species.name?.startsWith("小") && species.name.length > 1) {
    values.add(species.name.slice(1));
  }

  return Array.from(values).filter(Boolean);
}

async function getSpeciesList() {
  const sql = `
    SELECT code, name
    FROM pet_species
    WHERE deleted_at IS NULL
    ORDER BY id;
  `;
  const stdout = await mysqlQuery(sql);
  const rows = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, name] = line.split("\t");
      return {
        aliases: [],
        code,
        name: name || code,
      };
    })
    .filter((item) => item.code);

  return rows.map((item) => ({
    ...item,
    aliases: speciesAliases(item),
  }));
}

async function resolveSpeciesCode(input) {
  const speciesList = await getSpeciesList();
  const normalizedInput = normalizeSpeciesInput(input);
  const matched = speciesList.find((species) =>
    speciesAliases(species).some(
      (alias) => normalizeSpeciesInput(alias) === normalizedInput,
    ),
  );

  return matched?.code || null;
}

async function getAvailableStageNumbers() {
  const stdout = await mysqlQuery(`
    SELECT DISTINCT stage_number
    FROM pet_action_resources
    WHERE deleted_at IS NULL
    ORDER BY stage_number;
  `);

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => Number(line.trim()))
    .filter((stage) => Number.isInteger(stage) && stage > 0);
}

async function getActions(speciesInput, stage) {
  const stageNumber = Number(stage);
  const species = await resolveSpeciesCode(speciesInput);
  if (
    !species ||
    !Number.isInteger(stageNumber) ||
    stageNumber < 1
  ) {
    throw new Error("Invalid species or stage");
  }

  const sql = `
    SELECT par.action_code, COALESCE(par.gif_url, ''), par.duration_ms, par.is_loop
    FROM pet_action_resources par
    JOIN pet_species ps ON ps.id = par.species_id
    WHERE ps.code = ${sqlString(species)}
      AND par.stage_number = ${stageNumber}
      AND par.deleted_at IS NULL
    ORDER BY FIELD(par.action_code, 'idle', 'eat', 'failed', 'jumping', 'levelup', 'walk_left', 'walk_right', 'waving'), par.action_code;
  `;
  const stdout = await mysqlQuery(sql);
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [actionCode, gifUrl, durationMs, isLoop] = line.split("\t");
      return {
        actionCode,
        durationMs: Number(durationMs),
        gifUrl,
        isLoop: isLoop === "1",
        source: "database",
      };
    });
}

function pageHtml(initialSpecies = "", initialStage = "stage1") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PetPals 动作缩放调试</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --border: #d9e2ec;
        --ink: #162033;
        --muted: #667085;
        --panel: #ffffff;
        --soft: #f6f8fb;
        --primary: #f97316;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f7f8fb; color: var(--ink); }
      header {
        align-items: center;
        background: #fff;
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 14px 18px;
      }
      h1 { font-size: 18px; margin: 0; }
      main { display: grid; gap: 14px; grid-template-columns: 320px 1fr; padding: 16px; }
      label { color: var(--muted); display: block; font-size: 12px; margin: 0 0 6px; }
      select, input[type="number"] {
        border: 1px solid var(--border);
        border-radius: 6px;
        font: inherit;
        padding: 9px 10px;
        width: 100%;
      }
      button {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        padding: 9px 10px;
      }
      button.active { border-color: var(--primary); color: var(--primary); font-weight: 700; }
      button.primary { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 700; }
      .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
      .stack { display: grid; gap: 12px; }
      .row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
      .actions { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
      .status { color: var(--muted); font-size: 13px; }
      .overlay-stage {
        background:
          linear-gradient(to top, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0.18) 2px, transparent 2px),
          #fff;
        border: 1px solid var(--border);
        border-radius: 8px;
        height: var(--stage-height, 408px);
        overflow: hidden;
        position: relative;
      }
      .teacher-viewport {
        border-bottom: 2px dashed rgba(129, 140, 248, 0.5);
        border-left: 2px dashed rgba(129, 140, 248, 0.5);
        border-right: 2px dashed rgba(129, 140, 248, 0.5);
        height: var(--viewport-size, 320px);
        left: 50%;
        pointer-events: none;
        position: absolute;
        top: 20px;
        transform: translateX(-50%);
        width: var(--viewport-size, 320px);
      }
      .stage-label {
        background: rgba(255,255,255,0.88);
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 12px;
        left: 10px;
        line-height: 1.35;
        max-width: calc(50% - 20px);
        overflow-wrap: anywhere;
        padding: 4px 8px;
        position: absolute;
        top: 10px;
        white-space: pre-wrap;
      }
      .stage-label.current { left: auto; right: 10px; }
      .pet-img {
        display: block;
        height: var(--render-size);
        left: calc(50% + var(--movement-x, 0px));
        margin-left: var(--margin-left);
        margin-top: var(--margin-top);
        object-fit: contain;
        position: absolute;
        top: 50%;
        width: var(--render-size);
      }
      .pet-img.previous {
        filter: drop-shadow(0 0 0 #2563eb);
        opacity: 0.42;
        outline: 2px dashed rgba(37, 99, 235, 0.62);
        outline-offset: -2px;
      }
      .pet-img.current {
        opacity: 0.92;
        z-index: 2;
      }
      .strip { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); }
      .mini {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 8px;
        height: 160px;
        overflow: hidden;
        position: relative;
      }
      .mini-viewport {
        height: 132px;
        left: 50%;
        pointer-events: none;
        position: absolute;
        top: 8px;
        transform: translateX(-50%);
        width: 132px;
      }
      .mini img {
        display: block;
        height: var(--mini-size);
        left: 50%;
        margin-left: var(--mini-margin-left);
        margin-top: var(--mini-margin-top);
        object-fit: contain;
        position: absolute;
        top: 50%;
        width: var(--mini-size);
      }
      .mini span {
        background: rgba(255,255,255,0.9);
        border-radius: 999px;
        bottom: 6px;
        font-size: 11px;
        left: 6px;
        padding: 3px 6px;
        position: absolute;
      }
      .slider { display: grid; gap: 10px; grid-template-columns: 1fr 84px; }
      .triple { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .quad { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      input[type="range"] { width: 100%; }
      .hint { color: #8a4b16; font-size: 12px; line-height: 1.5; }
      @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <header>
      <h1>PetPals 动作缩放调试</h1>
      <div class="status" id="status">加载中...</div>
    </header>
    <main>
      <section class="panel stack">
        <div class="row">
          <div>
            <label for="species">动物</label>
            <select id="species"></select>
          </div>
          <div>
            <label for="stage">stage</label>
            <select id="stage"></select>
          </div>
        </div>
        <div>
          <label for="previewPreset">前端展示场景</label>
          <select id="previewPreset"></select>
        </div>
        <div>
          <label>前端内部移动 x</label>
          <div class="quad">
            <input id="movementX" max="220" min="-220" step="1" type="number" />
            <button id="leftMovementBtn" type="button">左边</button>
            <button id="centerMovementBtn" type="button">中心</button>
            <button id="rightMovementBtn" type="button">右边</button>
          </div>
        </div>
        <div>
          <label>动作</label>
          <div class="actions" id="actions"></div>
        </div>
        <div>
          <label for="scale">当前动作缩放</label>
          <div class="slider">
            <input id="scale" max="2" min="0.5" step="0.01" type="range" />
            <input id="scaleNumber" max="2" min="0.5" step="0.01" type="number" />
          </div>
        </div>
        <div>
          <label>当前动作位移</label>
          <div class="triple">
            <input id="actionX" max="160" min="-160" step="1" type="number" />
            <input id="actionY" max="160" min="-160" step="1" type="number" />
            <button id="resetActionOffsetBtn" type="button">重置位移</button>
          </div>
        </div>
        <div>
          <label for="stageScale">当前 stage 整体缩放</label>
          <div class="slider">
            <input id="stageScale" max="2" min="0.5" step="0.01" type="range" />
            <input id="stageScaleNumber" max="2" min="0.5" step="0.01" type="number" />
          </div>
        </div>
        <div>
          <label>当前 stage 整体位移</label>
          <div class="triple">
            <input id="stageX" max="160" min="-160" step="1" type="number" />
            <input id="stageY" max="160" min="-160" step="1" type="number" />
            <button id="resetStageOffsetBtn" type="button">重置位移</button>
          </div>
        </div>
        <div class="row">
          <button id="resetBtn" type="button">重置动作 1</button>
          <button id="resetStageBtn" type="button">重置 stage 1</button>
        </div>
        <div>
          <button class="primary" id="saveBtn" type="button">保存 JSON + TS</button>
        </div>
        <p class="hint">
          最终尺寸 = 前端 petSize × jump/levelup 通用倍率 × 当前动作缩放 × 当前 stage 整体缩放；最终位移 =
          当前动作位移 + 当前 stage 整体位移，并按前端 petRenderSize / 230 换算。内部移动 x 只模拟前端巡逻容器 translateX，不会写入 JSON。
          保存会同步更新 JSON 和 TS 配置，外网发布前仍要确认构建使用的是最新 TS 配置。
        </p>
      </section>
      <section class="stack">
        <div class="overlay-stage" id="overlayStage">
          <span class="stage-label" id="previousLabel">上一个动作</span>
          <span class="stage-label current" id="currentLabel">当前动作</span>
          <div class="teacher-viewport" id="teacherViewport">
            <img alt="" class="pet-img previous" id="previousPreview" />
            <img alt="" class="pet-img current" id="currentPreview" />
          </div>
        </div>
        <div class="panel">
          <label>同 stage 动作大小关系</label>
          <div class="strip" id="strip"></div>
        </div>
      </section>
    </main>
    <script>
      let speciesList = [];
      let stageNumbers = [];
      const frontendPresets = [
        { key: 'student-detail', label: '学生详情页 size 368 / petSize 192', size: 368, petSize: 192 },
        { key: 'pet-home', label: '宠物家园 size 280 / petSize 230', size: 280, petSize: 230 },
        { key: 'class-wall', label: '班级墙 stage2-4 size 80 / petSize 74', size: 80, petSize: 74 },
        { key: 'class-wall-final', label: '班级墙最终形态 size 80 / petSize 62', size: 80, petSize: 62 },
        { key: 'playground', label: '宠物游乐园基准 size 150 / petSize 默认 / 无内部移动', size: 150, disableInternalPatrol: true },
        { key: 'legacy-320', label: '旧调参基准 size 320 / petSize 默认 230', size: 320 },
      ];
      const state = {
        actions: [],
        config: {},
        currentAction: '',
        movementX: 0,
        previousAction: null,
        previewPreset: 'student-detail',
        species: ${JSON.stringify(initialSpecies)},
        stage: ${JSON.stringify(initialStage)},
      };
      const nodes = {
        actions: document.getElementById('actions'),
        actionX: document.getElementById('actionX'),
        actionY: document.getElementById('actionY'),
        centerMovementBtn: document.getElementById('centerMovementBtn'),
        currentLabel: document.getElementById('currentLabel'),
        currentPreview: document.getElementById('currentPreview'),
        leftMovementBtn: document.getElementById('leftMovementBtn'),
        movementX: document.getElementById('movementX'),
        overlayStage: document.getElementById('overlayStage'),
        previousLabel: document.getElementById('previousLabel'),
        previousPreview: document.getElementById('previousPreview'),
        previewPreset: document.getElementById('previewPreset'),
        resetActionOffsetBtn: document.getElementById('resetActionOffsetBtn'),
        resetBtn: document.getElementById('resetBtn'),
        resetStageOffsetBtn: document.getElementById('resetStageOffsetBtn'),
        resetStageBtn: document.getElementById('resetStageBtn'),
        rightMovementBtn: document.getElementById('rightMovementBtn'),
        saveBtn: document.getElementById('saveBtn'),
        scale: document.getElementById('scale'),
        scaleNumber: document.getElementById('scaleNumber'),
        species: document.getElementById('species'),
        stage: document.getElementById('stage'),
        stageScale: document.getElementById('stageScale'),
        stageScaleNumber: document.getElementById('stageScaleNumber'),
        stageX: document.getElementById('stageX'),
        stageY: document.getElementById('stageY'),
        status: document.getElementById('status'),
        strip: document.getElementById('strip'),
        teacherViewport: document.getElementById('teacherViewport'),
      };
      const previewFrameTimers = new Map();
      const emphasized = { jump: 1.32, jumping: 1.32, level_up: 1.5, levelup: 1.5 };
      const stripViewportSize = 132;
      function setStatus(text) { nodes.status.textContent = text; }
      function stageNumber() { return Number(state.stage.replace('stage', '')); }
      function previewPreset() {
        return frontendPresets.find((item) => item.key === state.previewPreset) ?? frontendPresets[0];
      }
      function displaySize() {
        return previewPreset().size;
      }
      function baseRenderSize() {
        const preset = previewPreset();
        return Math.min(preset.size, preset.petSize ?? Math.round(preset.size * 0.72));
      }
      function offsetScale() {
        return baseRenderSize() / ${CONFIG_BASE_RENDER_SIZE};
      }
      function stripViewportScale() {
        return stripViewportSize / displaySize();
      }
      function patrolEdgeX() {
        if (previewPreset().disableInternalPatrol) return 0;
        return Math.round(Math.max(0, (displaySize() - baseRenderSize()) / 2 - Math.max(8, displaySize() * 0.02)));
      }
      function clampMovementX(value) {
        if (previewPreset().disableInternalPatrol) return 0;
        const edge = Math.max(220, patrolEdgeX());
        return Math.max(-edge, Math.min(edge, Number(value) || 0));
      }
      function applyPreviewViewport() {
        const viewportSize = displaySize();
        const stageHeight = Math.max(360, viewportSize + 40);
        nodes.teacherViewport.style.setProperty('--viewport-size', viewportSize + 'px');
        nodes.overlayStage.style.setProperty('--stage-height', stageHeight + 'px');
      }
      function normalizeTransform(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return { scale: value, x: 0, y: 0 };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { scale: 1, x: 0, y: 0 };
        return {
          scale: typeof value.scale === 'number' && Number.isFinite(value.scale) ? value.scale : 1,
          x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : 0,
          y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : 0,
        };
      }
      function actionTransform(action) {
        return normalizeTransform(state.config[state.species]?.[state.stage]?.[action]);
      }
      function actionScale(action) {
        return actionTransform(action).scale;
      }
      function stageTransform() {
        return normalizeTransform(state.config[state.species]?.[state.stage]?.[${JSON.stringify(STAGE_SCALE_KEY)}]);
      }
      function stageScale() {
        return stageTransform().scale;
      }
      function totalOffset(action) {
        const actionValue = actionTransform(action);
        const stageValue = stageTransform();
        return { x: actionValue.x + stageValue.x, y: actionValue.y + stageValue.y };
      }
      function emphasizedRenderSize(action) {
        const scale = emphasized[action] ?? 1;
        const baseSize = baseRenderSize();
        return scale === 1 ? baseSize : Math.min(displaySize(), Math.round(baseSize * scale));
      }
      function renderSize(action) {
        return Math.round(emphasizedRenderSize(action) * actionScale(action) * stageScale());
      }
      function renderMetrics(action) {
        const size = renderSize(action);
        const offset = totalOffset(action);
        const baseSize = baseRenderSize();
        const sizeBonus = size - baseSize;
        const xOffset = Math.round(offset.x * offsetScale());
        const configuredYOffset = Math.round(offset.y * offsetScale());
        const yCompensation = (sizeBonus > 0 ? -Math.round(sizeBonus * 0.8) : 0) + configuredYOffset;
        const marginLeft = -Math.round(size / 2) + xOffset;
        const marginTop = -Math.round(size / 2) + yCompensation;
        return {
          left: Math.round(displaySize() / 2 + state.movementX + marginLeft),
          marginLeft,
          marginTop,
          movementX: state.movementX,
          size,
          top: Math.round(displaySize() / 2 + marginTop),
          x: xOffset,
          y: configuredYOffset,
          yCompensation,
        };
      }
      function ensureConfigPath() {
        state.config[state.species] ??= {};
        state.config[state.species][state.stage] ??= {};
        state.config[state.species][state.stage][${JSON.stringify(STAGE_SCALE_KEY)}] = normalizeTransform(
          state.config[state.species][state.stage][${JSON.stringify(STAGE_SCALE_KEY)}],
        );
        for (const action of state.actions.map((item) => item.actionCode).filter(Boolean)) {
          state.config[state.species][state.stage][action] = normalizeTransform(
            state.config[state.species][state.stage][action],
          );
        }
      }
      function actionByCode(code) {
        return state.actions.find((item) => item.actionCode === code) ?? { actionCode: code, gifUrl: '' };
      }
      function stopFrameAnimation(img) {
        const timer = previewFrameTimers.get(img);
        if (timer) {
          window.clearTimeout(timer);
          previewFrameTimers.delete(img);
        }
      }
      function startFrameAnimation(img, resource) {
        stopFrameAnimation(img);
        img.src = resource?.gifUrl || '';
      }
      function speciesLabel(item) {
        return item.name && item.name !== item.code ? item.name + ' (' + item.code + ')' : item.code;
      }
      function renderSelectors() {
        nodes.species.innerHTML = speciesList
          .map((item) => '<option value="' + item.code + '">' + speciesLabel(item) + '</option>')
          .join('');
        nodes.stage.innerHTML = stageNumbers.map((item) => '<option value="stage' + item + '">stage' + item + '</option>').join('');
        nodes.previewPreset.innerHTML = frontendPresets
          .map((item) => '<option value="' + item.key + '">' + item.label + '</option>')
          .join('');
        if (!stageNumbers.some((item) => 'stage' + item === state.stage)) {
          state.stage = 'stage' + (stageNumbers[0] ?? 1);
        }
        nodes.species.value = state.species;
        nodes.stage.value = state.stage;
        nodes.previewPreset.value = state.previewPreset;
      }
      function renderActions() {
        const actionNames = Array.from(new Set(state.actions.map((item) => item.actionCode).filter(Boolean)));
        nodes.actions.innerHTML = '';
        for (const action of actionNames) {
          const button = document.createElement('button');
          button.className = action === state.currentAction ? 'active' : '';
          button.type = 'button';
          button.textContent = action;
          button.addEventListener('click', () => {
            if (state.currentAction !== action) {
              state.previousAction = state.currentAction;
              state.currentAction = action;
            }
            renderAll();
          });
          nodes.actions.appendChild(button);
        }
      }
      function updateSlider() {
        const actionValue = actionTransform(state.currentAction);
        nodes.scale.value = String(actionValue.scale);
        nodes.scaleNumber.value = String(actionValue.scale);
        nodes.actionX.value = String(actionValue.x);
        nodes.actionY.value = String(actionValue.y);
        const stageValue = stageTransform();
        nodes.stageScale.value = String(stageValue.scale);
        nodes.stageScaleNumber.value = String(stageValue.scale);
        nodes.stageX.value = String(stageValue.x);
        nodes.stageY.value = String(stageValue.y);
        nodes.movementX.value = String(state.movementX);
      }
      function setPreview(img, label, action) {
        const resource = action ? actionByCode(action) : null;
        const metrics = renderMetrics(action || 'idle');
        const dbUrl = resource?.gifUrl || '';
        label.textContent = action
          ? action + '\\nDB URL: ' + (dbUrl || '(数据库为空)') + '\\naction x' + actionScale(action).toFixed(2) + ' / stage x' + stageScale().toFixed(2) + ' / x ' + metrics.x + ' / y ' + metrics.y + ' / moveX ' + metrics.movementX + ' / finalY ' + metrics.yCompensation
          : '无';
        label.title = dbUrl;
        img.style.setProperty('--render-size', metrics.size + 'px');
        img.style.setProperty('--margin-left', metrics.marginLeft + 'px');
        img.style.setProperty('--margin-top', metrics.marginTop + 'px');
        img.style.setProperty('--movement-x', metrics.movementX + 'px');
        startFrameAnimation(img, resource);
        img.hidden = !resource?.gifUrl;
      }
      function renderStrip() {
        nodes.strip.innerHTML = '';
        const actionNames = Array.from(new Set(state.actions.map((item) => item.actionCode).filter(Boolean)));
        for (const action of actionNames) {
          const resource = actionByCode(action);
          const item = document.createElement('div');
          item.className = 'mini';
          item.title = resource.gifUrl || '';
          item.innerHTML = '<span>' + action + ' x' + actionScale(action).toFixed(2) + ' / stage ' + stageScale().toFixed(2) + '</span>';
          if (resource.gifUrl) {
            const viewport = document.createElement('div');
            viewport.className = 'mini-viewport';
            const img = document.createElement('img');
            const metrics = renderMetrics(action);
            img.src = resource.gifUrl;
            const miniScale = stripViewportScale();
            img.style.setProperty('--mini-size', Math.round(metrics.size * miniScale) + 'px');
            img.style.setProperty('--mini-margin-left', Math.round(metrics.marginLeft * miniScale) + 'px');
            img.style.setProperty('--mini-margin-top', Math.round(metrics.marginTop * miniScale) + 'px');
            viewport.appendChild(img);
            item.appendChild(viewport);
          }
          item.addEventListener('click', () => {
            state.previousAction = state.currentAction;
            state.currentAction = action;
            renderAll();
          });
          nodes.strip.appendChild(item);
        }
      }
      function renderAll() {
        ensureConfigPath();
        state.movementX = clampMovementX(state.movementX);
        applyPreviewViewport();
        renderSelectors();
        renderActions();
        updateSlider();
        setPreview(nodes.previousPreview, nodes.previousLabel, state.previousAction);
        setPreview(nodes.currentPreview, nodes.currentLabel, state.currentAction);
        renderStrip();
      }
      async function loadConfig() {
        const response = await fetch('/api/config', { cache: 'no-store' });
        state.config = await response.json();
      }
      async function loadSpecies() {
        const response = await fetch('/api/species', { cache: 'no-store' });
        if (!response.ok) throw new Error('读取数据库物种失败');
        const payload = await response.json();
        speciesList = payload.species ?? [];
        if (!speciesList.some((item) => item.code === state.species)) {
          state.species = speciesList[0]?.code ?? '';
        }
      }
      async function loadStages() {
        const response = await fetch('/api/stages', { cache: 'no-store' });
        if (!response.ok) throw new Error('读取数据库 stage 失败');
        const payload = await response.json();
        stageNumbers = payload.stages ?? [];
        if (!stageNumbers.some((item) => 'stage' + item === state.stage)) {
          state.stage = 'stage' + (stageNumbers[0] ?? 1);
        }
      }
      async function loadActions() {
        const response = await fetch('/api/actions?species=' + encodeURIComponent(state.species) + '&stage=' + stageNumber(), { cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || '读取数据库动作 URL 失败');
        }
        const payload = await response.json();
        state.actions = payload.actions ?? [];
        state.species = payload.species ?? state.species;
        state.currentAction = state.actions.find((item) => item.actionCode === state.currentAction)?.actionCode ?? state.actions[0]?.actionCode ?? '';
      }
      async function saveConfig() {
        setStatus('保存中...');
        const response = await fetch('/api/config', {
          body: JSON.stringify(state.config),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        if (!response.ok) throw new Error('保存失败');
        setStatus('已保存到 JSON + TS，教师端刷新后生效');
      }
      async function reloadStage() {
        setStatus('加载中...');
        await loadActions();
        ensureConfigPath();
        state.previousAction = null;
        renderAll();
        setStatus('已加载 ' + state.species + ' / ' + state.stage);
      }
      nodes.species.addEventListener('change', async () => {
        state.species = nodes.species.value;
        await reloadStage();
      });
      nodes.stage.addEventListener('change', async () => {
        state.stage = nodes.stage.value;
        await reloadStage();
      });
      nodes.previewPreset.addEventListener('change', () => {
        state.previewPreset = nodes.previewPreset.value;
        state.movementX = 0;
        renderAll();
      });
      function setCurrentScale(value) {
        if (!state.currentAction) return;
        ensureConfigPath();
        state.config[state.species][state.stage][state.currentAction].scale = Number(value);
        renderAll();
      }
      function setCurrentStageScale(value) {
        ensureConfigPath();
        state.config[state.species][state.stage][${JSON.stringify(STAGE_SCALE_KEY)}].scale = Number(value);
        renderAll();
      }
      function setCurrentActionOffset(axis, value) {
        if (!state.currentAction) return;
        ensureConfigPath();
        state.config[state.species][state.stage][state.currentAction][axis] = Number(value);
        renderAll();
      }
      function setCurrentStageOffset(axis, value) {
        ensureConfigPath();
        state.config[state.species][state.stage][${JSON.stringify(STAGE_SCALE_KEY)}][axis] = Number(value);
        renderAll();
      }
      function setMovementX(value) {
        state.movementX = clampMovementX(value);
        renderAll();
      }
      nodes.scale.addEventListener('input', () => setCurrentScale(nodes.scale.value));
      nodes.scaleNumber.addEventListener('input', () => setCurrentScale(nodes.scaleNumber.value));
      nodes.actionX.addEventListener('input', () => setCurrentActionOffset('x', nodes.actionX.value));
      nodes.actionY.addEventListener('input', () => setCurrentActionOffset('y', nodes.actionY.value));
      nodes.stageScale.addEventListener('input', () => setCurrentStageScale(nodes.stageScale.value));
      nodes.stageScaleNumber.addEventListener('input', () => setCurrentStageScale(nodes.stageScaleNumber.value));
      nodes.stageX.addEventListener('input', () => setCurrentStageOffset('x', nodes.stageX.value));
      nodes.stageY.addEventListener('input', () => setCurrentStageOffset('y', nodes.stageY.value));
      nodes.movementX.addEventListener('input', () => setMovementX(nodes.movementX.value));
      nodes.resetBtn.addEventListener('click', () => setCurrentScale(1));
      nodes.resetStageBtn.addEventListener('click', () => setCurrentStageScale(1));
      nodes.leftMovementBtn.addEventListener('click', () => setMovementX(-patrolEdgeX()));
      nodes.centerMovementBtn.addEventListener('click', () => setMovementX(0));
      nodes.rightMovementBtn.addEventListener('click', () => setMovementX(patrolEdgeX()));
      nodes.resetActionOffsetBtn.addEventListener('click', () => {
        setCurrentActionOffset('x', 0);
        setCurrentActionOffset('y', 0);
      });
      nodes.resetStageOffsetBtn.addEventListener('click', () => {
        setCurrentStageOffset('x', 0);
        setCurrentStageOffset('y', 0);
      });
      nodes.saveBtn.addEventListener('click', () => {
        saveConfig().catch((error) => setStatus(error instanceof Error ? error.message : '保存失败'));
      });
      (async function init() {
        await loadSpecies();
        await loadStages();
        await loadConfig();
        await reloadStage();
      })().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
    </script>
  </body>
</html>`;
}

async function handleRequest(req, res) {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || `${HOST}:${PORT}`}`,
  );
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    const initialSpecies = url.searchParams.get("species") || "";
    const stageParam = url.searchParams.get("stage") || "stage1";
    const initialStage = /^stage[1-9][0-9]*$/.test(stageParam) ? stageParam : "stage1";
    sendHtml(res, pageHtml(initialSpecies, initialStage));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
    await sendLocalPublicFile(res, url.pathname);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, await readConfig());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/species") {
    const species = await getSpeciesList();
    sendJson(res, 200, {
      species: species.map(({ code, name }) => ({ code, name })),
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stages") {
    sendJson(res, 200, { stages: await getAvailableStageNumbers() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/config") {
    const body = await readBody(req);
    await saveConfig(
      body && typeof body === "object" && !Array.isArray(body) ? body : {},
    );
    sendJson(res, 200, {
      ok: true,
      path: await getConfigPath(),
      tsPath: await getConfigTsPath(),
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/actions") {
    const speciesInput = url.searchParams.get("species") || "dog";
    const stage = url.searchParams.get("stage") || "2";
    const species = await resolveSpeciesCode(speciesInput);
    const actions = await getActions(speciesInput, stage);
    sendJson(res, 200, { actions, species, stage: Number(stage) });
    return;
  }
  sendJson(res, 404, { message: "Not Found" });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write("PetPals animation scale debug server listening:\n");
  process.stdout.write(`  http://${HOST}:${PORT}\n`);
  getConfigPath()
    .then((configPath) => {
      process.stdout.write(`Scale config:\n  ${configPath}\n`);
    })
    .catch(() => {
      process.stdout.write(`Scale config:\n  ${CONFIG_CANDIDATES[0]}\n`);
    });
});
