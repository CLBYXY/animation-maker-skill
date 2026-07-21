#!/usr/bin/env python3
"""
generate_timing.py
Generate animation-timing.json for a PetPals pet/stage.

Scans the given 单帧 directory to discover actions and frame counts, then writes
animation-timing.json with PetPals-standard defaults. Existing values in an
already-present animation-timing.json are preserved; only missing actions get
defaults added.

Folders whose names contain "backup" are skipped.

Usage:
  python3 generate_timing.py \
    --frames-dir /path/to/单帧 \
    --output     /path/to/animation-timing.json

If --output is omitted, the file is written next to 单帧 (i.e. ../animation-timing.json).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ── Action-level defaults ────────────────────────────────────────────────────
# loop: whether the animation loops continuously
# ms:   milliseconds per frame
# seq:  optional fixed sequence (list of frame indices); None means [0, 1, ..., N-1]
ACTION_DEFAULTS: dict[str, dict] = {
    "idle":          {"loop": True,  "ms": 90,  "seq": None},
    "running-right": {"loop": True,  "ms": 90,  "seq": None},
    "running-left":  {"loop": True,  "ms": 90,  "seq": None},
    "jumping":       {"loop": False, "ms": 90,  "seq": None},
    "waving":        {"loop": True,  "ms": 90,  "seq": None},
    "failed":        {"loop": False, "ms": 120, "seq": None},
    "eat":           {"loop": False, "ms": 90,  "seq": "eat_special"},
    "happy":         {"loop": False, "ms": 90,  "seq": None},
    "levelup":       {"loop": False, "ms": 80,  "seq": None},
}


def eat_sequence(n_frames: int) -> list[int]:
    """
    Eat action: intro frame → eating loop × 3 → exit frame.
    For 8 frames: [0, 1,2,3,4,5,6, 1,2,3,4,5,6, 1,2,3,4,5,6, 7]
    For other frame counts: [0, mid..., mid..., mid..., n-1]
    """
    if n_frames < 3:
        return list(range(n_frames))
    mid_start = 1
    mid_end = n_frames - 1  # exclusive last frame (exit)
    mid = list(range(mid_start, mid_end))
    return [0] + mid + mid + mid + [n_frames - 1]


def build_entry(action: str, n_frames: int) -> dict:
    """Build a timing entry for a given action with n_frames frames."""
    defaults = ACTION_DEFAULTS.get(action, {"loop": False, "ms": 90, "seq": None})
    ms = defaults["ms"]
    seq_spec = defaults["seq"]

    if seq_spec == "eat_special":
        sequence = eat_sequence(n_frames)
    elif seq_spec is None:
        sequence = list(range(n_frames))
    else:
        sequence = list(seq_spec)

    frame_durations = {str(i): ms for i in range(n_frames)}

    return {
        "loop": defaults["loop"],
        "sequence": sequence,
        "frameDurations": frame_durations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate animation-timing.json with PetPals-standard defaults."
    )
    parser.add_argument(
        "--frames-dir", required=True,
        help="Path to the 单帧 directory (parent of action subdirectories)."
    )
    parser.add_argument(
        "--output", default=None,
        help="Output path for animation-timing.json. "
             "Defaults to <frames-dir>/../animation-timing.json."
    )
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

    # ── Load existing timing (preserve user-edited values) ──────────────────
    existing: dict = {}
    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
            print(f"Loaded existing: {output_path}")
        except json.JSONDecodeError as e:
            print(f"Warning: could not parse existing file ({e}); starting fresh.", file=sys.stderr)

    # ── Scan 单帧 for actions ────────────────────────────────────────────────
    timing: dict = dict(existing)  # start from existing, add/fill missing

    action_dirs = sorted(
        d for d in frames_dir.iterdir()
        if d.is_dir() and "backup" not in d.name.lower()
    )
    if not action_dirs:
        print(f"Error: no action directories found in {frames_dir}", file=sys.stderr)
        sys.exit(1)

    added = []
    updated_seq = []

    for action_dir in action_dirs:
        action = action_dir.name
        frames = sorted(action_dir.glob("*.png"))
        n_frames = len(frames)
        if n_frames == 0:
            print(f"  ⚠️  {action}: no PNG frames found, skipping")
            continue

        if action in timing:
            # Preserve the existing entry — but update frame_durations if frame count changed
            existing_entry = timing[action]
            existing_durations = existing_entry.get("frameDurations", {})
            if len(existing_durations) != n_frames:
                ms_sample = next(iter(existing_durations.values()), 90) if existing_durations else 90
                timing[action]["frameDurations"] = {str(i): ms_sample for i in range(n_frames)}
                updated_seq.append(action)
        else:
            # New action — apply defaults
            timing[action] = build_entry(action, n_frames)
            added.append(action)

    # ── Write output ─────────────────────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(timing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

    # ── Report ───────────────────────────────────────────────────────────────
    print(f"\nWrote: {output_path}")
    print(f"  Total actions: {len(timing)}")
    if added:
        print(f"  Added (new defaults): {', '.join(added)}")
    if updated_seq:
        print(f"  Updated frameDurations (frame count changed): {', '.join(updated_seq)}")
    if not added and not updated_seq:
        print("  No changes (all actions already present).")


if __name__ == "__main__":
    main()
