// The Chinese (Simplified) pages against the English ones: the same sections, the same blocks in the
// same order with the same number of rows, items and links, the same facts, none of the characters
// the owner bans, and the sentences a legal translation must keep.
import { describe, it, expect } from 'vitest';
import aboutEn from './about.en.js';
import aboutZh, { mount } from './about.zh-Hans.js';
import privacyEn from './privacy.en.js';
import privacyZh from './privacy.zh-Hans.js';
import termsEn from './terms.en.js';
import termsZh from './terms.zh-Hans.js';
import { validatePage, factPlaces } from '../content.js';
import { sitePageHtml } from '../site-page.js';
import { BANNED_GLYPHS, pageText, pageTexts, sectionIds, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';
import { tFor, languageReady, applyLanguage } from '../../lib/i18n.js';
import zhStrings from '../../lib/i18n/zh-Hans.js';

const PAIRS = [['about', aboutEn, aboutZh], ['privacy', privacyEn, privacyZh], ['terms', termsEn, termsZh]];
const INFO = { operatorName: '', contactEmail: '', dataProtectionEmail: '', country: 'Singapore', siteUrl: 'https://example.test/' };

/** The outline of a block: its type and how many parts it has, whatever the words. */
function shape(block) {
  const count = (value) => (Array.isArray(value) ? value.length : 1);
  switch (block.type) {
    case 'list': return ['list', Boolean(block.ordered), block.items.map((item) => (typeof item === 'string' ? 0 : count(item.items ?? [])))];
    case 'defs': return ['defs', block.rows.map((row) => count(row.text))];
    case 'table': return ['table', block.head.length, block.rows.map((row) => row.length)];
    case 'note': return ['note', Boolean(block.title), count(block.text)];
    case 'cards': return ['cards', block.items.length];
    case 'faq': return ['faq', block.items.map((item) => count(item.a))];
    case 'custom': return ['custom', (block.html.match(/<(li|details|figure|fieldset|img|button|a) /g) ?? []).length];
    default: return [block.type];
  }
}
const targets = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]).sort();
const facts = (text) => [...text.matchAll(/\{(operator|contactEmail|dpoEmail|country|siteUrl)\}/g)].map((match) => match[1]).sort();
const strongs = (text) => (text.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
const blockText = (block) => (block.type === 'custom' ? block.html : pageText(block));

describe.each(PAIRS)('%s in Chinese (Simplified)', (pageId, english, chinese) => {
  it('can be drawn in full and keeps the English sections', () => {
    expect(validatePage(chinese)).toEqual([]);
    expect(sectionIds(chinese)).toEqual(sectionIds(english));
    expect([].concat(chinese.intro ?? []).length).toBe([].concat(english.intro ?? []).length);
  });

  it('has the English blocks, one for one, with the same links, facts and emphasis', () => {
    english.sections.forEach((section, index) => {
      const mine = chinese.sections[index];
      expect(mine.blocks.map(shape), section.id).toEqual(section.blocks.map(shape));
      section.blocks.forEach((block, at) => {
        const [theirs, ours] = [blockText(block), blockText(mine.blocks[at])];
        if (block.type !== 'custom') {
          expect(targets(ours), `${section.id} block ${at}`).toEqual(targets(theirs));
          expect(strongs(ours), `${section.id} block ${at}`).toBe(strongs(theirs));
        } else {
          expect((ours.match(/<a /g) ?? []).length, `${section.id} block ${at}`).toBe((theirs.match(/<a /g) ?? []).length);
          expect((ours.match(/<strong>/g) ?? []).length, `${section.id} block ${at}`).toBe((theirs.match(/<strong>/g) ?? []).length);
        }
        expect(facts(ours), `${section.id} block ${at}`).toEqual(facts(theirs));
      });
    });
    expect(facts([].concat(chinese.intro ?? []).join('\n'))).toEqual(facts([].concat(english.intro ?? []).join('\n')));
  });

  it('holds no banned character, no unknown place and no markup left unconverted', () => {
    for (const line of pageTexts(chinese)) expect(line, line).not.toMatch(BANNED_GLYPHS);
    expect(unknownPlaces({ ...chinese, sections: chinese.sections.map((section) => ({ ...section, blocks: section.blocks.filter((block) => block.type !== 'custom') })) })).toEqual([]);
    expect(leftoverSyntax(chinese)).toEqual([]);
  });

  it('is written in Chinese with Chinese punctuation', () => {
    for (const line of pageTexts(chinese)) {
      if (/^</.test(line.trim()) || !/[一-鿿]/.test(line)) continue;
      expect(line, line).not.toMatch(/[一-鿿][,;:?!]|[一-鿿]\.(?![\w/])|[,;?!][一-鿿]/); // half-width punctuation beside a Chinese character
      expect(line, line).not.toMatch(/您/); // the string table says 你
      expect(line, line).not.toMatch(/[一-鿿]\((?!#|http|mailto)|(?<!\]\([^)]*)\)[一-鿿]/); // half-width brackets around Chinese
    }
  });

  it('links only to sections that exist, and prints no fact as a bare place when a contact is missing', async () => {
    const pages = { about: sectionIds(aboutZh), privacy: sectionIds(privacyZh), terms: sectionIds(termsZh), settings: [] };
    for (const link of internalLinks(chinese)) {
      expect(Object.keys(pages), JSON.stringify(link)).toContain(link.page);
      if (link.section) expect(pages[link.page], JSON.stringify(link)).toContain(link.section);
    }
    applyLanguage('zh-Hans', { browserLanguages: [] });
    await languageReady();
    const html = sitePageHtml({ pageId, page: chinese, language: 'zh-Hans', info: INFO, t: tFor('zh-Hans') });
    expect(html).not.toMatch(/\{(operator|contactEmail|dpoEmail|country|siteUrl)\}/);
    expect(html).not.toMatch(BANNED_GLYPHS);
    // A pending contact stands at the end of its sentence or alone, never in the middle of one.
    const after = [...html.matchAll(/<span class="site-pending">[^<]*<\/span>(.{0,6})/g)].map((match) => match[1]);
    expect(after.length).toBeGreaterThan(0);
    for (const tail of after) expect(tail).toMatch(/^(。|<\/)/);
    applyLanguage('en', { browserLanguages: [] });
    await languageReady();
  });
});

describe('the legal texts in Chinese (Simplified)', () => {
  const section = (page, id) => pageText(page.sections.find((entry) => entry.id === id));
  it('name the statutes with their official English names', () => {
    expect(pageText(privacyZh)).toContain('个人资料保护法令');
    expect(pageText(privacyZh)).toContain('Personal Data Protection Act 2012');
    for (const name of ['Personal Data Protection Act 2012', 'Consumer Protection (Fair Trading) Act 2003', 'Unfair Contract Terms Act 1977', 'Contracts (Rights of Third Parties) Act 2001']) {
      expect(pageText(termsZh), name).toContain(name);
    }
  });
  it('say that the English text governs', () => {
    expect(section(privacyZh, 'changes')).toContain('以英文文本为准');
    expect(section(termsZh, 'general')).toContain('以英文文本为准');
  });
  it('keep the consent and withdrawal clauses and the figures of the English policy', () => {
    expect(section(privacyZh, 'consent')).toContain('视为同意');
    expect(pageText(privacyZh)).toContain('撤回同意');
    expect(section(privacyZh, 'withdrawal')).toContain('10 个工作日');
    expect(section(privacyZh, 'access-and-correction')).toContain('30 天内');
    expect(section(privacyZh, 'breach')).toContain('3 个日历日');
    expect(section(privacyZh, 'breach')).toContain('500 人');
    expect(section(privacyZh, 'complaints')).toContain('https://www.pdpc.gov.sg/');
    expect(section(termsZh, 'liability')).toContain('100 新元');
    expect(section(termsZh, 'changes')).toContain('14 天');
  });
  it('name every third party the English policy names', () => {
    for (const name of [
      'Supabase', 'Google', 'Gemini', 'Mistral', 'Serper', 'Tavily', 'Wikimedia', 'Wikipedia', 'Wikidata', 'Openverse',
      'Pexels', 'Mapillary', 'Overpass', 'OpenStreetMap', 'Photon', 'Komoot', 'Open-Meteo', 'OSRM', 'Google Fonts',
      'flagcdn.com', 'Aviasales', 'Booking.com', 'Trip.com', 'Skyscanner', 'Google Search', 'Google Maps', 'Rome2Rio', 'GitHub Pages',
    ]) expect(section(privacyZh, 'service-providers'), name).toContain(name);
  });
});

describe('the About page in Chinese (Simplified)', () => {
  it('translates the sample plan and exports a mount', () => {
    const html = aboutZh.sections.find((entry) => entry.id === 'what-it-is').blocks.find((block) => block.type === 'custom').html;
    expect(html).toContain('京都');
    expect(html).toContain('清水寺');
    expect(html).toContain('典型天气');
    expect(html).not.toContain('Kiyomizu');
    expect(html).not.toContain('Typical weather');
    expect(typeof mount).toBe('function');
  });
});

describe('the Chinese (Simplified) string table', () => {
  it('uses Chinese punctuation and the footer names the pages use', () => {
    for (const [key, value] of Object.entries(zhStrings)) expect(value, key).not.toMatch(/[一-鿿][,;:?!.]/);
    expect(pageText(termsZh)).toContain(zhStrings['footer.link.credits']);
    expect(aboutZh.sections.map((entry) => entry.blocks.map(blockText).join('\n')).join('\n')).toContain(zhStrings['footer.link.credits']);
    expect(privacyZh.title).toBe(zhStrings['footer.link.privacy']);
    expect(termsZh.title).toBe(zhStrings['footer.link.terms']);
  });
});
