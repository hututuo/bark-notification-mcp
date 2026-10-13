# 贡献说明

欢迎改进兼容性、测试和文档。请保留默认关闭、owner 绑定、服务端 key、固定 POST 目标、无自动重试与普通通知的安全边界。

1. 阅读 AGENTS.md 和 SECURITY.md。
2. 在 Node.js 22+ 运行 `npm test` 与 `npm run check`。
3. 新增/修复行为必须有离线回归测试，使用明显的合成凭据，不连接真实设备。
4. 兼容性改动同时检查 Node 和目标 Worker；不要假定 Web API 每个实现都支持全部可选参数。
5. 不在 issue、pull request、日志或截图中包含真实 Bark key、完整推送 URL、账户或私有部署信息。
6. 新增依赖前先说明必要性、精确版本和许可，更新 THIRD_PARTY_NOTICES.md。
7. 行为改变时更新相关部署指南、错误语义、限制和测试报告。

真实推送验收必须由设备所有者明确批准。无论 provider accepted 与否，都不要把未经确认的手机收讫写进报告。

提交代码时确认你有权按本项目 MIT 许可提供该贡献。源码仓库不接收生产 secret 或公开可调用的私有 owner 部署。
