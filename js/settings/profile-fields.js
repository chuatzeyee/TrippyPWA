// The profile-backed controls of Settings (blueprint 6.2, 6.3): what each one may write to the profile
// row, and how a stored value is shown. Pure: no DOM, no network, no storage. Owner: F12.
import { NATIONALITIES } from '../data/nationalities.js';
import { currencyOptions } from '../data/currency-list.js';

/** The limit the profile wizard already accepts. */
export const NAME_MAX = 100;
export const NAME_ERROR = 'Enter a name of 1 to 100 characters.';
export const CITY_ERROR = 'Choose a city from the list.';
const NATIONALITY_ERROR = 'Choose a passport from the list.';
const CURRENCY_ERROR = 'Choose a currency from the list.';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const refuse = (error) => ({ ok: false, error });
const accept = (patch) => ({ ok: true, patch });

/**
 * A display name, trimmed. Length is counted in characters, so an emoji is one.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function cleanName(value) {
  const name = text(value);
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX ? { ok: true, value: name } : refuse(NAME_ERROR);
}

/** "Lisbon, Portugal"; the city alone when it is its own country ("Singapore") or has none; '' without a city. */
export function cityLabel(profile) {
  const city = text(profile?.home_city);
  const country = text(profile?.home_country);
  if (!city) return '';
  return country && country.toLowerCase() !== city.toLowerCase() ? `${city}, ${country}` : city;
}

/**
 * The options of the passport select: "Not set", then every passport by name. A stored code the list
 * does not know is appended, shown by its code, so the saved value is always an option.
 * @param {string|null} [stored] profiles.nationality
 * @returns {Array<{ value: string, label: string }>}
 */
export function nationalityOptions(stored) {
  const known = NATIONALITIES.map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const code = text(stored).toLowerCase();
  const extra = code && !known.some((option) => option.value === code) ? [{ value: code, label: code.toUpperCase() }] : [];
  return [{ value: '', label: 'Not set' }, ...known, ...extra];
}

/** @returns {{ code: string, symbol: string }|null} the home currency of a profile row, null when none is set */
export function homeCurrencyOf(profile) {
  const code = text(profile?.home_currency);
  if (!code) return null;
  const symbol = text(profile?.home_currency_symbol) || currencyOptions(code).find((entry) => entry.code === code)?.symbol || code;
  return { code, symbol };
}

const WRITERS = {
  name(input) {
    const name = cleanName(input);
    return name.ok ? accept({ display_name: name.value }) : name;
  },
  // The three always come from one catalogue result, so they agree. A full-time traveller may have none.
  city(input, profile) {
    if (input === null) return profile?.is_nomad === true ? accept({ home_city: '', home_country: '', home_flag: '' }) : refuse(CITY_ERROR);
    const [name, country, flag] = [text(input?.name), text(input?.country), text(input?.flag)];
    return name && country && flag ? accept({ home_city: name, home_country: country, home_flag: flag }) : refuse(CITY_ERROR);
  },
  nationality(input, profile) {
    const code = text(input).toLowerCase();
    const allowed = nationalityOptions(profile?.nationality).some((option) => option.value === code);
    return allowed ? accept({ nationality: code }) : refuse(NATIONALITY_ERROR);
  },
  nomad(input) {
    return accept({ is_nomad: input === true });
  },
  currency(input, profile) {
    const entry = currencyOptions(profile?.home_currency, profile?.home_currency_symbol ?? '').find((option) => option.code === input);
    return entry ? accept({ home_currency: entry.code, home_currency_symbol: entry.symbol }) : refuse(CURRENCY_ERROR);
  },
};

/**
 * The columns one control writes, or why it may not.
 * @param {'name'|'city'|'nationality'|'nomad'|'currency'} field
 * @param {*} input  name: the text. city: a searchCities() result, or null to clear. nationality: the code.
 *                   nomad: boolean. currency: the code.
 * @param {object|null} profile the row as last saved
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function profilePatch(field, input, profile) {
  return Object.hasOwn(WRITERS, field) ? WRITERS[field](input, profile) : refuse('This cannot be changed here.');
}

/** A new row with the patch applied. Neither argument is changed. */
export function mergeProfile(profile, patch) {
  return { ...(profile ?? {}), ...(patch ?? {}) };
}
