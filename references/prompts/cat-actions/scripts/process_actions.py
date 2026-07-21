from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw"
SPRITE_DIR = ROOT / "spritesheets"
FRAMES_DIR = ROOT / "frames"
QA_DIR = ROOT / "qa"

FRAME_COUNT = 9
CELL_W = 192
CELL_H = 208


def keyed_rgba(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            is_green = g > 115 and g - r > 45 and g - b > 35
            if is_green:
                px[x, y] = (0, 0, 0, 0)
            else:
                # Despill green fringes without changing the cat palette much.
                if g > max(r, b):
                    g = max(r, b)
                px[x, y] = (r, g, b, a)
    return im


def active_intervals(im: Image.Image) -> list[tuple[int, int]]:
    alpha = np.array(im.getchannel("A"))
    counts = (alpha > 0).sum(axis=0)
    active = counts > 20
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

    # Tiny intervals are usually small detached effect pixels or matte residue.
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

    while len(merged) > FRAME_COUNT:
        gaps = [(merged[i + 1][0] - merged[i][1], i) for i in range(len(merged) - 1)]
        _, idx = min(gaps)
        merged[idx] = (merged[idx][0], merged[idx + 1][1])
        del merged[idx + 1]

    while len(merged) < FRAME_COUNT:
        widths = [right - left for left, right in merged]
        idx = max(range(len(merged)), key=lambda i: widths[i])
        left, right = merged[idx]
        mid = round((left + right) / 2)
        if mid <= left or mid >= right:
            break
        merged[idx : idx + 1] = [(left, mid), (mid, right)]

    return merged


def detect_frame_crops(im: Image.Image) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    intervals = active_intervals(im)
    if len(intervals) != FRAME_COUNT:
        raise ValueError(f"expected 9 detected frame groups, found {len(intervals)}")

    alpha = np.array(im.getchannel("A"))
    result = []
    for left, right in intervals:
        region = alpha[:, left:right] > 0
        ys, xs = np.where(region)
        if len(xs) == 0:
            raise ValueError(f"empty detected interval {left}-{right}")
        box = (
            max(0, left + int(xs.min()) - 4),
            max(0, int(ys.min()) - 4),
            min(im.width, left + int(xs.max()) + 5),
            min(im.height, int(ys.max()) + 5),
        )
        result.append((im.crop(box), box))
    return result


def component_boxes(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    comps: list[tuple[int, int, int, int, int]] = []
    for y0, x0 in np.argwhere(mask):
        y = int(y0)
        x = int(x0)
        if seen[y, x]:
            continue
        stack = [(x, y)]
        seen[y, x] = True
        min_x = max_x = x
        min_y = max_y = y
        area = 0
        while stack:
            x, y = stack.pop()
            area += 1
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        comps.append((min_x, min_y, max_x + 1, max_y + 1, area))
    return comps


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


def component_frame_crops(im: Image.Image) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    arr = np.array(im)
    comps = image_components(arr[:, :, 3] > 0)
    main = [comp for comp in comps if comp["area"] > 5000]
    main.sort(key=lambda comp: (comp["x1"] + comp["x2"]) / 2)
    if len(main) != FRAME_COUNT:
        raise ValueError(f"expected 9 main pet components, found {len(main)}")

    centers = np.array([(comp["x1"] + comp["x2"]) / 2 for comp in main])
    assigned: list[list[dict]] = [[] for _ in range(FRAME_COUNT)]
    main_ids = {id(comp) for comp in main}
    for comp in comps:
        if id(comp) in main_ids:
            continue
        if comp["area"] < 18:
            continue
        center = (comp["x1"] + comp["x2"]) / 2
        nearest = int(np.argmin(np.abs(centers - center)))
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
        pad = 4
        box = (max(0, x1 - pad), max(0, y1 - pad), min(im.width, x2 + pad), min(im.height, y2 + pad))
        crop = Image.fromarray(cleaned, "RGBA").crop(box)
        result.append((crop, box))
    return result


def normalize_cells(cells: list[tuple[Image.Image, tuple[int, int, int, int]]]) -> list[Image.Image]:
    boxes = []
    source_boxes = []
    for cell, source_box in cells:
        alpha = cell.getchannel("A")
        box = alpha.getbbox()
        boxes.append(box)
        source_boxes.append(source_box)

    if any(box is None for box in boxes):
        missing = [str(i) for i, box in enumerate(boxes) if box is None]
        raise ValueError(f"empty transparent frame(s): {', '.join(missing)}")

    max_w = max(box[2] - box[0] for box in boxes if box)
    max_h = max(box[3] - box[1] for box in boxes if box)
    scale = min((CELL_W * 0.9) / max_w, (CELL_H * 0.9) / max_h)
    scale = min(scale, 1.0)

    source_bottoms = [source_box[3] for source_box in source_boxes]
    median_bottom = sorted(source_bottoms)[len(source_bottoms) // 2]
    normalized = []
    for (cell, source_box), box in zip(cells, boxes):
        assert box is not None
        crop = cell.crop(box)
        new_size = (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        )
        crop = crop.resize(new_size, Image.Resampling.LANCZOS)

        slot = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        x = round((CELL_W - crop.width) / 2)
        bottom = round((CELL_H - 8) + (source_box[3] - median_bottom) * scale)
        y = bottom - crop.height
        x = max(-crop.width + 1, min(CELL_W - 1, x))
        y = max(-crop.height + 1, min(CELL_H - 1, y))
        slot.alpha_composite(crop, (x, y))
        normalized.append(slot)
    return normalized


def write_action(name: str, frames: list[Image.Image]) -> dict:
    action_dir = FRAMES_DIR / name
    action_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        frame.save(action_dir / f"{i:03d}.png")

    sheet = Image.new("RGBA", (CELL_W * FRAME_COUNT, CELL_H), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * CELL_W, 0))
    sheet.save(SPRITE_DIR / f"{name}.png")

    return {
        "action": name,
        "spritesheet": str((SPRITE_DIR / f"{name}.png").resolve()),
        "frames_dir": str(action_dir.resolve()),
        "frame_count": len(frames),
        "frame_size": [CELL_W, CELL_H],
    }


def process_raw_action(name: str) -> dict:
    raw = RAW_DIR / f"{name}.png"
    if not raw.exists():
        raise FileNotFoundError(f"missing raw spritesheet: {raw}")
    rgba = keyed_rgba(raw)
    frames = normalize_cells(component_frame_crops(rgba))
    return write_action(name, frames)


def derive_running_left() -> dict:
    right_dir = FRAMES_DIR / "running-right"
    if not right_dir.exists():
        raise FileNotFoundError("running-right frames are missing; cannot derive running-left")
    frames = []
    for i in range(FRAME_COUNT):
        frame_path = right_dir / f"{i:03d}.png"
        if not frame_path.exists():
            raise FileNotFoundError(f"missing running-right frame: {frame_path}")
        frame = Image.open(frame_path).convert("RGBA").transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        frames.append(frame)
    return write_action("running-left", frames)


def make_contact_sheet(actions: list[str]) -> Path:
    sheet = Image.new("RGBA", (CELL_W * FRAME_COUNT, CELL_H * len(actions)), (255, 255, 255, 255))
    for row, action in enumerate(actions):
        action_sheet = Image.open(SPRITE_DIR / f"{action}.png").convert("RGBA")
        sheet.alpha_composite(action_sheet, (0, row * CELL_H))
    out = QA_DIR / "contact-sheet.png"
    sheet.save(out)
    return out


def main() -> None:
    SPRITE_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)

    actions = ["running-right", "eat", "happy", "levelup"]
    report = {"actions": [], "failures": []}
    for action in actions:
        try:
            report["actions"].append(process_raw_action(action))
        except Exception as exc:
            report["failures"].append({"action": action, "reason": str(exc)})

    try:
        report["actions"].append(derive_running_left())
    except Exception as exc:
        report["failures"].append({"action": "running-left", "reason": str(exc)})

    completed = [item["action"] for item in report["actions"]]
    if completed:
        report["contact_sheet"] = str(make_contact_sheet(completed).resolve())

    report_path = QA_DIR / "process-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if report["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
