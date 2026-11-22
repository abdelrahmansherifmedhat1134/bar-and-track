// End-to-end check of the Android app on an emulator (run by .github/workflows/android-test.yml).
// Installs the release APK, opens it, drives the web UI over the WebView's DevTools protocol, puts the
// app in the background and turns the screen off during a run, and records what actually happened:
// native plugins, Google sign-in result, lock-screen controls, scheduled alarms, GPS with the screen
// off, console errors. Writes results.json, summary.md, screenshots and logcat to OUT.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PKG = 'io.github.abdelrahmansherifmedhat1134.barandtrack';
const APK = process.env.APK || '/tmp/apk/bar-and-track.apk';
const OUT = process.env.OUT || '/tmp/bt-test';
mkdirSync(OUT, { recursive: true });
const R = { steps: [], console: [], errors: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c, opt = {}) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, ...opt }).trim(); } catch (e) { return `ERR ${(e.stderr || e.message || '').toString().slice(0, 400)}`; } };
const adb = (c) => sh(`adb ${c}`);
let shotN = 0;
const shot = (name) => { const f = `${OUT}/${String(++shotN).padStart(2, '0')}-${name}.png`; sh(`adb exec-out screencap -p > "${f}"`, { shell: '/bin/bash' }); return f; };
const step = (name, ok, detail) => { R.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 600) : ''}`); };

/* ---------- DevTools protocol over the WebView socket ---------- */
let ws, msgId = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    const sock = adb(`shell grep -a -o 'webview_devtools_remote_[0-9]*' /proc/net/unix`).split('\n').find((l) => l.startsWith('webview_devtools_remote_'));
    if (sock) {
      adb(`forward tcp:9222 localabstract:${sock.trim()}`);
      try {
        const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
        const pg = pages.find((p) => /github\.io\/bar-and-track/.test(p.url) && p.webSocketDebuggerUrl) || pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        if (pg) {
          ws = new WebSocket(pg.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
          ws.onclose = () => { ws = null; };
          ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
            if (m.method === 'Runtime.consoleAPICalled') R.console.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400));
            if (m.method === 'Runtime.exceptionThrown') R.errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text);
          };
          await cdp('Runtime.enable');
          return pg.url;
        }
      } catch { /* not ready yet */ }
    }
    await sleep(1500);
  }
  throw new Error('WebView DevTools socket never appeared');
}
function cdp(method, params = {}) { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res) => { pending.set(id, res); setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ error: { message: 'cdp timeout' } }); } }, 30000); }); }
async function js(expr, retry = true) {
  if (!ws || ws.readyState !== 1) { R.console.push('[test] reconnecting to the WebView'); await connect(); }
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.error && retry && /timeout/.test(r.error.message)) { try { ws.close(); } catch { /* ignore */ } ws = null; return js(expr, false); }
  if (r.error) return { __error: r.error.message };
  if (r.result && r.result.exceptionDetails) return { __error: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text };
  return r.result && r.result.result ? r.result.result.value : undefined;
}
const click = (sel) => js(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing'; el.click(); return 'ok';`);
async function waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(`return !!(${expr});`); if (v === true) return true; await sleep(500); } return false; }

/* ---------- device helpers ---------- */
const notifications = () => adb('shell dumpsys notification --noredact');
const wake = () => { adb('shell input keyevent KEYCODE_WAKEUP'); adb('shell wm dismiss-keyguard'); };
const toFront = () => adb(`shell monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
function tapText(text) {
  adb('shell uiautomator dump /sdcard/ui.xml'); const xml = adb('shell cat /sdcard/ui.xml');
  const m = xml.match(new RegExp(`text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i')) || xml.match(new RegExp(`content-desc="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i'));
  if (!m) return false;
  adb(`shell input tap ${(+m[1] + +m[3]) >> 1} ${(+m[2] + +m[4]) >> 1}`); return true;
}

