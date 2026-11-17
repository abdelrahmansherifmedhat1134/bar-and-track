import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, defaultProfile, readinessScore, readyZone, levelFromTest, runPhases, epley } from '../js/program.js';
import { RUN, TPL, EX } from '../js/data.js';
import { dayKey, addDays } from '../js/util.js';

const NOW = new Date(2026, 10, 17, 18, 0).getTime(); // Tue 17 Nov 2026
function mkState(extra = {}) {
  const profile = { ...defaultProfile(), ...extra.profile };
  const records = {};
  for (const r of extra.records || []) records[r.id] = { updatedAt: 1, ...r };
  return { profile, records };
}
let n = 0;
const sess = (daysAgo, fields) => ({ id: 's_' + (n++), type: 'session', kind: 'str', title: 't', date: addDays(NOW, -daysAgo).toISOString(), dur: 3600, mode: 'live', items: [], ...fields });
const testSess = (daysAgo, t) => sess(daysAgo, { kind: 'test', tpl: 'T', test: { ...t, date: dayKey(addDays(NOW, -daysAgo)) } });

test('phase: no program start means test week', () => {
  const M = createModel(mkState(), NOW);
  assert.equal(M.phaseInfo().key, 'test');
});

test('phase progression through re-entry, rebuild, build and deload', () => {
  const start = dayKey(addDays(NOW, -0));
  const M = createModel(mkState({ profile: { programStart: start } }), NOW);
  const at = (w) => M.phaseInfo(addDays(NOW, (w - 1) * 7 + 1));
  assert.equal(at(1).key, 'reentry'); assert.equal(at(2).key, 'reentry');
  assert.equal(at(3).key, 'rebuild'); assert.equal(at(4).key, 'rebuild');
  for (const w of [5, 6, 7, 8, 9]) assert.equal(at(w).key, 'build', 'week ' + w);
  assert.equal(at(10).key, 'deload');
  assert.equal(at(11).key, 'build'); assert.equal(at(11).block, 2); assert.equal(at(11).cw, 1);
  assert.equal(at(16).key, 'deload');
});

test('forced deload restarts the block count', () => {
  const start = dayKey(NOW);
  const M = createModel(mkState({ profile: { programStart: start, deloadWeeks: [7] } }), NOW);
  const at = (w) => M.phaseInfo(addDays(NOW, (w - 1) * 7 + 1));
  assert.equal(at(7).key, 'deload'); assert.equal(at(7).forced, true);
  assert.equal(at(8).key, 'build'); assert.equal(at(8).cw, 1); assert.equal(at(8).block, 2);
  assert.equal(at(13).key, 'deload');
});

test('re-entry targets are ~50% of tested max with one fewer set', () => {
  const st = mkState({ profile: { programStart: dayKey(NOW) }, records: [testSess(0, { pull: 10, dip: 12, push: 30, row: 14, runMin: 6 })] });
  const M = createModel(st, NOW);
  const p = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.sets, 3); assert.deepEqual(p.targets, [5, 5, 5]); assert.equal(p.load, 0);
  const c = M.presc('chinup', 3, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(c.targets[0], 6); // 10*1.1=11 → 50% = 5.5 → 6
});

test('build: double progression adds reps, then belt weight', () => {
  const start = dayKey(addDays(NOW, -35)); // week 6 → build
  const mk = (sets) => createModel(mkState({ profile: { programStart: start }, records: [sess(2, { items: [{ x: 'pullup', sec: 'main', sets }] })] }), NOW);
  let M = mk([{ r: 8, kg: 0 }, { r: 7, kg: 0 }, { r: 7, kg: 0 }, { r: 6, kg: 0 }]);
  assert.equal(M.phaseInfo().key, 'build');
  let p = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  assert.deepEqual(p.targets, [9, 8, 8, 7]); assert.equal(p.load, 0);
  M = mk([{ r: 12, kg: 0 }, { r: 12, kg: 0 }, { r: 12, kg: 0 }, { r: 12, kg: 0 }]);
  p = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.status, 'load+'); assert.equal(p.load, 5); assert.deepEqual(p.targets, [5, 5, 5, 5]);
  M = mk([{ r: 8, kg: 5 }, { r: 8, kg: 5 }, { r: 8, kg: 5 }]);
  p = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.load, 7.5);
});

