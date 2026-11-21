import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EX } from '../js/data.js';

const { DEMOS, hasDemo, _solveSide, _poseAt, _timeline } = await import('../js/demos.js');
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('every exercise has a demo', () => {
  for (const x of Object.keys(EX)) assert.ok(hasDemo(x), `no demo for ${x}`);
  for (const k of ['pull', 'dip', 'push', 'row']) assert.ok(hasDemo(k));
});

test('side-view limbs keep their length and contacts stay put through the movement', () => {
  for (const [x, def] of Object.entries(DEMOS)) {
    if (def.view) continue;
    const tl = _timeline(def);
    for (let t = 0; t < tl.total; t += 0.1) {
      const { pose } = _poseAt(def, t), J = _solveSide(pose);
      assert.ok(Math.abs(d(J.hip, J.top) - 50) < 1e-6, x);
      assert.ok(Math.abs(d(J.elA, J.hdA) - 26) < 1e-6, x);
      assert.ok(Math.abs(d(J.knB, J.anB) - 38) < 1e-6, x);
      for (const p of Object.values(J)) if (Array.isArray(p)) assert.ok(p.every(Number.isFinite), x);
      // a hand that is meant to hold the bar really reaches it (no gaps from an over-stretched arm)
      if (pose.hA) assert.ok(d(J.hdA, pose.hA) < 1.5, `${x} hand misses its grip at ${t.toFixed(1)}s by ${d(J.hdA, pose.hA).toFixed(1)}`);
      if (pose.aA) assert.ok(d(J.anA, pose.aA) < 1.5, `${x} foot misses its spot at ${t.toFixed(1)}s by ${d(J.anA, pose.aA).toFixed(1)}`);
    }
  }
});

test('every demo has captions and a sensible length', () => {
  for (const [x, def] of Object.entries(DEMOS)) {
    assert.ok(def.frames.length >= 2 && def.frames.every((f) => f.cap), x);
    const tl = _timeline(def); assert.ok(tl.total > 0.5 && tl.total < 12, x);
  }
});
