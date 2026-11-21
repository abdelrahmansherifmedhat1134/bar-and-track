// Exercise demos: a body-shaped figure (shirt, shorts, shoes) drawn from joint angles, with the
// equipment seen from the angle that shows the movement best. Most movements are side views;
// lateral raises, Y-T-W and the side plank use a front / top view.
// By default a demo is a still picture: the start position, a faint "ghost" of the end position
// and an arrow showing the path. Tapping ▶ plays it for a few seconds with captions, then it stops,
// so nothing animates in the background and the battery is spared.

const W = 300, H = 240, FLOOR = 228;
const LEN = { torso: 50, neck: 10, head: 9.5, ua: 28, fa: 26, th: 40, sh: 38, foot: 13 };
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const vec = (a, l) => [Math.cos(rad(a)) * l, Math.sin(rad(a)) * l];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const lerp = (a, b, k) => a + (b - a) * k;

/** Two-bone IK: angles of the upper and lower segment reaching from p toward target t. */
function ik(p, t, a, b, s) {
  const d0 = sub(t, p), d = Math.min(len(d0), a + b - 0.001), phi = deg(Math.atan2(d0[1], d0[0]));
  const al = deg(Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))));
  const u = phi + s * al, e = add(p, vec(u, a)), f = sub(add(p, vec(phi, d)), e);
  return [u, deg(Math.atan2(f[1], f[0]))];
}
const hipFrom = (shoulder, t) => sub(shoulder, vec(t, LEN.torso));

/* ---------------- side view ---------------- */
/** Pose: r = hip [x,y], t torso angle (hip→shoulder; 0 right, 90 down, -90 up), hd head, ua/fa near arm,
 *  ub/fb far arm, th/sh/ft near leg + foot, tb/sb/ftb far leg; hA/hB/aA/aB = IK targets for hands/ankles;
 *  eA/eB/kA/kB = bend side (+1/-1); sc = shoulder-blade travel. */
function solveSide(p) {
  const hip = p.r, top = add(hip, vec(p.t, LEN.torso));
  const sh = add(hip, vec(p.t, LEN.torso - (p.sc || 0)));
  const hd = p.hd ?? p.t;
  const head = add(top, vec(hd, LEN.neck + LEN.head));
  const [ua, fa] = p.hA ? ik(sh, p.hA, LEN.ua, LEN.fa, p.eA ?? 1) : [p.ua, p.fa];
  const [ub, fb] = p.hB ? ik(sh, p.hB, LEN.ua, LEN.fa, p.eB ?? 1) : p.ub != null ? [p.ub, p.fb] : [ua, fa];
  const [th, shn] = p.aA ? ik(hip, p.aA, LEN.th, LEN.sh, p.kA ?? -1) : [p.th, p.sh];
  const [tb, sb] = p.aB ? ik(hip, p.aB, LEN.th, LEN.sh, p.kB ?? -1) : p.tb != null ? [p.tb, p.sb] : [th, shn];
  const J = { hip, top, sh, head, hd };
  J.elA = add(sh, vec(ua, LEN.ua)); J.hdA = add(J.elA, vec(fa, LEN.fa));
  J.elB = add(sh, vec(ub, LEN.ua)); J.hdB = add(J.elB, vec(fb, LEN.fa));
  J.knA = add(hip, vec(th, LEN.th)); J.anA = add(J.knA, vec(shn, LEN.sh));
  J.knB = add(hip, vec(tb, LEN.th)); J.anB = add(J.knB, vec(sb, LEN.sh));
  const ftA = p.ft ?? shn - 90, ftB = p.ftb ?? (p.tb != null || p.aB ? sb - 90 : ftA);
  J.toA = add(J.anA, vec(ftA, LEN.foot)); J.heA = add(J.anA, vec(ftA + 180, 3));
  J.toB = add(J.anB, vec(ftB, LEN.foot)); J.heB = add(J.anB, vec(ftB + 180, 3));
  J.t = p.t; J.shoulder = sh;
  return J;
}

/* ---------------- front / top view ---------------- */
/** Pose: r = pelvis centre, t = pelvis→neck angle, hd, a1/a2 = one arm, b1/b2 = the other,
 *  l1/l2 and m1/m2 = legs. */
function solveFront(p) {
  const hip = p.r, nk = add(hip, vec(p.t, 46)), perp = vec(p.t + 90, 1);
  const off = (pt, k) => [pt[0] + perp[0] * k, pt[1] + perp[1] * k];
  const sP = off(nk, 17), sM = off(nk, -17), hP = off(hip, 9), hM = off(hip, -9);
  const head = add(nk, vec(p.hd ?? p.t, 19));
  const J = { hip, nk, sP, sM, hP, hM, head, t: p.t };
  J.eP = add(sP, vec(p.a1, LEN.ua)); J.wP = add(J.eP, vec(p.a2 ?? p.a1, LEN.fa));
  J.eM = add(sM, vec(p.b1, LEN.ua)); J.wM = add(J.eM, vec(p.b2 ?? p.b1, LEN.fa));
  J.kP = add(hP, vec(p.l1, LEN.th)); J.fP = add(J.kP, vec(p.l2 ?? p.l1, LEN.sh));
  J.kM = add(hM, vec(p.m1, LEN.th)); J.fM = add(J.kM, vec(p.m2 ?? p.m1, LEN.sh));
  J.shoulder = sP;
  return J;
}

