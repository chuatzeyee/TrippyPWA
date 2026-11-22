// The consent line at the sign-in buttons: one sentence, a link to each legal text, in every language.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { signInConsentHtml } from './signin-consent.js';
import { tFor } from '../lib/i18n.js';
import en from '../lib/i18n/en.js';
import ms from '../lib/i18n/ms.js';
import fi from '../lib/i18n/fi.js';
import zh from '../lib/i18n/zh-Hans.js';
import { BANNED_GLYPHS } from '../site/legal-test-kit.js';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const hrefs = (html) => [...html.matchAll(/<a class="signin-consent-link" href="([^"]+)">([^<]+)<\/a>/g)].map((match) => match[1]);

describe('the consent line at the sign-in buttons', () => {
  it('is the owner\'s sentence in English, with a link to each legal text', () => {
    const html = signInConsentHtml(tFor('en'));
    expect(html.replace(/<[^>]+>/g, '')).toBe('By signing in you agree to the Terms of use and have read the Privacy policy.');
    expect(hrefs(html)).toEqual(['#/terms', '#/privacy']);
    expect(html).toMatch(/^<p class="signin-consent" data-signin-consent>/);
  });

  it.each([['en', en], ['ms', ms], ['fi', fi], ['zh-Hans', zh]])('links to both texts in %s, with no banned character', (code, table) => {
    const html = signInConsentHtml((key) => table[key]);
    expect(hrefs(html).sort()).toEqual(['#/privacy', '#/terms']);
    expect(html).not.toMatch(BANNED_GLYPHS);
    expect(html).not.toMatch(/\]\(|\[/);
  });

  it('is translated in the languages that have a translation', () => {
    expect(ms['signIn.consent']).toMatch(/^Dengan log masuk/);
    expect(fi['signIn.consent']).toMatch(/^Kirjautumalla/);
    expect(ms['signIn.consent']).not.toBe(en['signIn.consent']);
    expect(fi['signIn.consent']).not.toBe(en['signIn.consent']);
  });

  it('escapes a string table value and refuses a link to anywhere else', () => {
    const html = signInConsentHtml(() => 'Read <b>the</b> [terms](#/terms) and [this](#/admin).');
    expect(html).toContain('&lt;b&gt;the&lt;/b&gt;');
    expect(hrefs(html)).toEqual(['#/terms']);
    expect(html).toContain('and this.');
  });

  it('stands at every Sign in with Google button', () => {
    for (const file of ['./auth-ui.js', '../components/dashboard.js', '../wizard/wizard.js']) {
      const source = read(file);
      expect(source, file).toContain('signInConsentHtml(');
    }
    // The landing that index.html draws before the app loads carries the English line, letter for letter.
    expect(read('../../index.html')).toContain(signInConsentHtml(tFor('en')));
    // The app bar's small Sign in button has no room for a sentence: it opens the gate, which has it.
    expect(read('./auth-ui.js')).toMatch(/#auth-sign-in'\)\.addEventListener\('click', \(\) => showAuthGate\(\)/);
  });
});
