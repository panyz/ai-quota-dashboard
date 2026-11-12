# AI 额度看板（quota）

把多个 AI 订阅的额度聚到一个本机看板：读取你在浏览器里已登录的控制台页面，输出结构化 JSON 和本地网页。

只读：不读取或导出浏览器的 Cookie、登录态；接口类来源只使用你自己配置的 key，凭证不会写进 `state.json`，也不会上传。

> **非官方工具，与 OpenCode、X 及各模型厂商无关联。** 它依赖控制台页面结构和你自己的登录态；平台改版会失效，自动化访问也可能受各平台服务条款限制。请自行判断是否使用，风险自负。

## 功能

- 聚合：OpenCode Go、X Premium（Grok）、Claude、智谱 GLM、DeepSeek、阿里云百炼、OpenAI Codex
- 每个来源按自己声明的窗口展示（5 小时 / 周 / 月 / Sonnet 周 / Opus 周 / 余额），各自显示剩余、总量、重置时间、更新时间
- 缺失或未读到的窗口保留旧值并标注，不补 0、不猜值
- 过期、未登录、调试端口不可用、页面改版都有明确状态与处理提示
- 本地网页看板，只绑 `127.0.0.1`，带一次性 token
- 命令行输出 JSON，方便脚本或 agent 调用

## 前置

- macOS 或 Linux，Node.js ≥ 22（零运行时依赖，无需 `npm install`）
- Chrome，另开一个专用 profile 并启用调试端口：

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.chrome-agent"

