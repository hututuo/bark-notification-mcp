# Bark Notification MCP

零运行时依赖、ESM、兼容 Node.js 22+ 和支持标准 Fetch/Web Crypto 的 Worker。为 Finb 原版 Bark 提供三个 owner-bound MCP 工具；可独立接入现有 MCP transport，也可与 iCloud 日历服务组合。

当前版本 `0.1.1`，采用 [MIT 许可](LICENSE)。默认关闭。开源内容只有通用源码和示例，不附带已配置的推送服务、设备 key 或个人账户。`private: true` 仅防止误发 npm，不影响 GitHub 源码开源。

**English:** A zero-dependency, owner-bound Bark notification adapter for private MCP services. Device keys remain server-side; the host supplies authenticated identity and optional durable duplicate/rate guards. Source is open; configured deployments and credentials must remain private. Independent project, not an official Finb, Apple or OpenAI product.

> 这是可接入现有 MCP 的模块与 transport scaffold，不是安装后就能匿名推送的现成公共服务。每位使用者须配置自己的服务器 secret、可信身份验证和部署入口；不提供共享 key 或公共演示推送端点。

仓库：[hututuo/bark-notification-mcp](https://github.com/hututuo/bark-notification-mcp)。

## 功能与边界

- `bark_status`：只读配置状态，不联系 Bark，不展示 key。
- `bark_test`：经用户明确同意后，发送一条固定、低敏的测试通知。
- `bark_send`：给服务器绑定的单一设备发送已授权内容，支持 `title`、`body`、`group` 和经白名单验证的 HTTP(S) 点击链接。
- 所有工具调用都核验可信传输层身份，并与服务器 `OWNER_USER_ID` 精确匹配。
- 固定向 `https://api.day.app/push` 发一次 HTTPS JSON POST；key 只在服务端请求正文中，不拼进 URL。
- 普通 `active` 通知；显式 `isArchive: "0"` 请求不存入 Bark App 历史。此设置不能保证上游日志或锁屏不保留内容。
- 不提供 critical、timeSensitive、循环响铃、自定义服务器、群发、删除通知、任意设备 key、图片加载或自定义 URL scheme。

它发送即时推送，不建立 iPhone「时钟」闹钟，不提供后台排程，也不保证手机收到、响铃或突破专注模式。API 成功只报告 `accepted`。

## 快速检查

```sh
npm test
npm run check
```

测试全部使用合成身份和模拟 fetch，不读取环境凭据、不发真实推送，无需安装依赖。

## 集成 API

```js
import {
  createBarkModule, createMemoryGuard,
  BARK_TOOLS, BarkError, safeBarkError
} from './src/index.js';

// 只创建一次；不能在每次请求时重建。
const guard = createMemoryGuard();

// env 来自服务器的安全运行时配置。不要把它传给前端。
const bark = createBarkModule({
  env,
  guard,
  resolveSubject: async request => verifyTrustedSession(request)
});

// 合并 bark.tools 到原有 tools/list。
// callerRequest 必须来自已验证的 transport，不能由工具参数提供。
const result = await bark.callTool('bark_status', {}, callerRequest);
```

`verifyTrustedSession` 是宿主已有的真正身份验证器，需返回已核验的 subject；本包不会把任意 HTTP 身份头当成可信。现有 Sites 服务应复用原身份验证，且不能存在绕过受信任 dispatch 的公开入口。

发送参数为 `{ request_id, body, title?, group?, url? }`；测试参数只接受 `{ request_id }`。每条逻辑通知的 `request_id` 必须固定，重复调用用同一个 ID。超时/断线后不能靠更换 ID 或重复发来「验证」。

`BarkError` 只用于发送前的验证、授权和限流问题；向 MCP 返回错误时使用 `safeBarkError(error)`。已尝试发送的结果返回对象，其 `status` 为 `accepted`、`rejected` 或 `unknown`，并始终 `automatic_retry: false`。MCP 层应把 `result.ok === false` 映射为 `isError: true`。不要输出原始异常或上游响应。

## 配置

所有值均由用户或获授权的部署管理员在服务器设置中提供：

- `OWNER_USER_ID`：既有受信任身份绑定。现有 iCloud 服务必须保留原值。
- `BARK_DEVICE_KEY`：服务器 secret。仅填设备 key；不是完整推送 URL。不要放进聊天、源代码、前端、仓库、日志、截图、MCP 参数或备份。
- `BARK_ENABLED`：必须为字符串 `true` 才启用；缺失、`false` 或缺 key 均禁发。
- `BARK_ALLOWED_URL_ORIGINS`：可选 JSON 字符串数组，如 `["https://example.com"]`。默认 `[]` 禁用链接。精确匹配协议、主机和端口，不支持通配符；禁止带账户密码和 `api.day.app` 通知链接。

不要为了添加 Bark 清空/覆盖已有 iCloud、owner 或其他 secrets。

## 重复与速率限制

默认内存 guard 在单一实例内限制 5 次/滚动分钟、30 次/滚动小时，记录尝试至少 24 小时。相同 ID/内容返回已记录结果；相同 ID/不同内容拒绝。正在发送或结果不明的同 ID 请求不会再发。达到记录容量时拒绝新请求，不驱逐尚在保护期的记录。

内存 guard 在重启后丢失，多个 Worker 副本各有一份。它不是跨实例限流，也不提供 exactly-once。生产多实例/自动排程应注入实现原子预留的持久 guard，见 [guard 协议](docs/GUARD_CONTRACT.md)。Bark 接口本身不提供本包可依赖的全局幂等保证；即使用持久 guard，手机实际呈现也无法被该接口验证。

## 内容与隐私

优先使用「结果已准备好」「请查看日历」等通用信号。正文、标题、分组与链接均会经过公共 Bark 服务和 Apple APNs，并可能在锁屏显示。本模块没有启用端到端加密。POST 正文只减少 URL 泄漏风险，不能宣称 Bark 不记录请求。不要推送密码、key、财务/健康/身份详情；其他个人信息须按用户已许可的具体内容和目的处理。

每个字段和 UTF-8 字节数均受本地保守限制；本地总内容 JSON 上限 2600 字节、正文 2000 字节。Apple 的普通 APNs 总 payload 限制还包括服务器包装字段；本包的限制不构成上游必收保证。

## 文档与示例

- [Bark → 快捷指令 → iPhone 闹钟扩展方案（含逐步设置与验收）](docs/SHORTCUTS_ALARM_EXTENSION.md)
- [部署、现有 iCloud 服务组合和用户验收](docs/DEPLOYMENT.md)
- [Agent 接手说明](AGENTS.md)
- [安全边界](SECURITY.md)
- [原版 Bark 资料和官方 MCP 的取舍](docs/SOURCES.md)
- `examples/standalone-mcp-worker.js`：必须注入可信身份验证器的独立 MCP scaffold
- `examples/compose-existing-mcp.js`：保留原有日历工具及身份验证的组合示例

## 许可与依赖

本项目原创代码采用 MIT 许可，保留 [LICENSE](LICENSE) 即可按许可使用、修改和分发。没有运行时或开发期 npm 依赖；测试使用 Node.js 内置 test runner，运行时使用标准 Fetch、Web Crypto 和 Streams。详见 [依赖与上游来源](THIRD_PARTY_NOTICES.md)。

可与独立的 [iCloud Calendar MCP](https://github.com/hututuo/icloud-calendar-mcp) 组合。Bark 模块不依赖 CalDAV，也不会因集成而更改日历凭据、日历写入开关或身份绑定。

提交改动前请读 [贡献说明](CONTRIBUTING.md)。发布源码和部署在线服务是不同操作；不要把已配置的实例或自己的 key 公开。

## 扩展：通知联动快捷指令与闹钟

希望通知到达后同步手机闹钟，可按 [中文扩展方案](docs/SHORTCUTS_ALARM_EXTENSION.md) 搭建：Bark 发固定低敏标记，iPhone 运行预设快捷指令，读取指定 iCloud 日历，再在本机“时钟”建闹钟。文档覆盖 iOS 27 通知触发、旧系统手动/定时兜底、23 小时窗口、重复去重、取消/改期、同步延迟和逐项验收。

这是文档级设计，未附带安装好的快捷指令；手机锁屏触发与实际响铃仍需实机验收。模块本身继续只发普通通知，不从云端直接操作 Clock，也没有新增 `ttl` 或自定义 URL scheme 支持。