/* ---------------- poses ---------------- */
const KEYS = ['t', 'hd', 'ua', 'fa', 'ub', 'fb', 'th', 'sh', 'ft', 'tb', 'sb', 'ftb', 'sc', 'a1', 'a2', 'b1', 'b2', 'l1', 'l2', 'm1', 'm2'];
const PTS = ['r', 'hA', 'hB', 'aA', 'aB'];
function mix(a, b, k) {
  const o = { ...a };
  for (const key of KEYS) if (a[key] != null || b[key] != null) {
    const va = a[key] ?? (key === 'hd' ? a.t : key === 'sc' ? 0 : b[key]), vb = b[key] ?? (key === 'hd' ? b.t : key === 'sc' ? 0 : a[key]);
    o[key] = lerp(va, vb, k);
  }
  for (const key of PTS) if (a[key] && b[key]) o[key] = [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)];
  return o;
}

const BAR = [165, 34];
const hang = (x = {}) => ({ r: hipFrom([160, 88], -91), t: -91, hd: -84, hA: BAR, hB: [BAR[0] - 2, BAR[1]], th: 78, sh: 86, ft: 58, tb: 80, sb: 88, ftb: 60, ...x });
const pullTop = (x = {}) => ({ r: hipFrom([143, 50], -103), t: -103, hd: -78, hA: BAR, hB: [BAR[0] - 2, BAR[1]], eA: 1, eB: 1, th: 70, sh: 82, ft: 52, tb: 72, sb: 84, ftb: 54, ...x });
const DIPH = [172, 112];
const plank = (sx, sy, a, x = {}) => ({ r: hipFrom([sx, sy], a), t: a, hd: a + 8, th: a + 180, sh: a + 180, ft: a + 180 - 62, ...x });
const PP = [212, 212];
const STAND = { t: -90, hd: -90, ua: 96, fa: 92, ub: 86, fb: 88, th: 90, sh: 90, tb: 92, sb: 90 };
const htA = (s, t) => { const h = hipFrom(s, t); return [h[0], h[1] - 8]; };

