import { isApp, watchPosition, clearWatch, speakNative } from './native.js';
// Browser hardware: sound, vibration, screen wake lock, GPS, motion sensor.
import { GpsTrack } from './gpsmath.js';
import { RepDetector } from './repcount.js';

/* ---------- sound & vibration ---------- */
let actx = null;
export function unlockAudio() {
  try {
    if (!actx) { const A = self.AudioContext || self.webkitAudioContext; if (A) actx = new A(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
export function beep(freq = 880, dur = 0.15, vol = 0.25) {
  try {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* ignore */ }
}
export function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } }

/* ---------- screen wake lock ---------- */
let wake = null, wantWake = false;
export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { /* denied or unsupported */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && wantWake && !wake) keepAwake(true); });

/* ---------- GPS ---------- */
export const gps = {
  track: null, watchId: null, state: 'off', error: '', onUpdate: null,
  supported: () => isApp || 'geolocation' in navigator,
  start(restore) {
    if (!this.supported()) { this.state = 'error'; this.error = 'This device has no GPS access in the browser.'; return; }
    this.track = new GpsTrack();
    if (restore) Object.assign(this.track, restore, { anchor: null, recent: [] });
    this.state = 'waiting'; this.error = '';
    if (isApp) { // Android app: background-capable GPS that keeps going with the screen off
      const token = {}; this.watchId = token;
      watchPosition((pt) => { if (this.watchId !== token && this.watchId !== token.id) return; this.state = 'on'; this.track.add(pt); this.onUpdate && this.onUpdate(); },
        (code) => { this.state = 'error'; this.error = code === 1 ? 'Location permission denied. Allow location for Bar & Track in Android settings ("Allow all the time" keeps it going with the screen off).' : 'GPS unavailable. Distance will not be recorded.'; this.onUpdate && this.onUpdate(); })
        .then((id) => { if (this.watchId === token) { token.id = id; this.watchId = id; } else if (id) clearWatch(id); });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition((p) => {
      this.state = 'on';
      this.track.add({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp || Date.now() });
      this.onUpdate && this.onUpdate();
    }, (err) => {
      this.state = 'error';
      this.error = err.code === 1 ? 'Location permission denied. Allow location for this site to track distance.' : err.code === 3 ? 'Waiting for a GPS signal…' : 'GPS unavailable. Distance will not be recorded.';
      if (err.code === 3) this.state = 'waiting';
      this.onUpdate && this.onUpdate();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  },
  setPhase(t) { if (this.track) this.track.setPhase(t); },
  /** Serializable snapshot so a reload mid-run keeps the distance so far. */
  snapshot() { const t = this.track; return t ? { dist: t.dist, byPhase: { ...t.byPhase }, route: t.route.slice(), splits: t.splits.slice(), splitStartT: t.splitStartT } : null; },
  stop(movingSec) {
    if (this.watchId != null) {
      if (isApp) { if (typeof this.watchId === 'string') clearWatch(this.watchId); }
      else { try { navigator.geolocation.clearWatch(this.watchId); } catch { /* ignore */ } }
    }
    this.watchId = null; const s = this.track ? this.track.summary(movingSec) : null; this.track = null; this.state = 'off';
    return s;
  }
};

/* ---------- motion rep counter (beta) ---------- */
export const motion = {
  det: null, on: false, onRep: null, handler: null,
  supported: () => 'DeviceMotionEvent' in self,
  /** Must be called from a tap (iOS asks for permission). */
  async start() {
    if (!this.supported()) throw new Error('This device does not expose motion sensors to the browser.');
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') throw new Error('Motion permission was not granted.');
    }
    this.det = new RepDetector(); this.on = true;
    let got = false;
    this.handler = (e) => {
      const a = e.accelerationIncludingGravity; if (!a) return; got = true;
      if (this.det.push(a.x, a.y, a.z, e.timeStamp || performance.now())) { buzz(30); this.onRep && this.onRep(this.det.count); }
    };
    self.addEventListener('devicemotion', this.handler);
    await new Promise((r) => setTimeout(r, 1200));
    if (!got) { this.stop(); throw new Error('No motion data. Open the app on your phone to count reps.'); }
  },
  stop() { if (this.handler) self.removeEventListener('devicemotion', this.handler); this.handler = null; this.on = false; },
  get count() { return this.det ? this.det.count : 0; }
};

/* ---------- spoken cues (optional) ---------- */
const PREF = 'bt:prefs';
export const prefs = (() => { try { return { focus: true, voice: false, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { focus: true, voice: false }; } })();
export function setPref(k, v) { prefs[k] = v; try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch { /* private mode */ } }
export const canSpeak = () => isApp || (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function');
export function speak(text, force = false) {
  if (!(prefs.voice || force) || !canSpeak() || !text) return;
  if (isApp) { speakNative(text); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
