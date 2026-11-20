import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, defaultProfile, rampUp } from '../js/program.js';
import { TPL, EX } from '../js/data.js';

const NOW = new Date(2026, 10, 17, 18, 0).getTime();
const state = (records = {}) => ({ profile: { ...defaultProfile(), programStart: '2026-11-01' }, records });

test('every template starts with the general warm-up', () => {
  for (const k of ['A', 'B', 'C', 'T']) assert.equal(TPL[k].prep[0][0], 'genwarm', k);
  const M = createModel(state(), NOW);
  const pl = M.planSession('A', M.ctxFor('A', { short: true }));
  assert.equal(pl.items[0].x, 'genwarm');
});

test('ramp-up sets: bodyweight half set, plus a lighter loaded set when belted', () => {
  assert.deepEqual(rampUp('pullup', { targets: [8], load: 0 }), [{ t: 4, l: 0 }]);
  assert.deepEqual(rampUp('pullup', { targets: [6], load: 10 }), [{ t: 5, l: 0 }, { t: 3, l: 5 }]);
  assert.deepEqual(rampUp('dip', { targets: [6], load: 2.5 }), [{ t: 5, l: 0 }]);
  assert.deepEqual(rampUp('ytw', { targets: [6], load: 0 }), []); // prep work gets none
});

test('warm-up sets stored apart never count as progress', () => {
  const rec = { id: 's1', type: 'session', kind: 'str', tpl: 'A', title: 'A', date: new Date(NOW - 86400e3).toISOString(), dur: 3600, mode: 'live', updatedAt: 1,
    items: [{ x: 'pullup', sec: 'main', sets: [{ r: 6, kg: 0 }, { r: 6, kg: 0 }], warm: [{ r: 20, kg: 30 }] }] };
  const M = createModel(state({ s1: rec }), NOW);
  const h = M.histOf('pullup')[0];
  assert.deepEqual(h.reps, [6, 6]); assert.equal(h.kg, 0);
});

test('guided test plan: warm-up, one all-out set per test, then the run', () => {
  const M = createModel(state(), NOW);
  const pl = M.planTest({ tpl: 'T', phase: M.phaseInfo() });
  const tests = pl.items.filter((i) => i.sec === 'test');
  assert.deepEqual(tests.map((i) => i.testKey), ['pull', 'dip', 'push', 'row']);
  assert.ok(tests.every((i) => i.sets === 1 && EX[i.x]));
  assert.equal(pl.items[0].x, 'genwarm');
  assert.equal(pl.run.alt, 'test');
});
