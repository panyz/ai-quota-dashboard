# 安全策略

## 支持范围

只维护 `main` 分支的最新提交。历史 tag 不一定回补修复。

## 报告安全问题

- 用 GitHub 的私密渠道：[Report a vulnerability](https://github.com/panyz/ai-quota-dashboard/security/advisories/new)，或仓库 **Security → Advisories**。
- **不要**开公开 issue，也不要在任何地方贴出 API key、OAuth token、Cookie、页面 HTML 或 `state.json` 原文。
- 尽量带上：受影响的提交 / 版本、复现步骤、影响（能否读凭据、能否被局域网访问等）。个人项目，会尽量在 7 天内回复。

## 安全模型

这个工具刻意只做很少的事，边界就是它的安全承诺：

| 约束 | 实现 |
|---|---|
| 不持有凭据 | 只从环境变量或官方客户端已写好的本地文件读取，用完即弃，不写进 `state.json` |
| 不导出浏览器数据 | 只读 `document.body.innerText` 与 `location.href`；不读 Cookie / Token / Storage / Network，不点击、不输入 |
| 只读接口 | 接口类来源只发只读 GET（百炼是一个查询用的 POST RPC，body 为空） |
| 数据落在本机 | `${QUOTA_DATA_DIR:-~/.ai-quota-dashboard}/state.json`，目录 `0700`、文件 `0600`、原子写 |
| 只监听回环 | `quota serve` 只绑 `127.0.0.1`，每次启动生成一次性 token，页面无外链、无 CDN、无遥测 |
| 不上传 | 没有任何上行通道；Harness 插件只是同源读取本地路由 |

## 已知攻击面与自行防护

1. **调试端口 9333 是本机的高控制面端口**：任何本机进程都能连上它并控制那个浏览器。请用专用 profile、只在需要时开启、用完关掉，不要把它暴露到局域网或公网。
2. **控制台页面文本可能含账号信息**（邮箱、组织名、对话摘要）。`quota probe --out` 保存的文件按原文处理，别随手贴到 issue 或聊天里。
3. **`state.json` 只保存额度数字**，但同一用户下的其它进程仍然可读；不要把它同步到公共网盘。
4. **`quota serve` 的 token 在 URL 里**：分享截图或日志前先删掉 token；不要把它转发给别人。
5. **Harness 插件注册的 `/ai-quota/state` 路由**与 Harness Web 服务同源，谁能访问 Harness 谁就能读这些数字（不含凭据）。Harness 暴露到公网前请先加访问控制。
6. **第三方平台风险**不是本项目的漏洞：读取依赖控制台页面结构，自动化访问可能受各平台服务条款限制，账号风控风险请自行评估。
