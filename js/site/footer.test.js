// The footer builder: which links a visitor gets, the bottom row, the language, escaping.
import { describe, it, expect } from 'vitest';
import { LEGAL_LINKS, footerGroups, footerHtml } from './footer.js';
import { languageSwitchHtml } from './language-switch.js';
import { tFor } from '../lib/i18n.js';
import en from '../lib/i18n/en.js';
import fi from '../lib/i18n/fi.js';
import { registerStrings } from '../lib/i18n.js';

const t = tFor('en');
const html = (state = {}) => footerHtml({ year: 2026, language: 'en', t, ...state });
const hrefs = (markup) => [...markup.matchAll(/<a class="site-foot-link" href="([^"]+)"/g)].map((m) => m[1]);
const actions = (markup) => [...markup.matchAll(/data-foot-action="([^"]+)"/g)].map((m) => m[1]);

describe('footerGroups', () => {
  it('signed in: Plan, Your account, Trippy', () => {
    expect(footerGroups({ signedIn: true, atlas: true })).toEqual([
      { key: 'plan', links: ['newTrip', 'importTrip', 'trips', 'atlas'] },
      { key: 'account', links: ['settings', 'signOut'] },
      { key: 'trippy', links: ['about', 'privacy', 'terms', 'credits'] },
    ]);
  });
  it('Atlas only where the page exists', () => {
    expect(footerGroups({ signedIn: true, atlas: false })[0].links).toEqual(['newTrip', 'importTrip', 'trips']);
  });
  it('signed out: no link that needs an account, and Sign in', () => {
    expect(footerGroups({ signedIn: false, atlas: true })).toEqual([
      { key: 'account', links: ['signIn'] },
      { key: 'trippy', links: ['about', 'privacy', 'terms', 'credits'] },
    ]);
    expect(footerGroups()).toEqual(footerGroups({ signedIn: false }));
  });
});

describe('footerHtml', () => {
  it('signed in: every group with its heading and its links', () => {
    const markup = html({ signedIn: true, atlas: true });
    for (const heading of ['Plan', 'Your account', 'Trippy']) expect(markup).toContain(`>${heading}</h2>`);
    expect(hrefs(markup)).toEqual(['#/wizard', '#/', '#/atlas', '#/settings', '#/about', '#/privacy', '#/terms', '#/privacy', '#/terms']);
    expect(actions(markup)).toEqual(['import-trip', 'sign-out', 'credits', 'credits']);
  });
  it('signed out: nothing that leads to a sign-in wall', () => {
    const markup = html({ signedIn: false });
    expect(markup).not.toContain('>Plan</h2>');
    expect(hrefs(markup)).toEqual(['#/about', '#/privacy', '#/terms', '#/privacy', '#/terms']);
    expect(actions(markup)).toEqual(['sign-in', 'credits', 'credits']);
    for (const gone of ['#/wizard', '#/settings', '#/atlas', 'sign-out', 'import-trip']) expect(markup).not.toContain(gone);
  });
  it('the bottom row: the logo, the notice with the year, the three legal links, the language', () => {
    const markup = html({ year: 2031, language: 'fi' });
    const bottom = markup.slice(markup.indexOf('site-foot-bottom'));
    expect(bottom).toContain('<a class="site-foot-logo" href="#/" aria-label="Trippy home">');
    expect(bottom.match(/class="flap-cell"/g)).toHaveLength(6);
    expect(bottom).toContain('<p class="site-foot-copy">Copyright © 2031 Trippy. All rights reserved.</p>');
    expect(LEGAL_LINKS).toEqual(['privacy', 'terms', 'credits']);
    expect([...bottom.matchAll(/data-foot-link="legal-(\w+)"/g)].map((m) => m[1])).toEqual(['privacy', 'terms', 'credits']);
    expect(bottom).toContain('<option value="fi" lang="fi" selected>Suomi</option>');
  });
  it('marks the open page', () => {
    const markup = html({ path: '/privacy' });
    expect(markup.match(/href="#\/privacy"[^>]*aria-current="page"/g)).toHaveLength(2);
    expect(markup.match(/aria-current/g)).toHaveLength(2);
  });
  it('speaks the language it is given, and English for a string that language lacks', () => {
    registerStrings('fi', fi);
    const markup = footerHtml({ signedIn: true, year: 2026, language: 'fi', t: tFor('fi') });
    expect(markup).toContain(`>${fi['footer.link.privacy']}</a>`);
    expect(markup).toContain(`>${fi['footer.group.account']}</h2>`);
    expect(markup).not.toContain(`>${en['footer.link.settings']}<`);
  });
  it('escapes what a table holds', () => {
    const hostile = (key) => (key === 'footer.link.about' ? '<img src=x onerror=alert(1)>' : key === 'footer.home' ? '"><script>' : key);
    const markup = footerHtml({ year: 2026, language: 'en', t: hostile });
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<script>');
  });
  it('every link and button can be found again after a redraw', () => {
    const markup = html({ signedIn: true, atlas: true });
    const keys = [...markup.matchAll(/data-foot-link="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('languageSwitchHtml', () => {
  it('lists the four languages under their own names, the current one selected, with a label', () => {
    const markup = languageSwitchHtml({ current: 'zh-Hans', where: 'page', t });
    expect([...markup.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])).toEqual(['en', 'ms', 'zh-Hans', 'fi']);
    expect(markup).toContain('<option value="zh-Hans" lang="zh-Hans" selected>简体中文</option>');
    expect(markup.match(/ selected/g)).toHaveLength(1);
    expect(markup).toContain('<span class="site-vh">Language</span>');
    expect(markup).toContain('id="lang-switch-page" data-language-switch="page"');
  });
});
