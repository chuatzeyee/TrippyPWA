// What a click or a change on the Settings page does (js/settings/actions.js): the three defects of
// the review of the redesign. This test run has no DOM, so the page root is a small stand-in. Owner: F12.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setHomeCurrency: vi.fn(),
  setLocaleFromFlag: vi.fn(),
  saveProfileSummary: vi.fn(),
  updateProfile: vi.fn(),
  fetchAllTrips: vi.fn(),
  clearAllUserData: vi.fn(),
  clearOfflineTripCache: vi.fn(),
  confirmDialog: vi.fn(),
  showToast: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({ getUser: () => ({ id: 'user-1' }) }));
vi.mock('../lib/logger.js', () => ({ logger: { warn: mocks.warn, error: mocks.error, info: vi.fn() } }));
vi.mock('../lib/motion.js', () => ({ scrollBehavior: () => 'auto' }));
vi.mock('../lib/locale.js', () => ({ setLocaleFromFlag: mocks.setLocaleFromFlag }));
vi.mock('../lib/square-mode.js', () => ({ setSquareOverride: vi.fn() }));
vi.mock('../data/prefs-store.js', () => ({ setPref: vi.fn(() => ({ ok: true })) }));
vi.mock('../data/user-prefs.js', () => ({ setHomeCurrency: mocks.setHomeCurrency }));
vi.mock('../data/profile-cache.js', () => ({ saveProfileSummary: mocks.saveProfileSummary }));
vi.mock('../data/profile-repository.js', () => ({ updateProfile: mocks.updateProfile }));
vi.mock('../data/trip-repository.js', () => ({
  clearAllUserData: mocks.clearAllUserData, clearOfflineTripCache: mocks.clearOfflineTripCache, fetchAllTrips: mocks.fetchAllTrips,
}));
vi.mock('../views/shared/confirm-dialog.js', () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock('../router.js', () => ({ navigate: mocks.navigate }));
vi.mock('../components/toast.js', () => ({ showToast: mocks.showToast }));
vi.mock('./notify.js', () => ({ sendTestNotification: vi.fn() }));

import { bindActions, saveProfileField } from './actions.js';

class FakeElement {
  constructor(matches = []) { this.matches = matches; this.disabled = false; this.attrs = {}; }
  closest(selector) { return this.matches.includes(selector) ? this : null; }
  getAttribute(name) { return this.attrs[name] ?? null; }
}

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()].sort(),
  };
}

/** A stand-in for the mounted page: a root that records its listeners and hands out one status line per control. */
function fakePage(profile = { home_currency: 'EUR', home_currency_symbol: '€', home_flag: 'pt' }) {
  const handlers = {};
  const lines = {};
  const line = (field) => {
    lines[field] ??= { textContent: '', kind: null, setAttribute(_name, value) { this.kind = value; }, removeAttribute() { this.kind = null; } };
    return lines[field];
  };
  const root = {
    isConnected: true,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: (selector) => {
      const status = /^\[data-st-status="(\w+)"\]$/.exec(selector);
      return status ? line(status[1]) : null;
    },
  };
  const page = {
    root, handlers, lines, saves: {}, edits: 0, dataMessage: '',
    profile: { status: 'ready', data: profile },
    refresh: vi.fn(), refreshSoon: vi.fn(), reloadProfile: vi.fn(),
  };
  return page;
}

