# petpals-egg-animation-skill

为 PetPals stage1 蛋形态生成专用动画资源。

该 skill 从已经存在的蛋形态 `base.png` 开始，生成与现有 GIF / refresh 流程兼容的长帧、单帧和 timing 文件。

## 适用阶段

只适用于：

```text
<ANIMALS_ROOT>/<pet_name>/stage1/base.png
```

如果 stage1 不是蛋，而是趴睡幼体，请使用 `sleep-animator-skill`。

## 生成动作

| 动作 | 帧数 | 说明 |
| --- | ---: | --- |
| `idle` | 8 | 蛋左右摇晃 |
| `failed` | 8 | 蛋变暗、低落、摇晃 |
| `jumping` | 8 | 蛋弹跳，用于喂食和表扬反馈 |
| `levelup` | 10 | 蛋内部发光，进入升级/孵化氛围 |

不生成走路、吃饭、挥手等普通宠物动作。

## 输出

```text
<pet_name>/stage1/
  base.png
  长帧/idle.png failed.png jumping.png levelup.png
  单帧/idle failed jumping levelup
  animation-timing.json
```

## 标准流程

1. 确认 stage 是 `stage1`。
2. 确认 `base.png` 存在且是蛋形态。
3. 生成四个动作的 raw 长帧。
4. 去绿底到 `长帧/`。
5. 切帧到 `单帧/`。
6. 生成 `animation-timing.json`。
7. 用 `petpals-animation-debug-skill` 检查节奏。
8. 用 `refresh-pet-gifs` 进入 GIF 和 CDN 流程。

## 质量要求

- 蛋的轮廓必须干净、连续、光滑。
- 不要真实裂纹、闪电、厚黑裂缝、飞散蛋壳或外部场景。
- levelup 以柔和发光覆盖蛋体为主，保持卡通感。

