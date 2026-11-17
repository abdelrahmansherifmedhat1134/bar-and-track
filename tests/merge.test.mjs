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
  const m = mergeStates({ profile: { updatedAt: 1 }, records: { x: { id: 'x', deleted: true, updatedAt: 9 } } }, { profile: { updatedAt: 1 }, records: { x: { id: 'x', updatedAt: 3 } } });
  assert.equal(m.records.x.deleted, true); assert.equal(m.localChanged, false); assert.equal(m.remoteChanged, true);
});
test('identical states report no changes', () => {
  const s = { profile: { updatedAt: 4 }, records: { x: { id: 'x', updatedAt: 2 } } };
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
