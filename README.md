# AI 额度看板（quota）

把多个 AI 订阅的额度聚到一个本机看板：读取你在浏览器里已登录的控制台页面，输出结构化 JSON 和本地网页。

只读，不读取 Cookie/Token/API key，不上传数据。

> **非官方工具，与火山引擎、OpenCode、X 无关联。** 它依赖控制台页面结构和你自己的登录态；平台改版会失效，自动化访问也可能受各平台服务条款限制。请自行判断是否使用，风险自负。

## 功能

- 三端聚合：火山引擎 Coding Plan、OpenCode Go、X Premium（Grok）
- 每端固定 5 小时 / 周 / 月 三个窗口，各自显示剩余、总量、重置时间、更新时间
- 缺失或未读到的窗口保留旧值并标注，不补 0、不猜值
- 过期、未登录、调试端口不可用、页面改版都有明确状态与处理提示
- 本地网页看板，只绑 `127.0.0.1`，带一次性 token
- 命令行输出 JSON，方便脚本或 agent 调用

## 前置

- macOS 或 Linux，Node.js ≥ 22（零运行时依赖，无需 `npm install`）
- Chrome，另开一个专用 profile 并启用调试端口：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.chrome-agent"
```

- 在这个 profile 里**自行登录**要用到的控制台。本工具不处理登录、验证码或 2FA，也不接触凭据。

## 安装与运行

```bash
git clone <this-repo> ai-quota-dashboard
cd ai-quota-dashboard
node bin/quota.js --version
node bin/quota.js serve
```

`serve` 会打印带 token 的本地地址，用浏览器打开即可。也可以全局链接命令：

```bash
npm link        # 之后可直接用 quota
```

## 命令

```bash
quota fetch [--source volcengine|opencode-go|x-premium|all] [--timeout 秒] [--json]
quota list [source] [--json]
quota set x-premium --window week --remaining 31 --total 100 --unit % [--reset-at ISO] [--json]
quota sources [--json] [--set-default volcengine=week]
quota probe --source volcengine|opencode-go|x-premium [--json] [--out FILE]
quota clear --yes            # 别名 reset
quota doctor [--json]
quota serve [--port 8787]
quota --version
```

- `fetch` 逐源读取；只合并本次读到的窗口，没读到的保留旧值并在 `error.missingWindows` 标出。
- `--timeout` 是整条命令的总预算，不是每源各算。
- `set` 只允许 `x-premium`（解析失败时的手动覆盖），窗口固定 `h5|week|month`，一次只写一个窗口。
- `sources --set-default` 写入 `state.meta.defaultWindow`，不生成配置文件。
- `probe` 只读诊断：不写 `state.json`、不触发抓取。
- `serve` 生成一次性 token，只绑 `127.0.0.1`；打开页面会自动「刷新额度」（POST），「重新读取」仅 GET。Grok 卡片只显示周窗口。

## 数据与隐私

- 数据文件：`${QUOTA_DATA_DIR:-~/.ai-quota-dashboard}/state.json`，目录 `0700`、文件 `0600`，原子写。
- 只保存额度数值、重置时间、时间戳、默认窗口；**不保存** Cookie、Token、密码、页面 HTML、账号 ID。
- 读取方式：通过 CDP 读取已登录标签页的 `document.body.innerText`；不使用 Cookie/Network/Storage 导出能力。
- 本地网页只监听回环地址；无外部请求、无 CDN、无遥测。
- `quota --version` 打印当前数据格式版本（`schemaVersion`）。数据文件版本必须完全相等；更新或更旧都退出 8，不迁移、不写入。恢复：`quota clear --yes` 后重新抓取或录入。

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 全部失败，且各源错误码不同 |
| 2 | 参数错误 |
| 3 | CDP 不可用（9333 未监听） |
| 4 | 未登录 |
| 5 | 解析失败（页面改版） |
| 6 | 超时 |
| 7 | 部分成功（部分源或部分窗口） |
| 8 | 数据损坏/版本不符、目录不可写、端口占用 |

## 排障

| 现象 | 处理 |
|---|---|
| `cdp_unavailable` | 浏览器没开 9333：`quota doctor`，用 `--remote-debugging-port=9333` 重启 |
| `not_logged_in` | 在该 profile 登录对应控制台，再 `quota fetch` |
| `parse_failed` | `quota probe --source <src> --json` 看报告，必要时用 `--out` 保存 |
| 数据损坏 / 版本不符 | `quota clear --yes` |
| 端口占用 | `quota serve --port 8788` |

## 安全说明

`9333` 是本机高控制面端口：任何本机进程都能连上它，并通过它控制这个浏览器。请使用专用 profile、只在需要时开启，用完关闭。不要把调试端口暴露到局域网或公网。

## 测试

```bash
npm test
QUOTA_TEST_MOCK=ok quota fetch   # 可选值：ok | not_logged_in | parse_failed | timeout | partial_source | partial_windows | mixed_failure
```

mock 只在显式设置环境变量时生效。`AQD_TEST_MOCK` 是兼容别名。

## 已知限制

- 依赖控制台页面结构，平台改版会导致解析失败；需要按提示更新解析器。
- X / Grok 没有公开额度接口。自动读取 `grok.com/dashboard` 上暴露的周用量百分比（`N% used`），换算成剩余 `100-N`%；没有 5 小时 / 月窗口。页面改版后用 `quota probe --source x-premium`。
- 不处理登录、验证码、2FA；不做后台定时抓取。
- 只支持单账户；多账户不在当前范围。

## 许可证

MIT，见 [LICENSE](LICENSE)。
