// View templates. Each view returns an HTML string; main.js patches it into the page with morphdom.
import { EX, TPL, TESTS, RUN, GROUPS, VOL_TARGET, PROGRAM_TPLS, RUN_ALTS, demoUrl } from './data.js';
import { esc, fmtDur, fmtMin, fmtDate, fmtShort, fmtPace, fmtAgo, dayKey, fromKey, addDays, DAYS, DAYS_LONG, MONTHS, round1 } from './util.js';
import { barChart, lineChart, heatmap, routeSVG } from './charts.js';
import { readyZone } from './program.js';
import * as drive from './drive.js';

const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
const unitWord = (x) => (EX[x].k === 'hold' ? 's' : 'reps');
const u = (x, v) => (EX[x] && EX[x].k === 'hold' ? `${v} s` : `${v}`);
function rangeTxt(t, x) { const a = Math.min(...t), b = Math.max(...t); return (a === b ? `${a}` : `${a}–${b}`) + (EX[x].k === 'hold' ? ' s' : ' reps') + (EX[x].each ? ' each side' : ''); }
const kgTxt = (kg) => (kg > 0 ? ` @ +${kg} kg` : '');
const itemLine = (it) => `${it.sets} × ${rangeTxt(it.targets, it.x)}${kgTxt(it.load)}`;
const loadable = (x) => !!(EX[x].wlo || EX[x].always);
function statusChip(st) {
  return st === 'load+' ? '<span class="chip good">+ weight</span>' : st === 'upgrade' ? '<span class="chip good">Harder version ready</span>' : st === 'load-' ? '<span class="chip warn">− weight</span>'
    : st === 'grind' ? '<span class="chip warn">Hold weight</span>' : st === 'new' ? '<span class="chip">First time</span>' : '';
}
function chips(act, val, n, labels, extra = '') { return `<div class="chips" style="--n:${n}" role="group">${Array.from({ length: n }, (_, k) => { const v = labels ? labels[k][0] : k + 1; const on = String(val) === String(v); return `<button type="button" class="${on ? 'on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${on}"${extra}>${labels ? esc(labels[k][1]) : k + 1}</button>`; }).join('')}</div>`; }
const howHTML = (x, open = false) => `<details class="how" data-key="how-${x}"${open ? ' open' : ''}><summary>How to do it</summary><ul>${EX[x].cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${EX[x].knee ? '<p class="small muted">Knee: no pivoting or jumping. Stop at any instability.</p>' : ''}<a class="demo" href="${demoUrl(x)}" target="_blank" rel="noopener">Watch demo videos ↗</a></details>`;
function noteHTML(n, M) {
  const btn = n.btn ? `<div class="row"><button class="btn sm" data-act="${n.btn[1]}" data-id="${esc(n.btn[2])}">${esc(n.btn[0])}</button></div>` : '';
  const weigh = n.weigh ? `<div class="row"><div class="inl" style="width:130px"><input id="wIn" class="num" type="number" step="0.1" min="30" max="200" inputmode="decimal" aria-label="Bodyweight in kg" placeholder="${M.bwAt(Date.now())}"><em>kg</em></div><button class="btn sm" data-act="weigh">Save</button></div>` : '';
  return `<div class="note ${n.tone}"><b>${esc(n.title)}</b><span class="small">${esc(n.body)}</span>${btn}${weigh}</div>`;
}
const tplForDay = (M, d) => { const id = M.P.plan[d]; return TPL[id] ? id : null; };
function sessSummary(s) {
  const bits = [];
  if (s.kind === 'test' && s.test) { const t = TESTS.map(([k, l]) => (s.test[k] ? `${l} ${s.test[k]}` : '')).filter(Boolean).join(' · '); if (t) bits.push(t); if (s.test.runMin) bits.push(`ran ${s.test.runMin} min`); }
  const sets = (s.items || []).filter((i) => i.sec === 'main').reduce((a, i) => a + (i.sets || []).filter((z) => +z.r > 0).length, 0);
  if (sets) bits.push(`${sets} working sets`);
  if (s.run) { const g = s.run.gps; bits.push((s.run.alt === 'run' ? `run-walk L${(+s.run.lvl || 0) + 1}` : RUN_ALTS[s.run.alt].toLowerCase()) + (s.run.completed === 'part' ? ' (part)' : s.run.completed === 'no' ? ' (skipped)' : '') + (g && g.km ? ` ${g.km.toFixed(2)} km` : '')); }
  if (s.dur) bits.push(fmtMin(s.dur));
  return bits.join(' · ');
}

/* ===================== Today ===================== */
export function viewToday(M, ui) {
  const now = new Date(), ph = M.phaseInfo(), tid = tplForDay(M, now.getDay());
  const todays = M.real.filter((s) => dayKey(s.date) === dayKey(now));
  const live = ui.live;
  let hero;
  if (live) {
    hero = `<section class="card hero"><span class="eyebrow">In progress</span><h2>${esc(live.title)}</h2><p class="small muted">Started ${fmtAgo(live.start)}.</p><a class="btn primary wide" href="#workout">Resume</a></section>`;
  } else if (ph.key === 'test') {
    hero = `<section class="card hero test"><span class="eyebrow">Start here · Week 0</span><h2>Test day</h2>
      <p class="small">Six months off means your old numbers are not today's numbers. One short session finds your current max pull-ups, dips, push-ups and rows, plus how long you can run easily. The return ramp is built from these.</p>
      <div class="kv"><span>Takes</span><b>30–40 min</b><span>Then</span><b>2 weeks Re-entry, 2 weeks Rebuild</b></div>
      <button class="btn primary wide" data-act="start" data-id="T">Start test day</button></section>`;
  } else if (tid) {
    const T = TPL[tid]; const pl = M.planSession(tid, M.ctxFor(tid));
    hero = `<section class="card hero ${T.kind === 'run' ? 'run' : ''}"><div class="spread"><span class="eyebrow">Today · ${DAYS_LONG[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}</span><span class="chip bar">${esc(ph.name)}</span></div>
      <h2>${esc(T.name)}</h2>${todays.length ? `<div class="row">${todays.map((s) => `<span class="chip good">Done: ${esc(s.title)}</span>`).join('')}</div>` : ''}
      <div class="list">${pl.items.filter((i) => i.sec === 'main').map((i) => `<div class="li"><div><div class="t">${esc(EX[i.x].n)}</div><div class="s num">${itemLine(i)}</div></div>${statusChip(i.status)}</div>`).join('')}
      ${pl.run ? `<div class="li"><div><div class="t">${pl.run.full ? 'Run-walk' : 'Finisher: run-walk'} · level ${pl.run.lvl + 1}</div><div class="s">${esc(pl.run.desc)}</div></div><span class="chip track">easy</span></div>` : ''}</div>
      <button class="btn primary wide" data-act="start" data-id="${tid}">Start</button></section>`;
  } else {
    hero = `<section class="card hero rest"><span class="eyebrow">Today · ${DAYS_LONG[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}</span><h2>Rest day</h2>
      <p class="small">Recovery is when the muscle is built. A walk and the 5-minute shoulder routine are enough.</p>
      <label class="f" for="startpick">Train anyway<select id="startpick" data-ch="startpick"><option value="">Choose a session…</option>${PROGRAM_TPLS.map((k) => `<option value="${k}">${esc(TPL[k].name)}</option>`).join('')}</select></label></section>`;
  }
  const ws = M.weekStartOf(now); let strip = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i); const k = dayKey(d); const t = tplForDay(M, d.getDay()); const ss = M.real.filter((s) => dayKey(s.date) === k);
    const dot = ss.length ? (ss.some((s) => s.kind === 'test') ? 'test' : ss.some((s) => s.kind === 'str') ? 'str' : 'run') : (t && k < dayKey(now) && ph.key !== 'test' && M.P.programStart && k >= M.P.programStart ? 'miss' : '');
    strip += `<div class="day ${k === dayKey(now) ? 'today' : ''}"><span class="dn">${DAYS[d.getDay()]}</span><span class="dd num">${d.getDate()}</span><span class="dot ${dot}"></span><span class="dl">${t ? TPL[t].short : 'Rest'}</span></div>`;
  }
  const w = M.weeks(1)[0], st = M.streak();
  const pre = M.prehab.has(dayKey(now));
  const last7 = Array.from({ length: 7 }, (_, i) => M.prehab.has(dayKey(addDays(now, i - 6))));
  return `${hero}
  <section class="card"><div class="split"><div><h3>Morning shoulder routine</h3><p class="small muted">Prone Y-T-W raises 2 × 8 and bar pass-throughs 2 × 12. About 5 minutes.</p></div>
    <button class="check ${pre ? 'on' : ''}" data-act="prehab" aria-pressed="${pre}" aria-label="Shoulder routine done today">${CHECK}</button></div>
    <div class="row small muted">Last 7 days ${last7.map((b) => `<span class="dot ${b ? 'str' : ''}"></span>`).join('')}</div></section>
  <section class="card"><div class="spread"><h3>This week</h3><span class="small muted num">${st.n} week streak</span></div><div class="week">${strip}</div>
    <div class="grid3"><div class="tile"><b>${w.days.size}<small>/${M.plannedDays()}</small></b><span>Days trained</span></div><div class="tile"><b>${Math.round(w.strMin + w.runMin)}</b><span>Minutes</span></div><div class="tile"><b>L${M.runLevel().lvl + 1}</b><span>Run-walk level</span></div></div></section>
  <section class="card"><h3>Coach</h3>${M.coachNotes().map((n) => noteHTML(n, M)).join('') || '<p class="empty">Nothing to adjust. Follow the plan.</p>'}</section>`;
}

