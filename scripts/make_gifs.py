#!/usr/bin/env python3
"""Generate pet GIFs from sliced PNG frames.

Usage:
  python3 scripts/make_gifs.py          # regenerate dog GIFs
  python3 scripts/make_gifs.py dog      # regenerate dog GIFs
  python3 scripts/make_gifs.py all      # regenerate every animal with timing data
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ANIMALS_ROOT = Path(os.environ.get('ANIMALS_ROOT', ROOT / 'apps/api/public/uploads/pets/animals')).expanduser().resolve()
ALPHA_CUTOFF = 96
SAFE_PADDING = 8


def clean_gif_alpha(frame: Image.Image) -> Image.Image:
  """GIF 不支持半透明；先把边缘 alpha 二值化，避免导出后出现脏色残边。"""
  cleaned = frame.convert('RGBA')
  pixels = cleaned.load()
  width, height = cleaned.size

  for y in range(height):
    for x in range(width):
      red, green, blue, alpha = pixels[x, y]
      if alpha < ALPHA_CUTOFF:
        pixels[x, y] = (0, 0, 0, 0)
      else:
        pixels[x, y] = (red, green, blue, 255)

  return cleaned


def needs_safe_padding(frame: Image.Image) -> bool:
  alpha = frame.getchannel('A')
  width, height = frame.size
  bbox = alpha.getbbox()
  if bbox is None:
    return False

  left, top, right, bottom = bbox
  return (
    left < SAFE_PADDING
    or top < SAFE_PADDING
    or width - right < SAFE_PADDING
    or height - bottom < SAFE_PADDING
  )


def add_safe_padding(frame: Image.Image, scale: float) -> Image.Image:
  width, height = frame.size
  next_width = max(1, round(width * scale))
  next_height = max(1, round(height * scale))
  resized = frame.resize((next_width, next_height), Image.Resampling.LANCZOS)
  output = Image.new('RGBA', (width, height), (0, 0, 0, 0))
  output.alpha_composite(resized, ((width - next_width) // 2, (height - next_height) // 2))
  return clean_gif_alpha(output)


def prepare_gif_frames(frames: list[Image.Image]) -> tuple[list[Image.Image], bool]:
  cleaned_frames = [clean_gif_alpha(frame) for frame in frames]
  if not any(needs_safe_padding(frame) for frame in cleaned_frames):
    return cleaned_frames, False

  width, height = cleaned_frames[0].size
  scale = min((width - SAFE_PADDING * 2) / width, (height - SAFE_PADDING * 2) / height)
  return [add_safe_padding(frame, scale) for frame in cleaned_frames], True


def discover_stages(target_animal: str) -> list[tuple[str, Path]]:
  stages: list[tuple[str, Path]] = []
  animal_dirs = sorted(ANIMALS_ROOT.iterdir()) if target_animal == 'all' else [ANIMALS_ROOT / target_animal]

  for animal_dir in animal_dirs:
    if not animal_dir.is_dir():
      continue
    for stage_dir in sorted(animal_dir.glob('stage*')):
      if not stage_dir.name.removeprefix('stage').isdigit():
        continue
      if (stage_dir / '单帧').is_dir() and (stage_dir / 'animation-timing.json').exists():
        stages.append((animal_dir.name, stage_dir))

  return stages


def generate_stage_gifs(animal: str, stage_dir: Path) -> tuple[list[str], list[str]]:
  timing_path = stage_dir / 'animation-timing.json'
  single_frame_dir = stage_dir / '单帧'
  gif_dir = stage_dir / 'gif'
  gif_dir.mkdir(exist_ok=True)

  timing_data = json.loads(timing_path.read_text(encoding='utf-8'))
  generated: list[str] = []
  skipped: list[str] = []

  for action_name, action_cfg in timing_data.items():
    if action_name.endswith('_backup_v1'):
      continue

    action_frame_dir = single_frame_dir / action_name
    if not action_frame_dir.is_dir():
      skipped.append(f'{animal}/{stage_dir.name}/{action_name}: missing frame dir')
      print(f'⚠️ {animal}/{stage_dir.name}/{action_name} 缺少单帧目录，跳过')
      continue

    sequence = action_cfg.get('sequence', [])
    frame_durations = action_cfg.get('frameDurations', {})
    if not sequence:
      skipped.append(f'{animal}/{stage_dir.name}/{action_name}: empty sequence')
      print(f'⚠️ {animal}/{stage_dir.name}/{action_name} sequence 为空，跳过')
      continue

    frames: list[Image.Image] = []
    durations: list[int] = []
    missing_frames: list[str] = []

    for frame_idx in sequence:
      frame_path = action_frame_dir / f'{frame_idx:03d}.png'
      if not frame_path.exists():
        missing_frames.append(frame_path.name)
        continue
      frames.append(Image.open(frame_path).convert('RGBA'))
      durations.append(int(frame_durations.get(str(frame_idx), 90)))

    if missing_frames or not frames:
      skipped.append(
        f'{animal}/{stage_dir.name}/{action_name}: missing frames {", ".join(missing_frames)}'
      )
      print(f'⚠️ {animal}/{stage_dir.name}/{action_name} 缺帧，跳过')
      continue

    frames, padded = prepare_gif_frames(frames)
    gif_path = gif_dir / f'{action_name}.gif'
    is_loop = bool(action_cfg.get('loop', True))

    frames[0].save(
      gif_path,
      save_all=True,
      append_images=frames[1:],
      duration=durations,
      loop=0 if is_loop else 1,
      disposal=2,
    )
    generated.append(f'{animal}/{stage_dir.name}/{action_name}')
    padding_note = '（已清理透明边缘并补安全边距）' if padded else '（已清理透明边缘）'
    print(f'✅ {animal}/{stage_dir.name}/{action_name} -> {gif_path.relative_to(ROOT)} {padding_note}')

  return generated, skipped


def main() -> None:
  target_animal = sys.argv[1] if len(sys.argv) > 1 else 'dog'
  stages = discover_stages(target_animal)

  if not stages:
    print(f'❌ 未找到可生成 GIF 的动物阶段: {target_animal}', file=sys.stderr)
    sys.exit(1)

  all_generated: list[str] = []
  all_skipped: list[str] = []

  for animal, stage_dir in stages:
    generated, skipped = generate_stage_gifs(animal, stage_dir)
    all_generated.extend(generated)
    all_skipped.extend(skipped)

  print()
  print(f'📊 成功生成 {len(all_generated)} 个 GIF')
  if all_skipped:
    print(f'⚠️ 跳过 {len(all_skipped)} 个动作:')
    for item in all_skipped:
      print(f'  - {item}')


if __name__ == '__main__':
  main()
