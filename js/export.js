// Exports: CSV training log, calendar reminders (.ics and Google Calendar links). Pure.
import { EX, TESTS, TPL, RUN_ALTS } from './data.js';
import { dayKey, pad, addDays } from './util.js';

const csvCell = (v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** One row per set (plus one per run / test). Oldest first. */
export function buildCSV(model) {
  const rows = [['date', 'session', 'logging', 'section', 'exercise', 'set', 'reps_or_seconds', 'added_kg', 'reps_in_reserve', 'bodyweight_kg', 'readiness', 'session_effort', 'run_km', 'notes']];
  for (const s of model.sessions.slice().reverse()) {
    const d = dayKey(s.date), bw = model.bwAt(s.date), rd = s.ready && s.ready.score ? s.ready.score.toFixed(1) : '';
    const rpe = (s.post && s.post.rpe) || '', notes = (s.post && s.post.notes) || '';
    const mode = s.pending ? 'pending' : s.mode;
    for (const it of s.items || []) (it.sets || []).forEach((z, j) => rows.push([d, s.title, mode, it.sec, EX[it.x] ? EX[it.x].n : it.x, j + 1, z.r, z.kg || 0, z.rir ?? '', bw, rd, rpe, '', notes]));
    if (s.run) {
      const lbl = s.run.alt === 'run' ? `Run-walk level ${(+s.run.lvl || 0) + 1}` : RUN_ALTS[s.run.alt] || 'Run';
      rows.push([d, s.title, mode, 'run', lbl, '', s.run.completed || '', '', '', bw, rd, s.run.effort || rpe, s.run.gps && s.run.gps.km ? s.run.gps.km.toFixed(2) : '', notes]);
    }
    if (s.test) rows.push([d, 'Test day', mode, 'test', TESTS.map(([k, l]) => `${l} ${s.test[k] ?? '-'}`).join(' / ') + ` / run ${s.test.runMin ?? '-'} min`, '', '', '', '', s.test.bw || bw, '', '', '', notes]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function nextOn(days, hhmm, now) {
  for (let i = 0; i < 8; i++) { const d = addDays(now, i); if (days.includes(d.getDay())) { const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); if (d > now || i > 0) return d; } }
  return addDays(now, 1);
}
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

export function trainingDays(P) { return Object.keys(P.plan || {}).filter((d) => TPL[P.plan[d]]).map(Number).sort(); }

export function buildICS(P, appUrl, now = new Date()) {
  const days = trainingDays(P);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bar and Track//EN', 'CALSCALE:GREGORIAN'];
  const ev = (uid, title, desc, start, mins, rrule, alarmMin) => {
    const end = new Date(+start + mins * 60000);
    lines.push('BEGIN:VEVENT', `UID:${uid}@bar-and-track`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `RRULE:${rrule}`,
      `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(desc)}`, `URL:${appUrl}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM', 'END:VEVENT');
  };
  if (days.length) ev('train-' + days.join(''), 'Training · Bar & Track', `Open the app: ${appUrl}`, nextOn(days, P.trainTime || '18:00', now), 60, `FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAYS[d]).join(',')}`, 15);
  ev('shoulder-routine', 'Shoulder routine (5 min)', 'Prone Y-T-W raises 2 × 8, bar pass-throughs 2 × 12. Tick it in the app.', nextOn([0, 1, 2, 3, 4, 5, 6], P.morningTime || '08:00', now), 10, 'FREQ=DAILY', 0);
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function gcalLink(kind, P, appUrl, tz, now = new Date()) {
  const days = trainingDays(P);
  const training = kind === 'train';
  const start = training ? nextOn(days.length ? days : [now.getDay()], P.trainTime || '18:00', now) : nextOn([0, 1, 2, 3, 4, 5, 6], P.morningTime || '08:00', now);
  const end = new Date(+start + (training ? 60 : 10) * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: training ? 'Training · Bar & Track' : 'Shoulder routine (5 min)',
    details: training ? `Open the app: ${appUrl}` : 'Prone Y-T-W raises 2 × 8, bar pass-throughs 2 × 12.',
    dates: `${stamp(start)}/${stamp(end)}`,
    recur: training ? `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAYS[d]).join(',')}` : 'RRULE:FREQ=DAILY'
  });
  if (tz) q.set('ctz', tz);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
