// The rules behind the profile-backed controls of Settings (blueprint 6.2, 6.3): what a control may
// write to the profile row, and the text a stored value is shown as. Owner: F12.
import { describe, it, expect } from 'vitest';
import {
  NAME_MAX, NAME_ERROR, CITY_ERROR, cleanName, cityLabel, nationalityOptions, profilePatch, mergeProfile, homeCurrencyOf,
} from './profile-fields.js';
import { NATIONALITIES } from '../data/nationalities.js';
import { CURRENCY_LIST } from '../data/currency-list.js';

const PROFILE = Object.freeze({
  display_name: 'Avery Lindqvist', home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt', is_nomad: false,
  home_currency: 'EUR', home_currency_symbol: '€', nationality: 'pt',
});

describe('cleanName', () => {
  it('trims and accepts 1 to 100 characters', () => {
    expect(cleanName('  Avery  ')).toEqual({ ok: true, value: 'Avery' });
    expect(cleanName('A')).toEqual({ ok: true, value: 'A' });
    const hundred = 'n'.repeat(100);
    expect(NAME_MAX).toBe(100);
    expect(cleanName(hundred)).toEqual({ ok: true, value: hundred });
    expect(cleanName(` ${hundred} `)).toEqual({ ok: true, value: hundred });
  });
  it('refuses an empty name and one of 101 characters', () => {
    for (const bad of ['', '   ', null, undefined, 'n'.repeat(101)]) {
      expect(cleanName(bad)).toEqual({ ok: false, error: NAME_ERROR });
    }
  });
  it('counts characters, not UTF-16 units, so a name of 100 emoji is accepted', () => {
    expect(cleanName('🙂'.repeat(100)).ok).toBe(true);
    expect(cleanName('🙂'.repeat(101)).ok).toBe(false);
  });
});

describe('cityLabel', () => {
  it('is the city and its country, or the city alone when the two are the same word', () => {
    expect(cityLabel(PROFILE)).toBe('Lisbon, Portugal');
    expect(cityLabel({ home_city: 'Singapore', home_country: 'Singapore' })).toBe('Singapore');
    expect(cityLabel({ home_city: 'Osaka', home_country: null })).toBe('Osaka');
  });
  it('is empty without a city', () => {
    expect(cityLabel({ home_city: '', home_country: 'Japan' })).toBe('');
    expect(cityLabel(null)).toBe('');
  });
});

describe('nationalityOptions', () => {
  it('starts with "Not set", then every passport sorted by name, with lower-case codes', () => {
    const options = nationalityOptions('sg');
    expect(options[0]).toEqual({ value: '', label: 'Not set' });
    expect(options).toHaveLength(NATIONALITIES.length + 1);
    const names = options.slice(1).map((option) => option.label);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const option of options.slice(1)) expect(option.value).toMatch(/^[a-z]{2}$/);
  });
  it('always holds the stored value, also one the list does not know', () => {
    expect(nationalityOptions('zz').at(-1)).toEqual({ value: 'zz', label: 'ZZ' });
    expect(nationalityOptions('SG').filter((option) => option.value === 'sg')).toHaveLength(1);
    expect(nationalityOptions('SG')).toHaveLength(NATIONALITIES.length + 1);
    expect(nationalityOptions(null)).toHaveLength(NATIONALITIES.length + 1);
  });
});

