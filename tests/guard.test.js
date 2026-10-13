import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGuard } from '../src/memory-guard.js';

function reservation(id, scope = 'owner-hash') { return { scope, requestId: String(id), fingerprint: 'content-hash' }; }
test('five attempts per rolling minute and thirty per rolling hour', async () => {
  let now = 0;
  const guard = createMemoryGuard({ now: () => now });
  for (let minute = 0; minute < 6; minute++) {
    now = minute * 60000;
    for (let index = 0; index < 5; index++) assert.equal((await guard.reserve(reservation(minute * 5 + index))).kind, 'reserved');
    assert.equal((await guard.reserve(reservation('limited-' + minute))).kind, 'limited');
  }
  now = 360000;
  assert.equal((await guard.reserve(reservation('hour-limited'))).kind, 'limited');
  now = 3600000;
  assert.equal((await guard.reserve(reservation('new-hour'))).kind, 'reserved');
});

test('owner scopes are separate and completed results replay unchanged', async () => {
  const guard = createMemoryGuard({ now: () => 1 });
  const first = reservation('same-id', 'owner-one');
  assert.equal((await guard.reserve(first)).kind, 'reserved');
  assert.equal((await guard.reserve(reservation('same-id', 'owner-two'))).kind, 'reserved');
  const result = { status: 'unknown' };
  await guard.complete({ ...first, result });
  result.status = 'tampered';
  const replay = await guard.reserve(first);
  assert.equal(replay.result.status, 'unknown');
  replay.result.status = 'also-tampered';
  assert.equal((await guard.reserve(first)).result.status, 'unknown');
});

test('retains pending and terminal IDs at least 24h; no eviction when full', async () => {
  let now = 0;
  const guard = createMemoryGuard({ now: () => now, maxRecords: 30 });
  for (let index = 0; index < 30; index++) assert.equal((await guard.reserve(reservation(index, 'scope-' + index))).kind, 'reserved');
  now = 86399999;
  assert.equal((await guard.reserve(reservation('overflow'))).kind, 'unavailable');
  assert.equal((await guard.reserve(reservation(0, 'scope-0'))).kind, 'pending');
  now = 86400000;
  assert.equal((await guard.reserve(reservation('after-retention'))).kind, 'reserved');
});

test('clock rollback never releases rate limit or shortens retention', async () => {
  let now = 100000;
  const guard = createMemoryGuard({ now: () => now });
  for (let index = 0; index < 5; index++) await guard.reserve(reservation(index));
  now = 0;
  assert.equal((await guard.reserve(reservation('blocked'))).kind, 'limited');
});

test('invalid bounds cannot silently disable the limit', () => {
  for (const settings of [{ perMinute: 0 }, { perMinute: 6 }, { perHour: 31 }, { retentionMs: 100 }, { maxRecords: 1 }, { now: null }]) assert.throws(() => createMemoryGuard(settings), TypeError);
});
