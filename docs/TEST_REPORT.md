# Validation report

Version: 0.1.1. Reviewed: 2026-10-13. Runtime: Node.js v24.19.0.

## Passed

- `npm test`: 33 offline tests.
- `npm run check`: JavaScript syntax and source-safety checks.
- Owner binding before status/send; missing/invalid/wrong identity rejection.
- Missing or false enabled flag and absent key disable sends.
- One fixed HTTPS POST endpoint with JSON-only device key and blocked redirects.
- Unknown/privileged fields, invalid types, accessor properties, oversized text/UTF-8 and unsafe URL inputs reject before transport.
- No custom critical/time-sensitive/looping sound, batch, delete or credential arguments.
- Exact allowed HTTP(S) origins; no linked-URL fetch by the adapter.
- Upstream error text/key echoes never returned; replay/completion adapter outputs cannot inject raw messages, keys or retry instructions.
- Fixed low-sensitivity test content; discovery/status do not push.
- Same ID replay suppression, in-flight duplicate suppression and changed-content conflict.
- Rate limits, retention, record capacity and defensive clock rollback handling.
- Missing/failed guard fails closed; failed outcome recording never retries.
- Timeout covers transport and body reading; network/server/malformed/oversized responses remain unknown.
- Standalone MCP scaffold and existing-service composition preserve identity checks; asynchronous authentication rejection blocks both old and new dispatch.

## Not run / not claimed

- No real Bark key read or configured.
- No real notification sent, phone received or sound/Focus behavior verified.
- No live deployment or public publication performed by this package build.
- No implementation of a production durable/distributed guard included or certified.
- No promise of exactly-once delivery, full upstream logging privacy, end-to-end encryption or iOS Clock alarm creation.

All fixtures are synthetic. Existing private service integration requires its own full regression/build/identity checks after copying this module.
