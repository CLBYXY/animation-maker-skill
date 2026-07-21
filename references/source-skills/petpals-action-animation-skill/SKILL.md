---
name: petpals-action-animation
description: Generate PetPals action animation assets (长帧 spritesheets, 单帧 frames, animation-timing.json) for a pet that already has a base.png. Does NOT generate the base character image — that must exist before this skill runs. Use when the user has already created base.png for one or more stages and wants to generate the 9 action animations from it.
---

# PetPals Action Animation

## Overview

This skill starts from an **already-existing `base.png`** and generates all action animation files:

- `长帧/<action>.png` — horizontal spritesheet per action, chroma-key removed
- `单帧/<action>/000.png … NNN.png` — individual frames, 256 px wide, auto-height
- `animation-timing.json` — playback timing config

**This skill does NOT generate `base.png`.** The character image must already exist at:
```
<ANIMALS_ROOT>/<pet_name>/<stage>/base.png
```

If `base.png` is missing for any requested stage, that stage is skipped with an error.

---

## Inputs (from codex CLI call)

| Parameter      | Required | Example                                |
|----------------|----------|----------------------------------------|
| `pet_name`     | Yes      | `blue-robin`, `dog`, `hamster`         |
| `stage`        | Yes      | `stage3` (single) or `stage0,1,3,4` (multi) |
| `ANIMALS_ROOT` | No       | default: `workspace/animals` |

Parse `stage` from the user's codex CLI message. Accept both:
- Single: `stage3`
- Multiple: `stage0,stage1,stage3,stage4` or `0,1,3,4` or `stage0 stage1 stage3 stage4`

---

## Actions

9 actions total — 8 generated from `base.png`, 1 derived by mirror:

| Action        | Frames | Source                     | Loop  | ms/frame |
|---------------|--------|----------------------------|-------|----------|
| idle          | 8      | `1-叫声.rtf`               | true  | 90       |
| running-right | 8      | `3-右走.rtf`               | true  | 90       |
| running-left  | 8      | flip of running-right      | true  | 90       |
| jumping       | 8      | inline template            | false | 90       |
| waving        | 8      | `4-一起玩.rtf`             | true  | 90       |
| failed        | 8      | `7-难过.rtf`               | false | 120      |
| eat           | 8      | `5-吃饭.rtf`               | false | 90       |
| happy         | 8      | `6-高兴.rtf`               | false | 90       |
| levelup       | 10     | `8-升级.rtf`               | false | 80       |

---

## Prompt Sources

Action spritesheet prompts come from: `~/Desktop/prompt/codexpet/`

| PetPals action | RTF file         | Frames |
|----------------|------------------|--------|
| idle           | `1-叫声.rtf`     | 8      |
| running-left   | `2-左走.rtf`     | 8      |
| running-right  | `3-右走.rtf`     | 8      |
| waving         | `4-一起玩.rtf`   | 8      |
| eat            | `5-吃饭.rtf`     | 8      |
| happy          | `6-高兴.rtf`     | 8      |
| failed         | `7-难过.rtf`     | 8      |
| levelup        | `8-升级.rtf`     | 10     |
| jumping        | inline (below)   | 8      |

For each action:
1. Read the RTF file.
2. Replace the character description lines with the current pet's visual features (inferred from `base.png`).
3. Keep all output-structure rules exactly: "严格为 1 行 N 列", 透明背景, 不要标题/编号/边框/装饰.
4. Always append the spacing rule below to the final image-generation prompt.

**Spritesheet spacing rule (mandatory for every action prompt):**

```text
【切帧安全间距要求】
- 长帧 spritesheet 只需要满足稳定切成单帧，不要为了留白把角色缩得过小。
- 每一帧必须放在独立、等宽的格子里，保持中等安全边距即可。
- 相邻两帧之间必须保留可识别的纯绿色空白安全间距，参考霸王龙 stage4 idle 的密度。
- 宠物主体、尾巴、翅膀、角、装甲、光效、粒子、运动残影都必须完整留在自己的格子内。
- 任何主体部位或特效都不能碰到、连接、覆盖、延伸到相邻帧。
- stage5 或体型特别大的形象可以通过加长/加高 raw 画布避免裁切，但不要生成过大的格间空白，也不要通过明显缩小角色牺牲细节。
- 不要把 8/9/10 帧挤在一起，不要让角色或特效跨格。
- 原始 raw spritesheet 不能被画布裁切：角色最高点、最低点、左右极限必须离画布边缘留出少量纯绿色安全边距。
- stage5 或带有大翅膀、长尾羽、武器、背饰、头冠的形象，raw 画布高度不能压成 256px 这类扁长图；如果完整形象需要空间，必须生成更高或更长的 raw 画布，角色尺寸和细节必须保持。
- 如果 raw 中任意一帧的头冠、武器、尾羽、翅膀、脚爪贴到格子边缘，或者看起来被截断，必须丢弃这张 raw 并重新生成，禁止进入去绿底和切帧步骤。
```

