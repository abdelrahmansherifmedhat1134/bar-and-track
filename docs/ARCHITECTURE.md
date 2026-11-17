# Architecture

Plain ES modules, no framework, no build step. GitHub Pages serves the repository root as-is.

```
index.html            app shell (header, main, bottom tabs, rest bar, sheet)
manifest.webmanifest  install metadata          sw.js  offline cache (versioned)
css/app.css           all styles, design tokens, light + dark
js/
  main.js      controller: boot, routing, rendering, all user actions, timers
  views.js     HTML templates for every screen (pure functions of model + ui state)
  program.js   training logic: phases, prescriptions, run ladder, volume, Banister model, coach notes, weekly report
  data.js      exercise library, templates, run-walk ladder
  store.js     local-first store: IndexedDB + synchronous localStorage journal (crash-safe)
  merge.js     last-writer-wins merge of two states (records + tombstones)
  drive.js     Google Identity Services token flow + Drive REST sync
  export.js    CSV log, .ics reminders, Google Calendar links
  sensors.js   audio, vibration, wake lock, GPS watcher, motion sensor
  gpsmath.js   GPS filtering, distance, splits, route projection (pure)
  repcount.js  accelerometer rep detector (pure)
  charts.js    SVG charts
  util.js      dates and formatting
  version.js   app version (keep in sync with sw.js via `npm run bump`)
  vendor/morphdom.js  DOM diffing (MIT) so re-renders keep focus and scroll
tests/        node:test unit tests (run in CI)
```

## Data model
`state = { profile, records }` — every record has `id`, `type` (`session` | `weigh` | `prehab`) and `updatedAt`.
Deletes are tombstones (`deleted: true`) so they win over stale copies during sync; old tombstones are pruned after 180 days.
Device-only data (`local`): the in-progress workout, Drive tokens and file ids.

## Rendering
`render()` coalesces to one `requestAnimationFrame`; `morphdom` patches only what changed, skipping the focused input and keeping `<details>` open state. Timers update their own text nodes every 250 ms without a full render.

## Offline and updates
`sw.js` precaches every app file (a test fails if one is missing). New versions install in the background; the app shows "A new version is ready" and reloads on tap.
