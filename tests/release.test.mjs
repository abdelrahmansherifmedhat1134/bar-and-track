// Guards against shipping a broken offline cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const assets = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
test('every precached asset exists', () => {
  for (const a of assets) { if (a === './') continue; assert.ok(existsSync(a.slice(2)), a); }
});
test('every JS module is precached', () => {
  const js = [...readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => './js/' + f), './js/vendor/morphdom.js'];
  for (const f of js) assert.ok(assets.includes(f), f + ' missing from sw.js ASSETS');
});
test('service worker and app versions match', () => {
  const v1 = sw.match(/const VERSION = '([^']+)'/)[1];
  const v2 = readFileSync('js/version.js', 'utf8').match(/'([^']+)'/)[1];
  const v3 = JSON.parse(readFileSync('package.json', 'utf8')).version;
  assert.equal(v1, v2); assert.equal(v2, v3);
});
