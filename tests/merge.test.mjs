import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, pruneTombstones } from '../js/merge.js';

test('newer record wins on each side', () => {
  const L = { profile: { a: 1, updatedAt: 5 }, records: { x: { id: 'x', v: 'L', updatedAt: 10 }, y: { id: 'y', v: 'L', updatedAt: 1 } } };
  const R = { profile: { a: 2, updatedAt: 3 }, records: { x: { id: 'x', v: 'R', updatedAt: 5 }, y: { id: 'y', v: 'R', updatedAt: 9 }, z: { id: 'z', updatedAt: 2 } } };
  const m = mergeStates(L, R);
  assert.equal(m.records.x.v, 'L'); assert.equal(m.records.y.v, 'R'); assert.ok(m.records.z);
  assert.equal(m.profile.a, 1); assert.ok(m.localChanged); assert.ok(m.remoteChanged);
});
test('tombstone beats older copy', () => {
  const m = mergeStates({ profile: { updatedAt: 1, _ts: {} }, records: { x: { id: 'x', deleted: true, updatedAt: 9 } } }, { profile: { updatedAt: 1, _ts: {} }, records: { x: { id: 'x', updatedAt: 3 } } });
  assert.equal(m.records.x.deleted, true); assert.equal(m.localChanged, false); assert.equal(m.remoteChanged, true);
});
test('identical states report no changes (legacy profiles migrate once)', () => {
  const legacy = mergeStates({ profile: { updatedAt: 4 }, records: {} }, { profile: { updatedAt: 4 }, records: {} });
  const settled = mergeStates({ profile: legacy.profile, records: {} }, { profile: JSON.parse(JSON.stringify(legacy.profile)), records: {} });
  assert.equal(settled.localChanged, false); assert.equal(settled.remoteChanged, false);
  const s = { profile: { updatedAt: 4, _ts: {} }, records: { x: { id: 'x', updatedAt: 2 } } };
  const m = mergeStates(s, JSON.parse(JSON.stringify(s)));
  assert.equal(m.localChanged, false); assert.equal(m.remoteChanged, false);
});
test('missing remote uploads local', () => {
  const m = mergeStates({ profile: { updatedAt: 1 }, records: {} }, null);
  assert.equal(m.remoteChanged, true);
});
test('old tombstones are pruned', () => {
  const now = 1000 * 864e5;
  const r = pruneTombstones({ a: { deleted: true, updatedAt: 0 }, b: { deleted: true, updatedAt: now - 10 }, c: { updatedAt: 0 } }, now);
  assert.deepEqual(Object.keys(r).sort(), ['b', 'c']);
});

import { mergeProfiles } from '../js/merge.js';
import { defaultProfile } from '../js/program.js';

test('regression: a fresh device default profile never wipes real settings', () => {
  // Phone: did the test day on Nov 18 (old profile format, no per-field times).
  const phone = { ...defaultProfile(), _ts: undefined, programStart: '2026-11-18', updatedAt: 1000 };
  delete phone._ts;
  // Laptop: opened the app later, never changed anything, but its profile was stamped later.
  const laptop = { ...defaultProfile(), updatedAt: 2000 }; delete laptop._ts;
  const m1 = mergeProfiles(laptop, phone);
  assert.equal(m1.profile.programStart, '2026-11-18'); assert.ok(m1.toLocal);
  const m2 = mergeProfiles(phone, laptop);
  assert.equal(m2.profile.programStart, '2026-11-18');
});
test('per-field merge keeps edits made on different devices', () => {
  const base = defaultProfile();
  const a = { ...base, age: 22, _ts: { age: 50 }, updatedAt: 50 };
  const b = { ...base, restMain: 180, _ts: { restMain: 60 }, updatedAt: 60 };
  const m = mergeProfiles(a, b);
  assert.equal(m.profile.age, 22); assert.equal(m.profile.restMain, 180);
  assert.ok(m.toLocal && m.toRemote);
  const again = mergeProfiles(m.profile, JSON.parse(JSON.stringify(m.profile)));
  assert.equal(again.toLocal, false); assert.equal(again.toRemote, false);
});
test('deliberate later change wins over an older one', () => {
  const a = { ...defaultProfile(), programStart: '2026-11-18', _ts: { programStart: 10 }, updatedAt: 10 };
  const b = { ...defaultProfile(), programStart: null, restartedAt: '2027-01-01', _ts: { programStart: 20, restartedAt: 20 }, updatedAt: 20 };
  const m = mergeProfiles(a, b);
  assert.equal(m.profile.programStart, null); assert.equal(m.profile.restartedAt, '2027-01-01');
});
test('ties break the same way on both devices', () => {
  const a = { ...defaultProfile(), age: 21, _ts: { age: 5 }, updatedAt: 5 };
  const b = { ...defaultProfile(), age: 23, _ts: { age: 5 }, updatedAt: 5 };
  assert.equal(mergeProfiles(a, b).profile.age, mergeProfiles(b, a).profile.age);
});
