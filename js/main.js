// App controller: boot, routing, rendering, user actions.
import morphdom from './vendor/morphdom.js';
import { store, requestPersistence } from './store.js';
import { createModel, readinessScore, readyZone, rampUp } from './program.js';
import { EX, TPL, TESTS } from './data.js';
import { dayKey, fromKey, gid, clone, fmtDur } from './util.js';
import { mergeStates } from './merge.js';
import { buildCSV, buildICS, gcalLink } from './export.js';
import { unlockAudio, beep, buzz, keepAwake, gps, motion, prefs, setPref, speak } from './sensors.js';
import { mountDemos } from './demos.js';
import * as native from './native.js';
import * as drive from './drive.js';
import * as V from './views.js';
import { VERSION } from './version.js';

const $ = (s) => document.querySelector(s);
const ROUTES = ['today', 'train', 'start', 'workout', 'timer', 'checkin', 'edit', 'progress', 'plan', 'guide'];
const TAB_OF = { start: 'train', workout: 'train', timer: 'train', checkin: 'train', edit: 'train', guide: 'plan' };

/* ---------------- transient UI state ---------------- */
let deferredInstall = null;
const ui = {
  view: 'today', startCtx: null, testForm: null, editDraft: null, checkin: null, progX: 'pullup', openHist: new Set(), reportOffset: 1,
  rirAsk: null, reps: null, hold: null, installable: false, version: VERSION,
  restLeft() { return restEnd ? (restEnd - Date.now()) / 1000 : 0; },
  holdElapsed() { const h = ui.hold; return h ? Math.max(0, (Date.now() - h.started) / 1000) : 0; },
  iosHint: /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone,
  get live() { return store.local.live; },
  get local() { return store.local; },
  get driveStatus() { return drive.status; },
  timerLeft() { const t = store.local.live.timer; return t.running ? Math.max(0, (t.end - Date.now()) / 1000) : t.left; },
  timerElapsed() { const t = store.local.live.timer; const end = t.running ? Date.now() : t.pausedAt || Date.now(); return Math.max(0, (end - t.started - (t.pausedMs || 0)) / 1000); },
  gpsInfo() {
    const tr = gps.track; const km = tr ? tr.dist / 1000 : 0;
    const el = timerRunSeconds();
    return { state: gps.state, error: gps.error, km, cur: tr ? tr.currentPace() : null, avg: km > 0.05 ? el / km : null };
  },
  gcal: (kind) => gcalLink(kind, store.state.profile, appUrl(), Intl.DateTimeFormat().resolvedOptions().timeZone)
};
const appUrl = () => location.origin + location.pathname;

/* ---------------- model cache ---------------- */
let M = null, Mver = -1;
const model = () => { if (Mver !== store.version) { M = createModel(store.state); Mver = store.version; } return M; };

/* ---------------- rendering ---------------- */
const VIEWS = { today: V.viewToday, train: V.viewTrain, start: V.viewStart, workout: V.viewWorkout, timer: V.viewTimer, checkin: V.viewCheckin, edit: V.viewEdit, progress: V.viewProgress, plan: V.viewPlan, guide: V.viewGuide };
let raf = 0;
function render() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderNow(); }); }
function renderNow() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const main = $('#main');
  const v = resolveView(ui.view);
  if (v !== ui.view) { ui.view = v; if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); }
  let html;
  try { html = VIEWS[ui.view](model(), ui); }
  catch (e) { console.error(e); html = `<section class="card"><h2>Something went wrong</h2><p class="small">${String(e && e.message || e).replace(/</g, '&lt;')}</p><a class="btn" href="#today">Back to Today</a></section>`; }
  morphdom(main, `<main id="main" class="view-${ui.view}">${html}</main>`, {
    onBeforeElUpdated(from, to) {
      if (from.tagName === 'DETAILS' && from.dataset.key && from.dataset.key === to.dataset.key) { if (from.open) to.setAttribute('open', ''); else to.removeAttribute('open'); }
      if (from === document.activeElement && (from.tagName === 'INPUT' || from.tagName === 'TEXTAREA' || from.tagName === 'SELECT')) return false;
      if (from.classList.contains('demo') && from.dataset.ex && from.dataset.ex === to.dataset.ex && from.className === to.className) return false; // keep the running animation
      return !from.isEqualNode(to);
    }
  });
  const tab = TAB_OF[ui.view] || ui.view;
  document.querySelectorAll('nav.tabs a').forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  mountDemos(main); syncRestbar();
  renderSyncPill(); renderSheet();
}
function renderSyncPill() {
  const el = $('#sync'); const st = drive.status.state;
  let txt = 'On this device', cls = '', act = false;
  if (drive.isConnected()) {
    act = true;
    if (st === 'syncing') { txt = 'Syncing…'; cls = 'busy'; act = false; }
    else if (st === 'auth') { txt = 'Sync'; cls = 'warn'; }
    else if (st === 'error') { txt = 'Sync failed'; cls = 'warn'; }
    else if (st === 'offline') { txt = 'Offline'; cls = 'warn'; }
    else if (store.local.dirty) { txt = 'Sync'; cls = ''; }
    else { txt = 'Synced'; cls = 'ok'; }
  }
  el.textContent = txt; el.className = 'pill ' + cls; el.disabled = !act;
  if (act) { el.dataset.act = 'sync'; el.title = drive.status.message || 'Sync with Google Drive'; } else { delete el.dataset.act; el.title = drive.isConnected() ? '' : 'Data is stored on this device. Connect Google Drive in Plan to sync.'; }
}
let sheetHTML = '';
function renderSheet() {
  const html = V.repSheet(ui) || V.holdSheet(ui);
  if (html === sheetHTML) return; sheetHTML = html;
  const el = $('#sheet'); el.innerHTML = html; el.hidden = !html; if (html) mountDemos(el);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200); }

