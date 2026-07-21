#!/usr/bin/env python3
"""Remove green chroma-key background from PetPals sleep-form spritesheets."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def remove_green_key(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")

    alpha = np.array(image.getchannel("A"))
    if alpha.min() == 0 and alpha.max() > 0:
        return image

    arr = np.array(image)
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)

    green_mask = (g > 115) & ((g - r) > 45) & ((g - b) > 35)
    arr[green_mask, 3] = 0

    foreground = ~green_mask
    green_dominant = foreground & (g > np.maximum(r, b))
    arr[green_dominant, 1] = np.maximum(arr[green_dominant, 0], arr[green_dominant, 2])
    arr[arr[:, :, 3] == 0, :3] = 0

    return Image.fromarray(arr)


def process_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    image = remove_green_key(src)
    image.save(dst)
    print(f"  {src.name} -> {dst} ({image.size[0]}x{image.size[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove green chroma-key from spritesheet PNGs.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input", help="Single input PNG path.")
    group.add_argument("--input-dir", help="Directory of PNG files.")
    out_group = parser.add_mutually_exclusive_group()
    out_group.add_argument("--output", help="Single output PNG path.")
    out_group.add_argument("--output-dir", help="Batch output directory.")
    args = parser.parse_args()

    if args.input:
        src = Path(args.input).expanduser().resolve()
        if not src.exists():
            print(f"Error: input not found: {src}", file=sys.stderr)
            sys.exit(1)
        dst = Path(args.output).expanduser().resolve() if args.output else src.with_suffix(".out.png")
        process_file(src, dst)
        return

    src_dir = Path(args.input_dir).expanduser().resolve()
    dst_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else src_dir
    pngs = sorted(src_dir.glob("*.png"))
    if not pngs:
        print(f"No PNG files found in: {src_dir}", file=sys.stderr)
        sys.exit(1)
    for src in pngs:
        process_file(src, dst_dir / src.name)


if __name__ == "__main__":
    main()
