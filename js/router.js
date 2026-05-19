const routes = [];
let currentParams = {};
let notFoundHandler = null;

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
