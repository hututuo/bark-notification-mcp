import { BarkError, fail, safeBarkError } from './errors.js';
import { LIMITS, objectWithKeys, requestId, readConfiguration, validateNotification, digest } from './validation.js';
import { sendOnce, unknownResult, canonicalStoredResult } from './transport.js';

export { BarkError, safeBarkError, LIMITS };
export { createMemoryGuard } from './memory-guard.js';
export { BARK_ENDPOINT } from './transport.js';

const idProperty = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$', description: 'Stable ID for this one intended notification. Reuse it if the tool call is repeated; never silently generate a new ID after an unknown result.' };
function tool(name, description, properties, required, readOnly) {
  return { name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: readOnly, openWorldHint: !readOnly } };
}
function freeze(value) { for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return Object.freeze(value); }
export const BARK_TOOLS = freeze([
  tool('bark_status', 'Read the owner-bound Bark configuration state without exposing credentials or sending anything.', {}, [], true),
  tool('bark_send', 'Send one explicitly authorized, low-sensitivity notification to the configured owner. Content goes through Bark and Apple APNs and may appear on the lock screen. This is not a Clock alarm or a guaranteed-delivery channel. No automatic retry after an unknown result.', {
    request_id: idProperty,
    body: { type: 'string', minLength: 1, maxLength: LIMITS.body, description: 'Notification body; also bounded to 2000 UTF-8 bytes.' },
    title: { type: 'string', minLength: 1, maxLength: LIMITS.title },
    group: { type: 'string', minLength: 1, maxLength: LIMITS.group },
    url: { type: 'string', minLength: 1, maxLength: LIMITS.url, description: 'Optional credential-free HTTP(S) link on a server-configured exact origin. Links are disabled by default.' }
  }, ['request_id', 'body'], false),
  tool('bark_test', 'After secure setup and explicit user authorization, send one fixed low-sensitivity test notification. Do not call merely because configuration became available. User must verify receipt on the phone.', { request_id: idProperty }, ['request_id'], false)
]);

const TEST_CONTENT = Object.freeze({ title: 'Bark connection test', body: 'This is a test notification from your private assistant connection.', group: 'connection-test' });

/**
 * resolveSubject must verify an authenticated transport identity independently
 * of tool arguments. A bare untrusted user-ID HTTP header is NOT authentication.
 * guard is required for sending; create it once per instance, not per request.
 */
export function createBarkModule({ env = {}, resolveSubject, guard, fetcher, timeoutMs = 8000 } = {}) {
  if (typeof resolveSubject !== 'function') throw new TypeError('A trusted identity resolver is required.');
  if (fetcher !== undefined && typeof fetcher !== 'function') throw new TypeError('Invalid transport.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) throw new TypeError('Invalid timeout.');
  async function owner(context) {
    if (typeof env.OWNER_USER_ID !== 'string' || !env.OWNER_USER_ID || env.OWNER_USER_ID.length > 512 || /[\r\n]/.test(env.OWNER_USER_ID)) fail('OWNER_NOT_CONFIGURED');
    let subject;
    try { subject = await resolveSubject(context); } catch { fail('UNAUTHENTICATED'); }
    if (typeof subject !== 'string' || !subject || subject.length > 512 || /[\r\n]/.test(subject)) fail('UNAUTHENTICATED');
    if (subject !== env.OWNER_USER_ID) fail('FORBIDDEN');
    return subject;
  }
  return Object.freeze({
    tools: BARK_TOOLS,
    async callTool(name, args = {}, context) {
      const subject = await owner(context);
      if (!BARK_TOOLS.some(spec => spec.name === name)) fail('UNKNOWN_TOOL');
      const config = readConfiguration(env);
      if (name === 'bark_status') {
        objectWithKeys(args, []);
        return { enabled: config.enabled, configured: config.enabled, owner_bound: true, guard_configured: Boolean(guard && typeof guard.reserve === 'function' && typeof guard.complete === 'function'), guard_durability: guard?.durability === 'durable' ? 'durable' : guard?.durability === 'process-memory' ? 'process-memory' : 'unspecified', links_enabled: config.origins.length > 0, live_delivery_verified: false };
      }
      if (!config.enabled) fail('BARK_DISABLED');
      if (!guard || typeof guard.reserve !== 'function' || typeof guard.complete !== 'function') fail('GUARD_UNAVAILABLE');
      let content;
      if (name === 'bark_test') {
        objectWithKeys(args, ['request_id']);
        requestId(args.request_id);
        content = validateNotification({ request_id: args.request_id, ...TEST_CONTENT }, config);
      } else content = validateNotification(args, config);
      const reservation = { scope: await digest(subject), requestId: args.request_id, fingerprint: await digest(JSON.stringify({ name, content })) };
      let decision;
      try { decision = await guard.reserve(reservation); } catch { fail('GUARD_UNAVAILABLE'); }
      if (!decision || typeof decision.kind !== 'string') fail('GUARD_UNAVAILABLE');
      if (decision.kind === 'conflict') fail('REQUEST_ID_CONFLICT');
      if (decision.kind === 'limited') fail('RATE_LIMITED');
      if (decision.kind === 'pending') return { ...unknownResult('REQUEST_IN_PROGRESS_OR_UNKNOWN'), duplicate_suppressed: true };
      if (decision.kind === 'replay') return { ...canonicalStoredResult(decision.result), duplicate_suppressed: true };
      if (decision.kind !== 'reserved') fail('GUARD_UNAVAILABLE');
      const result = await sendOnce(config, content, { fetcher, timeoutMs });
      try { await guard.complete({ ...reservation, result: structuredClone(result) }); }
      catch { return { ...result, dedupe_record: 'unconfirmed', automatic_retry: false, message: 'A send was attempted, but recording its outcome failed. Do not resend automatically; check the phone.' }; }
      return result;
    }
  });
}
