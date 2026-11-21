// Service worker: makes the app open instantly and work offline.
// Bump VERSION (npm run bump) whenever any file in ASSETS changes, so devices pick up the update.
const VERSION = '1.2.0';
const CACHE = 'bt-app-' + VERSION;
const FONT_CACHE = 'bt-fonts-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/views.js', './js/program.js', './js/data.js', './js/util.js', './js/store.js', './js/merge.js',
  './js/drive.js', './js/config.js', './js/export.js', './js/charts.js', './js/demos.js', './js/sensors.js', './js/gpsmath.js', './js/repcount.js',
  './js/version.js', './js/native.js', './js/vendor/morphdom.js', './js/vendor/capacitor-core.js',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('bt-app-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
      return;
    }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch { return new Response('', { status: 504 }); }
    }));
  }
  // Google APIs and sign-in always go straight to the network.
});
