import test from 'node:test';
import assert from 'node:assert/strict';
import { BARK_ENDPOINT, BARK_TOOLS, BarkError, createBarkModule, createMemoryGuard, safeBarkError } from '../src/index.js';

// Synthetic fixtures only; none of these values identify a real device/user.
const DEVICE = 'synthetic_bark_fixture_not_a_device';
const OWNER = 'fixture-owner';
const ENV = { OWNER_USER_ID: OWNER, BARK_ENABLED: 'true', BARK_DEVICE_KEY: DEVICE };
const ok = () => new Response(JSON.stringify({ code: 200, message: 'success', timestamp: 123 }), { headers: { 'Content-Type': 'application/json' } });
function setup(options = {}) {
  const calls = [];
  const module = createBarkModule({ env: ENV, resolveSubject: () => OWNER, guard: createMemoryGuard(), fetcher: async (...args) => { calls.push(args); return ok(); }, ...options });
  return { module, calls, send: (args = {}) => module.callTool('bark_send', { request_id: 'notify-1', body: 'Example notification', ...args }, {}) };
}
async function errorCode(promise, code) { await assert.rejects(promise, error => error instanceof BarkError && error.code === code && !JSON.stringify(safeBarkError(error)).includes(DEVICE)); }

test('fixed endpoint, body credential, active alert and no archive; no extra fields', async () => {
  const { send, calls } = setup();
  const result = await send({ title: 'Ready', group: 'examples' });
  assert.equal(result.status, 'accepted');
  assert.equal(result.device_received, 'unverified');
  assert.equal(result.automatic_retry, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], BARK_ENDPOINT);
  const init = calls[0][1];
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  assert.deepEqual(JSON.parse(init.body), { body: 'Example notification', title: 'Ready', group: 'examples', device_key: DEVICE, level: 'active', isArchive: '0' });
  assert.equal(JSON.stringify(result).includes(DEVICE), false);
});

test('schema is frozen and tool metadata never claims send idempotency', () => {
  for (const tool of BARK_TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(Object.isFrozen(tool.inputSchema));
    for (const field of ['device_key', 'device_keys', 'host', 'level', 'call', 'volume', 'sound', 'id', 'delete']) assert.equal(field in tool.inputSchema.properties, false);
  }
  assert.equal(BARK_TOOLS.find(tool => tool.name === 'bark_send').annotations.idempotentHint, false);
});

test('missing settings or explicit disabled flag sends nothing', async () => {
  for (const env of [{ OWNER_USER_ID: OWNER }, { ...ENV, BARK_DEVICE_KEY: '' }, { ...ENV, BARK_ENABLED: 'false' }, { ...ENV, BARK_ENABLED: true }]) {
    const { module, send, calls } = setup({ env });
    assert.equal((await module.callTool('bark_status', {})).enabled, false);
    await errorCode(send(), 'BARK_DISABLED');
    assert.equal(calls.length, 0);
  }
});

test('owner binding always precedes status or sends', async () => {
  for (const [options, expected] of [
    [{ env: { ...ENV, OWNER_USER_ID: undefined } }, 'OWNER_NOT_CONFIGURED'],
    [{ resolveSubject: () => null }, 'UNAUTHENTICATED'],
    [{ resolveSubject: () => 'different-owner' }, 'FORBIDDEN'],
    [{ resolveSubject: () => { throw new Error(DEVICE); } }, 'UNAUTHENTICATED']
  ]) {
    const { module, send, calls } = setup(options);
    await errorCode(module.callTool('bark_status', {}), expected);
    await errorCode(send(), expected);
    assert.equal(calls.length, 0);
  }
  assert.throws(() => createBarkModule({ env: ENV }), /identity resolver/);
});

test('status exposes no device key, origins or owner identifier', async () => {
  const { module, calls } = setup();
  const result = await module.callTool('bark_status', {});
  assert.equal(result.enabled, true);
  assert.equal(result.guard_durability, 'process-memory');
  assert.equal(result.live_delivery_verified, false);
  assert.equal(JSON.stringify(result).includes(DEVICE), false);
  assert.equal(JSON.stringify(result).includes(OWNER), false);
  assert.equal(calls.length, 0);
});

