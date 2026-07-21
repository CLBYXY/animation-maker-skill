# refresh-pet-gifs

重新打包 PetPals 宠物 GIF，上传 CDN，并同步正式 snapshot SQL 中的动画 URL 和基础 timing 信息。

这个 skill 位于动画生产链路后半段：单帧和 `animation-timing.json` 已经确认后，再用它生成可被老师端播放的 GIF URL。

## 输入

```text
workspace/animals/<animal>/stage*/单帧/
workspace/animals/<animal>/stage*/animation-timing.json
```

## 输出

```text
animals/<animal>/stage*/gif/*.gif
scripts/<animal>_gif_urls.json
docs/handover/petpals-dev-snapshot.sql
```

## 标准流程

1. 运行 PetPals 项目内的 `scripts/make_gifs.py` 生成 GIF。
2. 上传 GIF 到 CDN。
3. 写入 `scripts/<animal>_gif_urls.json`。
4. 用 `update_snapshot_urls.py` 同步 snapshot SQL。
5. 汇报上传数量、跳过项、SQL 更新行数和警告。

## 常用命令

```bash
cd <skill root>
python3 scripts/make_gifs.py dog
python3 references/source-skills/refresh-pet-gifs/scripts/upload_gifs.py dog
python3 references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py dog
```

只检查 SQL 是否需要更新：

```bash
python3 references/source-skills/refresh-pet-gifs/scripts/update_snapshot_urls.py dog --check
```

## 动作名兼容

上传和 SQL 同步时会做旧动作名兼容：

| 旧文件名 | 数据库动作 |
| --- | --- |
| `running-left` | `walk_left` |
| `running-right` | `walk_right` |
| `happy` | `waving`，如果存在真实 `waving.gif` 则优先使用真实文件 |

## 安全提醒

- 不要把 CDN API Key 提交到公开仓库。
- 不要自动执行 `git commit`、`git push` 或 Gitee 上传。
- 缺帧导致某个 GIF 跳过时，记录并告知，不影响其他 GIF。

