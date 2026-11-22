// The facts the site pages print (About, Privacy policy, Terms of use). One place, so a legal text
// never carries its own copy of a name or an address. Nothing here is invented: a value the owner
// has not supplied is an empty string, and the page frame prints "Contact details will be published
// here before launch" in its place (js/site/content.js, the {operator}, {contactEmail} and
// {dpoEmail} places).

export const SITE_INFO = Object.freeze({
  /** The person who operates Trippy and answers for it (given by the owner on 2026-11-22). */
  operatorName: 'Chua Tze Yee',
  /** General contact address (given by the owner on 2026-11-22). */
  contactEmail: 'chuatzeyee@outlook.sg',
  /** The data protection contact the Singapore PDPA asks an organisation to name (the same address, by the owner's word). */
  dataProtectionEmail: 'chuatzeyee@outlook.sg',
  /** Where Trippy is operated from, and whose law the terms name. */
  country: 'Singapore',
  /** The address of the live site. */
  siteUrl: 'https://chuatzeyee.github.io/TrippyPWA/',
  /** The day each legal text last changed, as YYYY-MM-DD. Change it with the text, in every language. */
  updated: Object.freeze({
    privacy: '2026-11-22',
    terms: '2026-11-22',
  }),
});

/**
 * The date a page was last updated, or null for a page that carries none (About).
 * @param {string} pageId 'privacy' | 'terms' | 'about'
 * @param {typeof SITE_INFO} [info]
 * @returns {string|null} YYYY-MM-DD
 */
export function updatedOn(pageId, info = SITE_INFO) {
  const date = info.updated?.[pageId];
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
