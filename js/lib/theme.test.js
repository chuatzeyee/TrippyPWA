import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** A stand-in for the globals theme.js touches. Vitest runs in Node: there is no DOM. */
function fakeBrowser({ osLight = false, attr = null, meta = true } = {}) {
  const attrs = attr ? { 'data-theme': attr } : {};
  const metaEl = { content: '#1B1A17', setAttribute(name, value) { this[name] = value; } };
  const watchers = [];
  const events = [];
  const env = {
    attrs,
    events,
    meta: metaEl,
    os: { light: osLight },
    /** The OS flips between light and dark while the app is open. */
    flipOs(light) {
      env.os.light = light;
      watchers.forEach((fn) => fn({ matches: light }));
    },
    watchers,
    document: {
      documentElement: {
        getAttribute: (name) => attrs[name] ?? null,
        setAttribute: (name, value) => { attrs[name] = String(value); },
        removeAttribute: (name) => { delete attrs[name]; },
      },
      querySelector: (selector) => (meta && selector === 'meta[name="theme-color"]' ? metaEl : null),
    },
    window: {
      matchMedia: (query) => ({
        get matches() { return query === LIGHT_QUERY && env.os.light; },
        addEventListener: (type, fn) => { if (type === 'change') watchers.push(fn); },
      }),
      dispatchEvent: (event) => { events.push({ type: event.type, detail: event.detail }); return true; },
    },
  };
  return env;
}

async function load(env) {
  vi.resetModules();
  if (env) {
    vi.stubGlobal('document', env.document);
    vi.stubGlobal('window', env.window);
  }
  return import('./theme.js');
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('applyTheme', () => {
  it('sets html[data-theme] and the theme-color meta for light', async () => {
    const env = fakeBrowser();
    const { applyTheme, effectiveTheme } = await load(env);
    expect(applyTheme('light')).toBe('light');
    expect(env.attrs['data-theme']).toBe('light');
    expect(env.meta.content).toBe('#F5F1EA');
    expect(effectiveTheme()).toBe('light');
  });
  it('sets them for dark', async () => {
    const env = fakeBrowser({ attr: 'light', osLight: true });
    env.meta.content = '#F5F1EA';
    const { applyTheme, effectiveTheme } = await load(env);
    expect(applyTheme('dark')).toBe('dark');
    expect(env.attrs['data-theme']).toBe('dark');
    expect(env.meta.content).toBe('#1B1A17');
    expect(effectiveTheme()).toBe('dark');
  });
  it('follows the OS for system', async () => {
    const light = fakeBrowser({ osLight: true });
    expect((await load(light)).applyTheme('system')).toBe('light');
    expect(light.attrs['data-theme']).toBe('light');
    const dark = fakeBrowser({ osLight: false, attr: 'light' });
    expect((await load(dark)).applyTheme('system')).toBe('dark');
    expect(dark.attrs['data-theme']).toBe('dark');
    expect(dark.meta.content).toBe('#1B1A17');
  });
  it('reads a value it does not know as system', async () => {
    const env = fakeBrowser({ osLight: true });
    const { applyTheme } = await load(env);
    expect(applyTheme('sepia')).toBe('light');
    expect(applyTheme(undefined)).toBe('light');
  });
  it('with system, follows the OS live', async () => {
    const env = fakeBrowser({ osLight: false });
    const { applyTheme, effectiveTheme } = await load(env);
    applyTheme('system');
    env.flipOs(true);
    expect(env.attrs['data-theme']).toBe('light');
    expect(env.meta.content).toBe('#F5F1EA');
    expect(effectiveTheme()).toBe('light');
    env.flipOs(false);
    expect(env.attrs['data-theme']).toBe('dark');
  });
  it('with an explicit theme, an OS change does nothing', async () => {
    const env = fakeBrowser({ osLight: false });
    const { applyTheme } = await load(env);
    applyTheme('dark');
    env.flipOs(true);
    expect(env.attrs['data-theme']).toBe('dark');
    applyTheme('system');
    expect(env.attrs['data-theme']).toBe('light');
  });
  it('watches the OS once, however often it is called', async () => {
    const env = fakeBrowser();
    const { applyTheme } = await load(env);
    applyTheme('system');
    applyTheme('light');
    applyTheme('system');
    expect(env.watchers).toHaveLength(1);
  });
  it('dispatches trippy:theme on window when the theme on screen changes, and only then', async () => {
    const env = fakeBrowser({ osLight: false });
    const { applyTheme, THEME_EVENT } = await load(env);
    expect(THEME_EVENT).toBe('trippy:theme');
    applyTheme('system'); // dark already: the boot script and the default are both dark
    applyTheme('dark');
    expect(env.events).toEqual([]);
    applyTheme('light');
    applyTheme('light');
    expect(env.events).toEqual([{ type: 'trippy:theme', detail: { theme: 'light' } }]);
    applyTheme('system');
    env.flipOs(true);
    expect(env.events.map((event) => event.detail.theme)).toEqual(['light', 'dark', 'light']);
  });
  it('works without a theme-color meta and without matchMedia', async () => {
    const env = fakeBrowser({ meta: false });
    delete env.window.matchMedia;
    const { applyTheme } = await load(env);
    expect(applyTheme('system')).toBe('dark');
    expect(applyTheme('light')).toBe('light');
    expect(env.attrs['data-theme']).toBe('light');
  });
  it('does nothing harmful where there is no document', async () => {
    const { applyTheme, effectiveTheme } = await load(null);
    expect(() => applyTheme('light')).not.toThrow();
    expect(effectiveTheme()).toBe('dark');
  });
});

describe('effectiveTheme', () => {
  it('is what the document shows: light only when the attribute says light', async () => {
    expect((await load(fakeBrowser({ attr: 'light' }))).effectiveTheme()).toBe('light');
    expect((await load(fakeBrowser({ attr: 'dark' }))).effectiveTheme()).toBe('dark');
    expect((await load(fakeBrowser())).effectiveTheme()).toBe('dark');
  });
});
