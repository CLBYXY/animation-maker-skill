---
name: animation-maker-skill
description: Build and run a standalone local PetPals animation production workbench. Use when the user asks Codex to make pet animation assets, launch a local website/port for a five-step animation workflow, generate or import multi-stage pet base images, create action raw/long-frame/single-frame assets, generate timing JSON, package/upload GIFs, scaffold missing species/snapshot rows, or tune frontend scale/offset settings.
---

# Animation Maker Skill

This skill packages a local web workbench plus the supporting PetPals animation scripts and prompts. Use it to let Codex open a local site on port `1234` and produce pet animation assets end to end.

## Quick Start

1. Open the skill folder as the working directory.
2. Start the workbench:

```bash
bash scripts/start-workbench-1234.sh
```

3. Open `http://127.0.0.1:1234/`.
4. Keep generated animal assets under the default `workspace/animals/<animal>/stageN` unless the user chooses another save root in the UI.

The script installs frontend dependencies inside `assets/animation-workbench` if needed. It uses `pnpm` when available and falls back to `npm`.

## Bundled Resources

- `assets/animation-workbench/`: React/Vite local workbench with five modules.
- `scripts/make_gifs.py`: local GIF packer used by the workbench.
- `docs/handover/petpals-dev-snapshot.sql`: snapshot SQL template used for URL sync/scaffolding.
- `references/source-skills/petpals-action-animation-skill/`: stage 2-5 action generation and slicing logic.
- `references/source-skills/petpals-egg-animation-skill/`: stage 1 egg action workflow.
- `references/source-skills/sleep-animator-skill/`: stage 1 sleep action workflow.
- `references/source-skills/sprite-slicer-skill/`: deterministic spritesheet slicing.
- `references/source-skills/petpals-animation-scale-debug-skill/`: scale/offset tuning reference.
- `references/source-skills/refresh-pet-gifs/`: GIF upload and snapshot sync scripts.
- `references/prompts/`: source prompts for image and action generation.
- `references/frontend-design.md`: UI layout and interaction constraints.
- `assets/final_petpals_pipeline.svg`: pipeline reference diagram.

## Workflow

1. **Generate Images**: create or upload stage images, save `base.png` into `workspace/animals/<animal>/stage1..stage5`.
2. **Action Animation**: generate raw action sheets, long frames, single frames, and `animation-timing.json` from each stage `base.png`.
3. **Timing**: inspect and adjust per-frame duration/sequence.
4. **GIF Generation**: package local GIFs. If CDN upload is enabled, enter a Qiniu API key in the UI; no real key is stored in the skill.
5. **Scale Tuning**: adjust stage/action scale and offsets for frontend display.

## Operational Notes

- Treat the workbench as standalone. Do not modify unrelated teacher/admin/H5 apps when using this skill.
- Prefer the bundled paths over historical absolute paths that may appear inside copied reference READMEs.
- If `imagegen` or Codex image generation is needed, ensure the local Codex app/CLI has image generation access and that `IMAGEGEN_SKILL_DIR` points to the system imagegen skill when the default `~/.codex/skills/.system/imagegen` is not present.
- If Qiniu upload is requested, ask the user for the API key or have them paste it in the UI. Never commit a real key.
- Snapshot/database setup for a new species should go through the GIF module's interactive species scaffold panel.
- For UI changes, read `references/frontend-design.md` before editing the workbench.
