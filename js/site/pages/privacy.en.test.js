// The English privacy policy: well formed for the frame, in the owner's copy rules, and complete
// against the data audit (every provider named, every section the PDPA calls for present).
import { describe, it, expect } from 'vitest';
import page from './privacy.en.js';
import terms from './terms.en.js';
import { validatePage, sectionsHtml, factPlaces } from '../content.js';
import { BANNED_GLYPHS, BANNED_WORDS, pageText, pageTexts, sectionIds, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';

const text = pageText(page);
const section = (id) => pageText(page.sections.find((entry) => entry.id === id));

describe('privacy policy, English', () => {
  it('can be drawn in full by the frame', () => {
    expect(validatePage(page)).toEqual([]);
    expect(page.title).toBe('Privacy policy');
  });

  it('starts with the summary and has the sections the PDPA calls for', () => {
    const ids = sectionIds(page);
    expect(ids[0]).toBe('at-a-glance');
    for (const id of [
      'who-we-are', 'data-protection-contact', 'what-we-collect', 'ai-models', 'other-people', 'consent', 'withdrawal',
      'access-and-correction', 'accuracy', 'protection', 'retention', 'service-providers', 'transfer',
      'shared-links', 'on-device', 'booking-links', 'children', 'breach', 'changes', 'complaints',
    ]) expect(ids, id).toContain(id);
  });

  it('holds none of the banned characters or words', () => {
    for (const line of pageTexts(page)) {
      expect(line, line).not.toMatch(BANNED_GLYPHS);
      expect(line, line).not.toMatch(BANNED_WORDS);
    }
  });

  it('names every third party of the data audit', () => {
    for (const name of [
      'Supabase', 'Google', 'Gemini', 'Mistral', 'Serper', 'Tavily', 'Wikimedia', 'Wikipedia', 'Wikidata', 'Openverse',
      'Pexels', 'Mapillary', 'Overpass', 'OpenStreetMap', 'Photon', 'Komoot', 'Open-Meteo', 'OSRM', 'Google Fonts',
      'flagcdn.com', 'Aviasales', 'Booking.com', 'Trip.com', 'Skyscanner', 'Google Search', 'Google Maps', 'Rome2Rio', 'GitHub Pages',
    ]) expect(section('service-providers'), name).toContain(name);
  });

  it('takes the operator and the contacts from the site facts, never from its own text', () => {
    expect(section('who-we-are')).toContain('{operator}');
    expect(section('who-we-are')).toContain('{contactEmail}');
    expect(section('data-protection-contact')).toContain('{dpoEmail}');
    expect(unknownPlaces(page)).toEqual([]);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no address written into the policy
    expect(leftoverSyntax(page)).toEqual([]);
  });

  it('still reads when the owner has supplied no contact yet', () => {
    const html = sectionsHtml(page, { places: factPlaces({}, () => 'Contact details will be published here before launch') });
    // A pending fact stands at the end of its sentence or alone in a definition, never in the middle of one.
    const after = [...html.matchAll(/<span class="site-pending">[^<]*<\/span>(.{0,12})/g)].map((match) => match[1]);
    expect(after.length).toBeGreaterThan(3);
    for (const tail of after) expect(tail).toMatch(/^(\.|<\/p>)/);
  });

  it('says what the PDPA requires on consent, withdrawal, access, breaches and transfers', () => {
    expect(text).toContain('Personal Data Protection Act 2012');
    expect(section('consent')).toMatch(/deemed consent/i);
    expect(section('consent')).toMatch(/Optional/);
    expect(section('withdrawal')).toMatch(/reasonable notice/);
    expect(section('withdrawal')).toMatch(/requires or permits/);
    expect(section('access-and-correction')).toMatch(/within 30 days/);
    expect(section('access-and-correction')).toMatch(/do not charge a fee/);
    expect(section('breach')).toMatch(/3 calendar days/);
    expect(section('breach')).toMatch(/500 people/);
    expect(section('transfer')).toMatch(/comparable/);
    expect(section('retention')).toMatch(/You delete your account yourself, in the app/);
    expect(section('withdrawal')).toMatch(/by deleting the data in question or by deleting your account/);
    expect(section('complaints')).toContain('https://www.pdpc.gov.sg/');
    expect(section('changes')).toMatch(/English text governs/);
    expect(text).toMatch(/do not sell personal data/i);
  });

  it('links only to sections that exist', () => {
    const pages = { privacy: sectionIds(page), terms: sectionIds(terms) };
    for (const link of internalLinks(page)) {
      expect(Object.keys(pages), JSON.stringify(link)).toContain(link.page);
      if (link.section) expect(pages[link.page], JSON.stringify(link)).toContain(link.section);
    }
  });

  it('uses rows that read on a phone, never a table that scrolls sideways', () => {
    const blocks = page.sections.flatMap((entry) => entry.blocks);
    expect(blocks.filter((entry) => entry.type === 'table')).toEqual([]);
    for (const block of blocks.filter((entry) => entry.type === 'defs')) {
      for (const row of block.rows) for (const line of [].concat(row.text)) expect(line, row.term).not.toMatch(/undefined/);
    }
  });
});
