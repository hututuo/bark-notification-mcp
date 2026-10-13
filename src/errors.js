const DETAILS = Object.freeze({
  UNAUTHENTICATED: [401, 'A verified authenticated owner is required.'],
  FORBIDDEN: [403, 'This notification connection is restricted to its configured owner.'],
  OWNER_NOT_CONFIGURED: [503, 'The notification owner has not been securely bound.'],
  BARK_DISABLED: [503, 'Bark is disabled. Configure it securely before requesting a test.'],
  INVALID_CONFIGURATION: [503, 'The server-side Bark configuration is invalid. Check it privately.'],
  INVALID_ARGUMENT: [400, 'The notification arguments are invalid or exceed the documented limits.'],
  URL_NOT_ALLOWED: [400, 'Use a credential-free HTTP(S) link on a server-approved origin.'],
  SECRET_IN_CONTENT: [400, 'Notification content must not contain the configured device credential.'],
  UNKNOWN_TOOL: [400, 'Unknown Bark tool.'],
  GUARD_UNAVAILABLE: [503, 'The notification rate and duplicate guard is unavailable. Nothing was sent.'],
  REQUEST_ID_CONFLICT: [409, 'This request_id was already used for different content. Nothing was sent.'],
  RATE_LIMITED: [429, 'The local notification rate limit was reached. Nothing was sent.'],
  INTERNAL_ERROR: [500, 'The notification request could not be processed safely.']
});

export class BarkError extends Error {
  constructor(code) {
    const known = Object.hasOwn(DETAILS, code) ? code : 'INTERNAL_ERROR';
    super(DETAILS[known][1]);
    this.name = 'BarkError';
    this.code = known;
    this.status = DETAILS[known][0];
  }
}

export function fail(code) { throw new BarkError(code); }

// Rebuild from a fixed catalog; never copy upstream messages, stack, cause or URL.
export function safeBarkError(error) {
  const value = new BarkError(error instanceof BarkError ? error.code : 'INTERNAL_ERROR');
  return { code: value.code, message: value.message };
}
