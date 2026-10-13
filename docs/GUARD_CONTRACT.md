# Atomic rate and duplicate guard contract

`createBarkModule` requires a guard with `reserve()` and `complete()` to send. There is no implicit unguarded fallback. The included memory implementation is useful for tests and a single long-lived instance; it is not durable or distributed.

## API

```js
const guard = {
  durability: 'durable', // Claim this only after implementing/verifying persistence.
  async reserve({ scope, requestId, fingerprint }) {
    // Return exactly one of:
    return { kind: 'reserved' };
    // { kind: 'replay', result: previouslyRecordedResult }
    // { kind: 'pending' }
    // { kind: 'conflict' }
    // { kind: 'limited' }
    // { kind: 'unavailable' }
  },
  async complete({ scope, requestId, fingerprint, result }) {
    // Atomically mark the already-reserved record with this sanitized result.
  }
};
```

`scope` is a SHA-256 digest of the verified owner subject; `fingerprint` hashes the tool name and canonical notification content. Neither includes the raw device key. `requestId` is a bounded caller-chosen ID; do not embed secrets or personal details in it. Hashes of short/predictable content are not encryption; treat the store as private operational data.

## Required semantics

1. Atomically inspect/reserve `(scope, requestId)` and count attempts in the same consistency boundary. Concurrent replicas must never both get `reserved` for the same live request.
2. Same ID and fingerprint with a completed record returns `replay`. Different fingerprint returns `conflict`. A pending or outcome-unknown reservation must never be released merely because its original worker disconnected.
3. Count all reserved attempts, including rejected/unknown upstream results. Enforce at most five attempts per rolling minute and thirty per rolling hour for each scope (or stricter). A read-only replay does not spend new quota.
4. Retain pending and terminal dedupe records for at least 24 hours. This is a bounded retry-protection window, not infinite idempotency. A scheduler must keep its own logical-run record and never reuse IDs for new notifications.
5. Reserve before the outbound POST. Persist the reservation durably before returning `reserved`. A storage outage fails closed. Never fail open to an unguarded send.
6. `complete` may store only the sanitized small result; never store the secret, full notification payload, request body, raw response or stack. The adapter canonicalizes replay results again.
7. Keep reservations when recording fails. The adapter reports `dedupe_record:'unconfirmed'` and forbids automatic retry. Any reconciliation must be conservative and cannot infer phone receipt.
8. Bound record count/storage and fail closed at capacity; do not evict records still inside retention just to admit another send.
9. Make time comparisons monotonic or defensively handle clock rollback. Bound storage calls with the host's operational deadlines; a stalled storage call must not trigger speculative sending.

Use an atomic database transaction, serialized durable object or equivalent strong primitive. Eventually-consistent KV `get` then `put` is insufficient. A generic production provider adapter is intentionally not included because correctness depends on the host's actual storage semantics and deployment topology.

## Limitations even with durable storage

If a process crashes after reserve but before/after the provider accepts the push, the durable record stays pending/unknown. It suppresses another send but cannot discover whether the device received the first. Reliable reconciliation requires a provider receipt mechanism not supplied by this adapter. Do not clear the record or automatically generate a new ID to escape this uncertainty.
