// The facts the owner gave on 2026-11-22, held in every language this tree translates by hand
// (English, Bahasa Melayu, Finnish): the account is deleted by its owner in Settings, the AI runs on
// Google's free tier, diagnostic logs are kept for up to one year, share links end after 7 days, the
// database is in Singapore, and Trippy earns no commission. The Chinese pages have their own file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import privacyEn from './privacy.en.js';
import privacyMs from './privacy.ms.js';
import privacyFi from './privacy.fi.js';
import termsEn from './terms.en.js';
import termsMs from './terms.ms.js';
import termsFi from './terms.fi.js';
import aboutEn from './about.en.js';
import aboutMs from './about.ms.js';
import aboutFi from './about.fi.js';
import { SITE_INFO, updatedOn } from '../../data/site-info.js';
import { BANNED_GLYPHS, pageText, pageTexts, sectionIds } from '../legal-test-kit.js';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const section = (page, id) => pageText(page.sections.find((entry) => entry.id === id));
// A custom block is markup, not prose: the About page's own blocks are checked in about.en.test.js.
const prose = (page) => pageTexts({ ...page, sections: page.sections.map((entry) => ({ ...entry, blocks: entry.blocks.filter((block) => block.type !== 'custom') })) });

const PRIVACY_IDS = [
  'at-a-glance', 'who-we-are', 'data-protection-contact', 'what-we-collect', 'ai-models', 'other-people', 'consent', 'withdrawal',
  'access-and-correction', 'accuracy', 'protection', 'retention', 'service-providers', 'transfer', 'shared-links', 'on-device',
  'booking-links', 'children', 'breach', 'changes', 'complaints',
];
const TERMS_IDS = [
  'summary', 'acceptance', 'account', 'the-service', 'your-content', 'sharing', 'acceptable-use', 'third-parties',
  'intellectual-property', 'availability', 'liability', 'indemnity', 'suspension', 'changes', 'governing-law', 'general', 'contact',
];

/** The distinctive words of each fact, per language. */
const PRIVACY = [
  ['en', privacyEn, {
    deletion: /Open Settings, go to Account and press Delete my account/,
    selfServe: /You do not have to write to anyone/,
    removes: /Every trip you own, with its days, stops, share links and collaborators/,
    backups: /backups/,
    freeTier: /free tier of Google's service/,
    reviewers: /human reviewers may read it/,
    sensitive: /Do not put sensitive personal details in a free-text field/,
    logs: /Entries older than one year are deleted automatically/,
    links: /stops working 7 days after it is made/,
    singapore: /hosted in Singapore, by Supabase on Amazon Web Services/,
    noCommission: /earns no commission/,
  }],
  ['ms', privacyMs, {
    deletion: /Buka Settings, pergi ke Account dan tekan Delete my account/,
    selfServe: /Anda tidak perlu menulis kepada sesiapa/,
    removes: /Setiap perjalanan milik anda, bersama hari, hentian, pautan kongsi dan kolaboratornya/,
    backups: /sandaran penyedia pengehosan/,
    freeTier: /peringkat percuma perkhidmatan Google/,
    reviewers: /penyemak manusia boleh membacanya/,
    sensitive: /Jangan masukkan butiran peribadi yang sensitif dalam ruang teks bebas/,
    logs: /Entri yang lebih lama daripada satu tahun dipadam secara automatik/,
    links: /berhenti berfungsi 7 hari selepas dibuat/,
    singapore: /dihoskan di Singapura, oleh Supabase pada Amazon Web Services/,
    noCommission: /tidak memperoleh komisen/,
  }],
  ['fi', privacyFi, {
    deletion: /siirry kohtaan Account ja paina Delete my account/,
    selfServe: /Sinun ei tarvitse kirjoittaa kenellekään/,
    removes: /Jokaisen omistamasi matkan päivineen, kohteineen, jakolinkkeineen ja yhteiskäyttäjineen/,
    backups: /varmuuskopioista/,
    freeTier: /Googlen palvelun maksuttomalla tasolla/,
    reviewers: /ihmiset voivat lukea niitä tarkistustyössä/,
    sensitive: /Älä kirjoita arkaluonteisia henkilökohtaisia tietoja vapaan tekstin kenttiin/,
    logs: /Vuotta vanhemmat merkinnät poistetaan automaattisesti/,
    links: /lakkaa toimimasta 7 päivän kuluttua sen luomisesta/,
    singapore: /sijaitsevat Singaporessa, Supabasen palvelussa Amazon Web Servicesin/,
    noCommission: /ei myy lippuja eikä varauksia eikä saa keneltäkään palkkiota/,
  }],
];
const TERMS = [
  ['en', termsEn, { experimental: /free, experimental service run by an individual/, noCommission: /earns no commission/, links: /stops working 7 days after it is made/, deletion: /Delete your account in Settings, under Account, with Delete my account/, ends: /these terms end for you/, plain: /plain links to other sites/ }],
  ['ms', termsMs, { experimental: /perkhidmatan percuma yang bersifat eksperimen, dikendalikan oleh seorang individu/, noCommission: /tidak memperoleh komisen/, links: /berhenti berfungsi 7 hari selepas dibuat/, deletion: /Padam akaun anda dalam Settings, di bawah Account/, ends: /terma ini tamat bagi anda/, plain: /pautan biasa ke laman lain/ }],
  ['fi', termsFi, { experimental: /maksuton ja kokeellinen palvelu, jota ylläpitää yksityishenkilö/, noCommission: /eikä se saa palkkiota/, links: /lakkaa toimimasta 7 päivän kuluttua sen luomisesta/, deletion: /Poista tilisi asetuksissa kohdassa Account painikkeella Delete my account/, ends: /nämä ehdot päättyvät sinun osaltasi/, plain: /tavallisia linkkejä muille sivustoille/ }],
];

