# Security model

## Trusted boundary

The host owns authentication, user consent, deployment secrets and transport admission. The adapter additionally compares the verified transport subject to `OWNER_USER_ID` on every tool call. Client-provided fields cannot select a different recipient or secret. Authentication means the caller belongs to the owner; it does not itself establish that a particular notification's content has been approved. The assistant/host must enforce those communication permissions.

The standalone example is a transport factory, not an unauthenticated server. A caller-chosen `X-User-ID` or `oai-authenticated-user-id` header is not identity proof on an ordinary public HTTP server. Sites integrations may use their injected identity only when requests necessarily pass through the authenticated Sites dispatch and no direct/bypass origin is enabled.

## Credential handling

`BARK_DEVICE_KEY` stays in server runtime configuration. The module neither reads local `.env` files nor exposes a credential-setting endpoint. The default fetch function invokes `globalThis.fetch` with the correct receiver for Workers. The sole upstream URL is constant; `redirect:'manual'` prevents automatic forwarding and all 3xx responses are treated as outcome-unknown without reading or using their Location. This is compatible with Cloudflare/workerd, which does not support `redirect:'error'`. The key is used only in the POST body. Never wrap this fetch with a payload-recording logger, proxy or APM.

The original public Bark service and APNs process the notification. The module's POST design cannot guarantee that the upstream service does not log request bodies. This is not end-to-end encrypted. The Bark server's open-source logger includes URL/body fields; the public operator's live retention practice has not been independently audited here.

## Input/output limits

Only explicitly listed own enumerable data properties are accepted. Unknown keys, accessors and invalid types are rejected. Title/body/group are length bounded; body and serialized public content also have UTF-8 byte bounds. Links require HTTP(S), exact configured origin, no embedded credentials, no whitespace/backslash/encoded CRLF and no `api.day.app` target. Links are notification tap actions, never fetched by the server. An allowlisted third-party website can itself redirect; allowlisting is not a guarantee about the eventual page or its privacy.

The module rejects literal inclusion of its own device key in notification fields/request IDs. This is defense in depth, not a general secret scanner: other credentials, transformed/encoded secrets and personal data must be kept out by caller policy. Do not rely on this check as a DLP system.

Only fixed, sanitized errors and result messages leave the adapter. Upstream body/error text is never echoed. Stored replay results are reconstructed from a fixed vocabulary, so a malformed storage result cannot inject a raw key, message or retry directive. A successful response is exactly HTTP 200 with parsed `code:200`; anything inconclusive is outcome-unknown. Response bodies are byte bounded and the full operation has a timeout.

## Delivery and duplicates

No blind transport retries. HTTP 4xx is a rejected request; timeouts, network failures, unexpected status, malformed response and server errors are treated conservatively as unknown. Neither accepted nor rejected status proves anything about a prior notification already on the phone.

Memory guard limits are scoped to one process. It keeps pending and terminal attempts for at least 24 hours but loses them on restart and has no coordination across replicas. Even durable local attempt tracking cannot guarantee exactly-once phone presentation when the provider lacks a reliable receipt/idempotency protocol. This channel is unsuitable for medical, safety-critical or guaranteed alarm delivery.

## Review scope

Offline tests cover the library, mock HTTP transport, an example standalone MCP handler and example composition. They do not validate the live public Bark service, actual phone receipt, Sites authentication infrastructure or a durable store implementation. No real credentials or real notification sends are used by these tests.