/* ===================== Train ===================== */
export function viewTrain(M, ui) {
  let hh = '', lastWk = '';
  for (const s of M.sessions.slice(0, 200)) {
    const wk = dayKey(M.weekStartOf(s.date)); if (wk !== lastWk) { lastWk = wk; hh += `<div class="eyebrow wk">Week of ${fmtDate(M.weekStartOf(s.date))}</div>`; }
    const open = ui.openHist.has(s.id);
    const g = s.run && s.run.gps;
    hh += `<div class="li hist" id="h-${esc(s.id)}"><div class="grow"><button class="linkbtn" data-act="hist" data-id="${esc(s.id)}" aria-expanded="${open}"><span class="t">${esc(s.title)}</span></button>
      <div class="s num">${fmtDate(s.date)}${s.pending ? ' · <b class="warn">needs details</b>' : ''}${s.mode === 'quick' ? ' · quick log' : ''} · ${esc(sessSummary(s))}${s.post && s.post.rpe ? ` · effort ${s.post.rpe}/10` : ''}</div>
      ${open ? `<div class="stack small detail">${(s.items || []).filter((i) => i.sec === 'main').map((i) => `<div><b>${esc(EX[i.x] ? EX[i.x].n : i.x)}</b> <span class="muted num">${(i.sets || []).filter((z) => +z.r > 0).map((z) => u(i.x, z.r) + (+z.kg ? ` @${z.kg}` : '') + (z.rir != null && z.rir !== '' ? ` (${z.rir} left)` : '')).join(' · ')}</span></div>`).join('')}
        ${g && g.km ? `<div class="muted num">${g.km.toFixed(2)} km${g.pace ? ` · ${fmtPace(g.pace)} /km avg` : ''}${g.splits && g.splits.length ? ` · splits ${g.splits.map(fmtPace).join(', ')}` : ''}</div>${routeSVG(g.route, 110)}` : ''}
        ${s.ready && s.ready.score ? `<div class="muted">Readiness ${s.ready.score.toFixed(1)}/5</div>` : ''}${s.post && s.post.notes ? `<div class="muted">“${esc(s.post.notes)}”</div>` : ''}
        <div class="row"><button class="btn sm" data-act="edit" data-id="${esc(s.id)}">Edit</button><button class="btn sm danger" data-act="delsess" data-id="${esc(s.id)}">Delete</button></div></div>` : ''}</div><span class="dot ${s.kind === 'free' ? 'run' : s.kind}"></span></div>`;
  }
  return `${ui.live ? `<section class="card hero"><div class="spread"><h3>${esc(ui.live.title)} in progress</h3><a class="btn primary sm" href="#workout">Resume</a></div></section>` : ''}
  <section class="card"><h3>Start a session</h3><div class="grid2">${PROGRAM_TPLS.map((k) => `<button class="btn ${k === 'D' ? 'runbtn' : ''}" data-act="start" data-id="${k}">${esc(TPL[k].name)}</button>`).join('')}<button class="btn ghost" data-act="start" data-id="T">Test day</button><button class="btn ghost" data-act="freerun">Track a free run</button></div></section>
  <section class="card"><h3>Log a past session</h3><p class="small muted">Trained without the app? The form opens with the plan filled in, so you only change what was different.</p>
    <div class="grid2"><label class="f" for="pastTpl">Session<select id="pastTpl">${PROGRAM_TPLS.map((k) => `<option value="${k}">${esc(TPL[k].name)}</option>`).join('')}</select></label><label class="f" for="pastDate">Date<input type="date" id="pastDate" value="${dayKey(Date.now())}" max="${dayKey(Date.now())}"></label></div>
    <button class="btn" data-act="pastlog">Open form</button></section>
  <section class="card"><div class="spread"><h3>History</h3><span class="small muted num">${M.sessions.length} sessions</span></div>${hh ? `<div class="list">${hh}</div>` : '<p class="empty">Sessions you log appear here.</p>'}</section>`;
}

