// Training logic. Pure functions over a state snapshot; no DOM. Tested in tests/program.test.mjs.
import { EX, TPL, RUN, TESTS, VOL_TARGET, PROGRAM_TPLS } from './data.js';
import { DAY, dayKey, fromKey, dayStart, daysBetween, addDays, clamp, mean, fmtDur, fmtDate, round1, MONTHS } from './util.js';

export const READY = { green: 3.5, yellow: 2.5 };

export function defaultProfile(now = Date.now()) {
  return {
    age: 21, height: 178, restHR: 65, restMain: 150, restAcc: 75, weekStart: 6,
    plan: { 6: 'A', 1: 'B', 3: 'C', 5: 'D' }, variant: {}, programStart: null, deloadWeeks: [],
    trainTime: '18:00', morningTime: '08:00', updatedAt: 0
  };
}

export function readinessScore(rd) {
  if (!rd || !rd.sleep || !rd.energy || !rd.sore || !rd.stress) return 0;
  return (rd.sleep + rd.energy + (6 - rd.sore) + (6 - rd.stress)) / 4;
}
export function readyZone(score) { if (!score) return 'green'; return score >= READY.green ? 'green' : score >= READY.yellow ? 'yellow' : 'red'; }

export function levelFromTest(min) {
  if (!min || min < 2) return 0; if (min < 3) return 2; if (min < 5) return 3; if (min < 8) return 5;
  if (min < 12) return 6; if (min < 15) return 7; if (min < 20) return 8; if (min < 25) return 9; return 10;
}
export function runDesc(L, full) {
  if (L.c) return full ? `${L.c} min continuous easy run` : `${Math.min(L.c, 12)} min easy run`;
  const n = full ? L.n : Math.max(2, Math.floor(720 / (L.r + L.w)));
  return `${n} × (${fmtDur(L.r)} run / ${fmtDur(L.w)} walk)`;
}
export function runPhases(L, full) {
  const ph = [{ n: 'Walk warm-up', s: 180, t: 'walk' }];
  if (L.c) ph.push({ n: 'Easy run', s: (full ? L.c : Math.min(L.c, 12)) * 60, t: 'run' });
  else {
    const n = full ? L.n : Math.max(2, Math.floor(720 / (L.r + L.w)));
    for (let i = 1; i <= n; i++) { ph.push({ n: `Run ${i}/${n}`, s: L.r, t: 'run' }); if (i < n) ph.push({ n: `Walk ${i}/${n}`, s: L.w, t: 'walk' }); }
  }
  ph.push({ n: 'Walk cool-down', s: 120, t: 'walk' });
  return ph;
}
/** Epley estimate of a one-rep max. */
export const epley = (load, reps) => load * (1 + reps / 30);

