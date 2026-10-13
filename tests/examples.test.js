import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpWorker } from '../examples/standalone-mcp-worker.js';
import { composeBark } from '../examples/compose-existing-mcp.js';

const env = { OWNER_USER_ID: 'fixture-owner', BARK_DEVICE_KEY: 'synthetic_bark_fixture_not_a_device', BARK_ENABLED: 'true' };
const message = (method, params) => new Request('https://private.example/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });

test('standalone transport requires trusted owner; initialize/list never push', async () => {
  let calls = 0;
  const worker = createMcpWorker({ resolveSubject: () => env.OWNER_USER_ID, fetcher: async () => { calls++; return new Response('{"code":200}'); } });
  assert.equal((await (await worker.fetch(message('initialize'), env)).json()).result.serverInfo.name, 'owner-bound-bark-notifications');
  const list = await (await worker.fetch(message('tools/list'), env)).json();
  assert.equal(list.result.tools.length, 3);
  assert.equal(calls, 0);
  const tool = await (await worker.fetch(message('tools/call', { name: 'bark_test', arguments: { request_id: 'test-1' } }), env)).json();
  assert.equal(tool.result.structuredContent.status, 'accepted');
  assert.equal(calls, 1);
  assert.equal((await createMcpWorker({ resolveSubject: () => 'different' }).fetch(message('tools/list'), env)).status, 403);
  assert.throws(() => createMcpWorker(), /identity resolver/);
});

test('standalone transport handles unknown/invalid requests and sanitizes errors', async () => {
  const worker = createMcpWorker({ resolveSubject: () => env.OWNER_USER_ID });
  assert.equal((await worker.fetch(new Request('https://private.example/mcp'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://private.example/'), env)).status, 404);
  assert.equal((await (await worker.fetch(message('unknown'), env)).json()).error.code, -32601);
  assert.equal((await (await worker.fetch(message('tools/call', { name: 'bark_send', arguments: { body: 'no id' } }), env)).json()).result.isError, true);
  assert.equal((await worker.fetch(new Request('https://private.example/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), env)).status, 400);
});

test('composition retains calendar dispatch, auth, env and same guard across calls', async () => {
  const observed = [], authenticated = [], requests = [];
  const originalEnv = { ...env, CALDAV_USERNAME: 'fixture-account', CALDAV_PASSWORD: 'synthetic-calendar-fixture' };
  const fixtureRequest = { trustedFixture: true };
  const composed = composeBark({
    existingTools: [{ name: 'list_calendars' }],
    existingCallTool: async (...args) => { observed.push(args); return { calendars: [] }; },
    authenticatedUser: (...args) => { authenticated.push(args); if (args[0] !== fixtureRequest) throw new Error('Untrusted request.'); return env.OWNER_USER_ID; },
    fetcher: async (...args) => { requests.push(args); return new Response('{"code":200}'); }
  });
  assert.deepEqual(composed.tools.map(tool => tool.name), ['list_calendars', 'bark_status', 'bark_send', 'bark_test']);
  assert.deepEqual(await composed.callTool('list_calendars', {}, originalEnv, fixtureRequest), { calendars: [] });
  assert.equal(observed[0][2], originalEnv);
  const args = { request_id: 'once', body: 'Generic result ready' };
  await composed.callTool('bark_send', args, originalEnv, fixtureRequest);
  assert.equal((await composed.callTool('bark_send', args, originalEnv, fixtureRequest)).duplicate_suppressed, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][1].body.includes(originalEnv.CALDAV_PASSWORD), false);
  assert.ok(authenticated.every(call => call[2] === true));
  await assert.rejects(composed.callTool('bark_test', { request_id: 'bad' }, originalEnv, {}));
});

test('composition waits for asynchronous authentication before every dispatch', async () => {
  let dispatched = 0, pushed = 0;
  const composed = composeBark({
    existingTools: [{ name: 'list_calendars' }],
    existingCallTool: async () => { dispatched++; },
    authenticatedUser: async () => { await Promise.resolve(); throw new Error('Denied.'); },
    fetcher: async () => { pushed++; return new Response('{"code":200}'); }
  });
  await assert.rejects(composed.callTool('list_calendars', {}, env, {}), /Denied/);
  await assert.rejects(composed.callTool('bark_test', { request_id: 'denied' }, env, {}), /Denied/);
  assert.equal(dispatched, 0);
  assert.equal(pushed, 0);
});
