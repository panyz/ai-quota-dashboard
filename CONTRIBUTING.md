# 参与贡献

谢谢你看这个项目。它是一个**只读**的本地额度看板：读你自己浏览器里已登录的控制台页面、或你自己配置的只读接口，把数字汇总到一个本机页面和 Harness 插件里。贡献时请守住这条边界。

## 报告问题

- 先看 README 的 [排障](README.md#排障)、[已知限制](README.md#已知限制) 和退出码表。
- 开 issue 时带上 `quota doctor`、`quota list`、`quota probe --source <源> --json` 的输出，**并先删掉凭证、Cookie、页面 HTML 和账号信息**。
- 涉及凭证或调试端口的安全问题不要开公开 issue，见 [SECURITY.md](SECURITY.md)。

## 本地开发

需要 Node.js ≥ 22，没有运行时依赖，不需要 `npm install`。

```bash
npm test                                  # 85+ 个单测，全部是 node --test
QUOTA_TEST_MOCK=ok node bin/quota.js fetch # 不碰浏览器地跑一遍完整链路
node bin/quota.js serve --port 8787        # 本地看板
```

改页面或插件界面时，`QUOTA_TEST_MOCK` 的场景（`ok`、`not_logged_in`、`parse_failed`、`timeout`、`partial_source`、`partial_windows`、`mixed_failure`）可以不连真实浏览器就把各种状态摆出来。

## 新增一个数据源

一个来源 = 一份 manifest，必要时再加一个纯函数解析器。**数据模型、CLI、页面、插件都不需要改。**

1. 在 [`src/providers.js`](src/providers.js) 里加 manifest：`id`、`slug`、`name`、`url`、`transport`（`cdp` 读控制台文本 / `api` 调只读接口 / `auto` 有凭证走接口、否则走页面）、`windows`（有序，`semantic` 取 `percent|count|credits`，`periodMs: null` 表示余额型没有重置周期）、`parser`（`{ kind: "module", name, version }`）。
2. 控制台类来源需要 `ready.expr`（页面真正渲染出数字的表达式）和可选 `navigate`（工作区跳转、复用规则）。接口类来源在 `auth` 里写明凭证来自哪个环境变量或哪个官方客户端的本地文件。
3. 需要写解析器时，新建 `src/parsers/<vendor>.js`，导出 `parse(textOrJson, now)`，返回 `{ ok: true, windows, mainWindow, adapterVersion }` 或 `{ ok: false, code, message }`；再到 [`src/parsers/index.js`](src/parsers/index.js) 的 `PARSERS` 里把 `manifest.parser.name` 绑到函数上。
4. 补测试：控制台类来源把真实的 `document.body.innerText` 存成 `test/fixtures/<vendor>-page.txt`，接口类来源存脱敏后的 JSON，然后加 `test/unit/<vendor>-parser.test.js`。**解析失败、未登录、页面改版要各有一条断言**，别只测成功路径。
5. 想让插件额度条显示独立的中文/英文名字，在 [`client.js`](client.js) 的 `ZH`/`EN` 里加 `source.<id>` 和 `source.<id>.short`；不加会退回后端返回的名字。
6. `npm test` 全绿后，`node bin/quota.js sources` 应能看到新来源；README 的功能、凭证表、已知限制同步更新。

窗口语义的约定，照着已有的实现写：

- 模型存**剩余**，页面/接口给的通常是**已用**，换算只在解析器里做一次；
- 缺失就是缺失：读不到就不给窗口、不补 0、不猜值，`resetAt: null` 是合法状态；
- 失败保留上一次的好数字，只更新 `status` 与 `error`。

## 隐私与安全红线

- 不读、不导出 Cookie / Token / Storage / Network；
- 不点击、不输入、不代替用户登录，不处理验证码与 2FA；
- 凭证只从环境变量或官方客户端已写好的本地文件读取，**不写进 `state.json`**；
- 页面文本只用于解析，不落盘、不上传；
- 本地服务只绑 `127.0.0.1`，不允许去掉 token 或改绑外部地址。

## 提交与发布

- 提交信息用英文祈使句，标题说明做了什么，正文说明为什么（见 `git log` 现有风格）。
- 改了用户可见行为就同步 README 与 `quota --help`；改了数据格式就升 `SCHEMA_VERSION` 并在 `src/model.js` 里写迁移，旧数据自动升级而不是清空。
- 发布：更新 `CHANGELOG.md` 与 `package.json` 版本，打 tag（`vX.Y.Z`），GitHub Release 里贴同一段变更说明。
