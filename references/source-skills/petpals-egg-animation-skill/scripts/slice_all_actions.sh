#!/usr/bin/env bash
# slice_all_actions.sh
# Slice egg-stage long-frame PNGs into single frames for a PetPals pet/stage.
#
# Usage:
#   bash slice_all_actions.sh <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]
#
# Examples:
#   bash slice_all_actions.sh /path/to/animals dog stage1
#   bash slice_all_actions.sh /path/to/animals tiger stage1 "levelup=12"
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

# ── Default frame counts ─────────────────────────────────────────────────────
# macOS ships bash 3.2, so avoid associative arrays here.
IDLE_FRAMES=8
JUMPING_FRAMES=8
FAILED_FRAMES=8
LEVELUP_FRAMES=10

frame_count_for() {
  case "$1" in
    idle) echo "$IDLE_FRAMES" ;;
    jumping) echo "$JUMPING_FRAMES" ;;
    failed) echo "$FAILED_FRAMES" ;;
    levelup) echo "$LEVELUP_FRAMES" ;;
    *)
      echo "Error: unknown egg action: $1" >&2
      exit 1
      ;;
  esac
}

# ── Optional frame count overrides (4th arg: "action=N,...") ─────────────────
if [[ -n "${4:-}" ]]; then
  IFS=',' read -ra OVERRIDES <<< "$4"
  for ov in "${OVERRIDES[@]}"; do
    key="${ov%%=*}"; val="${ov##*=}"
    case "$key" in
      idle) IDLE_FRAMES="$val" ;;
      jumping) JUMPING_FRAMES="$val" ;;
      failed) FAILED_FRAMES="$val" ;;
      levelup) LEVELUP_FRAMES="$val" ;;
      *)
        echo "Error: unknown egg action override: $key"
        exit 1
        ;;
    esac
    echo "  Override: $key = $val frames"
  done
fi

# ── Header ───────────────────────────────────────────────────────────────────
if [[ "$STAGE" != "stage1" ]]; then
  echo "Error: petpals-egg-animation only supports stage1, got: $STAGE"
  exit 1
fi

echo "=== slice_egg_actions: $ANIMAL / $STAGE ==="
echo "  长帧 source : $LONG_DIR"
echo "  单帧 output : $SINGLE_DIR"
echo ""

# ── Slice all generated actions ──────────────────────────────────────────────
# Consistent parameters for ALL actions to prevent cross-action character size inconsistency:
#   --cell-width 256        : normalize to 256px wide
#   --no-chroma-key         : 长帧 already has transparent background
#   (no --cell-height)      : auto-derive height from content, auto-expand if needed
# Egg edges can contain tiny disconnected anti-aliased pixels. Force the shared slicer
# to use projection fallback so component cleanup does not delete valid egg pixels.
for action in idle jumping failed levelup; do
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
    --component-min-area 999999999 \
    --json 2>/dev/null
done

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