const click = (page, selector, attrs = {}) => {
  const target = new FakeElement([selector]);
  target.attrs = attrs;
  const event = { target, preventDefault: vi.fn() };
  page.handlers.click(event);
  return event;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Done always lands on a page of Trippy', () => {
  const HERE = { origin: 'https://trippy.example', pathname: '/app/', hash: '#/settings' };
  const open = ({ navigation, length = 1 }) => {
    const back = vi.fn();
    vi.stubGlobal('location', HERE);
    vi.stubGlobal('window', { history: { length, back }, navigation });
    const page = fakePage();
    bindActions(page);
    const event = click(page, '[data-st-done]');
    expect(event.preventDefault).toHaveBeenCalled();
    return back;
  };
  const entries = (urls) => ({ currentEntry: { index: urls.length - 1 }, entries: () => urls.map((url) => ({ url })) });

  it('without the Navigation API it goes to the dashboard, even when the tab has history from another site', () => {
    const back = open({ navigation: undefined, length: 7 });
    expect(back).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('goes to the dashboard when the entries cannot be read', () => {
    const back = open({ navigation: { currentEntry: { index: 1 }, entries: () => { throw new Error('denied'); } }, length: 4 });
    expect(back).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('goes back when the entry before this one is a page of Trippy', () => {
    const back = open({ navigation: entries(['https://trippy.example/app/#/trip/t1', 'https://trippy.example/app/#/settings']), length: 2 });
    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it.each([
    ['another site', 'https://elsewhere.example/page'],
    ['another page of this origin', 'https://trippy.example/other/#/trip/t1'],
    ['an entry with no address', null],
  ])('goes to the dashboard when the entry before is %s', (_name, url) => {
    const back = open({ navigation: entries([url, 'https://trippy.example/app/#/settings']), length: 2 });
    expect(back).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('goes to the dashboard when this is the first entry of the tab', () => {
    const back = open({ navigation: entries(['https://trippy.example/app/#/settings']), length: 1 });
    expect(back).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
});

describe('a profile save whose device copy cannot be written', () => {
  it('still says "Saved", refreshes the summary and the page, and logs the storage failure', async () => {
    mocks.updateProfile.mockResolvedValue({ error: null });
    mocks.setHomeCurrency.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const page = fakePage();
    await expect(saveProfileField(page, 'currency', 'USD')).resolves.toBeUndefined();
    expect(mocks.updateProfile).toHaveBeenCalledWith({ home_currency: 'USD', home_currency_symbol: expect.any(String) });
    expect(page.saves.currency).toBe('saved');
    expect(page.lines.currency.textContent).toBe('Saved');
    expect(mocks.saveProfileSummary).toHaveBeenCalledWith('user-1', expect.objectContaining({ home_currency: 'USD' }));
    expect(page.refresh).toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith('ui', expect.any(String), expect.objectContaining({ error: 'QuotaExceededError' }));
  });
  it('a locale that cannot be stored does not stop the summary either', async () => {
    mocks.updateProfile.mockResolvedValue({ error: null });
    mocks.setLocaleFromFlag.mockImplementation(() => { throw new Error('denied'); });
    const page = fakePage();
    await saveProfileField(page, 'city', { name: 'Osaka', country: 'Japan', flag: 'jp' });
    expect(page.saves.city).toBe('saved');
    expect(mocks.saveProfileSummary).toHaveBeenCalledWith('user-1', expect.objectContaining({ home_city: 'Osaka', home_flag: 'jp' }));
  });
  it('a save that works writes the home currency to the device', async () => {
    mocks.updateProfile.mockResolvedValue({ error: null });
    const page = fakePage();
    await saveProfileField(page, 'currency', 'USD');
    expect(mocks.setHomeCurrency).toHaveBeenCalledWith('USD', expect.any(String));
    expect(page.saves.currency).toBe('saved');
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});

describe('Delete all my trips', () => {
  const run = async (page) => {
    bindActions(page);
    click(page, '[data-st-action]', { 'data-st-action': 'delete-trips' });
    await settle();
    await settle();
  };
  const STORED = {
    'towns-v1-own-1': '{"groups":[]}', 'towns-v1-own-2': '{"groups":[]}', 'towns-v1-shared-1': '{"groups":[]}', 'towns-v1-own-10': '{"groups":[]}',
    'trip-quick-own-1': '{}', 'checklist-own-1': '{}', 'entry-done-own-2': '{}', 'checklist-shared-1': '{}', trippy_prefs_v1: '{}',
  };
  const TRIPS = [{ id: 'own-1' }, { id: 'own-2', shared: false }, { id: 'shared-1', shared: true }];

  it('removes the town groups and the ticks of the deleted trips, and keeps those of shared trips', async () => {
    const store = memoryStorage(STORED);
    vi.stubGlobal('localStorage', store);
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.fetchAllTrips.mockResolvedValue({ data: TRIPS, error: null });
    mocks.clearAllUserData.mockResolvedValue({ error: null });
    await run(fakePage());
    expect(mocks.clearAllUserData).toHaveBeenCalledWith({ keepProfile: true });
    expect(store.keys()).toEqual(['checklist-shared-1', 'towns-v1-own-10', 'towns-v1-shared-1', 'trippy_prefs_v1']);
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('keeps everything on the device when the delete fails', async () => {
    const store = memoryStorage(STORED);
    vi.stubGlobal('localStorage', store);
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.fetchAllTrips.mockResolvedValue({ data: TRIPS, error: null });
    mocks.clearAllUserData.mockResolvedValue({ error: 'nope' });
    const page = fakePage();
    await run(page);
    expect(store.keys()).toEqual(Object.keys(STORED).sort());
    expect(page.dataMessage).toBe('Your trips could not be deleted. Try again.');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('a storage that refuses does not stop the delete from finishing', async () => {
    vi.stubGlobal('localStorage', { removeItem() { throw new Error('denied'); } });
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.fetchAllTrips.mockResolvedValue({ data: TRIPS, error: null });
    mocks.clearAllUserData.mockResolvedValue({ error: null });
    await run(fakePage());
    expect(mocks.showToast).toHaveBeenCalledWith('All your trips were deleted.', 'success');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('uses the key the Discover tab writes its town groups under', () => {
    // js/services/town-mapper.js owns the key and does not export it: this fails when it moves on.
    const source = readFileSync(new URL('../services/town-mapper.js', import.meta.url), 'utf8');
    expect(source).toMatch(/const CACHE_PREFIX = 'towns-v1-';/);
    expect(source).toMatch(/localStorage\.setItem\(CACHE_PREFIX \+ tripId,/);
  });
});
