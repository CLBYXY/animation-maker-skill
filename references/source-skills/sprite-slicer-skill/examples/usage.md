# Usage

Slice a 17-frame horizontal strip:

```bash
python references/source-skills/sprite-slicer-skill/scripts/slice_spritesheet.py \
  --input /path/to/spritesheet.png \
  --output /path/to/frames \
  --frame-count 17
```

Auto-detect frame count:

```bash
python references/source-skills/sprite-slicer-skill/scripts/slice_spritesheet.py \
  --input /path/to/spritesheet.png \
  --output /path/to/frames
```

Force a fixed output cell size:

```bash
python references/source-skills/sprite-slicer-skill/scripts/slice_spritesheet.py \
  --input /path/to/spritesheet.png \
  --output /path/to/frames \
  --frame-count 9 \
  --cell-width 192 \
  --cell-height 208
```

