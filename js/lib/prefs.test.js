// The prefs schema: defaults, validation, stamping, the legacy theme and the reload rule (blueprint 5.1).
// The merge between a device and the server is in prefs.merge.test.js.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PREFS, PREFS_VERSION, RERENDER_KEYS, VIEW_IDS,
  changedPrefKeys, emptyEnvelope, envelopeForNewUser, migrateLegacy,
  normaliseEnvelope, normalisePrefs, shouldReloadForRemotePrefs, stampPatch, validatePatch,
} from './prefs.js';

const SUN = '2026-11-15T09:00:00.000Z';
const MON = '2026-11-16T09:00:00.000Z';
const TUE = '2026-11-17T09:00:00.000Z';
const env = (values = {}, at = {}, v = 1) => ({ v, values, at });
const frozen = (value) => {
  if (value && typeof value === 'object') Object.values(value).forEach(frozen);
  return Object.freeze(value);
};

describe('defaults', () => {
  it('are the ten prefs of blueprint 2.5', () => {
    expect(DEFAULT_PREFS).toEqual({
      view: 'atlas', viewChooserSeen: false, theme: 'system', motion: 'system', timeFormat: '12h',
      temperatureUnit: 'C', homeCurrencyFirst: true, openTodayFirst: true, autoOpenNextDay: true, showVenuePhotos: true,
    });
    expect(Object.isFrozen(DEFAULT_PREFS)).toBe(true);
    expect(VIEW_IDS).toEqual(['departures', 'concierge', 'atlas']);
    expect(PREFS_VERSION).toBe(1);
  });
  it('come back from anything that is not a values object', () => {
    for (const raw of [undefined, null, '', 'atlas', 7, true, [], ['departures'], () => {}]) {
      expect(normalisePrefs(raw)).toEqual(DEFAULT_PREFS);
    }
  });
  it('are a new object each time', () => {
    const one = normalisePrefs({});
    expect(one).not.toBe(DEFAULT_PREFS);
    expect(one).not.toBe(normalisePrefs({}));
  });
  it('lists the keys that need the open page drawn again', () => {
    expect(RERENDER_KEYS).toEqual(['view', 'timeFormat', 'temperatureUnit', 'homeCurrencyFirst', 'showVenuePhotos']);
  });
});

describe('normalisePrefs', () => {
  it('keeps every valid value', () => {
    const chosen = {
      view: 'departures', viewChooserSeen: true, theme: 'light', motion: 'reduce', timeFormat: '24h',
      temperatureUnit: 'F', homeCurrencyFirst: false, openTodayFirst: false, autoOpenNextDay: false, showVenuePhotos: false,
    };
    expect(normalisePrefs(chosen)).toEqual(chosen);
    expect(normalisePrefs({ view: 'concierge', theme: 'dark' })).toEqual({ ...DEFAULT_PREFS, view: 'concierge', theme: 'dark' });
  });
  it.each([
    ['view', 'stub'], ['view', 'classic'], ['view', ''], ['view', null], ['view', 3], ['view', ['atlas']],
    ['viewChooserSeen', 'true'], ['viewChooserSeen', 1], ['viewChooserSeen', null],
    ['theme', 'auto'], ['theme', 'Light'], ['theme', false],
    ['motion', 'none'], ['motion', 'reduced'], ['motion', true],
    ['timeFormat', '12'], ['timeFormat', 24], ['timeFormat', '24H'],
    ['temperatureUnit', 'c'], ['temperatureUnit', 'K'], ['temperatureUnit', '°F'],
    ['homeCurrencyFirst', 'yes'], ['homeCurrencyFirst', 0],
    ['openTodayFirst', 'false'], ['openTodayFirst', {}],
    ['autoOpenNextDay', 'on'], ['autoOpenNextDay', null],
    ['showVenuePhotos', 1], ['showVenuePhotos', 'no'],
  ])('%s = %j falls back to its default', (key, bad) => {
    const prefs = normalisePrefs({ view: 'departures', timeFormat: '24h', [key]: bad });
    expect(prefs[key]).toBe(DEFAULT_PREFS[key]);
    if (key !== 'view') expect(prefs.view).toBe('departures');
  });
  it('returns only the known keys', () => {
    expect(Object.keys(normalisePrefs({ view: 'atlas', mapStyle: 'paper', __proto__: { theme: 'light' } })).sort())
      .toEqual(Object.keys(DEFAULT_PREFS).sort());
  });
  it('does not read values from the prototype chain', () => {
    expect(normalisePrefs(Object.create({ theme: 'light' })).theme).toBe('system');
  });
  it('does not change what it is given', () => {
    expect(() => normalisePrefs(frozen({ view: 'bogus', theme: 'light' }))).not.toThrow();
  });
});