/* ---------------- routing ---------------- */
/** Views that need transient state fall back to a safe view when that state is gone. */
function resolveView(v) {
  const L = store.local.live;
  if (!ROUTES.includes(v)) v = 'today';
  if (v === 'workout' && !L) v = 'train';
  if (v === 'timer' && !(L && L.timer)) v = L ? 'workout' : 'train';
  if (v === 'start' && !ui.startCtx) v = L ? 'workout' : 'train';
  if (v === 'checkin' && !ui.checkin) v = 'today';
  if (v === 'edit' && !ui.editDraft) v = 'train';
  return v;
}
function route() {
  const h = (location.hash || '').slice(1);
  const v = resolveView(h || 'today');
  const changed = v !== ui.view; ui.view = v;
  if (('#' + v) !== location.hash && h) history.replaceState(null, '', '#' + v);
  renderNow();
  if (changed) window.scrollTo(0, 0);
}
/** Navigate synchronously (no async hashchange race with state updates). */
function go(v) {
  const nv = resolveView(v), changed = nv !== ui.view; ui.view = nv;
  if (location.hash !== '#' + nv) history.pushState(null, '', '#' + nv);
  renderNow(); if (changed) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------------- rest timer ---------------- */
let restEnd = 0, restFired = true, restWarned = false;
const spokenDur = (sec) => { const m = Math.floor(sec / 60), r = Math.round(sec % 60); return [m ? `${m} minute${m > 1 ? 's' : ''}` : '', r ? `${r} seconds` : ''].filter(Boolean).join(' '); };
const focusOn = () => ui.view === 'workout' && prefs.focus && store.local.live && store.local.live.items.length;
/** In Focus view the rest countdown is the big card; elsewhere it is the bottom bar. */
function syncRestbar() { const b = $('#restbar'); const show = !!restEnd && !focusOn(); if (b.hidden === show) b.hidden = !show; }
function startRest(sec, label) {
  restEnd = Date.now() + sec * 1000; restFired = false; restWarned = sec <= 12; $('#restLbl').textContent = label; $('#restbar').classList.remove('over');
  const L = store.local.live; if (L) L.rest = { end: restEnd, label }; syncRestbar(); tickRest(); syncRestCues();
  const nx = L ? V.curStep(L) : null; speak(`Rest ${spokenDur(sec)}. Next: ${nx ? V.stepLabel(L, nx.S[nx.k]) : ''}`);
}
function hideRest() { const was = restEnd; restEnd = 0; native.cancelCues('rest'); $('#restbar').hidden = true; const L = store.local.live; if (L && L.rest) { L.rest = null; store.quiet(); } if (was && focusOn()) render(); }
/** Reopening the app mid-rest picks the countdown up where it really is. */
function resumeRest(L) {
  if (!L || !L.rest || !(L.rest.end > Date.now() - 15000)) { if (L) L.rest = null; return; }
  restEnd = L.rest.end; restFired = restEnd <= Date.now(); restWarned = restEnd - Date.now() < 10000; $('#restLbl').textContent = L.rest.label || 'Rest';
  if (restFired) { restEnd = 0; L.rest = null; } else syncRestbar();
}
function tickRest() {
  if (!restEnd) return; const left = (restEnd - Date.now()) / 1000, el = $('#restTime');
  if (left <= 0) {
    if (el.textContent !== 'Go') el.textContent = 'Go';
    $('#restbar').classList.add('over');
    if (!restFired) {
      restFired = true; beep(1046, 0.25); setTimeout(() => beep(1318, 0.3), 260); buzz([200, 100, 200]);
      const L = store.local.live; if (L) { const c = V.curStep(L); speak(`Go. ${V.stepLabel(L, c.S[c.k])}`); }
      if (focusOn()) { restEnd = 0; const L2 = store.local.live; if (L2) L2.rest = null; store.quiet(); render(); return; } // auto-advance to the next set
    }
    if (left < -20) hideRest(); return;
  }
  if (!restWarned && left <= 10) { restWarned = true; speak('10 seconds'); }
  if (left <= 3 && left > 0 && Math.ceil(left) !== tickRest.last) { tickRest.last = Math.ceil(left); beep(660, 0.08); }
  const txt = fmtDur(Math.ceil(left)); if (el.textContent !== txt) el.textContent = txt;
  const fr = $('#focusRest'); if (fr && fr.textContent !== txt) fr.textContent = txt;
}

function restAdd(sec) {
  if (!restEnd) return;
  restEnd = Math.max(Date.now(), restEnd + sec * 1000); restFired = false; $('#restbar').classList.remove('over');
  const L = store.local.live; if (L && L.rest) { L.rest.end = restEnd; store.quiet(); }
  tickRest(); syncRestCues();
}
function timerToggle() {
  const L = store.local.live, t = L && L.timer; if (!t) return;
  if (t.running) { t.left = ui.timerLeft(); t.running = false; t.pausedAt = Date.now(); speak('Paused'); }
  else { t.running = true; if (t.mode === 'phases') t.end = Date.now() + t.left * 1000; t.pausedMs = (t.pausedMs || 0) + (Date.now() - (t.pausedAt || Date.now())); t.pausedAt = 0; speak('Resumed'); }
  saveLive(); renderNow(); syncCues();
}
function timerSkip() {
  const L = store.local.live, t = L && L.timer; if (!t || t.mode !== 'phases') return;
  if (t.running) t.end = Date.now(); else { t.idx++; if (t.idx < t.phases.length) t.left = t.phases[t.idx].s; else finishTimer('yes'); }
  saveLive(); tickTimer(); syncCues();
}
/** Android app: while you are in another app, a heads-up 10 s before a rest ends and when it is over. */
function syncRestCues() {
  if (!native.isApp) return;
  const L = store.local.live;
  if (!restEnd || !L || !document.hidden || restEnd - Date.now() < 3000) { native.cancelCues('rest'); return; }
  const c = V.curStep(L), next = V.stepLabel(L, c.S[c.k], false);
  native.scheduleCues([{ at: restEnd - 10000, title: '10 seconds of rest left', body: `Next: ${next}` }, { at: restEnd, title: 'Rest over. Go!', body: next }], 'rest');
}
/** Android app: the ongoing lock-screen notification with a live countdown and pause/skip buttons. */
function controlsState() {
  const L = store.local.live; if (!L) return null;
  const t = L.timer;
  if (t && t.mode === 'phases' && t.idx < t.phases.length) {
    const ph = t.phases[t.idx], nx = t.phases[t.idx + 1], part = `${t.idx + 1}/${t.phases.length}`;
    return t.running
      ? { title: `${ph.n} · part ${part}`, text: nx ? `Next: ${nx.n} ${fmtDur(nx.s)}` : 'Last part', endsAt: Math.round(t.end), actions: [{ id: 'pause', label: 'Pause' }, { id: 'skip', label: 'Skip' }] }
      : { title: `Paused · ${ph.n}`, text: `${fmtDur(Math.ceil(t.left))} left in this part`, endsAt: 0, actions: [{ id: 'resume', label: 'Resume' }, { id: 'skip', label: 'Skip' }] };
  }
  if (t && t.mode !== 'phases') return t.running ? { title: 'Run in progress', text: 'Stopwatch running', endsAt: 0, actions: [{ id: 'pause', label: 'Pause' }] } : { title: 'Run paused', text: 'Tap Resume to continue', endsAt: 0, actions: [{ id: 'resume', label: 'Resume' }] };
  if (restEnd > Date.now()) {
    const c = V.curStep(L);
    return { title: 'Rest', text: `Next: ${V.stepLabel(L, c.S[c.k], false)}`, endsAt: Math.round(restEnd), actions: [{ id: 'rest30', label: '+30 s' }, { id: 'restskip', label: 'Skip rest' }] };
  }
  return null;
}
function onControl(a) {
  const L = store.local.live; if (!L) return;
  if ((a === 'pause' && L.timer && L.timer.running) || (a === 'resume' && L.timer && !L.timer.running)) timerToggle();
  else if (a === 'skip') timerSkip();
  else if (a === 'rest30') restAdd(30);
  else if (a === 'restskip') hideRest();
  render();
}
function syncControls() { if (native.isApp) native.setControls(controlsState(), onControl); }

/* ---------------- hold countdown ---------------- */
function startHold(i, j, w) {
  const L = store.local.live, it = L.items[i]; const row = w ? it.wrows[j] : it.rows[j];
  const total = Math.max(5, +row.r > 0 && !row.done ? +row.r : V.targetOf(it, j, w));
  hideRest(); ui.hold = { i, j, w, total, started: Date.now() + 3000, lead: 3, warned: total <= 12, last: -1 }; L.hold = { ...ui.hold }; store.quiet();
  beep(660, 0.1); speak(`${EX[it.x].n}. ${total} seconds. Starting in 3`); keepAwake(true); renderSheet();
}
function tickHold() {
  const h = ui.hold; if (!h) return;
  const now = Date.now(), el = $('#holdTime'), sub = $('#holdSub');
  if (now < h.started) { const s = Math.ceil((h.started - now) / 1000); if (s !== h.last) { h.last = s; beep(660, 0.08); } if (el) el.textContent = String(s); return; }
  if (h.lead) { h.lead = 0; beep(1046, 0.2); buzz(80); if (sub) sub.textContent = `of ${fmtDur(h.total)}`; }
  const left = h.total - ui.holdElapsed();
  if (!h.warned && left <= 10) { h.warned = true; speak('10 seconds left'); }
  const s = Math.ceil(left); if (s <= 3 && s > 0 && s !== h.last) { h.last = s; beep(660, 0.08); }
  if (left <= 0) { beep(1318, 0.4); buzz([200, 80, 200]); speak('Done'); finishHold(h.total); return; }
  const txt = fmtDur(s); if (el && el.textContent !== txt) el.textContent = txt;
}
function finishHold(secs) {
  const h = ui.hold; ui.hold = null; if (store.local.live) { store.local.live.hold = null; store.quiet(); } keepAwake(!!(store.local.live && store.local.live.timer && store.local.live.timer.running)); sheetHTML = null; renderSheet();
  const L = store.local.live; if (!h || !L || secs < 1) { render(); return; }
  const it = L.items[h.i]; const row = h.w ? it.wrows[h.j] : it.rows[h.j];
  row.r = String(Math.round(secs)); if (!row.done) markDone(h.i, h.j, h.w); else saveLive();
}

/* ---------------- interval / run timer ---------------- */
function timerRunSeconds() {
  const L = store.local.live; const t = L && L.timer; if (!t) return 0;
  if (t.mode === 'watch') return ui.timerElapsed();
  const done = t.phases.slice(0, Math.min(t.idx, t.phases.length)).reduce((a, p) => a + p.s, 0);
  if (t.idx >= t.phases.length) return done;
  return done + (t.phases[t.idx].s - ui.timerLeft());
}
/** In the Android app, hand the run/walk switches to Android as scheduled notifications while the
 *  app is in the background or the screen is off; in the foreground the app's own beeps and voice do it. */
function syncCues() {
  if (!native.isApp) return;
  const L = store.local.live, t = L && L.timer;
  if (!t || !t.running || t.mode !== 'phases' || !document.hidden) { native.cancelCues(); return; }
  const list = []; let at = t.end;
  for (let i = t.idx + 1; i < t.phases.length; i++) {
    const ph = t.phases[i];
    list.push({ at, title: `${ph.n} · ${fmtDur(ph.s)}`, body: `${ph.t === 'run' ? 'Run' : 'Walk'} now. Part ${i + 1} of ${t.phases.length}.` });
    at += ph.s * 1000;
  }
  list.push({ at, title: 'Run complete', body: 'Great work. Open Bar & Track to save it.' });
  native.scheduleCues(list);
}
function startTimer() {
  const L = store.local.live, R = L.run;
  if (L.timer) { go('timer'); return; }
  const now = Date.now();
  L.timer = R.alt === 'free' || !R.phases
    ? { mode: 'watch', running: true, started: now, pausedMs: 0, pausedAt: 0 }
    : { mode: 'phases', phases: R.phases, idx: 0, running: true, end: now + R.phases[0].s * 1000, started: now, pausedMs: 0, left: R.phases[0].s };
  if (R.gpsOn) { gps.start(); gps.setPhase(L.timer.mode === 'watch' ? 'run' : R.phases[0].t); }
  beep(784, 0.3); keepAwake(!native.isApp); hideRest(); native.prepareRuns();
  store.setLocal({ live: L }); go('timer');
}
function finishTimer(completed) {
  const L = store.local.live, t = L.timer, R = L.run;
  const secs = timerRunSeconds();
  if (gps.track || gps.watchId != null) { const s = gps.stop(secs); if (s && s.km > 0) R.gps = s; }
  R.secs = Math.round(secs); delete R.gpsSnap;
  if (completed && R.alt !== 'free' && !R.completed) R.completed = completed;
  if (t.mode === 'phases') { t.running = false; t.total = secs; t.idx = Math.max(t.idx, t.phases.length); } else L.timer = null;
  keepAwake(false); native.cancelCues(); store.setLocal({ live: L });
}
let lastBeep = -1, lastSnap = 0;
function tickTimer() {
  const L = store.local.live; const t = L && L.timer; if (!t || !t.running) return;
  if (t.mode === 'phases') {
    let changed = false;
    while (t.running && t.end <= Date.now()) {
      t.idx++; lastBeep = -1; changed = true;
      if (t.idx >= t.phases.length) { beep(1318, 0.5); buzz([300, 100, 300]); speak('Run complete. Great work.'); finishTimer('yes'); render(); return; }
      const ph = t.phases[t.idx]; t.end += ph.s * 1000; gps.setPhase(ph.t);
    }
    const quiet = native.isApp && document.hidden; // the scheduled notification already cued it
    if (changed && !quiet) { const ph = t.phases[t.idx]; speak(`${ph.n}. ${spokenDur(ph.s)}`); }
    if (changed && quiet) { store.setLocal({ live: L }); return; }
    if (changed) { const ph = t.phases[t.idx]; beep(ph.t === 'run' ? 1318 : 784, 0.35); buzz(ph.t === 'run' ? [400] : [150, 80, 150]); store.setLocal({ live: L }); if (ui.view === 'timer') renderNow(); return; }
    const s = Math.ceil(ui.timerLeft()); if (s <= 3 && s > 0 && s !== lastBeep) { lastBeep = s; beep(660, 0.09); }
  }
  if (ui.view === 'timer') { const box = $('#timerBox'); if (box) box.innerHTML = V.timerInner(ui); const g = $('#gpsBox'); if (g) g.innerHTML = V.gpsInner(ui); }
  if (gps.track && Date.now() - lastSnap > 10000) { lastSnap = Date.now(); L.run.gpsSnap = gps.snapshot(); store.quiet(); }
}
setInterval(() => {
  if (!store.local) return; // still loading
  tickRest(); tickTimer(); tickHold(); syncControls();
  const L = store.local.live;
  if (L) document.querySelectorAll('[data-elapsed]').forEach((el) => { const v = fmtDur((Date.now() - L.start) / 1000); if (el.textContent !== v) el.textContent = v; });
}, 250);
document.addEventListener('visibilitychange', () => { if (!store.local) return; syncCues(); syncRestCues(); if (!document.hidden) { tickRest(); tickTimer(); autoSyncIfStale(); } });

/* ---------------- sessions ---------------- */
function newSessionFromPlan(mode) {
  const c = ui.startCtx, T = TPL[c.tpl], pl = model().planSession(c.tpl, c), now = Date.now();
  return {
    id: gid('s_'), type: 'session', kind: T.kind, tpl: c.tpl, title: T.name + (c.short ? ' (short)' : ''), date: new Date(now).toISOString(), dur: c.short ? 1800 : 3600,
    mode, pending: mode === 'later', short: c.short, ready: c.rd && c.rd.score ? { ...c.rd } : null, fasted: !!c.fasted, phase: c.phase.key,
    items: pl.items.map((i) => ({ x: i.x, sec: i.sec, plan: { targets: i.targets, load: i.load }, sets: i.targets.map((t) => ({ r: t, kg: i.load || 0 })) })),
    run: pl.run ? { alt: pl.run.alt, full: pl.run.full, lvl: pl.run.lvl, completed: mode === 'quick' ? 'yes' : null, effort: null } : null
  };
}
function goLive() {
  const c = ui.startCtx, T = TPL[c.tpl], test = T.kind === 'test';
  const pl = test ? model().planTest(c) : model().planSession(c.tpl, c);
  const live = {
    id: gid('s_'), tpl: c.tpl, kind: T.kind, title: T.name + (c.short ? ' (short)' : ''), start: Date.now(), short: !!c.short, phaseName: test ? 'Guided test' : c.phase.name, phase: c.phase.key,
    ready: c.rd && c.rd.score ? { ...c.rd } : null, fasted: !!c.fasted, timer: null, cur: null, bw: test ? (ui.testForm && ui.testForm.bw) || '' : undefined,
    items: pl.items.map((i) => ({ ...i, wrows: (i.warm || []).map((w) => ({ t: w.t, l: w.l, r: '', kg: '', done: false })), rows: Array.from({ length: i.sets }, () => ({ r: '', kg: '', rir: null, done: false })) })),
    run: pl.run ? { ...pl.run, completed: null, effort: null, gpsOn: test ? gps.supported() : !!pl.run.full && pl.run.alt === 'run' } : null
  };
  ui.startCtx = null; ui.testForm = null; store.setLocal({ live }); requestPersistence(); go('workout');
  const c0 = V.curStep(live); speak(`Let's go. First: ${V.stepLabel(live, c0.S[c0.k])}`);
}
function startFreeRun() {
  const live = { id: gid('s_'), tpl: 'F', kind: 'run', title: 'Free run', start: Date.now(), short: false, phaseName: 'Free run', phase: model().phaseInfo().key, ready: null, fasted: model().isFastDay(Date.now()), timer: null, items: [],
    run: { alt: 'free', full: false, lvl: 0, phases: null, desc: '', completed: 'yes', effort: null, gpsOn: gps.supported() } };
  store.setLocal({ live }); go('workout');
}
function finishLive() {
  const L = store.local.live;
  if (L.timer && L.timer.running) finishTimer(L.timer.mode === 'phases' ? 'part' : 'yes');
  if (L.kind === 'test') { finishTest(L); return; }
  const items = L.items.map((it) => {
    const o = {
      x: it.x, sec: it.sec, plan: { targets: it.targets, load: it.load },
      sets: it.rows.map((r, j) => ({ r, j })).filter(({ r }) => r.done).map(({ r, j }) => {
        const z = { r: r.r === '' ? (it.targets[j] ?? it.targets[0]) : +r.r, kg: r.kg === '' ? (it.load || 0) : +r.kg };
        if (r.rir != null && r.rir !== '') z.rir = +r.rir; return z;
      })
    };
    // Ramp-up sets are kept apart from `sets`, so progress, volume and e1RM never count them.
    const warm = (it.wrows || []).filter((r) => r.done).map((r) => ({ r: r.r === '' ? r.t : +r.r, kg: r.kg === '' ? r.l || 0 : +r.kg }));
    if (warm.length) o.warm = warm;
    return o;
  }).filter((i) => i.sets.length);
  const R = L.run;
  const ranSomething = R && (R.completed && R.completed !== 'no' || (R.gps && R.gps.km > 0) || R.secs > 60);
  if (!items.length && !ranSomething) { toast('Tick at least one set (or do the run) before finishing.'); return; }
  const dur = Math.round((Date.now() - L.start) / 1000);
  const rec = {
    id: L.id, type: 'session', kind: L.kind, tpl: L.tpl, title: L.title, date: new Date(L.start).toISOString(), dur: L.tpl === 'F' && R && R.secs ? R.secs : dur,
    mode: 'live', pending: false, short: L.short, ready: L.ready, fasted: !!L.fasted, phase: L.phase, items,
    run: R ? { alt: R.alt, full: R.full, lvl: R.lvl, completed: R.alt === 'free' ? 'yes' : (R.completed || 'no'), effort: R.effort, ...(R.gps ? { gps: R.gps } : {}) } : null
  };
  if (gps.watchId != null) gps.stop(0);
  keepAwake(false); hideRest(); ui.rirAsk = null; closeReps();
  store.putRecord(rec); store.setLocal({ live: null });
  ui.checkin = clone(rec); go('checkin');
}
/** Guided test → the same test record the manual form saves. */
function finishTest(L) {
  const t = {};
  for (const it of L.items) if (it.sec === 'test') { const r = it.rows.find((x) => x.done && +x.r > 0); if (r) t[it.testKey] = Math.round(+r.r); }
  const R = L.run; if (L.timer && L.timer.running) finishTimer('yes');
  if (R && R.secs >= 30) t.runMin = Math.round((R.secs / 60) * 10) / 10;
  if (!TESTS.some(([k]) => t[k] > 0) && !t.runMin) { toast('Finish at least one test (enter the reps and tap Done) before saving.'); return; }
  const startBefore = model().programStart, date = dayKey(L.start);
  const bw = +L.bw > 30 && +L.bw < 200 ? Math.round(+L.bw * 10) / 10 : null;
  if (bw) store.putRecord({ id: 'w_' + date, type: 'weigh', d: date, kg: bw });
  const warm = L.items.filter((it) => it.sec === 'prep').map((it) => ({ x: it.x, sec: 'prep', plan: { targets: it.targets, load: 0 }, sets: it.rows.filter((r) => r.done).map((r, j) => ({ r: r.r === '' ? it.targets[j] ?? it.targets[0] : +r.r, kg: 0 })) })).filter((i) => i.sets.length);
  const rec = { id: L.id, type: 'session', kind: 'test', tpl: 'T', title: 'Test day', date: new Date(L.start).toISOString(), dur: Math.round((Date.now() - L.start) / 1000), mode: 'live', pending: false, fasted: !!L.fasted, items: warm, test: { date, ...t, bw },
    ...(R && R.secs ? { run: { alt: 'test', full: true, lvl: 0, completed: 'yes', effort: R.effort, secs: R.secs, ...(R.gps ? { gps: R.gps } : {}) } } : {}) };
  if (gps.watchId != null) gps.stop(0);
  keepAwake(false); hideRest(); ui.rirAsk = null; ui.hold = null; closeReps();
  store.putRecord(rec);
  if (!startBefore) store.updateProfile({ programStart: date });
  else if (!store.state.profile.programStart) store.updateProfile({ programStart: startBefore });
  store.setLocal({ live: null }); speak('Test saved.'); toast('Test saved. The plan is set from your numbers.'); go('today');
}
function discardLive() { native.cancelCues(); ui.hold = null; sheetHTML = null; if (gps.watchId != null) gps.stop(0); keepAwake(false); hideRest(); closeReps(); ui.rirAsk = null; store.setLocal({ live: null }); go('train'); }

/** Tick (or untick) one set, start the right rest, and move Focus on to the next set. */
function markDone(i, j, w) {
  const L = store.local.live, it = L.items[i]; if (!it) return;
  const e = EX[it.x], r = w ? it.wrows[j] : it.rows[j]; if (!r) return;
  if (!r.done && it.sec === 'test' && !(+r.r > 0)) { toast('Enter how many clean reps you did, then tap Done.'); const inp = document.getElementById(`fs-${i}-${j}`) || document.getElementById(`s-${i}-${j}`); if (inp) inp.focus(); return; }
  r.done = !r.done;
  if (r.done) {
    if (r.r === '') r.r = String(V.targetOf(it, j, w));
    if (!w && (e.wlo || e.always) && r.kg === '' && it.sec !== 'test') r.kg = String(it.load || 0);
    if (w && r.kg === '') r.kg = String(r.l || 0);
    buzz(30);
    const S = V.stepsOf(L); const k = S.findIndex((st) => !st.run && st.i === i && st.j === j && !!st.w === !!w);
    const nx = S.slice(k + 1).find((st) => st.run || !V.rowAt(L, st).done);
    const nextSame = nx && !nx.run && nx.i === i;
    const P = store.state.profile;
    const sec = w ? 60 : it.sec === 'test' ? 210 : it.sec === 'prep' ? (e.timer ? 15 : 45) : e.main ? P.restMain : P.restAcc;
    // carry on from here (so starting with any exercise works), not from the top of the list
    const after = S.slice(k + 1).concat(S.slice(0, k)).find((st) => st.run ? !(L.run.completed || L.run.secs) : !V.rowAt(L, st).done);
    L.cur = after ? S.indexOf(after) : null;
    if (after) startRest(after.run ? 30 : nextSame && after === nx ? sec : Math.max(sec, it.sec === 'prep' ? 30 : sec), `Rest · next: ${V.stepLabel(L, after, false)}`);
    else hideRest();
    ui.rirAsk = !w && it.sec === 'main' ? { i, j } : null;
  } else { r.rir = null; if (ui.rirAsk && ui.rirAsk.i === i && ui.rirAsk.j === j) ui.rirAsk = null; }
  saveLive(); if (focusOn()) window.scrollTo(0, 0);
}

/* ---------------- rep counter sheet ---------------- */
function closeReps() { if (motion.on) motion.stop(); ui.reps = null; renderSheet(); }
motion.onRep = (n) => { if (ui.reps) { ui.reps.count = n + (ui.reps.offset || 0); const el = $('#repCount'); if (el) el.textContent = ui.reps.count; else renderSheet(); } };

/* ---------------- Drive sync scheduling ---------------- */
let autoT = null;
function scheduleAutoSync(delay = 5000) {
  clearTimeout(autoT);
  autoT = setTimeout(() => { if (drive.isConnected() && drive.hasValidToken() && navigator.onLine) drive.sync(); }, delay);
}
function autoSyncIfStale() { if (drive.isConnected() && drive.hasValidToken() && (store.local.dirty || Date.now() - (store.local.drive.lastSync || 0) > 60_000)) scheduleAutoSync(800); }
drive.onStatus((st) => {
  renderSyncPill(); if (ui.view === 'plan') render();
  // Persist a program start recovered from test history so every device stores it.
  if (st.state === 'ok') { const M0 = model(); if (M0.programStart && !store.state.profile.programStart) store.updateProfile({ programStart: M0.programStart }); }
});
window.addEventListener('online', () => autoSyncIfStale());
// While the app is open, pull changes from the other device every couple of minutes.
setInterval(() => { if (!document.hidden && drive.isConnected() && drive.hasValidToken() && navigator.onLine && Date.now() - (store.local.drive.lastSync || 0) > 120_000) drive.sync(); }, 30_000);
window.addEventListener('focus', () => autoSyncIfStale());

/* ---------------- downloads & import ---------------- */
function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/** Accepts this app's backup, or the export from the earlier Claude-hosted version. */
function normalizeImport(j) {
  if (j && j.app === 'bar-and-track' && j.records && j.profile) return { profile: j.profile, records: j.records };
  if (j && j.profile && Array.isArray(j.sessions)) {
    const t = Date.now(), records = {}; const p = j.profile;
    for (const s of j.sessions) if (s && s.id && ['str', 'run', 'test'].includes(s.kind)) { const id = 's_' + String(s.id).replace(/^s2?_/, ''); records[id] = { ...s, id, type: 'session', updatedAt: t }; }
    for (const w of p.weighins || []) records['w_' + w.d] = { id: 'w_' + w.d, type: 'weigh', d: w.d, kg: w.kg, updatedAt: t };
    for (const d of p.prehab || []) records['p_' + d] = { id: 'p_' + d, type: 'prehab', d, updatedAt: t };
    const keep = ['age', 'height', 'restHR', 'restMain', 'restAcc', 'weekStart', 'plan', 'variant', 'programStart'];
    const profile = { ...store.state.profile }; for (const k of keep) if (p[k] != null) profile[k] = p[k];
    profile.updatedAt = t; return { profile, records };
  }
  return null;
}

/* ---------------- events ---------------- */
function arm(b, fn) {
  if (b.dataset.armed) { fn(); return; }
  b.dataset.armed = '1'; const old = b.textContent; b.textContent = 'Tap again to confirm'; b.classList.add('armed');
  setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.textContent = old; b.classList.remove('armed'); } }, 3000);
}
const saveLive = () => store.setLocal({ live: store.local.live });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  unlockAudio();
  const a = b.dataset.act, d = b.dataset, L = store.local.live;
  if (a.startsWith('rd-')) { const c = ui.startCtx; c.rd = c.rd || {}; c.rd[a.slice(3)] = +d.v; c.rd.score = readinessScore(c.rd); c.zone = readyZone(c.rd.score); render(); return; }
  if (a.startsWith('ci-')) { const s = ui.checkin; s.post = s.post || {}; const k = a.slice(3); if (k === 'run') s.run.effort = +d.v; else s.post[k] = isNaN(+d.v) ? d.v : +d.v; render(); return; }
  switch (a) {
    case 'start': {
      if (L) { toast('Finish or discard the workout in progress first.'); go('workout'); break; }
      if (d.id === 'T') { ui.startCtx = { tpl: 'T', phase: model().phaseInfo(), fasted: model().isFastDay(Date.now()) }; ui.testForm = { pull: '', dip: '', push: '', row: '', runMin: '', bw: model().bwAt(Date.now()), date: dayKey(Date.now()) }; }
      else ui.startCtx = model().ctxFor(d.id);
      go('start'); break;
    }
    case 'freerun': if (L) { toast('Finish or discard the workout in progress first.'); go('workout'); } else startFreeRun(); break;
    case 'flag': ui.startCtx[d.v] = !ui.startCtx[d.v]; render(); break;
    case 'short': ui.startCtx.short = d.v === '1'; render(); break;
    case 'golive': goLive(); break;
    case 'goquick': { const r = store.putRecord(newSessionFromPlan('quick')); ui.startCtx = null; ui.checkin = clone(r); toast('Saved as planned.'); go('checkin'); break; }
    case 'golater': { store.putRecord(newSessionFromPlan('later')); ui.startCtx = null; toast('Saved. Add the details from Today when you have a minute.'); go('today'); break; }
    case 'setdone': markDone(+d.i, +d.j, d.w === '1'); break;
    case 'wmode': setPref('focus', d.v === '1'); L && (L.cur = null); syncRestbar(); render(); break;
    case 'fnav': { if (!L) break; const c = V.curStep(L); const k = Math.min(c.S.length - 1, Math.max(0, c.k + +d.v)); L.cur = k; hideRest(); ui.rirAsk = null; saveLive(); window.scrollTo(0, 0); break; }
    case 'fjump': { if (!L) break; const S = V.stepsOf(L); let k;
      if (d.i === 'run') k = S.findIndex((x) => x.run);
      else { const i = +d.i; k = S.findIndex((x) => !x.run && x.i === i && !V.rowAt(L, x).done); if (k < 0) k = S.findIndex((x) => !x.run && x.i === i); }
      if (k >= 0) { L.cur = k; hideRest(); ui.rirAsk = null; const det = document.querySelector('details[data-key=jump]'); if (det) det.open = false; saveLive(); window.scrollTo(0, 0); } break; }
    case 'holdgo': if (L) startHold(+d.i, +d.j, d.w === '1'); break;
    case 'holdstop': if (ui.hold) { const el = ui.holdElapsed(); if (ui.hold.lead && Date.now() < ui.hold.started) { ui.hold = null; if (L) { L.hold = null; store.quiet(); } sheetHTML = null; renderSheet(); } else finishHold(Math.min(ui.hold.total, el)); } break;
    case 'holdcancel': ui.hold = null; if (L) { L.hold = null; store.quiet(); } sheetHTML = null; renderSheet(); break;
    case 'voicetest': speak('Pull-ups, set 1 of 3. 8 reps.', true); break;
    case 'locsettings': native.openLocationSettings(); break;
    case 'diag': native.diagnose().then((r) => { ui.diag = r; render(); }); break;
    case 'fastday': { const v = +d.v, cur = store.state.profile.fastDays || []; store.updateProfile({ fastDays: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort() }); break; }
    case 'rir': { const r = L.items[+d.i].rows[+d.j]; r.rir = +d.v; ui.rirAsk = null; saveLive(); break; }
    case 'riredit': ui.rirAsk = { i: +d.i, j: +d.j }; render(); break;
    case 'addset': L.items[+d.i].rows.push({ r: '', kg: '', rir: null, done: false }); saveLive(); break;
    case 'delrow': { const it = L.items[+d.i]; if (it.rows.length > 1 && !it.rows[it.rows.length - 1].done) it.rows.pop(); saveLive(); break; }
    case 'repcount': ui.reps = { i: +d.i, count: 0, offset: 0, on: false, error: '' }; renderSheet(); break;
    case 'reptoggle': {
      const r = ui.reps; if (!r) break;
      if (r.on) { motion.stop(); r.on = false; renderSheet(); break; }
      r.error = ''; r.offset = r.count; r.on = true; renderSheet();
      motion.start().catch((err) => { r.on = false; r.error = err.message; renderSheet(); });
      break;
    }
    case 'repminus': if (ui.reps) { ui.reps.count = Math.max(0, ui.reps.count - 1); ui.reps.offset = ui.reps.count - motion.count; sheetHTML = null; renderSheet(); } break;
    case 'repplus': if (ui.reps) { ui.reps.count++; ui.reps.offset = ui.reps.count - motion.count; sheetHTML = null; renderSheet(); } break;
    case 'repclose': closeReps(); break;
    case 'repuse': {
      const r = ui.reps; if (!r || !L) break; const it = L.items[r.i]; if (!it) { closeReps(); break; }
      let j = it.rows.findIndex((x) => !x.done); if (j < 0) { it.rows.push({ r: '', kg: '', rir: null, done: false }); j = it.rows.length - 1; }
      it.rows[j].r = String(r.count); closeReps(); markDone(r.i, j, false); break;
    }
    case 'runcomp': L.run.completed = d.v; saveLive(); break;
    case 'runeff': L.run.effort = +d.v; saveLive(); break;
    case 'runtimer': e.preventDefault(); startTimer(); break;
    case 'tpause': timerToggle(); break;
    case 'tskip': timerSkip(); break;
    case 'tstop': arm(b, () => { const t = L.timer; finishTimer(t.mode === 'phases' ? (t.idx >= t.phases.length - 1 ? 'yes' : 'part') : 'yes'); if (L.timer && L.timer.mode === 'phases') L.timer = null; saveLive(); go('workout'); }); break;
    case 'tback': L.timer = null; native.cancelCues(); saveLive(); go('workout'); break;
    case 'wfinish': finishLive(); break;
    case 'wdiscard': arm(b, discardLive); break;
    case 'rest': if (d.v === 'skip') hideRest(); else restAdd(+d.v); break;
    case 'cidone': {
      const s = ui.checkin; ui.checkin = null;
      if (s && d.v !== 'skip') { const n = $('#ci-notes'); s.post = s.post || {}; if (n) s.post.notes = n.value.trim(); store.putRecord(s); toast('Check-in saved.'); }
      go('today'); break;
    }
    case 'savetest': {
      const f = ui.testForm;
      if (!TESTS.some(([k]) => +f[k] > 0)) { toast('Enter at least one test result.'); break; }
      const startBefore = model().programStart;
      const date = f.date && f.date <= dayKey(Date.now()) ? f.date : dayKey(Date.now());
      const t = { date }; TESTS.forEach(([k]) => { if (+f[k] > 0) t[k] = Math.round(+f[k]); }); if (+f.runMin > 0) t.runMin = +f.runMin;
      const bw = +f.bw > 30 && +f.bw < 200 ? +f.bw : null;
      if (bw) store.putRecord({ id: 'w_' + date, type: 'weigh', d: date, kg: bw });
      store.putRecord({ id: gid('s_'), type: 'session', kind: 'test', tpl: 'T', title: 'Test day', date: new Date(+fromKey(date) + 12 * 3600e3).toISOString(), dur: 2400, mode: 'quick', pending: false, items: [], test: { ...t, bw } });
      // First test (or first after a restart) starts the program; a re-test keeps the current week.
      if (!startBefore) store.updateProfile({ programStart: date });
      else if (!store.state.profile.programStart) store.updateProfile({ programStart: startBefore });
      ui.testForm = null; ui.startCtx = null; toast('Test saved. The plan is set from your numbers.'); go('today'); break;
    }
    case 'edit': { const s = store.state.records[d.id]; if (s && !s.deleted) { ui.editDraft = clone(s); go('edit'); } break; }
    case 'ed-add': { const it = ui.editDraft.items[+d.i]; const last = it.sets[it.sets.length - 1] || { r: EX[it.x].lo, kg: 0 }; it.sets.push({ r: last.r, kg: last.kg }); render(); break; }
    case 'ed-del': ui.editDraft.items[+d.i].sets.pop(); render(); break;
    case 'ed-runcomp': ui.editDraft.run.completed = d.v; render(); break;
    case 'ed-runeff': ui.editDraft.run.effort = +d.v; render(); break;
    case 'ed-rpe': ui.editDraft.post = ui.editDraft.post || {}; ui.editDraft.post.rpe = +d.v; render(); break;
    case 'ed-cancel': ui.editDraft = null; history.length > 1 ? history.back() : go('train'); break;
    case 'ed-save': {
      const s = ui.editDraft; s.pending = false;
      s.items.forEach((it) => { it.sets = it.sets.filter((z) => +z.r > 0); }); s.items = s.items.filter((it) => it.sets.length);
      store.putRecord(s); ui.editDraft = null; toast('Saved.'); go('today'); break;
    }
    case 'pastlog': {
      const tid = $('#pastTpl').value; const dt = $('#pastDate').value && $('#pastDate').value <= dayKey(Date.now()) ? $('#pastDate').value : dayKey(Date.now());
      ui.startCtx = model().ctxFor(tid); const s = newSessionFromPlan('later'); ui.startCtx = null;
      s.date = new Date(+fromKey(dt) + 12 * 3600e3).toISOString(); if (s.run) s.run.completed = 'yes';
      ui.editDraft = s; go('edit'); break;
    }
    case 'hist': ui.openHist.has(d.id) ? ui.openHist.delete(d.id) : ui.openHist.add(d.id); render(); break;
    case 'delsess': arm(b, () => { store.deleteRecord(d.id); ui.openHist.delete(d.id); toast('Deleted.'); }); break;
    case 'prehab': { const k = dayKey(Date.now()), id = 'p_' + k; if (model().prehab.has(k)) store.deleteRecord(id); else { store.putRecord({ id, type: 'prehab', d: k }); buzz(30); } break; }
    case 'weigh': {
      const v = +(($('#wIn') || {}).value); if (!(v > 30 && v < 200)) { toast('Enter your weight in kg.'); break; }
      const k = dayKey(Date.now()); store.putRecord({ id: 'w_' + k, type: 'weigh', d: k, kg: Math.round(v * 10) / 10 }); toast('Weight saved.'); break;
    }
    case 'variant': { const [base, nx] = String(d.id).split(':'); if (EX[nx]) { store.updateProfile({ variant: { ...store.state.profile.variant, [base]: nx } }); toast(`Switched to ${EX[nx].n}.`); } break; }
    case 'deloadnow': { const ph = model().phaseInfo(); if (ph.week) store.updateProfile({ deloadWeeks: [...new Set([...(store.state.profile.deloadWeeks || []), ph.week])] }); toast('This week is now a deload week.'); break; }
    case 'progx': ui.progX = d.v; render(); break;
    case 'repoff': ui.reportOffset = +d.v; render(); break;
    case 'copyreport': { const t = $('#reportText').textContent; navigator.clipboard.writeText(t).then(() => toast('Report copied.'), () => toast('Copy failed. Select the text and copy it.')); break; }
    case 'restart': arm(b, () => { store.updateProfile({ programStart: null, restartedAt: dayKey(Date.now()), deloadWeeks: [] }); toast('Program reset. Do a test day to start again.'); go('today'); }); break;
    case 'sync': {
      if (!drive.isConfigured()) { go('plan'); break; }
      if (native.isApp && !drive.hasValidToken()) toast('Opening Google sign-in…');
      drive.sync({ interactive: true }).then((m) => { if (m) toast(m.localChanged ? 'Synced. Data from your other device was merged in.' : 'Synced with Google Drive.'); else if (drive.status.message) toast(drive.status.message); });
      break;
    }
    case 'drivedisconnect': arm(b, () => { drive.disconnect(); toast('Disconnected from Google Drive. Data stays on this device.'); render(); }); break;
    case 'saveclient': {
      const v = ($('#clientId').value || '').trim();
      if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { toast('That does not look like a client ID. It ends in .apps.googleusercontent.com'); break; }
      store.setDrive({ clientId: v }); drive.preload(); drive.initialStatus(); toast(v ? 'Client ID saved. Tap Connect Google Drive.' : 'Client ID cleared.'); break;
    }
    case 'ics': download('bar-and-track-reminders.ics', 'text/calendar', buildICS(store.state.profile, appUrl())); break;
    case 'exportjson': download(`bar-and-track-backup-${dayKey(Date.now())}.json`, 'application/json', JSON.stringify({ app: 'bar-and-track', schema: 1, exportedAt: new Date().toISOString(), profile: store.state.profile, records: store.state.records })); break;
    case 'exportcsv': download(`bar-and-track-log-${dayKey(Date.now())}.csv`, 'text/csv', buildCSV(model())); break;
    case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; ui.installable = false; render(); }); } break;
    case 'reload': { const w = window.__waitingSW; if (w) w.postMessage('skipWaiting'); else location.reload(); break; }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target, k = t.dataset.in; if (!k) return; const d = t.dataset, L = store.local.live;
  if ((k === 'setr' || k === 'setkg') && L) { const it = L.items[+d.i]; const row = d.w === '1' ? it.wrows[+d.j] : it.rows[+d.j]; if (row) { row[k === 'setr' ? 'r' : 'kg'] = t.value; store.quiet(); } }
  else if (k === 'livebw' && L) { L.bw = t.value; store.quiet(); }
  else if (k === 'test' && ui.testForm) ui.testForm[d.f] = t.value;
  else if (k === 'cinotes' && ui.checkin) { ui.checkin.post = ui.checkin.post || {}; ui.checkin.post.notes = t.value; }
  else if (ui.editDraft) {
    const s = ui.editDraft;
    if (k === 'ed-r') s.items[+d.i].sets[+d.j].r = t.value === '' ? 0 : +t.value;
    else if (k === 'ed-kg') s.items[+d.i].sets.forEach((z) => { z.kg = +t.value || 0; });
    else if (k === 'ed-date' && t.value) { const old = new Date(s.date); const nd = fromKey(t.value); nd.setHours(old.getHours(), old.getMinutes()); s.date = nd.toISOString(); }
    else if (k === 'ed-dur') s.dur = Math.max(0, +t.value || 0) * 60;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target, k = t.dataset.ch; if (!k) return; const d = t.dataset, L = store.local.live, P = store.state.profile;
  switch (k) {
    case 'startpick': if (t.value) { const v = t.value; t.value = ''; if (L) { go('workout'); break; } ui.startCtx = model().ctxFor(v); go('start'); } break;
    case 'swap': if (t.value && L) {
      const it = L.items[+d.i]; const p = model().presc(t.value, it.rows.length, { phase: model().phaseInfo(), zone: L.ready ? readyZone(L.ready.score) : 'green', short: L.short });
      Object.assign(it, { x: t.value, targets: p.targets, load: p.load, status: p.status, rir: p.rir });
      if (it.sec === 'main') it.wrows = rampUp(t.value, p).map((w) => ({ t: w.t, l: w.l, r: '', kg: '', done: false })); it.rows.forEach((r) => { if (!r.done) { r.r = ''; r.kg = ''; } }); t.value = ''; saveLive();
    } break;
    case 'addex': if (t.value && L) { const p = model().presc(t.value, 3, { phase: model().phaseInfo(), zone: 'green', short: L.short }); L.items.push({ ...p, sec: 'main', base: t.value, rows: Array.from({ length: p.sets }, () => ({ r: '', kg: '', rir: null, done: false })) }); t.value = ''; saveLive(); } break;
    case 'gpson': if (L && L.run) { L.run.gpsOn = t.checked; if (L.timer && L.timer.running) { if (t.checked && gps.watchId == null) gps.start(); if (!t.checked && gps.watchId != null) { const s = gps.stop(timerRunSeconds()); if (s && s.km) L.run.gps = s; } } saveLive(); } break;
    case 'pref': setPref(d.k, t.checked); if (d.k === 'voice' && t.checked) speak('Voice cues on.'); render(); break;
    case 'planday': { const plan = { ...P.plan }; if (t.value) plan[d.d] = t.value; else delete plan[d.d]; store.updateProfile({ plan }); break; }
    case 'variant': store.updateProfile({ variant: { ...P.variant, [d.b]: t.value } }); break;
    case 'setnum': { const v = +t.value; if (!isFinite(v) || t.value === '') { render(); break; } const min = +t.min || -Infinity, max = +t.max || Infinity; store.updateProfile({ [d.f]: Math.min(max, Math.max(min, v)) }); break; }
    case 'settxt': if (t.value) store.updateProfile({ [d.f]: t.value }); break;
    case 'import': {
      const f = t.files && t.files[0]; if (!f) break;
      f.text().then((txt) => {
        let j; try { j = JSON.parse(txt); } catch { toast('That file is not a Bar & Track backup.'); return; }
        const n = normalizeImport(j); if (!n) { toast('That file is not a Bar & Track backup.'); return; }
        const m = mergeStates(store.state, n);
        const before = Object.keys(store.state.records).length;
        store.replaceSynced(m.profile, m.records); store.setLocal({ dirty: true }); scheduleAutoSync(1000);
        toast(`Imported. ${Object.keys(m.records).length - before} new records.`);
      }).finally(() => { t.value = ''; });
      break;
    }
  }
});

