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
  supported: () => 'geolocation' in navigator,
  start(restore) {
    if (!this.supported()) { this.state = 'error'; this.error = 'This device has no GPS access in the browser.'; return; }
    this.track = new GpsTrack();
    if (restore) Object.assign(this.track, restore, { anchor: null, recent: [] });
    this.state = 'waiting'; this.error = '';
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
    if (this.watchId != null) { try { navigator.geolocation.clearWatch(this.watchId); } catch { /* ignore */ } }
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
