// Languages: the list, which one a visitor gets, the string tables and their fallback to English.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_LANGUAGE, LANGUAGES, applyLanguage, connectLanguagePref, format, getLanguage, isLanguage, languageName,
  languageReady, matchLanguage, onLanguageChange, registerStrings, resolveLanguage, setLanguage, t, tFor,
} from './i18n.js';
import en from './i18n/en.js';
import ms from './i18n/ms.js';
import zh from './i18n/zh-Hans.js';
import fi from './i18n/fi.js';

const BANNED = /[—–·•…]/;

beforeEach(async () => {
  connectLanguagePref(null);
  applyLanguage('en', { browserLanguages: [] });
  await languageReady();
});

describe('the languages', () => {
  it('are English, Bahasa Melayu, Chinese (Simplified) and Finnish, under their own names', () => {
    expect(LANGUAGES.map((language) => [language.code, language.name])).toEqual([
      ['en', 'English'], ['ms', 'Bahasa Melayu'], ['zh-Hans', '简体中文'], ['fi', 'Suomi'],
    ]);
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(Object.isFrozen(LANGUAGES)).toBe(true);
    expect(languageName('fi')).toBe('Suomi');
    expect(languageName('xx')).toBe('English');
  });
  it('knows a language code from anything else', () => {
    for (const code of ['en', 'ms', 'zh-Hans', 'fi']) expect(isLanguage(code)).toBe(true);
    for (const code of ['auto', 'zh', 'EN', '', null, undefined, 7]) expect(isLanguage(code)).toBe(false);
  });
});

describe('matchLanguage', () => {
  it('maps a browser tag to one of the four', () => {
    expect(matchLanguage('en-SG')).toBe('en');
    expect(matchLanguage('ms-MY')).toBe('ms');
    expect(matchLanguage('MS')).toBe('ms');
    expect(matchLanguage('fi-FI')).toBe('fi');
    expect(matchLanguage('zh')).toBe('zh-Hans');
    expect(matchLanguage('zh-CN')).toBe('zh-Hans');
    expect(matchLanguage('zh-SG')).toBe('zh-Hans');
    expect(matchLanguage('zh-Hans-MY')).toBe('zh-Hans');
  });
  it('does not give Simplified Chinese to a reader of Traditional Chinese, or anything to another language', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-SG', 'id', 'sv-FI', 'de', '', null, 5]) expect(matchLanguage(tag)).toBeNull();
  });
});

describe('resolveLanguage', () => {
  it('an explicit choice wins', () => {
    expect(resolveLanguage('fi', ['ms'])).toBe('fi');
    expect(resolveLanguage('zh-Hans', [])).toBe('zh-Hans');
  });
  it('auto takes the first browser language that is one of the four, else English', () => {
    expect(resolveLanguage('auto', ['de-DE', 'fi', 'en'])).toBe('fi');
    expect(resolveLanguage('auto', ['zh-TW', 'ms-MY'])).toBe('ms');
    expect(resolveLanguage('auto', ['de', 'fr'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
    expect(resolveLanguage(undefined, undefined)).toBe('en');
    expect(resolveLanguage('klingon', ['fi'])).toBe('fi');
  });
});

describe('format', () => {
  it('fills {name} places and leaves an unknown place as it is', () => {
    expect(format('Copyright © {year} Trippy.', { year: 2026 })).toBe('Copyright © 2026 Trippy.');
    expect(format('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(format('no places')).toBe('no places');
  });
});

describe('t', () => {
  it('reads the current language, then English, then gives the key back', async () => {
    registerStrings('fi', { 'test.only-fi': 'vain suomeksi' });
    registerStrings('en', { 'test.only-en': 'only in English', 'test.only-fi': 'English version' });
    applyLanguage('fi', { browserLanguages: [] });
    await languageReady();
    expect(getLanguage()).toBe('fi');
    expect(t('test.only-fi')).toBe('vain suomeksi');
    expect(t('test.only-en')).toBe('only in English');
    expect(t('test.nowhere')).toBe('test.nowhere');
    expect(tFor('en')('test.only-fi')).toBe('English version');
  });
  it('fills variables', () => {
    expect(t('footer.copyright', { year: 2031 })).toBe('Copyright © 2031 Trippy. All rights reserved.');
  });
  it('an empty string in a table counts as missing', async () => {
    registerStrings('en', { 'test.blank': 'English' });
    registerStrings('ms', { 'test.blank': '' });
    applyLanguage('ms', { browserLanguages: [] });
    await languageReady();
    expect(t('test.blank')).toBe('English');
  });
});

describe('applyLanguage and setLanguage', () => {
  it('loads the table of a language before telling anyone it changed', async () => {
    const heard = [];
    const stop = onLanguageChange((code) => heard.push([code, t('footer.group.plan')]));
    applyLanguage('zh-Hans', { browserLanguages: [] });
    await languageReady();
    expect(heard).toEqual([['zh-Hans', zh['footer.group.plan']]]);
    applyLanguage('zh-Hans', { browserLanguages: [] }); // the same language again: nobody is told
    await languageReady();
    expect(heard).toHaveLength(1);
    stop();
    applyLanguage('en', { browserLanguages: [] });
    await languageReady();
    expect(heard).toHaveLength(1);
  });
  it('the last of two quick changes wins', async () => {
    applyLanguage('fi', { browserLanguages: [] });
    applyLanguage('ms', { browserLanguages: [] });
    await languageReady();
    expect(getLanguage()).toBe('ms');
    expect(t('footer.group.plan')).toBe(ms['footer.group.plan']);
  });
  it('sets lang on the document it is given', async () => {
    const root = { lang: 'en', setAttribute(name, value) { this[name] = value; } };
    applyLanguage('zh-Hans', { browserLanguages: [], root });
    expect(root.lang).toBe('zh-Hans');
    await languageReady();
  });
  it('setLanguage refuses what is not a language, and writes the pref when a store is connected', async () => {
    expect(setLanguage('auto')).toBe(false);
    expect(setLanguage('de')).toBe(false);
    const written = [];
    connectLanguagePref((code) => { written.push(code); });
    expect(setLanguage('fi')).toBe(true);
    expect(written).toEqual(['fi']);
    expect(getLanguage()).toBe('en'); // the store applies it, not setLanguage
    connectLanguagePref(null);
    expect(setLanguage('fi')).toBe(true); // with no store the choice is applied for this visit
    await languageReady();
    expect(getLanguage()).toBe('fi');
  });
});

describe('the string tables', () => {
  const tables = { en, ms, 'zh-Hans': zh, fi };
  it('every language has every key English has, and no key English lacks', () => {
    const keys = Object.keys(en).sort();
    for (const [code, table] of Object.entries(tables)) expect(Object.keys(table).sort(), code).toEqual(keys);
  });
  it('every string keeps the {places} of the English one', () => {
    const places = (text) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const [code, table] of Object.entries(tables)) {
      for (const key of Object.keys(en)) expect(places(table[key]), `${code} ${key}`).toEqual(places(en[key]));
    }
  });
  it('no string holds a dash, a middle dot, a bullet or an ellipsis character', () => {
    for (const [code, table] of Object.entries(tables)) {
      for (const [key, text] of Object.entries(table)) expect(BANNED.test(text), `${code} ${key}`).toBe(false);
    }
  });
});