/* ===================== Start (readiness + logging choice) ===================== */
export function viewStart(M, ui) {
  const c = ui.startCtx; const T = TPL[c.tpl];
  if (T.kind === 'test') return viewTest(M, ui);
  const rd = c.rd || {}; const pl = M.planSession(c.tpl, c);
  const zone = c.rd && c.rd.score ? readyZone(c.rd.score) : null;
  const zt = { green: ['good', 'Ready: train as planned.'], yellow: ['warn', 'Moderate: same sets, one rep less per set, no weight increases.'], red: ['warn', 'Low: one set less per exercise, two reps less, no finisher. Short mode is a good idea.'] };
  const row = (k, l, hint) => `<span class="lbl">${l} <span class="muted">(${hint})</span></span>${chips('rd-' + k, rd[k], 5)}`;
  return `<section class="card"><div class="eyebrow">${esc(c.phase.name)}</div><h2>${esc(T.name)}</h2><p class="small muted">${esc(T.why)}</p></section>
  <section class="card"><div class="spread"><h3>Readiness check</h3><span class="small muted">15 seconds · optional</span></div>
    <div class="stack">${row('sleep', 'Sleep last night', '1 bad · 5 great')}${row('energy', 'Energy', '1 drained · 5 fresh')}${row('sore', 'Muscle soreness', '1 none · 5 very sore')}${row('stress', 'Stress', '1 calm · 5 high')}</div>
    <div class="grid2"><button class="toggle ${c.sh ? 'on' : ''}" data-act="flag" data-v="sh" aria-pressed="${c.sh}">Shoulder discomfort</button><button class="toggle ${c.kn ? 'on' : ''}" data-act="flag" data-v="kn" aria-pressed="${c.kn}">Knee discomfort</button></div>
    ${zone ? `<div class="note ${zt[zone][0]}"><b>Readiness ${c.rd.score.toFixed(1)}/5</b><span class="small">${zt[zone][1]}</span></div>` : ''}
    ${c.sh ? '<p class="small muted">Shoulder flag: dips and pike push-ups become push-ups, no added weight on pulling or pushing today.</p>' : ''}${c.kn ? '<p class="small muted">Knee flag: split squats, step-ups and box squats are removed; the run becomes a brisk walk.</p>' : ''}</section>
  <section class="card"><div class="spread"><h3>Today's plan</h3><div class="seg"><button class="${c.short ? '' : 'on'}" data-act="short" data-v="0" aria-pressed="${!c.short}">Full · 60 min</button><button class="${c.short ? 'on' : ''}" data-act="short" data-v="1" aria-pressed="${c.short}">Short · 30 min</button></div></div>
    <div class="list">${pl.items.map((i) => `<div class="li"><div><div class="t">${esc(EX[i.x].n)}${i.sec === 'prep' ? ' <span class="chip">prep</span>' : ''}</div><div class="s num">${itemLine(i)}${i.sec === 'main' ? ` · ${i.rir} in reserve` : ''}</div></div>${statusChip(i.status)}</div>`).join('')}
    ${pl.run ? `<div class="li"><div><div class="t">${pl.run.alt === 'walk' ? 'Walk' : `Run-walk · level ${pl.run.lvl + 1}`}</div><div class="s">${esc(pl.run.desc)}</div></div></div>` : ''}</div></section>
  <section class="card"><h3>How do you want to log it?</h3>
    <button class="btn primary wide" data-act="golive">Log live, set by set</button>
    <div class="grid2"><button class="btn" data-act="goquick">Done as planned</button><button class="btn" data-act="golater">Fill in later</button></div>
    <p class="small muted">"Done as planned" saves the plan as performed in one tap. "Fill in later" saves a placeholder you complete from Today when you have a minute.</p></section>`;
}

export function viewTest(M, ui) {
  const f = ui.testForm; const t = M.lastTest();
  return `<section class="card hero test"><div class="eyebrow">Test day</div><h2>Find your current numbers</h2><p class="small">${esc(TPL.T.why)}</p>
    <ol class="small steps"><li>Warm up 8 minutes: pass-throughs, Y-T-W raises, scapular pull-ups, 10 easy push-ups, a few easy pull-ups.</li><li>One all-out set of each, in this order, resting 3–4 minutes between. Count only clean reps.</li><li>Finish with the run: easy talking pace on the track; stop when you would need to walk or at 20 minutes.</li></ol></section>
  <section class="card"><div class="grid2">${TESTS.map(([k, l, h]) => `<label class="f" for="t-${k}">${l}${t && t[k] ? ` <span class="muted">(last ${t[k]})</span>` : ''}<input class="num" type="number" inputmode="numeric" min="0" max="200" id="t-${k}" value="${esc(f[k])}" data-in="test" data-f="${k}"><span class="hint">${h}</span></label>`).join('')}
    <label class="f" for="t-runMin">Continuous easy run (min)<input class="num" type="number" inputmode="decimal" min="0" max="120" id="t-runMin" value="${esc(f.runMin)}" data-in="test" data-f="runMin"></label>
    <label class="f" for="t-bw">Bodyweight (kg)<input class="num" type="number" step="0.1" min="30" max="200" inputmode="decimal" id="t-bw" value="${esc(f.bw)}" data-in="test" data-f="bw"></label>
    <label class="f" for="t-date">Date<input type="date" id="t-date" value="${esc(f.date)}" max="${dayKey(Date.now())}" data-in="test" data-f="date"></label></div>
    <button class="btn primary wide" data-act="savetest">Save test</button>
    <p class="small muted">${M.P.programStart ? 'The program keeps its current week; the new maxes recalibrate your targets.' : 'Saving starts the program: week 1 (Re-entry) begins on the test date.'}</p></section>`;
}

