import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const QUERY = '(prefers-reduced-motion: reduce)';

/** A stand-in for the two globals motion.js reads. Vitest runs in Node: there is no DOM. */
function fakeBrowser({ osReduce = false, attr = null } = {}) {
  const attrs = attr ? { 'data-motion': attr } : {};
  const asked = [];
  const env = {
    attrs,
    asked,
    os: { reduce: osReduce },
    document: {
      documentElement: {
        getAttribute: (name) => attrs[name] ?? null,
        setAttribute: (name, value) => { attrs[name] = String(value); },
        removeAttribute: (name) => { delete attrs[name]; },
      },
    },
    window: {
      matchMedia: (query) => {
        asked.push(query);
        return { matches: query === QUERY && env.os.reduce };
      },
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
  return import('./motion.js');
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('applyMotion', () => {
  it('sets html[data-motion="reduce"] for the reduce pref', async () => {
    const env = fakeBrowser();
    const { applyMotion } = await load(env);
    applyMotion('reduce');
    expect(env.attrs['data-motion']).toBe('reduce');
  });
  it('removes the attribute for system, and for a value it does not know', async () => {
    const env = fakeBrowser({ attr: 'reduce' });
    const { applyMotion } = await load(env);
    applyMotion('system');
    expect('data-motion' in env.attrs).toBe(false);
    applyMotion('reduce');
    applyMotion('none');
    expect('data-motion' in env.attrs).toBe(false);
  });
  it('does nothing harmful where there is no document', async () => {
    const { applyMotion, prefersReducedMotion, scrollBehavior } = await load(null);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
    expect(() => applyMotion('reduce')).not.toThrow();
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
  });
});

describe('prefersReducedMotion and scrollBehavior', () => {
  it('are calm by neither trigger', async () => {
    const env = fakeBrowser();
    const { prefersReducedMotion, scrollBehavior } = await load(env);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
    expect(env.asked).toContain(QUERY);
  });
  it('follow the OS setting, read each time it is asked', async () => {
    const env = fakeBrowser({ osReduce: true });
    const { prefersReducedMotion, scrollBehavior } = await load(env);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
    env.os.reduce = false;
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });
  it('follow the pref, whatever the OS says', async () => {
    const env = fakeBrowser();
    const { applyMotion, prefersReducedMotion, scrollBehavior } = await load(env);
    applyMotion('reduce');
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
    applyMotion('system');
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });
  it('the pref cannot switch the OS setting off', async () => {
    const env = fakeBrowser({ osReduce: true });
    const { applyMotion, prefersReducedMotion } = await load(env);
    applyMotion('system');
    expect(prefersReducedMotion()).toBe(true);
  });
  it('read the attribute the boot script set before the prefs were applied', async () => {
    const env = fakeBrowser({ attr: 'reduce' });
    const { prefersReducedMotion, scrollBehavior } = await load(env);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
  });
  it('are calm when the browser has no matchMedia or it throws', async () => {
    const env = fakeBrowser();
    delete env.window.matchMedia;
    const first = await load(env);
    expect(first.prefersReducedMotion()).toBe(false);
    env.window.matchMedia = () => { throw new Error('blocked'); };
    const second = await load(env);
    expect(second.prefersReducedMotion()).toBe(false);
  });
});
