// Animated exercise demos: a jointed stick figure (side view, facing right) moved between key
// poses. Poses are joint angles, so limbs keep their length; one joint is pinned (hands on the
// bar, feet on the floor) so contact points stay put. No images, works offline.

const LEN = { torso: 46, neck: 13, head: 8, ua: 26, fa: 24, th: 36, sh: 34, foot: 10 };
const W = 240, H = 210, FLOOR = 200;
const rad = (d) => (d * Math.PI) / 180;
const vec = (a, l) => [Math.cos(rad(a)) * l, Math.sin(rad(a)) * l];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];

/** Forward kinematics. Angles are absolute, in degrees: 0 = right, 90 = down, -90 = up. */
function solve(p) {
  const hip = [0, 0];
  const shoulder = add(hip, vec(p.t, LEN.torso));
  const hd = p.hd ?? p.t;
  const neck = add(shoulder, vec(hd, LEN.neck));
  const head = add(shoulder, vec(hd, LEN.neck + LEN.head));
  const elbowA = add(shoulder, vec(p.ua, LEN.ua)), handA = add(elbowA, vec(p.fa, LEN.fa));
  const elbowB = add(shoulder, vec(p.ub ?? p.ua, LEN.ua)), handB = add(elbowB, vec(p.fb ?? p.fa, LEN.fa));
  const kneeA = add(hip, vec(p.th, LEN.th)), ankleA = add(kneeA, vec(p.sh, LEN.sh)), toeA = add(ankleA, vec(p.ft ?? p.sh - 90, LEN.foot));
  const sbb = p.sb ?? p.sh;
  const kneeB = add(hip, vec(p.tb ?? p.th, LEN.th)), ankleB = add(kneeB, vec(sbb, LEN.sh)), toeB = add(ankleB, vec(p.ftb ?? (p.sb != null ? sbb - 90 : p.ft ?? sbb - 90), LEN.foot));
  return { hip, shoulder, neck, head, elbowA, handA, elbowB, handB, kneeA, ankleA, toeA, kneeB, ankleB, toeB };
}

const S = { t: -90, ua: 84, fa: 87, ub: 96, fb: 93, th: 90, sh: 90 }; // standing, arms just off the torso
const HANG0 = { t: -92, hd: -66, ua: -90, fa: -90, th: 86, sh: 97 };
const PUSH0 = { t: -24, ua: 90, fa: 90, th: 162, sh: 164 };

