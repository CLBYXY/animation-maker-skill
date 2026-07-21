#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def load_rgba(path: Path, chroma_key: bool = True) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    if not chroma_key:
        return im

    alpha = np.array(im.getchannel("A"))
    has_useful_alpha = alpha.min() == 0 and alpha.max() > 0
    if has_useful_alpha:
        return im

    arr = np.array(im)
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


def image_components(mask: np.ndarray) -> list[dict]:
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    comps: list[dict] = []

    for y0, x0 in np.argwhere(mask):
        y = int(y0)
        x = int(x0)
        if seen[y, x]:
            continue

        stack = [(x, y)]
        seen[y, x] = True
        xs: list[int] = []
        ys: list[int] = []

        while stack:
            x, y = stack.pop()
            xs.append(x)
            ys.append(y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))

        x_arr = np.array(xs, dtype=np.int32)
        y_arr = np.array(ys, dtype=np.int32)
        comps.append(
            {
                "x1": int(x_arr.min()),
                "y1": int(y_arr.min()),
                "x2": int(x_arr.max()) + 1,
                "y2": int(y_arr.max()) + 1,
                "area": int(len(xs)),
                "xs": x_arr,
                "ys": y_arr,
            }
        )

    return comps


def projection_intervals(alpha: np.ndarray, expected_count: int | None) -> list[tuple[int, int]]:
    counts = (alpha > 0).sum(axis=0)
    threshold = max(3, min(20, int(alpha.shape[0] * 0.02)))
    active = counts > threshold

    intervals: list[tuple[int, int]] = []
    start = None
    for i, value in enumerate(active):
        if value and start is None:
            start = i
        elif not value and start is not None:
            intervals.append((start, i))
            start = None
    if start is not None:
        intervals.append((start, len(active)))

    merged: list[tuple[int, int]] = []
    for left, right in intervals:
        if merged and left - merged[-1][1] <= 6:
            merged[-1] = (merged[-1][0], right)
        else:
            merged.append((left, right))

    while len(merged) > 1 and any((right - left) < 20 for left, right in merged):
        idx = next(i for i, (left, right) in enumerate(merged) if (right - left) < 20)
        if idx == 0:
            merged[1] = (merged[0][0], merged[1][1])
            del merged[0]
        elif idx == len(merged) - 1:
            merged[idx - 1] = (merged[idx - 1][0], merged[idx][1])
            del merged[idx]
        else:
            left_gap = merged[idx][0] - merged[idx - 1][1]
            right_gap = merged[idx + 1][0] - merged[idx][1]
            if left_gap <= right_gap:
                merged[idx - 1] = (merged[idx - 1][0], merged[idx][1])
                del merged[idx]
            else:
                merged[idx + 1] = (merged[idx][0], merged[idx + 1][1])
                del merged[idx]

    if expected_count is not None:
        while len(merged) > expected_count:
            gaps = [(merged[i + 1][0] - merged[i][1], i) for i in range(len(merged) - 1)]
            _, idx = min(gaps)
            merged[idx] = (merged[idx][0], merged[idx + 1][1])
            del merged[idx + 1]

        while len(merged) < expected_count and merged:
            widths = [right - left for left, right in merged]
            idx = max(range(len(merged)), key=lambda i: widths[i])
            left, right = merged[idx]
            mid = round((left + right) / 2)
            if mid <= left or mid >= right:
                break
            merged[idx : idx + 1] = [(left, mid), (mid, right)]

    return merged


