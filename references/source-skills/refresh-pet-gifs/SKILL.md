---
name: refresh-pet-gifs
description: >
  重新打包宠物 GIF 并上传到七牛 CDN，自动更新 URL 清单和正式 snapshot SQL。
  适用于 petpals 项目中任何动物的动画资源更新。绝不自动提交或推送 Gitee。
  当用户说"重新打包 GIF"、"更新动画"、"刷新宠物资源"、"上传 XXX 的 GIF"时触发此 skill。
---

# Refresh Pet GIFs

当用户想重新生成某个动物的 GIF 动画、上传到七牛 CDN、并同步更新正式部署 SQL 时，
按照以下步骤执行。

## 配置（固定值，不要修改）

```
项目根目录:   <skill root>
动物资源目录: {项目根目录}/apps/api/public/uploads/pets/animals/{animal}
GIF 生成脚本: {项目根目录}/scripts/make_gifs.py
URL 清单文件: {项目根目录}/scripts/{animal}_gif_urls.json
正式 SQL:     {项目根目录}/docs/handover/petpals-dev-snapshot.sql
SQL 同步脚本: references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py
七牛上传地址: https://qiniuoss.freeceo.cc/upload
七牛 API Key: <set QINIU_API_KEY in the workbench>
```

## 执行步骤

### 第 1 步：确定动物名称

从用户的指令中提取动物名（如 dog、blue-robin）。
若用户没有指定，**默认使用 `dog`**。

### 第 2 步：重新生成 GIF

在项目根目录运行 make_gifs.py。默认只处理 dog；如要处理其它动物，必须显式传动物名。
脚本在导出 GIF 前必须执行 GIF-safe 透明边缘处理：
- 将半透明 alpha 做硬截断，避免 GIF 不支持半透明导致边缘出现脏色/不透明残边
- 对主体贴到画布边缘的动作统一缩小并补透明安全边距，避免播放时继续出现切边
- 只处理 `stage` + 数字目录，不能处理 `stage4backup`、`stage5backup` 等备份目录

```bash
cd <skill root>
python3 scripts/make_gifs.py dog
```

处理全部动物时使用：

```bash
python3 scripts/make_gifs.py all
```

脚本会把 GIF 写到 `animals/{animal}/stage*/gif/` 目录下，覆盖旧文件。
注意记录目标动物有哪些 GIF 被成功生成（✅），哪些因缺帧跳过（⚠️）。

### 第 3 步：上传 GIF 到七牛 CDN

运行上传脚本（见下方 `scripts/upload_gifs.py`），传入动物名：

```bash
python3 references/source-skills/refresh-pet-gifs/scripts/upload_gifs.py dog
```

脚本会：
- 遍历 `animals/{animal}/stage*/gif/*.gif`
- 逐一 POST 到七牛上传接口
- 把结果以 `"stage1/idle": "https://..."` 格式输出到 stdout（JSON）
- URL 清单中的动作名会保持数据库规范名：
  - `running-left` → `walk_left`
  - `running-right` → `walk_right`
  - `happy` → `waving`（如果同时存在 `waving.gif`，优先保留真实 `waving.gif`）
- 同时写入 `scripts/{animal}_gif_urls.json`

如果 `requests` 模块缺失，先执行：
```bash
pip3 install requests -q
```

### 第 4 步：对比 URL 是否变化

读取上传前后的 `{animal}_gif_urls.json`（脚本已保存新版），与上一次提交的内容比较。
如果所有 URL 完全相同（极少发生，但理论上可能），仍建议执行第 5 步 check，
确认 snapshot SQL 里已经指向这些 URL。

### 第 5 步：同步正式 snapshot SQL

运行 snapshot URL 同步脚本：

```bash
python3 references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py dog
```

脚本会：
- 读取 `scripts/{animal}_gif_urls.json`
- 只覆盖 `docs/handover/petpals-dev-snapshot.sql` 中 `pet_action_resources.gif_url`
- 同步 `duration_ms` 和 `is_loop`，避免前端状态机按旧 timing 切换
- 将旧动作名规范化到当前数据库动作名：
  - `running-left` → `walk_left`
  - `running-right` → `walk_right`
  - `happy` → `waving`（仅在没有真实 `waving` URL 时作为兼容来源）
- 如果上传清单里有动作，但 snapshot SQL 没有对应行，会输出警告，必须告知用户

只检查、不写入时使用：

```bash
python3 references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py dog --check
```

### 第 6 步：严禁自动提交或推送 Gitee

本 skill 只能修改本地文件，不允许自动执行 `git commit`、`git push` 或任何 Gitee 上传动作。
只有用户明确要求上传 Gitee 时，才在单独任务里按用户指定分支处理。

### 第 7 步：汇报结果

告知用户：
- ✅ 成功上传多少个 GIF
- ⚠️ 哪些 GIF 因缺帧被跳过（如有）
- 📝 `petpals-dev-snapshot.sql` 更新了多少行
- ⚠️ 是否有动作名冲突、缺少 snapshot 行或其它警告
- 🚫 未自动提交/推送 Gitee

## 常见问题

**`requests` 未安装**：执行 `pip3 install requests -q`

**某个 stage 缺帧导致 GIF 跳过**：属于正常现象，记录并告知用户，不影响其他 GIF

**snapshot SQL 已更新但线上没变**：需要部署端重新导入 snapshot SQL，或执行对应的线上 UPDATE SQL。
本 skill 只更新本地正式 SQL 文件，不直接操作线上数据库。
