// The page frame as markup: title, intro, language switch, the date, the fallback note, the list.
import { describe, it, expect } from 'vitest';
import { activeSectionId, sitePageErrorHtml, sitePageHtml } from './site-page.js';
import { tFor } from '../lib/i18n.js';

const section = (id) => ({ id, heading: `Heading ${id}`, blocks: [{ type: 'p', text: 'Write to {dpoEmail}.' }] });
const PAGE = { title: 'Privacy policy', intro: ['First **line**.', 'Second line.'], sections: [section('a'), section('b'), section('c')] };
const INFO = { operatorName: '', contactEmail: '', dataProtectionEmail: '', country: 'Singapore', siteUrl: 'https://example.test/' };
const html = (more = {}) => sitePageHtml({ pageId: 'privacy', page: PAGE, language: 'en', info: INFO, ...more });

describe('sitePageHtml', () => {
  it('has one h1, the intro, the sections and the language switch', () => {
    const markup = html();
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('<h1 class="site-title">Privacy policy</h1>');
    expect(markup).toContain('<p class="site-intro">First <strong>line</strong>.</p>');
    expect(markup).toContain('<p class="site-intro">Second line.</p>');
    expect(markup.match(/<section class="site-section"/g)).toHaveLength(3);
    expect(markup).toContain('data-language-switch="page"');
    expect(markup).toContain('data-site-page="privacy"');
  });
  it('prints the date of a legal text in the reader\'s language, with a way to print the page', () => {
    expect(html({ updated: '2026-11-22' })).toContain('<span class="site-updated">Last updated 22 November 2026</span>');
    expect(html({ updated: '2026-11-22' })).toContain('data-site-print');
    expect(html({ updated: '2026-11-22', language: 'fi', t: (key, vars) => `${key}:${vars?.date ?? ''}` })).toContain('site.updated:22. marraskuuta 2026');
    expect(html()).not.toContain('site-meta');
  });
  it('lists the sections of a long page with the address of each', () => {
    expect(html()).toContain('<div class="site-body site-body--toc">');
    expect(html()).toContain('href="#/privacy/b"');
    const short = html({ page: { ...PAGE, sections: [section('a')] } });
    expect(short).toContain('<div class="site-body">');
    expect(short).not.toContain('site-toc');
  });
  it('never prints an invented contact: an empty fact becomes the placeholder sentence', () => {
    expect(html()).toContain('Write to <span class="site-pending">Contact details will be published here before launch</span>.');
    expect(html({ info: { ...INFO, dataProtectionEmail: 'dpo@example.test' } })).toContain('<a href="mailto:dpo@example.test">dpo@example.test</a>');
  });
  it('a page shown in English to a reader of another language says so and marks the text as English', () => {
    const markup = html({ language: 'fi', contentLanguage: 'en', fallback: true, t: tFor('en') });
    expect(markup).toContain('<p class="site-fallback" role="note">This page is not available in Suomi yet, so it is shown in English.</p>');
    expect(markup).toContain('<div class="site-content" lang="en">');
    expect(markup).toContain('<option value="fi" lang="fi" selected>Suomi</option>');
    expect(html()).not.toContain('site-fallback');
    expect(html()).not.toContain('<div class="site-content" lang=');
  });
  it('escapes the title and the intro', () => {
    const markup = html({ page: { ...PAGE, title: '<script>x</script>', intro: '<img src=x>' } });
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
  });
});

describe('sitePageErrorHtml', () => {
  it('says the page could not load and offers another try', () => {
    const markup = sitePageErrorHtml(tFor('en'));
    expect(markup).toContain('role="alert">This page could not load. Check your connection and try again.</p>');
    expect(markup).toContain('data-site-retry>Try again</button>');
  });
});

describe('activeSectionId', () => {
  const at = (...tops) => tops.map((top, index) => ({ id: `s${index}`, top }));
  it('is the last section whose top has passed the offset', () => {
    expect(activeSectionId(at(-900, -200, 80, 700), 120)).toBe('s2');
    expect(activeSectionId(at(-900, -200, 300, 700), 120)).toBe('s1');
  });
  it('is the first section above the first heading, and null with none', () => {
    expect(activeSectionId(at(400, 900), 120)).toBe('s0');
    expect(activeSectionId([], 120)).toBeNull();
    expect(activeSectionId(null)).toBeNull();
  });
});
