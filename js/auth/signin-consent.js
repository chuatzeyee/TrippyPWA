// The line that stands at every Sign in with Google button: signing in is how a person agrees to the
// Terms of use, and the Privacy policy is what they are asked to have read (terms.en.js, the section
// 'acceptance'). One sentence per language in the string tables (signIn.consent), with its two links
// written as [label](#/page) so that each language can put them where its grammar wants them.
import { t } from '../lib/i18n.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
/** The only places the line may link to. */
const TARGETS = ['#/terms', '#/privacy'];
const LINK = /\[([^\]]+)\]\((#\/[a-z]+)\)/g;

/**
 * The consent line as markup: a paragraph with a link to the Terms of use and one to the Privacy
 * policy. A link to anywhere else in a string table is printed as its words, without the link.
 * @param {(key: string) => string} [translate] the string reader (the current language by default)
 * @returns {string}
 */
export function signInConsentHtml(translate = t) {
  const sentence = esc(translate('signIn.consent')).replace(LINK, (whole, label, target) => (
    TARGETS.includes(target) ? `<a class="signin-consent-link" href="${target}">${label}</a>` : label
  ));
  return `<p class="signin-consent" data-signin-consent>${sentence}</p>`;
}
