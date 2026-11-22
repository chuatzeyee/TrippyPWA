// The Finnish pages (about, privacy, terms): block for block the same shape as the English ones, the
// same links and fact places, none of the owner's banned characters, and the legal sentences a
// translation must keep. The wording itself is for a Finnish reader to judge, not for this file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import aboutEn from './about.en.js';
import aboutFi, { mount } from './about.fi.js';
import privacyEn from './privacy.en.js';
import privacyFi from './privacy.fi.js';
import termsEn from './terms.en.js';
import termsFi from './terms.fi.js';
import { sectionsHtml, factPlaces, validatePage } from '../content.js';
import { sitePageHtml } from '../site-page.js';
import { BANNED_GLYPHS, pageText, pageTexts, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';

const PAIRS = [['about', aboutEn, aboutFi], ['privacy', privacyEn, privacyFi], ['terms', termsEn, termsFi]];
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const count = (value) => (Array.isArray(value) ? value.length : 1);
const sorted = (list) => [...list].sort();

/** The shape of a page without its words: block types, and how many items, rows and lines each holds. */
function shape(page) {
  return page.sections.map((section) => ({
    id: section.id,
    blocks: section.blocks.map((block) => {
      if (block.type === 'list') return ['list', Boolean(block.ordered), block.items.map((item) => (typeof item === 'string' ? 0 : count(item.items ?? [])))];
      if (block.type === 'defs') return ['defs', block.rows.map((row) => count(row.text))];
      if (block.type === 'cards') return ['cards', block.items.length];
      if (block.type === 'faq') return ['faq', block.items.map((item) => count(item.a))];
      if (block.type === 'note') return ['note', Boolean(block.title), count(block.text)];
      if (block.type === 'custom') return ['custom', (block.html.match(/<(li|p|button|input|img|h3|h4|details)\b/g) ?? []).length];
      return [block.type];
    }),
  }));
}
const places = (page) => sorted(pageText(page).match(/\{\w+\}/g) ?? []);
const links = (page) => sorted(internalLinks(page).map((link) => `${link.page}/${link.section ?? ''}`));
const outside = (page) => sorted(pageText(page).match(/\]\((https?:|mailto:)[^)]*\)/g) ?? []);

describe.each(PAIRS)('the Finnish %s page', (pageId, english, finnish) => {
  it('can be drawn and has the English page\'s shape, block for block', () => {
    expect(validatePage(finnish)).toEqual([]);
    expect(count(finnish.intro)).toBe(count(english.intro));
    expect(shape(finnish)).toEqual(shape(english));
  });
  it('keeps every link and every fact place of the English page', () => {
    expect(links(finnish)).toEqual(links(english));
    expect(outside(finnish)).toEqual(outside(english));
    expect(places(finnish)).toEqual(places(english));
    expect(unknownPlaces(finnish)).toEqual([]);
    expect(leftoverSyntax(finnish)).toEqual([]);
  });
  it('holds none of the banned characters, in its words or in its source', () => {
    for (const line of pageTexts(finnish)) expect(line, line).not.toMatch(BANNED_GLYPHS);
    expect(read(`./${pageId}.fi.js`)).not.toMatch(BANNED_GLYPHS);
    expect(sitePageHtml({ pageId, page: finnish, language: 'fi', info: { country: 'Singapore', siteUrl: 'https://example.test/' } })).not.toMatch(BANNED_GLYPHS);
  });
  it('still reads when the owner has supplied no contact yet', () => {
    const html = sectionsHtml(finnish, { places: factPlaces({}, () => 'Yhteystiedot julkaistaan tässä ennen palvelun avaamista') });
    const after = [...html.matchAll(/<span class="site-pending">[^<]*<\/span>(.{0,12})/g)].map((match) => match[1]);
    expect(after.length).toBeGreaterThan(2);
    for (const tail of after) expect(tail).toMatch(/^(\.|<\/(p|dd)>)/);
  });
});

describe('the Finnish legal texts', () => {
  const section = (page, id) => pageText(page.sections.find((entry) => entry.id === id));
  it('say that the English text governs', () => {
    expect(section(privacyFi, 'changes')).toMatch(/englanninkielinen teksti on ratkaiseva/);
    expect(section(termsFi, 'general')).toMatch(/englanninkielinen teksti on ratkaiseva/);
  });
  it('name the statutes by their official English names', () => {
    expect(pageText(privacyFi)).toContain('Personal Data Protection Act 2012');
    expect(pageText(privacyFi)).toContain('Personal Data Protection Commission');
    for (const name of ['Personal Data Protection Act 2012', 'Consumer Protection (Fair Trading) Act 2003', 'Unfair Contract Terms Act 1977']) expect(section(termsFi, 'liability')).toContain(name);
    expect(section(termsFi, 'general')).toContain('Contracts (Rights of Third Parties) Act 2001');
    expect(section(termsFi, 'governing-law')).toContain('Small Claims Tribunals');
  });
  it('keep the figures of the English texts', () => {
    const figures = (page) => sorted(pageText(page).match(/\d+/g) ?? []);
    expect(figures(privacyFi)).toEqual(figures(privacyEn));
    expect(figures(termsFi)).toEqual(figures(termsEn));
  });
  it('carry the consent and withdrawal clauses in the established Finnish terms', () => {
    expect(section(privacyFi, 'consent')).toMatch(/suostumu/);
    expect(section(privacyFi, 'consent')).toMatch(/Oletettu suostumus/);
    expect(privacyFi.sections.find((entry) => entry.id === 'withdrawal').heading).toBe('Suostumuksen peruuttaminen');
    expect(pageText(privacyFi)).toMatch(/Emme myy henkilötietoja/);
  });
});

describe('the Finnish About page\'s own blocks', () => {
  it('passes the sample plan in Finnish to the page and to its mount', () => {
    const html = sitePageHtml({ pageId: 'about', page: aboutFi, language: 'fi', info: { country: 'Singapore', siteUrl: 'https://example.test/' } });
    expect(html).toContain('Kioto, 3 päivää huhtikuussa');
    expect(html).toContain('Tyypillinen sää');
    expect(html).not.toContain('Typical weather:');
    expect(html).not.toContain('Partly cloudy');
    expect(typeof mount).toBe('function');
  });
});