**jumping** inline template:
```
请基于参考图中的同一只 {pet_name} 角色，生成 1 张用于网页端 2D 帧动画的横向 spritesheet。
【输出结构】
- 严格为 1 行 8 列
- 整张长帧必须可稳定切帧，每一帧位于独立、等宽的格子中
- 相邻两帧之间保留可识别的纯绿色空白安全间距即可，不要为了大留白缩小角色
- 宠物主体、尾巴、耳朵、四肢、跳跃运动残影和任何特效都必须完整留在自己的格子内，不能碰到或延伸到相邻帧
- 如果宠物体型很大，可以加长/加高 raw 画布避免裁切，但不要生成过大的格间空白，也不能缩小角色导致细节损失
- 只表现 jump 这一个动画（起跳 → 腾空 → 落地的完整弧线）
- 8 个格子从左到右是连续动作
- 透明背景
- 不要标题、编号、边框、装饰
- 不要棋盘格背景、白底、地面装饰、阴影底板
【角色统一要求】
- 必须是参考图中的同一只 {pet_name}，保持完全相同的外观、配色、比例
- 不要落地阴影、不要尘土效果
```

---

## Workflow

Progress checklist — update as each step completes:

```
[ ] 1. Validate base.png exists for each requested stage
        stage0 → skip steps 2–5, preserve egg base.png only, continue to next stage
        stage1 → skip steps 2–5, preserve base.png only, continue to next stage
        stage2–6 → proceed normally
[ ] 2. Generate 8 action spritesheets (per stage, stage2–6 only)
[ ] 3. Remove chroma key → save to 长帧/
[ ] 4. Slice 长帧/ → 单帧/ + derive running-left
[ ] 5. Generate animation-timing.json
[ ] 6. Summary
```

---

### Step 1 — Validate

```bash
ANIMALS_ROOT="${ANIMALS_ROOT:-workspace/animals}"

for stage in <requested stages>; do
  base="$ANIMALS_ROOT/$PET_NAME/$stage/base.png"
  if [[ ! -f "$base" ]]; then
    echo "ERROR: base.png missing for $stage — skipping"
    continue
  fi

  # stage0/stage1: preserve base.png only, skip all action generation
  if [[ "$stage" == "stage0" || "$stage" == "stage1" ]]; then
    echo "SKIP: $stage — base.png preserved, no action generation for stage0/stage1"
    continue
  fi

  echo "OK: $base — will generate actions"
done
```

- Stages with missing `base.png` → skip with error.
- `stage0` → log skip message, preserve smooth egg `base.png` as-is, continue to next stage. Steps 2–5 do **not** run for stage0.
- `stage1` → log skip message, preserve `base.png` as-is, continue to next stage. Steps 2–5 do **not** run for stage1.
- `stage2`–`stage6` → proceed normally through all steps.

---

### Step 2 — Generate action spritesheets

For each valid stage **except stage0 and stage1**, generate 8 spritesheets using `$imagegen`.

Load imagegen skill first:
```text
${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/SKILL.md
```

For each action:
- Read the prompt from `~/Desktop/prompt/codexpet/<action>.rtf`
- Attach `base.png` as the canonical reference image
- The output will have a green chroma-key background — expected
- Save the selected source in `raw_generated/<action>.png`; do not keep only the chroma-key-removed `长帧` output.
- Before chroma-key removal, validate raw safety. For stage5 or large silhouettes, run:
  ```bash
  python3 "$SKILL_DIR/scripts/validate_raw_spritesheet.py" \
    --input "$ANIMALS_ROOT/$PET_NAME/$STAGE/raw_generated/<action>.png" \
    --frame-count <8-or-10> \
    --min-height 512 \
    --min-margin 6
  ```
  If validation fails, regenerate the raw image only when a frame is clipped, touching the cell edge, or crossing into a neighboring cell. Do not repair a clipped raw image by slicing or resizing; the missing pixels are already gone. Do not shrink the character merely to create extra blank spacing.
- Use one lightweight worker per action

Workers return only `selected_source=<path>` and `qa_note=<one sentence>`.