/* Each demo: anchor [joint, x, y], props, hold (things in hands), frames (2+ poses), ms per cycle. */
export const DEMOS = {
  genwarm: { anchor: ['hip', 120, 128], frames: [
    { t: -85, ua: 25, fa: -65, ub: 150, fb: 80, th: 15, sh: 100, tb: 95, sb: 110 },
    { t: -85, ua: 150, fa: 80, ub: 25, fb: -65, th: 95, sh: 110, tb: 15, sb: 100 }], ms: 900 },
  pullup: { anchor: ['handA', 125, 26], props: [{ bar: 26 }], frames: [HANG0, { t: -97, hd: -70, ua: 52, fa: -106, th: 80, sh: 100 }] },
  chinup: { anchor: ['handA', 125, 26], props: [{ bar: 26 }], frames: [HANG0, { t: -95, hd: -70, ua: 60, fa: -100, th: 82, sh: 98 }] },
  scappull: { anchor: ['handA', 125, 26], props: [{ bar: 26 }], frames: [HANG0, { t: -80, hd: -62, ua: -96, fa: -90, th: 84, sh: 97 }], ms: 2000 },
  hkr: { anchor: ['handA', 125, 26], props: [{ bar: 26 }], frames: [HANG0, { t: -102, hd: -70, ua: -88, fa: -90, th: -25, sh: 85 }] },
  hlr: { anchor: ['handA', 125, 26], props: [{ bar: 26 }], frames: [HANG0, { t: -106, hd: -72, ua: -88, fa: -90, th: -2, sh: -2, ft: -92 }] },
  dip: { anchor: ['handA', 125, 106], props: [{ dips: 106 }], frames: [{ t: -95, ua: 90, fa: 90, th: 100, sh: 150 }, { t: -70, ua: 165, fa: 90, th: 108, sh: 155 }] },
  pushup: { anchor: ['handA', 160, 198], frames: [PUSH0, { t: -11, ua: 128, fa: 58, th: 162, sh: 165 }] },
  diamond: { anchor: ['handA', 160, 198], frames: [PUSH0, { t: -12, ua: 120, fa: 62, th: 162, sh: 165 }] },
  scappush: { anchor: ['handA', 160, 198], frames: [PUSH0, { t: -30, ua: 90, fa: 90, th: 160, sh: 162 }], ms: 2000 },
  pike: { anchor: ['handA', 150, 198], frames: [{ t: 40, hd: 65, ua: 92, fa: 90, th: 100, sh: 100 }, { t: 52, hd: 80, ua: 140, fa: 55, th: 98, sh: 98 }] },
  pikeel: { anchor: ['handA', 160, 198], props: [{ box: [40, 146, 70, 54] }], frames: [{ t: 85, hd: 90, ua: 92, fa: 90, th: 145, sh: 145, ft: 150 }, { t: 85, hd: 100, ua: 140, fa: 55, th: 140, sh: 140, ft: 145 }] },
  invrow: { anchor: ['handA', 150, 112], props: [{ lowbar: [150, 112] }], frames: [{ t: -28, ua: -78, fa: -85, th: 166, sh: 168, ft: 80 }, { t: -42, ua: -165, fa: -35, th: 158, sh: 160, ft: 75 }] },
  invrowfe: { anchor: ['handA', 150, 112], props: [{ lowbar: [150, 112] }, { box: [0, 172, 60, 28] }], frames: [{ t: -5, ua: -85, fa: -88, th: 178, sh: 178, ft: 90 }, { t: -12, ua: -165, fa: -35, th: 174, sh: 174, ft: 88 }] },
  platelat: { anchor: ['ankleA', 120, 196], hold: 'plates', frames: [S, { ...S, ua: 8, fa: 4 }] },
  platecurl: { anchor: ['ankleA', 120, 196], hold: 'plates', frames: [S, { ...S, ua: 95, fa: -75 }] },
  splitsq: { anchor: ['ankleA', 150, 196], hold: 'plates', frames: [{ t: -90, ua: 92, fa: 90, th: 78, sh: 98, tb: 118, sb: 100 }, { t: -88, ua: 92, fa: 90, th: 5, sh: 90, tb: 92, sb: 172, ftb: 82 }] },
  stepup: { anchor: ['ankleA', 160, 146], props: [{ box: [130, 150, 80, 50] }], frames: [{ t: -80, ua: 92, fa: 90, th: -5, sh: 95, tb: 100, sb: 95 }, { t: -90, ua: 92, fa: 90, th: 90, sh: 90, tb: 95, sb: 70 }] },
  boxsq: { anchor: ['ankleA', 130, 196], hold: 'chest', props: [{ box: [60, 160, 40, 40] }], frames: [{ ...S, ua: 60, fa: -100 }, { t: -62, ua: 50, fa: -110, th: 5, sh: 95 }] },
  slrdl: { anchor: ['ankleA', 130, 196], hold: 'plates', frames: [S, { t: -8, hd: -5, ua: 92, fa: 90, th: 85, sh: 93, tb: 178, sb: 180, ftb: 90 }] },
  hipthrust: { anchor: ['ankleA', 150, 196], hold: 'hip', props: [{ box: [20, 162, 52, 38] }], frames: [{ t: -158, hd: -170, ua: 160, fa: 170, th: -45, sh: 95 }, { t: 178, hd: 178, ua: 160, fa: 170, th: -2, sh: 92 }] },
  slcurl: { anchor: ['shoulder', 50, 190], frames: [{ t: 165, hd: 180, ua: 175, fa: 180, th: 5, sh: 15, ft: -80 }, { t: 160, hd: 180, ua: 175, fa: 180, th: -45, sh: 70, ft: -60 }] },
  calf: { anchor: ['toeA', 140, 170], props: [{ box: [100, 170, 50, 30] }], frames: [{ ...S, ft: -25 }, { ...S, ft: 55 }], ms: 1800 },
  backext: { anchor: ['hip', 110, 192], frames: [{ t: 0, hd: 0, ua: -150, fa: 20, th: 180, sh: 180, ft: 90 }, { t: -14, hd: -18, ua: -150, fa: 20, th: 172, sh: 170, ft: 80 }] },
  birddog: { anchor: ['kneeB', 100, 198], frames: [{ t: -15, ua: 90, fa: 90, th: 90, sh: 180, ft: 90 }, { t: -15, ua: -5, fa: -5, ub: 90, fb: 90, th: 172, sh: 178, tb: 90, sb: 180, ft: 90, ftb: 90 }] },
  deadbug: { anchor: ['hip', 130, 190], frames: [{ t: 180, hd: 180, ua: -90, fa: -90, th: -90, sh: 0, ft: -90 }, { t: 180, hd: 180, ua: -150, fa: -150, ub: -90, fb: -90, th: -8, sh: -5, tb: -90, sb: 0, ft: -95, ftb: -90 }] },
  sideplank: { anchor: ['handA', 140, 198], frames: [{ t: -18, ua: 90, fa: 0, ub: -60, fb: -60, th: 168, sh: 170, ft: 80 }, { t: -22, ua: 90, fa: 0, ub: -60, fb: -60, th: 166, sh: 168, ft: 78 }], ms: 2400 },
  glutebr: { anchor: ['shoulder', 50, 192], frames: [{ t: 180, hd: 180, ua: 0, fa: 0, th: -50, sh: 75, ft: 0 }, { t: 162, hd: 175, ua: 2, fa: 0, th: -12, sh: 95, ft: 0 }] },
  ytw: { anchor: ['hip', 100, 192], frames: [{ t: -6, hd: -6, ua: -25, fa: -25, th: 180, sh: 180, ft: 90 }, { t: -6, hd: -6, ua: 150, fa: 60, th: 180, sh: 180, ft: 90 }] },
  passthru: { anchor: ['ankleA', 120, 196], hold: 'stick', frames: [{ ...S, ua: 60, fa: 60 }, { ...S, ua: -90, fa: -90 }, { ...S, ua: -125, fa: -128 }, { ...S, ua: -90, fa: -90 }], ms: 3600 }
};
// The test items use the same movements.
const ALIAS = { pull: 'pullup', dip: 'dip', push: 'pushup', row: 'invrow' };
export const hasDemo = (x) => !!(DEMOS[x] || DEMOS[ALIAS[x]]);

