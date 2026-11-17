// Small pure helpers shared by the app and the tests.
export const DAY = 864e5;
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/** Local-calendar day key, e.g. 2026-11-17. */
export function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** Local midnight for a day key. */
export function fromKey(k) { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); }
export function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; }
/** Whole calendar days between two instants (DST-safe). */
export function daysBetween(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }
export function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d; }

export function fmtDur(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
export function fmtMin(s) { const m = Math.round((s || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
export function fmtDate(t) { const d = new Date(t); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function fmtShort(t) { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function fmtPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '–';
  let m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${pad(s)}`;
}
export function fmtAgo(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmtDate(t);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const gid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const round1 = (v) => Math.round(v * 10) / 10;