def crops_from_components(
    im: Image.Image,
    expected_count: int | None,
    min_area: int,
    crop_padding: int,
) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    arr = np.array(im)
    comps = image_components(arr[:, :, 3] > 0)
    main = [comp for comp in comps if comp["area"] >= min_area]
    main.sort(key=lambda comp: (comp["x1"] + comp["x2"]) / 2)

    if expected_count is not None and len(main) != expected_count:
        raise ValueError(f"component method found {len(main)} main components, expected {expected_count}")
    if expected_count is None and not main:
        raise ValueError("component method found no main components")

    centers = np.array([(comp["x1"] + comp["x2"]) / 2 for comp in main])
    assigned: list[list[dict]] = [[] for _ in main]
    main_ids = {id(comp) for comp in main}
    for comp in comps:
        if id(comp) in main_ids or comp["area"] < 18 or len(main) == 0:
            continue
        nearest = int(np.argmin(np.abs(centers - ((comp["x1"] + comp["x2"]) / 2))))
        assigned[nearest].append(comp)

    result = []
    for i, comp in enumerate(main):
        keep = [comp] + assigned[i]
        cleaned = np.zeros_like(arr)
        x1 = im.width
        y1 = im.height
        x2 = 0
        y2 = 0
        for item in keep:
            cleaned[item["ys"], item["xs"]] = arr[item["ys"], item["xs"]]
            x1 = min(x1, item["x1"])
            y1 = min(y1, item["y1"])
            x2 = max(x2, item["x2"])
            y2 = max(y2, item["y2"])
        box = (
            max(0, x1 - crop_padding),
            max(0, y1 - crop_padding),
            min(im.width, x2 + crop_padding),
            min(im.height, y2 + crop_padding),
        )
        result.append((Image.fromarray(cleaned).crop(box), box))

    return result


def crops_from_projection(
    im: Image.Image,
    expected_count: int | None,
    crop_padding: int,
) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    alpha = np.array(im.getchannel("A"))
    intervals = projection_intervals(alpha, expected_count)
    if expected_count is not None and len(intervals) != expected_count:
        raise ValueError(f"projection method found {len(intervals)} intervals, expected {expected_count}")
    if expected_count is None and not intervals:
        raise ValueError("projection method found no frame intervals")

    result = []
    for left, right in intervals:
        region = alpha[:, left:right] > 0
        ys, xs = np.where(region)
        if len(xs) == 0:
            continue
        box = (
            max(0, left + int(xs.min()) - crop_padding),
            max(0, int(ys.min()) - crop_padding),
            min(im.width, left + int(xs.max()) + crop_padding + 1),
            min(im.height, int(ys.max()) + crop_padding + 1),
        )
        result.append((im.crop(box), box))

    return result


