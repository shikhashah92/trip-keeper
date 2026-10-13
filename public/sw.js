// Trip Keeper service worker: the app opens instantly and works offline. Data itself lives in IndexedDB, not here.
// Everything is relative to the worker's scope, so it works at a domain's root or in a sub-folder.
// ponytail: old hashed bundles are dropped only when CACHE is bumped; fine for a few-MB app.
const CACHE = 'trip-keeper-v2';
const ROOT = new URL(self.registration.scope).pathname; // "/" on the app's own domain
const at = (p) => ROOT + p;
const SHELL = ['', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', 'favicon.svg', 'fonts/Archivo-latin.woff2',
  'vendor/pdf/pdf.min.js', 'vendor/pdf/pdf.worker.min.js'].map(at);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Precache the current JS bundle referenced by the shell so the very next launch works offline.
    const html = await (await cache.match(ROOT)).text();
    const scripts = [...html.matchAll(/src="([^"]*\/_expo\/static\/[^"]+)"/g)].map((m) => m[1]);
    await cache.addAll(scripts);
    // ...and the icon font the bundle loads, so icons render offline too.
    const js = (await Promise.all(scripts.map(async (s) => (await cache.match(s)).text()))).join('');
    await cache.addAll([...new Set([...js.matchAll(/"(\/[^"]*assets\/[^"]+\.ttf)"/g)].map((m) => m[1]))]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Network first so deploys show up; the cached shell when offline. Every route uses the same shell
    // (GitHub Pages serves deep links as 404.html, a copy of the shell: use it, but only cache real 200s).
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(ROOT, copy)); }
      return res;
    }).catch(() => caches.match(ROOT)));
    return;
  }
  // Hashed static files never change: cache first, fill the cache on first use.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