test('RIR: grinding blocks the weight jump, easy sets jump faster', () => {
  const start = dayKey(addDays(NOW, -35));
  const mk = (sets) => createModel(mkState({ profile: { programStart: start }, records: [sess(2, { items: [{ x: 'dip', sec: 'main', sets }] })] }), NOW);
  let M = mk([{ r: 15, kg: 0, rir: 0 }, { r: 15, kg: 0, rir: 0 }, { r: 15, kg: 0, rir: 0 }]);
  let p = M.presc('dip', 3, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.status, 'grind'); assert.equal(p.load, 0);
  M = mk([{ r: 10, kg: 5, rir: 4 }, { r: 10, kg: 5, rir: 4 }, { r: 10, kg: 5, rir: 4 }]);
  p = M.presc('dip', 3, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.load, 10); // two steps of 2.5
  M = mk([{ r: 8, kg: 5, rir: 4 }, { r: 8, kg: 5, rir: 4 }, { r: 8, kg: 5, rir: 4 }]);
  p = M.presc('dip', 3, { phase: M.phaseInfo(), zone: 'green' });
  assert.deepEqual(p.targets, [10, 10, 10]);
});

test('weight drops after two sessions below range', () => {
  const start = dayKey(addDays(NOW, -35));
  const M = createModel(mkState({ profile: { programStart: start }, records: [
    sess(2, { items: [{ x: 'pullup', sec: 'main', sets: [{ r: 3, kg: 10 }, { r: 3, kg: 10 }] }] }),
    sess(5, { items: [{ x: 'pullup', sec: 'main', sets: [{ r: 4, kg: 10 }, { r: 3, kg: 10 }] }] })] }), NOW);
  const p = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  assert.equal(p.status, 'load-'); assert.equal(p.load, 7.5);
});

test('readiness zones adjust targets and sets', () => {
  assert.equal(readinessScore({ sleep: 5, energy: 5, sore: 1, stress: 1 }), 5);
  assert.equal(readyZone(readinessScore({ sleep: 2, energy: 2, sore: 4, stress: 4 })), 'red');
  assert.equal(readyZone(3), 'yellow'); assert.equal(readyZone(0), 'green');
  const M = createModel(mkState({ profile: { programStart: dayKey(addDays(NOW, -35)) }, records: [sess(2, { items: [{ x: 'pullup', sec: 'main', sets: [{ r: 8 }, { r: 8 }, { r: 8 }, { r: 8 }] }] })] }), NOW);
  const g = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'green' });
  const r = M.presc('pullup', 4, { phase: M.phaseInfo(), zone: 'red' });
  assert.equal(r.sets, g.sets - 1); assert.equal(r.targets[0], g.targets[0] - 2);
});

test('pending sessions do not drive progression', () => {
  const M = createModel(mkState({ profile: { programStart: dayKey(addDays(NOW, -35)) }, records: [sess(1, { pending: true, items: [{ x: 'pullup', sec: 'main', sets: [{ r: 12 }, { r: 12 }, { r: 12 }] }] })] }), NOW);
  assert.equal(M.histOf('pullup').length, 0);
});

test('knee and shoulder flags swap exercises', () => {
  const M = createModel(mkState({ profile: { programStart: dayKey(NOW) } }), NOW);
  const b = M.planSession('B', M.ctxFor('B', { kn: true }));
  assert.ok(!b.items.some((i) => EX[i.x].knee)); assert.ok(b.items.some((i) => i.x === 'glutebr'));
  const c = M.planSession('C', M.ctxFor('C', { sh: true }));
  assert.ok(!c.items.some((i) => i.sec === 'main' && EX[i.x].sh));
  const a = M.planSession('A', M.ctxFor('A', { kn: true }));
  assert.equal(a.run.alt, 'walk');
});

