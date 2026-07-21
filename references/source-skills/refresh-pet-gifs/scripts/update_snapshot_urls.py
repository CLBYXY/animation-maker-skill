#!/usr/bin/env python3
"""Update PetPals snapshot SQL with the latest uploaded GIF URLs.

This script reads scripts/{animal}_gif_urls.json and rewrites only matching
pet_action_resources rows in docs/handover/petpals-dev-snapshot.sql.

It normalizes legacy asset names to the current database action codes:
  running-left  -> walk_left
  running-right -> walk_right
  happy         -> waving, only when no real waving URL exists
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(os.environ.get('PETPALS_PROJECT_ROOT', Path.cwd())).expanduser().resolve()
SNAPSHOT_SQL = PROJECT_ROOT / 'docs/handover/petpals-dev-snapshot.sql'
SCRIPTS_DIR = PROJECT_ROOT / 'scripts'
ANIMALS_ROOT = Path(os.environ.get('ANIMALS_ROOT', PROJECT_ROOT / 'workspace/animals')).expanduser().resolve()

LEGACY_ACTION_MAP = {
  'running-left': 'walk_left',
  'running-right': 'walk_right',
  'running_left': 'walk_left',
  'running_right': 'walk_right',
  'happy': 'waving',
}

TIMING_LOOKUP_ALIASES = {
  'walk_left': ['walk_left', 'running-left', 'running_left'],
  'walk_right': ['walk_right', 'running-right', 'running_right'],
  'waving': ['waving', 'happy'],
}

ACTION_PRIORITY = {
  'idle': 100,
  'eat': 100,
  'failed': 100,
  'jumping': 100,
  'levelup': 100,
  'waving': 100,
  'walk_left': 100,
  'walk_right': 100,
  'happy': 10,
  'running-left': 10,
  'running-right': 10,
  'running_left': 10,
  'running_right': 10,
}


@dataclass
class ManifestItem:
  stage_number: int
  source_action: str
  action_code: str
  url: str
  duration_ms: int | None = None
  is_loop: int | None = None


def split_insert_tuples(values: str) -> list[str]:
  tuples: list[str] = []
  start = -1
  depth = 0
  in_string = False
  escape = False

  for index, char in enumerate(values):
    if in_string:
      if escape:
        escape = False
      elif char == '\\':
        escape = True
      elif char == "'":
        in_string = False
      continue

    if char == "'":
      in_string = True
    elif char == '(':
      if depth == 0:
        start = index
      depth += 1
    elif char == ')':
      depth -= 1
      if depth == 0 and start >= 0:
        tuples.append(values[start:index + 1])
        start = -1

  return tuples


def split_fields(tuple_sql: str) -> list[str]:
  body = tuple_sql.strip()[1:-1]
  fields: list[str] = []
  start = 0
  in_string = False
  escape = False

  for index, char in enumerate(body):
    if in_string:
      if escape:
        escape = False
      elif char == '\\':
        escape = True
      elif char == "'":
        in_string = False
      continue

    if char == "'":
      in_string = True
    elif char == ',':
      fields.append(body[start:index])
      start = index + 1

  fields.append(body[start:])
  return [field.strip() for field in fields]


def sql_unquote(value: str) -> str:
  value = value.strip()
  if value == 'NULL':
    return ''
  if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
    return value[1:-1].replace("\\'", "'").replace('\\\\', '\\')
  return value


def sql_quote(value: str) -> str:
  return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def find_insert_values(sql: str, table: str) -> tuple[re.Match[str], str]:
  pattern = re.compile(rf'(INSERT INTO `{re.escape(table)}` VALUES )(.*?)(;)', re.S)
  match = pattern.search(sql)
  if not match:
    raise RuntimeError(f'未找到 `{table}` 的 INSERT 数据')
  return match, match.group(2)


def parse_species_ids(sql: str) -> dict[str, int]:
  _, values = find_insert_values(sql, 'pet_species')
  species_ids: dict[str, int] = {}

  for tuple_sql in split_insert_tuples(values):
    fields = split_fields(tuple_sql)
    if len(fields) < 2:
      continue
    species_ids[sql_unquote(fields[1])] = int(fields[0])

  return species_ids


def canonical_action(source_action: str) -> str:
  return LEGACY_ACTION_MAP.get(source_action, source_action)


def parse_manifest_key(key: str) -> tuple[int, str] | None:
  parts = key.split('/')
  if len(parts) != 2:
    return None

  stage_match = re.fullmatch(r'stage(\d+)', parts[0])
  if not stage_match:
    return None

  return int(stage_match.group(1)), parts[1]


def read_timing(animal: str, stage_number: int, source_action: str) -> tuple[int | None, int | None]:
  timing_path = ANIMALS_ROOT / animal / f'stage{stage_number}' / 'animation-timing.json'
  if not timing_path.exists():
    return None, None

  try:
    timing_data = json.loads(timing_path.read_text(encoding='utf-8'))
  except Exception:
    return None, None

  lookup_names = TIMING_LOOKUP_ALIASES.get(source_action, [source_action])
  action_cfg = None
  for lookup_name in lookup_names:
    candidate = timing_data.get(lookup_name)
    if isinstance(candidate, dict):
      action_cfg = candidate
      break

  if not isinstance(action_cfg, dict):
    return None, None

  sequence = action_cfg.get('sequence', [])
  durations = action_cfg.get('frameDurations', {})
  if not isinstance(sequence, list) or not sequence:
    return None, int(bool(action_cfg.get('loop', True)))

  duration_ms = 0
  for frame_index in sequence:
    duration_ms += int(durations.get(str(frame_index), 90))

  return duration_ms, int(bool(action_cfg.get('loop', True)))


def load_manifest(animal: str, urls_path: Path) -> tuple[dict[tuple[int, str], ManifestItem], list[str]]:
  raw_urls = json.loads(urls_path.read_text(encoding='utf-8'))
  items: dict[tuple[int, str], ManifestItem] = {}
  warnings: list[str] = []

  for key, url in sorted(raw_urls.items()):
    parsed = parse_manifest_key(key)
    if not parsed:
      warnings.append(f'跳过无法识别的 URL key: {key}')
      continue

    stage_number, source_action = parsed
    action_code = canonical_action(source_action)
    manifest_key = (stage_number, action_code)
    duration_ms, is_loop = read_timing(animal, stage_number, source_action)

    item = ManifestItem(
      stage_number=stage_number,
      source_action=source_action,
      action_code=action_code,
      url=url,
      duration_ms=duration_ms,
      is_loop=is_loop,
    )

    existing = items.get(manifest_key)
    if existing:
      existing_priority = ACTION_PRIORITY.get(existing.source_action, 50)
      item_priority = ACTION_PRIORITY.get(source_action, 50)
      if item_priority <= existing_priority:
        warnings.append(
          f'{animal}/stage{stage_number}/{source_action} 与 '
          f'{existing.source_action} 都映射到 {action_code}，保留 {existing.source_action}'
        )
        continue

      warnings.append(
        f'{animal}/stage{stage_number}/{source_action} 覆盖同一规范动作 '
        f'{existing.source_action} -> {action_code}'
      )

    items[manifest_key] = item

  return items, warnings


def update_pet_action_resources(
  sql: str,
  animal: str,
  species_id: int,
  items: dict[tuple[int, str], ManifestItem],
) -> tuple[str, int, list[str]]:
  match, values = find_insert_values(sql, 'pet_action_resources')
  tuples = split_insert_tuples(values)
  updated_tuples: list[str] = []
  changed = 0
  matched_keys: set[tuple[int, str]] = set()
  warnings: list[str] = []

  for tuple_sql in tuples:
    fields = split_fields(tuple_sql)
    if len(fields) < 17:
      updated_tuples.append(tuple_sql)
      continue

    row_species_id = int(fields[1])
    stage_number = int(fields[2])
    action_code = sql_unquote(fields[3])
    item = items.get((stage_number, action_code))

    if row_species_id == species_id and item:
      matched_keys.add((stage_number, action_code))
      before = tuple(fields)
      fields[8] = sql_quote(item.url)
      if item.duration_ms is not None:
        fields[4] = str(item.duration_ms)
      if item.is_loop is not None:
        fields[5] = str(item.is_loop)
      if tuple(fields) != before:
        changed += 1

    updated_tuples.append('(' + ','.join(fields) + ')')

  for key, item in sorted(items.items()):
    if key not in matched_keys:
      warnings.append(f'上传清单有 {animal}/stage{item.stage_number}/{item.action_code}，但 snapshot 里没有对应行')

  new_values = ','.join(updated_tuples)
  new_sql = sql[:match.start(2)] + new_values + sql[match.end(2):]
  return new_sql, changed, warnings


def update_animal(sql: str, animal: str, urls_path: Path) -> tuple[str, int, list[str]]:
  species_ids = parse_species_ids(sql)
  species_id = species_ids.get(animal)
  if species_id is None:
    raise RuntimeError(f'snapshot 里没有宠物种类: {animal}')

  if not urls_path.exists():
    raise RuntimeError(f'URL 清单不存在: {urls_path}')

  items, warnings = load_manifest(animal, urls_path)
  if not items:
    raise RuntimeError(f'URL 清单没有可同步的动作: {urls_path}')

  sql, changed, update_warnings = update_pet_action_resources(sql, animal, species_id, items)
  return sql, changed, warnings + update_warnings


def resolve_jobs(animal: str, urls_path: Path | None) -> list[tuple[str, Path]]:
  if animal != 'all':
    return [(animal, urls_path or (SCRIPTS_DIR / f'{animal}_gif_urls.json'))]

  if urls_path:
    raise RuntimeError('animal=all 时不要传单个 urls_json 路径')

  return [
    (path.name.replace('_gif_urls.json', ''), path)
    for path in sorted(SCRIPTS_DIR.glob('*_gif_urls.json'))
  ]


def main() -> None:
  parser = argparse.ArgumentParser(description='同步七牛 GIF URL 到正式 snapshot SQL')
  parser.add_argument('animal', nargs='?', default='dog', help='动物名，如 dog；可传 all')
  parser.add_argument('urls_json', nargs='?', help='可选：URL 清单路径')
  parser.add_argument(
    '--snapshot',
    default=str(SNAPSHOT_SQL),
    help='正式 snapshot SQL 路径',
  )
  parser.add_argument(
    '--check',
    action='store_true',
    help='只校验和汇报会更新多少行，不写入文件',
  )
  args = parser.parse_args()

  snapshot_path = Path(args.snapshot)
  urls_path = Path(args.urls_json) if args.urls_json else None
  jobs = resolve_jobs(args.animal, urls_path)

  original_sql = snapshot_path.read_text(encoding='utf-8')
  sql = original_sql
  total_changed = 0
  all_warnings: list[str] = []

  for animal, job_urls_path in jobs:
    sql, changed, warnings = update_animal(sql, animal, job_urls_path)
    total_changed += changed
    all_warnings.extend(warnings)
    print(f'✅ {animal}: 匹配并更新 {changed} 行')

  for warning in all_warnings:
    print(f'⚠️  {warning}')

  if args.check:
    print(f'🔎 check 模式：未写入文件，合计将更新 {total_changed} 行')
    return

  if sql == original_sql:
    print('ℹ️ snapshot SQL 内容没有变化')
    return

  snapshot_path.write_text(sql, encoding='utf-8')
  print(f'📄 snapshot SQL 已更新: {snapshot_path}')
  print(f'📊 合计更新 {total_changed} 行')


if __name__ == '__main__':
  try:
    main()
  except Exception as exc:
    print(f'❌ {exc}', file=sys.stderr)
    sys.exit(1)
