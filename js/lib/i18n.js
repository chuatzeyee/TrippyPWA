// Languages (the footer and the site pages; the rest of the app is English for now). Pure but for
// two optional touches of the browser: navigator.languages on a first visit and <html lang>. The
// choice itself is the "language" pref (js/lib/prefs.js): js/data/prefs-store.js applies it here with
// applyLanguage() and connects setLanguage() to the store, so UI code needs this module only.
//
// Strings: one flat table per language in js/lib/i18n/<code>.js, keyed 'area.name' (footer.*, site.*,
// credits.*, language.*, settings.*). English is in the main bundle; another language is fetched when
// it is first used. To add a string: add the key to en.js, then the same key to ms.js, zh-Hans.js and
// fi.js (js/lib/i18n.test.js fails while a table lacks a key), and read it with t('area.name').
// A value may hold {places}: t('footer.copyright', { year: 2026 }).
import en from './i18n/en.js';

/** The four languages, in menu order, each under its own name. `tag` is the value of <html lang>. */
export const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', tag: 'en' },
  { code: 'ms', name: 'Bahasa Melayu', tag: 'ms' },
  { code: 'zh-Hans', name: '简体中文', tag: 'zh-Hans' },
  { code: 'fi', name: 'Suomi', tag: 'fi' },
].map((language) => Object.freeze(language)));

export const DEFAULT_LANGUAGE = 'en';

const CODES = LANGUAGES.map((language) => language.code);
const LOADERS = {
  ms: () => import('./i18n/ms.js'),
  'zh-Hans': () => import('./i18n/zh-Hans.js'),
  fi: () => import('./i18n/fi.js'),
};
/** Regions and scripts that read Traditional Chinese: they get English, not Simplified. */
const TRADITIONAL = /^zh-(tw|hk|mo|hant)\b/;

const tables = new Map([[DEFAULT_LANGUAGE, { ...en }]]);
const loaded = new Set([DEFAULT_LANGUAGE]);
const listeners = new Set();
let current = DEFAULT_LANGUAGE;
let ready = Promise.resolve();
let writePref = null;

/** @returns {boolean} true for 'en', 'ms', 'zh-Hans' and 'fi' */
export const isLanguage = (code) => typeof code === 'string' && CODES.includes(code);

/** @returns {string} the language's own name; English for a code that is not a language */
export const languageName = (code) => (LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]).name;

/**
 * One of the four for a browser language tag ('zh-CN', 'ms-MY', 'fi'), or null.
 * @param {*} tag
 * @returns {string|null}
 */
export function matchLanguage(tag) {
  if (typeof tag !== 'string' || !tag) return null;
  const lower = tag.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-')) return TRADITIONAL.test(lower) ? null : 'zh-Hans';
  const base = lower.split('-')[0];
  return CODES.includes(base) ? base : null;
}

/**
 * The language a visitor reads: the stored choice, or for 'auto' (nothing chosen yet) the first of
 * the browser's languages that is one of the four, or English.
 * @param {*} pref the "language" pref
 * @param {readonly string[]} [browserLanguages] navigator.languages
 * @returns {string}
 */
export function resolveLanguage(pref, browserLanguages = []) {
  if (isLanguage(pref)) return pref;
  for (const tag of Array.isArray(browserLanguages) ? browserLanguages : []) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
}

/** Fills the {name} places of a string. A place with no value is left as written. */
export function format(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (place, name) => (vars != null && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : place));
}

/**
 * Adds strings to a language's table (tests, or a module that brings its own strings).
 * @param {string} code
 * @param {Object<string, string>} strings
 */
export function registerStrings(code, strings) {
  if (!isLanguage(code)) return;
  tables.set(code, { ...(tables.get(code) ?? {}), ...strings });
}

const lookup = (code, key) => {
  const text = tables.get(code)?.[key];
  return typeof text === 'string' && text !== '' ? text : null;
};

/**
 * A translate function bound to one language: that language, then English, then the key itself.
 * @param {string} code
 * @returns {(key: string, vars?: Object<string, *>) => string}
 */
export function tFor(code) {
  return (key, vars) => format(lookup(code, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key, vars);
}

/** The string for a key in the language on screen. */
export const t = (key, vars) => tFor(current)(key, vars);

/** @returns {string} the language on screen: 'en', 'ms', 'zh-Hans' or 'fi' */
export const getLanguage = () => current;

/** Resolves when the table of the language on screen is loaded (at once for English). Never rejects. */
export const languageReady = () => ready;

/** The callback gets the new language code once its strings are loaded. @returns a function that unsubscribes */
export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function browserLanguages() {
  try {
    if (typeof navigator === 'undefined') return [];
    return navigator.languages?.length ? [...navigator.languages] : [navigator.language].filter(Boolean);
  } catch {
    return [];
  }
}
const documentRoot = () => (typeof document !== 'undefined' ? document.documentElement ?? null : null);

async function loadTable(code) {
  if (loaded.has(code)) return;
  try {
    const mod = await LOADERS[code]();
    tables.set(code, { ...mod.default, ...(tables.get(code) ?? {}) });
    loaded.add(code);
  } catch {
    // The file could not be fetched (offline, a new release): the strings stay English until the
    // next change of language asks again.
  }
}

/**
 * Makes a pref value the language on screen: <html lang> at once, then the strings, then the
 * listeners. Called by the prefs store for every start and every change of the pref.
 * @param {*} pref 'auto' or a language code
 * @param {{ browserLanguages?: readonly string[], root?: { setAttribute: Function }|null }} [env] for tests
 * @returns {string} the language
 */
export function applyLanguage(pref, { browserLanguages: tags = browserLanguages(), root = documentRoot() } = {}) {
  const next = resolveLanguage(pref, tags);
  const tag = LANGUAGES.find((language) => language.code === next).tag;
  try { root?.setAttribute('lang', tag); } catch { /* no document */ }
  if (next === current) return current;
  current = next;
  ready = loadTable(next).then(() => {
    if (current !== next) return; // changed again while the strings were loading
    for (const callback of [...listeners]) {
      try { callback(next); } catch { /* one listener must not stop the rest */ }
    }
  });
  return current;
}

/**
 * The prefs store hands over the function that stores a choice (setPref('language', code)).
 * @param {((code: string) => void)|null} write
 */
export function connectLanguagePref(write) {
  writePref = typeof write === 'function' ? write : null;
}

/**
 * The visitor chose a language. Stored on the device, and in the account when signed in, by the
 * prefs store, which applies it; with no store connected it holds for this visit.
 * @param {string} code
 * @returns {boolean} false for anything that is not one of the four
 */
export function setLanguage(code) {
  if (!isLanguage(code)) return false;
  if (writePref) writePref(code);
  else applyLanguage(code);
  return true;
}
