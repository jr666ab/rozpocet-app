/* Service worker – síť má přednost, cache jako záloha pro offline */
const CACHE = 'rozpocet-v1';

self.addEventListener('install', e => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(odpoved => {
      if (odpoved.ok || odpoved.type === 'opaque') {
        const kopie = odpoved.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
      }
      return odpoved;
    }).catch(() => caches.match(e.request))
  );
});
