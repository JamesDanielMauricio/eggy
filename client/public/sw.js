const CACHE_NAME = 'eggy-static-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch /api/* — this is financial data. Serving a cached response
  // for a sale/expense/harvest call would show stale numbers as if they
  // were current, which is worse than no offline support at all. Only the
  // static app shell (JS/CSS/icons) gets cached.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // The HTML shell is the one unhashed URL that points at every other
  // (hashed) asset. Vite gives JS/CSS a new filename on every build, so
  // caching those forever is safe — but caching THIS cache-first meant a
  // browser's first visit pinned it to that build's index.html forever,
  // silently hiding every deploy after it. Network-first here, falling
  // back to cache only when truly offline, fixes that while keeping the
  // hashed assets cache-first below.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
