# Bar & Track

A personal calisthenics + running training app. Installable on phone and laptop, works fully offline, syncs through your own Google Drive. No server, no account system, no build step.

**Live app:** https://abdelrahmansherifmedhat1134.github.io/bar-and-track/

## What it does

- **Return-to-training program**: test day → 2 weeks Re-entry (50% of tested max) → 2 weeks Rebuild (65%) → 6-week blocks of 5 build weeks + 1 deload with a re-test.
- **Split** (3–4 days): Upper 1 (pull focus), Lower + Back (ACL-friendly), Upper 2 (push focus), optional Run-walk + back care.
- **Progression**: double progression with dip-belt loading; reps-in-reserve after each main set holds or speeds up weight jumps; harder variants suggested automatically.
- **Readiness check** (sleep, energy, soreness, stress + shoulder/knee flags) adjusts the session before you start.
- **Logging**: live set-by-set with rest timer, one-tap "done as planned", or "fill in later".
- **Running**: 15-level run-walk ladder with an interval timer, GPS distance/pace/splits/route, free runs.
- **Fitness–fatigue model** (Banister, 42 d / 7 d) with early-deload suggestions when fatigue builds and strength drops.
- **Rep counter (beta)** from the phone's accelerometer.
- **Weekly report** you can copy to Claude for review; reminders via your calendar (.ics / Google Calendar).
- **Google Drive sync**: data merged record-by-record across devices, plus `Training log.csv` and `Weekly reports.md` in a "Bar & Track" Drive folder.

## Use it

Open the live link on your phone and laptop and install it:
- **Android / Chrome / Edge**: Plan → Install, or the browser menu → *Install app*.
- **iPhone (Safari)**: Share → *Add to Home Screen*.

Data is stored on each device first. To share it between devices, connect Google Drive once (see below).

## Google Drive sync (one-time setup)

Follow [docs/GOOGLE_DRIVE_SETUP.md](docs/GOOGLE_DRIVE_SETUP.md) (about 10 minutes), then either paste the client ID in the app (Plan → Google Drive) or put it in `js/config.js` and push.

## Develop

No dependencies to install. Requires Node 18+ only for tests.

```bash
git clone https://github.com/abdelrahmansherifmedhat1134/bar-and-track.git
cd bar-and-track
npm test            # unit tests: program logic, merge, GPS, rep counter, release checks
npm run serve       # http://localhost:8080 (service workers need http, not file://)
```

**Before every push that changes app files:** `npm run bump` (updates the service-worker cache version so installed apps pick up the change), then commit. CI runs the tests on every push; GitHub Pages deploys `main` automatically.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised.

## Safety

General coaching logic, not medical advice. The plan avoids pivoting and jumping because of a torn ACL; get leg work cleared by a physiotherapist.
