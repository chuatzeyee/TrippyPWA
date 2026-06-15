const routes = [];
let currentParams = {};
let notFoundHandler = null;
const leaveHandlers = new Set();

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

export function addRoute(pattern, handler) {
  const paramNames = [];
  const regex = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp(`^${regex}$`), paramNames, handler });
}

export function getParams() {
  return { ...currentParams };
}

export function navigate(path) {
  location.hash = path;
}

// Re-run the handler for the current hash without a navigation. Used when a
// global display mode (e.g. square card mode) changes and the active view must
// rebuild with the other layout — its decks/observers mount at render time, so
// a plain CSS swap is not enough.
export function reloadCurrentRoute() {
  resolve();
}

export function onNotFound(handler) {
  notFoundHandler = handler;
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

function isAuthCallback(hash) {
  return /(?:^|[&?])(?:access_token|refresh_token|provider_token)=/.test(hash);
}

function resolve() {
  const hash = location.hash.slice(1) || '/';
  if (isAuthCallback(hash)) return;
  runLeaveHandlers();
  for (const route of routes) {
    const match = hash.match(route.regex);
    if (match) {
      currentParams = {};
      route.paramNames.forEach((name, i) => {
        currentParams[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(currentParams);
      return;
    }
  }
  if (notFoundHandler) {
    notFoundHandler(hash);
  } else {
    navigate('/');
  }
}
