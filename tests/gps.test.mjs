import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, GpsTrack, routePath } from '../js/gpsmath.js';

test('haversine: 1 degree of latitude ≈ 111.2 km', () => {
  assert.ok(Math.abs(haversine(30, 31, 31, 31) - 111195) < 50);
});
// Walk north at 3 m/s from Cairo, one fix per second.
function line(n, speed = 3, acc = 5, t0 = 0) {
  const pts = []; const dLat = speed / 111195;
  for (let i = 0; i < n; i++) pts.push({ lat: 30.05 + i * dLat, lon: 31.23, acc, t: t0 + i * 1000 });
  return pts;
}
test('straight run distance and splits', () => {
  const g = new GpsTrack();
  for (const p of line(701)) g.add(p); // 700 s × 3 m/s = 2100 m
  assert.ok(Math.abs(g.dist - 2100) < 15, g.dist);
  assert.equal(g.splits.length, 2);
  assert.ok(Math.abs(g.splits[0] - 333) <= 2, g.splits[0]);
  const pace = g.currentPace(); assert.ok(Math.abs(pace - 333) < 5, pace);
});
test('standing still with jitter adds almost nothing', () => {
  const g = new GpsTrack(); let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < 300; i++) g.add({ lat: 30.05 + rnd() * 2 / 111195, lon: 31.23 + rnd() * 2 / 96000, acc: 8, t: i * 1000 });
  assert.ok(g.dist < 20, g.dist);
});
test('spikes and inaccurate fixes are rejected', () => {
  const g = new GpsTrack(); const pts = line(100);
  pts[50] = { ...pts[50], lat: pts[50].lat + 0.01 }; // ~1.1 km jump
  pts[60] = { ...pts[60], acc: 120 };
  for (const p of pts) g.add(p);
  assert.ok(Math.abs(g.dist - 297) < 15, g.dist); assert.ok(g.rejected >= 2);
});
test('phase attribution', () => {
  const g = new GpsTrack(); const pts = line(201);
  pts.forEach((p, i) => { g.setPhase(i < 100 ? 'run' : 'walk'); g.add(p); });
  assert.ok(g.byPhase.run > 250 && g.byPhase.walk > 250);
});
test('route path renders', () => {
  const g = new GpsTrack(); for (const p of line(100)) g.add(p);
  assert.match(routePath(g.route, 300, 200), /^M[\d.]+,[\d.]+L/);
  assert.equal(routePath([], 10, 10), '');
});