describe('profilePatch: what one control writes', () => {
  it('name writes display_name, trimmed', () => {
    expect(profilePatch('name', '  Robin ', PROFILE)).toEqual({ ok: true, patch: { display_name: 'Robin' } });
    expect(profilePatch('name', ' ', PROFILE)).toEqual({ ok: false, error: NAME_ERROR });
  });
  it('city writes the city, its country and its flag together', () => {
    const city = { name: 'Kyoto', country: 'Japan', flag: 'jp', lat: 35, lng: 135 };
    expect(profilePatch('city', city, PROFILE)).toEqual({ ok: true, patch: { home_city: 'Kyoto', home_country: 'Japan', home_flag: 'jp' } });
  });
  it('city refuses anything that is not a catalogue result', () => {
    expect(profilePatch('city', { name: 'Kyoto' }, PROFILE)).toEqual({ ok: false, error: CITY_ERROR });
    expect(profilePatch('city', 'Kyoto', PROFILE)).toEqual({ ok: false, error: CITY_ERROR });
  });
  it('the home city can be cleared by a full-time traveller only', () => {
    expect(profilePatch('city', null, PROFILE)).toEqual({ ok: false, error: CITY_ERROR });
    expect(profilePatch('city', null, { ...PROFILE, is_nomad: true })).toEqual({ ok: true, patch: { home_city: '', home_country: '', home_flag: '' } });
  });
  it('nationality writes a lower-case code, or nothing set', () => {
    expect(profilePatch('nationality', 'JP', PROFILE)).toEqual({ ok: true, patch: { nationality: 'jp' } });
    expect(profilePatch('nationality', '', PROFILE)).toEqual({ ok: true, patch: { nationality: '' } });
    expect(profilePatch('nationality', 'japan', PROFILE).ok).toBe(false);
    expect(profilePatch('nationality', 'qq', PROFILE).ok).toBe(false);
    // The stored code stays a valid choice even when the list does not know it.
    expect(profilePatch('nationality', 'qq', { ...PROFILE, nationality: 'qq' })).toEqual({ ok: true, patch: { nationality: 'qq' } });
  });
  it('nomad writes a boolean', () => {
    expect(profilePatch('nomad', true, PROFILE)).toEqual({ ok: true, patch: { is_nomad: true } });
    expect(profilePatch('nomad', false, PROFILE)).toEqual({ ok: true, patch: { is_nomad: false } });
  });
  it('currency writes the code and its symbol from the list of home currencies', () => {
    expect(profilePatch('currency', 'SGD', PROFILE)).toEqual({ ok: true, patch: { home_currency: 'SGD', home_currency_symbol: 'S$' } });
    expect(profilePatch('currency', 'XXX', PROFILE).ok).toBe(false);
    // A stored currency outside the list can be chosen again, with the symbol it was stored with.
    const stored = { ...PROFILE, home_currency: 'ISK', home_currency_symbol: 'kr' };
    expect(profilePatch('currency', 'ISK', stored)).toEqual({ ok: true, patch: { home_currency: 'ISK', home_currency_symbol: 'kr' } });
  });
  it('every currency on offer can be written', () => {
    for (const { code, symbol } of CURRENCY_LIST) {
      expect(profilePatch('currency', code, PROFILE)).toEqual({ ok: true, patch: { home_currency: code, home_currency_symbol: symbol } });
    }
  });
  it('an unknown control writes nothing', () => {
    expect(profilePatch('role', 'admin', PROFILE).ok).toBe(false);
    expect(profilePatch('prefs', {}, PROFILE).ok).toBe(false);
  });
  it('never writes a column outside the editable ones', () => {
    const allowed = ['display_name', 'home_city', 'home_country', 'home_flag', 'is_nomad', 'home_currency', 'home_currency_symbol', 'nationality'];
    const patches = [
      profilePatch('name', 'Robin', PROFILE), profilePatch('city', { name: 'Kyoto', country: 'Japan', flag: 'jp' }, PROFILE),
      profilePatch('nationality', 'jp', PROFILE), profilePatch('nomad', true, PROFILE), profilePatch('currency', 'JPY', PROFILE),
    ];
    for (const result of patches) for (const key of Object.keys(result.patch)) expect(allowed).toContain(key);
  });
});

describe('mergeProfile', () => {
  it('returns a new row with the patch applied and leaves the old one alone', () => {
    const next = mergeProfile(PROFILE, { display_name: 'Robin' });
    expect(next).toEqual({ ...PROFILE, display_name: 'Robin' });
    expect(next).not.toBe(PROFILE);
    expect(PROFILE.display_name).toBe('Avery Lindqvist');
  });
  it('starts from an empty row when there is none', () => {
    expect(mergeProfile(null, { is_nomad: true })).toEqual({ is_nomad: true });
  });
});

describe('homeCurrencyOf', () => {
  it('is the code and symbol of the profile, or null when no currency is set', () => {
    expect(homeCurrencyOf(PROFILE)).toEqual({ code: 'EUR', symbol: '€' });
    expect(homeCurrencyOf({ home_currency: 'SGD', home_currency_symbol: null })).toEqual({ code: 'SGD', symbol: 'S$' });
    expect(homeCurrencyOf({ home_currency: 'ISK', home_currency_symbol: '' })).toEqual({ code: 'ISK', symbol: 'ISK' });
    expect(homeCurrencyOf({ home_currency: '' })).toBeNull();
    expect(homeCurrencyOf(null)).toBeNull();
  });
});
