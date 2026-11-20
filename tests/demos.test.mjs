import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EX } from '../js/data.js';

// demos.js touches the DOM on import; give it the minimum it needs.
globalThis.document = { addEventListener() {}, hidden: false };
const { DEMOS, hasDemo, _solve, _poseAt } = await import('../js/demos.js');

test('every exercise has an animated demo', () => {
  for (const x of Object.keys(EX)) assert.ok(hasDemo(x), `no demo for ${x}`);
  for (const k of ['pull', 'dip', 'push', 'row']) assert.ok(hasDemo(k));
});

test('limbs keep their length through the whole animation', () => {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [x, def] of Object.entries(DEMOS)) for (let ph = 0; ph < 1; ph += 0.05) {
    const J = _solve(_poseAt(def, ph));
    assert.ok(Math.abs(d(J.hip, J.shoulder) - 46) < 1e-6, x);
    assert.ok(Math.abs(d(J.elbowA, J.handA) - 24) < 1e-6, x);
    assert.ok(Math.abs(d(J.kneeB, J.ankleB) - 34) < 1e-6, x);
    for (const p of Object.values(J)) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), x);
  }
});