const lerpAngle = (a, b, k) => { const d = ((((b - a) % 360) + 540) % 360) - 180; return a + d * k; };
const KEYS = ['t', 'hd', 'ua', 'fa', 'ub', 'fb', 'th', 'sh', 'tb', 'sb', 'ft', 'ftb'];
function poseAt(def, phase) {
  const fr = def.frames, n = fr.length;
  // spend 35% of each segment holding the key pose, 65% moving (eased)
  const seg = phase * n, i = Math.floor(seg) % n, local = seg - Math.floor(seg);
  const k = local < 0.35 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * ((local - 0.35) / 0.65));
  const a = fr[i], b = fr[(i + 1) % n], out = {};
  for (const key of KEYS) {
    const va = a[key] ?? (key === 'hd' ? a.t : undefined), vb = b[key] ?? (key === 'hd' ? b.t : undefined);
    if (va == null && vb == null) continue;
    out[key] = lerpAngle(va ?? vb, vb ?? va, k);
  }
  return out;
}

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; }

function propsSVG(def, g) {
  el('line', { x1: 0, y1: FLOOR, x2: W, y2: FLOOR, class: 'd-floor' }, g);
  for (const p of def.props || []) {
    if (p.bar != null) { el('line', { x1: 70, y1: p.bar, x2: 200, y2: p.bar, class: 'd-bar' }, g); el('line', { x1: 196, y1: p.bar, x2: 196, y2: FLOOR, class: 'd-post' }, g); }
    if (p.dips != null) { el('line', { x1: 92, y1: p.dips, x2: 168, y2: p.dips, class: 'd-bar' }, g); el('line', { x1: 98, y1: p.dips, x2: 98, y2: FLOOR, class: 'd-post' }, g); el('line', { x1: 162, y1: p.dips, x2: 162, y2: FLOOR, class: 'd-post' }, g); }
    if (p.lowbar) { el('line', { x1: p.lowbar[0], y1: p.lowbar[1], x2: p.lowbar[0], y2: FLOOR, class: 'd-post' }, g); el('circle', { cx: p.lowbar[0], cy: p.lowbar[1], r: 5, class: 'd-barend' }, g); }
    if (p.box) { const [x, y, w, h] = p.box; el('rect', { x, y, width: w, height: h, rx: 3, class: 'd-box' }, g); }
  }
}

