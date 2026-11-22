// The English terms of use: well formed for the frame, in the owner's copy rules, and carrying the
// clauses Singapore law makes necessary, with nothing that is false for a free service.
import { describe, it, expect } from 'vitest';
import page from './terms.en.js';
import privacy from './privacy.en.js';
import { validatePage } from '../content.js';
import { BANNED_GLYPHS, BANNED_WORDS, pageText, pageTexts, sectionIds, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';

const text = pageText(page);
const section = (id) => pageText(page.sections.find((entry) => entry.id === id));

describe('terms of use, English', () => {
  it('can be drawn in full by the frame', () => {
    expect(validatePage(page)).toEqual([]);
    expect(page.title).toBe('Terms of use');
  });

  it('starts with the summary and has every section, under a fixed id', () => {
    expect(sectionIds(page)).toEqual([
      'summary', 'acceptance', 'account', 'the-service', 'your-content', 'sharing', 'acceptable-use', 'third-parties',
      'intellectual-property', 'availability', 'liability', 'indemnity', 'suspension', 'changes', 'governing-law', 'general', 'contact',
    ]);
  });

  it('holds none of the banned characters or words', () => {
    for (const line of pageTexts(page)) {
      expect(line, line).not.toMatch(BANNED_GLYPHS);
      expect(line, line).not.toMatch(BANNED_WORDS);
    }
  });

  it('names the services Trippy is built on and the sites it links to', () => {
    for (const name of [
      'Supabase', 'Google', 'Gemini', 'Mistral', 'OpenStreetMap', 'Wikimedia', 'Openverse', 'Pexels', 'Google Maps', 'GitHub',
      'Booking.com', 'Trip.com', 'Skyscanner', 'Rome2Rio',
    ]) expect(section('third-parties'), name).toContain(name);
    // The full list is the privacy policy's, and the terms point at it.
    expect(section('third-parties')).toContain('(#/privacy/service-providers)');
  });

  it('keeps the limits on liability inside Singapore law', () => {
    const liability = section('liability');
    expect(liability).toMatch(/death or personal injury caused by our negligence/);
    expect(liability).toContain('Unfair Contract Terms Act 1977');
    expect(liability).toContain('Consumer Protection (Fair Trading) Act 2003');
    expect(liability).toMatch(/fraud/);
    expect(section('general')).toContain('Contracts (Rights of Third Parties) Act 2001');
    expect(section('governing-law')).toMatch(/laws of Singapore/);
    expect(section('governing-law')).toMatch(/courts of Singapore/);
    expect(section('general')).toMatch(/English text governs/);
  });

  it('says what the service is and is not', () => {
    const service = section('the-service');
    for (const phrase of [/AI model/, /estimates/, /not a travel agent/, /does not sell travel, take payment, make reservations/, /official government source/, /not a forecast/]) expect(service).toMatch(phrase);
  });

  it('has no clause that is false for a free service', () => {
    expect(text).not.toMatch(/subscription|refund|billing|credit card|arbitrat|auto-renew/i);
  });

  it('takes the operator and the contact from the site facts, never from its own text', () => {
    expect(section('contact')).toContain('{operator}');
    expect(section('contact')).toContain('{contactEmail}');
    expect(unknownPlaces(page)).toEqual([]);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(leftoverSyntax(page)).toEqual([]);
  });

  it('links only to sections that exist', () => {
    const pages = { privacy: sectionIds(privacy), terms: sectionIds(page) };
    for (const link of internalLinks(page)) {
      expect(Object.keys(pages), JSON.stringify(link)).toContain(link.page);
      if (link.section) expect(pages[link.page], JSON.stringify(link)).toContain(link.section);
    }
  });
});
