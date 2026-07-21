#!/usr/bin/env bash
# slice_all_actions.sh
# Slice all action long-frame PNGs into single frames for a PetPals pet/stage.
# Then derive running-left by horizontally flipping running-right.
#
# Usage:
#   bash slice_all_actions.sh <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]
#
# Examples:
#   bash slice_all_actions.sh /path/to/animals hamster stage3
#   bash slice_all_actions.sh /path/to/animals pet_name stage2 "levelup=12"
#   bash slice_all_actions.sh /path/to/animals cat stage1 "idle=6,happy=6"
#
# Frame count override format: comma-separated "action=N" pairs.
#
# Environment override:
#   SLICER_PATH=/custom/path/to/slice_spritesheet.py

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
# ── Paths ────────────────────────────────────────────────────────────────────
SLICER="${SLICER_PATH:-$SKILL_ROOT/references/source-skills/sprite-slicer-skill/scripts/slice_spritesheet.py}"

if [[ ! -f "$SLICER" ]]; then
  echo "Error: sprite-slicer not found at: $SLICER"
  echo "Set SLICER_PATH environment variable to override."
  exit 1
fi

# ── Arguments ────────────────────────────────────────────────────────────────
ANIMALS_ROOT="${1:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"
ANIMAL="${2:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"
STAGE="${3:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"

LONG_DIR="$ANIMALS_ROOT/$ANIMAL/$STAGE/长帧"
SINGLE_DIR="$ANIMALS_ROOT/$ANIMAL/$STAGE/单帧"

# ── Optional frame count overrides (4th arg: "action=N,...") ─────────────────
FRAME_COUNT_OVERRIDES="${4:-}"
if [[ -n "${4:-}" ]]; then
  IFS=',' read -ra OVERRIDES <<< "$4"
  for ov in "${OVERRIDES[@]}"; do
    key="${ov%%=*}"; val="${ov##*=}"
    echo "  Override: $key = $val frames"
  done
fi

frame_count_for() {
  local action="$1"
  local override key val
  if [[ -n "$FRAME_COUNT_OVERRIDES" ]]; then
    IFS=',' read -ra OVERRIDES <<< "$FRAME_COUNT_OVERRIDES"
    for override in "${OVERRIDES[@]}"; do
      key="${override%%=*}"
      val="${override##*=}"
      if [[ "$key" == "$action" ]]; then
        echo "$val"
        return
      fi
    done
  fi

  # Keep this Bash 3 compatible for stock macOS /bin/bash.
  case "$action" in
    levelup) echo 10 ;;
    idle|running-right|jumping|waving|failed|eat|happy) echo 8 ;;
    *) echo 8 ;;
  esac
}
# running-left is derived from running-right, not sliced directly

# ── Header ───────────────────────────────────────────────────────────────────
echo "=== slice_all_actions: $ANIMAL / $STAGE ==="
echo "  长帧 source : $LONG_DIR"
echo "  单帧 output : $SINGLE_DIR"
echo ""

# ── Slice all generated actions ──────────────────────────────────────────────
# Consistent parameters for ALL actions to prevent cross-action character size inconsistency:
#   --cell-width 256        : normalize to 256px wide
#   --no-chroma-key         : 长帧 already has transparent background
#   (no --cell-height)      : auto-derive height from content, auto-expand if needed
for action in idle running-right jumping waving failed eat happy levelup; do
  long_png="$LONG_DIR/$action.png"
  if [[ ! -f "$long_png" ]]; then
    echo "⚠️  Skipping $action (long-frame not found: $long_png)"
    continue
  fi
  n="$(frame_count_for "$action")"
  echo "--- $action ($n frames) ---"
  python3 "$SLICER" \
    --input  "$long_png" \
    --output "$SINGLE_DIR/$action" \
    --frame-count "$n" \
    --cell-width 256 \
    --no-chroma-key \
    --json 2>/dev/null
done

# ── Derive running-left by flipping running-right ────────────────────────────
if [[ -d "$SINGLE_DIR/running-right" ]]; then
  echo ""
  echo "--- running-left (flip running-right) ---"
  mkdir -p "$SINGLE_DIR/running-left"
  python3 - "$SINGLE_DIR/running-right" "$SINGLE_DIR/running-left" <<'PYEOF'
import sys
from PIL import Image
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
frames = sorted(src.glob('*.png'))
if not frames:
    print('Error: no frames found in running-right directory', file=sys.stderr)
    sys.exit(1)
for f in frames:
    Image.open(f).transpose(Image.FLIP_LEFT_RIGHT).save(dst / f.name)
print(f'{{"action": "running-left", "frame_count": {len(frames)}, "method": "flip_running_right"}}')
PYEOF
else
  echo "⚠️  Skipping running-left (running-right single frames not found)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Done — frame summary ==="
python3 - "$SINGLE_DIR" <<'PYEOF'
import sys
from PIL import Image
from pathlib import Path

root = Path(sys.argv[1])
for a in sorted(root.iterdir()):
    if not a.is_dir() or 'backup' in a.name.lower():
        continue
    frames = sorted(a.glob('*.png'))
    if frames:
        sz = Image.open(frames[0]).size
        print(f"  {a.name:16s}  {len(frames):2d} frames  {sz[0]}×{sz[1]}")
PYEOF