describe.each(PRIVACY)('the privacy policy in %s, against the owner\'s facts', (code, page, says) => {
  it('has the sections of the policy, under the same ids', () => {
    expect(sectionIds(page)).toEqual(PRIVACY_IDS);
  });
  it('says the account is deleted by its owner in Settings, what that removes and what it cannot', () => {
    const retention = section(page, 'retention');
    for (const fact of ['deletion', 'selfServe', 'removes', 'backups']) expect(retention, fact).toMatch(says[fact]);
    expect(section(page, 'at-a-glance')).toMatch(/Delete my account/);
    expect(section(page, 'withdrawal')).toMatch(/Delete my account/);
    // Nobody is told to write in to have an account deleted: the deletion paragraphs name no address.
    expect(retention).not.toContain('{dpoEmail}');
  });
  it('says plainly that the AI runs on Google\'s free tier, and what to keep out of free text', () => {
    const ai = section(page, 'ai-models');
    for (const fact of ['freeTier', 'reviewers', 'sensitive']) expect(ai, fact).toMatch(says[fact]);
    expect(section(page, 'at-a-glance'), 'summary').toMatch(says.freeTier);
    expect(section(page, 'what-we-collect'), 'free text').toMatch(says.freeTier);
    expect(section(page, 'service-providers'), 'providers').toMatch(says.freeTier);
  });
  it('keeps diagnostic logs for up to one year and share links for 7 days', () => {
    expect(section(page, 'retention')).toMatch(says.logs);
    expect(section(page, 'retention')).toMatch(says.links);
    expect(section(page, 'shared-links')).toMatch(says.links);
  });
  it('says the database is in Singapore and that the transfer section is about the other services', () => {
    expect(section(page, 'transfer')).toMatch(says.singapore);
    expect(section(page, 'transfer')).toContain('Mistral');
  });
  it('says Trippy earns no commission', () => {
    expect(pageText({ intro: page.intro })).toMatch(says.noCommission);
  });
});

