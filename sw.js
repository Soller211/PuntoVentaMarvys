/* Service Worker: permite que la app funcione sin internet.
   Guarda una copia de los archivos y los sirve desde el dispositivo. */
const CACHE = 'pdv-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './license-core.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia "primero la red": si hay internet, siempre trae la versión nueva
// y guarda una copia; si no hay internet, usa la copia guardada.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});