export function createModel(state, now = Date.now()) {
  const P = state.profile;
  const recs = Object.values(state.records || {}).filter((r) => r && !r.deleted);
  const sessions = recs.filter((r) => r.type === 'session').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const real = sessions.filter((s) => !s.pending);
  const pending = sessions.filter((s) => s.pending);
  const weighins = recs.filter((r) => r.type === 'weigh' && r.kg > 0).sort((a, b) => a.d.localeCompare(b.d));
  const prehab = new Set(recs.filter((r) => r.type === 'prehab').map((r) => r.d));
  const tests = real.filter((s) => s.kind === 'test' && s.test).map((s) => ({ ...s.test, date: s.test.date || dayKey(s.date) })).sort((a, b) => a.date.localeCompare(b.date));
  const memo = new Map();
  const cached = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };

  const vx = (base) => (P.variant && P.variant[base] && EX[P.variant[base]] ? P.variant[base] : base);
  function bwAt(t) {
    const k = dayKey(t); let w = weighins.length ? weighins[0].kg : 67;
    for (const x of weighins) if (x.d <= k) w = x.kg; else break;
    return w;
  }
  const lastTest = () => (tests.length ? tests[tests.length - 1] : null);
  function testMax(x) { const e = EX[x], t = lastTest(); if (!e || !e.test || !t || !t[e.test]) return 0; return Math.round(t[e.test] * (e.tf || 1)); }

  function phaseInfo(t = now) {
    if (!P.programStart) return { key: 'test', name: 'Test week', week: 0, rir: 3 };
    const week = Math.floor(daysBetween(fromKey(P.programStart), t) / 7) + 1;
    if (week <= 2) return { key: 'reentry', name: 'Re-entry', week, pct: 0.5, rir: 4, desc: 'About half your tested max per set with 4 reps in reserve. Tendons and joints catch up; you should finish feeling you could do much more.' };
    if (week <= 4) return { key: 'rebuild', name: 'Rebuild', week, pct: 0.65, rir: 3, desc: 'About two-thirds of your max with 3 reps in reserve. Full set counts return.' };
    const forced = new Set(P.deloadWeeks || []);
    let cw = 0, block = 1;
    for (let w = 5; w <= week; w++) {
      cw++;
      if (cw === 6 || forced.has(w)) {
        if (w === week) return { key: 'deload', name: `Deload · block ${block}`, week, rir: 4, block, cw, forced: forced.has(w) && cw !== 6, desc: 'Fewer sets, easier reps, no weight increases. Re-test at the end of this week.' };
        cw = 0; block++;
      }
    }
    return { key: 'build', name: `Build ${block} · week ${cw}/5`, week, rir: cw <= 2 ? 2 : 1, block, cw, desc: 'Double progression: add reps until every set hits the top of the range, then add weight with the belt.' };
  }

  function histOf(x) {
    return cached('h:' + x, () => {
      const out = [];
      for (const s of real) for (const it of (s.items || [])) if (it.x === x) {
        const sets = (it.sets || []).filter((z) => +z.r > 0);
        if (!sets.length) continue;
        const rirs = sets.map((z) => z.rir).filter((v) => v != null && v !== '');
        out.push({ reps: sets.map((z) => +z.r), kg: Math.max(...sets.map((z) => +z.kg || 0)), rir: rirs.length ? mean(rirs.map(Number)) : null, date: s.date, sid: s.id });
      }
      return out;
    });
  }

  /** Prescription for one exercise. ctx: {phase, zone, short} */
  function presc(x, n, ctx) {
    const e = EX[x], ph = ctx.phase, zone = ctx.zone || 'green';
    const inc0 = e.k === 'hold' ? 5 : 1;
    if (e.prep) {
      const sets = ctx.short ? 1 : n; const h = histOf(x)[0];
      const t = h ? clamp(Math.max(...h.reps), e.lo, e.hi) : e.lo;
      return { x, sets, targets: Array(sets).fill(t), load: 0, status: '', rir: 3, prep: true };
    }
    let sets = n;
    if (ph.key === 'reentry') sets = Math.max(2, n - 1);
    if (ph.key === 'deload') sets = Math.max(1, Math.round(n * 0.6));
    if (ctx.short) sets = Math.min(sets, 2);
    if (zone === 'red') sets = Math.max(1, sets - 1);
    const hist = histOf(x), last = hist[0], canLoad = !!e.wlo;
    const rirTarget = ph.rir ?? 2;
    let load = 0, targets, status = '';
    const allowInc = ph.key === 'build' && zone === 'green';
    if (ph.key === 'reentry' || ph.key === 'rebuild' || ph.key === 'test') {
      const m = testMax(x), pct = ph.pct || 0.5;
      let t = m ? Math.max(1, Math.round(m * pct)) : e.lo;
      if (last && m) { const prevMin = Math.min(...last.reps); t = Math.max(t, Math.min(prevMin + inc0, Math.round(m * (pct + 0.1)))); }
      targets = Array(sets).fill(Math.min(t, e.hi));
      load = e.always ? (last ? last.kg : (e.start || 0)) : 0; status = 'ramp';
    } else if (!last) {
      const m = testMax(x); const t = m ? clamp(Math.round(m * 0.7), e.lo, e.hi) : e.lo;
      targets = Array(sets).fill(t); load = e.always ? (e.start || 0) : 0; status = 'new';
    } else {
      load = last.kg;
      const rng = load > 0 && canLoad ? [e.wlo, e.whi] : [e.lo, e.hi];
      const top = last.reps.length >= Math.min(sets, 2) && last.reps.every((v) => v >= rng[1]);
      const grinding = last.rir != null && last.rir < 1;
      const easy = last.rir != null && last.rir >= rirTarget + 2;
      if (top) {
        if (!allowInc || grinding) { targets = Array(sets).fill(rng[1]); status = grinding && allowInc ? 'grind' : 'hold'; }
        else if (canLoad) { const steps = easy ? 2 : 1; load = load > 0 ? load + e.step * steps : e.step * 2; targets = Array(sets).fill(e.wlo); status = 'load+'; }
        else if (e.always) { load = load + e.step; targets = Array(sets).fill(e.lo); status = 'load+'; }
        else if (e.next) { targets = Array(sets).fill(e.hi); status = 'upgrade'; }
        else { targets = Array(sets).fill(e.hi); status = 'top'; }
      } else {
        const inc = easy && allowInc ? inc0 * 2 : (grinding ? 0 : inc0);
        targets = Array.from({ length: sets }, (_, i) => { const b = last.reps[i] ?? last.reps[last.reps.length - 1]; return clamp(b + inc, rng[0], rng[1]); });
        if (load > 0 && hist.length >= 2 && hist.slice(0, 2).every((h) => Math.max(...h.reps) < rng[0])) { load = Math.max(0, load - e.step); status = 'load-'; }
      }
      if (ph.key === 'deload') targets = targets.map((v) => Math.max(1, Math.round(v * 0.8)));
    }
    if (zone === 'yellow') targets = targets.map((v) => Math.max(1, v - inc0));
    if (zone === 'red') targets = targets.map((v) => Math.max(1, v - 2 * inc0));
    return { x, sets, targets, load, status, rir: rirTarget + (zone === 'green' ? 0 : 1) };
  }

  function runLevel() {
    return cached('runLevel', () => {
      const runs = real.filter((s) => s.run && s.run.full && s.run.alt === 'run' && s.run.completed);
      const t = lastTest(); const base = t ? levelFromTest(t.runMin) : 0;
      if (!runs.length) return { lvl: base, why: t ? 'Set from your test run.' : 'Starting level.' };
      const s = runs[0], r = s.run, eff = +r.effort || +(s.post && s.post.rpe) || 6, knee = s.post && s.post.kn;
      const lvl = clamp(+r.lvl || 0, 0, RUN.length - 1);
      if (r.completed === 'no' || knee === 'pain') return { lvl: Math.max(0, lvl - 1), why: 'Last run was cut short or the knee hurt, so one step back.' };
      if (r.completed === 'part' || eff >= 7) return { lvl, why: 'Repeat this level until it feels easy (effort 6 or less).' };
      return { lvl: Math.min(RUN.length - 1, lvl + 1), why: 'Last run felt comfortable, so you move up a level.' };
    });
  }

  function planSession(tid, ctx) {
    const T = TPL[tid]; const items = [];
    let prep = T.prep || []; if (ctx.short) prep = prep.slice(0, 2);
    for (const [b, n] of prep) items.push({ ...presc(b, n, ctx), sec: 'prep' });
    let main = (T.main || []).map(([b, n]) => [vx(b), n, b]);
    if (ctx.sh) main = main.map(([x, n, b]) => (EX[x].sh ? ['pushup', n, b] : [x, n, b]));
    if (ctx.kn) {
      const hadKnee = main.some(([x]) => EX[x].knee);
      main = main.filter(([x]) => !EX[x].knee);
      if (hadKnee) main.push(['glutebr', 3, 'glutebr']);
    }
    if (ctx.short) main = main.slice(0, 3);
    const seen = new Set();
    for (const [x, n, b] of main) {
      if (seen.has(x)) continue; seen.add(x);
      const p = presc(x, n, ctx);
      if (ctx.sh && ['pullup', 'chinup', 'pushup'].includes(x)) { p.load = 0; if (p.status === 'load+') p.status = 'hold'; }
      items.push({ ...p, sec: 'main', base: b });
    }
    let run = null;
    if (T.run || (T.fin && !ctx.short && ctx.zone !== 'red')) {
      const full = !!T.run, rl = runLevel();
      if (ctx.kn) run = { alt: 'walk', full, lvl: rl.lvl, desc: 'Brisk walk, 20 min (knee flagged today)', phases: [{ n: 'Brisk walk', s: 1200, t: 'run' }] };
      else { const L = RUN[rl.lvl]; run = { alt: 'run', full, lvl: rl.lvl, desc: runDesc(L, full), phases: runPhases(L, full), why: rl.why }; }
    }
    return { items, run };
  }
  const ctxFor = (tid, extra = {}) => ({ tpl: tid, phase: phaseInfo(), zone: 'green', short: false, sh: false, kn: false, rd: null, ...extra });

  function weekStartOf(t) { const x = new Date(t); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() - P.weekStart + 7) % 7)); return x; }
  function weeks(n) {
    return cached('weeks:' + n, () => {
      const cur = weekStartOf(now), arr = [];
      for (let i = n - 1; i >= 0; i--) { const s = addDays(cur, -7 * i); const e = addDays(s, 7); arr.push({ s, e, strMin: 0, runMin: 0, count: 0, days: new Set(), vol: {}, km: 0 }); }
      for (const x of real) {
        const t = new Date(x.date); const w = arr.find((w) => t >= w.s && t < w.e); if (!w) continue;
        w.count++; w.days.add(dayKey(t)); const m = (x.dur || 0) / 60;
        if (x.kind === 'run') w.runMin += m; else w.strMin += m;
        if (x.run && x.run.gps && x.run.gps.km) w.km += x.run.gps.km;
        for (const it of (x.items || [])) {
          if (it.sec !== 'main' || !EX[it.x]) continue;
          const c = (it.sets || []).filter((z) => +z.r > 0).length;
          EX[it.x].g.forEach((g, i) => { w.vol[g] = (w.vol[g] || 0) + c * (i === 0 ? 1 : 0.5); });
        }
      }
      return arr;
    });
  }
  const plannedDays = () => Object.values(P.plan || {}).filter((id) => TPL[id]).length;
  function streak() {
    const need = Math.max(1, Math.min(3, plannedDays())); const ws = weeks(52).slice(); let n = 0;
    const cur = ws.pop(); if (cur.days.size >= need) n++;
    for (let i = ws.length - 1; i >= 0; i--) { if (ws[i].days.size >= need) n++; else break; }
    return { n, need };
  }
  function e1rm(x) {
    return cached('e1:' + x, () => {
      const pts = [];
      for (const s of real.slice().reverse()) for (const it of (s.items || [])) if (it.x === x) {
        const e = EX[x]; const bw = e.wlo || ['pullup', 'chinup', 'dip', 'pushup'].includes(x) ? bwAt(s.date) : 0;
        let best = 0; for (const z of it.sets || []) if (+z.r > 0) best = Math.max(best, epley(bw + (+z.kg || 0), +z.r));
        if (best) pts.push({ x: +new Date(s.date), y: best });
      }
      return pts;
    });
  }

  /** Session training load (sRPE): effort × minutes. */
  const sessLoad = (s) => ((s.post && +s.post.rpe) || (s.kind === 'test' ? 8 : 6)) * ((s.dur || 0) / 60);
  /** Banister-style fitness (42 d) / fatigue (7 d) EWMAs of daily load. */
  function banister(days = 84) {
    return cached('ban:' + days, () => {
      const byDay = {};
      for (const s of real) { const k = dayKey(s.date); byDay[k] = (byDay[k] || 0) + sessLoad(s); }
      const first = real.length ? dayStart(real[real.length - 1].date) : dayStart(now);
      const start = Math.min(first, dayStart(addDays(now, -days)));
      const a1 = 1 - Math.exp(-1 / 42), a2 = 1 - Math.exp(-1 / 7);
      let fit = 0, fat = 0; const out = [];
      const total = daysBetween(start, now);
      for (let i = 0; i <= total; i++) {
        const d = addDays(start, i); const k = dayKey(d); const L = byDay[k] || 0;
        fit += a1 * (L - fit); fat += a2 * (L - fat);
        if (i > total - days) out.push({ x: +d, fit, fat, form: fit - fat });
      }
      const hist = real.length ? daysBetween(first, now) : 0;
      return { pts: out, last: out[out.length - 1] || { fit: 0, fat: 0, form: 0 }, historyDays: hist };
    });
  }
  /** True when fatigue has outrun fitness for 3+ days, or main-lift strength is dropping. */
  function fatigueSignal() {
    const b = banister(); const ph = phaseInfo();
    if (b.historyDays < 21 || ph.key !== 'build') return null;
    const recent = b.pts.slice(-3); const spike = recent.length === 3 && recent.every((p) => p.fit > 0 && p.fat / p.fit > 1.5);
    let drop = null;
    for (const x of ['pullup', 'dip', 'chinup']) {
      const pts = e1rm(x); if (pts.length < 4) continue;
      const lastP = pts[pts.length - 1].y, prev = mean(pts.slice(-4, -1).map((p) => p.y));
      if (prev && lastP < prev * 0.95) { drop = EX[x].n; break; }
    }
    if (!spike && !drop) return null;
    return { spike, drop };
  }

  function volumeTargetsMissed(w) {
    return Object.entries(VOL_TARGET).filter(([g, [a]]) => (w.vol[g] || 0) < a).map(([g]) => g);
  }

  function coachNotes() {
    const N = []; const ph = phaseInfo();
    for (const s of pending) N.push({ tone: 'warn', title: `Add details: ${s.title}`, body: `Saved as "fill in later" on ${fmtDate(s.date)}. Until you add the real numbers, the coach assumes you did the plan.`, btn: ['Add details', 'edit', s.id] });
    if (ph.key !== 'test') N.push({ tone: 'bar', title: `Week ${ph.week}: ${ph.name}`, body: ph.desc });
    if (ph.key === 'deload') N.push({ tone: 'info', title: 'Re-test at the end of this week', body: 'New maxes recalibrate the next block.', btn: ['Start test', 'start', 'T'] });
    const fs = fatigueSignal();
    if (fs) N.push({ tone: 'warn', title: 'Fatigue is building up', body: (fs.drop ? `${fs.drop} strength dropped more than 5% versus your recent sessions. ` : '') + (fs.spike ? 'Your recent training load is well above what your body is used to. ' : '') + 'Taking the deload week now usually brings a rebound.', btn: ['Deload this week', 'deloadnow', ''] });
    const ctx = { phase: ph, zone: 'green' }; const seen = new Set();
    for (const id of PROGRAM_TPLS) for (const [b, n] of (TPL[id].main || [])) {
      const x = vx(b); if (seen.has(x)) continue; seen.add(x); const p = presc(x, n, ctx);
      if (p.status === 'load+') N.push({ tone: 'good', title: `Add weight: ${EX[x].n}`, body: `Every set hit the top of the range. Next time: ${p.sets} × ${p.targets[0]} @ +${p.load} kg.` });
      if (p.status === 'upgrade') N.push({ tone: 'good', title: `Ready for ${EX[EX[x].next].n}`, body: `Every set of ${EX[x].n} hit ${EX[x].hi}. Switch to the harder version.`, btn: ['Switch', 'variant', `${b}:${EX[x].next}`] });
      if (p.status === 'load-') N.push({ tone: 'warn', title: `Lower the weight: ${EX[x].n}`, body: `Two sessions under ${EX[x].wlo} reps. Next time: +${p.load} kg.` });
      if (p.status === 'grind') N.push({ tone: 'warn', title: `Hold weight: ${EX[x].n}`, body: 'You reached the top of the range but with nothing left in the tank. Repeat it until it is smoother before adding weight.' });
    }
    const rds = real.filter((s) => s.ready && s.ready.score).slice(0, 3);
    if (rds.length === 3 && rds.every((s) => s.ready.score < 2.8)) N.push({ tone: 'warn', title: 'Recovery is running low', body: 'Your last three readiness checks were low. Prioritise sleep and food this week, and use short mode until it improves.' });
    const posts = real.filter((s) => s.post).slice(0, 2);
    if (posts.length === 2 && posts.every((s) => s.post.sh === 'pain')) N.push({ tone: 'warn', title: 'Shoulder pain twice in a row', body: 'Drop dips and weighted pushing for a week, keep the morning shoulder routine daily, and see a physiotherapist if it continues.' });
    if (posts.length === 2 && posts.every((s) => s.post.kn === 'pain')) N.push({ tone: 'warn', title: 'Knee pain twice in a row', body: 'Use the knee flag before sessions (it removes knee-heavy work and turns runs into walks), and have the knee checked.' });
    const lw = weighins[weighins.length - 1];
    if (!lw || daysBetween(fromKey(lw.d), now) >= 7) N.push({ tone: 'info', title: 'Weekly weigh-in', body: 'Morning, after the toilet, before eating.', weigh: true });
    if (weighins.length >= 3) {
      const a = weighins[weighins.length - 1]; const b = weighins.find((w) => daysBetween(fromKey(w.d), fromKey(a.d)) <= 35) || weighins[0];
      const d = daysBetween(fromKey(b.d), fromKey(a.d));
      if (d >= 21) { const pm = ((a.kg - b.kg) / d) * 30;
        if (pm < 0.1) N.push({ tone: 'warn', title: 'Weight is not going up', body: `${pm >= 0 ? '+' : ''}${pm.toFixed(2)} kg a month. For muscle gain aim for +0.25–0.5 kg a month: one extra meal or a milk and peanut-butter shake a day.` });
        else if (pm > 0.8) N.push({ tone: 'warn', title: 'Gaining fast', body: `+${pm.toFixed(2)} kg a month. Above about 0.5 kg a month much of the gain is fat; trim portions slightly.` }); }
    }
    return N;
  }

  function weeklyReport(offset = 1) {
    const ws = weeks(offset + 1); const w = ws[0]; if (!w) return null;
    const start = w.s, end = w.e;
    const inWeek = real.filter((s) => { const t = new Date(s.date); return t >= start && t < end; });
    const planned = plannedDays();
    const lines = [];
    lines.push(`# Week of ${fmtDate(start)}`);
    const ph = phaseInfo(+start + 3 * DAY);
    lines.push(`Phase: ${ph.name}${ph.week ? ` (program week ${ph.week})` : ''}`);
    lines.push(`Sessions: ${w.days.size}/${planned} days · ${Math.round(w.strMin)} min strength · ${Math.round(w.runMin)} min running`);
    const vol = Object.keys(VOL_TARGET).map((g) => `${g} ${round1(w.vol[g] || 0)}`).join(', ');
    lines.push(`Hard sets: ${vol}`);
    const missed = volumeTargetsMissed(w); if (missed.length && w.count) lines.push(`Below growth range: ${missed.join(', ')}`);
    for (const x of ['pullup', 'dip', 'chinup', 'pushup']) {
      const pts = e1rm(x).filter((p) => p.x < +end); const inW = pts.filter((p) => p.x >= +start);
      if (inW.length) { const prev = pts.filter((p) => p.x < +start).slice(-1)[0]; const cur = Math.max(...inW.map((p) => p.y));
        lines.push(`${EX[x].n} est. 1RM: ${cur.toFixed(1)} kg${prev ? ` (${cur >= prev.y ? '+' : ''}${(cur - prev.y).toFixed(1)} vs before)` : ''}`); }
    }
    const runs = inWeek.filter((s) => s.run && s.run.alt !== 'walk');
    if (runs.length) lines.push(`Runs: ${runs.map((s) => `${s.run.alt === 'free' ? 'free run' : 'L' + ((+s.run.lvl || 0) + 1)} ${s.run.completed || ''}${s.run.gps && s.run.gps.km ? ` ${s.run.gps.km.toFixed(2)} km` : ''}`).join('; ')}`);
    const rd = inWeek.filter((s) => s.ready && s.ready.score).map((s) => s.ready.score);
    if (rd.length) lines.push(`Readiness avg: ${mean(rd).toFixed(1)}/5`);
    const rp = inWeek.filter((s) => s.post && s.post.rpe).map((s) => +s.post.rpe);
    if (rp.length) lines.push(`Session effort avg: ${mean(rp).toFixed(1)}/10`);
    const pains = inWeek.filter((s) => s.post && (s.post.sh === 'pain' || s.post.kn === 'pain'));
    if (pains.length) lines.push(`Pain reported: ${pains.map((s) => `${fmtDate(s.date)} ${s.post.sh === 'pain' ? 'shoulder ' : ''}${s.post.kn === 'pain' ? 'knee' : ''}`).join('; ')}`);
    let pre = 0; for (let i = 0; i < 7; i++) if (prehab.has(dayKey(addDays(start, i)))) pre++;
    lines.push(`Morning shoulder routine: ${pre}/7 days`);
    const wIn = weighins.filter((x) => x.d >= dayKey(start) && x.d < dayKey(end));
    if (wIn.length) lines.push(`Bodyweight: ${wIn[wIn.length - 1].kg} kg`);
    const notes = inWeek.filter((s) => s.post && s.post.notes).map((s) => `- ${fmtDate(s.date)}: ${s.post.notes}`);
    if (notes.length) { lines.push('Notes:'); lines.push(...notes); }
    return { start, end, count: w.count, days: w.days.size, planned, text: lines.join('\n') };
  }

  return {
    P, sessions, real, pending, weighins, prehab, tests, vx, bwAt, lastTest, testMax, phaseInfo, histOf, presc, runLevel,
    planSession, ctxFor, weekStartOf, weeks, plannedDays, streak, e1rm, banister, fatigueSignal, coachNotes, weeklyReport, sessLoad
  };
}
