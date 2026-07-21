---
name: sprite-slicer
description: Slice a horizontal spritesheet or long animation strip into sequential transparent PNG frames using alpha/component-based frame detection, especially when naive equal-width slicing clips adjacent poses or leaves edge fragments.
---

# Sprite Slicer

Use this skill when the user has a horizontal spritesheet or long frame strip and needs it split into `000.png`, `001.png`, `002.png`, etc. Prefer the bundled script over ad hoc cropping.

## Core Approach

Run `scripts/slice_spritesheet.py`. The script uses the stable method from the previous repair workflow:

- convert the image to RGBA
- remove a green chroma-key background when the image has no useful alpha
- identify foreground pixels from alpha
- find connected subject/effect components
- sort main frame components left-to-right
- attach small nearby effects to the nearest main frame
- crop each frame by its transparent foreground bounds
- normalize every output frame onto one consistent transparent canvas
- clean cyan/white/green chroma-key residue on transparent sprite edges
- center subjects and preserve a stable baseline

Do not use plain equal-width slicing as the primary method. `--frame-count` is an expected frame count for validation and recovery; it should still use component/projection detection first.

## Usage

```bash
python scripts/slice_spritesheet.py \
  --input /path/to/spritesheet.png \
  --output /path/to/frames \
  --frame-count 17
```

Without `--frame-count`, the script auto-detects frame count from foreground components.

Useful options:

- `--input`: required source spritesheet path.
- `--output`: required directory for frame PNGs.
- `--frame-count`: optional expected number of frames.
- `--cell-width` and `--cell-height`: optional fixed output frame size.
- `--padding`: transparent padding around each normalized subject.
- `--component-min-area`: minimum area for a main subject component.
- `--no-chroma-key`: skip automatic green-background removal.
- `--no-edge-cleanup`: keep edge pixels exactly as-is. By default the slicer
  removes low-alpha cyan/white/green residue on transparent sprite edges, which
  prevents GIF output from showing hard white or blue-green halos.
- `--edge-alpha-cutoff`: alpha cutoff for low-opacity boundary pixels during
  edge cleanup. Default: `72`.
- `--edge-cleanup-radius`: boundary width inspected by edge cleanup. Default: `2`.
- `--gif-safe-alpha`: optional hard alpha cutoff for GIF-targeted output.

## Output

The output directory is created automatically. Existing `NNN.png` files in the output directory are overwritten. Each frame is an RGBA PNG with a transparent background and a consistent canvas size.

## Notes

- Best for horizontal strips where each pose is mostly separated by transparent or chroma-key background.
- If the source has intentional detached effects, keep them near the corresponding character; the script assigns small components to the nearest main subject by x-position.
- If detection fails, rerun with `--frame-count`, lower `--component-min-area`, or provide `--cell-width`/`--cell-height`.
