// Finds and fetches the content of a site page: js/site/pages/<page>.<language>.js, one module per
// page per language, each fetched only when it is shown. A language with no file for a page gets the
// English one. Adding a translation is adding the file: nothing is registered anywhere.
import { DEFAULT_LANGUAGE } from '../lib/i18n.js';

/** The pages, by the name in their address: #/about, #/privacy, #/terms. */
export const SITE_PAGE_IDS = Object.freeze(['about', 'privacy', 'terms']);

const FILES = import.meta.glob(['./pages/*.js', '!./pages/*.test.js']);

export const isSitePage = (pageId) => typeof pageId === 'string' && SITE_PAGE_IDS.includes(pageId);

/** The key of a page's module in the list of files. */
export const pageFile = (pageId, language) => `./pages/${pageId}.${language}.js`;

/** @returns {string[]} the languages a page exists in, by the files that are there */
export function pageLanguages(pageId, files = FILES) {
  const prefix = `./pages/${pageId}.`;
  return Object.keys(files).filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length, -'.js'.length));
}

/**
 * The content of a page for a reader.
 * @param {string} pageId
 * @param {string} language the language on screen
 * @param {Object<string, () => Promise<{ default: object, mount?: Function }>>} [files] for tests
 * @returns {Promise<{ page: import('./content.js').SitePage, mount: Function|null, language: string, fallback: boolean }|null>}
 *   language is the one the content is written in; fallback is true when that is English because the
 *   reader's language has no file (or its file would not load). null when the page does not exist.
 *   Rejects only when the English file itself cannot be fetched.
 */
export async function loadSitePage(pageId, language, files = FILES) {
  if (!isSitePage(pageId)) return null;
  const read = async (code) => {
    const load = files[pageFile(pageId, code)];
    if (!load) return null;
    const mod = await load();
    return mod?.default ? { page: mod.default, mount: typeof mod.mount === 'function' ? mod.mount : null, language: code } : null;
  };
  if (language !== DEFAULT_LANGUAGE) {
    try {
      const own = await read(language);
      if (own) return { ...own, fallback: false };
    } catch {
      // The translation could not be fetched: English is better than nothing.
    }
  }
  const english = await read(DEFAULT_LANGUAGE);
  return english ? { ...english, fallback: language !== DEFAULT_LANGUAGE } : null;
}
