---
name: petpals-animation-scale-debug
description: Use when tuning PetPals GIF display scale and x/y offsets for species/stage/action combinations. Starts a local transform editor that reads current pet_action_resources URLs, accepts Chinese or English species names, and writes teacher-web pet-animation-scale-config.json plus the inlined TypeScript config.
---

# PetPals Animation Scale Debug

Use this skill when the user wants a local web page to adjust visual scale or x/y placement for pet GIF actions.

## Scope

- Project root: `<skill root>`
- Public uploads root: `<skill root>/apps/api/public`
- Scale config JSON: `<skill root>/apps/teacher-web/src/components/pet-animation-scale-config.json`
- Scale config TS: `<skill root>/apps/teacher-web/src/components/pet-animation-scale-config.ts`
- Local server script: `<skill root>-animation-scale-debug-skill/server.js`
- Default URL: `http://127.0.0.1:3521`

## Start

```bash
cd <skill root>-animation-scale-debug-skill
PORT=3521 node server.js
```

By default, the server reads URLs from the PetPals local MySQL container:

```bash
MYSQL_CONTAINER=petpals-local-mysql-1 MYSQL_USER=petpals MYSQL_PASSWORD=petpals MYSQL_DATABASE=petpals PORT=3521 node server.js
```

The page displays the current `pet_action_resources.gif_url` values returned by the database. It does not fall back to local GIFs, frame folders, or `base.png`; if a database URL is empty or the database is unavailable, the page shows that state instead of substituting a local asset.

The page lets the user:

- Select species and stage; species options display Chinese names from `pet_species` while preserving stable species codes for the JSON keys.
- Select actions for the current stage.
- Preview current and previous action in equal viewports.
- Adjust per-action scale with a slider.
- Adjust per-action x/y offsets.
- Adjust whole-stage scale and x/y offsets.
- Choose the exact frontend display preset before tuning.
- Simulate frontend internal patrol movement with the `前端内部移动 x` control. This affects preview only and is not written to JSON.
- Save transform values back to both `pet-animation-scale-config.json` and `pet-animation-scale-config.ts`.

## Frontend Overlap Contract

The scale web preview must use the same coordinate math as `<skill root>/apps/teacher-web/src/components/codex-pet-frame-animator.tsx` and must be tuned with the same frontend `size` / `petSize` preset as the target page:

- Student detail page `/students/:id`: `size=368`, `petSize=192`.
- Pet home page: `size=280`, `petSize=230`.
- Class wall, stage 2-4: `size=80`, `petSize=74`.
- Class wall, final stage: `size=80`, `petSize=62`.
- Pet playground baseline: `size=150`, no explicit `petSize`, `disableInternalPatrol=true`.
- Legacy 320px preset is for old comparisons only.
- Base render size is `Math.min(size, petSize ?? Math.round(size * 0.72))`.
- Config base render size is `Math.round(320 * 0.72) = 230`.
- Final render size is `emphasizedSize * actionScale * stageScale`.
- Offsets are authored against the 320px / 230px config baseline and scaled by `petRenderSize / 230` at runtime.
- Image placement is `left: 50%`, `top: 50%`, `marginLeft = -round(renderSize / 2) + xOffset`, `marginTop = -round(renderSize / 2) + yCompensation`.
- `yCompensation = -round(sizeBonus * 0.8)` when the final render size is larger than the base render size, plus configured y offset.
- Patrol movement is a wrapper `translateX(...)` outside the image math. The scale web `前端内部移动 x` control simulates this wrapper so absolute screenshots can be compared without changing the saved config.

This means if two actions visually overlap in the scale web overlay, the teacher-web frontend will compute the same image box and overlap them the same way after the config is saved.

## Config Format

The teacher runtime accepts both legacy numeric values and the newer object values:

```json
{
  "dog": {
    "stage2": {
      "idle": 1.08,
      "eat": {
        "scale": 1,
        "x": 0,
        "y": -12
      },
      "__stageScale": {
        "scale": 0.72,
        "x": 0,
        "y": 0
      }
    }
  }
}
```

Offsets are based on the 320px teacher display baseline with a 230px default pet render size. Positive `x` moves right; positive `y` moves down.

The debug API accepts both species codes and Chinese names or common aliases. For example, `dog`, `小狗`, `狗`, `hamster`, `小仓鼠`, `仓鼠`, `blue-robin`, and `蓝知更鸟` all resolve to the correct `pet_species.code` before querying action resources.

## Important Deployment Reminder

Every time the user asks to update the external/public `外网-petpals` folder or upload to Gitee, remind them:

> 当前缩放调参数据会同步保存到 JSON 和 TS 配置。外网发布前请确认构建使用的是最新 `pet-animation-scale-config.ts`，或确认 JSON 到 TS 的同步没有被旧文件覆盖。

Do not automatically push or commit.