test('fixed low-sensitivity test only accepts request_id', async () => {
  const { module, calls } = setup();
  await module.callTool('bark_test', { request_id: 'test-1' });
  assert.equal(JSON.parse(calls[0][1].body).title, 'Bark connection test');
  await errorCode(module.callTool('bark_test', { request_id: 'test-2', body: 'override' }), 'INVALID_ARGUMENT');
  assert.equal(calls.length, 1);
});

test('arbitrary keys and privilege escalation are rejected', async () => {
  for (const field of ['device_key', 'device_keys', 'host', 'baseURL', 'level', 'critical', 'call', 'volume', 'sound', 'isArchive', 'ciphertext', 'url_origin', 'owner', 'delete', 'id']) {
    const { send, calls } = setup();
    await errorCode(send({ [field]: 'unsafe' }), 'INVALID_ARGUMENT');
    assert.equal(calls.length, 0);
  }
});

test('size, Unicode UTF-8, controls, objects, request IDs and whitespace bounds', async () => {
  const invalid = [
    { body: '' }, { body: '   ' }, { body: 'x'.repeat(1001) }, { body: '界'.repeat(667) },
    { title: 'x'.repeat(81) }, { group: 'x'.repeat(33) }, { title: 'line\nbreak' },
    { body: 'null\u0000byte' }, { body: {} }, { body: null },
    { request_id: '' }, { request_id: 'x'.repeat(65) }, { request_id: 'with space' },
    { title: null }, { group: [] }, { request_id: undefined }
  ];
  for (const args of invalid) { const { send, calls } = setup(); await errorCode(send(args), 'INVALID_ARGUMENT'); assert.equal(calls.length, 0); }
  const { send } = setup();
  assert.equal((await send({ body: '界'.repeat(666) })).status, 'accepted');
  const { module } = setup();
  await errorCode(module.callTool('bark_send', []), 'INVALID_ARGUMENT');
  await errorCode(module.callTool('bark_status', { extra: true }), 'INVALID_ARGUMENT');
  await errorCode(module.callTool('bark_send', Object.defineProperty({ request_id: 'id', body: 'safe' }, 'body', { get() { throw new Error('must not execute'); } })), 'INVALID_ARGUMENT');
});

test('own device credential is never accepted as content', async () => {
  const { send, calls } = setup();
  await errorCode(send({ body: `Do not leak ${DEVICE}` }), 'SECRET_IN_CONTENT');
  await errorCode(send({ request_id: DEVICE }), 'SECRET_IN_CONTENT');
  assert.equal(calls.length, 0);
});

test('HTTP(S) links require exact configured origins; never fetch the link', async () => {
  const env = { ...ENV, BARK_ALLOWED_URL_ORIGINS: JSON.stringify(['https://example.com', 'http://example.net']) };
  for (const url of ['https://example.com/item?tab=1', 'http://example.net/item']) {
    const { send, calls } = setup({ env });
    assert.equal((await send({ url })).status, 'accepted');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], BARK_ENDPOINT);
  }
  for (const url of ['javascript:alert(1)', 'shortcuts://run-shortcut?name=x', 'file:///tmp/a', 'https://other.example/x', 'https://example.com.evil.test/x', 'https://user:password@example.com/x', 'https://example.com:444/x', 'https://example.com\\@evil.test/x', 'https://example.com/%0Ainject', 'https://api.day.app/key/body', '//example.com/x']) {
    const { send, calls } = setup({ env });
    await errorCode(send({ url }), 'URL_NOT_ALLOWED');
    assert.equal(calls.length, 0);
  }
  await errorCode(setup().send({ url: 'https://example.com/x' }), 'URL_NOT_ALLOWED');
});