export const DEMOS = {
  genwarm: { frames: [
    { p: { ...STAND, r: [150, 146], hd: -88, ua: 118, fa: 40, ub: 62, fb: -28, th: 60, sh: 110, tb: 92, sb: 92, ft: 30 }, hold: 0, move: 0.35, cap: 'Easy jog on the spot, low knees' },
    { p: { ...STAND, r: [150, 146], hd: -88, ua: 62, fa: -28, ub: 118, fb: 40, th: 92, sh: 92, tb: 60, sb: 110, ftb: 30 }, hold: 0, move: 0.35, cap: 'Soft landings, no jumping' }],
    pin: ['ground'], track: 'knA', play: 5 },
  pullup: { props: [{ bar: BAR }], frames: [
    { p: hang(), hold: 0.6, move: 1.0, cap: 'Dead hang, shoulders pulled down' },
    { p: pullTop(), hold: 0.5, move: 2.6, cap: 'Elbows to ribs, chin over the bar' }], track: 'head', mcap: ['Pull', 'Lower slowly, about 3 s'] },
  chinup: { props: [{ bar: BAR }], frames: [
    { p: hang({ hd: -86 }), hold: 0.6, move: 1.0, cap: 'Palms facing you, full hang' },
    { p: pullTop({ r: hipFrom([146, 54], -100), t: -100 }), hold: 0.5, move: 2.4, cap: 'Chest up to the bar, ribs down' }], track: 'head', mcap: ['Pull', 'Lower in 2–3 s'] },
  scappull: { props: [{ bar: BAR }], frames: [
    { p: hang({ hd: -80 }), hold: 0.6, move: 0.8, cap: 'Relaxed hang, arms straight' },
    { p: hang({ r: hipFrom([160, 88], -95), t: -95, hd: -86, sc: -10 }), hold: 0.8, move: 1.0, cap: 'Shoulders down and back, elbows stay straight' }], track: 'head' },
  hkr: { props: [{ bar: BAR }], frames: [
    { p: hang(), hold: 0.5, move: 1.0, cap: 'Dead hang, shoulders engaged' },
    { p: hang({ r: hipFrom([159, 88], -100), t: -100, th: -28, sh: 80, ft: 40, tb: -26, sb: 82, ftb: 42 }), hold: 0.5, move: 1.6, cap: 'Knees to chest, pelvis curls up' }], track: 'knA' },
  hlr: { props: [{ bar: BAR }], frames: [
    { p: hang(), hold: 0.5, move: 1.2, cap: 'Dead hang, legs together' },
    { p: hang({ r: hipFrom([158, 88], -104), t: -104, th: -4, sh: -4, ft: -30, tb: -2, sb: -2, ftb: -28 }), hold: 0.5, move: 2.0, cap: 'Straight legs to hip height' }], track: 'anA' },
  dip: { props: [{ dips: [118, 228, DIPH[1]] }], frames: [
    { p: { r: hipFrom([168, 59], -80), t: -80, hd: -82, hA: DIPH, hB: [DIPH[0] - 2, DIPH[1]], th: 102, sh: 150, ft: 165, tb: 108, sb: 160, ftb: 170 }, hold: 0.6, move: 2.4, cap: 'Locked out, shoulders down away from the ears' },
    { p: { r: hipFrom([180, 91], -58), t: -58, hd: -55, hA: DIPH, hB: [DIPH[0] - 2, DIPH[1]], th: 112, sh: 165, ft: 175, tb: 118, sb: 172, ftb: 178 }, hold: 0.3, move: 1.0, cap: 'Lean forward, upper arm parallel, elbows back' }], track: 'shoulder', mcap: ['Lower in 2–3 s', 'Press up'] },
  pushup: { props: [{ pbars: PP }], frames: [
    { p: plank(206, 162, -22, { hA: PP, hB: [PP[0] - 2, PP[1]] }), hold: 0.4, move: 1.6, cap: 'One straight line, glutes and abs tight' },
    { p: plank(212, 197, -8, { hA: PP, hB: [PP[0] - 2, PP[1]] }), hold: 0.3, move: 1.0, cap: 'Chest between the handles, elbows about 45°' }], track: 'shoulder', mcap: ['Lower with control', 'Push the floor away'] },
  diamond: { frames: [
    { p: plank(196, 172, -21, { hA: [192, 225], hB: [190, 225] }), hold: 0.4, move: 1.6, cap: 'Hands together under the chest' },
    { p: plank(200, 203, -7, { hA: [192, 225], hB: [190, 225] }), hold: 0.3, move: 1.0, cap: 'Elbows brush the ribs on the way down' }], track: 'shoulder', mcap: ['Lower', 'Lock out fully'] },
  scappush: { frames: [
    { p: plank(196, 172, -21, { hA: [198, 225], hB: [196, 225] }), hold: 0.5, move: 1.0, cap: 'Push-up position, arms straight' },
    { p: plank(196, 172, -21, { hA: [198, 225], hB: [196, 225], r: hipFrom([196, 180], -18), t: -18, sc: -7 }), hold: 0.6, move: 1.0, cap: 'Chest sinks between the shoulder blades' },
    { p: plank(196, 172, -21, { hA: [198, 225], hB: [196, 225], r: hipFrom([196, 172], -22), t: -22, sc: 5 }), hold: 0.6, move: 1.0, cap: 'Push the floor away, upper back rounds' }], track: 'top' },
  pike: { frames: [
    { p: { r: [118, 146], t: 48, hd: 60, hA: [180, 225], hB: [178, 225], aA: [100, 221], aB: [98, 221], ft: 100, ftb: 100 }, hold: 0.4, move: 1.8, cap: 'Hips high, arms straight, head between the arms' },
    { p: { r: [140, 155], t: 28, hd: 80, hA: [180, 225], hB: [178, 225], aA: [100, 221], aB: [98, 221], ft: 100, ftb: 100 }, hold: 0.3, move: 1.2, cap: 'Head travels forward of the hands, elbows back' }], track: 'head', mcap: ['Lower slowly', 'Press back up'] },
  pikeel: { props: [{ box: [52, 172, 70, 56] }], frames: [
    { p: { r: [166, 126], t: 96, hd: 96, hA: [176, 225], hB: [174, 225], aA: [100, 166], aB: [98, 166], kA: 1, kB: 1, ft: 180, ftb: 180 }, hold: 0.4, move: 1.8, cap: 'Feet on the chair, hips over the shoulders' },
    { p: { r: [166, 142], t: 78, hd: 70, hA: [176, 225], hB: [174, 225], aA: [100, 166], aB: [98, 166], kA: 1, kB: 1, ft: 180, ftb: 180 }, hold: 0.3, move: 1.2, cap: 'Head to the floor just in front of the hands' }], track: 'head', mcap: ['Lower with control', 'Press up'] },
  invrow: { props: [{ lowbar: [138, 159] }], frames: [
    { p: { r: hipFrom([114, 205], 187), t: 187, hd: 184, hA: [138, 159], hB: [136, 159], eA: 1, eB: 1, aA: [236, 219], aB: [234, 219], kA: 1, kB: 1 }, hold: 0.4, move: 1.0, cap: 'Body straight, heels down, arms long' },
    { p: { r: hipFrom([124, 158], 208), t: 208, hd: 206, hA: [138, 159], hB: [136, 159], eA: 1, eB: 1, aA: [236, 219], aB: [234, 219], kA: 1, kB: 1 }, hold: 1.0, move: 1.6, cap: 'Chest to the bar, squeeze the shoulder blades 1 s' }], track: 'top', mcap: ['Pull', 'Lower under control'] },
  invrowfe: { props: [{ lowbar: [130, 141] }, { box: [214, 176, 70, 52] }], frames: [
    { p: { r: hipFrom([113, 190], 172), t: 172, hd: 172, hA: [130, 141], hB: [128, 141], eA: 1, eB: 1, aA: [240, 172], aB: [238, 172], kA: 1, kB: 1 }, hold: 0.4, move: 1.0, cap: 'Feet up so the body is level' },
    { p: { r: hipFrom([116, 140], 194), t: 194, hd: 196, hA: [130, 141], hB: [128, 141], eA: 1, eB: 1, aA: [240, 172], aB: [238, 172], kA: 1, kB: 1 }, hold: 1.0, move: 1.6, cap: 'Chest to the bar, 1 s squeeze' }], track: 'top', mcap: ['Pull', 'Lower'] },
  platelat: { view: 'front', hold: 'plates', frames: [
    { p: { r: [150, 146], t: -90, a1: 80, a2: 84, b1: 100, b2: 96, l1: 87, m1: 93 }, hold: 0.5, move: 1.2, cap: 'Plates at your sides, slight elbow bend' },
    { p: { r: [150, 146], t: -90, a1: 2, a2: 8, b1: 178, b2: 172, l1: 87, m1: 93 }, hold: 0.5, move: 2.0, cap: 'Raise to shoulder height, lead with the elbows' }], track: 'wP', mcap: ['Raise', 'Lower slowly'] },
  splitsq: { hold: 'side', frames: [
    { p: { ...STAND, r: [136, 154], ua: 92, fa: 90, aA: [172, 224], aB: [100, 216], ft: 0, ftb: 38 }, hold: 0.4, move: 1.8, cap: 'Long stance, torso tall' },
    { p: { ...STAND, r: [136, 186], ua: 92, fa: 90, aA: [172, 224], aB: [100, 216], ft: 0, ftb: 38 }, hold: 0.3, move: 1.2, cap: 'Back knee straight down; front knee over the toes' }], track: 'hip', mcap: ['Lower', 'Drive up through the front foot'] },
  stepup: { props: [{ box: [132, 184, 74, 44] }], frames: [
    { p: { ...STAND, r: [124, 148], t: -80, hd: -84, ua: 100, fa: 95, aA: [162, 180], aB: [110, 224], ft: 0, ftb: 0 }, hold: 0.4, move: 1.4, cap: 'Whole front foot on the box (knee height or lower)' },
    { p: { ...STAND, r: [160, 104], aA: [162, 180], aB: [150, 170], ft: 0, ftb: 40 }, hold: 0.3, move: 2.0, cap: 'Stand tall on the box, then step down slowly' }], track: 'hip' },
  boxsq: { hold: 'chest', props: [{ box: [70, 186, 46, 42] }], frames: [
    { p: { ...STAND, r: [150, 147], ua: 64, fa: -78, ub: 60, fb: -82, aA: [152, 224], aB: [150, 224], ft: 0, ftb: 0 }, hold: 0.4, move: 1.8, cap: 'Plate at the chest, feet shoulder-width' },
    { p: { ...STAND, r: [112, 182], t: -58, hd: -64, ua: 40, fa: -92, ub: 36, fb: -96, aA: [152, 224], aB: [150, 224], ft: 0, ftb: 0 }, hold: 0.4, move: 1.2, cap: 'Sit back, touch the box lightly, knees over the toes' }], track: 'hip', mcap: ['Sit back', 'Stand up'] },
  slrdl: { hold: 'hands', frames: [
    { p: { ...STAND, r: [150, 148], aB: [150, 224], ftb: 0, th: 94, sh: 92, ft: 30 }, hold: 0.4, move: 2.0, cap: 'Stand on one leg, soft knee' },
    { p: { ...STAND, r: [140, 152], t: -8, hd: -12, ua: 92, fa: 94, ub: 90, fb: 92, aB: [150, 224], ftb: 0, th: 176, sh: 178, ft: 90 }, hold: 0.6, move: 1.6, cap: 'Hinge: back flat, free leg goes back, stop at the stretch' }], track: 'head', mcap: ['Hinge at the hip', 'Stand up, squeeze the glute'] },
  hipthrust: { hold: 'hip', props: [{ box: [26, 174, 64, 54] }], frames: [
    { p: { r: hipFrom([88, 172], 226), t: 226, hd: 236, aA: [192, 224], aB: [190, 224], kA: -1, kB: -1, ft: 2, ftb: 2, hA: htA([88, 172], 226), hB: htA([88, 172], 226), eA: -1, eB: -1 }, hold: 0.4, move: 1.0, cap: 'Upper back on the bench, plate on the hips' },
    { p: { r: hipFrom([88, 172], 182), t: 182, hd: 196, aA: [192, 224], aB: [190, 224], kA: -1, kB: -1, ft: 2, ftb: 2, hA: htA([88, 172], 182), hB: htA([88, 172], 182), eA: -1, eB: -1 }, hold: 1.0, move: 1.6, cap: 'Hips level, chin tucked, squeeze 1 s' }], track: 'hip', mcap: ['Drive up through the heels', 'Lower'] },
  glutebr: { frames: [
    { p: { r: hipFrom([78, 216], 180), t: 180, hd: 180, ua: 8, fa: 2, ub: 6, fb: 0, aA: [176, 222], aB: [174, 222], kA: 1, kB: 1, ft: 4, ftb: 4 }, hold: 0.4, move: 1.0, cap: 'On your back, feet flat, knees bent' },
    { p: { r: hipFrom([78, 216], 158), t: 158, hd: 172, ua: 8, fa: 2, ub: 6, fb: 0, aA: [176, 222], aB: [174, 222], kA: 1, kB: 1, ft: 4, ftb: 4 }, hold: 1.0, move: 1.4, cap: 'Drive through the heels, squeeze 1 s' }], track: 'hip' },
  slcurl: { props: [{ towel: [178, 226] }], frames: [
    { p: { r: hipFrom([76, 216], 166), t: 166, hd: 178, ua: 8, fa: 2, ub: 6, fb: 0, aA: [200, 220], aB: [198, 220], kA: 1, kB: 1 }, hold: 0.4, move: 1.4, cap: 'Hips up, heels on a towel' },
    { p: { r: hipFrom([76, 216], 148), t: 148, hd: 172, ua: 8, fa: 2, ub: 6, fb: 0, aA: [160, 220], aB: [158, 220], kA: 1, kB: 1 }, hold: 0.3, move: 2.4, cap: 'Slide the heels in, keep the hips up' }], track: 'anA', mcap: ['Curl in', 'Slide out slowly'] },
  calf: { props: [{ box: [140, 196, 80, 32] }], frames: [
    { p: { ...STAND, r: [0, 0], ft: -24, tb: 96, sb: 150, ftb: 170 }, hold: 0.6, move: 1.0, cap: 'Ball of the foot on the edge, heel low' },
    { p: { ...STAND, r: [0, 0], ft: 52, tb: 96, sb: 150, ftb: 170 }, hold: 1.0, move: 1.4, cap: 'Rise as high as you can, pause 1 s' }], pin: ['toA', 150, 196], track: 'hip' },
  backext: { frames: [
    { p: { r: [140, 216], t: 0, hd: 2, ua: -12, fa: 172, ub: -16, fb: 168, th: 180, sh: 180, ft: 90, tb: 180, sb: 180, ftb: 90 }, hold: 0.4, move: 1.0, cap: 'Face down, hands by the ears' },
    { p: { r: [140, 216], t: -17, hd: -20, ua: -26, fa: 158, ub: -30, fb: 154, th: 173, sh: 174, ft: 84, tb: 173, sb: 174, ftb: 84 }, hold: 2.0, move: 1.0, cap: 'Chest and legs up a few cm, hold 2 s' }], track: 'head' },
  birddog: { frames: [
    { p: { r: [118, 182], t: -12, hd: -8, hA: [168, 226], hB: [166, 226], th: 90, sh: 180, ft: 180, tb: 90, sb: 180, ftb: 180, eA: -1, eB: -1 }, hold: 0.4, move: 1.0, cap: 'Hands under shoulders, knees under hips' },
    { p: { r: [118, 182], t: -12, hd: -12, ua: -8, fa: -8, hB: [166, 226], eB: -1, th: 90, sh: 180, ft: 180, tb: 178, sb: 180, ftb: 92 }, hold: 3.0, move: 1.0, cap: 'Opposite arm and leg long, hips level, hold 3 s' }], track: 'hdA' },
  deadbug: { frames: [
    { p: { r: hipFrom([84, 214], 180), t: 180, hd: 180, ua: -88, fa: -90, ub: -92, fb: -90, th: -92, sh: 0, ft: -90, tb: -88, sb: 2, ftb: -88 }, hold: 0.4, move: 2.0, cap: 'Lower back pressed down, arms up, knees over hips' },
    { p: { r: hipFrom([84, 214], 180), t: 180, hd: 180, ua: -170, fa: -172, ub: -92, fb: -90, th: -92, sh: 0, ft: -90, tb: -8, sb: -6, ftb: -80 }, hold: 0.5, move: 1.6, cap: 'Opposite arm and leg reach out slowly, breathe out' }], track: 'hdA' },
  sideplank: { view: 'front', frames: [
    { p: { r: [128, 196], t: -20, a1: 92, a2: 92, b1: -108, b2: -108, l1: 160, m1: 160 }, hold: 0.4, move: 1.2, cap: 'Elbow under the shoulder, body in one line' },
    { p: { r: [128, 186], t: -14, a1: 96, a2: 96, b1: -102, b2: -102, l1: 166, m1: 166 }, hold: 2.5, move: 1.2, cap: 'Hips high, hold' }], track: 'hip', pin: ['forearm'] },
  ytw: { view: 'top', frames: [
    { p: { r: [120, 128], t: 0, a1: 38, b1: -38, l1: 180, m1: 180 }, hold: 1.4, move: 0.8, cap: 'Y: arms up at 45°, thumbs up, lift a few cm' },
    { p: { r: [120, 128], t: 0, a1: 90, b1: -90, l1: 180, m1: 180 }, hold: 1.4, move: 0.8, cap: 'T: arms out to the sides' },
    { p: { r: [120, 128], t: 0, a1: 140, a2: 60, b1: -140, b2: -60, l1: 180, m1: 180 }, hold: 1.4, move: 0.8, cap: 'W: elbows pull down toward the ribs' }], track: 'wP', play: 7 },
  passthru: { hold: 'stick', frames: [
    { p: { ...STAND, r: [150, 146], ua: 62, fa: 62 }, hold: 0.4, move: 1.6, cap: 'Very wide grip, stick at the hips' },
    { p: { ...STAND, r: [150, 146], ua: -92, fa: -92 }, hold: 0.2, move: 1.6, cap: 'Arms straight over the head' },
    { p: { ...STAND, r: [150, 146], ua: -206, fa: -206 }, hold: 0.4, move: 1.6, cap: 'Behind the back, then return the same way' },
    { p: { ...STAND, r: [150, 146], ua: -92, fa: -92 }, hold: 0.2, move: 1.6, cap: 'Slow and pain-free' }], track: 'hdA', play: 7 }
};
const ALIAS = { pull: 'pullup', dip: 'dip', push: 'pushup', row: 'invrow' };
export const hasDemo = (x) => !!(DEMOS[x] || DEMOS[ALIAS[x]]);
const defOf = (x) => DEMOS[x] || DEMOS[ALIAS[x]];