/* ===================== Live workout ===================== */
export function viewWorkout(M, ui) {
  const L = ui.live;
  const blocks = L.items.map((it, i) => {
    const e = EX[it.x]; const showKg = loadable(it.x); const done = it.rows.length && it.rows.every((r) => r.done);
    const rows = it.rows.map((r, j) => {
      const askRir = r.done && it.sec === 'main' && ui.rirAsk && ui.rirAsk.i === i && ui.rirAsk.j === j;
      return `<div class="setrow ${showKg ? '' : 'nokg'} ${r.done ? 'is-done' : ''}" id="row-${i}-${j}"><span class="sn">${j + 1}</span>
      <div class="inl"><input class="num" type="number" inputmode="numeric" min="0" max="999" id="s-${i}-${j}" aria-label="Set ${j + 1} ${unitWord(it.x)}" placeholder="${it.targets[j] ?? it.targets[it.targets.length - 1]}" value="${esc(r.r)}" data-in="setr" data-i="${i}" data-j="${j}"><em>${e.k === 'hold' ? 's' : 'reps'}</em></div>
      ${showKg ? `<div class="inl"><input class="num" type="number" inputmode="decimal" step="0.5" min="0" max="200" id="k-${i}-${j}" aria-label="Set ${j + 1} added kg" placeholder="${it.load || 0}" value="${esc(r.kg)}" data-in="setkg" data-i="${i}" data-j="${j}"><em>+kg</em></div>` : ''}
      <button class="check ${r.done ? 'on' : ''}" aria-label="Set ${j + 1} done" aria-pressed="${r.done}" data-act="setdone" data-i="${i}" data-j="${j}">${CHECK}</button>
      ${askRir ? `<div class="rirask"><span class="small">Reps left in the tank?</span>${chips('rir', r.rir, 5, [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4+']], ` data-i="${i}" data-j="${j}"`)}</div>` : r.done && r.rir != null && r.rir !== '' && it.sec === 'main' ? `<button class="rirtag" data-act="riredit" data-i="${i}" data-j="${j}">${r.rir} left</button>` : ''}</div>`;
    }).join('');
    const alts = (e.alt || []).filter((a) => EX[a]);
    return `<div class="ex ${it.sec === 'prep' ? 'prep' : ''} ${done ? 'done' : ''}" id="ex-${i}"><div class="spread"><div><div class="eyebrow">${it.sec === 'prep' ? 'Prep' : 'Main'}${e.each ? ' · each side' : ''}</div><h3>${esc(e.n)}</h3><div class="small muted num">Target ${itemLine(it)}${it.sec === 'main' ? ` · stop with ${it.rir} in reserve` : ''}</div></div>${statusChip(it.status)}</div>
      ${howHTML(it.x)}<div class="stack">${rows}</div>
      <div class="row"><button class="btn sm" data-act="addset" data-i="${i}">+ Set</button><button class="btn sm ghost" data-act="delrow" data-i="${i}">− Set</button>${e.k === 'reps' ? `<button class="btn sm ghost" data-act="repcount" data-i="${i}">Count reps (beta)</button>` : ''}${alts.length ? `<select class="sm" id="swap-${i}" data-ch="swap" data-i="${i}" aria-label="Swap exercise"><option value="">Swap…</option>${alts.map((a) => `<option value="${a}">${esc(EX[a].n)}</option>`).join('')}</select>` : ''}</div></div>`;
  }).join('');
  const R = L.run;
  let runBlock = '';
  if (R) {
    const g = R.gps;
    runBlock = `<div class="ex" id="runblock"><div class="eyebrow">${R.alt === 'free' ? 'Free run' : R.full ? 'Main run' : 'Finisher'}${R.alt === 'run' ? ` · level ${R.lvl + 1}` : ''}</div><h3>${R.alt === 'walk' ? 'Brisk walk' : R.alt === 'free' ? 'Run' : 'Run-walk'}</h3>
      ${R.desc ? `<p class="small muted">${esc(R.desc)}. Easy pace: you can talk in full sentences.${R.why ? ' ' + esc(R.why) : ''}</p>` : ''}
      <label class="toggle ${R.gpsOn ? 'on' : ''}"><input type="checkbox" id="gpsOn" data-ch="gpson" ${R.gpsOn ? 'checked' : ''}> Track distance with GPS</label>
      ${g && g.km ? `<p class="small num">${g.km.toFixed(2)} km${g.pace ? ` · ${fmtPace(g.pace)} /km` : ''}</p>` : ''}
      <a class="btn runbtn" href="#timer" data-act="runtimer">${L.timer ? 'Open run timer' : R.alt === 'free' ? 'Start run' : 'Start run timer'}</a>
      ${R.alt !== 'free' ? `<span class="lbl">Did you finish it?</span>${chips('runcomp', R.completed, 3, [['yes', 'All of it'], ['part', 'Part'], ['no', 'Skipped']])}` : ''}
      <span class="lbl">How hard was the run? (1–10)</span>${chips('runeff', R.effort, 10)}</div>`;
  }
  return `<div class="sticky-head"><div><div class="eyebrow">${esc(L.phaseName || '')}${L.short ? ' · short' : ''}</div><h2>${esc(L.title)}</h2></div><div class="tile clock"><b data-elapsed class="num">${fmtDur((Date.now() - L.start) / 1000)}</b><span>Elapsed</span></div></div>
  ${blocks}${runBlock}
  ${L.items.length || (R && R.alt !== 'free') ? `<section class="card"><label class="f" for="addex">Add exercise<select id="addex" data-ch="addex"><option value="">Choose…</option>${Object.keys(EX).filter((x) => !EX[x].prep).map((x) => `<option value="${x}">${esc(EX[x].n)}</option>`).join('')}</select></label></section>` : ''}
  <section class="card"><div class="grid2"><button class="btn danger" data-act="wdiscard">Discard</button><button class="btn primary" data-act="wfinish">Finish &amp; check in</button></div>
  <p class="small muted">Only ticked sets are saved. An empty box counts as the target.</p></section>`;
}

export function viewTimer(M, ui) {
  const L = ui.live, tm = L.timer, R = L.run;
  const watch = tm.mode === 'watch';
  const finished = !watch && tm.idx >= tm.phases.length;
  const cls = finished ? '' : watch ? 'run' : tm.phases[tm.idx].t;
  return `<section class="card"><div class="timer ${cls}" id="timerBox">${timerInner(ui)}</div>
    ${R && R.gpsOn ? `<div class="grid3 gpsbox" id="gpsBox">${gpsInner(ui)}</div>` : ''}
    <div class="grid3">${finished ? `<button class="btn runbtn" data-act="tback" style="grid-column:1/-1">Back to the workout</button>` : `<button class="btn" data-act="tpause" id="tpauseBtn">${tm.running ? 'Pause' : 'Resume'}</button>${watch ? '<span></span>' : '<button class="btn" data-act="tskip">Skip phase</button>'}<button class="btn danger" data-act="tstop">${watch ? 'Finish run' : 'End'}</button>`}</div>
    <p class="small muted">Keep this screen open: the app keeps it awake, beeps at each change and counts down the last 3 seconds.</p></section>`;
}
export function timerInner(ui) {
  const tm = ui.live.timer;
  if (tm.mode === 'watch') { const el = ui.timerElapsed(); return `<span class="ph">${tm.running ? 'Running' : 'Paused'}</span><span class="big num">${fmtDur(el)}</span><span class="small muted">Free run</span>`; }
  if (tm.idx >= tm.phases.length) return `<span class="ph">Done</span><span class="big num">${fmtDur(tm.total || 0)}</span><span class="small muted">Great work. Rate the run back in the workout.</span>`;
  const ph = tm.phases[tm.idx], nx = tm.phases[tm.idx + 1], left = ui.timerLeft();
  const done = tm.phases.slice(0, tm.idx).reduce((a, p) => a + p.s, 0) + (ph.s - left), all = tm.phases.reduce((a, p) => a + p.s, 0);
  return `<span class="ph">${esc(ph.n)}</span><span class="big num">${fmtDur(Math.ceil(left))}</span><span class="small muted">${nx ? `Next: ${esc(nx.n)} · ${fmtDur(nx.s)}` : 'Last phase'}</span><div class="prog"><i style="width:${((done / all) * 100).toFixed(1)}%"></i></div>`;
}
export function gpsInner(ui) {
  const g = ui.gpsInfo();
  if (g.state === 'error') return `<p class="small warn" style="grid-column:1/-1">${esc(g.error)}</p>`;
  if (g.state === 'waiting' && !g.km) return `<p class="small muted" style="grid-column:1/-1">Waiting for GPS signal… Stand in the open for a few seconds.</p>`;
  return `<div class="tile"><b class="num">${g.km.toFixed(2)}</b><span>km</span></div><div class="tile"><b class="num">${fmtPace(g.cur)}</b><span>pace now /km</span></div><div class="tile"><b class="num">${fmtPace(g.avg)}</b><span>avg /km</span></div>`;
}

/* ===================== Check-in & edit ===================== */
export function viewCheckin(M, ui) {
  const s = ui.checkin; const p = s.post || {};
  const opt = (k) => chips('ci-' + k, p[k], 3, [['ok', 'Fine'], ['niggle', 'Niggle'], ['pain', 'Pain']]);
  return `<section class="card"><div class="eyebrow">Check-in · ${esc(s.title)}</div><h2>How did it go?</h2>
    <span class="lbl">Session effort <span class="muted">(1 easy · 10 max)</span></span>${chips('ci-rpe', p.rpe, 10)}
    <span class="lbl">Energy now <span class="muted">(1 wrecked · 5 great)</span></span>${chips('ci-energy', p.energy, 5)}
    <span class="lbl">Shoulders</span>${opt('sh')}<span class="lbl">Knee</span>${opt('kn')}
    ${s.run && s.run.alt !== 'walk' && !s.run.effort ? `<span class="lbl">Run effort (1–10)</span>${chips('ci-run', s.run.effort, 10)}` : ''}
    <label class="f" for="ci-notes">Notes<textarea id="ci-notes" data-in="cinotes" placeholder="What felt good, what to change, sleep, food…">${esc(p.notes || '')}</textarea></label>
    <div class="grid2"><button class="btn" data-act="cidone" data-v="skip">Skip</button><button class="btn primary" data-act="cidone">Save</button></div></section>`;
}

export function viewEdit(M, ui) {
  const s = ui.editDraft;
  const items = (s.items || []).map((it, i) => {
    const e = EX[it.x]; if (!e) return '';
    return `<div class="ex ${it.sec === 'prep' ? 'prep' : ''}"><div class="spread"><h3>${esc(e.n)}</h3><span class="small muted">${it.sec === 'prep' ? 'prep' : ''}</span></div>
      <div class="row">${it.sets.map((z, j) => `<div class="inl w86"><input class="num" type="number" inputmode="numeric" min="0" max="999" id="ed-${i}-${j}" aria-label="${esc(e.n)} set ${j + 1}" value="${esc(z.r)}" data-in="ed-r" data-i="${i}" data-j="${j}"><em>${e.k === 'hold' ? 's' : 'r'}</em></div>`).join('')}
      <button class="btn sm" data-act="ed-add" data-i="${i}" aria-label="Add set">+</button><button class="btn sm ghost" data-act="ed-del" data-i="${i}" aria-label="Remove set">−</button></div>
      ${loadable(it.x) ? `<div class="inl w160"><input class="num" type="number" step="0.5" min="0" max="200" inputmode="decimal" id="edkg-${i}" aria-label="${esc(e.n)} added kg" value="${esc(it.sets[0] ? it.sets[0].kg : 0)}" data-in="ed-kg" data-i="${i}"><em>+kg, all sets</em></div>` : ''}</div>`;
  }).join('');
  const R = s.run;
  return `<section class="card"><div class="eyebrow">${s.pending ? 'Fill in details' : 'Edit session'}</div><h2>${esc(s.title)}</h2>
    <div class="grid2"><label class="f" for="ed-date">Date<input type="date" id="ed-date" value="${dayKey(s.date)}" max="${dayKey(Date.now())}" data-in="ed-date"></label>
    <label class="f" for="ed-dur">Duration (min)<input class="num" type="number" min="0" max="600" id="ed-dur" value="${Math.round((s.dur || 0) / 60)}" data-in="ed-dur"></label></div>
    <p class="small muted">Each box is one set. Remove what you did not do; change what was different.</p></section>
  ${items}
  ${R ? `<section class="card"><h3>${R.alt === 'run' ? `Run-walk · level ${(+R.lvl || 0) + 1}` : RUN_ALTS[R.alt]}</h3><span class="lbl">Finished?</span>${chips('ed-runcomp', R.completed, 3, [['yes', 'All'], ['part', 'Part'], ['no', 'Skipped']])}
    <span class="lbl">Run effort</span>${chips('ed-runeff', R.effort, 10)}</section>` : ''}
  <section class="card"><span class="lbl">Session effort</span>${chips('ed-rpe', (s.post || {}).rpe, 10)}
    <div class="grid2"><button class="btn" data-act="ed-cancel">Cancel</button><button class="btn primary" data-act="ed-save">Save</button></div></section>`;
}

/* ===================== Progress ===================== */
export function viewProgress(M, ui) {
  const ws = M.weeks(12), lbl = ws.map((w) => fmtShort(w.s)), ph = M.phaseInfo(), cur = ws[ws.length - 1];
  const vol = Object.keys(VOL_TARGET).map((g) => { const v = cur.vol[g] || 0, [a, b] = VOL_TARGET[g], mx = 20; return `<div class="hbar"><span>${GROUPS[g]}</span><div class="tr"><s style="left:${(a / mx) * 100}%;width:${((b - a) / mx) * 100}%"></s><i style="width:${Math.min(100, (v / mx) * 100)}%"></i></div><span class="num r">${round1(v)}</span></div>`; }).join('');
  const xs = ['pullup', 'chinup', 'dip', 'pushup', 'invrow', 'splitsq', 'hipthrust'];
  const ent = M.histOf(ui.progX).slice(0, 6);
  const bw = M.weighins.map((w) => ({ x: +fromKey(w.d), y: w.kg }));
  const runPts = M.real.filter((s) => s.run && s.run.full && s.run.alt === 'run').slice().reverse().map((s) => ({ x: +new Date(s.date), y: (+s.run.lvl || 0) + 1 }));
  const kmPts = M.real.filter((s) => s.run && s.run.gps && s.run.gps.km > 0.2 && s.run.gps.pace).slice().reverse().map((s) => ({ x: +new Date(s.date), y: s.run.gps.pace }));
  const rdPts = M.real.filter((s) => s.ready && s.ready.score).slice().reverse().map((s) => ({ x: +new Date(s.date), y: s.ready.score }));
  const ban = M.banister(84);
  const tests = M.tests.slice().reverse().map((t) => `<tr><td>${fmtDate(fromKey(t.date))}</td>${TESTS.map(([k]) => `<td class="r">${t[k] || '–'}</td>`).join('')}<td class="r">${t.runMin || '–'}</td></tr>`).join('');
  const best = {};
  for (const s of M.real) for (const it of (s.items || [])) if (it.sec === 'main' && EX[it.x]) for (const z of it.sets || []) { if (!(+z.r > 0)) continue; const score = (+z.kg || 0) * 1000 + +z.r; if (!best[it.x] || score > best[it.x].score) best[it.x] = { score, r: +z.r, kg: +z.kg || 0, d: s.date }; }
  const prs = Object.entries(best).map(([x, b]) => `<tr><td>${esc(EX[x].n)}</td><td class="r">${u(x, b.r)}${b.kg ? ` @ +${b.kg} kg` : ''}</td><td class="r muted">${fmtShort(b.d)}</td></tr>`).join('');
  const rep = M.weeklyReport(ui.reportOffset);
  const lastRun = M.real.find((s) => s.run && s.run.gps && s.run.gps.route && s.run.gps.route.length > 1);
  return `<div class="grid3"><div class="tile"><b>${ph.week || 0}</b><span>Program week</span></div><div class="tile"><b>${ws.slice(-4).reduce((a, w) => a + w.count, 0)}</b><span>Sessions, 4 weeks</span></div><div class="tile"><b>${M.bwAt(Date.now())}</b><span>Bodyweight, kg</span></div></div>
  <section class="card"><div class="spread"><h3>Weekly report</h3><div class="seg"><button class="${ui.reportOffset === 1 ? 'on' : ''}" data-act="repoff" data-v="1">Last week</button><button class="${ui.reportOffset === 0 ? 'on' : ''}" data-act="repoff" data-v="0">This week</button></div></div>
    <pre class="report" id="reportText">${esc(rep.text)}</pre>
    <div class="row"><button class="btn sm" data-act="copyreport">Copy report</button><span class="small muted">Paste it to Claude for a review of your training.</span></div></section>
  <section class="card"><h3>Strength: estimated 1-rep max</h3><div class="row">${xs.map((x) => `<button class="btn sm ${x === ui.progX ? 'primary' : ''}" data-act="progx" data-v="${x}" aria-pressed="${x === ui.progX}">${esc(EX[x].n)}</button>`).join('')}</div>
    <p class="small muted">Body + added weight from your best set each session (Epley formula). Rising means you can move more weight.</p>
    ${lineChart({ series: [{ pts: M.e1rm(ui.progX), color: 'var(--bar)' }], fmt: (v) => v.toFixed(0) + ' kg', label: 'Estimated one-rep max' })}
    ${ent.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th class="r">Sets</th></tr></thead><tbody>${ent.map((h) => `<tr><td>${fmtDate(h.date)}</td><td class="r">${h.reps.map((r) => u(ui.progX, r)).join(' · ')}${h.kg ? ` @ +${h.kg} kg` : ''}${h.rir != null ? ` · ${round1(h.rir)} left` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
  <section class="card"><div class="spread"><h3>Fitness and fatigue</h3><div class="legend"><span><i style="background:var(--bar)"></i>Fitness (6 wk)</span><span><i style="background:var(--track)"></i>Fatigue (1 wk)</span></div></div>
    ${lineChart({ series: [{ pts: ban.pts.map((p) => ({ x: p.x, y: p.fit })), color: 'var(--bar)', dots: false }, { pts: ban.pts.map((p) => ({ x: p.x, y: p.fat })), color: 'var(--track)', dots: false, dash: true }], fmt: (v) => v.toFixed(0), zero: true, label: 'Fitness and fatigue', empty: 'Log a few sessions to see this.' })}
    <p class="small muted">Training load = session effort × minutes. Fitness is its 6-week average and fatigue its 1-week average (Banister model). When fatigue stays well above fitness and strength drops, the coach suggests deloading early.${ban.historyDays < 21 ? ' Needs 3 weeks of history to judge.' : ''}</p></section>
  <section class="card"><div class="spread"><h3>Hard sets this week</h3><span class="legend"><span><i style="background:var(--bar)"></i>done</span><span><i class="range"></i>growth range</span></span></div>
    <div class="stack">${vol}</div><p class="small muted">Working sets per muscle; secondary muscles count half.</p></section>
  <section class="card"><h3>Bodyweight</h3>${lineChart({ series: [{ pts: bw, color: 'var(--bar)' }], fmt: (v) => v.toFixed(1), label: 'Bodyweight', empty: 'Weigh in weekly from the Today tab.' })}<p class="small muted">Target for muscle gain: +0.25–0.5 kg a month. Protein ${Math.round(M.bwAt(Date.now()) * 1.6)}–${Math.round(M.bwAt(Date.now()) * 2.2)} g a day.</p></section>
  <section class="card"><h3>Weekly training time</h3><div class="legend"><span><i style="background:var(--bar)"></i>Strength</span><span><i style="background:var(--track)"></i>Running</span></div>
    ${barChart({ labels: lbl, series: [{ values: ws.map((w) => Math.round(w.strMin)), color: 'var(--bar)' }, { values: ws.map((w) => Math.round(w.runMin)), color: 'var(--track)' }], unit: ' min', label: 'Minutes per week' })}</section>
  <section class="card"><h3>Running</h3><p class="small muted">Run-walk level: 9 = 15 minutes nonstop, 12 = 30 minutes nonstop.</p>${lineChart({ series: [{ pts: runPts, color: 'var(--track)' }], fmt: (v) => 'L' + Math.round(v), label: 'Run-walk level' })}
    ${kmPts.length >= 2 ? `<span class="lbl">Average pace from GPS (up is faster)</span>${lineChart({ series: [{ pts: kmPts, color: 'var(--track)' }], fmt: fmtPace, invert: true, label: 'Pace' })}` : ''}
    ${lastRun ? `<span class="lbl">Last tracked route · ${fmtDate(lastRun.date)} · ${lastRun.run.gps.km.toFixed(2)} km</span>${routeSVG(lastRun.run.gps.route)}` : ''}</section>
  <section class="card"><h3>Readiness</h3>${lineChart({ series: [{ pts: rdPts, color: 'var(--warn)' }], fmt: (v) => v.toFixed(1), label: 'Readiness', empty: 'Fill in the readiness check before sessions to see this.' })}</section>
  <section class="card"><div class="spread"><h3>Consistency</h3><div class="legend"><span><i style="background:var(--bar)"></i>Strength</span><span><i style="background:var(--track)"></i>Run</span><span><i style="background:var(--warn)"></i>Test</span></div></div>${heatmap(M.real, M.weekStartOf, M.P.weekStart)}</section>
  <section class="card"><h3>Tests</h3>${tests ? `<div class="scroll"><table class="tbl"><thead><tr><th>Date</th>${TESTS.map(([, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Run min</th></tr></thead><tbody>${tests}</tbody></table></div>` : '<p class="empty">No tests yet.</p>'}</section>
  <section class="card"><h3>Best sets</h3>${prs ? `<div class="scroll"><table class="tbl"><thead><tr><th>Exercise</th><th class="r">Best</th><th class="r">Date</th></tr></thead><tbody>${prs}</tbody></table></div>` : '<p class="empty">Your best sets show here after your first sessions.</p>'}</section>`;
}

/* ===================== Plan & settings ===================== */
export function viewPlan(M, ui) {
  const P = M.P, ph = M.phaseInfo(), order = Array.from({ length: 7 }, (_, i) => (P.weekStart + i) % 7);
  const sched = order.map((d) => `<label class="f row-f" for="pd-${d}"><span>${DAYS_LONG[d]}</span><select id="pd-${d}" data-ch="planday" data-d="${d}"><option value="">Rest</option>${PROGRAM_TPLS.map((k) => `<option value="${k}" ${P.plan[d] === k ? 'selected' : ''}>${esc(TPL[k].name)}</option>`).join('')}</select></label>`).join('');
  const vals = Object.values(P.plan); const warn = [];
  for (const k of ['A', 'B', 'C']) if (!vals.includes(k)) warn.push(`${TPL[k].name} is not scheduled.`);
  for (let i = 0; i < 7; i++) { const a = P.plan[i], b = P.plan[(i + 1) % 7]; if (a && b && ['A', 'C'].includes(a) && ['A', 'C'].includes(b)) warn.push(`${DAYS_LONG[i]} and ${DAYS_LONG[(i + 1) % 7]} are both upper-body days. Leave a day between them.`); }
  const variants = Object.keys(EX).filter((b) => EX[b].next).map((b) => `<label class="f" for="var-${b}">${esc(EX[b].n)} slot<select id="var-${b}" data-ch="variant" data-b="${b}"><option value="${b}" ${M.vx(b) === b ? 'selected' : ''}>${esc(EX[b].n)}</option><option value="${EX[b].next}" ${M.vx(b) === EX[b].next ? 'selected' : ''}>${esc(EX[EX[b].next].n)}</option></select></label>`).join('');
  const r = +P.restHR || 65, mx = Math.round(208 - 0.7 * (+P.age || 21)), z2 = [Math.round(r + (mx - r) * 0.6), Math.round(r + (mx - r) * 0.7)];
  const d = ui.driveStatus; const dl = ui.local.drive;
  const syncTxt = { off: 'Not connected.', idle: 'Connected.', syncing: 'Syncing…', ok: `Synced ${dl.lastSync ? fmtAgo(dl.lastSync) : ''}.`, auth: 'Signed out of Google. Tap Sync to sign in.', error: d.message, offline: d.message };
  return `<section class="card"><div class="eyebrow">Program</div><h2>${ph.key === 'test' ? 'Not started: do the test day' : `Week ${ph.week} · ${esc(ph.name)}`}</h2>
    <div class="stack small"><div><b>Weeks 1–2 Re-entry</b> <span class="muted">· 50% of tested max, 4 reps in reserve, one set fewer.</span></div><div><b>Weeks 3–4 Rebuild</b> <span class="muted">· 65%, 3 in reserve, full sets.</span></div><div><b>Then 6-week blocks</b> <span class="muted">· 5 build weeks (reps, then belt weight; reps-in-reserve speeds up or holds increases) + 1 deload with a re-test. The coach can call an early deload when fatigue builds up.</span></div></div>
    ${P.programStart ? '<button class="btn sm danger" data-act="restart">Restart from Re-entry (after a long break)</button>' : ''}</section>
  <section class="card"><h3>Weekly schedule</h3><div class="stack">${sched}</div>
    ${warn.length ? warn.map((w) => `<div class="note warn"><span class="small">${esc(w)}</span></div>`).join('') : '<p class="small muted">Three strength days with a day between upper sessions, plus the optional run day.</p>'}
    <details class="how" data-key="why-split"><summary>Why this split</summary><ul>${PROGRAM_TPLS.map((k) => `<li><b>${esc(TPL[k].name)}:</b> ${esc(TPL[k].why)}</li>`).join('')}<li>Upper body twice a week (best for growth); legs once heavy plus running, which is kinder to the knee.</li><li>On a 3-day week, skip the run day: the upper days already end with a run-walk finisher.</li></ul></details></section>
  <section class="card"><h3>Reminders</h3><p class="small muted">Reminders come from your phone's calendar, so they work even when the app is closed.</p>
    <div class="grid2"><label class="f" for="trainTime">Training time<input type="time" id="trainTime" value="${esc(P.trainTime)}" data-ch="settxt" data-f="trainTime"></label><label class="f" for="morningTime">Shoulder routine time<input type="time" id="morningTime" value="${esc(P.morningTime)}" data-ch="settxt" data-f="morningTime"></label></div>
    <div class="grid2"><a class="btn" href="${esc(ui.gcal('train'))}" target="_blank" rel="noopener">Add training to Google Calendar</a><a class="btn" href="${esc(ui.gcal('morning'))}" target="_blank" rel="noopener">Add shoulder routine</a></div>
    <button class="btn ghost" data-act="ics">Download calendar file (.ics)</button></section>
  <section class="card"><h3>Google Drive sync</h3>
    ${drive.isConfigured() ? `<p class="small">${esc(syncTxt[d.state] || '')}</p>
      <div class="grid2">${drive.isConnected() ? `<button class="btn primary" data-act="sync">Sync now</button><a class="btn" href="${drive.folderUrl()}" target="_blank" rel="noopener">Open Drive folder</a>` : '<button class="btn primary" data-act="sync" style="grid-column:1/-1">Connect Google Drive</button>'}</div>
      <p class="small muted">Files in the "Bar &amp; Track" folder: your data (merged across devices), <b>Training log.csv</b> (every set; open with Google Sheets) and <b>Weekly reports.md</b>. The app can only see files it created.</p>
      ${drive.isConnected() ? '<button class="btn sm ghost danger" data-act="drivedisconnect">Disconnect</button>' : ''}`
    : `<p class="small">Drive sync needs a one-time Google setup (about 10 minutes). Follow <a href="https://github.com/abdelrahmansherifmedhat1134/bar-and-track/blob/main/docs/GOOGLE_DRIVE_SETUP.md" target="_blank" rel="noopener">the setup guide</a>, then paste your client ID here.</p>`}
    <details class="how" data-key="client-id"${drive.isConfigured() ? '' : ' open'}><summary>OAuth client ID</summary><label class="f" for="clientId">Client ID<input id="clientId" value="${esc(dl.clientId)}" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label><button class="btn sm" data-act="saveclient">Save client ID</button></details></section>
  <section class="card"><h3>Exercise versions</h3><p class="small muted">The coach suggests the harder version when you are ready; you can switch here too.</p><div class="grid2">${variants}</div></section>
  <section class="card"><h3>Body &amp; timers</h3><div class="grid2">
    <label class="f" for="age">Age<input class="num" type="number" min="12" max="90" id="age" value="${P.age}" data-ch="setnum" data-f="age"></label><label class="f" for="height">Height (cm)<input class="num" type="number" min="120" max="230" id="height" value="${P.height}" data-ch="setnum" data-f="height"></label>
    <label class="f" for="restHR">Resting heart rate<input class="num" type="number" min="30" max="110" id="restHR" value="${P.restHR}" data-ch="setnum" data-f="restHR"></label><label class="f" for="weekStart">Week starts on<select id="weekStart" data-ch="setnum" data-f="weekStart">${[6, 0, 1].map((x) => `<option value="${x}" ${x == P.weekStart ? 'selected' : ''}>${DAYS_LONG[x]}</option>`).join('')}</select></label>
    <label class="f" for="restMain">Rest, main lifts (s)<input class="num" type="number" min="30" max="600" step="15" id="restMain" value="${P.restMain}" data-ch="setnum" data-f="restMain"></label><label class="f" for="restAcc">Rest, accessories (s)<input class="num" type="number" min="15" max="600" step="15" id="restAcc" value="${P.restAcc}" data-ch="setnum" data-f="restAcc"></label></div>
    <div class="kv"><span>Estimated max HR</span><b class="num">${mx} bpm</b><span>Easy-run zone (Z2)</span><b class="num">${z2[0]}–${z2[1]} bpm</b><span>Protein target</span><b class="num">${Math.round(M.bwAt(Date.now()) * 1.6)}–${Math.round(M.bwAt(Date.now()) * 2.2)} g/day</b></div></section>
  <section class="card"><h3>Guides</h3><a class="btn" href="#guide">Belt safety, technique, knee and shoulder rules</a></section>
  ${ui.installable ? '<section class="card"><h3>Install</h3><p class="small muted">Adds the app to your home screen or desktop. It opens instantly and works offline.</p><button class="btn primary" data-act="install">Install Bar &amp; Track</button></section>' : ui.iosHint ? '<section class="card"><h3>Install on iPhone</h3><p class="small">In Safari tap Share, then <b>Add to Home Screen</b>.</p></section>' : ''}
  <section class="card"><h3>Data</h3><p class="small muted">Everything is stored on this device first${drive.isConnected() ? ' and synced to Google Drive' : ''}.</p>
    <div class="grid3"><button class="btn" data-act="exportjson">Export backup</button><button class="btn" data-act="exportcsv">Export CSV</button><label class="btn" for="importFile">Import backup<input type="file" id="importFile" accept="application/json,.json" data-ch="import" hidden></label></div>
    <p class="small muted">Version ${esc(ui.version)}</p></section>`;
}

export function viewGuide(M) {
  const G = (t, body, open) => `<details class="g" data-key="g-${t.length}"${open ? ' open' : ''}><summary>${t}</summary><div class="guide">${body}</div></details>`;
  const bw = M.bwAt(Date.now());
  return `<section class="card"><div class="eyebrow">Guides</div><h2>Training safely with your history</h2><p class="small muted">General coaching guidance, not medical advice. With a torn ACL, a physiotherapist's check before heavy leg work is worth it.</p></section>
  <section class="card stack">
  ${G('Weighted belt: setup and back safety', `<ul>
    <li>The belt sits on your hips, below the belly button, not around the lower back. The chain runs from the front of the belt, between your legs, through the plate and back up to the belt.</li>
    <li>Keep the chain short so the plate hangs around mid-thigh. A long chain swings and pulls you into an arched back.</li>
    <li>Brace before every rep: breathe in, tighten the abs as if about to be punched, squeeze the glutes. Ribs stay down; no big lower-back arch.</li>
    <li>Getting on and off: step up from a box into position with the plate already hanging; at the end, step back down onto the box. Never drop to the floor with the plate on.</li>
    <li>The coach adds 5 kg the first time, then 2.5 kg steps. If your lower back tires before your arms, the weight is too heavy.</li>
    <li>Back extensions, bird dogs and side planks on the lower-body and run days build the muscles that hold the spine steady.</li></ul>`, true)}
  ${G('Weighted pull-ups', '<ul><li>Hollow body: legs together, slightly in front, plate between the thighs. This stops the swing and keeps the lower back neutral.</li><li>Start every rep from a dead hang by pulling the shoulders down, then drive the elbows down.</li><li>Lower for 3 seconds to a full hang. No kipping.</li><li>Stop with the planned reps in reserve. Grinding ugly reps with weight is when elbows and shoulders get irritated.</li></ul>')}
  ${G('Weighted dips', '<ul><li>Lock out at the top with the shoulders pushed down, chest proud.</li><li>Small forward lean; lower until the upper arm is about parallel to the floor. Deeper dips with weight load the front of the shoulder.</li><li>Elbows go back, not out. 2–3 seconds down, no bounce.</li><li>If the front of the shoulder pinches: lighter weight, less depth, or use the shoulder flag.</li></ul>')}
  ${G('Shoulders: your routine', '<ul><li>Most mornings: prone Y-T-W raises 2 × 8 (hold each position 2 s) and bar pass-throughs 2 × 12. This is the routine that fixed the tendon feeling before; Today tracks it.</li><li>Every upper session starts with it as prep, plus scapular pull-ups or push-ups.</li><li>Warning signs: a pinch at the front of the shoulder in dips or deep push-ups, or pain that lasts into the next day. Use the shoulder flag; two check-ins with pain in a row means see a physio.</li></ul>')}
  ${G('Knee: rules with a torn ACL', '<ul><li>Not in this plan: pistol squats, jump squats, box jumps, sprints with sharp turns, anything that twists on a planted foot.</li><li>Leg work is controlled and in a straight line: split squats, low step-ups, single-leg RDLs, hip thrusts. The front knee tracks over the toes.</li><li>Hamstrings are prioritised (slider leg curls, RDLs). They pull the shin back and partly do the ACL\'s job.</li><li>Running stays on the straight track at easy pace with short steps.</li><li>The knee giving way, or swelling, means stop and get it checked.</li></ul>')}
  ${G('Reps in reserve and the return ramp', '<ul><li>"3 in reserve" means stop when you could still do about 3 more good reps. After a main set the app asks how many you had left; answering is optional but makes the progression smarter.</li><li>Re-entry and Rebuild feel too easy on purpose. Muscle comes back in weeks; tendons need longer, and most comeback injuries happen in the first month.</li><li>From Build onward: add a rep per set each session. When every set hits the top of the range the coach adds 2.5 kg. If you had 0 reps left it holds the weight; if you had plenty left it jumps faster.</li></ul>')}
  ${G('Eating for muscle', `<ul><li>Protein: ${Math.round(bw * 1.6)}–${Math.round(bw * 2.2)} g a day over 3–4 meals (eggs, chicken, tuna, foul, lentils, milk, yogurt, cheese).</li><li>A small surplus: aim for +0.25–0.5 kg a month on the scale; the coach tells you if the trend is off.</li><li>Sleep 7–9 h; it shows up in your readiness score.</li></ul>`)}
  ${G('Running for stamina', '<ul><li>All running here is easy: you can talk in full sentences. That builds the aerobic base that stops you tiring in everyday activities.</li><li>Move up a level only when the last one felt 6/10 or easier. Repeat it when it was 7–8.</li><li>GPS needs the screen on and the app open. Phone in hand or an armband gives the best signal.</li><li>Jump rope works as an extra on rest days: small low hops, 30 s on / 30 s off. Stop if the knee complains.</li></ul>')}
  ${G('Rep counter (beta)', '<ul><li>Uses the phone\'s motion sensor. Put the phone in a tight pocket or an armband so it moves with your body.</li><li>Works best for pull-ups, dips and push-ups at a steady tempo. Check the count and correct it with − / + before using it.</li></ul>')}
  </section>`;
}

export function repSheet(ui) {
  const r = ui.reps; if (!r) return '';
  const it = ui.live && ui.live.items[r.i]; if (!it) return '';
  return `<div class="sheet-backdrop" data-act="repclose"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Rep counter">
    <div class="spread"><h3>${esc(EX[it.x].n)}</h3><span class="chip">beta</span></div>
    <div class="repbig num" id="repCount" aria-live="polite">${r.count}</div>
    ${r.error ? `<p class="small warn">${esc(r.error)}</p>` : `<p class="small muted center">${r.on ? 'Counting… do your set.' : 'Phone in a tight pocket or armband, then tap Start.'}</p>`}
    <div class="grid3"><button class="btn" data-act="repminus" aria-label="One less">−</button><button class="btn ${r.on ? 'danger' : 'primary'}" data-act="reptoggle">${r.on ? 'Stop' : 'Start'}</button><button class="btn" data-act="repplus" aria-label="One more">+</button></div>
    <div class="grid2"><button class="btn ghost" data-act="repclose">Close</button><button class="btn primary" data-act="repuse" ${r.count ? '' : 'disabled'}>Use for next set</button></div></div>`;
}
