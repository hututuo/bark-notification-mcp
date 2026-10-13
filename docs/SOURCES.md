# Original upstream sources and integration choices

Reviewed 2026-10-13. These URLs are public source documentation; they contain no user device keys. Upstream `master` documents may change after this review.

1. [Finb Bark tutorial](https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md): supports JSON POST `/push` with the device key in the request body.
2. [Finb bark-server API V2](https://github.com/Finb/bark-server/blob/master/docs/API_V2.md): request field reference.
3. [Finb Bark parameter reference](https://github.com/Finb/Bark/blob/master/docs/en-us/params.md): active/time-sensitive/critical behavior, App archive setting and URL actions. This package intentionally exposes a narrower subset.
4. [Official MCP instructions](https://github.com/Finb/bark-server/blob/master/docs/MCP.md) and [MCP handler](https://github.com/Finb/bark-server/blob/master/route_mcp.go): upstream supports a key-bearing `/mcp/{device_key}` endpoint or a `device_key` tool argument. The reviewed handler does not provide the owner-bound, server-secret abstraction required here. Optional self-hosted server authentication is separate; do not infer the entire server has no authentication from this handler.
5. [Push handler](https://github.com/Finb/bark-server/blob/master/route_push.go): forwards a request to APNs, produces success/failure responses and supports broader batch parameters which this adapter does not expose.
6. [Router/response/logger implementation](https://github.com/Finb/bark-server/blob/master/router.go): successful JSON includes numerical `code:200`; raw error messages are not safe to forward. The open-source logger includes URL and request-body fields. This package cannot promise the public service does not log them.
7. [Apple APNs payload documentation](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CreatingtheNotificationPayload.html): ordinary remote-notification payloads have a total 4096-byte limit including JSON fields. The adapter imposes a lower local UTF-8 content budget rather than treating characters as bytes.
8. [Bark FAQ](https://github.com/Finb/Bark/blob/master/docs/faq.md): public-service anti-abuse rules do not constitute a delivery guarantee or permission to send unbounded traffic.

## Why a dedicated adapter when official MCP exists?

The official MCP integration is useful for callers willing to manage its credential-bearing endpoint/argument model. This package instead fixes the recipient in a server secret, reuses the host's authenticated owner identity, restricts fields/privileges, prevents the model from handling the key, returns sanitized outcomes and defines conservative duplicate/rate guard semantics. It uses the original public API; it is not an alternative Bark App or an official Finb package.

No upstream source code is copied into the implementation. This is an independently written adapter based on documented behavior; upstream names remain their respective owners' names.
