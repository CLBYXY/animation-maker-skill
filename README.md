# Animation Maker Skill

A Codex skill for running a standalone local PetPals animation production workbench.

It bundles a five-step web console plus the scripts, prompts, and reference skills needed to create multi-stage pet animation assets locally.

## What It Does

- Generate or import stage `base.png` images for pet evolution stages.
- Create action animation assets from stage images.
- Slice raw and long-frame spritesheets into single frames.
- Generate and edit `animation-timing.json`.
- Package local GIFs.
- Upload GIFs to CDN when a Qiniu API key is provided.
- Scaffold missing species/stage/action-resource rows for snapshot sync.
- Tune stage and action scale/offset settings for frontend display.

## Quick Start

Clone the repository, then run:

```bash
bash scripts/start-workbench-1234.sh
```

Open:

```text
http://127.0.0.1:1234/
```

The startup script installs frontend dependencies inside `assets/animation-workbench` when needed and starts the local Vite workbench on port `1234`.

## Using With Codex

Ask Codex to use this skill, for example:

```text
Use $animation-maker-skill to open the local animation workbench and help me create a five-stage pet animation set.
```

Codex should read `SKILL.md` first, then start the workbench with:

```bash
bash scripts/start-workbench-1234.sh
```

Generated assets default to:

```text
workspace/animals/<animal>/stageN
```

## Repository Layout

```text
.
├── SKILL.md
├── agents/openai.yaml
├── assets/
│   ├── animation-workbench/
│   └── final_petpals_pipeline.svg
├── docs/handover/petpals-dev-snapshot.sql
├── references/
│   ├── frontend-design.md
│   ├── prompts/
│   └── source-skills/
└── scripts/
    ├── make_gifs.py
    └── start-workbench-1234.sh
```

## Notes

- No real Qiniu API key is committed. Paste a key in the GIF upload panel when CDN upload is needed.
- The workbench is standalone and should not modify teacher/admin/H5 apps unless the user explicitly asks for integration work.
- `references/source-skills/` contains the bundled generation, slicing, GIF sync, and scale-debug materials used by the workbench.
