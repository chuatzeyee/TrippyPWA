// Trippy service worker.
//
// BUILD_ID, BUILD_ASSETS and PRECACHE_ASSETS are filled in by the build (see
// the trippy-sw plugin in vite.config.js), so every release ships a different
// sw.js and the browser installs it as an update. In dev they keep these
// defaults and the worker leaves requests alone.
const BUILD_ID = 'dev';
const BUILD_ASSETS = []; // every hashed file of this build, relative to the scope
const PRECACHE_ASSETS = []; // the subset needed to open the app and a trip offline

const SCOPE = new URL(self.registration.scope);
const SHELL_URL = SCOPE.href; // index.html, served at the scope root
const ASSETS_PATH = `${SCOPE.pathname}assets/`;
const SHELL_CACHE = `trippy-shell-${BUILD_ID}`;
const ASSET_CACHE = 'trippy-assets'; // content-hashed files never change, so one shared cache
const RUNTIME_CACHE = 'trippy-runtime';
const RUNTIME_MAX_ENTRIES = 120;
const NAV_TIMEOUT_MS = 3000;
const IS_DEV = BUILD_ID === 'dev';
// Lookups of content-hashed files go by URL alone. A host that answers with
// `Vary: Origin` would otherwise hide a precached file (stored by a request
// with no Origin header) from the page's own module and stylesheet requests,
// which carry one, and the app could not open offline.
const HASHED_MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  // Precache this release's shell and core files. Best effort per file: one
  // missing file must not block the update forever.
  event.waitUntil(Promise.all([
    // cache: 'reload' skips the HTTP cache, which may still hold the old index.html.
    caches.open(SHELL_CACHE).then(c => c.add(new Request(SHELL_URL, { cache: 'reload' }))).catch(() => {}),
    // Hashed names never change content, so files an earlier release already
    // cached are kept as they are instead of downloaded again.
    caches.open(ASSET_CACHE).then(c => Promise.all(
      PRECACHE_ASSETS.map((path) => {
        const url = new URL(path, SCOPE).href;
        return c.match(url, HASHED_MATCH).then(hit => hit || c.add(url)).catch(() => {});
      })
    )),
  ]));
  // No skipWaiting() here: an open page asks first ("A new version is ready").
  // The very first install has no page to disturb and activates straight away.
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION') event.ports[0]?.postMessage({ buildId: BUILD_ID, assets: BUILD_ASSETS });
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE]);
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    // Drop hashed files from earlier releases.
    if (BUILD_ASSETS.length > 0) {
      const current = new Set(BUILD_ASSETS.map(path => new URL(path, SCOPE).href));
      const cache = await caches.open(ASSET_CACHE);
      const requests = await cache.keys();
      await Promise.all(requests.filter(r => !current.has(r.url)).map(r => cache.delete(r)));
    }
    await self.clients.claim();
  })());
});

// Older pages pass root-relative URLs ('/', '/#/trip/x') that ignore the deploy
// base (/TrippyPWA/ on GitHub Pages); resolve those against the scope instead.
function appUrl(raw) {
  if (!raw) return SCOPE.href;
  const value = String(raw);
  const relative = value.startsWith('/') && !value.startsWith(SCOPE.pathname) ? value.slice(1) : value;
  const url = new URL(relative, SCOPE);
  return url.origin === SCOPE.origin ? url.href : SCOPE.href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(appUrl(event.notification.data?.url));
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(c => c.url.startsWith(SCOPE.href) && 'focus' in c);
    if (open) {
      if (target.hash) open.postMessage({ type: 'trippy:navigate', hash: target.hash });
      return open.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

async function putIfOk(cacheName, request, response, { allowOpaque = false } = {}) {
  if (!response || (!response.ok && !(allowOpaque && response.type === 'opaque'))) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName === RUNTIME_CACHE) {
    const keys = await cache.keys();
    const excess = keys.length - RUNTIME_MAX_ENTRIES;
    if (excess > 0) await Promise.all(keys.slice(0, excess).map(k => cache.delete(k)));
  }
}

// Navigations: network first so a new release shows up at once, but give up
// after a few seconds on a weak connection and open the saved shell instead.
async function handleNavigation(event) {
  const { pathname } = new URL(event.request.url);
  const isShell = pathname === SCOPE.pathname || pathname === `${SCOPE.pathname}index.html`;
  const network = fetch(event.request).then((response) => {
    if (isShell) event.waitUntil(putIfOk(SHELL_CACHE, SHELL_URL, response.clone()));
    return response;
  });
  event.waitUntil(network.catch(() => {}));

  const cached = await (await caches.open(SHELL_CACHE)).match(SHELL_URL);
  if (!cached) return network.catch(() => Response.error());
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    // The SPA routes client-side, so the shell stands in for a failed or slow load.
    if (response && (response.ok || !isShell)) return response;
    return cached;
  } catch {
    return cached;
  }
}

// Content-hashed files: cache first; the name changes whenever the content does.
async function handleAsset(event) {
  const cached = await caches.match(event.request, HASHED_MATCH);
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(putIfOk(ASSET_CACHE, event.request, response.clone()));
  return response;
}

// Everything else we keep (fonts, flags, public data files): serve the saved
// copy at once and refresh it in the background.
async function handleRuntime(event, opts) {
  const cached = await caches.match(event.request);
  const network = fetch(event.request).then((response) => {
    event.waitUntil(putIfOk(RUNTIME_CACHE, event.request, response.clone(), opts));
    return response;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || IS_DEV) return;
  const url = new URL(request.url);

  // Supabase (database, auth, storage, functions) is never cached here: the app
  // keeps its own offline copies of trips, and responses must not outlive a session.
  if (url.hostname.includes('supabase')) return;

  if (url.origin === SCOPE.origin) {
    if (!url.pathname.startsWith(SCOPE.pathname)) return;
    if (url.pathname.startsWith(`${SCOPE.pathname}functions/`)) return;
    if (request.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
    if (url.pathname.startsWith(ASSETS_PATH)) { event.respondWith(handleAsset(event)); return; }
    event.respondWith(handleRuntime(event));
    return;
  }

  // The Google Fonts stylesheet loads without CORS; keep that one opaque copy so
  // the fonts still apply offline. Opaque images are not kept (they cost quota).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleRuntime(event, { allowOpaque: true }));
  } else if (url.hostname.endsWith('wikimedia.org') || url.hostname.endsWith('flagcdn.com')) {
    event.respondWith(handleRuntime(event));
  }
});