/* ---------------- timeline ---------------- */
function timeline(def) {
  const seg = []; let t = 0;
  def.frames.forEach((f, i) => {
    const nxt = def.frames[(i + 1) % def.frames.length];
    if (f.hold) { seg.push({ t0: t, t1: t + f.hold, a: f.p, b: f.p, cap: f.cap }); t += f.hold; }
    seg.push({ t0: t, t1: t + f.move, a: f.p, b: nxt.p, cap: (def.mcap && def.mcap[i]) || f.cap, move: true }); t += f.move;
  });
  return { seg, total: t };
}
function poseAt(def, time) {
  const tl = def._tl || (def._tl = timeline(def));
  const tt = ((time % tl.total) + tl.total) % tl.total;
  const s = tl.seg.find((x) => tt >= x.t0 && tt < x.t1) || tl.seg[0];
  const k = s.move ? 0.5 - 0.5 * Math.cos(Math.PI * ((tt - s.t0) / (s.t1 - s.t0))) : 0;
  return { pose: s.move ? mix(s.a, s.b, k) : s.a, cap: s.cap };
}

/* ---------------- drawing ---------------- */
const NS = 'http://www.w3.org/2000/svg';
const f1 = (n) => n.toFixed(1);
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
/** Tapered capsule from a (radius ra) to b (radius rb). */
function capsule(a, b, ra, rb) {
  const d = sub(b, a), L = len(d) || 0.001, n = [-d[1] / L, d[0] / L];
  const A1 = add(a, [n[0] * ra, n[1] * ra]), A2 = sub(a, [n[0] * ra, n[1] * ra]);
  const B1 = add(b, [n[0] * rb, n[1] * rb]), B2 = sub(b, [n[0] * rb, n[1] * rb]);
  return `M${f1(A1[0])},${f1(A1[1])}L${f1(B1[0])},${f1(B1[1])}A${rb},${rb} 0 0 0 ${f1(B2[0])},${f1(B2[1])}L${f1(A2[0])},${f1(A2[1])}A${ra},${ra} 0 0 0 ${f1(A1[0])},${f1(A1[1])}Z`;
}
const circ = (c, r) => `M${f1(c[0] + r)},${f1(c[1])}a${r},${r} 0 1,0 ${-2 * r},0a${r},${r} 0 1,0 ${2 * r},0`;
const at = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

