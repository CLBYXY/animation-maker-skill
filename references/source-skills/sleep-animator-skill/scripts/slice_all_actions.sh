#!/usr/bin/env bash
# Slice sleep-form stage1 long-frame PNGs into 单帧 action folders.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SLICER="${SLICER_PATH:-$SKILL_ROOT/references/source-skills/sprite-slicer-skill/scripts/slice_spritesheet.py}"

if [[ ! -f "$SLICER" ]]; then
  echo "Error: sprite-slicer not found at: $SLICER"
  echo "Set SLICER_PATH to override."
  exit 1
fi

ANIMALS_ROOT="${1:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"
ANIMAL="${2:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"
STAGE="${3:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage> [frame_count_overrides]}"

if [[ "$STAGE" != "stage1" ]]; then
  echo "Error: sleep-animator only supports stage1, got: $STAGE"
  exit 1
fi

LONG_DIR="$ANIMALS_ROOT/$ANIMAL/$STAGE/长帧"
SINGLE_DIR="$ANIMALS_ROOT/$ANIMAL/$STAGE/单帧"

IDLE_FRAMES=8
WAVING_FRAMES=8
EAT_FRAMES=8
FAILED_FRAMES=8
LEVELUP_FRAMES=10

frame_count_for() {
  case "$1" in
    idle) echo "$IDLE_FRAMES" ;;
    waving) echo "$WAVING_FRAMES" ;;
    eat) echo "$EAT_FRAMES" ;;
    failed) echo "$FAILED_FRAMES" ;;
    levelup) echo "$LEVELUP_FRAMES" ;;
    *)
      echo "Error: unknown sleep action: $1" >&2
      exit 1
      ;;
  esac
}

if [[ -n "${4:-}" ]]; then
  IFS=',' read -ra OVERRIDES <<< "$4"
  for ov in "${OVERRIDES[@]}"; do
    key="${ov%%=*}"
    val="${ov##*=}"
    case "$key" in
      idle) IDLE_FRAMES="$val" ;;
      waving) WAVING_FRAMES="$val"; EAT_FRAMES="$val" ;;
      eat) EAT_FRAMES="$val" ;;
      failed) FAILED_FRAMES="$val" ;;
      levelup) LEVELUP_FRAMES="$val" ;;
      *)
        echo "Error: unknown sleep action override: $key"
        exit 1
        ;;
    esac
    echo "  Override: $key = $val frames"
  done
fi

echo "=== slice_sleep_actions: $ANIMAL / $STAGE ==="
echo "  长帧 source : $LONG_DIR"
echo "  单帧 output : $SINGLE_DIR"
echo ""

for action in idle waving eat failed levelup; do
  long_png="$LONG_DIR/$action.png"
  if [[ ! -f "$long_png" ]]; then
    echo "⚠️  Skipping $action (long-frame not found: $long_png)"
    continue
  fi
  n="$(frame_count_for "$action")"
  echo "--- $action ($n frames) ---"
  python3 "$SLICER" \
    --input "$long_png" \
    --output "$SINGLE_DIR/$action" \
    --frame-count "$n" \
    --cell-width 256 \
    --no-chroma-key \
    --component-min-area 999999999 \
    --json 2>/dev/null
done

echo ""
echo "=== Done — frame summary ==="
python3 - "$SINGLE_DIR" <<'PYEOF'
import sys
from PIL import Image
from pathlib import Path

root = Path(sys.argv[1])
for action_dir in sorted(root.iterdir()):
    if not action_dir.is_dir() or "backup" in action_dir.name.lower():
        continue
    frames = sorted(action_dir.glob("*.png"))
    if frames:
        size = Image.open(frames[0]).size
        print(f"  {action_dir.name:12s}  {len(frames):2d} frames  {size[0]}×{size[1]}")
PYEOF
