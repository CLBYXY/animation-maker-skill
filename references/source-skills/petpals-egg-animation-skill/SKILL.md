---
name: petpals-egg-animation
description: Generate PetPals stage1 egg animation assets from an existing base.png. Use for egg-stage pets only; outputs 长帧 spritesheets, 单帧 frames, and animation-timing.json for idle, failed, jumping, and levelup while staying compatible with the existing makegif/refresh pipeline.
---

# PetPals Egg Animation

## Scope

Use this skill only for PetPals `stage1` egg-form pets.

This skill starts from an existing:

```text
<ANIMALS_ROOT>/<pet_name>/stage1/base.png
```

It generates the same output structure as the normal action animation workflow:

- `长帧/<action>.png`
- `单帧/<action>/000.png ...`
- `animation-timing.json`

Do not modify `makegif` or `refresh` for egg stage. Compatibility is achieved by using existing action names.

## Actions

Generate exactly these four actions:

| Action | Frames | Loop | Visual intent |
| --- | ---: | --- | --- |
| `idle` | 8 | true | Egg rocks left and right with a strong 45-degree visible tilt |
| `failed` | 8 | false | Egg dims, slumps, and wobbles with a strong 45-degree sad tilt |
| `jumping` | 8 | false | Egg jumps high with a clean subtle glow; used by feed/eat and praise events |
| `levelup` | 10 | false | Egg shell glows from within; thin natural cracks stay on the shell; glow expands until it covers the egg |

Do not generate:

- `eat`
- `happy`
- `waving`
- `running-left`
- `running-right`
- `walk_left`
- `walk_right`

Frontend event mapping handles feed/eat and praise by playing `jumping`.

## Inputs

| Parameter | Required | Example |
| --- | --- | --- |
| `pet_name` | Yes | `dog`, `tiger`, `hamster`, `blue-robin`, `whale` |
| `stage` | Yes | must be `stage1` |
| `ANIMALS_ROOT` | No | default: `workspace/animals` |

If the requested stage is not `stage1`, stop and tell the user to use `petpals-action-animation` or `petpals-pet-animation`.

## Workflow

Checklist:

```text
[ ] 1. Validate stage is stage1 and base.png exists
[ ] 2. Generate raw long-frame spritesheets for idle, failed, jumping, levelup
[ ] 3. Remove chroma key into 长帧/
[ ] 4. Slice 长帧/ into 单帧/
[ ] 5. Generate animation-timing.json
[ ] 6. Report output paths
```

## Prompt Guidance

Use `base.png` as the canonical visual reference.
If `base.png` contains a floor shadow, contact shadow, background tint, or white
canvas, ignore those artifacts and reference only the egg body itself.

All prompts must preserve:

- the same egg silhouette, pattern, colors, and proportions as `base.png`
- transparent background
- one horizontal spritesheet row
- no title, numbering, border, ground, floor, pedestal, cast shadow, shadow base, gray halo, scene background, decorative backdrop, or white background
- large, readable motion between frames; avoid tiny micro-movements that look static after GIF export
- the full egg must remain visible in every frame, including the highest jump frame and every 45-degree tilt frame; never crop the top, bottom, sides, decorations, or protrusions
- the outer contour must be a clean, smooth, continuous oval egg edge; no jagged pixels, broken edge, serrated outline, noisy edge speckles, fur/hair protruding outside the silhouette, or chipped-looking border
- any plush/fur-like texture must stay inside the egg surface only; the outside silhouette remains smooth like a polished egg shell
- use only the egg image itself as the subject; do not add extra objects, environment, ground, floor contact, cast shadow, oval base, half-circle floor shadow, or dirty edge halo
- all light effects must stay visually attached to the egg shell/body, not become a separate background scene
- avoid realistic shell fracture rendering. If a crack hint is necessary, it must be extremely subtle, thin, stylized, low-contrast, and painted only on the egg shell surface; crack hints must never extend beyond the egg silhouette or float outside the egg
- do not draw lightning bolts, thick black fracture lines, realistic cracks, branching crack networks, yellow crack fills, yellow outlines, or glowing yellow strips inside cracks

Action-specific intent:

- `idle`: pronounced left-right rocking loop, hard target 45 degrees of tilt at the extremes, returning through center; no ground shadow or base; keep enough padding so the tilted egg is never cropped
- `failed`: larger uneven wobble, hard target 45 degrees of sad tilt, slight downward slump, dimmer color; do not break the shell; no ground shadow or base
- `jumping`: high vertical bounce with obvious lift-off, peak about 25-35% of the egg height above the starting position, slight squash/stretch on takeoff and landing; this is also the feed/praise animation; use only a clean subtle glow attached to the egg body; no floor shadow, no oval base, no gray halo, no background particles
- `levelup`: replace the previous realistic-crack version completely. No lightning strike, no external beam, no flying shell fragments, no realistic shell fracture texture, no branching crack network, no yellow crack fill, and no thick comic-book fracture lines. The egg remains one complete smooth oval silhouette. The effect is a stylized animation overlay: soft cartoon glow shapes, clean bloom, gentle translucent light bands, and simple magical shine contained within the egg silhouette. The whole egg also performs a readable jump while leveling up: early frames crouch/squash slightly with faint glow, middle frames lift upward to a clear jump peak while the glow expands as rounded animated light shapes across the egg body, and late frames descend/land while the glow becomes large and bright enough to almost completely cover the egg, ending with the egg mostly hidden by a clean soft white light mass. The light should grow gradually frame by frame, centered on the egg, graphic and animation-like rather than photorealistic, with no separate background scene. The black-white pattern must stay locked to the egg surface during the jump; do not repaint, erase, or move the color patches.

## Scripts

Scripts live in this skill's `scripts/` directory.

### Remove chroma key

```bash
python3 "$SKILL_DIR/scripts/remove_chroma_key.py" \
  --input-dir  /path/to/raw_generated \
  --output-dir "$ANIMALS_ROOT/$PET_NAME/stage1/长帧"
```

### Slice egg actions

```bash
bash "$SKILL_DIR/scripts/slice_all_actions.sh" \
  "$ANIMALS_ROOT" "$PET_NAME" stage1
```

This egg copy slices only `idle`, `failed`, `jumping`, and `levelup`.

### Generate timing

```bash
python3 "$SKILL_DIR/scripts/generate_timing.py" \
  --frames-dir "$ANIMALS_ROOT/$PET_NAME/stage1/单帧" \
  --output "$ANIMALS_ROOT/$PET_NAME/stage1/animation-timing.json"
```

The shared timing script is compatible because it discovers action folders dynamically.

## Expected Summary

```text
<pet_name>/stage1/
  base.png
  长帧/idle.png failed.png jumping.png levelup.png
  单帧/idle failed jumping levelup
  animation-timing.json
```
