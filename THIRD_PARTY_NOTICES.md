# 依赖、许可与上游来源

## 本项目代码

本仓库实现为独立编写，采用 MIT 许可，见 LICENSE。项目名仅描述与 Bark 的兼容用途，不代表 Finb、Apple 或 OpenAI 官方项目。

## 软件依赖

- 运行时 npm 依赖：无。
- 开发期 npm 依赖：无。
- JavaScript：ESM，Node.js 22+ 或支持所需标准 API 的 Worker。
- 使用宿主内置 Fetch、AbortController、Web Crypto、TextEncoder/TextDecoder、ReadableStream 和 structuredClone。
- 测试使用 Node.js 内置 `node:test` 与 `node:assert/strict`；检查脚本使用 Node.js 内置文件系统/子进程模块。
- 不复制或捆绑 Node.js、Cloudflare/workerd、Bark App、bark-server、MCP SDK 或日历服务的源代码/二进制，因此本包没有这些组件的分发物或 vendored 许可证。

Node.js/Worker 是执行环境，各环境自身的许可、服务条款和部署权限由各自发行方提供。接入现有项目时，该项目原有依赖和许可义务不会因本模块而消失。

## API 与文档依据

实现依据 Finb 原版 Bark/bark-server 的公开 API 和 MCP 文档，不复制其源代码。公共 API 服务不属于本仓库的 MIT 代码许可范围，其服务行为、政策和条款由运营方决定。

- [Finb/Bark](https://github.com/Finb/Bark) 与[上游许可](https://github.com/Finb/Bark/blob/master/LICENSE)
- [Finb/bark-server](https://github.com/Finb/bark-server) 与[上游许可](https://github.com/Finb/bark-server/blob/master/LICENSE)
- [API V2](https://github.com/Finb/bark-server/blob/master/docs/API_V2.md)
- [原版参数说明](https://github.com/Finb/Bark/blob/master/docs/en-us/params.md)
- [官方 MCP 说明](https://github.com/Finb/bark-server/blob/master/docs/MCP.md)
- [Apple APNs payload 说明](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CreatingtheNotificationPayload.html)

更完整的行为核对与引用见 docs/SOURCES.md。上游文档可能变化；文档核对日期为 2026-10-13。
