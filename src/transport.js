import { LIMITS } from './validation.js';

export const BARK_ENDPOINT = 'https://api.day.app/push';
const runtimeFetch = (input, init) => globalThis.fetch(input, init);
export const unknownResult = (code = 'PUSH_RESULT_UNKNOWN') => ({ ok: false, status: 'unknown', code, accepted: null, device_received: 'unverified', automatic_retry: false, message: 'Delivery outcome is unknown. Check the phone before deciding whether to send again; do not blindly retry.' });
const rejectedResult = code => ({ ok: false, status: 'rejected', code, accepted: false, device_received: 'unverified', automatic_retry: false, message: 'Bark did not accept the request. Check configuration privately before any new attempt.' });
const acceptedResult = () => ({ ok: true, status: 'accepted', accepted: true, device_received: 'unverified', automatic_retry: false, message: 'Bark accepted the notification request. Phone receipt and alert presentation are not verified.' });

// A storage adapter can be buggy, stale or corrupted. Reconstruct only our
// fixed result vocabulary; never forward arbitrary stored content/messages.
export function canonicalStoredResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || ![Object.prototype, null].includes(Object.getPrototypeOf(result))) return unknownResult();
  const field = key => Object.getOwnPropertyDescriptor(result, key)?.value;
  if (field('status') === 'accepted' && field('ok') === true && field('accepted') === true) return acceptedResult();
  if (field('status') === 'rejected' && field('ok') === false && field('accepted') === false) return rejectedResult(field('code') === 'BARK_RATE_LIMITED' ? 'BARK_RATE_LIMITED' : 'BARK_REJECTED');
  if (field('status') === 'unknown' && field('ok') === false && field('accepted') === null) return unknownResult(['PUSH_TIMEOUT_UNKNOWN', 'PUSH_RESPONSE_UNKNOWN', 'REQUEST_IN_PROGRESS_OR_UNKNOWN'].includes(field('code')) ? field('code') : 'PUSH_RESULT_UNKNOWN');
  return unknownResult();
}

async function responseJson(response) {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMITS.responseBytes)) throw new Error('Response bound.');
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Response unavailable.');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMITS.responseBytes) throw new Error('Response bound.');
      chunks.push(value);
    }
  } finally {
    // Do not await a cancellation hook owned by an untrusted/failed upstream.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { data.set(chunk, at); at += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}

export async function sendOnce(config, content, { fetcher = runtimeFetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  let timer;
  const expiry = new Promise(resolve => {
    timer = globalThis.setTimeout(() => { controller.abort(); resolve(unknownResult('PUSH_TIMEOUT_UNKNOWN')); }, timeoutMs);
  });
  const operation = (async () => {
    try {
      const response = await fetcher(BARK_ENDPOINT, {
        // Workers support follow/manual, not redirect:error. Manual preserves
        // the no-follow invariant; every 3xx is rejected as outcome-unknown below.
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({ ...content, device_key: config.key, level: 'active', isArchive: '0' })
      });
      if (response.status >= 400 && response.status < 500) {
        response.body?.cancel().catch(() => {});
        return rejectedResult(response.status === 429 ? 'BARK_RATE_LIMITED' : 'BARK_REJECTED');
      }
      if (response.status !== 200) { response.body?.cancel().catch(() => {}); return unknownResult(); }
      const data = await responseJson(response);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.code !== 200) return unknownResult('PUSH_RESPONSE_UNKNOWN');
      return acceptedResult();
    } catch { return unknownResult(controller.signal.aborted ? 'PUSH_TIMEOUT_UNKNOWN' : 'PUSH_RESULT_UNKNOWN'); }
  })();
  try { return await Promise.race([operation, expiry]); }
  finally { globalThis.clearTimeout(timer); controller.abort(); }
}