def normalize_frames(
    crops: list[tuple[Image.Image, tuple[int, int, int, int]]],
    cell_width: int | None,
    cell_height: int | None,
    padding: int,
    scale_down_only: bool,
) -> list[Image.Image]:
    boxes = []
    source_boxes = []
    for crop, source_box in crops:
        box = crop.getchannel("A").getbbox()
        if box is None:
            raise ValueError("empty transparent frame after crop")
        boxes.append(box)
        source_boxes.append(source_box)

    max_w = max(box[2] - box[0] for box in boxes)
    max_h = max(box[3] - box[1] for box in boxes)
    out_w = cell_width or (max_w + padding * 2)
    out_h = cell_height or (max_h + padding * 2)
    if out_w <= 0 or out_h <= 0:
        raise ValueError("output frame size must be positive")

    scale = min((out_w - padding * 2) / max_w, (out_h - padding * 2) / max_h)
    if scale_down_only:
        scale = min(scale, 1.0)
    if scale <= 0:
        raise ValueError("padding is too large for the requested frame size")

    source_bottoms = [box[3] for box in source_boxes]
    median_bottom = sorted(source_bottoms)[len(source_bottoms) // 2]

    # Pre-pass (auto-height mode only): detect if baseline alignment would clip any
    # sprite at the top (y < 0) or bottom (bottom > out_h). Expand canvas to fit all
    # without altering the relative baseline positions between frames.
    bottom_extra = 0
    if cell_height is None:
        base_out_h = out_h
        min_y = 0
        max_bottom_pos = base_out_h
        for (crop, source_box), box in zip(crops, boxes):
            sprite_h = max(1, round((box[3] - box[1]) * scale))
            bottom_pos = round((base_out_h - padding) + (source_box[3] - median_bottom) * scale)
            y = bottom_pos - sprite_h
            min_y = min(min_y, y)
            max_bottom_pos = max(max_bottom_pos, bottom_pos)
        top_extra = max(0, -min_y)
        bottom_extra = max(0, max_bottom_pos - base_out_h)
        out_h = base_out_h + top_extra + bottom_extra

    frames = []
    for (crop, source_box), box in zip(crops, boxes):
        sprite = crop.crop(box)
        new_size = (
            max(1, round(sprite.width * scale)),
            max(1, round(sprite.height * scale)),
        )
        if new_size != sprite.size:
            sprite = sprite.resize(new_size, Image.Resampling.LANCZOS)

        frame = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        x = round((out_w - sprite.width) / 2)
        # Use (out_h - padding - bottom_extra) as the nominal baseline anchor so that
        # the expanded canvas does not shift frames down into the bottom_extra zone.
        bottom = round((out_h - padding - bottom_extra) + (source_box[3] - median_bottom) * scale)
        y = bottom - sprite.height
        x = max(-sprite.width + 1, min(out_w - 1, x))
        y = max(-sprite.height + 1, min(out_h - 1, y))
        frame.alpha_composite(sprite, (x, y))
        frames.append(frame)

    return frames


def make_gif_safe_alpha(frame: Image.Image, alpha_threshold: int) -> Image.Image:
    """Convert antialiased RGBA edges to GIF-safe 1-bit transparency."""
    rgba = frame.convert("RGBA")
    arr = np.array(rgba)
    alpha = arr[:, :, 3]
    keep = alpha >= alpha_threshold
    arr[:, :, 3] = np.where(keep, 255, 0).astype(np.uint8)
    arr[~keep, :3] = 0
    return Image.fromarray(arr)


def expand_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    expanded = mask.copy()
    for _ in range(max(0, radius)):
        src = expanded
        padded = np.pad(src, 1, mode="constant", constant_values=False)
        expanded = (
            padded[1:-1, 1:-1]
            | padded[:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, :-2]
            | padded[1:-1, 2:]
            | padded[:-2, :-2]
            | padded[:-2, 2:]
            | padded[2:, :-2]
            | padded[2:, 2:]
        )
    return expanded


def clean_edge_matte(
    frame: Image.Image,
    alpha_cutoff: int,
    edge_radius: int,
) -> Image.Image:
    """Remove chroma-key matte residue from the transparent sprite boundary.

    Green-screen generations often leave cyan/white pixels on the character edge.
    PNG can hide part of that with soft alpha, but GIF turns those pixels into hard
    on/off transparency. Cleaning only the boundary keeps interior blue highlights
    while removing the visible halo that appears after GIF quantization.
    """
    rgba = frame.convert("RGBA")
    arr = np.array(rgba)
    alpha = arr[:, :, 3].astype(np.int16)

    foreground = alpha > 0
    if not foreground.any():
        return rgba

    transparent_nearby = expand_mask(~foreground, edge_radius)
    edge = foreground & transparent_nearby

    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)

    low_alpha = edge & (alpha < alpha_cutoff)
    bright_halo = edge & (alpha < 235) & (r > 215) & (g > 215) & (b > 215)
    cyan_halo = (
        edge
        & (alpha < 235)
        & (g > r + 18)
        & (b > r + 18)
        & (g > 95)
        & (b > 105)
    )
    green_halo = edge & (alpha < 245) & (g > r + 24) & (g > b + 12) & (g > 90)

    remove = low_alpha | bright_halo | cyan_halo | green_halo
    arr[remove, 3] = 0
    arr[remove, :3] = 0

    keep_edge = edge & ~remove
    green_spill = keep_edge & (g > np.maximum(r, b) + 8)
    arr[green_spill, 1] = np.maximum(arr[green_spill, 0], arr[green_spill, 2])

    return Image.fromarray(arr)


