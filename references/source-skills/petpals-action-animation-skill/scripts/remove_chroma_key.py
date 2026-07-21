#!/usr/bin/env python3
"""
remove_chroma_key.py
Remove green (#00FF00) chroma-key background from a spritesheet PNG.
Produces a transparent-background PNG suitable for PetPals 长帧 storage.

Usage (single file):
  python3 remove_chroma_key.py --input raw.png --output 长帧/action.png

Usage (batch — all PNGs in a directory):
  python3 remove_chroma_key.py --input-dir /path/to/raw/ --output-dir /path/to/长帧/

The green threshold matches slice_spritesheet.py:
  g > 115  AND  (g - r) > 45  AND  (g - b) > 35
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def remove_green_key(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")

    # If the image already has useful alpha, assume chroma key was already removed.
    alpha = np.array(im.getchannel("A"))
    if alpha.min() == 0 and alpha.max() > 0:
        return im  # already transparent — pass through unchanged

    arr = np.array(im)
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)

    green_mask = (g > 115) & ((g - r) > 45) & ((g - b) > 35)
    arr[green_mask, 3] = 0

    # Suppress green dominance on pixels that are very green but not pure bg
    foreground = ~green_mask
    green_dominant = foreground & (g > np.maximum(r, b))
    arr[green_dominant, 1] = np.maximum(arr[green_dominant, 0], arr[green_dominant, 2])

    # Zero out RGB for fully transparent pixels to avoid residue
    arr[arr[:, :, 3] == 0, :3] = 0

    return Image.fromarray(arr, "RGBA")


def process_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = remove_green_key(src)
    im.save(dst)
    print(f"  {src.name} → {dst}  ({im.size[0]}×{im.size[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove green chroma-key background from PetPals spritesheet PNGs."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input", help="Single input PNG path.")
    group.add_argument("--input-dir", help="Batch: directory of PNG files to process.")

    out_group = parser.add_mutually_exclusive_group()
    out_group.add_argument("--output", help="Single output PNG path (use with --input).")
    out_group.add_argument("--output-dir", help="Batch: output directory (use with --input-dir).")

    args = parser.parse_args()

    if args.input:
        src = Path(args.input).expanduser().resolve()
        if not src.exists():
            print(f"Error: input not found: {src}", file=sys.stderr)
            sys.exit(1)
        dst = Path(args.output).expanduser().resolve() if args.output else src.with_suffix(".out.png")
        process_file(src, dst)

    else:  # batch mode
        src_dir = Path(args.input_dir).expanduser().resolve()
        dst_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else src_dir
        pngs = sorted(src_dir.glob("*.png"))
        if not pngs:
            print(f"No PNG files found in: {src_dir}", file=sys.stderr)
            sys.exit(1)
        for src in pngs:
            process_file(src, dst_dir / src.name)

    print("Done.")


if __name__ == "__main__":
    main()
