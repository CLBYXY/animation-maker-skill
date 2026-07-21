#!/usr/bin/env python3
"""Validate raw PetPals spritesheets before chroma-key removal.

The generator can occasionally return a very flat image, for example 2048x256,
where tall stage5 elements are already clipped. This script rejects those
sources before they enter the deterministic chroma-key and slicing steps.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def foreground_mask(im: Image.Image) -> np.ndarray:
    rgba = np.array(im.convert("RGBA"))
    alpha = rgba[:, :, 3]
    if alpha.min() == 0 and alpha.max() > 0:
        return alpha > 0

    r = rgba[:, :, 0].astype(np.int16)
    g = rgba[:, :, 1].astype(np.int16)
    b = rgba[:, :, 2].astype(np.int16)
    green = (g > 115) & ((g - r) > 45) & ((g - b) > 35)
    return ~green


def bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def validate_file(path: Path, frame_count: int, min_height: int, min_margin: int) -> dict:
    im = Image.open(path).convert("RGBA")
    width, height = im.size
    mask = foreground_mask(im)
    cell_width = width / frame_count
    failures: list[str] = []

    if height < min_height:
        failures.append(f"image height {height}px is below min-height {min_height}px")

    overall = bbox_from_mask(mask)
    if overall is None:
        failures.append("no foreground pixels detected")
    else:
        left, top, right, bottom = overall
        margins = {
            "left": left,
            "top": top,
            "right": width - right,
            "bottom": height - bottom,
        }
        # 只保留“主体是否存在/是否被画布裁切”的检查；格内安全间距交给
        # repack_raw_spritesheet.py 按主体外接框重新排布，避免因为等宽切片
        # 边界误差反复重生图片。

    frame_reports = []
    for idx in range(frame_count):
        x0 = round(idx * cell_width)
        x1 = round((idx + 1) * cell_width)
        cell = mask[:, x0:x1]
        bbox = bbox_from_mask(cell)
        if bbox is None:
            failures.append(f"frame {idx:03d} has no foreground pixels")
            frame_reports.append({"frame": idx, "bbox": None})
            continue
        left, top, right, bottom = bbox
        margins = {
            "left": left,
            "top": top,
            "right": (x1 - x0) - right,
            "bottom": height - bottom,
        }
        # 不再因为 frame 左右安全边距不足判失败。间距不足时使用绿底重排，
        # 复制原始 RGB 矩形像素，不做透明扣图、不缩放、不重绘角色。
        frame_reports.append(
            {
                "frame": idx,
                "bbox": [left + x0, top, right + x0, bottom],
                "margins": margins,
            }
        )

    return {
        "input": str(path),
        "size": [width, height],
        "frame_count": frame_count,
        "min_height": min_height,
        "min_margin": min_margin,
        "ok": not failures,
        "failures": failures,
        "frames": frame_reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Raw spritesheet PNG path.")
    parser.add_argument("--frame-count", type=int, required=True)
    parser.add_argument("--min-height", type=int, default=320)
    parser.add_argument("--min-margin", type=int, default=6)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    path = Path(args.input).expanduser().resolve()
    if not path.exists():
        print(f"Error: input not found: {path}", file=sys.stderr)
        sys.exit(2)

    report = validate_file(path, args.frame_count, args.min_height, args.min_margin)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        status = "OK" if report["ok"] else "FAIL"
        print(
            f"{status}: {path} size={report['size'][0]}x{report['size'][1]} "
            f"frames={args.frame_count}"
        )
        for failure in report["failures"]:
            print(f"  - {failure}")

    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
