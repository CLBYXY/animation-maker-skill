# petpals-action-animation-skill

基于已经存在的 `base.png`，为 PetPals 普通宠物阶段生成动作动画资源。

本 skill 不生成角色基础图。基础图必须先由 `pet-image-tool` 或其他流程保存到目标阶段目录。

## 适用阶段

适用于 stage2 及之后的普通宠物形态。

```text
<ANIMALS_ROOT>/<pet_name>/<stage>/base.png
```

默认资源根目录：

```text
workspace/animals
```

## 生成动作

| 动作 | 用途 |
| --- | --- |
| `idle` | 默认待机 |
| `running-right` | 向右移动 |
| `running-left` | 由 `running-right` 镜像得到 |
| `jumping` | 跳跃 / 部分互动反馈 |
| `waving` | 打招呼 / 一起玩 |
| `failed` | 失败 / 难过 |
| `eat` | 喂食 |
| `happy` | 开心 |
| `levelup` | 升级 |

## 输出

```text
<pet_name>/<stage>/
  base.png
  raw_generated/
  长帧/
  单帧/
  animation-timing.json
```

## 标准流程

1. 确认 `base.png` 存在。
2. 用 imagegen 为每个动作生成横向长帧。
3. 去绿底，保存到 `长帧/`。
4. 切成 `单帧/<action>/000.png ...`。
5. 生成或更新 `animation-timing.json`。
6. 进入 `petpals-animation-debug-skill` 调 timing。
7. 进入 `refresh-pet-gifs` 生成 GIF 并上传 CDN。

## 常用脚本

```bash
python3 scripts/remove_chroma_key.py --input-dir raw_generated --output-dir 长帧
bash scripts/slice_all_actions.sh "$ANIMALS_ROOT" "$PET_NAME" "$STAGE"
python3 scripts/generate_timing.py --frames-dir 单帧 --output animation-timing.json
```

## 质量要求

- 长帧必须是稳定的一行多列 spritesheet。
- 每帧必须在独立等宽格子中。
- 角色、尾巴、翅膀、武器、光效不能跨格或被裁切。
- 体型大的 stage 允许增加画布高度，不要靠缩小角色牺牲细节。

