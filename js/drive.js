// Google Drive sync (browser-only OAuth via Google Identity Services, scope drive.file:
// the app can only see files it created itself).
//
// Files in the "Bar & Track" Drive folder:
//   bar-and-track-data.json  – full app data, merged record-by-record on every sync
//   Training log.csv          – every set, opens in Google Sheets
//   Weekly reports.md         – the last 12 weekly summaries
import { store } from './store.js';
import { mergeStates, pruneTombstones } from './merge.js';
import { createModel } from './program.js';
import { buildCSV } from './export.js';
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'Bar & Track';
const FILES = { data: 'bar-and-track-data.json', csv: 'Training log.csv', report: 'Weekly reports.md' };

let gisPromise = null, tokenClient = null, tokenClientId = '', pendingAuth = null;
let syncing = null, again = false;
const listeners = new Set();
export const status = { state: 'off', message: '' }; // off | idle | syncing | ok | auth | error | offline
function setStatus(state, message = '') { status.state = state; status.message = message; for (const f of listeners) f(status); }
export const onStatus = (f) => { listeners.add(f); return () => listeners.delete(f); };

export const clientId = () => (store.local.drive.clientId || GOOGLE_CLIENT_ID || '').trim();
export const isConfigured = () => /\.apps\.googleusercontent\.com$/.test(clientId());
export const isConnected = () => isConfigured() && !!store.local.drive.consented;
export const hasValidToken = () => !!store.local.drive.token && store.local.drive.tokenExp > Date.now() + 60_000;
export const folderUrl = () => (store.local.drive.folderId ? `https://drive.google.com/drive/folders/${store.local.drive.folderId}` : 'https://drive.google.com/');

/** Load the Google sign-in library ahead of time so a tap can open the popup immediately. */
export function preload() {
  if (!isConfigured() || !navigator.onLine) return Promise.resolve(false);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      if (self.google && google.accounts && google.accounts.oauth2) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = () => resolve(); s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in. Check your connection.')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise.then(() => { ensureTokenClient(); return true; }, () => false);
}
function ensureTokenClient() {
  if (tokenClient && tokenClientId === clientId()) return tokenClient;
  if (!(self.google && google.accounts && google.accounts.oauth2)) return null;
  tokenClientId = clientId();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: tokenClientId, scope: SCOPE,
    callback: (resp) => {
      const p = pendingAuth; pendingAuth = null; if (!p) return;
      if (resp && resp.access_token) {
        store.setDrive({ token: resp.access_token, tokenExp: Date.now() + (Number(resp.expires_in) || 3600) * 1000, consented: true, lastError: '' });
        p.resolve(resp.access_token);
      } else p.reject(new Error(resp && resp.error_description ? resp.error_description : 'Google sign-in did not complete.'));
    },
    error_callback: (err) => { const p = pendingAuth; pendingAuth = null; if (p) p.reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in window was closed.' : err && err.type === 'popup_failed_to_open' ? 'The browser blocked the sign-in window. Allow pop-ups for this site.' : 'Google sign-in failed.')); }
  });
  return tokenClient;
}
/**
 * Get an access token. With interactive=true this MUST run synchronously inside a click handler
 * (before any await) so the browser allows Google's sign-in popup.
 */
function getToken(interactive) {
  if (hasValidToken()) return Promise.resolve(store.local.drive.token);
  if (!interactive) return Promise.reject(Object.assign(new Error('Tap Sync to sign in to Google.'), { code: 'auth' }));
  const tc = ensureTokenClient();
  if (!tc) { preload(); return Promise.reject(new Error('Google sign-in is still loading. Tap again in a second.')); }
  const p = new Promise((resolve, reject) => { pendingAuth = { resolve, reject }; });
  tc.requestAccessToken({ prompt: store.local.drive.consented ? '' : 'consent' });
  return p;
}