# Linux
google-chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.chrome-agent"
```

- 只有控制台类来源（OpenCode Go、X Premium）需要这一步；接口类来源不经过浏览器。不打算用这两个来源的话，可以跳过 Chrome，只配 key。

- 在这个 profile 里**自行登录**要用到的控制台。本工具不处理登录、验证码或 2FA。
- 接口类来源使用你自己的 key，或官方客户端已经写在本机的凭证。不会把凭证写入 `state.json`。

| 来源 | 凭证 |
|---|---|
| Claude | `ANTHROPIC_OAUTH_TOKEN`，或 `~/.claude/.credentials.json` |
| 智谱 | `Z_AI_API_KEY` 或 `BIGMODEL_API_KEY`；国内 host 用 `Z_AI_API_HOST=open.bigmodel.cn` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| 阿里云百炼 | `ALIBABA_CODING_PLAN_API_KEY` 或 `DASHSCOPE_API_KEY` |
| OpenAI Codex | `CODEX_ACCESS_TOKEN`，或 `~/.codex/auth.json` |

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

## Harness 插件

本仓库同时是一个 DSH（DeepSeek Harness）Cordis bundle 插件，可直接在 Harness Web 界面里使用：

- Host 半部（`index.js`）注册 `GET /ai-quota/state` 与 `POST /ai-quota/refresh`，复用 `src/` 里同一套 store / refresh / view 逻辑；
- Client 半部（`client.js`）在输入框上方的 `conversation.composer.dock` 插槽里放一条紧凑额度条；点击后在额度条正上方浮出一层明细（每个来源的 5 小时 / 周 / 月、重置时间与刷新按钮），没有遮罩、不抢焦点。额度条只列真的有数字的来源：一次都没读到、或读取失败且一个数字都没拿到（缺凭证、未登录、解析失败于首次读取）的来源不占位，明细里也不会列；读取失败但还留着上次数字的来源照常显示，状态与错误一并标出。全部来源都没数字时明细显示「暂无数据」。浮层挂在框架级 `shell.overlay` 插槽里、按额度条的实测位置用 fixed 坐标定位，因为输入框容器会裁剪自己的子元素。

安装（在 Harness 里让 agent 执行，`target` 用本仓库绝对路径）：

```text
plugin_manager action=install_bundle target=/绝对路径/ai-quota-dashboard-for-github
```

装好后输入框上方会出现「AI 额度」条，点一下在它上方浮出明细（Esc、点浮层外面、点关闭按钮、或再点一次额度条都能收起）。点击刷新会在后台跑一次真实读取（`POST /ai-quota/refresh` → 202），界面轮询 `/ai-quota/state` 直到完成；没装 Chrome 调试端口时会显示「浏览器未连接」而不是卡住。

- 插件与 CLI 共用 `~/.ai-quota-dashboard/state.json`，不额外落盘、不上传；
- 刷新是真实读取：会先把对应来源已打开的控制台标签页重新加载一次再读（只读，不点击、不输入、不读凭据）。这些控制台只在页面加载时拉取一次用量快照，长期挂着的标签页只会读到旧数字，所以每次都 reload 才能拿到当前值（`quota probe` 也一样）；
- 浏览器页面本身的刷新不会触发读取，只有条上的刷新按钮 / `quota fetch` 才会；
- `install_bundle` 对已安装的包会报 `already-installed`；改了 `client.js` 后可以先 `remove_bundle` 再装，或直接重启 Harness（`pnpm run dev:web` 运行时才走 HMR）；
- 卸载：`plugin_manager action=remove_bundle target=ai-quota-dashboard`；只想临时关掉的话，先 `list_plugins` 查到该插件的 `entryId`，再 `set_plugin` 置 `enabled=false`（bundle 名和 entryId 不是一回事）。

## 命令

```bash
quota fetch [--source <源>|all] [--timeout 秒] [--json]
quota list [源] [--json]
quota set x-premium --window week --remaining 31 --total 100 --unit % [--reset-at ISO] [--json]
quota sources [--json] [--set-default <源>=<窗口|auto>]
quota probe --source <源> [--json] [--out FILE]
quota clear --yes            # 别名 reset
quota doctor [--json]
quota serve [--port 8787]
quota --version
```

`<源>` 可写 id 或别名（`quota sources` 会全部列出）：`opencode-go`、`x-premium`、`claude`、`zhipu`、`deepseek`、`alibaba`、`codex`。

- `fetch` 逐源读取；只合并本次读到的窗口，没读到的保留旧值并在 `error.missingWindows` 标出。
- `fetch` 默认读取全部自动源；没配 key、没开调试端口的源会被记为各自的错误码（如 `config_error`、`cdp_unavailable`），不影响其它源的结果，但整条命令会以部分成功（7）退出。只用其中一两家时建议加 `--source`。
- `--timeout` 是整条命令的总预算，不是每源各算。源越多、控制台越慢，越需要放宽这个值。
- `set` 只允许 `x-premium`（解析失败时的手动覆盖），窗口固定 `h5|week|month`，一次只写一个窗口。
- `sources --set-default` 写入 `state.meta.defaultWindow`，不生成配置文件。
- `probe` 只读诊断：像刷新一样重新加载已打开的控制台标签页、或调用只读接口再读，但不写 `state.json`。
- `serve` 生成一次性 token，只绑 `127.0.0.1`；打开页面会自动「刷新额度」（POST），「重新读取」仅 GET。Grok 卡片只显示周窗口。

## 数据与隐私

- 数据文件：`${QUOTA_DATA_DIR:-~/.ai-quota-dashboard}/state.json`，目录 `0700`、文件 `0600`，原子写。
- 只保存额度数值、重置时间、时间戳、默认窗口；**不保存** Cookie、Token、密码、页面 HTML、账号 ID。
- 读取方式：控制台类来源通过 CDP 读取已登录标签页的 `document.body.innerText`；接口类来源用你自己配置的 key 直接调只读接口，不经过浏览器。不使用 Cookie/Network/Storage 导出能力。
- 本地网页只监听回环地址；无外部请求、无 CDN、无遥测。
- `quota --version` 打印当前数据格式版本（`schemaVersion`，当前为 3）。版本 2 的数据文件在读取时自动升级，额度数字保留；比 2 更旧、或比当前更新的版本退出 8，不写入。恢复：`quota clear --yes` 后重新抓取或录入。

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 全部失败，且各源错误码不同 |
| 2 | 参数错误 |
| 3 | CDP 不可用（9333 未监听） |
| 4 | 未登录 / 缺少凭证或被拒绝 |
| 5 | 解析失败（页面改版） |
| 6 | 超时 |
| 7 | 部分成功（部分源或部分窗口） |
| 8 | 数据损坏/版本不符、目录不可写、端口占用 |
| 9 | 浏览器打不开目标站点（Chrome 自身报错页，如 `ERR_CONNECTION_CLOSED`） |

## 排障

| 现象 | 处理 |
|---|---|
| `cdp_unavailable` | 浏览器没开 9333：`quota doctor`，用 `--remote-debugging-port=9333` 重启 |
| `not_logged_in` | 在该 profile 登录对应控制台，再 `quota fetch` |
| `parse_failed` | `quota probe --source <src> --json` 看报告，必要时用 `--out` 保存 |
| `config_error` | 这个源没有凭证：按上表设置环境变量，或先登录对应的官方客户端，再 `quota fetch` |
| `auth_failed` | 接口拒绝了凭证：确认环境变量或凭证文件里的 key 完整、未过期，且账号仍有生效的订阅 |
| 刷新后数字不变 | 刷新会 reload 对应控制台标签页再读；若仍不变，先用 `quota probe --source <src> --json` 确认页面本身已更新（平台可能延迟），再看标签页里显示的用量是否真的变了 |
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

- 依赖控制台页面结构，平台改版会导致解析失败；需要按提示更新解析器。接口类来源（Claude、DeepSeek、智谱、百炼、Codex）不吃页面结构，不受控制台改版影响。
- X / Grok 没有公开额度接口。自动读取 `grok.com/dashboard` 上暴露的周用量百分比（`N% used`），换算成剩余 `100-N`%；没有 5 小时 / 月窗口。页面改版后用 `quota probe --source x-premium`。
- 百炼的额度接口是控制台内部接口：部分账号即使配了 API key，仍会返回 `ConsoleNeedLogin`（需要控制台登录态），此时这个源读不到数字，只能等平台开放接口。
- 默认的 `quota fetch` 会依次读取全部自动源，共享一个总预算；未配置的源会各自失败并让命令以部分成功（7）退出。只想看一两家时用 `--source`。
- 不处理登录、验证码、2FA；不做后台定时抓取。
- 只支持单账户；多账户不在当前范围。

## 许可证

MIT，见 [LICENSE](LICENSE)。
