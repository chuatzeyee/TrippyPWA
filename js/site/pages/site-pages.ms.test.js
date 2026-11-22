// The Bahasa Melayu pages against the English ones: block for block the same structure, the same
// links, facts and emphasis counts, and none of the characters the owner bans from text a user sees.
import { describe, it, expect } from 'vitest';
import aboutEn from './about.en.js';
import aboutMs from './about.ms.js';
import privacyEn from './privacy.en.js';
import privacyMs from './privacy.ms.js';
import termsEn from './terms.en.js';
import termsMs from './terms.ms.js';
import { validatePage } from '../content.js';
import { BANNED_GLYPHS, pageText, pageTexts, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';

const PAGES = [['about', aboutEn, aboutMs], ['privacy', privacyEn, privacyMs], ['terms', termsEn, termsMs]];

/** The structure of a value with every string replaced by '', so two languages can be compared. */
const shape = (value) => {
  if (typeof value === 'string') return '';
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, key === 'id' || key === 'type' ? inner : shape(inner)]));
  return value;
};
const count = (text, pattern) => (text.match(pattern) ?? []).length;
// A custom block is markup: compare it by its tags, which are the same in both languages.
const withoutCustom = (page) => ({ ...page, sections: page.sections.map((section) => ({ ...section, blocks: section.blocks.filter((block) => block.type !== 'custom') })) });
const customTags = (page) => page.sections.flatMap((section) => section.blocks).filter((block) => block.type === 'custom').map((block) => (block.html.match(/<[a-z0-9]+/g) ?? []).join(''));

describe.each(PAGES)('%s in Bahasa Melayu', (pageId, english, malay) => {
  it('draws, and has the structure of the English page block for block', () => {
    expect(validatePage(malay)).toEqual([]);
    expect(shape(malay)).toEqual(shape(english));
    expect(customTags(malay)).toEqual(customTags(english));
  });
  it('keeps every link target and every emphasis', () => {
    const en = pageText(english);
    const ms = pageText(malay);
    expect(internalLinks(malay).map((link) => `${link.page}/${link.section}`).sort()).toEqual(internalLinks(english).map((link) => `${link.page}/${link.section}`).sort());
    expect([...ms.matchAll(/\]\((https?:[^)]+)\)/g)].map((match) => match[1]).sort()).toEqual([...en.matchAll(/\]\((https?:[^)]+)\)/g)].map((match) => match[1]).sort());
    expect(count(ms, /\*\*/g)).toBe(count(en, /\*\*/g));
    for (const place of ['operator', 'contactEmail', 'dpoEmail', 'siteUrl']) expect(count(ms, new RegExp(`\\{${place}\\}`, 'g')), place).toBe(count(en, new RegExp(`\\{${place}\\}`, 'g')));
    expect(unknownPlaces(withoutCustom(malay))).toEqual([]);
    expect(leftoverSyntax(withoutCustom(malay))).toEqual([]);
  });
  it('holds none of the banned characters', () => {
    for (const line of pageTexts(malay)) expect(line, line.slice(0, 80)).not.toMatch(BANNED_GLYPHS);
  });
});

describe('the legal texts in Bahasa Melayu', () => {
  it('say that the English text governs, and name each statute with its official English name', () => {
    const governs = /Jika terjemahan berbeza daripada teks bahasa Inggeris, teks bahasa Inggeris yang terpakai\./;
    expect(pageText(privacyMs.sections.find((section) => section.id === 'changes'))).toMatch(governs);
    expect(pageText(termsMs.sections.find((section) => section.id === 'general'))).toMatch(governs);
    expect(pageText(privacyMs)).toContain('Akta Perlindungan Data Peribadi 2012 (Personal Data Protection Act 2012)');
    for (const name of ['Personal Data Protection Act 2012', 'Consumer Protection (Fair Trading) Act 2003', 'Unfair Contract Terms Act 1977', 'Contracts (Rights of Third Parties) Act 2001']) expect(pageText(termsMs)).toContain(`(${name})`);
  });
  it('leave a pending contact at the end of its sentence or alone in its row', () => {
    for (const page of [privacyMs, termsMs, aboutMs]) {
      for (const line of pageTexts(withoutCustom(page))) {
        for (const match of line.matchAll(/\{(operator|contactEmail|dpoEmail)\}(.?)/g)) expect(match[2], line.slice(0, 80)).toMatch(/^\.?$/);
      }
    }
  });
});
