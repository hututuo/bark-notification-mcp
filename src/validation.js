import { fail } from './errors.js';

const encoder = new TextEncoder();
export const LIMITS = Object.freeze({ title: 80, body: 1000, group: 32, url: 512, bodyBytes: 2000, contentBytes: 2600, responseBytes: 4096, requestId: 64 });
export const utf8Bytes = value => encoder.encode(value).byteLength;
const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export function objectWithKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_ARGUMENT');
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key))) fail('INVALID_ARGUMENT');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_ARGUMENT');
  }
}

export function requestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) fail('INVALID_ARGUMENT');
  return value;
}

function text(value, maximum, multiline = false) {
  if (typeof value !== 'string' || value.length > maximum * 2 || [...value].length > maximum || !value.trim() || control.test(value) || (!multiline && /[\r\n\t]/.test(value))) fail('INVALID_ARGUMENT');
  return value;
}

export function readConfiguration(env) {
  if (!env || typeof env !== 'object') fail('INVALID_CONFIGURATION');
  const key = env.BARK_DEVICE_KEY;
  const enabled = env.BARK_ENABLED === 'true';
  if (!enabled || key === undefined || key === null || key === '') return { enabled: false, origins: [] };
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(key)) fail('INVALID_CONFIGURATION');
  let origins = [];
  if (env.BARK_ALLOWED_URL_ORIGINS !== undefined && env.BARK_ALLOWED_URL_ORIGINS !== '') {
    if (typeof env.BARK_ALLOWED_URL_ORIGINS !== 'string' || env.BARK_ALLOWED_URL_ORIGINS.length > 8192) fail('INVALID_CONFIGURATION');
    try { origins = JSON.parse(env.BARK_ALLOWED_URL_ORIGINS); } catch { fail('INVALID_CONFIGURATION'); }
    if (!Array.isArray(origins) || origins.length > 20) fail('INVALID_CONFIGURATION');
    for (const origin of origins) {
      let parsed;
      try { parsed = new URL(origin); } catch { fail('INVALID_CONFIGURATION'); }
      if (typeof origin !== 'string' || !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password || parsed.hostname === 'api.day.app') fail('INVALID_CONFIGURATION');
    }
  }
  return { enabled: true, key, origins };
}

export function validateNotification(args, config) {
  objectWithKeys(args, ['request_id', 'title', 'body', 'group', 'url']);
  requestId(args.request_id);
  const result = { body: text(args.body, LIMITS.body, true) };
  if (utf8Bytes(result.body) > LIMITS.bodyBytes) fail('INVALID_ARGUMENT');
  for (const field of ['title', 'group']) if (Object.hasOwn(args, field)) result[field] = text(args[field], LIMITS[field]);
  if (Object.hasOwn(args, 'url')) {
    const link = text(args.url, LIMITS.url);
    if (utf8Bytes(link) > LIMITS.url || /[\s\\]/u.test(link) || /%0[ad]/i.test(link)) fail('URL_NOT_ALLOWED');
    let parsed;
    try { parsed = new URL(link); } catch { fail('URL_NOT_ALLOWED'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !config.origins.includes(parsed.origin) || parsed.hostname === 'api.day.app') fail('URL_NOT_ALLOWED');
    result.url = parsed.href;
  }
  const serialized = JSON.stringify(result);
  if (utf8Bytes(serialized) > LIMITS.contentBytes) fail('INVALID_ARGUMENT');
  if (config.key && (serialized.includes(config.key) || args.request_id.includes(config.key))) fail('SECRET_IN_CONTENT');
  return result;
}

export async function digest(value) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