describe('normaliseEnvelope', () => {
  it('gives an empty envelope for anything that is not one', () => {
    for (const raw of [undefined, null, 'x', 5, [], { values: 'x', at: 3 }]) {
      expect(normaliseEnvelope(raw)).toEqual({ v: 1, values: {}, at: {} });
    }
    expect(emptyEnvelope()).toEqual({ v: 1, values: {}, at: {} });
  });
  it('reads the server default {} as empty', () => {
    expect(normaliseEnvelope({})).toEqual(emptyEnvelope());
  });
  it('keeps unknown keys and their timestamps as they came', () => {
    const raw = env({ view: 'atlas', mapStyle: { ink: 'sepia' } }, { mapStyle: MON });
    expect(normaliseEnvelope(raw)).toEqual(raw);
  });
  it('keeps a known key with a value this build does not know, so a newer build is not erased', () => {
    const raw = env({ view: 'gallery' }, { view: TUE }, 2);
    expect(normaliseEnvelope(raw)).toEqual(raw);
    expect(normalisePrefs(normaliseEnvelope(raw).values).view).toBe('atlas');
  });
  it('drops a timestamp that is not a time or has no value', () => {
    expect(normaliseEnvelope(env({ view: 'atlas', theme: 'dark' }, { view: 'yesterday', theme: 12, motion: MON })).at).toEqual({});
  });
  it('drops keys that could reach the prototype', () => {
    const raw = JSON.parse(`{"v":1,"values":{"__proto__":{"theme":"light"},"constructor":1,"prototype":2,"view":"atlas"},"at":{"__proto__":"${MON}"}}`);
    const clean = normaliseEnvelope(raw);
    expect(Object.keys(clean.values)).toEqual(['view']);
    expect(clean.at).toEqual({});
    expect({}.theme).toBeUndefined();
  });
  it('falls back to version 1 for a version that is not a positive whole number', () => {
    for (const v of [0, -1, 1.5, '2', null]) expect(normaliseEnvelope({ v, values: {}, at: {} }).v).toBe(1);
    expect(normaliseEnvelope(env({}, {}, 3)).v).toBe(3);
  });
  it('returns copies', () => {
    const raw = frozen(env({ view: 'atlas' }, { view: MON }));
    const clean = normaliseEnvelope(raw);
    expect(clean.values).not.toBe(raw.values);
    expect(clean.at).not.toBe(raw.at);
  });
});

