# petpals-animation-scale-debug-skill

用于调整 PetPals 老师端中 GIF 动作的显示缩放和 x/y 偏移。

它会读取当前数据库里的 `pet_action_resources.gif_url`，在本地页面中预览同一动物、阶段、动作的 GIF，并把调好的参数保存到老师端配置文件。

## 启动

```bash
cd <skill root>-animation-scale-debug-skill
PORT=3521 node server.js
```

默认页面：

```text
http://127.0.0.1:3521
```

默认读取本地 PetPals MySQL 容器：

```bash
MYSQL_CONTAINER=petpals-local-mysql-1 \
MYSQL_USER=petpals \
MYSQL_PASSWORD=petpals \
MYSQL_DATABASE=petpals \
PORT=3521 \
node server.js
```

## 写入文件

```text
<skill root>/apps/teacher-web/src/components/pet-animation-scale-config.json
<skill root>/apps/teacher-web/src/components/pet-animation-scale-config.ts
```

## 调参内容

- 每个动作的 scale。
- 每个动作的 x/y offset。
- 整个 stage 的 stageScale。
- 选择老师端实际使用的显示尺寸 preset。
- 模拟老师端内部 patrol 位移，便于对齐截图。

## 使用位置

它通常在 GIF 上传和本地数据库更新后使用：

```text
refresh-pet-gifs -> 本地老师端播放 -> scale debug -> 保存前端配置
```

## 发布提醒

外网发布前必须确认：

- JSON 和 TS 配置都已经保存为最新值。
- 构建使用的是最新 `pet-animation-scale-config.ts`。
- 没有被旧 JSON 或旧 TS 覆盖。

