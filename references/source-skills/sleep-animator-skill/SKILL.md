---
name: sleep-animator
description: Generate PetPals stage1 sleep-form animation assets from an existing base.png for non-egg newborn pets. Use for sleepy/crouched stage1 pets that should not walk or jump; outputs 长帧 spritesheets, 单帧 frames, and animation-timing.json with idle, waving/eat, failed, and optional levelup.
---

# Sleep Animator

Use this skill for PetPals `stage1` pets whose first form is a sleepy newborn or
crouched baby animal instead of an egg.

Start from:

```text
<ANIMALS_ROOT>/<pet_name>/stage1/base.png
```

Output the same folder shape used by the GIF pipeline:

```text
<pet_name>/stage1/
  base.png
  长帧/idle.png waving.png eat.png failed.png levelup.png
  单帧/idle waving eat failed levelup
  animation-timing.json
```

`levelup` is included because stage1 can still transition to stage2. If the user
explicitly asks for no levelup, skip it and the timing script will omit it.

## Actions

Generate only these actions by default:

| Action | Frames | Loop | Visual intent |
| --- | ---: | --- | --- |
| `idle` | 8 | true | Clear sleepy breathing loop; body visibly rises/falls, eyes closed, soft limb twitch |
| `waving` | 8 | false | Sleepy but readable greeting; wakes halfway, lifts paw/wing/fin clearly, waves twice, lies back down |
| `eat` | 8 | false | Alias of `waving`; do not draw eating props |
| `failed` | 8 | false | Strong discouraged bury-head action; curls smaller, face hides, ears/tail/wing/fin droop |
| `levelup` | 10 | false | Sleeping glow cue; pet stays asleep while soft light grows around and over the body |

Do not generate:

- `jumping`
- `walk_left`
- `walk_right`
- `running-left`
- `running-right`
- separate food/eating props

## Workflow

```text
[ ] 1. Validate stage is stage1 and base.png exists.
[ ] 2. Read base.png visually; confirm it is a sleepy/crouched animal, not an egg.
[ ] 3. Generate raw green-screen or transparent long-frame spritesheets.
[ ] 4. Remove chroma key into 长帧/.
[ ] 5. Run alias sync so eat uses waving.
[ ] 6. Slice 长帧/ into 单帧/.
[ ] 7. Run alias sync again so 单帧/eat matches 单帧/waving.
[ ] 8. Generate animation-timing.json.
[ ] 9. Report output paths and skipped actions.
```

## Prompt Guidance

Use `base.png` as the canonical reference. Preserve species, colors, fur pattern,
face, body proportion, pose family, and cute plush-toy style.

If `base.png` contains a background color, floor, contact shadow, canvas, or
lighting scene, ignore those artifacts and use only the pet body as the subject.

All prompts must enforce:

- one horizontal spritesheet row
- the spritesheet must be visually long enough for clean slicing: each frame is
  inside its own wide, equal-size cell, and there must be a clear pure-green
  empty gutter between neighboring pets. The pet body, glow, particles, fur, and
  any effect must stay inside its own cell and must never touch or overlap the
  next frame. Prefer generous spacing even if the pet appears slightly smaller.
- for 8-frame actions, aim for a very wide 1x8 sheet; for 10-frame `levelup`,
  aim for a very wide 1x10 sheet. Do not compress frames tightly together.
- transparent background if possible; otherwise pure green chroma-key background
- no title, numbering, borders, props, food, bowls, ground, floor, cast shadow,
  oval base, decorative background, scene lighting, or white canvas
- the complete pet remains visible in every frame; never crop ears, tail, paws,
  wings, fins, fur, or glow
- keep the pet in a sleepy/crouched stage1 body language; no walking, running,
  leaping, upright adult pose, or full jump
- make each action readable after GIF export; do not use tiny micro-movements
  that collapse into a static image
- exaggerate only the intended body part: breathing affects the whole torso,
  waving affects one paw/wing/fin, failed lowers the head/body, levelup keeps the
  pet asleep and only grows light around the whole pet
