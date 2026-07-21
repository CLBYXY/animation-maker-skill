#!/usr/bin/env python3
"""Deprecated compatibility entrypoint.

The refresh flow now updates:
  <skill root>/docs/handover/petpals-dev-snapshot.sql

Use:
  python3 references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py dog
"""

import sys


def main() -> None:
  print(
    'gen_seed.py 已废弃；请使用 update_snapshot_urls.py 同步 petpals-dev-snapshot.sql',
    file=sys.stderr,
  )
  sys.exit(1)


if __name__ == '__main__':
  main()
