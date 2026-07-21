#!/usr/bin/env python3
"""Generate animation-timing.json for sleep-form stage1 PetPals actions."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ACTION_DEFAULTS: dict[str, dict] = {
    "idle": {"loop": True, "ms": 120, "seq": None},
    "waving": {"loop": False, "ms": 100, "seq": None},
    "eat": {"loop": False, "ms": 100, "seq": None},
    "failed": {"loop": False, "ms": 120, "seq": None},
    "levelup": {"loop": False, "ms": 90, "seq": None},
}


def build_entry(action: str, n_frames: int) -> dict:
    defaults = ACTION_DEFAULTS.get(action, {"loop": False, "ms": 100, "seq": None})
    sequence = list(range(n_frames)) if defaults["seq"] is None else list(defaults["seq"])
    return {
        "loop": defaults["loop"],
        "sequence": sequence,
        "frameDurations": {str(i): defaults["ms"] for i in range(n_frames)},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sleep-form animation timing.")
    parser.add_argument("--frames-dir", required=True, help="Path to 单帧 directory.")
    parser.add_argument("--output", default=None, help="Output animation-timing.json path.")
    args = parser.parse_args()

    frames_dir = Path(args.frames_dir).expanduser().resolve()
    if not frames_dir.is_dir():
        print(f"Error: frames-dir not found: {frames_dir}", file=sys.stderr)
        sys.exit(1)

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else frames_dir.parent / "animation-timing.json"
    )

    existing: dict = {}
    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(f"Warning: could not parse existing timing ({error}); starting fresh.", file=sys.stderr)

    timing: dict = dict(existing)
    added: list[str] = []
    resized: list[str] = []

    action_dirs = sorted(
        d for d in frames_dir.iterdir()
        if d.is_dir() and "backup" not in d.name.lower()
    )
    if not action_dirs:
        print(f"Error: no action directories found in {frames_dir}", file=sys.stderr)
        sys.exit(1)

    for action_dir in action_dirs:
        action = action_dir.name
        frames = sorted(action_dir.glob("*.png"))
        n_frames = len(frames)
        if n_frames == 0:
            continue

        if action not in timing:
            timing[action] = build_entry(action, n_frames)
            added.append(action)
            continue

        durations = timing[action].get("frameDurations", {})
        if len(durations) != n_frames:
            sample = next(iter(durations.values()), ACTION_DEFAULTS.get(action, {}).get("ms", 100))
            timing[action]["frameDurations"] = {str(i): sample for i in range(n_frames)}
            timing[action]["sequence"] = [i for i in timing[action].get("sequence", []) if i < n_frames]
            if not timing[action]["sequence"]:
                timing[action]["sequence"] = list(range(n_frames))
            resized.append(action)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(timing, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote: {output_path}")
    print(f"  Total actions: {len(timing)}")
    if added:
        print(f"  Added: {', '.join(added)}")
    if resized:
        print(f"  Resized durations: {', '.join(resized)}")


if __name__ == "__main__":
    main()
