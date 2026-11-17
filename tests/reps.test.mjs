import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepDetector } from '../js/repcount.js';

function simulate(reps, periodMs, amp, noise = 0.15, rate = 60) {
  const d = new RepDetector(); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const dt = 1000 / rate; const total = 2000 + reps * periodMs + 2000;
  for (let t = 0; t < total; t += dt) {
    const inSet = t > 2000 && t < 2000 + reps * periodMs;
    const s = inSet ? amp * Math.sin((2 * Math.PI * (t - 2000)) / periodMs) : 0;
    d.push(0.3 * s + noise * rnd(), 9.81 + s + noise * rnd(), 0.2 * s + noise * rnd(), t);
  }
  return d.count;
}
test('counts slow controlled reps', () => { assert.equal(simulate(8, 2500, 2.0), 8); });
test('counts faster reps', () => { assert.equal(simulate(12, 1400, 2.5), 12); });
test('ignores sensor noise while resting', () => { assert.equal(simulate(0, 2000, 0, 0.2), 0); });
test('rejects garbage samples', () => { const d = new RepDetector(); assert.equal(d.push(NaN, 1, 1, 0), false); });