---

### Step 3 — Remove chroma key → 长帧/

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/petpals-action-animation"

python3 "$SKILL_DIR/scripts/remove_chroma_key.py" \
  --input-dir  /path/to/raw_generated/ \
  --output-dir "$ANIMALS_ROOT/$PET_NAME/$STAGE/长帧/"
```

Or per-file:
```bash
python3 "$SKILL_DIR/scripts/remove_chroma_key.py" \
  --input  /path/to/raw/idle.png \
  --output "$ANIMALS_ROOT/$PET_NAME/$STAGE/长帧/idle.png"
```

---

### Step 4 — Slice 长帧/ → 单帧/ (includes running-left)

```bash
bash "$SKILL_DIR/scripts/slice_all_actions.sh" \
  "$ANIMALS_ROOT" "$PET_NAME" "$STAGE"
```

This script:
- Slices each `长帧/<action>.png` into `单帧/<action>/000.png … NNN.png`
- Uses `--cell-width 256 --no-chroma-key` for all actions (consistent sizing)
- Auto-expands canvas to prevent top/bottom clipping
- Derives `running-left` by horizontally flipping `running-right`

---

### Step 5 — Generate animation-timing.json

```bash
python3 "$SKILL_DIR/scripts/generate_timing.py" \
  --frames-dir "$ANIMALS_ROOT/$PET_NAME/$STAGE/单帧" \
  --output     "$ANIMALS_ROOT/$PET_NAME/$STAGE/animation-timing.json"
```

Defaults:
- `idle`, `running-*`, `waving` → loop=true, 90ms/frame
- `jumping`, `happy` → loop=false, 90ms/frame
- `failed` → loop=false, 120ms/frame
- `eat` → loop=false, 90ms/frame, sequence repeats eating 3× before exit
- `levelup` → loop=false, 80ms/frame

Existing values preserved. Backup folders skipped.

---

### Step 6 — Summary

Report per stage:
```
<pet_name>/<stage>/
  base.png          ✓ (pre-existing, not generated by this skill)
  长帧/             9 files
  单帧/             9 action folders
  animation-timing.json ✓
```

---

## Scripts

All scripts in `${CODEX_HOME:-$HOME/.codex}/skills/petpals-action-animation/scripts/`

### `remove_chroma_key.py`
Remove green chroma-key background. Single file or batch directory.

### `slice_all_actions.sh`
Slice all 长帧 PNGs into 单帧 and derive running-left.
```bash
bash slice_all_actions.sh <ANIMALS_ROOT> <pet_name> <stage>
```

### `generate_timing.py`
Generate animation-timing.json with PetPals defaults. Preserves existing values.

### `validate_raw_spritesheet.py`
Validate a green-background or transparent raw spritesheet before chroma-key removal.
Use it to reject clipped source images early, especially for stage5 pets with large silhouettes.

---

## Codex Invocation

**Single stage (base.png already exists):**
```bash
codex exec \
  -C <skill root> \
  -s workspace-write \
  --add-dir references/source-skills/sprite-slicer-skill \
  --add-dir references/prompts \
  --add-dir "${CODEX_HOME:-$HOME/.codex}/skills/petpals-action-animation" \
  --add-dir "${CODEX_HOME:-$HOME/.codex}/generated_images" \
  --skip-git-repo-check \
  "使用 petpals-action-animation skill，为宠物「<pet_name>」的「<stage>」生成动作动画资源。base.png 已存在。"
```

**Multiple stages:**
```bash
codex exec \
  -C <skill root> \
  -s workspace-write \
  --add-dir references/source-skills/sprite-slicer-skill \
  --add-dir references/prompts \
  --add-dir "${CODEX_HOME:-$HOME/.codex}/skills/petpals-action-animation" \
  --add-dir "${CODEX_HOME:-$HOME/.codex}/generated_images" \
  --skip-git-repo-check \
  "使用 petpals-action-animation skill，为宠物「<pet_name>」的 stage0、stage1、stage3、stage4 生成动作动画资源。每个 stage 的 base.png 已存在。"
```

---

## Quality Rules

- If `base.png` is missing for a stage → skip that stage, log error, continue others.
- All 长帧 PNGs must have fully transparent background (no green residue).
- All 单帧 must be 256 px wide, transparent background.
- Character size consistent across all frames and all actions (no --cell-height).
- No frame may have top or bottom clipped — slicer auto-expands canvas.
- running-left must be derived by flipping running-right, never generated separately.
- animation-timing.json must include all 9 standard actions.