- keep size and baseline consistent between actions, except failed may lower the
  head; levelup should keep the same sleeping body position and baseline

Action-specific prompts:

- `idle`: sleepy breathing loop. The pet remains fully lying down with eyes
  closed, but the motion must be visible: the torso expands upward and relaxes
  downward by about 8-12% of body height, the head gently follows the breathing
  without lifting off the resting pose, and one ear/tail/wing/fin gives a small
  sleepy twitch near the middle of the loop. The first and last frames must
  match cleanly for a seamless loop. Do not let the pet slide horizontally.
- `waving`: sleepy greeting. The pet is roused from sleep but still stays
  crouched/lying down. It slowly opens or half-opens the eyes, lifts one visible
  front paw/wing/fin clearly away from the body, waves twice with a readable arc,
  then lowers it back and returns to a drowsy resting pose. The raised limb must
  be easy to see even at small teacher-wall size. No food, bowl, sparkles, or
  props.
- `eat`: do not generate separately unless explicitly requested. Use
  `scripts/sync_alias_actions.sh` so `eat` is the same visual as `waving`.
- `failed`: strong discouraged sleepy reaction. The pet begins in its normal
  lying pose, then visibly pulls inward: shoulders/body compress smaller, head
  sinks down into the front paws/body, face turns downward or becomes partly
  hidden, and ears/tail/wing/fin droop. End on a clear "埋头" pose, not just a
  darker idle frame. Keep it cute and soft; no tears unless asked, no impact
  marks, no falling over, no dramatic collapse.
- `levelup`: sleeping glow cue. The pet stays asleep in the same lying/crouched
  pose for the whole animation: eyes closed, head resting, body baseline stable,
  no waking up, no lifting head, no opening eyes, no jump, no standing. The only
  major change is magical light: frame by frame, a soft cartoon glow appears
  around the sleeping body, then grows stronger and warmer, with rounded bloom,
  soft white/gold aura, gentle light rings, and tiny particles attached close to
  the pet. In the final frames the glow becomes bright enough to partially cover
  the sleeping pet, suggesting quiet evolution while it dreams. Keep the effect
  cute, soft, and animation-like; no lightning, no explosion, no beam, no shell
  cracks, no flying fragments, no dramatic scene. Because `levelup` glow can get
  wide, leave especially large pure-green gutters between all 10 frames; the
  brightest final glow must still remain fully inside its own frame cell and must
  not connect to the previous or next frame.

## Scripts

Set:

```bash
SKILL_DIR="references/source-skills/sleep-animator-skill"
ANIMALS_ROOT="workspace/animals"
PET_NAME="熊猫"
```

Remove chroma key:

```bash
python3 "$SKILL_DIR/scripts/remove_chroma_key.py" \
  --input-dir /path/to/raw_generated \
  --output-dir "$ANIMALS_ROOT/$PET_NAME/stage1/长帧"
```

Sync `eat` to `waving`:

```bash
bash "$SKILL_DIR/scripts/sync_alias_actions.sh" \
  "$ANIMALS_ROOT" "$PET_NAME" stage1
```

Slice:

```bash
bash "$SKILL_DIR/scripts/slice_all_actions.sh" \
  "$ANIMALS_ROOT" "$PET_NAME" stage1
```

Generate timing:

```bash
python3 "$SKILL_DIR/scripts/generate_timing.py" \
  --frames-dir "$ANIMALS_ROOT/$PET_NAME/stage1/单帧" \
  --output "$ANIMALS_ROOT/$PET_NAME/stage1/animation-timing.json"
```

## Notes

- This skill does not modify `makegif`, `refresh`, frontend code, SQL, or Gitee.
- `eat` is represented as a duplicated asset folder/file so the existing GIF and
  database refresh pipeline can keep treating it as a normal action URL.
- If the user later wants frontend-level event mapping instead of duplicated
  assets, that is a separate code change outside this skill.