test('malformed secret/configuration fails closed without an upstream request', async () => {
  for (const env of [{ ...ENV, BARK_DEVICE_KEY: 'https://api.day.app/example' }, { ...ENV, BARK_DEVICE_KEY: ['array'] }, { ...ENV, BARK_ALLOWED_URL_ORIGINS: '*' }, { ...ENV, BARK_ALLOWED_URL_ORIGINS: '["https://example.com/path"]' }, { ...ENV, BARK_ALLOWED_URL_ORIGINS: '["https://api.day.app"]' }]) {
    const { send, calls } = setup({ env });
    await errorCode(send(), 'INVALID_CONFIGURATION');
    assert.equal(calls.length, 0);
  }
});

test('same ID/content replays safely; different content with same ID conflicts', async () => {
  const { send, calls } = setup();
  assert.equal((await send()).status, 'accepted');
  const replay = await send();
  assert.equal(replay.status, 'accepted');
  assert.equal(replay.duplicate_suppressed, true);
  await errorCode(send({ body: 'different' }), 'REQUEST_ID_CONFLICT');
  assert.equal(calls.length, 1);
});

test('concurrent duplicate is suppressed while first send is in flight', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { send } = setup({ fetcher: async () => { calls++; await held; return ok(); } });
  const first = send();
  while (calls === 0) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await send();
  assert.equal(second.code, 'REQUEST_IN_PROGRESS_OR_UNKNOWN');
  assert.equal(second.duplicate_suppressed, true);
  release();
  assert.equal((await first).status, 'accepted');
  assert.equal(calls, 1);
});

test('missing or failed reservation guard fails closed', async () => {
  for (const guard of [undefined, {}, { reserve: async () => { throw new Error(DEVICE); }, complete() {} }, { reserve: async () => ({ kind: 'invalid' }), complete() {} }]) {
    const { send, calls } = setup({ guard });
    await errorCode(send(), 'GUARD_UNAVAILABLE');
    assert.equal(calls.length, 0);
  }
});

test('failed outcome recording never retries an already attempted send', async () => {
  const guard = { reserve: async () => ({ kind: 'reserved' }), complete: async () => { throw new Error(DEVICE); } };
  const { send, calls } = setup({ guard });
  const result = await send();
  assert.equal(result.status, 'accepted');
  assert.equal(result.dedupe_record, 'unconfirmed');
  assert.equal(result.automatic_retry, false);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes(DEVICE), false);
});

test('timeout remains unknown, aborts transport, suppresses repeat and never retries', async () => {
  let calls = 0, signal;
  const { send } = setup({ timeoutMs: 15, fetcher: async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); } });
  const result = await send();
  assert.equal(result.code, 'PUSH_TIMEOUT_UNKNOWN');
  assert.equal(result.accepted, null);
  assert.equal(signal.aborted, true);
  assert.equal((await send()).duplicate_suppressed, true);
  assert.equal(calls, 1);
});

test('timeouts cover slow response bodies, not just response headers', async () => {
  const { send } = setup({ timeoutMs: 15, fetcher: async () => new Response(new ReadableStream({ start() {} })) });
  assert.equal((await send()).code, 'PUSH_TIMEOUT_UNKNOWN');
});

test('upstream errors and echoed secrets are sanitized, without retries', async () => {
  const scenarios = [
    [async () => { throw new Error(`https://api.day.app/${DEVICE}?private=secret`); }, 'unknown'],
    [async () => new Response(DEVICE, { status: 500 }), 'unknown'],
    [async () => new Response(DEVICE, { status: 400 }), 'rejected'],
    [async () => new Response(DEVICE, { status: 429 }), 'rejected'],
    [async () => new Response(DEVICE, { status: 302, headers: { Location: `https://evil.test/${DEVICE}` } }), 'unknown'],
    [async () => new Response(DEVICE, { status: 200 }), 'unknown'],
    [async () => new Response(JSON.stringify({ code: 500, message: DEVICE })), 'unknown'],
    [async () => new Response(JSON.stringify({ code: '200', message: DEVICE })), 'unknown'],
    [async () => new Response(JSON.stringify({ code: 200, message: DEVICE })), 'accepted']
  ];
  for (const [fetcher, status] of scenarios) {
    let calls = 0;
    const { send } = setup({ fetcher: (...args) => { calls++; return fetcher(...args); } });
    const result = await send();
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result).includes(DEVICE), false);
    assert.equal((await send()).duplicate_suppressed, true);
    assert.equal(calls, 1);
  }
});