describe.each(TERMS)('the terms of use in %s, against the owner\'s facts', (code, page, says) => {
  it('has the sections of the terms, under the same ids', () => {
    expect(sectionIds(page)).toEqual(TERMS_IDS);
  });
  it('says the service is free and experimental, sells nothing and earns no commission', () => {
    expect(pageText({ intro: page.intro })).toMatch(says.experimental);
    expect(section(page, 'the-service')).toMatch(says.noCommission);
    expect(section(page, 'third-parties')).toMatch(says.plain);
  });
  it('says share links end after 7 days and that a user deletes their own account', () => {
    expect(section(page, 'sharing')).toMatch(says.links);
    expect(section(page, 'suspension')).toMatch(says.deletion);
    expect(section(page, 'suspension')).toMatch(says.ends);
  });
});

describe('commission and partner links', () => {
  // A sentence may hold the word only to say there is none. The regulator's name is not that word.
  const WORD = { en: /commission|affiliate/i, ms: /komisen|afiliasi/i, fi: /palkkio|kumppanilink/i };
  const DENIAL = { en: /\b(no|not|nothing|nobody)\b/i, ms: /\b(tidak|tiada)\b/i, fi: /(^|\s)(ei|eikä|eivät)(\s|$)/i };
  const REGULATOR = /Personal Data Protection Commission/g;
  const PAGES = [
    ['en', privacyEn], ['en', termsEn], ['en', aboutEn], ['ms', privacyMs], ['ms', termsMs], ['ms', aboutMs], ['fi', privacyFi], ['fi', termsFi], ['fi', aboutFi],
  ];
  it('no text says that Trippy earns a commission or uses partner links', () => {
    let seen = 0;
    for (const [code, page] of PAGES) {
      for (const line of prose(page)) {
        for (const sentence of line.replace(REGULATOR, 'the regulator').split(/(?<=[.?!:])\s+/)) {
          if (!WORD[code].test(sentence)) continue;
          seen += 1;
          expect(sentence, `${code}: ${sentence}`).toMatch(DENIAL[code]);
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
  it('the app prints no line about commission, and the links carry no partner code', async () => {
    for (const file of ['../../services/booking-links.js', '../../components/trip-detail.js', '../../data/site-info.js', '../../auth/auth-ui.js', '../../auth/signin-consent.js', '../../auth/auth.js']) {
      expect(read(file), file).not.toMatch(/commission|affiliate/i);
    }
    for (const file of ['../../lib/i18n/en.js', '../../lib/i18n/ms.js', '../../lib/i18n/fi.js']) expect(read(file), file).not.toMatch(/commission|affiliate|komisen|palkkio/i);
    for (const file of ['./privacy.en.js', './privacy.ms.js', './privacy.fi.js', './terms.en.js', './terms.ms.js', './terms.fi.js']) expect(read(file), file).not.toMatch(/affiliate/i);
    const links = await import('../../services/booking-links.js');
    expect(links.BOOKING_DISCLOSURE).toBeUndefined();
    const urls = [...links.hotelSearchLinks({ query: 'Hotel Sample', checkIn: '2027-01-02', checkOut: '2027-01-04', adults: 2 }), links.flightSearchLink({ fromCity: 'Singapore', toCity: 'Kyoto', departDate: '2027-01-02', returnDate: '2027-01-04' })].map((link) => link.url);
    for (const url of urls) expect(url).not.toMatch(/[?&](aid|allianceid|sid|associateid)=/);
  });
});

describe('the dates and the glyphs', () => {
  it('both legal texts carry the date of the owner\'s facts', () => {
    expect(updatedOn('privacy')).toBe('2026-11-22');
    expect(updatedOn('terms')).toBe('2026-11-22');
    expect(SITE_INFO.operatorName).toBe('Chua Tze Yee');
  });
  it('no page in the three languages holds a banned character, in its words or in its source', () => {
    for (const name of ['privacy', 'terms', 'about']) for (const code of ['en', 'ms', 'fi']) {
      const source = read(`./${name}.${code}.js`);
      // The About page credits OpenStreetMap with the copyright sign, which is not a banned character.
      expect(source.match(BANNED_GLYPHS), `${name}.${code}.js`).toBeNull();
    }
  });
});
