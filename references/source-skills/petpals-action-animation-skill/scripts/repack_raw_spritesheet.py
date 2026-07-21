#!/usr/bin/env python3
"""Repack a raw green-screen spritesheet without altering character pixels.

This helper keeps each detected frame's original RGB rectangle intact, places
those rectangles onto a fresh #00ff00 canvas, and enforces a visible gap between
detected subject bounding boxes. It is intentionally conservative: it does not
resize, rotate, alpha-matte, or redraw the character.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


GREEN = (0, 255, 0)


def foreground_mask(im: Image.Image) -> np.ndarray:
    rgb = np.array(im.convert("RGB"))
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    green = (g > 115) & ((g - r) > 45) & ((g - b) > 35)
    return ~green


def frame_boxes(
    im: Image.Image,
    frame_count: int,
    min_component_area: int,
) -> list[tuple[int, int, int, int]]:
    mask = foreground_mask(im)
    cell_width = im.width / frame_count
    centers = np.array([(idx + 0.5) * cell_width for idx in range(frame_count)])
    groups: list[list[tuple[int, int, int, int]]] = [[] for _ in range(frame_count)]

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8),
        connectivity=8,
    )
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if area < min_component_area:
            continue
        center_x = float(centroids[label][0])
        frame_idx = int(np.argmin(np.abs(centers - center_x)))
        groups[frame_idx].append((int(x), int(y), int(x + width), int(y + height)))

    boxes: list[tuple[int, int, int, int]] = []
    for idx, group in enumerate(groups):
        if not group:
            raise ValueError(f"frame {idx:03d} has no detected foreground component")
        left = min(item[0] for item in group)
        top = min(item[1] for item in group)
        right = max(item[2] for item in group)
        bottom = max(item[3] for item in group)
        boxes.append((left, top, right, bottom))
    return boxes


def repack(
    src: Path,
    dst: Path,
    frame_count: int,
    gap: int,
    edge_margin: int,
    min_component_area: int,
) -> None:
    im = Image.open(src).convert("RGB")
    boxes = frame_boxes(im, frame_count, min_component_area)

    widths = [right - left for left, _, right, _ in boxes]
    heights = [bottom - top for _, top, _, bottom in boxes]
    new_width = sum(widths) + gap * (frame_count - 1) + edge_margin * 2
    new_height = max(heights) + edge_margin * 2

    out = Image.new("RGB", (new_width, new_height), GREEN)
    x = edge_margin
    placements = []
    for idx, (left, top, right, bottom) in enumerate(boxes):
        crop = im.crop((left, top, right, bottom))
        y = edge_margin + (new_height - edge_margin * 2 - crop.height) // 2
        out.paste(crop, (x, y))
        placements.append(
            {
                "frame": idx,
                "source_box": [left, top, right, bottom],
                "dest_box": [x, y, x + crop.width, y + crop.height],
            }
        )
        x += crop.width + gap

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    print(
        f"repacked {src} -> {dst} size={new_width}x{new_height} "
        f"frames={frame_count} gap={gap}px"
    )
    for item in placements:
        print(
            f"  frame {item['frame']:03d}: "
            f"src={item['source_box']} dst={item['dest_box']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Input raw PNG.")
    parser.add_argument("--output", required=True, help="Output repacked raw PNG.")
    parser.add_argument("--frame-count", type=int, required=True)
    parser.add_argument(
        "--gap",
        type=int,
        default=30,
        help="Visible green gap between detected subject bounding boxes.",
    )
    parser.add_argument(
        "--edge-margin",
        type=int,
        default=30,
        help="Outer green margin around the first and last subject boxes.",
    )
    parser.add_argument(
        "--min-component-area",
        type=int,
        default=18,
        help="Small foreground components below this area are ignored.",
    )
    args = parser.parse_args()

    repack(
        Path(args.input).expanduser().resolve(),
        Path(args.output).expanduser().resolve(),
        args.frame_count,
        args.gap,
        args.edge_margin,
        args.min_component_area,
    )


if __name__ == "__main__":
    main()
