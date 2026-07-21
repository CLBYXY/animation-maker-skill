#!/usr/bin/env bash
# Keep sleep-form eat assets identical to waving assets.

set -euo pipefail

ANIMALS_ROOT="${1:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage>}"
ANIMAL="${2:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage>}"
STAGE="${3:?Usage: $0 <ANIMALS_ROOT> <pet_name> <stage>}"

if [[ "$STAGE" != "stage1" ]]; then
  echo "Error: sleep-animator only supports stage1, got: $STAGE"
  exit 1
fi

STAGE_DIR="$ANIMALS_ROOT/$ANIMAL/$STAGE"
LONG_DIR="$STAGE_DIR/长帧"
SINGLE_DIR="$STAGE_DIR/单帧"

if [[ -f "$LONG_DIR/waving.png" ]]; then
  mkdir -p "$LONG_DIR"
  cp "$LONG_DIR/waving.png" "$LONG_DIR/eat.png"
  echo "Synced 长帧/eat.png from 长帧/waving.png"
fi

if [[ -d "$SINGLE_DIR/waving" ]]; then
  mkdir -p "$SINGLE_DIR"
  if [[ -d "$SINGLE_DIR/eat" ]]; then
    find "$SINGLE_DIR/eat" -type f -delete
    find "$SINGLE_DIR/eat" -depth -type d -empty -delete
  fi
  cp -R "$SINGLE_DIR/waving" "$SINGLE_DIR/eat"
  echo "Synced 单帧/eat from 单帧/waving"
fi