/* ---------------- service worker & install ---------------- */
function showUpdate() { $('#updatebar').hidden = false; }
/* Updates: check when the app opens, when you come back to it (at most every 10 min) and when the
 * connection returns. A new version is applied by itself only at a safe moment: right after opening,
 * or when you leave the app, and never during a workout or while you're typing. Otherwise the
 * Update bar shows and you choose. */
const bootAt = Date.now(); let swReg = null, lastUpdateCheck = 0;
const safeToUpdate = () => !store.local.live && !ui.checkin && !ui.reps && !ui.hold && !document.querySelector('input:focus, textarea:focus, select:focus');
function applyUpdate(w) { if (w) w.postMessage('skipWaiting'); }
function onUpdateReady(w) {
  window.__waitingSW = w;
  if (Date.now() - bootAt < 15000 && safeToUpdate()) applyUpdate(w); else showUpdate();
}
function checkForUpdate(force = false) {
  if (!swReg || !navigator.onLine) return;
  if (!force && Date.now() - lastUpdateCheck < 10 * 60 * 1000) return;
  lastUpdateCheck = Date.now(); swReg.update().catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    swReg = reg; lastUpdateCheck = Date.now(); // registering already checked for a new version
    if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(w); });
    });
    setInterval(() => checkForUpdate(true), 60 * 60 * 1000);
  }).catch((e) => console.warn('SW registration failed', e));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
    else if (window.__waitingSW && safeToUpdate()) applyUpdate(window.__waitingSW); // reloads while you're away
  });
  window.addEventListener('online', () => checkForUpdate(true));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && window.__waitingSW) { reloaded = true; location.reload(); } });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; ui.installable = true; if (ui.view === 'plan') render(); });