async function api(url, { method = 'GET', query, headers = {}, body, text = false } = {}) {
  const u = (url.startsWith('http') ? url : API + url) + (query ? '?' + new URLSearchParams(query) : '');
  let r;
  try { r = await fetch(u, { method, headers: { Authorization: 'Bearer ' + store.local.drive.token, ...headers }, body }); }
  catch { throw Object.assign(new Error('No connection to Google Drive.'), { code: 'offline' }); }
  if (r.status === 401) { store.setDrive({ token: '', tokenExp: 0 }); throw Object.assign(new Error('Google session expired. Tap Sync to sign in again.'), { code: 'auth' }); }
  if (r.status === 404) throw Object.assign(new Error('Not found'), { code: 'notfound' });
  if (!r.ok) { let msg = ''; try { const j = await r.json(); msg = j.error && j.error.message; } catch { /* ignore */ } throw new Error(`Google Drive error ${r.status}${msg ? ': ' + msg : ''}`); }
  if (r.status === 204) return null;
  return text ? r.text() : r.json();
}
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolder() {
  const d = store.local.drive;
  if (d.folderId) {
    try { const f = await api('files/' + d.folderId, { query: { fields: 'id,trashed' } }); if (!f.trashed) return d.folderId; } catch (e) { if (e.code !== 'notfound') throw e; }
  }
  const found = await api('files', { query: { q: `name='${q(FOLDER)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)', spaces: 'drive', pageSize: '10' } });
  let id = found.files && found.files[0] && found.files[0].id;
  if (!id) id = (await api('files', { method: 'POST', query: { fields: 'id' }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).id;
  store.setDrive({ folderId: id, fileIds: {} });
  return id;
}
async function findFile(key, folderId) {
  const cached = store.local.drive.fileIds[key];
  if (cached) { try { const f = await api('files/' + cached, { query: { fields: 'id,trashed' } }); if (!f.trashed) return cached; } catch (e) { if (e.code !== 'notfound') throw e; } }
  const r = await api('files', { query: { q: `name='${q(FILES[key])}' and '${folderId}' in parents and trashed=false`, fields: 'files(id,modifiedTime)', orderBy: 'modifiedTime desc', spaces: 'drive', pageSize: '5' } });
  const id = r.files && r.files[0] ? r.files[0].id : '';
  if (id) store.setDrive({ fileIds: { ...store.local.drive.fileIds, [key]: id } });
  return id;
}
async function writeFile(key, folderId, mime, content, existingId) {
  if (existingId) { await api(`${UPLOAD}/${existingId}`, { method: 'PATCH', query: { uploadType: 'media', fields: 'id' }, headers: { 'Content-Type': mime + '; charset=UTF-8' }, body: content }); return existingId; }
  const boundary = 'bt' + Math.random().toString(36).slice(2);
  const meta = { name: FILES[key], parents: [folderId], mimeType: mime };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await api(UPLOAD, { method: 'POST', query: { uploadType: 'multipart', fields: 'id' }, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  store.setDrive({ fileIds: { ...store.local.drive.fileIds, [key]: r.id } });
  return r.id;
}

async function doSync() {
  setStatus('syncing');
  const folderId = await ensureFolder();
  const dataId = await findFile('data', folderId);
  let remote = null;
  if (dataId) {
    const txt = await api('files/' + dataId, { query: { alt: 'media' }, text: true });
    try { remote = JSON.parse(txt); } catch { remote = null; }
    if (remote && remote.app !== 'bar-and-track') remote = null;
  }
  // Merge against the store as it is *now*, synchronously, so no local edit can slip in between.
  const m = mergeStates(store.state, remote);
  const records = pruneTombstones(m.records);
  if (m.localChanged) store.replaceSynced(m.profile, records);
  store.setLocal({ dirty: false });
  if (m.remoteChanged || !dataId) {
    const payload = JSON.stringify({ app: 'bar-and-track', schema: 1, exportedAt: new Date().toISOString(), profile: store.state.profile, records: store.state.records });
    await writeFile('data', folderId, 'application/json', payload, dataId);
    const M = createModel(store.state);
    const csvId = await findFile('csv', folderId);
    await writeFile('csv', folderId, 'text/csv', buildCSV(M), csvId);
    const reps = []; for (let i = 1; i <= 12; i++) { const r = M.weeklyReport(i); if (r && r.count) reps.push(r.text); }
    const repId = await findFile('report', folderId);
    await writeFile('report', folderId, 'text/markdown', reps.length ? reps.join('\n\n---\n\n') : '# Weekly reports\n\nNo completed weeks yet.', repId);
  }
  store.setDrive({ lastSync: Date.now(), lastError: '' });
  setStatus('ok');
  return m;
}

/**
 * Sync now. interactive=true only from a click handler (may open Google's popup).
 * Resolves to the merge result, or null when skipped.
 */
export function sync({ interactive = false } = {}) {
  if (!isConfigured()) return Promise.resolve(null);
  if (!navigator.onLine) { setStatus('offline', 'Offline. Changes are saved on this device and sync later.'); return Promise.resolve(null); }
  if (syncing) { again = true; return syncing; }
  const tokenP = getToken(interactive); // synchronous popup call happens here
  syncing = tokenP.then(doSync).catch((e) => {
    const st = e.code === 'auth' ? 'auth' : e.code === 'offline' ? 'offline' : 'error';
    store.setDrive({ lastError: e.message });
    setStatus(st, e.message);
    return null;
  }).finally(() => {
    syncing = null;
    if (again) { again = false; if (hasValidToken() && store.local.dirty) sync(); }
  });
  return syncing;
}

export function disconnect() {
  const tok = store.local.drive.token;
  try { if (tok && self.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(tok, () => {}); } catch { /* ignore */ }
  store.setDrive({ token: '', tokenExp: 0, consented: false, folderId: '', fileIds: {}, lastError: '' });
  setStatus('off');
}

export function initialStatus() {
  if (!isConfigured()) setStatus('off');
  else if (!isConnected()) setStatus('off');
  else if (store.local.drive.lastError) setStatus(hasValidToken() ? 'error' : 'auth', store.local.drive.lastError);
  else setStatus(hasValidToken() ? 'idle' : 'auth');
}