function sidePaths(J) {
  const P = [];
  const arm = (sh, el, hd, far) => {
    const c = far ? '2' : '';
    P.push(['skin' + c, capsule(el, hd, 4.4, 3.5)], ['skin' + c, circ(hd, 4)]);
    P.push(['skin' + c, capsule(sh, el, 5.2, 4.4)], ['shirt' + c, capsule(sh, at(sh, el, 0.42), 5.9, 5.3)]);
  };
  const leg = (hip, kn, an, he, to, far) => {
    const c = far ? '2' : '';
    P.push(['skin' + c, capsule(kn, an, 5.6, 4.1)], ['shoe' + c, capsule(he, to, 3.6, 2.6)]);
    P.push(['skin' + c, capsule(hip, kn, 8.2, 5.8)], ['shorts' + c, capsule(hip, at(hip, kn, 0.5), 9, 7.4)]);
  };
  arm(J.sh, J.elB, J.hdB, true); leg(J.hip, J.knB, J.anB, J.heB, J.toB, true);
  P.push(['shorts', capsule(J.hip, at(J.hip, J.top, 0.25), 10.5, 10.5)]);
  P.push(['skin', capsule(J.top, add(J.top, vec(J.hd, LEN.neck + 2)), 4.2, 4.2)]);
  P.push(['shirt', capsule(at(J.hip, J.top, 0.18), J.top, 10.5, 11.5)]);
  leg(J.hip, J.knA, J.anA, J.heA, J.toA, false);
  const face = J.hd + 90, hc = J.head;
  P.push(['hair', circ(add(hc, vec(face + 180, 1.6)), LEN.head)]);
  P.push(['skin', circ(add(hc, vec(face, 1.2)), 8.4)], ['skin', circ(add(hc, vec(face, 9)), 2)]);
  arm(J.sh, J.elA, J.hdA, false);
  return P;
}
function frontPaths(J, view) {
  const P = [];
  const arm = (s, e, w, far) => { const c = far ? '2' : ''; P.push(['skin' + c, capsule(s, e, 5.2, 4.4)], ['skin' + c, capsule(e, w, 4.4, 3.5)], ['skin' + c, circ(w, 4)], ['shirt' + c, capsule(s, at(s, e, 0.42), 6, 5.3)]); };
  const leg = (h, k, f, far) => { const c = far ? '2' : ''; P.push(['skin' + c, capsule(h, k, 8, 5.8)], ['skin' + c, capsule(k, f, 5.6, 4)], ['shoe', capsule(f, add(f, vec(J.t + 180, 6)), 4.2, 3.6)], ['shorts' + c, capsule(h, at(h, k, 0.45), 8.6, 7.6)]); };
  leg(J.hM, J.kM, J.fM, true); leg(J.hP, J.kP, J.fP, false);
  const poly = (pts) => 'M' + pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join('L') + 'Z';
  P.push(['shorts', poly([add(J.hP, vec(J.t + 90, 4)), add(J.hM, vec(J.t - 90, 4)), at(J.hM, J.sM, 0.3), at(J.hP, J.sP, 0.3)])]);
  P.push(['shirt', poly([at(J.hP, J.sP, 0.22), at(J.hM, J.sM, 0.22), add(J.sM, vec(J.t, 2)), add(J.sP, vec(J.t, 2))]), true]);
  P.push(['skin', capsule(J.nk, add(J.nk, vec(J.t, 9)), 4.5, 4.5)]);
  const hc = J.head;
  if (view === 'top') P.push(['hair', circ(hc, 9.5)]);
  else { P.push(['skin', circ(hc, 9)]); const hr = add(hc, vec(J.t, 4)); P.push(['hair', capsule(add(hr, vec(J.t + 90, 6)), add(hr, vec(J.t - 90, 6)), 5, 5)]); }
  arm(J.sM, J.eM, J.wM, true); arm(J.sP, J.eP, J.wP, false);
  return P;
}

