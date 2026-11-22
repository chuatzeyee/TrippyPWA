// The page loader: one file per page per language, English when a language has none.
import { describe, it, expect } from 'vitest';
import { SITE_PAGE_IDS, isSitePage, loadSitePage, pageFile, pageLanguages } from './pages.js';
import { validatePage } from './content.js';
import { LANGUAGES } from '../lib/i18n.js';

const page = (title) => ({ title, sections: [{ id: 'a', heading: 'A', blocks: [{ type: 'p', text: 'x' }] }] });
const FILES = {
  './pages/about.en.js': async () => ({ default: page('About'), mount: () => {} }),
  './pages/about.fi.js': async () => ({ default: page('Tietoja') }),
  './pages/about.ms.js': async () => { throw new Error('Failed to fetch dynamically imported module'); },
  './pages/terms.fi.js': async () => ({ default: page('Ehdot') }),
};

describe('loadSitePage', () => {
  it('gives the page in the reader\'s language when its file exists', async () => {
    const got = await loadSitePage('about', 'fi', FILES);
    expect(got.page.title).toBe('Tietoja');
    expect(got).toMatchObject({ language: 'fi', fallback: false, mount: null });
  });
  it('gives English, marked as a fallback, when the language has no file', async () => {
    const got = await loadSitePage('about', 'zh-Hans', FILES);
    expect(got.page.title).toBe('About');
    expect(got).toMatchObject({ language: 'en', fallback: true });
    expect(typeof got.mount).toBe('function');
  });
  it('gives English when the translation will not load', async () => {
    expect(await loadSitePage('about', 'ms', FILES)).toMatchObject({ language: 'en', fallback: true });
  });
  it('English is never a fallback', async () => {
    expect(await loadSitePage('about', 'en', FILES)).toMatchObject({ language: 'en', fallback: false });
  });
  it('gives null for a page that does not exist or has no English file', async () => {
    expect(await loadSitePage('careers', 'en', FILES)).toBeNull();
    expect(await loadSitePage('privacy', 'en', FILES)).toBeNull();
  });
  it('rejects when English itself cannot be fetched', async () => {
    const broken = { './pages/about.en.js': async () => { throw new Error('offline'); } };
    await expect(loadSitePage('about', 'en', broken)).rejects.toThrow('offline');
  });
});

describe('the pages in the tree', () => {
  it('are about, privacy and terms', () => {
    expect(SITE_PAGE_IDS).toEqual(['about', 'privacy', 'terms']);
    expect(isSitePage('privacy')).toBe(true);
    expect(isSitePage('admin')).toBe(false);
    expect(pageFile('terms', 'zh-Hans')).toBe('./pages/terms.zh-Hans.js');
  });
  it.each(SITE_PAGE_IDS)('%s exists in English and every file of it can be drawn in full', async (pageId) => {
    const languages = pageLanguages(pageId);
    expect(languages).toContain('en');
    for (const language of languages) {
      expect(LANGUAGES.map((entry) => entry.code), `${pageId}.${language}.js`).toContain(language);
      const got = await loadSitePage(pageId, language);
      expect(got.language).toBe(language);
      expect(validatePage(got.page), `${pageId}.${language}.js`).toEqual([]);
    }
  });
  it('a translation keeps the section ids of the English page, in the same order', async () => {
    for (const pageId of SITE_PAGE_IDS) {
      const english = (await loadSitePage(pageId, 'en')).page.sections.map((section) => section.id);
      for (const language of pageLanguages(pageId).filter((code) => code !== 'en')) {
        const ids = (await loadSitePage(pageId, language)).page.sections.map((section) => section.id);
        expect(ids, `${pageId}.${language}.js`).toEqual(english);
      }
    }
  });
});
