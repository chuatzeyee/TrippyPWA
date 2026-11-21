// The onboarding page: what a successful save leaves on the device. The page is driven through a
// stand-in for the few DOM calls it makes; the profile cache is the real one on a memory storage.
// Invented data only. Nothing here touches a network.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fake = vi.hoisted(() => ({ user: { id: 'u1' }, row: null, saveError: null, writes: [], routes: [], toasts: [] }));
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => fake.user, setCachedUser() {}, hasLocalSession: () => true }));
vi.mock('../auth/auth.js', () => ({ getCurrentUser: () => fake.user }));
vi.mock('../data/profile-repository.js', () => ({
  fetchProfile: async () => ({ data: fake.row, error: null }),
  updateProfile: async (fields) => { fake.writes.push(fields); return { error: fake.saveError }; },
}));
vi.mock('../router.js', () => ({ navigate: (path) => fake.routes.push(path) }));
vi.mock('../components/toast.js', () => ({ showToast: (text, kind) => fake.toasts.push([text, kind]) }));
vi.mock('../lib/logger.js', () => ({ logger: { error() {}, warn() {}, info() {}, debug() {} } }));
vi.mock('../data/user-prefs.js', () => ({ setHomeCurrency() {} }));

const { renderProfileWizard } = await import('./profile-wizard.js');
const { getProfileSummary, saveProfileSummary, clearProfileSummary } = await import('../data/profile-cache.js');

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** A node that records its listeners; `fire` runs them and hands back what they returned. */
function node(dataset = {}) {
  const handlers = {};
  return {
    dataset, value: '', disabled: false, textContent: '', innerHTML: '', style: {}, className: '',
    classList: { add() {}, remove() {} },
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    appendChild() {},
    querySelectorAll: () => [],
    fire: (type) => Promise.all((handlers[type] ?? []).map((fn) => fn())),
  };
}

/** The page root: a fresh set of controls after every draw, as innerHTML gives the real one. */
function page() {
  let controls = {};
  let html = '';
  const fresh = () => ({
    '#pf-name': node(), '#pf-city': node(), '#pf-city-dropdown': node(), '#pf-save': node(), '#pf-success-go': node(),
    '[data-nomad]': [node({ nomad: 'false' }), node({ nomad: 'true' })],
    '[data-cur-code]': [node({ curCode: 'SGD', curSymbol: 'S$' }), node({ curCode: 'JPY', curSymbol: '¥' })],
  });
  const app = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; controls = fresh(); },
    querySelector: (selector) => (Array.isArray(controls[selector]) ? null : controls[selector] ?? null),
    querySelectorAll: (selector) => (Array.isArray(controls[selector]) ? controls[selector] : []),
  };
  vi.stubGlobal('document', {
    getElementById: (id) => (id === 'app' ? app : null),
    querySelector: (selector) => app.querySelector(selector),
    createElement: () => node(),
  });
  return app;
}

// What handle_new_user leaves in `profiles`, and the summary the start of the session saved from it.
const NEW_ROW = Object.freeze({ id: 'u1', display_name: 'Ada Example', avatar_url: null });

beforeEach(() => {
  Object.assign(fake, { user: { id: 'u1' }, row: { ...NEW_ROW }, saveError: null, writes: [], routes: [], toasts: [] });
  vi.stubGlobal('localStorage', memoryStorage());
  clearProfileSummary();
});

describe('saving the onboarding page', () => {
  it('refreshes the profile summary, so the views have home, currency and passport in the same session', async () => {
    saveProfileSummary('u1', NEW_ROW);
    expect(getProfileSummary()).toMatchObject({ home_currency: null, is_nomad: false });
    const app = page();
    await renderProfileWizard();
    await app.querySelectorAll('[data-nomad]')[1].fire('click');
    await app.querySelectorAll('[data-cur-code]')[0].fire('click');
    await app.querySelector('#pf-save').fire('click');

    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({ display_name: 'Ada Example', is_nomad: true, home_currency: 'SGD', onboarding_complete: true });
    expect(getProfileSummary()).toEqual({
      userId: 'u1', home_flag: null, home_city: null, home_country: null, home_currency: 'SGD', home_currency_symbol: 'S$',
      display_name: 'Ada Example', is_nomad: true, nationality: null,
    });
    expect(app.innerHTML).toContain('Welcome to Trippy, Ada!');
  });

  it('carries a home city, its flag and the passport of a profile that had them', async () => {
    fake.row = { ...NEW_ROW, home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt', home_currency: 'EUR', home_currency_symbol: '€', nationality: 'pt' };
    saveProfileSummary('u1', NEW_ROW);
    const app = page();
    await renderProfileWizard();
    await app.querySelector('#pf-save').fire('click');
    expect(getProfileSummary()).toEqual({
      userId: 'u1', home_flag: 'pt', home_city: 'Lisbon', home_country: 'Portugal', home_currency: 'EUR', home_currency_symbol: '€',
      display_name: 'Ada Example', is_nomad: false, nationality: 'pt',
    });
  });

  it('leaves the summary as it was when the profile could not be saved', async () => {
    fake.row = { ...NEW_ROW, home_currency: 'EUR', home_currency_symbol: '€', is_nomad: true };
    fake.saveError = 'offline';
    const before = saveProfileSummary('u1', NEW_ROW);
    const app = page();
    await renderProfileWizard();
    await app.querySelector('#pf-save').fire('click');
    expect(fake.writes).toHaveLength(1);
    expect(getProfileSummary()).toEqual(before);
    expect(fake.toasts).toEqual([['Failed to save profile', 'error']]);
  });
});
