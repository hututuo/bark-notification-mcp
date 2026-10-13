import { createBarkModule, createMemoryGuard, safeBarkError, BarkError } from '../src/index.js';

// Transport scaffold, not an unauthenticated public server. The deployment must
// supply a REAL trusted identity resolver. Do not accept arbitrary client headers.
// For Sites, resolve only its authenticated dispatch header and disable bypass
// origins. See docs/DEPLOYMENT.md before using this example.
export function createMcpWorker({ resolveSubject, guard = createMemoryGuard(), fetcher } = {}) {
  if (typeof resolveSubject !== 'function') throw new TypeError('Supply a trusted identity resolver.');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  const rpc = (id, result) => json({ jsonrpc: '2.0', id, result });
  const error = (id, code, message, status = 200) => json({ jsonrpc: '2.0', id, error: { code, message } }, status);
  const protocols = ['2025-11-25', '2025-06-18'];
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      if (url.pathname !== '/mcp') return json({ error: 'Not found.' }, 404);
      if (request.method !== 'POST') return json({ error: 'Only POST is supported.' }, 405);
      if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Cross-origin browser requests are blocked.' }, 403);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return error(null, -32600, 'Use application/json.', 415);
      const protocol = request.headers.get('mcp-protocol-version');
      if (protocol && !protocols.includes(protocol)) return error(null, -32600, 'Unsupported protocol version.', 400);
      const module = createBarkModule({ env, resolveSubject: context => resolveSubject(context, env), guard, fetcher });
      // Authenticate before reading attacker-controlled request bodies.
      try { await module.callTool('bark_status', {}, request); }
      catch (failure) { return json({ error: safeBarkError(failure) }, failure instanceof BarkError ? failure.status : 500); }
      let message;
      try {
        if (!request.body) throw new Error('Missing body.');
        const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
        let bytes = 0, body = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 8192) throw new Error('Oversized body.');
            body += decoder.decode(value, { stream: true });
          }
          body += decoder.decode();
        } finally { reader.cancel().catch(() => {}); reader.releaseLock(); }
        message = JSON.parse(body);
      } catch { return error(null, -32700, 'Invalid or oversized JSON request.', 400); }
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(null, -32600, 'Invalid JSON-RPC request.', 400);
      if (!Object.hasOwn(message, 'id')) {
        if (message.method === 'notifications/initialized') return new Response(null, { status: 202, headers });
        return error(null, -32600, 'A request ID is required.', 400);
      }
      const { id, method } = message;
      if (!((typeof id === 'string' && id.length <= 128) || (typeof id === 'number' && Number.isFinite(id)))) return error(null, -32600, 'Invalid request ID.', 400);
      if (method === 'initialize') return rpc(id, { protocolVersion: protocols.includes(message.params?.protocolVersion) ? message.params.protocolVersion : protocols[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'owner-bound-bark-notifications', version: '0.1.1' }, instructions: 'Server-owned device key. Obtain user authorization for notification content. Never request or reveal credentials. Reuse each intended notification request_id and do not blindly retry unknown results.' });
      if (method === 'ping') return rpc(id, {});
      if (method === 'tools/list') return rpc(id, { tools: module.tools });
      if (method !== 'tools/call') return error(id, -32601, 'Method not found.');
      if (!message.params || typeof message.params.name !== 'string') return error(id, -32602, 'Tool name is required.');
      try {
        const result = await module.callTool(message.params.name, message.params.arguments ?? {}, request);
        return rpc(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: result.ok === false });
      } catch (failure) {
        const detail = safeBarkError(failure);
        return rpc(id, { content: [{ type: 'text', text: JSON.stringify(detail) }], structuredContent: { error: detail }, isError: true });
      }
    }
  };
}
