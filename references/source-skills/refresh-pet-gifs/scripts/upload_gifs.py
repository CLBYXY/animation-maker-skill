#!/usr/bin/env python3
"""
上传指定动物的所有 GIF 到七牛 CDN，输出 URL 清单并写入 json 文件。
用法: python3 upload_gifs.py <animal_name>
"""

import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("缺少 requests 模块，请先执行: pip3 install requests -q", file=sys.stderr)
    sys.exit(1)

API_URL = os.environ.get("QINIU_API_URL", "https://qiniuoss.freeceo.cc/upload")
API_KEY = os.environ.get("QINIU_API_KEY", "")
PROJECT_ROOT = Path(os.environ.get("PETPALS_PROJECT_ROOT", Path.cwd())).expanduser().resolve()
ANIMALS_ROOT = Path(os.environ.get("ANIMALS_ROOT", PROJECT_ROOT / "workspace/animals")).expanduser().resolve()
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

ACTION_NAME_MAP = {
    "running-left": "walk_left",
    "running-right": "walk_right",
    "running_left": "walk_left",
    "running_right": "walk_right",
    "happy": "waving",
}


def normalize_action_name(action_name: str) -> str:
    return ACTION_NAME_MAP.get(action_name, action_name)


def action_priority(source_action: str) -> int:
    normalized = normalize_action_name(source_action)
    return 100 if source_action == normalized else 10


def upload_animal(animal: str) -> dict:
    animal_dir = ANIMALS_ROOT / animal
    if not animal_dir.exists():
        print(f"❌ 动物目录不存在: {animal_dir}", file=sys.stderr)
        sys.exit(1)

    results = {}
    result_sources = {}
    skipped = []
    uploaded_count = 0

    for stage_dir in sorted(animal_dir.glob("stage*")):
        if not stage_dir.name.removeprefix("stage").isdigit():
            continue
        gif_dir = stage_dir / "gif"
        if not gif_dir.exists():
            continue
        for gif_file in sorted(gif_dir.glob("*.gif")):
            source_action = gif_file.stem
            normalized_action = normalize_action_name(source_action)
            key = f"{stage_dir.name}/{normalized_action}"
            try:
                with open(gif_file, "rb") as f:
                    resp = requests.post(
                        API_URL,
                        headers={"X-API-Key": API_KEY},
                        files={"file": (gif_file.name, f, "image/gif")},
                        timeout=60,
                    )
                resp.raise_for_status()
                url = resp.json()["url"]
                uploaded_count += 1

                existing_source = result_sources.get(key)
                if existing_source and action_priority(source_action) < action_priority(existing_source):
                    print(
                        f"↪️  {stage_dir.name}/{source_action} -> {url} "
                        f"（映射到 {key}，但保留 {existing_source}）"
                    )
                    continue

                if existing_source:
                    print(
                        f"🔁 {stage_dir.name}/{source_action} 覆盖同一规范动作 "
                        f"{existing_source} -> {key}"
                    )

                results[key] = url
                result_sources[key] = source_action
                if source_action == normalized_action:
                    print(f"✅ {key} -> {url}")
                else:
                    print(f"✅ {stage_dir.name}/{source_action} -> {key} -> {url}")
            except Exception as e:
                skipped.append(f"{stage_dir.name}/{source_action}")
                print(f"❌ {stage_dir.name}/{source_action} 上传失败: {e}", file=sys.stderr)

    if skipped:
        print(f"\n⚠️  以下 {len(skipped)} 个 GIF 上传失败: {skipped}", file=sys.stderr)

    print(f"\n📊 实际上传 {uploaded_count} 个 GIF，规范 URL 条目 {len(results)} 个")
    return results


def main():
    animal = sys.argv[1] if len(sys.argv) > 1 else "dog"
    print(f"🐾 开始上传 {animal} 的 GIF...\n")

    results = upload_animal(animal)

    out_path = SCRIPTS_DIR / f"{animal}_gif_urls.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n📄 URL 清单已写入: {out_path}")
    print(f"📊 共写入 {len(results)} 个规范 URL 条目")


if __name__ == "__main__":
    main()
