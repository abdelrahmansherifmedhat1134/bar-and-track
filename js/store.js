// Local-first state store. Everything lives in IndexedDB on the device; Drive sync is layered on top.
//   state  – synced data: { profile, records: { id: record } }
//   local  – device-only data: live workout draft, Drive tokens/ids, UI prefs
import { defaultProfile } from './program.js';
import { dayKey, clone } from './util.js';

const DB_NAME = 'bar-and-track', STORE = 'kv';
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return dbp;
}
async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  } catch { try { return JSON.parse(localStorage.getItem('bt:' + key)); } catch { return undefined; } }
}
async function idbSet(key, val) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    return true;
  } catch { try { localStorage.setItem('bt:' + key, JSON.stringify(val)); return true; } catch { return false; } }
}

const JOURNAL = 'bt:journal', LIVE = 'bt:live';
function lsRead(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsWrite(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } }

function initialState() {
  // A brand-new device starts with defaults stamped "never set" (time 0), so syncing can't
  // let them overwrite real settings from another device.
  return { profile: defaultProfile(), records: {} };
}
const initialLocal = () => ({ live: null, drive: { clientId: '', folderId: '', fileIds: {}, token: '', tokenExp: 0, consented: false, lastSync: 0, lastError: '' }, dirty: false, installHintHidden: false });

class Store {
  constructor() { this.state = null; this.local = null; this.version = 0; this.listeners = new Set(); this._t = null; this._lastTs = 0; this.journal = { records: {}, profile: null }; this.journalSeq = 0; }
  async load() {
    const [s, l] = await Promise.all([idbGet('state'), idbGet('local')]);
    this.state = s && s.profile && s.records ? s : initialState();
    this.state.profile = { ...defaultProfile(), ...this.state.profile };
    const li = initialLocal();
    this.local = l ? { ...li, ...l, drive: { ...li.drive, ...(l.drive || {}) } } : li;
    // Replay writes that reached the synchronous journal but maybe not IndexedDB (app killed mid-save).
    const j = lsRead(JOURNAL);
    let replayed = false;
    if (j) {
      for (const r of Object.values(j.records || {})) { const cur = this.state.records[r.id]; if (!cur || (+r.updatedAt || 0) > (+cur.updatedAt || 0)) { this.state.records[r.id] = r; replayed = true; } }
      if (j.profile && (+j.profile.updatedAt || 0) > (+this.state.profile.updatedAt || 0)) { this.state.profile = { ...this.state.profile, ...j.profile }; replayed = true; }
      if (replayed) this.local.dirty = true;
    }
    const lv = lsRead(LIVE);
    if (lv && (lv.at || 0) > (this.local.liveAt || 0)) { this.local.live = lv.live; this.local.liveAt = lv.at; }
    this._lastTs = Math.max(0, ...Object.values(this.state.records).map((r) => +r.updatedAt || 0), +this.state.profile.updatedAt || 0);
    if (!s || replayed) await this.persistNow();
    this.version++;
  }
  /** Strictly increasing timestamp so two edits in the same ms still order correctly. */
  stamp() { const t = Math.max(Date.now(), this._lastTs + 1); this._lastTs = t; return t; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed(synced) {
    this.version++;
    if (synced) this.local.dirty = true;
    clearTimeout(this._t); this._t = setTimeout(() => this.persistNow(), 250);
    for (const fn of this.listeners) { try { fn(synced); } catch (e) { console.error(e); } }
  }
  /** Persist soon without re-rendering (typing in inputs). */
  quiet() { this._saveLive(); clearTimeout(this._t); this._t = setTimeout(() => this.persistNow(), 400); }
  async persistNow() {
    clearTimeout(this._t); this._t = null;
    const seq = this.journalSeq;
    const ok = await Promise.all([idbSet('state', this.state), idbSet('local', this.local)]).then((r) => r.every(Boolean));
    if (ok && seq === this.journalSeq && seq > 0) { this.journal = { records: {}, profile: null }; this.journalSeq = 0; lsWrite(JOURNAL, null); }
  }

  _journal(rec, profile) {
    if (rec) this.journal.records[rec.id] = rec;
    if (profile) this.journal.profile = profile;
    this.journalSeq++; lsWrite(JOURNAL, this.journal);
  }
  putRecord(rec) { const r = { ...clone(rec), updatedAt: this.stamp() }; this.state.records[rec.id] = r; this._journal(r); this._changed(true); return r; }
  deleteRecord(id) { const cur = this.state.records[id]; if (!cur) return; const r = { id, type: cur.type, deleted: true, updatedAt: this.stamp() }; this.state.records[id] = r; this._journal(r); this._changed(true); }
  updateProfile(patch) { const t = this.stamp(); const _ts = { ...(this.state.profile._ts || {}) }; for (const k of Object.keys(patch)) _ts[k] = t; this.state.profile = { ...this.state.profile, ...clone(patch), _ts, updatedAt: t }; this._journal(null, this.state.profile); this._changed(true); }
  setLocal(patch) { Object.assign(this.local, patch); if ('live' in patch) this._saveLive(); this._changed(false); }
  /** The live workout is small and precious: mirror it synchronously on every change. */
  _saveLive() { this.local.liveAt = Date.now(); lsWrite(LIVE, { at: this.local.liveAt, live: this.local.live }); }
  setDrive(patch) { this.local.drive = { ...this.local.drive, ...patch }; this._changed(false); }
  /** Replace synced data after a merge (no dirty flag: it already matches the cloud). */
  replaceSynced(profile, records) { this.state = { profile: { ...defaultProfile(), ...profile }, records }; this.journal = { records: {}, profile: null }; this.journalSeq++; lsWrite(JOURNAL, null); this.version++; this.persistNow(); for (const fn of this.listeners) { try { fn(false); } catch (e) { console.error(e); } } }
}
export const store = new Store();

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not supported */ }
}