function propsSVG(def, g) {
  if (def.view !== 'top') el('rect', { x: 0, y: FLOOR, width: W, height: H - FLOOR, class: 'd-floor' }, g);
  for (const p of def.props || []) {
    if (p.bar) { // the bar runs toward the viewer, so it is seen end-on, hanging from a ceiling bracket
      const [x, y] = p.bar; el('rect', { x: 0, y: 0, width: W, height: 6, class: 'd-floor' }, g);
      el('path', { d: `M${x - 7},6L${x},${y}L${x + 7},6`, class: 'd-frame' }, g); el('circle', { cx: x, cy: y, r: 5, class: 'd-steel' }, g); }
    if (p.dips) { const [x1, x2, y] = p.dips; el('path', { d: `M${x1},${y}L${x2},${y}`, class: 'd-steel-l' }, g); el('path', { d: `M${x1 + 8},${y}L${x1 + 2},${FLOOR}M${x2 - 8},${y}L${x2 - 2},${FLOOR}`, class: 'd-frame' }, g); }
    if (p.lowbar) { const [x, y] = p.lowbar; el('path', { d: `M${x},${y}L${x - 10},${FLOOR}M${x},${y}L${x + 10},${FLOOR}`, class: 'd-frame' }, g); el('circle', { cx: x, cy: y, r: 4.6, class: 'd-steel' }, g); }
    if (p.pbars) { const [x, y] = p.pbars; el('path', { d: `M${x - 12},${FLOOR}L${x - 4},${y}L${x + 4},${y}L${x + 12},${FLOOR}`, class: 'd-frame' }, g); el('circle', { cx: x, cy: y, r: 3.6, class: 'd-steel' }, g); }
    if (p.box) { const [x, y, w, h] = p.box; el('rect', { x, y, width: w, height: h, rx: 3, class: 'd-box' }, g); }
    if (p.towel) { const [x, y] = p.towel; el('rect', { x: x - 30, y: y - 3, width: 60, height: 5, rx: 2, class: 'd-towel' }, g); }
  }
}