test('short mode: 3 main lifts, max 2 sets, no finisher', () => {
  const M = createModel(mkState({ profile: { programStart: dayKey(NOW) } }), NOW);
  const a = M.planSession('A', M.ctxFor('A', { short: true }));
  const main = a.items.filter((i) => i.sec === 'main');
  assert.equal(main.length, 3); assert.ok(main.every((i) => i.sets <= 2)); assert.equal(a.run, null);
});

test('run-walk ladder moves up, repeats, steps back', () => {
  assert.equal(levelFromTest(6), 5); assert.equal(levelFromTest(0), 0); assert.equal(levelFromTest(30), 10);
  const run = (lvl, completed, effort, kn) => sess(1, { kind: 'run', run: { alt: 'run', full: true, lvl, completed, effort }, post: kn ? { kn } : undefined });
  const lvl = (r) => createModel(mkState({ records: [r] }), NOW).runLevel().lvl;
  assert.equal(lvl(run(3, 'yes', 5)), 4);
  assert.equal(lvl(run(3, 'yes', 8)), 3);
  assert.equal(lvl(run(3, 'part', 5)), 3);
  assert.equal(lvl(run(3, 'no', 5)), 2);
  assert.equal(lvl(run(3, 'yes', 4, 'pain')), 2);
  assert.equal(lvl(run(RUN.length - 1, 'yes', 3)), RUN.length - 1);
});

test('run phases sum correctly and finisher is short', () => {
  const full = runPhases(RUN[0], true); const fin = runPhases(RUN[0], false);
  assert.equal(full.filter((p) => p.t === 'run').length, 8);
  assert.ok(fin.reduce((a, p) => a + p.s, 0) < full.reduce((a, p) => a + p.s, 0));
  assert.equal(runPhases({ c: 30 }, true)[1].s, 1800);
});

test('weeks volume counts primary and half secondary', () => {
  const M = createModel(mkState({ records: [sess(0, { items: [{ x: 'pullup', sec: 'main', sets: [{ r: 5 }, { r: 5 }, { r: 5 }] }, { x: 'ytw', sec: 'prep', sets: [{ r: 8 }] }] })] }), NOW);
  const w = M.weeks(1)[0];
  assert.equal(w.vol.back, 3); assert.equal(w.vol.biceps, 1.5); assert.equal(w.vol.shoulders, undefined);
});

test('e1rm uses bodyweight plus added load', () => {
  assert.equal(epley(100, 0), 100);
  const M = createModel(mkState({ records: [{ id: 'w_1', type: 'weigh', d: dayKey(addDays(NOW, -3)), kg: 70 }, sess(1, { items: [{ x: 'pullup', sec: 'main', sets: [{ r: 6, kg: 10 }] }] })] }), NOW);
  assert.equal(Math.round(M.e1rm('pullup')[0].y), 96); // 80 × 1.2
});

test('banister and weekly report run on empty and populated data', () => {
  const empty = createModel(mkState(), NOW);
  assert.ok(empty.banister().pts.length > 0); assert.equal(empty.fatigueSignal(), null);
  assert.ok(empty.weeklyReport().text.includes('Week of'));
  const M = createModel(mkState({ records: [sess(8, { post: { rpe: 7, notes: 'felt good' }, items: [{ x: 'dip', sec: 'main', sets: [{ r: 8 }] }] })] }), NOW);
  assert.ok(M.banister().last.fit > 0);
  assert.ok(M.weeklyReport().text.includes('felt good'));
});

test('coach notes include pending and weigh-in reminders', () => {
  const M = createModel(mkState({ records: [sess(1, { pending: true, title: 'Upper 1' })] }), NOW);
  const notes = M.coachNotes();
  assert.ok(notes.some((n) => n.title.startsWith('Add details')));
  assert.ok(notes.some((n) => n.weigh));
});

test('every template references real exercises', () => {
  for (const [id, T] of Object.entries(TPL)) for (const [x] of [...(T.prep || []), ...(T.main || [])]) assert.ok(EX[x], `${id}:${x}`);
  for (const [x, e] of Object.entries(EX)) { if (e.next) assert.ok(EX[e.next], x); for (const a of e.alt || []) assert.ok(EX[a], `${x} alt ${a}`); }
});