class Figure {
  constructor(host, x) {
    const key = DEMOS[x] ? x : ALIAS[x]; this.def = DEMOS[key];
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'demo-svg', role: 'img', 'aria-label': 'Animated demonstration' });
    propsSVG(this.def, el('g', {}, svg));
    const g = el('g', {}, svg);
    const limb = (cls) => el('polyline', { class: cls, fill: 'none' }, g);
    this.backArm = limb('d-limb d-back'); this.backLeg = limb('d-limb d-back');
    this.torso = el('line', { class: 'd-torso' }, g); this.neck = el('line', { class: 'd-limb' }, g);
    this.head = el('circle', { r: LEN.head, class: 'd-head' }, g);
    this.frontLeg = limb('d-limb'); this.frontArm = limb('d-limb');
    const hold = this.def.hold;
    this.items = [];
    if (hold === 'plates') this.items.push(['handA', el('circle', { r: 7, class: 'd-plate' }, g)]);
    if (hold === 'chest') this.items.push(['handA', el('circle', { r: 8, class: 'd-plate' }, g)]);
    if (hold === 'hip') this.items.push(['hip', el('circle', { r: 9, class: 'd-plate' }, g)]);
    if (hold === 'stick') this.items.push(['handA', el('circle', { r: 3.5, class: 'd-stick' }, g)]);
    host.replaceChildren(svg);
    this.ms = this.def.ms || 2600; this.t0 = performance.now() - Math.random() * 300;
    this.draw(0);
  }
  draw(phase) {
    const J = solve(poseAt(this.def, phase));
    const [aj, ax, ay] = this.def.anchor; const dx = ax - J[aj][0], dy = ay - J[aj][1];
    const P = (p) => `${(p[0] + dx).toFixed(1)},${(p[1] + dy).toFixed(1)}`;
    const set = (e, pts) => e.setAttribute('points', pts.map(P).join(' '));
    set(this.backArm, [J.shoulder, J.elbowB, J.handB]); set(this.backLeg, [J.hip, J.kneeB, J.ankleB, J.toeB]);
    set(this.frontLeg, [J.hip, J.kneeA, J.ankleA, J.toeA]); set(this.frontArm, [J.shoulder, J.elbowA, J.handA]);
    const L2 = (e, a, b) => { e.setAttribute('x1', (a[0] + dx).toFixed(1)); e.setAttribute('y1', (a[1] + dy).toFixed(1)); e.setAttribute('x2', (b[0] + dx).toFixed(1)); e.setAttribute('y2', (b[1] + dy).toFixed(1)); };
    L2(this.torso, J.hip, J.shoulder); L2(this.neck, J.shoulder, J.neck);
    this.head.setAttribute('cx', (J.head[0] + dx).toFixed(1)); this.head.setAttribute('cy', (J.head[1] + dy).toFixed(1));
    for (const [j, e] of this.items) { e.setAttribute('cx', (J[j][0] + dx).toFixed(1)); e.setAttribute('cy', (J[j][1] + dy + (j === 'handA' && this.def.hold === 'plates' ? 4 : 0)).toFixed(1)); }
  }
  tick(now) { this.draw(((now - this.t0) % this.ms) / this.ms); }
}

/* ---------- mounting & one shared animation loop ---------- */
const live = new Map(); // host element -> Figure
let raf = 0;
const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((ents) => { for (const e of ents) { const f = live.get(e.target); if (f) f.visible = e.isIntersecting; } loop(); }, { rootMargin: '80px' }) : null;
function loop() {
  if (raf) return;
  const step = (now) => {
    raf = 0; let any = false;
    for (const [host, f] of live) {
      if (!host.isConnected) { live.delete(host); io && io.unobserve(host); continue; }
      if (f.visible !== false && !document.hidden && !reduce()) { f.tick(now); any = true; }
    }
    if (any) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
/** Mount demos into every `.demo[data-ex]` under root that doesn't have one yet. */
export function mountDemos(root = document) {
  for (const host of root.querySelectorAll('.demo[data-ex]')) {
    const x = host.dataset.ex; const cur = live.get(host);
    if (cur && cur.x === x) continue;
    if (!hasDemo(x)) { host.hidden = true; continue; }
    const f = new Figure(host, x); f.x = x; f.visible = true;
    if (reduce()) f.draw(0.5 / f.def.frames.length + 0.25); // show the working position
    live.set(host, f); io && io.observe(host);
  }
  loop();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

/* exported for tests */
export const _solve = solve;
export const _poseAt = poseAt;
/** Draw one still frame (phase 0..1 through the cycle) without animating. */
export function renderStill(host, x, phase = 0) { const f = new Figure(host, x); f.draw(phase); return f; }
