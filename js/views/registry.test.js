import { afterEach, describe, it, expect, vi } from 'vitest';

// The registry imports the prefs store, which imports the client module. No test here may reach the
// project named in .env.local.
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false }));

const { createRegistry, DEFAULT_VIEW, DEV_VIEW_KEY, VIEW_IDS, VIEW_META, activeViewId, loadView, preloadActiveView, setActiveView } = await import('./registry.js');

const viewModule = (id) => ({ id, renderDashboard: () => '', renderTripLanding: () => ({}) });
const chunkError = () => new TypeError('Failed to fetch dynamically imported module');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** A registry on injected loaders. `fail` names the views whose import rejects for now. */
function setup({ fail = [], online = true, flag, view = 'atlas', devViews = ['stub'], devStored, storeResult = { ok: true, errors: [] } } = {}) {
  const failing = new Set(fail);
  const loads = [];
  const order = [];
  const stored = [];
  const loader = (id) => async () => {
    loads.push(id);
    order.push(`load:${id}`);
    if (failing.has(id)) throw chunkError();
    return viewModule(id);
  };
  const ids = ['departures', 'concierge', 'atlas', ...devViews];
  const session = memoryStorage(flag === undefined ? {} : { 'chunk-reload': flag });
  const local = memoryStorage(devStored === undefined ? {} : { [DEV_VIEW_KEY]: devStored });
  const reload = vi.fn();
  const prefs = { view };
  const net = { online };
  const registry = createRegistry({
    loaders: Object.fromEntries(ids.map((id) => [id, loader(id)])),
    devViews,
    readView: () => prefs.view,
    storeView: (id) => {
      order.push(`store:${id}`);
      if (storeResult.ok) { stored.push(id); prefs.view = id; }
      return storeResult;
    },
    isOnline: () => net.online,
    session: () => session,
    local: () => local,
    reload,
  });
  return { registry, failing, loads, order, stored, session, local, reload, prefs, net };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the list of views', () => {
  it('is the three views, with atlas as the default', () => {
    expect([...VIEW_IDS]).toEqual(['departures', 'concierge', 'atlas']);
    expect(DEFAULT_VIEW).toBe('atlas');
  });
  it('names each one for the picker', () => {
    expect(Object.keys(VIEW_META)).toEqual([...VIEW_IDS]);
    expect(VIEW_META.departures).toEqual({ id: 'departures', name: 'Departures', sentence: 'Your own departures board. Precise and data-forward.' });
    expect(VIEW_META.concierge).toEqual({ id: 'concierge', name: 'Concierge', sentence: 'A morning briefing. Calm and editorial.' });
    expect(VIEW_META.atlas).toEqual({ id: 'atlas', name: 'Atlas', sentence: 'A map and a logbook.' });
    expect('stub' in VIEW_META).toBe(false);
  });
});

