# 变更记录

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-11-12

首个公开版本。

### 新增

- 七个数据源：OpenCode Go、X Premium · Grok、Claude、智谱 GLM Coding Plan、DeepSeek、阿里云百炼 Coding Plan、OpenAI Codex。
- 每个来源按自己声明的窗口展示（5 小时 / 周 / 月 / Sonnet 周 / Opus 周 / 余额），各自显示剩余、总量、重置时间与更新时间。
- 声明式 provider manifest + 通用窗口模型（`schemaVersion` 3）：`percent`、`count`、`credits` 三种语义，`periodMs: null` 表示没有重置周期的余额型来源。
- 本地网页看板 `quota serve`：只绑 `127.0.0.1`，每次启动生成一次性 token，无外链、无 CDN、无遥测。
- DSH（DeepSeek Harness）插件：输入框上方的额度条 + 锚定浮层明细，刷新走同源的 `GET /ai-quota/state` 与 `POST /ai-quota/refresh`。
- `quota probe` 只读诊断、`quota doctor` 自检、`quota sources` 列出来源与默认窗口。
- 中英双语界面文案；来源名称与窗口标签跟随宿主语言。

### 变更

- 数据格式从「每源固定 h5/week/month」改为 manifest 声明；旧版 `schemaVersion` 2 的数据在读取时自动迁移，额度数字保留。
- 接口类来源（Claude、智谱、DeepSeek、百炼、Codex）走 HTTP + 用户自己的 key，不经过浏览器；控制台类来源（OpenCode、Grok）通过 CDP 读取已登录标签页的可见文本，读取前会重新加载页面以免读到旧快照。

### 修复

- `auth_failed` / `config_error` 等状态落盘后再读会被重置为「未读取」，界面因此看不出凭证被拒。
- 缺少凭证时 `quota fetch` 报退出码 1（「全部失败且各源错误码不同」），现按凭证问题返回 4。
- 英文界面下额度条仍显示后端返回的中文来源名与窗口标签。
- 页面排障提示里残留的火山引擎 AK/SK 文案。
- `--source` 帮助信息、`quota --help` 的源列表和 README 与当前七个来源不一致。

### 移除

- 火山引擎 Coding Plan（AK/SK OpenAPI 通道）。

### 安全

- 凭证只从环境变量或官方客户端的本地文件读取，不写入 `state.json`；只读、无点击输入、无上行通道。

[0.2.0]: https://github.com/panyz/ai-quota-dashboard/releases/tag/v0.2.0
