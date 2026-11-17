// Small dependency-free SVG charts, styled by CSS tokens.
import { esc, MONTHS, dayKey, addDays, DAYS } from './util.js';
import { routePath } from './gpsmath.js';

function niceMax(m) { if (m <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
const dLabel = (x) => { const d = new Date(x); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export function barChart({ labels, series, unit = '', label = '' }) {
  const W = 420, H = 150, pl = 38, pr = 10, pt = 18, pb = 24, n = labels.length;
  const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = niceMax(Math.max(...tot, 0.0001)); const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const cw = (W - pl - pr) / n, bw = Math.min(22, cw * 0.64); let g = '';
  for (let k = 0; k <= 4; k++) { const v = (max * k) / 4; g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}</text>`; }
  const every = Math.ceil(n / 5);
  labels.forEach((lb, i) => {
    let acc = 0; const x = pl + cw * i + (cw - bw) / 2;
    series.forEach((s) => { const v = s.values[i] || 0; if (v > 0) g += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${Math.max(1, y(acc) - y(acc + v))}" rx="3" fill="${s.color}"${i === n - 1 ? '' : ' opacity=".8"'}/>`; acc += v; });
    if (i % every === 0 || i === n - 1) g += `<text class="ax" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`;
  });
  if (tot[n - 1] > 0) g += `<text class="lbl" x="${pl + cw * (n - 1) + cw / 2}" y="${y(tot[n - 1]) - 5}" text-anchor="end">${+tot[n - 1].toFixed(1)}${unit}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

/** series: [{pts:[{x,y}], color, name}] — the first series is labelled at its endpoint. */
export function lineChart({ series, fmt = (v) => v, invert = false, label = '', zero = false, empty = 'Needs two or more logged sessions to draw a trend.' }) {
  const all = series.flatMap((s) => s.pts);
  if (series[0].pts.length < 2) return `<p class="empty">${esc(empty)}</p>`;
  const W = 420, H = 150, pl = 42, pr = 12, pt = 20, pb = 24;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) x1 = x0 + 1;
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const py = (y1 - y0) * 0.15 || 1; y0 -= py; y1 += py; if (zero) y0 = Math.min(0, y0);
  const X = (x) => pl + ((W - pl - pr) * (x - x0)) / (x1 - x0);
  const Y = (v) => { const f = (v - y0) / (y1 - y0); return pt + (H - pt - pb) * (invert ? f : 1 - f); };
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = y0 + ((y1 - y0) * k) / 4; g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`; }
  if (zero && y0 < 0 && y1 > 0) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
  [x0, (x0 + x1) / 2, x1].forEach((x, i) => { g += `<text class="ax" x="${X(x)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${dLabel(x)}</text>`; });
  series.forEach((s, si) => {
    if (s.pts.length < 2) return;
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (si === 0 && !s.noArea) { const base = invert ? pt : H - pb; g += `<path d="${d}L${X(s.pts[s.pts.length - 1].x)},${base}L${X(s.pts[0].x)},${base}Z" fill="${s.color}" opacity=".12"/>`; }
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${si === 0 ? 2.5 : 2}" stroke-linejoin="round"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
    if (s.dots !== false && s.pts.length < 60) s.pts.forEach((p, i) => { const L = i === s.pts.length - 1; if (L || si === 0) g += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${L ? 4.5 : 2.2}" fill="${s.color}"${L ? ' stroke="var(--surface)" stroke-width="2"' : ''}/>`; });
  });
  const lp = series[0].pts[series[0].pts.length - 1];
  g += `<text class="lbl" x="${X(lp.x) - 8}" y="${Y(lp.y) - 10}" text-anchor="end">${esc(fmt(lp.y))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

export function heatmap(real, weekStartFn, weekStart, nw = 16, now = Date.now()) {
  const cur = weekStartFn(now), start = addDays(cur, -7 * (nw - 1));
  const by = {}; for (const s of real) { const k = dayKey(s.date); (by[k] = by[k] || new Set()).add(s.kind); }
  const c = 15, gp = 4, W = 34 + nw * (c + gp), H = 7 * (c + gp) + 18; let g = ''; const today = dayKey(now);
  for (let r = 0; r < 7; r += 2) g += `<text class="ax" x="0" y="${r * (c + gp) + c - 3}">${DAYS[(weekStart + r) % 7]}</text>`;
  for (let w = 0; w < nw; w++) for (let r = 0; r < 7; r++) {
    const d = addDays(start, w * 7 + r); const k = dayKey(d); if (+d > now && k !== today) continue;
    const x = 34 + w * (c + gp), y = r * (c + gp); const s = by[k];
    const fill = !s ? 'var(--surface-2)' : s.has('test') ? 'var(--warn)' : s.has('run') && !s.has('str') ? 'var(--track)' : 'var(--bar)';
    g += `<rect x="${x}" y="${y}" width="${c}" height="${c}" rx="3" fill="${fill}"/>`;
    if (s && s.has('str') && s.has('run')) g += `<rect x="${x}" y="${y + c / 2}" width="${c}" height="${c / 2}" rx="2" fill="var(--track)"/>`;
    if (k === today) g += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${c + 3}" height="${c + 3}" rx="4" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    if (r === 0 && w % 4 === 0) g += `<text class="ax" x="${x}" y="${H - 2}">${dLabel(d)}</text>`;
  }
  return `<div class="scroll"><svg class="chart" style="min-width:${W}px;max-width:${Math.round(W * 1.6)}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Training days, last ${nw} weeks">${g}</svg></div>`;
}

export function routeSVG(route, h = 140) {
  const W = 320; const d = routePath(route, W, h);
  if (!d) return '';
  const first = route[0];
  return `<svg class="chart route" viewBox="0 0 ${W} ${h}" role="img" aria-label="Route map"><path d="${d}" fill="none" stroke="var(--track)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${first ? '' : ''}</svg>`;
}
