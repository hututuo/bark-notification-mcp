// This guard is atomic only within this JavaScript instance. It is NOT a
// distributed lock or persistent idempotency guarantee. Supply a durable guard
// for a scaled/restarting service; see docs/GUARD_CONTRACT.md.
export function createMemoryGuard({ now = () => Date.now(), perMinute = 5, perHour = 30, retentionMs = 86400000, maxRecords = 4096 } = {}) {
  if (typeof now !== 'function' || !Number.isInteger(perMinute) || perMinute < 1 || perMinute > 5 || !Number.isInteger(perHour) || perHour < perMinute || perHour > 30 || !Number.isInteger(retentionMs) || retentionMs < 86400000 || retentionMs > 604800000 || !Number.isInteger(maxRecords) || maxRecords < 30 || maxRecords > 100000) throw new TypeError('Invalid guard settings.');
  const records = new Map();
  let highWaterTime = 0;
  function time() {
    const value = now();
    if (!Number.isFinite(value) || value < 0) throw new Error('Clock unavailable.');
    highWaterTime = Math.max(highWaterTime, value);
    return highWaterTime;
  }
  return Object.freeze({
    durability: 'process-memory',
    async reserve({ scope, requestId, fingerprint }) {
      const timestamp = time();
      for (const [key, record] of records) if (timestamp - record.at >= retentionMs) records.delete(key);
      const key = JSON.stringify([scope, requestId]);
      const previous = records.get(key);
      if (previous) return previous.fingerprint !== fingerprint ? { kind: 'conflict' } : previous.result ? { kind: 'replay', result: structuredClone(previous.result) } : { kind: 'pending' };
      if (records.size >= maxRecords) return { kind: 'unavailable' }; // Never evict live dedupe records.
      let minute = 0, hour = 0;
      for (const record of records.values()) if (record.scope === scope) {
        if (timestamp - record.at < 60000) minute++;
        if (timestamp - record.at < 3600000) hour++;
      }
      if (minute >= perMinute || hour >= perHour) return { kind: 'limited' };
      records.set(key, { scope, fingerprint, at: timestamp, result: null });
      return { kind: 'reserved' };
    },
    async complete({ scope, requestId, fingerprint, result }) {
      const record = records.get(JSON.stringify([scope, requestId]));
      if (!record || record.fingerprint !== fingerprint) throw new Error('Reservation missing.');
      if (!record.result) record.result = structuredClone(result);
    }
  });
}
