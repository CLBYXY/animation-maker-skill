# sleep-animator-skill

为 PetPals stage1 睡眠幼体生成动画资源。

当 stage1 不是蛋，而是一只趴着、睡着、蜷缩的幼年动物时，使用这个 skill。它会生成适合“还不会走路”的动作，不生成行走和跳跃动作。

## 适用阶段

```text
<ANIMALS_ROOT>/<pet_name>/stage1/base.png
```

## 生成动作

| 动作 | 帧数 | 说明 |
| --- | ---: | --- |
| `idle` | 8 | 睡眠呼吸循环 |
| `waving` | 8 | 半梦半醒地挥手 / 打招呼 |
| `eat` | 8 | 默认复用 `waving`，不画食物道具 |
| `failed` | 8 | 埋头、蜷缩、低落 |
| `levelup` | 10 | 睡梦中被柔光包裹升级 |

## 输出

```text
<pet_name>/stage1/
  base.png
  长帧/idle.png waving.png eat.png failed.png levelup.png
  单帧/idle waving eat failed levelup
  animation-timing.json
```

## 标准流程

1. 确认 stage 是 `stage1`。
2. 视觉确认 `base.png` 是趴睡幼体，不是蛋。
3. 生成 `idle`、`waving`、`failed`、`levelup` 长帧。
4. 去绿底到 `长帧/`。
5. 执行 alias 同步，让 `eat` 复用 `waving`。
6. 切帧到 `单帧/`。
7. 再执行一次 alias 同步，确保 `单帧/eat` 与 `单帧/waving` 一致。
8. 生成 `animation-timing.json`。

## 常用脚本

```bash
bash scripts/sync_alias_actions.sh "$ANIMALS_ROOT" "$PET_NAME" stage1
bash scripts/slice_all_actions.sh "$ANIMALS_ROOT" "$PET_NAME" stage1
python3 scripts/generate_timing.py --frames-dir 单帧 --output animation-timing.json
```

## 质量要求

- 保持睡眠、趴着、蜷缩的 body language。
- 不要走路、奔跑、跳跃、站立或变成成年姿态。
- 动作幅度要能在老师端小尺寸里看清。

