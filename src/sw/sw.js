/* Ragnarok service worker: the whole app opens offline after the first visit.
   The page is network first (updates arrive on the next open) with a quick fallback to the cache.
   Built files have hashed names, so they are served from the cache first. */
const VERSION = '__VERSION__';
const CACHE = 'ragnarok-' + VERSION;
const PRECACHE = __PRECACHE__;
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ragnarok-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetworkWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal, cache: 'no-cache' });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the GitHub API always goes straight to the network

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fromNetworkWithTimeout(request, NAV_TIMEOUT_MS);
        if (response && response.ok) {
          cache.put('./', response.clone());
          return response;
        }
        // The site moved or is down: keep opening the cached app so data can still be exported.
        return (await cache.match('./')) || (await cache.match('index.html')) || response;
      } catch (error) {
        const hit = (await cache.match('./')) || (await cache.match('index.html'));
        if (hit) return hit;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  })());
});