describe('loadView', () => {
  it('resolves to the view module', async () => {
    const { registry } = setup();
    await expect(registry.loadView('concierge')).resolves.toMatchObject({ id: 'concierge' });
  });
  it('caches a success: one import for many calls, and for calls made at the same time', async () => {
    const { registry, loads } = setup();
    const [a, b] = await Promise.all([registry.loadView('atlas'), registry.loadView('atlas')]);
    const c = await registry.loadView('atlas');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(loads).toEqual(['atlas']);
  });
  it('takes the id only, so it can be handed to map()', async () => {
    const { registry } = setup();
    const mods = await Promise.all(['departures', 'atlas'].map(registry.loadView));
    expect(mods.map((mod) => mod.id)).toEqual(['departures', 'atlas']);
  });
  it('an unknown id resolves to null: no import, no reload', async () => {
    const { registry, loads, reload } = setup();
    for (const id of ['gallery', '', null, undefined, 'constructor', 'toString', '__proto__']) {
      await expect(registry.loadView(id)).resolves.toBeNull();
    }
    expect(loads).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });
  it('online, a failing loader sets chunk-reload and reloads the page once, and resolves to null', async () => {
    const { registry, reload, session } = setup({ fail: ['atlas'] });
    await expect(registry.loadView('atlas')).resolves.toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(session.getItem('chunk-reload')).toBeTruthy();
    await expect(registry.loadView('atlas')).resolves.toBeNull(); // the reload did not help
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('online with chunk-reload already set (the reload has been tried), it resolves to null without a reload', async () => {
    const { registry, reload, session } = setup({ fail: ['atlas'], flag: '1' });
    await expect(registry.loadView('atlas')).resolves.toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(session.getItem('chunk-reload')).toBe('1');
  });
  it('offline, it resolves to null and neither reloads nor marks the session', async () => {
    const { registry, reload, session } = setup({ fail: ['atlas'], online: false });
    await expect(registry.loadView('atlas')).resolves.toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(session.map.has('chunk-reload')).toBe(false);
  });
  it('a failure is not cached: the next call imports again and can succeed', async () => {
    const { registry, failing, loads, net } = setup({ fail: ['concierge'], online: false });
    await expect(registry.loadView('concierge')).resolves.toBeNull();
    await expect(registry.loadView('concierge')).resolves.toBeNull();
    failing.delete('concierge');
    net.online = true;
    await expect(registry.loadView('concierge')).resolves.toMatchObject({ id: 'concierge' });
    expect(loads).toEqual(['concierge', 'concierge', 'concierge']);
  });
  it('after the reload it asked for, a success clears its own mark, so a later release can heal the same way', async () => {
    const first = setup({ fail: ['atlas'] });
    await first.registry.loadView('atlas');
    const mark = first.session.getItem('chunk-reload');
    // The page has reloaded: a new registry, the same tab session.
    const second = setup({ flag: mark });
    await expect(second.registry.loadView('atlas')).resolves.toMatchObject({ id: 'atlas' });
    expect(second.session.map.has('chunk-reload')).toBe(false);
  });
  it('a success leaves a mark that main.js set for another chunk', async () => {
    const { registry, session } = setup({ flag: '1' });
    await registry.loadView('atlas');
    expect(session.getItem('chunk-reload')).toBe('1');
  });
  it('never throws: a loader that throws at once, storage that throws, a reload that throws', async () => {
    const blocked = () => { throw new DOMException('denied', 'SecurityError'); };
    const reload = vi.fn();
    const registry = createRegistry({
      loaders: { atlas: () => { throw new Error('boom'); } },
      devViews: [], readView: () => 'atlas', storeView: () => ({ ok: true }), isOnline: () => true,
      session: () => ({ getItem: blocked, setItem: blocked, removeItem: blocked }), local: () => null, reload,
    });
    await expect(registry.loadView('atlas')).resolves.toBeNull();
    expect(reload).not.toHaveBeenCalled(); // the one-shot mark cannot be kept, so no reload is risked

    const loud = setup({ fail: ['atlas'] });
    loud.reload.mockImplementation(() => { throw new Error('no window'); });
    await expect(loud.registry.loadView('atlas')).resolves.toBeNull();
  });
});

describe('activeViewId', () => {
  it('is the stored pref', () => {
    expect(setup({ view: 'departures' }).registry.activeViewId()).toBe('departures');
    expect(setup({ view: 'concierge' }).registry.activeViewId()).toBe('concierge');
  });
  it('falls back to the default for an id it does not know', () => {
    for (const view of ['gallery', 'stub', 'classic', '', null, undefined, 3]) {
      expect(setup({ view }).registry.activeViewId()).toBe('atlas');
    }
  });
  it('follows a change of the pref', () => {
    const { registry, prefs } = setup({ view: 'atlas' });
    prefs.view = 'departures';
    expect(registry.activeViewId()).toBe('departures');
  });
});

describe('setActiveView', () => {
  it('loads first, then stores the pref, and resolves to the module', async () => {
    const { registry, order, stored } = setup({ view: 'atlas' });
    await expect(registry.setActiveView('departures')).resolves.toMatchObject({ id: 'departures' });
    expect(order).toEqual(['load:departures', 'store:departures']);
    expect(stored).toEqual(['departures']);
    expect(registry.activeViewId()).toBe('departures');
  });
  it('stores nothing and rejects when the view cannot load', async () => {
    const { registry, stored, order } = setup({ fail: ['concierge'], online: false, view: 'atlas' });
    await expect(registry.setActiveView('concierge')).rejects.toThrow(/could not load/);
    expect(stored).toEqual([]);
    expect(order).toEqual(['load:concierge']);
    expect(registry.activeViewId()).toBe('atlas');
  });
  it('stores nothing and rejects for an unknown id', async () => {
    const { registry, stored, loads } = setup();
    await expect(registry.setActiveView('gallery')).rejects.toThrow();
    expect(stored).toEqual([]);
    expect(loads).toEqual([]);
  });
  it('rejects when the store refuses the value', async () => {
    const { registry, stored } = setup({ storeResult: { ok: false, errors: ['Invalid value for "view"'] } });
    await expect(registry.setActiveView('departures')).rejects.toThrow(/could not be saved/);
    expect(stored).toEqual([]);
  });
  it('stores the pick of the view that is already on (it is still a choice)', async () => {
    const { registry, stored } = setup({ view: 'atlas' });
    await registry.setActiveView('atlas');
    expect(stored).toEqual(['atlas']);
  });
});

describe('preloadActiveView', () => {
  it('loads the active view and resolves like loadView', async () => {
    const { registry, loads } = setup({ view: 'concierge' });
    await expect(registry.preloadActiveView()).resolves.toMatchObject({ id: 'concierge' });
    expect(loads).toEqual(['concierge']);
  });
  it('resolves to null when it cannot load, without throwing', async () => {
    const { registry } = setup({ view: 'concierge', fail: ['concierge'], online: false });
    await expect(registry.preloadActiveView()).resolves.toBeNull();
  });
});

describe('the stub view is offered only in dev', () => {
  it('in dev it loads, and setActiveView keeps it in a device key of its own, never in the prefs', async () => {
    const { registry, stored, local } = setup({ view: 'departures' });
    await expect(registry.loadView('stub')).resolves.toMatchObject({ id: 'stub' });
    await registry.setActiveView('stub');
    expect(stored).toEqual([]);
    expect(local.getItem(DEV_VIEW_KEY)).toBe('stub');
    expect(registry.activeViewId()).toBe('stub');
  });
  it('in dev the device key alone selects it, and choosing a real view clears the key', async () => {
    const { registry, local, stored } = setup({ view: 'atlas', devStored: 'stub' });
    expect(registry.activeViewId()).toBe('stub');
    await registry.setActiveView('concierge');
    expect(local.map.has(DEV_VIEW_KEY)).toBe(false);
    expect(stored).toEqual(['concierge']);
    expect(registry.activeViewId()).toBe('concierge');
  });
  it('in dev the key cannot name anything but a dev view', () => {
    for (const devStored of ['gallery', 'departures', '']) {
      expect(setup({ view: 'atlas', devStored }).registry.activeViewId()).toBe('atlas');
    }
  });
  it('outside dev there is no stub: not loaded, not selected by the key, not accepted by setActiveView', async () => {
    const { registry, loads, stored, local } = setup({ view: 'departures', devViews: [], devStored: 'stub' });
    await expect(registry.loadView('stub')).resolves.toBeNull();
    expect(registry.activeViewId()).toBe('departures');
    await expect(registry.setActiveView('stub')).rejects.toThrow();
    expect(loads).toEqual([]);
    expect(stored).toEqual([]);
    expect(local.getItem(DEV_VIEW_KEY)).toBe('stub'); // left alone: this build does not know the key
  });
  it('the module itself offers the stub under the dev flag', async () => {
    expect(import.meta.env.DEV).toBe(true);
    await expect(loadView('stub')).resolves.toMatchObject({ id: 'stub' });
  });
  it('and does not when the dev flag is off, as in a production build', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const production = await import('./registry.js');
    expect(import.meta.env.DEV).toBe(false);
    await expect(production.loadView('stub')).resolves.toBeNull();
    await expect(production.setActiveView('stub')).rejects.toThrow();
    expect([...production.VIEW_IDS]).toEqual(['departures', 'concierge', 'atlas']);
  });
});

describe('the module exports', () => {
  it('are bound to the app registry and the prefs store', async () => {
    expect(activeViewId()).toBe('atlas');
    await expect(loadView('gallery')).resolves.toBeNull();
    await expect(setActiveView('gallery')).rejects.toThrow();
    expect(typeof preloadActiveView).toBe('function');
  });
});