window.addEventListener('appinstalled', () => { ui.installable = false; deferredInstall = null; toast('Installed.'); });
window.addEventListener('pagehide', () => { store.persistNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) store.persistNow(); });

/* ---------------- boot ---------------- */
(async function boot() {
  await store.load();
  store.subscribe((synced) => { render(); if (synced) scheduleAutoSync(); });
  const L = store.local.live;
  if (L && L.timer && L.timer.running && L.run && L.run.gpsOn) { gps.start(L.run.gpsSnap); keepAwake(!native.isApp); }
  if (native.isApp) document.documentElement.classList.add('in-app');
  resumeRest(L);
  if (L && L.hold && L.items[L.hold.i]) { // a hold was running when the app closed
    ui.hold = { ...L.hold, lead: Date.now() < L.hold.started ? L.hold.lead : 0, last: -1 };
    if (ui.holdElapsed() >= ui.hold.total) setTimeout(() => finishHold(ui.hold.total), 0); else keepAwake(true);
  }
  // Older versions could lose the program start date in sync; store the recovered one.
  { const M0 = model(); if (M0.programStart && !store.state.profile.programStart) store.updateProfile({ programStart: M0.programStart }); }
  drive.initialStatus();
  if (drive.isConfigured()) drive.preload().then(() => { if (drive.isConnected() && drive.hasValidToken()) scheduleAutoSync(1500); });
  gps.onUpdate = () => { if (ui.view === 'timer') { const g = $('#gpsBox'); if (g) g.innerHTML = V.gpsInner(ui); } };
  document.documentElement.classList.add('ready');
  route();
  if (Object.keys(store.state.records).length > 1) requestPersistence();
})();