let uid = 0;
class Figure {
  constructor(x) {
    this.def = defOf(x); this.x = x;
    const def = this.def; this.front = def.view === 'front' || def.view === 'top';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'demo-svg', 'aria-hidden': 'true' });
    const mid = 'dm' + uid++;
    el('defs', {}, svg).innerHTML = `<marker id="${mid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0L10,5L0,10Z" class="d-arrowhead"/></marker>`;
    propsSVG(def, el('g', {}, svg));
    this.ghost = el('g', { class: 'd-ghost' }, svg);
    this.body = el('g', {}, svg);
    this.extra = el('g', {}, svg);
    this.gextra = el('g', { class: 'd-ghost' }, svg);
    this.arrow = el('path', { class: 'd-arrow', 'marker-end': `url(#${mid})` }, svg);
    this.svg = svg; this.tl = def._tl || (def._tl = timeline(def));
  }
  joints(pose) {
    const solve = this.front ? solveFront : solveSide;
    let J = solve(pose);
    const pin = this.def.pin;
    if (!pin) return J;
    let d;
    if (pin[0] === 'ground') d = [0, FLOOR - 1 - Math.max(J.toA[1], J.toB[1], J.heA[1], J.heB[1])];
    else if (pin[0] === 'forearm') d = sub([J.eP[0], FLOOR - 5], J.eP);
    else d = sub([pin[1], pin[2]], J[pin[0]]);
    return solve({ ...pose, r: add(pose.r, d) });
  }
  paint(g, pose, xg = this.extra) {
    const J = this.joints(pose);
    const paths = this.front ? frontPaths(J, this.def.view) : sidePaths(J);
    let i = 0; const kids = g.children;
    for (const [cls, d, round] of paths) {
      const e = kids[i++] || el('path', {}, g);
      const c = 'd-' + cls + (round ? ' d-round' : '');
      if (e.getAttribute('class') !== c) e.setAttribute('class', c);
      e.setAttribute('d', d);
    }
    while (kids.length > i) g.removeChild(kids[kids.length - 1]);
    const hold = this.def.hold, items = [];
    const hand = J.hdA || J.wP, hand2 = J.hdB || J.wM;
    if (hold === 'plates') items.push(['plate', hand, 8], ['plate', hand2, 8]);
    if (hold === 'side' || hold === 'hands') items.push(['plate', add(hand, [0, 5]), 8]);
    if (hold === 'chest') items.push(['plate', add(hand, [3, 0]), 10]);
    if (hold === 'hip') items.push(['plate', add(J.hip, vec(J.t - 90, 9)), 10]);
    if (hold === 'stick') items.push(['stick', hand, 3.4]);
    const ek = xg.children; let n = 0;
    for (const [cls, p, r] of items) { const e = ek[n++] || el('circle', {}, xg); e.setAttribute('class', 'd-' + cls); e.setAttribute('cx', f1(p[0])); e.setAttribute('cy', f1(p[1])); e.setAttribute('r', r); }
    while (ek.length > n) xg.removeChild(ek[ek.length - 1]);
    return J;
  }
  /** Still picture: start position, ghost of the next key position, arrow along the path. */
  still() {
    const fr = this.def.frames;
    this.ghost.style.display = ''; this.gextra.style.display = ''; this.arrow.style.display = '';
    this.paint(this.ghost, fr[1].p, this.gextra);
    this.paint(this.body, fr[0].p);
    const tj = this.def.track; let d = '';
    if (tj) {
      const pts = []; for (let k = 0; k <= 14; k++) pts.push(this.joints(mix(fr[0].p, fr[1].p, k / 14))[tj]);
      if (pts.every(Boolean) && len(sub(pts[14], pts[0])) > 10) {
        // offset the arrow a little to the side of the moving part so it doesn't sit on the limb
        const dir = sub(pts[14], pts[0]), L0 = len(dir), nrm = [-dir[1] / L0 * 12, dir[0] / L0 * 12];
        d = 'M' + pts.slice(2, 13).map((p) => `${f1(p[0] + nrm[0])},${f1(p[1] + nrm[1])}`).join('L');
      }
    }
    this.arrow.setAttribute('d', d);
    return fr[0].cap;
  }
  frame(time) {
    this.ghost.style.display = 'none'; this.gextra.style.display = 'none'; this.arrow.style.display = 'none';
    const { pose, cap } = poseAt(this.def, time); this.paint(this.body, pose); return cap;
  }
  get duration() { return Math.max(this.def.play || 0, Math.min(9, this.tl.total * 2)); }
}