test('oversized, infinite, empty and invalid UTF-8 responses remain unknown', async () => {
  for (const fetcher of [
    async () => new Response('x'.repeat(4097)),
    async () => new Response('{}', { headers: { 'Content-Length': '99999' } }),
    async () => new Response(new Uint8Array([0xff])),
    async () => new Response(null),
    async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4096)); } }))
  ]) assert.equal((await setup({ fetcher }).send()).status, 'unknown');
});

test('safe errors contain only fixed code and message', () => {
  assert.deepEqual(Object.keys(safeBarkError(new Error(DEVICE))), ['code', 'message']);
  assert.equal(safeBarkError({ code: 'FORBIDDEN', message: DEVICE }).code, 'INTERNAL_ERROR');
  const error = new BarkError('FORBIDDEN');
  error.message = DEVICE;
  assert.equal(JSON.stringify(safeBarkError(error)).includes(DEVICE), false);
});

test('custom guard replay is canonicalized; no stored secret/message or retry policy escapes', async () => {
  const cases = [
    { status: 'accepted', ok: true, accepted: true, secret: DEVICE, message: DEVICE, automatic_retry: true },
    { status: 'rejected', ok: false, accepted: false, code: DEVICE, message: DEVICE },
    { status: 'unknown', ok: false, accepted: null, code: DEVICE, message: DEVICE },
    { status: 'invented', secret: DEVICE }, null, [DEVICE],
    Object.defineProperty({}, 'status', { get() { throw new Error(DEVICE); } })
  ];
  for (const result of cases) {
    const guard = { reserve: async () => ({ kind: 'replay', result }), complete() {} };
    const { send, calls } = setup({ guard });
    const replay = await send();
    assert.equal(JSON.stringify(replay).includes(DEVICE), false);
    assert.equal(replay.automatic_retry, false);
    assert.equal(replay.duplicate_suppressed, true);
    assert.equal(calls.length, 0);
  }
});

test('non-enumerable/accessor input properties are rejected before execution', async () => {
  let invoked = false;
  const { module, calls } = setup();
  const args = Object.defineProperty({ request_id: 'hidden' }, 'body', { get() { invoked = true; return 'hidden'; } });
  await errorCode(module.callTool('bark_send', args), 'INVALID_ARGUMENT');
  await errorCode(module.callTool('bark_send', Object.defineProperty({ request_id: 'hidden' }, 'body', { value: 'hidden' })), 'INVALID_ARGUMENT');
  assert.equal(invoked, false);
  assert.equal(calls.length, 0);
});

test('a buggy completion adapter cannot mutate the returned result', async () => {
  for (const shouldThrow of [false, true]) {
    const guard = {
      reserve: async () => ({ kind: 'reserved' }),
      complete: async ({ result }) => { result.secret = DEVICE; result.message = DEVICE; result.automatic_retry = true; if (shouldThrow) throw new Error(DEVICE); }
    };
    const { send } = setup({ guard });
    const result = await send();
    assert.equal(JSON.stringify(result).includes(DEVICE), false);
    assert.equal(result.automatic_retry, false);
    assert.equal(result.status, 'accepted');
  }
});

test('every supported redirect status stops after one POST without following or exposing Location', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const { send } = setup({ fetcher: async (url, init) => {
      calls++;
      assert.equal(url, BARK_ENDPOINT);
      assert.equal(init.redirect, 'manual');
      return new Response(DEVICE, { status, headers: { Location: `https://untrusted.example/${DEVICE}` } });
    } });
    const result = await send();
    assert.equal(result.status, 'unknown');
    assert.equal(result.automatic_retry, false);
    assert.equal(JSON.stringify(result).includes(DEVICE), false);
    assert.equal(JSON.stringify(result).includes('untrusted.example'), false);
    assert.equal((await send()).duplicate_suppressed, true);
    assert.equal(calls, 1);
  }
});
