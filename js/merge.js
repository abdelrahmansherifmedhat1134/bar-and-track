// Last-writer-wins merge of two app states. Every record and the profile carry updatedAt (ms).
// Deleted records are kept as tombstones ({deleted:true}) so a deletion on one device wins
// over an older copy on another.

import { defaultProfile } from './program.js';

const ts = (r) => (r && +r.updatedAt) || 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SKIP = new Set(['updatedAt', '_ts']);

/**
 * When each profile field was last set. Profiles carry per-field times in `_ts`.
 * Older profiles (no `_ts`) fall back to the profile's updatedAt, except that a field still
 * holding its default value counts as never set (time 0): a freshly opened device must not
 * overwrite real settings from another device.
 */
function fieldTs(p, k) {
  if (!p) return -1;
  if (p._ts && p._ts[k] != null) return +p._ts[k];
  if (p._ts) return 0;
  const d = defaultProfile();
  if (k in d && same(p[k], d[k])) return 0;
  return ts(p);
}

/** Field-by-field last-writer-wins merge of two profiles. Ties break deterministically. */
export function mergeProfiles(a, b) {
  if (!b) return { profile: a, toLocal: false, toRemote: true };
  if (!a) return { profile: b, toLocal: true, toRemote: false };
  const out = {}, times = {};
  let toLocal = false, toRemote = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !SKIP.has(k)));
  for (const k of keys) {
    const inA = k in a, inB = k in b, ta = fieldTs(a, k), tb = fieldTs(b, k);
    let pickB;
    if (!inB) pickB = false;
    else if (!inA) pickB = true;
    else if (tb !== ta) pickB = tb > ta;
    else pickB = JSON.stringify(b[k]) > JSON.stringify(a[k]);
    out[k] = pickB ? b[k] : a[k]; times[k] = Math.max(0, pickB ? tb : ta);
    if (!same(a[k], b[k]) || !inA || !inB) { if (pickB) toLocal = true; else toRemote = true; }
  }
  out._ts = times; out.updatedAt = Math.max(ts(a), ts(b));
  if (!a._ts || !same(a._ts, times)) toLocal = toLocal || !a._ts;
  if (!b._ts) toRemote = true;
  return { profile: out, toLocal, toRemote };
}

/**
 * @returns {{profile, records, localChanged:boolean, remoteChanged:boolean}}
 *   localChanged  – the merged result differs from `local` (apply it on this device)
 *   remoteChanged – the merged result differs from `remote` (upload it)
 */
export function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object') return { profile: local.profile, records: local.records, localChanged: false, remoteChanged: true };
  const records = {};
  let localChanged = false, remoteChanged = false;
  const L = local.records || {}, R = remote.records || {};
  const ids = new Set([...Object.keys(L), ...Object.keys(R)]);
  for (const id of ids) {
    const a = L[id], b = R[id];
    if (a && !b) { records[id] = a; remoteChanged = true; }
    else if (b && !a) { records[id] = b; localChanged = true; }
    else if (ts(b) > ts(a)) { records[id] = b; localChanged = true; }
    else { records[id] = a; if (ts(a) > ts(b)) remoteChanged = true; }
  }
  const pm = mergeProfiles(local.profile, remote.profile);
  const profile = pm.profile;
  if (pm.toLocal) localChanged = true;
  if (pm.toRemote) remoteChanged = true;
  return { profile, records, localChanged, remoteChanged };
}

/** Drop tombstones older than `maxAgeMs` (they only need to outlive the slowest device's next sync). */
export function pruneTombstones(records, now = Date.now(), maxAgeMs = 180 * 864e5) {
  const out = {};
  for (const [id, r] of Object.entries(records || {})) if (!(r && r.deleted && now - ts(r) > maxAgeMs)) out[id] = r;
  return out;
}
