// Native features when Bar & Track runs inside its Android app (a Capacitor shell that loads this same
// site). In a normal browser every function here is a no-op and `isApp` is false, so the web app is
// unchanged. Inside the app:
//  - GPS keeps tracking with the screen off (foreground service with a "Run in progress" notification)
//  - every run/walk switch is a scheduled notification with sound and vibration, so cues happen on
//    time even if the phone is asleep and other apps are playing music
//  - spoken cues use the phone's own voice
//  - Google Drive sign-in uses Android's account picker (Google blocks its web sign-in inside apps)

export const isApp = typeof window !== 'undefined' && !!(window.androidBridge || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

let corePromise = null;
const plugins = {};
/* A Capacitor plugin object is a Proxy that turns ANY property into a native call, including `then`.
 * Returning it from an async function makes `await` call plugin.then() on the phone, which never
 * answers, so every native call hung. The plugin is therefore always passed wrapped in an array. */
async function pluginBox(name) {
  if (!isApp) return [null];
  if (!corePromise) corePromise = import('./vendor/capacitor-core.js');
  const core = await corePromise;
  return [plugins[name] || (plugins[name] = core.registerPlugin(name))];
}
/** Reject if a native call hasn't answered in `ms` (a hung call must never look like "nothing happened"). */
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} did not respond.`)), ms))]);
const safe = async (fn, fallback = null) => { try { return await fn(); } catch (e) { console.warn('[native]', e && e.message ? e.message : e); return fallback; } };

/* ---------- background GPS ---------- */
export async function watchPosition(onPos, onErr) {
  const [BG] = await pluginBox('BackgroundGeolocation'); if (!BG) return null;
  return safe(() => BG.addWatcher({
    backgroundTitle: 'Bar & Track · run in progress',
    backgroundMessage: 'Tracking distance. Tap to open the run.',
    requestPermissions: true, stale: false, distanceFilter: 0
  }, (loc, err) => {
    if (err) { onErr && onErr(err.code === 'NOT_AUTHORIZED' ? 1 : 2, err); return; }
    if (loc) onPos({ lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, t: loc.time || Date.now() });
  }));
}
export async function clearWatch(id) { const [BG] = await pluginBox('BackgroundGeolocation'); if (BG && id) await safe(() => BG.removeWatcher({ id })); }
export async function openLocationSettings() { const [BG] = await pluginBox('BackgroundGeolocation'); if (BG) await safe(() => BG.openSettings()); }

/* ---------- scheduled run cues ---------- */
const CUE_BASE = 7100, CUE_MAX = 120;
let channelReady = null;
async function notifications() {
  const [LN] = await pluginBox('LocalNotifications'); if (!LN) return [null];
  if (!channelReady) channelReady = safe(async () => {
    const p = await LN.checkPermissions();
    if (p.display !== 'granted') await LN.requestPermissions();
    await LN.createChannel({ id: 'cues', name: 'Run cues', description: 'Run and walk switches during a run', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#17876F' });
    return true;
  });
  await channelReady; return [LN];
}
/** Ask for the notification permission ahead of the first run (needs a tap on Android 13+). */
export async function prepareRuns() { await notifications(); }
/** Replace the scheduled cues of one kind ('run' or 'rest') with `list` = [{at: ms, title, body}]. */
const BASES = { run: CUE_BASE, rest: CUE_BASE + CUE_MAX };
export async function scheduleCues(list, kind = 'run') {
  const [LN] = await notifications(); if (!LN) return;
  await cancelCues(kind);
  const now = Date.now(), base = BASES[kind];
  const items = list.filter((c) => c.at > now + 500).slice(0, CUE_MAX).map((c, i) => ({
    id: base + i, title: c.title, body: c.body || '', channelId: 'cues',
    schedule: { at: new Date(c.at), allowWhileIdle: true }, smallIcon: 'ic_stat_bt', iconColor: '#17876F', autoCancel: true
  }));
  if (items.length) await safe(() => LN.schedule({ notifications: items }));
}
export async function cancelCues(kind = 'run') {
  const [LN] = await pluginBox('LocalNotifications'); if (!LN) return;
  await safe(async () => {
    const ids = Array.from({ length: CUE_MAX }, (_, i) => ({ id: BASES[kind] + i }));
    await LN.cancel({ notifications: ids });
    await LN.removeDeliveredNotifications({ notifications: ids });
  });
}

/* ---------- voice ---------- */
export async function speakNative(text) {
  const [T] = await pluginBox('TextToSpeech'); if (!T) return false;
  return safe(async () => { await T.stop(); await T.speak({ text, lang: 'en-US', rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: 0 }); return true; }, false);
}

/* ---------- Google sign-in for Drive ---------- */
let loginInit = null;
export async function googleAccessToken(clientId, scope, interactive) {
  const [SL] = await pluginBox('SocialLogin'); if (!SL) throw new Error('Google sign-in is not available.');
  if (!loginInit) loginInit = timeout(SL.initialize({ google: { webClientId: clientId, mode: 'online' } }), 15000, 'Google sign-in setup').catch((e) => { loginInit = null; throw e; });
  await loginInit;
  const res = await timeout(SL.login({ provider: 'google', options: { scopes: [scope], style: interactive ? 'standard' : 'bottom', filterByAuthorizedAccounts: !interactive } }), 120000, 'Google sign-in');
  const tok = res && res.result && res.result.accessToken;
  if (!tok || !tok.token) throw new Error('Google did not give Drive access. Tap Sync and allow Google Drive.');
  const exp = tok.expires ? Date.parse(tok.expires) : NaN;
  return { token: tok.token, exp: Number.isFinite(exp) && exp > Date.now() ? exp : Date.now() + 55 * 60 * 1000 };
}
export async function googleSignOut() { const [SL] = await pluginBox('SocialLogin'); if (SL) await safe(() => SL.logout({ provider: 'google' })); }

/* ---------- lock-screen controls (native RunControls plugin in the app) ---------- */
let controlsSig = '', listening = false;
/** Show or update the ongoing workout notification: {title, text, endsAt, actions:[{id,label}]}; null hides it. */
export async function setControls(state, onAction) {
  const [RC] = await pluginBox('RunControls'); if (!RC) return;
  if (!listening && onAction) { listening = true; await safe(() => RC.addListener('action', (e) => onAction(e && e.action))); }
  const sig = state ? JSON.stringify(state) : '';
  if (sig === controlsSig) return;
  controlsSig = sig;
  if (state) await safe(() => RC.show(state)); else await safe(() => RC.hide());
}

/** What the app can reach natively; shown in Plan so a problem can be reported precisely. */
export async function diagnose() {
  const C = window.Capacitor || {};
  const out = { isApp, native: !!(C.isNativePlatform && C.isNativePlatform()), platform: C.getPlatform ? C.getPlatform() : 'web', plugins: (C.PluginHeaders || []).map((h) => h.name).sort() };
  try { const [LN] = await pluginBox('LocalNotifications'); out.core = LN ? 'ok' : 'none'; } catch (e) { out.core = 'error: ' + (e && e.message); }
  return out;
}