def slice_spritesheet(args: argparse.Namespace) -> dict:
    input_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output).expanduser().resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"input image does not exist: {input_path}")

    im = load_rgba(input_path, chroma_key=not args.no_chroma_key)
    expected_count = args.frame_count

    try:
        crops = crops_from_components(im, expected_count, args.component_min_area, args.crop_padding)
        method = "components"
    except ValueError as component_error:
        crops = crops_from_projection(im, expected_count, args.crop_padding)
        method = f"projection_after_component_error:{component_error}"

    if expected_count is not None and len(crops) != expected_count:
        raise ValueError(f"expected {expected_count} frames, produced {len(crops)} crops")

    frames = normalize_frames(
        crops,
        args.cell_width,
        args.cell_height,
        args.padding,
        scale_down_only=not args.allow_upscale,
    )
    if args.edge_cleanup:
        frames = [
            clean_edge_matte(frame, args.edge_alpha_cutoff, args.edge_cleanup_radius)
            for frame in frames
        ]
    if args.gif_safe_alpha:
        frames = [make_gif_safe_alpha(frame, args.alpha_threshold) for frame in frames]

    output_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        frame.save(output_dir / f"{i:03d}.png")

    return {
        "input": str(input_path),
        "output": str(output_dir),
        "frame_count": len(frames),
        "frame_size": list(frames[0].size) if frames else None,
        "method": method,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Slice a horizontal spritesheet into transparent PNG frames.")
    parser.add_argument("--input", required=True, help="Path to the source spritesheet image.")
    parser.add_argument("--output", required=True, help="Directory where 000.png, 001.png, ... will be written.")
    parser.add_argument("--frame-count", type=int, default=None, help="Expected number of frames.")
    parser.add_argument("--cell-width", type=int, default=None, help="Optional output frame width.")
    parser.add_argument("--cell-height", type=int, default=None, help="Optional output frame height.")
    parser.add_argument("--padding", type=int, default=8, help="Transparent padding around the normalized subject.")
    parser.add_argument("--crop-padding", type=int, default=4, help="Extra source pixels retained around detected foreground.")
    parser.add_argument("--component-min-area", type=int, default=5000, help="Minimum pixel area for a main frame component.")
    parser.add_argument("--allow-upscale", action="store_true", help="Allow small sprites to scale up to fill the output cell.")
    parser.add_argument("--no-chroma-key", action="store_true", help="Do not remove green chroma-key backgrounds.")
    parser.add_argument(
        "--gif-safe-alpha",
        action="store_true",
        help="Binarize frame alpha for GIF output to avoid semi-transparent halo pixels.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=190,
        help="Alpha cutoff used with --gif-safe-alpha; pixels below become transparent.",
    )
    edge_group = parser.add_mutually_exclusive_group()
    edge_group.add_argument(
        "--edge-cleanup",
        dest="edge_cleanup",
        action="store_true",
        default=True,
        help="Remove cyan/white/green chroma-key residue on transparent sprite edges (default).",
    )
    edge_group.add_argument(
        "--no-edge-cleanup",
        dest="edge_cleanup",
        action="store_false",
        help="Keep transparent sprite edges exactly as produced by chroma key.",
    )
    parser.add_argument(
        "--edge-alpha-cutoff",
        type=int,
        default=72,
        help="With edge cleanup, transparent-edge pixels below this alpha become fully transparent.",
    )
    parser.add_argument(
        "--edge-cleanup-radius",
        type=int,
        default=2,
        help="Boundary width in pixels inspected by edge cleanup.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON summary.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = slice_spritesheet(args)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f"wrote {summary['frame_count']} frames to {summary['output']} ({summary['frame_size']}, {summary['method']})")


if __name__ == "__main__":
    main()
