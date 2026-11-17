// Last-writer-wins merge of two app states. Every record and the profile carry updatedAt (ms).
// Deleted records are kept as tombstones ({deleted:true}) so a deletion on one device wins
// over an older copy on another.

const ts = (r) => (r && +r.updatedAt) || 0;

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
  let profile;
  if (remote.profile && ts(remote.profile) > ts(local.profile)) { profile = remote.profile; localChanged = true; }
  else { profile = local.profile; if (!remote.profile || ts(local.profile) > ts(remote.profile)) remoteChanged = true; }
  return { profile, records, localChanged, remoteChanged };
}

/** Drop tombstones older than `maxAgeMs` (they only need to outlive the slowest device's next sync). */
export function pruneTombstones(records, now = Date.now(), maxAgeMs = 180 * 864e5) {
  const out = {};
  for (const [id, r] of Object.entries(records || {})) if (!(r && r.deleted && now - ts(r) > maxAgeMs)) out[id] = r;
  return out;
}
