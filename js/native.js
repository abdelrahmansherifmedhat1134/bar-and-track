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
async function plugin(name) {
  if (!isApp) return null;
  if (!corePromise) corePromise = import('./vendor/capacitor-core.js');
  const core = await corePromise;
  return plugins[name] || (plugins[name] = core.registerPlugin(name));
}
const safe = async (fn, fallback = null) => { try { return await fn(); } catch (e) { console.warn('[native]', e && e.message ? e.message : e); return fallback; } };

/* ---------- background GPS ---------- */
export async function watchPosition(onPos, onErr) {
  const BG = await plugin('BackgroundGeolocation'); if (!BG) return null;
  return safe(() => BG.addWatcher({
    backgroundTitle: 'Bar & Track · run in progress',
    backgroundMessage: 'Tracking distance. Tap to open the run.',
    requestPermissions: true, stale: false, distanceFilter: 0
  }, (loc, err) => {
    if (err) { onErr && onErr(err.code === 'NOT_AUTHORIZED' ? 1 : 2, err); return; }
    if (loc) onPos({ lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, t: loc.time || Date.now() });
  }));
}
export async function clearWatch(id) { const BG = await plugin('BackgroundGeolocation'); if (BG && id) await safe(() => BG.removeWatcher({ id })); }
export async function openLocationSettings() { const BG = await plugin('BackgroundGeolocation'); if (BG) await safe(() => BG.openSettings()); }

/* ---------- scheduled run cues ---------- */
const CUE_BASE = 7100, CUE_MAX = 120;
let channelReady = null;
async function notifications() {
  const LN = await plugin('LocalNotifications'); if (!LN) return null;
  if (!channelReady) channelReady = safe(async () => {
    const p = await LN.checkPermissions();
    if (p.display !== 'granted') await LN.requestPermissions();
    await LN.createChannel({ id: 'cues', name: 'Run cues', description: 'Run and walk switches during a run', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#17876F' });
    return true;
  });
  await channelReady; return LN;
}
/** Ask for the notification permission ahead of the first run (needs a tap on Android 13+). */
export async function prepareRuns() { await notifications(); }
/** Replace the scheduled cues with `list` = [{at: ms, title, body}]. */
export async function scheduleCues(list) {
  const LN = await notifications(); if (!LN) return;
  await cancelCues();
  const now = Date.now();
  const items = list.filter((c) => c.at > now + 500).slice(0, CUE_MAX).map((c, i) => ({
    id: CUE_BASE + i, title: c.title, body: c.body || '', channelId: 'cues',
    schedule: { at: new Date(c.at), allowWhileIdle: true }, smallIcon: 'ic_stat_bt', iconColor: '#17876F', autoCancel: true
  }));
  if (items.length) await safe(() => LN.schedule({ notifications: items }));
}
export async function cancelCues() {
  const LN = await plugin('LocalNotifications'); if (!LN) return;
  await safe(async () => {
    const ids = Array.from({ length: CUE_MAX }, (_, i) => ({ id: CUE_BASE + i }));
    await LN.cancel({ notifications: ids });
    await LN.removeDeliveredNotifications({ notifications: ids });
  });
}

/* ---------- voice ---------- */
export async function speakNative(text) {
  const T = await plugin('TextToSpeech'); if (!T) return false;
  return safe(async () => { await T.stop(); await T.speak({ text, lang: 'en-US', rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: 0 }); return true; }, false);
}

/* ---------- Google sign-in for Drive ---------- */
let loginInit = null;
export async function googleAccessToken(clientId, scope, interactive) {
  const SL = await plugin('SocialLogin'); if (!SL) throw new Error('Google sign-in is not available.');
  if (!loginInit) loginInit = SL.initialize({ google: { webClientId: clientId, mode: 'online' } }).catch((e) => { loginInit = null; throw e; });
  await loginInit;
  const res = await SL.login({ provider: 'google', options: { scopes: [scope], style: interactive ? 'standard' : 'bottom', filterByAuthorizedAccounts: !interactive } });
  const tok = res && res.result && res.result.accessToken;
  if (!tok || !tok.token) throw new Error('Google did not give Drive access. Tap Sync and allow Google Drive.');
  const exp = tok.expires ? Date.parse(tok.expires) : NaN;
  return { token: tok.token, exp: Number.isFinite(exp) && exp > Date.now() ? exp : Date.now() + 55 * 60 * 1000 };
}
export async function googleSignOut() { const SL = await plugin('SocialLogin'); if (SL) await safe(() => SL.logout({ provider: 'google' })); }
