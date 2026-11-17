// Rep detection from the phone's accelerometer (phone in a pocket or held against the body).
// Pure signal processing; tested in tests/reps.test.mjs.
//
// Pipeline on |a| (m/s², gravity included, orientation independent):
//   1. slow EMA removes gravity / posture (high-pass, ~2 s)
//   2. fast EMA smooths sensor noise (low-pass, ~70 ms)
//   3. adaptive threshold = k × running RMS of the filtered signal
//   4. a rep = an excursion past +th then −th (or the reverse), with a refractory period.

export class RepDetector {
  constructor({ minRepMs = 700, maxRepMs = 8000, k = 0.6, floor = 0.35 } = {}) {
    Object.assign(this, { minRepMs, maxRepMs, k, floor });
    this.reset();
  }
  reset() {
    this.base = null; this.lp = 0; this.ms = 0.25; this.armed = false; this.pol = 0; this.armT = 0; this.lastRepT = -Infinity; this.count = 0; this.n = 0; this.lastT = null;
  }
  /** Feed one sample; returns true when a rep was counted. */
  push(ax, ay, az, t) {
    if (![ax, ay, az, t].every(Number.isFinite)) return false;
    const mag = Math.hypot(ax, ay, az);
    const dt = this.lastT == null ? 16 : Math.min(200, Math.max(1, t - this.lastT)); this.lastT = t;
    if (this.base == null) { this.base = mag; return false; }
    const aSlow = 1 - Math.exp(-dt / 2000), aFast = 1 - Math.exp(-dt / 70), aRms = 1 - Math.exp(-dt / 4000);
    this.base += aSlow * (mag - this.base);
    this.lp += aFast * (mag - this.base - this.lp);
    this.ms += aRms * (this.lp * this.lp - this.ms);
    this.n++;
    if (this.n < 30) return false; // let the filters settle
    const th = Math.max(this.floor, this.k * Math.sqrt(this.ms));
    // One rep = an excursion past the threshold on one side followed by the other side,
    // whichever comes first (depends on how the phone sits).
    const side = this.lp > th ? 1 : this.lp < -th ? -1 : 0;
    if (!side) return false;
    if (this.pol === 0) this.pol = side; // the first excursion fixes the rep's direction
    if (!this.armed) { if (side === this.pol) { this.armed = true; this.armT = t; } return false; }
    if (side === this.pol) { this.armT = t; return false; }
    this.armed = false;
    if (t - this.lastRepT >= this.minRepMs && t - this.armT <= this.maxRepMs) { this.count++; this.lastRepT = t; return true; }
    return false;
  }
}