describe('validatePatch', () => {
  it('accepts valid values', () => {
    expect(validatePatch({ view: 'concierge', timeFormat: '24h', showVenuePhotos: false })).toEqual({ ok: true, errors: [] });
    expect(validatePatch({})).toEqual({ ok: true, errors: [] });
  });
  it('refuses an unknown key and an invalid value, naming each', () => {
    const result = validatePatch({ view: 'stub', mapStyle: 'paper', theme: 'dark' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['Invalid value for "view"', 'Unknown preference "mapStyle"']);
  });
  it('refuses anything that is not an object', () => {
    for (const patch of [undefined, null, 'view', 3, ['view']]) {
      expect(validatePatch(patch)).toEqual({ ok: false, errors: ['A preference patch must be an object'] });
    }
  });
});

describe('stampPatch', () => {
  it('returns a new envelope with the values and one timestamp per patched key', () => {
    const before = frozen(env({ theme: 'dark', view: 'atlas' }, { view: SUN }));
    const after = stampPatch(before, { view: 'departures', timeFormat: '24h' }, TUE);
    expect(after).toEqual(env({ theme: 'dark', view: 'departures', timeFormat: '24h' }, { view: TUE, timeFormat: TUE }));
    expect(before).toEqual(env({ theme: 'dark', view: 'atlas' }, { view: SUN }));
  });
  it('stamps a choice of the value that was already there', () => {
    expect(stampPatch(env({ theme: 'dark' }), { theme: 'dark' }, MON).at).toEqual({ theme: MON });
  });
  it('dismissing the chooser stamps that key only', () => {
    const after = stampPatch(env({ view: 'atlas' }), { viewChooserSeen: true }, MON);
    expect(after.at).toEqual({ viewChooserSeen: MON });
    expect(after.values).toEqual({ view: 'atlas', viewChooserSeen: true });
  });
  it('carries unknown keys, their timestamps and the version through', () => {
    const after = stampPatch(env({ mapStyle: 'paper' }, { mapStyle: SUN }, 2), { motion: 'reduce' }, MON);
    expect(after).toEqual(env({ mapStyle: 'paper', motion: 'reduce' }, { mapStyle: SUN, motion: MON }, 2));
  });
  it('starts from an empty envelope when given none', () => {
    expect(stampPatch(null, { view: 'atlas' }, MON)).toEqual(env({ view: 'atlas' }, { view: MON }));
  });
});

describe('migrateLegacy', () => {
  it('turns a stored light or dark theme into a value with no timestamp', () => {
    expect(migrateLegacy({ theme: 'light' })).toEqual(env({ theme: 'light' }));
    expect(migrateLegacy({ theme: 'dark' })).toEqual(env({ theme: 'dark' }));
  });
  it('gives an empty envelope for no value or an unknown one, which reads as system', () => {
    for (const theme of [undefined, null, '', 'system', 'sepia']) {
      expect(migrateLegacy({ theme })).toEqual(emptyEnvelope());
    }
    expect(migrateLegacy()).toEqual(emptyEnvelope());
    expect(normalisePrefs(migrateLegacy().values).theme).toBe('system');
  });
});

describe('envelopeForNewUser', () => {
  it('keeps theme and motion with no timestamp and drops everything else', () => {
    const other = env(
      { view: 'departures', theme: 'light', motion: 'reduce', timeFormat: '24h', viewChooserSeen: true, mapStyle: 'paper' },
      { view: MON, theme: MON, motion: SUN, mapStyle: TUE },
      2,
    );
    expect(envelopeForNewUser(other)).toEqual(env({ theme: 'light', motion: 'reduce' }));
    expect(normalisePrefs(envelopeForNewUser(other).values)).toEqual({ ...DEFAULT_PREFS, theme: 'light', motion: 'reduce' });
  });
  it('keeps neither when there was neither', () => {
    expect(envelopeForNewUser(env({ view: 'concierge' }, { view: MON }))).toEqual(emptyEnvelope());
    expect(envelopeForNewUser(null)).toEqual(emptyEnvelope());
  });
});

describe('changedPrefKeys', () => {
  it('lists the known keys whose value differs', () => {
    const before = normalisePrefs({});
    expect(changedPrefKeys(before, normalisePrefs({ view: 'departures', timeFormat: '24h' }))).toEqual(['view', 'timeFormat']);
    expect(changedPrefKeys(before, { ...before })).toEqual([]);
  });
});

describe('shouldReloadForRemotePrefs', () => {
  const base = { changedKeys: ['view'], touched: false, busy: false };

  it.each(['/', '', '#/', '/trip/abc', '#/trip/abc', '/trip/abc?today=1', '/trip/9f1c-22?today=0&open=flights'])('reloads on %j', (path) => {
    expect(shouldReloadForRemotePrefs({ ...base, path })).toBe(true);
  });
  it.each(['/settings', '/profile', '/wizard', '/wizard/3', '/atlas', '/admin', '/shared/tok', '/trip/abc/read', '/trip/', '/trips', '/trip/abc/extra'])('never reloads %j', (path) => {
    expect(shouldReloadForRemotePrefs({ ...base, path })).toBe(false);
  });
  it.each(RERENDER_KEYS)('reloads for %s', (key) => {
    expect(shouldReloadForRemotePrefs({ ...base, path: '/', changedKeys: [key] })).toBe(true);
    expect(shouldReloadForRemotePrefs({ ...base, path: '/trip/abc', changedKeys: ['theme', key] })).toBe(true);
  });
  it.each(['theme', 'motion', 'viewChooserSeen', 'openTodayFirst', 'autoOpenNextDay', 'mapStyle'])('does not reload for %s alone', (key) => {
    expect(shouldReloadForRemotePrefs({ ...base, path: '/', changedKeys: [key] })).toBe(false);
  });
  it('does not reload a page the user has touched', () => {
    expect(shouldReloadForRemotePrefs({ ...base, path: '/', touched: true })).toBe(false);
    expect(shouldReloadForRemotePrefs({ ...base, path: '/trip/abc', touched: true })).toBe(false);
  });
  it('does not reload a busy page (a dialog, edit mode, a chat draft, a focused field)', () => {
    expect(shouldReloadForRemotePrefs({ ...base, path: '/', busy: true })).toBe(false);
    expect(shouldReloadForRemotePrefs({ ...base, path: '/trip/abc', busy: true })).toBe(false);
  });
  it('is false with nothing or with no changed key', () => {
    expect(shouldReloadForRemotePrefs()).toBe(false);
    expect(shouldReloadForRemotePrefs({ path: '/' })).toBe(false);
    expect(shouldReloadForRemotePrefs({ ...base, path: '/', changedKeys: [] })).toBe(false);
    expect(shouldReloadForRemotePrefs({ ...base, path: null })).toBe(false);
  });
});
