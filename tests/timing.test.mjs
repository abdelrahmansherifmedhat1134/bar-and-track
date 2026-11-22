import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, defaultProfile } from '../js/program.js';
import { buildCSV, timeOfDay } from '../js/export.js';

const mk = (id, day, h, fasted, reps) => ({ id, type: 'session', kind: 'str', tpl: 'A', title: 'Upper 1', date: new Date(2026, 10, day, h, 5).toISOString(), dur: 3300, mode: 'live', fasted,
  ready: { sleep: 4, energy: 4, sore: 2, stress: 2, score: 4 }, updatedAt: 1, items: [{ x: 'pullup', sec: 'main', plan: { targets: [8, 8], load: 0 }, sets: reps.map((r) => ({ r, kg: 0 })) }] });
const model = (recs) => createModel({ profile: { ...defaultProfile(), programStart: '2026-11-01' }, records: Object.fromEntries(recs.map((r) => [r.id, r])) }, new Date(2026, 10, 22).getTime());

test('time-of-day buckets', () => {
  assert.equal(timeOfDay(new Date(2026, 0, 1, 5)), 'early');
  assert.equal(timeOfDay(new Date(2026, 0, 1, 12)), 'day');
  assert.equal(timeOfDay(new Date(2026, 0, 1, 19)), 'evening');
});

test('CSV carries start time, duration, fasting and readiness on every row', () => {
  const rows = buildCSV(model([mk('a', 10, 19, true, [8, 6])])).split('\r\n').map((r) => r.split(','));
  const h = rows[0];
  for (const c of ['start_time', 'duration_min', 'time_of_day', 'fasted', 'sleep', 'stress']) assert.ok(h.includes(c), c);
  for (const r of rows.slice(1)) { assert.equal(r.length, h.length); assert.equal(r[h.indexOf('start_time')], '19:05'); assert.equal(r[h.indexOf('fasted')], 'yes'); assert.equal(r[h.indexOf('duration_min')], '55'); }
});

test('training-time analysis compares groups by share of planned reps', () => {
  const M = model([mk('a', 10, 5, false, [6, 6]), mk('b', 11, 19, true, [8, 8])]);
  const g = Object.fromEntries(M.trainingTimes().groups);
  assert.equal(Math.round(g['Early (before 8:00)'].hit), 75);
  assert.equal(Math.round(g['Evening (after 16:00)'].hit), 100);
  assert.equal(g['Fasting days'].n, 1);
});

test('sessions default to the fasting days set in Plan', () => {
  const M = model([]);
  assert.deepEqual(defaultProfile().fastDays, [6, 1, 4]);
  assert.equal(M.isFastDay(new Date(2026, 10, 21)), true); // Saturday
  assert.equal(M.isFastDay(new Date(2026, 10, 20)), false); // Friday
});
