#!/usr/bin/env bash
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="$SKILL_ROOT/assets/animation-workbench"
PORT="${PORT:-1234}"

mkdir -p "$SKILL_ROOT/workspace/animals" "$SKILL_ROOT/scripts"
cd "$APP_ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev -- --host 127.0.0.1 --port "$PORT" --strictPort
