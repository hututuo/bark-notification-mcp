# 部署与安全验收

## A. 独立复用

1. 将 `src/` 和文档复制到获授权的服务项目，或以本地 ESM 包依赖使用。Node 22+ 与现代 Worker 可直接加载；没有运行时 npm 依赖。
2. 宿主必须提供可信身份验证器与 private/owner-only admission。`examples/standalone-mcp-worker.js` 提供 stateless JSON POST MCP scaffold，刻意不附送「信任任意 header」的鉴权实现。不能未经配置就把它作为公网推送入口部署。
3. 每个服务实例构建一次 guard。生产多副本服务提供符合 GUARD_CONTRACT.md 的持久原子实现；若暂用 memory guard，必须明确告知其重启/多副本限制，不能宣称全局限流或跨实例去重。
4. 按宿主支持的方式打包和部署。部署前审查最终产物，确认只含通用源码，没有 `.env`、运行时 secret、真实身份或其他服务私有资料。
5. 在服务器设置中先保留 `BARK_ENABLED=false`，添加下面列出的配置。不要添加前端配置入口。

## B. 与现有 iCloud MCP 服务组合

不替换 iCloud 工具、凭据或 MCP transport。复用现有 `authenticatedUser(request, env, true)`、`OWNER_USER_ID`、runtime fetch、既有路由与 CalDAV 权限。

1. 将本模块 `src/` 拷贝进私有项目的明确子目录，例如 `src/bark/`；保持模块内部相对 import 不变。
2. 在现有 `createWorker()` 闭包构建一个 guard；禁止每请求构建。合并 `BARK_TOOLS` 到原 TOOLS；冲突名称应拒绝启动。
3. `/mcp` 的原鉴权必须继续在 dispatch 前执行。只在 name 精确属于 Bark 三工具时转给本模块，其他名称继续交给原 calendar `callTool`。
4. 调用 `createBarkModule({env, guard, fetcher, resolveSubject: req => authenticatedUser(req, env, true)})`，再 `.callTool(name, args, request)`。参照 `examples/compose-existing-mcp.js`。
5. 捕获 `BarkError` 时使用 `safeBarkError`。未授权错误仍保留 HTTP 401/403 语义；不要被原通用错误转换器伪装成内部错误。结果 `ok:false` 则 MCP `isError:true`。
6. 配置状态可显示 `enabled`、`guard_durability`、`links_enabled` 和 `live_delivery_verified:false`。不要展示设备 key、推送 URL或原始上游信息。
7. 保留原 iCloud key/value，不清空或批量覆盖其 secrets。不因新增 Bark 修改既有日历 WRITE_ENABLED 或 owner。纯通知功能不应要求日历密码。
8. 重跑模块及原服务完整测试，构建并验证 worker 产物。先验证 Bark 关闭时日历行为完全不变，再执行经授权的实时测试。

冻结的通用公开日历包不应自动被私有集成修改。要更新公开版本，应另行获得发布许可并只合并通用代码、无值模板和文档。

## C. 用户安全设置

最终运行时变量：

- `BARK_DEVICE_KEY`：server secret，用户从 Finb 原版 Bark 获得的设备 key。App 显示的完整测试 URL含有该凭据；不要粘贴到聊天或日志。用户自己在准确的私有服务设置中输入 key。
- `BARK_ENABLED`：显式字符串 `true` 启用，`false` 停用。未填 key 时即使 true 也不发送。
- `OWNER_USER_ID`：保留宿主已验证的绑定；新服务通过宿主的安全 owner 绑定流程设置。
- `BARK_ALLOWED_URL_ORIGINS`：可选，默认空 JSON 数组 `[]`。普通测试不需要任何链接白名单。

配置 secret/持久访问须遵循宿主确认与安全交接流程。代码本身不代替用户接受或授权该设置。不要为了调试向用户显示完整 runtime env。

## D. 一次低敏测试

仅在安全设置完成且用户明确同意发送一次测试后调用 `bark_test`。固定内容为：

- 标题：`Bark connection test`
- 正文：`This is a test notification from your private assistant connection.`
- 分组：`connection-test`
- 普通 active 通知，`isArchive:"0"`，无 URL，无隐私内容，无 critical/timeSensitive/call。

流程：

1. 先调用 `bark_status`，确认绑定、启用和 guard 状态。该步骤不发通知。
2. 若尚未获授权，向用户说明这条测试会经 Bark/Apple 发到其设备，请其同意。
3. 为本次逻辑测试生成一次 request_id，调用一次 `bark_test`。
4. 若 `accepted`，只报告「Bark 已接受测试请求」，请用户确认手机上是否收到及如何显示。不能报告已经响铃或建立时钟闹钟。
5. 若 `unknown` 或超时，先让用户检查手机；不自动重试，不生成新 ID。重复查询同 ID只会回放记录，不会确定设备是否收到了。
6. 若 `rejected`，仅给固定诊断类别，让用户在服务器安全设置中检查 key/App注册。不要把原始错误或凭据贴回聊天。
7. 确认收到后可在宿主的状态记录中标注这一次实际测试时间/结果；不要把模块静态 `live_delivery_verified:false` 改成对未来推送的保证。

配置完成不是发送任意内容的长期授权。后续通知的内容、目的、频率仍需符合用户授权。想要未来定时提醒，应另行配置获授权的 scheduler，并保留其记录与本模块 request_id；本包不自己建立定时任务。

## E. 回滚

将 `BARK_ENABLED` 设回 `false` 即停止后续新推送，不删除 iCloud 配置。禁用不能撤回已经发送的通知。本版本不提供删除通知工具。去重记录不要为了排错随意清空；更换/轮换设备 key 后仍应保留逻辑通知 ID。公开发布前应再次扫描包，确保没有 runtime secrets、真实个人标识、部署元数据或测试截图。