/* ---------------- mounting: still by default, ▶ plays a few seconds ---------------- */
const live = new Map();
let raf = 0;
const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop() {
  if (raf) return;
  const step = (now) => {
    raf = 0; let any = false;
    for (const [host, st] of live) {
      if (!host.isConnected) { live.delete(host); continue; }
      if (!st.playing || st.stepped) continue;
      const t = (now - st.t0) / 1000;
      if (t >= st.f.duration) { stop(host, st); continue; }
      const cap = st.f.frame(t); if (cap !== st.cap) { st.cap = cap; st.capEl.textContent = cap; }
      st.bar.style.transform = `scaleX(${(t / st.f.duration).toFixed(3)})`;
      any = true;
    }
    if (any) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function stop(host, st) {
  st.playing = false; st.stepped = false; clearTimeout(st.timer); host.classList.remove('playing');
  st.cap = st.f.still(); st.capEl.textContent = st.cap; st.bar.style.transform = 'scaleX(0)';
  st.btn.setAttribute('aria-label', 'Play demo'); st.btn.setAttribute('aria-pressed', 'false');
}
function play(host) {
  const st = live.get(host); if (!st) return;
  if (st.playing) { stop(host, st); return; }
  for (const [h, o] of live) if (o.playing && h !== host) stop(h, o); // one at a time
  st.playing = true; st.t0 = performance.now(); host.classList.add('playing');
  st.btn.setAttribute('aria-label', 'Stop demo'); st.btn.setAttribute('aria-pressed', 'true');
  if (reduce()) { // step through the key positions instead of animating
    st.stepped = true; const fr = st.f.def.frames; let i = 0;
    const tick = () => {
      if (!st.playing) return;
      if (i >= fr.length * 2) { stop(host, st); return; }
      st.f.frame(0); st.f.paint(st.f.body, fr[i % fr.length].p); st.capEl.textContent = fr[i % fr.length].cap; i++;
      st.timer = setTimeout(tick, 1500);
    };
    tick(); return;
  }
  loop();
}
/** Mount demos into every `.demo[data-ex]` under root that isn't mounted yet. */
export function mountDemos(root = document) {
  for (const host of root.querySelectorAll('.demo[data-ex]')) {
    const x = host.dataset.ex; const cur = live.get(host);
    if (cur && cur.x === x) continue;
    if (!hasDemo(x)) { host.hidden = true; continue; }
    const f = new Figure(x);
    const mini = host.classList.contains('mini');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'demo-play';
    btn.setAttribute('aria-label', 'Play demo'); btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M8 5.5v13l11-6.5z"/><path class="i-stop" d="M7 7h10v10H7z"/></svg>';
    const capEl = document.createElement('div'); capEl.className = 'demo-cap';
    const bar = document.createElement('i'); bar.className = 'demo-prog';
    host.replaceChildren(...(mini ? [f.svg] : [f.svg, btn, capEl, bar]));
    const st = { x, f, btn, capEl, bar, playing: false };
    st.cap = f.still(); capEl.textContent = st.cap;
    if (!mini) { btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); play(host); }); f.svg.addEventListener('click', () => play(host)); }
    live.set(host, st);
  }
}
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.hidden) for (const [h, st] of live) if (st.playing) stop(h, st); });

/** Draw one picture for the gallery and tests: the still (time = null) or the pose at `time` s. */
export function renderStill(host, x, time = null) {
  const f = new Figure(x); host.replaceChildren(f.svg);
  if (time == null) f.still(); else f.frame(time);
  return f;
}
export const _solveSide = solveSide;
export const _solveFront = solveFront;
export const _poseAt = poseAt;
export const _timeline = timeline;
