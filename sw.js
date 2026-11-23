// Offline support. App files: network first, so an update shows on the very
// next open; the cache is only the fallback when there is no connection.
// Dictionary requests: network, falling back to the last cached answer.
const VERSION = 'wortschatz-v9';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'wiki.js', 'words.js', 'simple.json', 'pool.json', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== VERSION + '-data').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(VERSION).then(c => c.put(req, cl)); }
      return r;
    }).catch(() => caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true })).then(r => r || caches.match('index.html'))));
    return;
  }
  if (/wiktionary\.org|openthesaurus\.de/.test(url.host)) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(VERSION + '-data').then(c => c.put(req, cl)); }
      return r;
    }).catch(() => caches.open(VERSION + '-data').then(c => c.match(req)).then(r => r || Response.error())));
  }
});
