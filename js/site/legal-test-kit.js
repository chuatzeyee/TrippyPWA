// Shared checks for the tests of the legal texts (privacy.en.test.js, terms.en.test.js). Not a page:
// it sits outside js/site/pages/ so that the page loader's glob never bundles it.
import { sectionsHtml, factPlaces, inlineHtml } from './content.js';

/** Characters the owner bans from text a user sees: em dash, en dash, middle dot, bullets, ellipsis. */
export const BANNED_GLYPHS = /[‒-―·•‣⁃●◦…]/;
/** Words the owner bans as marketing or AI-summary copy. */
export const BANNED_WORDS = /\b(seamless(ly)?|elevate|unlock|journey|leverage|delve|effortless(ly)?)\b/i;
const FACTS = ['operator', 'contactEmail', 'dpoEmail', 'country', 'siteUrl'];

/** Every string a reader sees in a page, in reading order. */
export function pageTexts(page) {
  const out = [];
  const walk = (value) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, inner]) => { if (key !== 'id' && key !== 'type') walk(inner); });
  };
  walk(page);
  return out;
}

export const pageText = (page) => pageTexts(page).join('\n');
export const sectionIds = (page) => page.sections.map((section) => section.id);

/** Every [label](#/page/section) target in a page, as { page, section }. */
export function internalLinks(page) {
  return [...pageText(page).matchAll(/\]\(#\/([a-z]+)(?:\/([a-z0-9-]+))?\)/g)].map((match) => ({ page: match[1], section: match[2] ?? null }));
}

/** The {places} a page uses that the frame does not know. */
export function unknownPlaces(page) {
  return [...new Set([...pageText(page).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].filter((name) => !FACTS.includes(name));
}

/** The page drawn with every fact supplied, and with none: markup left unconverted in either. */
export function leftoverSyntax(page) {
  const filled = factPlaces({ operatorName: 'Sample Operator', contactEmail: 'hello@trippy.example', dataProtectionEmail: 'privacy@trippy.example', country: 'Singapore', siteUrl: 'https://trippy.example/' });
  const empty = factPlaces({});
  return [filled, empty].flatMap((places) => {
    const html = sectionsHtml(page, { places }) + [].concat(page.intro ?? []).map((line) => inlineHtml(line, { places })).join('');
    return html.match(/\*\*|\]\(|\{\w+\}/g) ?? [];
  });
}