async function main() {
  step('install', !/ERR|Failure/.test(adb(`install -r -g "${APK}"`)));
  for (const p of ['POST_NOTIFICATIONS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) adb(`shell pm grant ${PKG} android.permission.${p}`);
  adb('emu geo fix 31.2357 30.0444');
  adb('shell settings put system screen_off_timeout 600000');
  wake(); toFront(); await sleep(6000);

  const url = await connect(); step('app loads the live site', /github\.io\/bar-and-track/.test(url), url);
  step('web app ready', await waitFor(`document.querySelector('#main .card')`, 40000));
  const ver = await js(`return (await import('./js/version.js')).VERSION;`); step('web version', !!ver, ver);
  shot('today');

  // native bridge
  const diag = await js(`const n = await import('./js/native.js'); return await n.diagnose();`);
  step('native bridge', diag && diag.native === true && diag.core === 'ok', diag);
  for (const p of ['BackgroundGeolocation', 'LocalNotifications', 'TextToSpeech', 'SocialLogin', 'RunControls']) step(`plugin ${p}`, !!(diag && diag.plugins && diag.plugins.includes(p)));

  // Google Drive connect (no Google account on the emulator: we expect a visible error, never silence)
  await js(`location.hash = '#plan';`); await sleep(1500);
  await click('[data-act=sync]'); await sleep(2500); shot('drive-connect-2s');
  const ui1 = adb('shell uiautomator dump /sdcard/ui.xml') && adb('shell cat /sdcard/ui.xml');
  const sheet = /com\.google\.android\.gms|Sign in|Choose an account|accounts/i.test(ui1);
  await sleep(10000); shot('drive-connect-12s');
  const dstat = await js(`const d = await import('./js/drive.js'); return { state: d.status.state, message: d.status.message, toast: document.querySelector('#toast') && !document.querySelector('#toast').hidden ? document.querySelector('#toast').textContent : '' };`);
  step('Drive connect gives a visible result', sheet || !!(dstat && (dstat.message || dstat.toast)), { googleSheetShown: sheet, ...dstat });
  const ui2 = adb('shell dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity"');
  if (!ui2.includes(PKG + '/.MainActivity')) { adb('shell input keyevent KEYCODE_BACK'); await sleep(1500); }
  toFront(); await sleep(2500);

  // voice
  const tts = await js(`const n = await import('./js/native.js'); return await n.speakNative('Testing the voice');`);
  step('native voice', tts === true, tts);

  // run: start the run-walk session D, start its timer, then background the app and turn the screen off
  await js(`location.hash = '#train';`); await sleep(1200);
  await click('[data-act=start][data-id=D]'); await sleep(1000);
  await click('[data-act=golive]'); await sleep(1500);
  await js(`const d = document.querySelector('details[data-key=jump]'); if (d) d.open = true;`);
  await click('[data-act=fjump][data-i=run]'); await sleep(1200);
  const gpsOn = await js(`const el = document.querySelector('#gpsOn'); if (el && !el.checked) el.click(); return !!(el && el.checked);`);
  await click('[data-act=runtimer]'); await sleep(2500); shot('run-timer');
  const t0 = await js(`const L = JSON.parse(localStorage.getItem('bt:live')).live; return { running: L.timer && L.timer.running, mode: L.timer && L.timer.mode, idx: L.timer && L.timer.idx, gpsOn: L.run.gpsOn };`);
  step('run timer started', t0 && t0.running === true && t0.mode === 'phases', { ...t0, gpsToggle: gpsOn });

  let lat = 30.0444, lon = 31.2357;
  const walk = async (n) => { for (let i = 0; i < n; i++) { lon += 0.0002; lat += 0.00005; adb(`emu geo fix ${lon.toFixed(5)} ${lat.toFixed(5)}`); await sleep(2500); } };
  const gpsNow = () => js(`const g = await import('./js/sensors.js'); return g.gps.track ? { fixes: g.gps.track.accepted, dist_m: Math.round(g.gps.track.dist), state: g.gps.state } : { state: g.gps.state };`);
  await walk(4); const gA = await gpsNow();
  step('GPS in the foreground', !!(gA && gA.fixes > 2), gA);
  adb('shell input keyevent KEYCODE_HOME'); await sleep(3000);
  await walk(4); const gB = await gpsNow();
  step('GPS with the app in the background', !!(gB && gA && gB.fixes > gA.fixes + 1), gB);
  const n1 = notifications();
  const ctl = /Run[- ]?walk|Run ·|Walk ·|part \d+\/\d+/i.test(n1) && /Pause/.test(n1);
  step('lock-screen run controls posted', ctl, (n1.match(/run_controls[\s\S]{0,600}/) || [''])[0].slice(0, 600));
  step('background GPS service running', /BackgroundGeolocation|Run in progress|run in progress/i.test(n1) || /foreground/i.test(adb(`shell dumpsys activity services ${PKG}`)));
  const alarms = adb(`shell dumpsys alarm`).split('\n').filter((l) => l.includes(PKG)).length;
  step('run/walk cues scheduled as alarms', alarms > 0, { alarmLines: alarms });

  // screen off, walk ~250 m in small GPS steps
  adb('shell input keyevent KEYCODE_SLEEP'); await sleep(2000);
  await walk(6);
  wake(); await sleep(1500);
  shot('lockscreen-or-home');

  // press Pause from the notification shade
  adb('shell cmd statusbar expand-notifications'); await sleep(1500); shot('notification-shade');
  const tapped = tapText('Pause'); await sleep(2000);
  adb('shell cmd statusbar collapse'); toFront(); await sleep(2500);
  const t1 = await js(`const L = JSON.parse(localStorage.getItem('bt:live')).live; const g = await import('./js/sensors.js'); const s = g.gps.snapshot ? g.gps.snapshot() : null; return { running: L.timer && L.timer.running, idx: L.timer && L.timer.idx, dist_m: g.gps.track ? Math.round(g.gps.track.dist) : (s && s.dist), fixes: g.gps.track ? g.gps.track.accepted : null, rejected: g.gps.track ? g.gps.track.rejected : null, state: g.gps.state, err: g.gps.error };`);
  step('Pause button on the notification works', tapped && t1 && t1.running === false, { tapped, ...t1 });
  step('GPS with the screen off', !!(t1 && gB && t1.fixes > (gB.fixes || 0) + 2), { before: gB, after: t1 });
  shot('back-in-app');

  // finish
  await js(`location.hash = '#workout';`); await sleep(800);
  await click('[data-act=wdiscard]'); await sleep(300); await click('[data-act=wdiscard]'); await sleep(1000);
  const n2 = notifications();
  step('controls removed after the run', !/part \d+\/\d+/.test(n2), null);
}

main().catch((e) => { R.fatal = String(e && e.stack || e); console.log('FATAL', R.fatal); })
  .finally(() => {
    writeFileSync(`${OUT}/logcat.txt`, sh(`adb logcat -d -v time`, { maxBuffer: 64 * 1024 * 1024 }).split('\n').filter((l) => /chromium|Capacitor|Console|BarAndTrack|SocialLogin|GoogleProvider|AndroidRuntime|FATAL|BackgroundGeolocation|LocalNotification|RunControls/i.test(l)).slice(-1500).join('\n'));
    writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 2));
    const md = ['## Android app check', '', '| Step | Result | Detail |', '|---|---|---|',
      ...R.steps.map((s) => `| ${s.name} | ${s.ok ? '✅' : '❌'} | ${s.detail === undefined || s.detail === null ? '' : '`' + JSON.stringify(s.detail).replace(/\|/g, '/').slice(0, 300) + '`'} |`),
      '', R.fatal ? '**Fatal:** `' + R.fatal.slice(0, 500) + '`' : '', '', '### Page errors', ...(R.errors.length ? R.errors.slice(0, 20).map((e) => '- `' + String(e).slice(0, 300) + '`') : ['none']),
      '', '### Console (last 40)', '```', ...R.console.slice(-40), '```'];
    writeFileSync(`${OUT}/summary.md`, md.join('\n'));
    process.exit(0);
  });
