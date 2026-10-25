// Service Worker: macht die App nach dem ersten Besuch offline-fähig.
//  - Eigene Dateien: erst Netz (damit Updates nach einem Push sofort ankommen), sonst Cache.
//  - MediaPipe (fest gepinnte Versionen) und Modelle: erst Cache, sonst Netz.
// Bewusst ohne feste Dateiliste – so kann beim Erweitern nichts vergessen werden.
const CACHE = 'feueraugen-v6';
const EXTERN = ['https://cdn.jsdelivr.net/npm/@mediapipe/', 'https://storage.googleapis.com/mediapipe-models/'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (EXTERN.some(p => url.startsWith(p))) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const treffer = await cache.match(req);
      if (treffer) return treffer;
      const antwort = await fetch(req);
      if (antwort.ok) cache.put(req, antwort.clone());
      return antwort;
    })());
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const antwort = await fetch(req);
      if (antwort.ok) cache.put(req, antwort.clone());
      return antwort;
    } catch (fehler) {
      const treffer = await cache.match(req, { ignoreSearch: true });
      if (treffer) return treffer;
      throw fehler;
    }
  })());
});
