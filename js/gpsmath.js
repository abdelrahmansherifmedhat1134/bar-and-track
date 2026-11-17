// GPS track filtering and running metrics. Pure; tested in tests/gps.test.mjs.

const R = 6371008.8; // mean Earth radius, m
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Accumulates distance from noisy fixes.
 * - rejects fixes worse than maxAcc metres
 * - rejects jumps faster than maxSpeed m/s (GPS spikes)
 * - ignores moves shorter than the combined accuracy jitter, so standing still adds ~0 m
 * - optionally attributes each segment to the current phase ('run' | 'walk')
 */
export class GpsTrack {
  constructor({ maxAcc = 35, maxSpeed = 8, minMove = 3 } = {}) {
    Object.assign(this, { maxAcc, maxSpeed, minMove });
    this.dist = 0; this.byPhase = { run: 0, walk: 0 }; this.phase = 'run';
    this.anchor = null; this.route = []; this.splits = []; this.splitStartT = null; this.lastFix = null; this.recent = [];
    this.accepted = 0; this.rejected = 0;
  }
  setPhase(p) { this.phase = p === 'walk' ? 'walk' : 'run'; }
  /** fix: {lat, lon, acc, t (ms)}; returns true when it moved the track. */
  add(fix) {
    if (!fix || !isFinite(fix.lat) || !isFinite(fix.lon)) return false;
    if (fix.acc != null && fix.acc > this.maxAcc) { this.rejected++; return false; }
    this.lastFix = fix;
    if (!this.anchor) { this.anchor = fix; this.splitStartT = fix.t; this.route.push([+fix.lat.toFixed(6), +fix.lon.toFixed(6), fix.t]); this.accepted++; return true; }
    const d = haversine(this.anchor.lat, this.anchor.lon, fix.lat, fix.lon);
    const dt = Math.max(0.001, (fix.t - this.anchor.t) / 1000);
    if (d / dt > this.maxSpeed && d > 25) { this.rejected++; return false; }
    const jitter = Math.max(this.minMove, ((this.anchor.acc || 0) + (fix.acc || 0)) * 0.25);
    if (d < jitter) return false;
    const before = this.dist;
    this.dist += d; this.byPhase[this.phase] += d; this.accepted++;
    this.recent.push({ t: fix.t, d: this.dist }); while (this.recent.length > 2 && fix.t - this.recent[0].t > 30000) this.recent.shift();
    // kilometre splits, interpolated inside the segment
    let kmMark = (this.splits.length + 1) * 1000;
    while (this.dist >= kmMark) {
      const frac = (kmMark - before) / d; const tCross = this.anchor.t + frac * (fix.t - this.anchor.t);
      this.splits.push(Math.round((tCross - this.splitStartT) / 1000)); this.splitStartT = tCross;
      kmMark += 1000;
    }
    const lastR = this.route[this.route.length - 1];
    if (!lastR || haversine(lastR[0], lastR[1], fix.lat, fix.lon) >= 10) this.route.push([+fix.lat.toFixed(6), +fix.lon.toFixed(6), fix.t]);
    if (this.route.length > 3000) this.route = this.route.filter((_, i) => i % 2 === 0);
    this.anchor = fix;
    return true;
  }
  /** Pace over the last ~30 s, seconds per km (null if not moving). */
  currentPace() {
    if (this.recent.length < 2) return null;
    const a = this.recent[0], b = this.recent[this.recent.length - 1];
    const dd = b.d - a.d, dt = (b.t - a.t) / 1000;
    if (dd < 15 || dt < 5) return null;
    return dt / (dd / 1000);
  }
  summary(movingSec) {
    const km = this.dist / 1000;
    return { km: Math.round(km * 1000) / 1000, runKm: Math.round(this.byPhase.run) / 1000, walkKm: Math.round(this.byPhase.walk) / 1000,
      pace: km > 0.05 && movingSec ? movingSec / km : null, splits: this.splits.slice(), route: this.route.slice() };
  }
}

/** Projects a route to SVG points inside w×h with padding. */
export function routePath(route, w, h, pad = 8) {
  if (!route || route.length < 2) return '';
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const lat0 = Math.min(...lats), lat1 = Math.max(...lats), lon0 = Math.min(...lons), lon1 = Math.max(...lons);
  const k = Math.cos(rad((lat0 + lat1) / 2));
  const spanX = Math.max(1e-9, (lon1 - lon0) * k), spanY = Math.max(1e-9, lat1 - lat0);
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
  return route.map((p, i) => `${i ? 'L' : 'M'}${(ox + (p[1] - lon0) * k * s).toFixed(1)},${(oy + (lat1 - p[0]) * s).toFixed(1)}`).join('');
}
