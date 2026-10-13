import { BARK_TOOLS, createBarkModule, createMemoryGuard } from '../src/index.js';

/**
 * Call once inside your existing createWorker(), alongside calendar dispatch.
 * Keep your original MCP transport, Sites owner identity, CalDAV configuration,
 * tools, error handling and routes. This only adds notification dispatch.
 */
export function composeBark({ existingTools, existingCallTool, authenticatedUser, fetcher, guard = createMemoryGuard() }) {
  if (!Array.isArray(existingTools) || typeof existingCallTool !== 'function' || typeof authenticatedUser !== 'function') throw new TypeError('Existing authenticated dispatcher required.');
  const names = new Set(BARK_TOOLS.map(tool => tool.name));
  if (existingTools.some(tool => names.has(tool.name))) throw new TypeError('Bark tool name collision.');
  return {
    tools: [...existingTools, ...BARK_TOOLS],
    async callTool(name, args, env, request) {
      // Preserve the host's existing authentication for ALL tools.
      await authenticatedUser(request, env, true);
      if (!names.has(name)) return existingCallTool(name, args, env, fetcher);
      const bark = createBarkModule({ env, guard, fetcher, resolveSubject: context => authenticatedUser(context, env, true) });
      return bark.callTool(name, args, request);
    }
  };
}
