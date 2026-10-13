# Agent 开发与部署指南

本仓库是可独立复用的开源模块。先读 README.md、SECURITY.md、docs/DEPLOYMENT.md 和 docs/GUARD_CONTRACT.md；不要把真实 owner、设备 key、账户、服务实例标识、日历地址或部署配置写进源码。

## 本地检查

Node.js 22+。没有 npm 依赖，不需要安装包。运行：

```sh
npm test
npm run check
```

测试使用合成身份与模拟 fetch，不读取环境凭据，不发送真实通知。修改后重跑完整检查；若集成进宿主服务，还须运行宿主完整回归、构建与实际 Worker 运行时检查。

## 接入方式

- 使用 `createBarkModule({env, resolveSubject, guard, fetcher?})`，将 `BARK_TOOLS` 合并进既有 tools/list。
- `.callTool(name,args,request)` 的 request 是宿主可信传输上下文，不能来自工具参数。
- `resolveSubject` 必须校验真实 session 或可信 gateway assertion，返回其 subject。模块再与 `OWNER_USER_ID` 精确匹配。
- 不能把公网任意客户端提交的身份 header 当作身份验证。Sites 注入身份仅适用于所有请求都经过受信任 dispatch、且没有绕过入口的部署。
- guard 在每个 Worker/process 创建一次，不得按请求重建。要获得跨副本/重启的限制，注入持久、原子实现；独立 KV get/put 不够。
- 发送前问题抛 `BarkError`；使用 `safeBarkError` 输出固定安全字段。发出尝试后返回 accepted/rejected/unknown；`ok:false` 对应 MCP `isError:true`。
- 与日历服务组合时保留宿主原有鉴权、工具、secret、MCP 协议和路由；只按精确 Bark 工具名称分流，所有旧工具仍经宿主鉴权。

## 不可破坏的安全条件

1. 仅向常量 `https://api.day.app/push` 发 HTTPS POST，设备 key 只在服务端正文中。`redirect:'manual'`，所有 3xx 停止，不跟随或使用 Location。
2. 工具参数不能选择 key、收件设备、自定义服务器、批量发送、critical/timeSensitive、循环响铃、删除、任意 URL scheme 或任意上游字段。
3. `BARK_ENABLED` 缺失/不是字符串 true 或缺 key 时禁发；调用者不能自行启用。
4. 先验证 owner、参数与大小，再成功预留 guard，最后发一次请求。没有未受限 fallback。
5. 同一逻辑通知沿用 request_id。超时/断线/不确定响应不能自动重试、清除预留或换 ID 重发。
6. 原始 key、正文、URL、异常、上游响应和 trace 不进入日志或 tool result；周边 APM/proxy 也应关闭 request-body capture。
7. 本包只提供普通通知。accepted 不证明手机收到、响铃或建立时钟闹钟，不能用于安全关键告警。
8. `isArchive:"0"` 不是上游日志、锁屏隐私或端到端加密保证。默认用「结果已准备好」等低敏通用信号；敏感数据与凭据不适合作为推送正文。

## 安全配置与测试

保持 BARK_ENABLED=false，直到部署管理员安全配置并批准测试。用户通过目标服务器的 secret UI 输入设备 key；不要索取聊天里的完整 key 或含 key 的 Bark URL。配置发现、服务启动、status 和工具发现都不能触发推送。

真实测试必须先获设备所有者批准，只调用固定 `bark_test` 一次并请用户确认手机收讫。不因 API 接受就记录手机已收到。后续通信的内容、目的与频率仍需符合用户许可。

## 贡献与发布

本项目采用 MIT，保留 LICENSE 与 THIRD_PARTY_NOTICES.md。package.json 的 private:true 防止无意 npm 发布；GitHub 源码可按许可证分发。公开制品只能包含通用源码、文档、空值模板与合成测试，不得包含 .env、运行时 secret、Library/Drive 私有文件标识或部署元数据。发布前审查实际文件树和提交差异。
