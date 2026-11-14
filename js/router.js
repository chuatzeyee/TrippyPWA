const routes = [];
let currentParams = {};
let notFoundHandler = null;
const leaveHandlers = new Set();
const DEFAULT_TITLE = typeof document !== 'undefined' ? document.title : 'Trippy';
const TITLE_SUFFIX = 'Trippy';
let resolveCount = 0;

// Register a one-shot cleanup to run the next time the route changes (e.g. tear
// down scroll listeners / observers a view attached to window). Returns an
// unregister function in case the view wants to cancel it.
export function onRouteLeave(fn) {
  leaveHandlers.add(fn);
  return () => leaveHandlers.delete(fn);
}

function runLeaveHandlers() {
  for (const fn of leaveHandlers) {
    try { fn(); } catch { /* a failing cleanup must not block navigation */ }
  }
  leaveHandlers.clear();
}

/**
 * @param {string} pattern e.g. '/trip/:id'
 * @param {(params: object, info: { reload: boolean }) => (void|Promise<void>)} handler
 *   `info.reload` is true when the same route is rebuilt in place (see reloadCurrentRoute).
 * @param {{ title?: string | (() => string), titleFromHeading?: boolean }} [meta]
 *   Document title for the view; with titleFromHeading the view's h1 is used once rendered.
 */
export function addRoute(pattern, handler, meta = {}) {
  const paramNames = [];
  const regex = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp(`^${regex}$`), paramNames, handler, meta });
}

export function getParams() {
  return { ...currentParams };
}

export function navigate(path) {
  location.hash = path;
}

// Re-run the handler for the current hash without a navigation. Used when a
// global display mode (e.g. square card mode) changes and the active view must
// rebuild with the other layout: its decks/observers mount at render time, so
// a plain CSS swap is not enough. Handlers get `{ reload: true }`.
export function reloadCurrentRoute() {
  resolve({ reload: true });
}

export function onNotFound(handler) {
  notFoundHandler = handler;
}

export function start() {
  window.addEventListener('hashchange', () => resolve({ navigation: true }));
  resolve({ initial: true });
}

function isAuthCallback(hash) {
  return /(?:^|[&?])(?:access_token|refresh_token|provider_token)=/.test(hash);
}

function viewHeading() {
  return document.getElementById('app')?.querySelector('h1') || null;
}

function applyTitle(meta) {
  let name = typeof meta.title === 'function' ? meta.title() : meta.title || '';
  if (meta.titleFromHeading) {
    const text = viewHeading()?.textContent.replace(/\s+/g, ' ').trim();
    if (text) name = text;
  }
  document.title = name ? `${name} | ${TITLE_SUFFIX}` : DEFAULT_TITLE;
}

// Move focus to the new view so screen readers announce it and keyboard users
// continue from the top of the content instead of a removed element.
function focusView() {
  const target = viewHeading() || document.getElementById('app');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function focusLost() {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected;
}

function afterRender(token, meta, { navigation, reload }) {
  if (token !== resolveCount) return; // a newer navigation has taken over
  applyTitle(meta);
  if (navigation || (reload && focusLost())) focusView();
}

function resolve(info = {}) {
  const hash = location.hash.slice(1) || '/';
  if (isAuthCallback(hash)) return;
  runLeaveHandlers();
  const token = ++resolveCount;
  if (info.navigation) window.scrollTo(0, 0);
  for (const route of routes) {
    const match = hash.match(route.regex);
    if (match) {
      currentParams = {};
      route.paramNames.forEach((name, i) => {
        currentParams[name] = decodeURIComponent(match[i + 1]);
      });
      const done = () => afterRender(token, route.meta, info);
      const result = route.handler(currentParams, { reload: !!info.reload });
      // Rethrow so a failed handler (e.g. a chunk that won't load) still reaches
      // the global unhandledrejection handler in main.js.
      Promise.resolve(result).then(done, (err) => { done(); throw err; });
      return;
    }
  }
  if (notFoundHandler) {
    notFoundHandler(hash);
    afterRender(token, { title: 'Page not found' }, info);
  } else {
    navigate('/');
  }
}
