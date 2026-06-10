const CACHE_NAME = 'trippy-v4';

self.addEventListener('install', (event) => {
  // Precache the app shell so navigations to never-visited routes still render
  // offline. './' resolves against the SW scope, so it works under both '/'
  // and the GH Pages '/TrippyPWA/' base.
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.add('./')).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (new URL(client.url).pathname === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase')) return;
  if (url.pathname.startsWith('/functions/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        // Offline: serve this exact page if cached, otherwise fall back to the
        // precached app shell (the SPA router renders the route client-side).
        .catch(() => caches.match(event.request).then(cached =>
          cached || caches.match(new URL('./', self.location.href).href)
        ))
    );
    return;
  }

  if (url.pathname.match(/\/assets\/.*-[a-zA-Z0-9]{8}\./)) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        });
      })
    );
    return;
  }

  if (url.hostname.includes('wikimedia') || url.hostname.includes('flagcdn')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(resp => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(resp => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
