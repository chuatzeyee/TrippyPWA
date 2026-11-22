// A site page (About, Privacy policy, Terms of use) is content data plus one frame. This file is the
// one place that says what the data looks like, and turns it into markup. Pure: data in, a string out,
// every value escaped. The frame around it is js/site/site-page.js; the look is css/components/site.css.
//
// WHERE A PAGE LIVES: js/site/pages/<page>.<language>.js, default export a SitePage, for example
// js/site/pages/privacy.en.js, privacy.ms.js, privacy.zh-Hans.js, privacy.fi.js. A file that exists
// is found by itself (js/site/pages.js); a language with no file shows the English page with a note.
//
// TEXT. Every `text`, `intro`, `term`, cell and item is plain text with three additions:
//   **words**                 strong
//   [label](target)           a link; target is #/route (#/privacy, or #/privacy/<section id> for a
//                             section of a page), https://..., or mailto:...
//   {operator} {contactEmail} {dpoEmail} {country} {siteUrl}
//                             facts from js/data/site-info.js. An email becomes a mailto link. A fact
//                             the owner has not supplied yet prints "Contact details will be published
//                             here before launch", so write sentences that still read with it, for
//                             example "Write to our data protection contact: {dpoEmail}."
// Anything else, markup included, is printed as written (escaped).

/**
 * @typedef {Object} SitePage
 * @property {string} title                 the h1 and the document title
 * @property {string|string[]} [intro]      one or more paragraphs under the title
 * @property {boolean} [toc]                the "On this page" list; by default shown from three sections up
 * @property {SiteSection[]} sections
 *
 * @typedef {Object} SiteSection
 * @property {string} id                    lower case letters, digits and hyphens; unique in the page; the same
 *                                          in every language, because links point at it (#/privacy/<id>)
 * @property {string} heading               the h2, and the entry in "On this page"
 * @property {SiteBlock[]} blocks
 *
 * @typedef {(
 *   { type: 'p', text: string } |
 *   { type: 'subheading', text: string } |                                   an h3 inside a section
 *   { type: 'list', items: Array<string|{ text: string, items?: string[] }>, ordered?: boolean } |
 *   { type: 'defs', rows: Array<{ term: string, text: string|string[] }> } | definition rows: a term and what it means
 *   { type: 'table', caption?: string, head: string[], rows: string[][], rowHeads?: boolean } |
 *                                                                            rowHeads: the first cell of a row is its header
 *   { type: 'note', title?: string, text: string|string[] } |               a boxed remark
 *   { type: 'cards', items: Array<{ title: string, text: string }> } |      a grid of short titled paragraphs
 *   { type: 'faq', items: Array<{ q: string, a: string|string[] }> } |      questions that open on a press
 *   { type: 'custom', html: string }                                         markup written in the page module, printed
 *                                                                            as it is: never put a reader's data in it
 * )} SiteBlock
 *
 * A page module may also export `mount(root, { lang, t })`, called after the page is in the document
 * (root is the <article>), for behaviour a block needs; it may return a function that undoes it.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
const UNESCAPES = Object.fromEntries(Object.entries(ESCAPES).map(([ch, entity]) => [entity, ch]));
const unesc = (value) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => UNESCAPES[entity]);

const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const LINK_TARGET = /^(#\/[\w\-/.~%]*|https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+)$/i;
const STRONG = /\*\*([^*\n]+)\*\*/g;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
/** The blocks and the fields each must carry (validatePage). */
const BLOCK_TYPES = Object.freeze(['p', 'subheading', 'list', 'defs', 'table', 'note', 'cards', 'faq', 'custom']);
/** From how many sections a page gets its "On this page" list unless it says otherwise. */
export const TOC_FROM = 3;

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const list = (value) => (Array.isArray(value) ? value : []);
const paragraphs = (value) => (Array.isArray(value) ? value : [value]).filter(isText);

/**
 * The facts a text may name, ready to print.
 * @param {{ operatorName?: string, contactEmail?: string, dataProtectionEmail?: string, country?: string, siteUrl?: string }} info
 * @param {(key: string) => string} t
 * @returns {Object<string, string>} markup by place name
 */
export function factPlaces(info = {}, t = (key) => key) {
  const pending = `<span class="site-pending">${esc(t('site.contactPending'))}</span>`;
  const plain = (value) => (isText(value) ? esc(value.trim()) : pending);
  const email = (value) => (isText(value) && EMAIL.test(value.trim()) ? `<a href="mailto:${esc(value.trim())}">${esc(value.trim())}</a>` : pending);
  const url = (value) => (isText(value) && /^https?:\/\//i.test(value) ? `<a href="${esc(value)}">${esc(value)}</a>` : pending);
  return {
    operator: plain(info.operatorName),
    contactEmail: email(info.contactEmail),
    dpoEmail: email(info.dataProtectionEmail),
    country: plain(info.country),
    siteUrl: url(info.siteUrl),
  };
}

/**
 * One text as inline markup: escaped, then **strong**, [links](target) and {facts}.
 * @param {*} text
 * @param {{ places?: Object<string, string> }} [ctx] places from factPlaces()
 * @returns {string}
 */
export function inlineHtml(text, { places = {} } = {}) {
  return esc(text)
    .replace(LINK, (whole, label, target) => {
      const href = unesc(target);
      if (!LINK_TARGET.test(href)) return whole;
      const outside = /^https?:/i.test(href);
      return `<a href="${esc(href)}"${outside ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    })
    .replace(STRONG, '<strong>$1</strong>')
    .replace(/\{(\w+)\}/g, (whole, name) => (Object.prototype.hasOwnProperty.call(places, name) ? places[name] : whole));
}

const BLOCKS = {
  p: (block, text) => (isText(block.text) ? `<p>${text(block.text)}</p>` : ''),
  subheading: (block, text) => (isText(block.text) ? `<h3 class="site-subheading">${text(block.text)}</h3>` : ''),
  list(block, text) {
    const tag = block.ordered ? 'ol' : 'ul';
    const item = (entry) => {
      if (typeof entry === 'string') return isText(entry) ? `<li>${text(entry)}</li>` : '';
      if (!entry || !isText(entry.text)) return '';
      const inner = list(entry.items).filter(isText).map((sub) => `<li>${text(sub)}</li>`).join('');
      return `<li>${text(entry.text)}${inner ? `<ul>${inner}</ul>` : ''}</li>`;
    };
    const items = list(block.items).map(item).join('');
    return items ? `<${tag} class="site-list">${items}</${tag}>` : '';
  },
  defs(block, text) {
    const rows = list(block.rows).filter((row) => row && isText(row.term))
      .map((row) => `<div class="site-def"><dt>${text(row.term)}</dt><dd>${paragraphs(row.text).map((line) => `<p>${text(line)}</p>`).join('')}</dd></div>`).join('');
    return rows ? `<dl class="site-defs">${rows}</dl>` : '';
  },
  table(block, text) {
    const head = list(block.head);
    const rows = list(block.rows).filter((row) => Array.isArray(row) && row.length);
    if (!head.length || !rows.length) return '';
    const caption = isText(block.caption) ? `<caption>${text(block.caption)}</caption>` : '';
    const label = isText(block.caption) ? ` aria-label="${esc(block.caption)}"` : '';
    const cell = (value, index) => (block.rowHeads && index === 0 ? `<th scope="row">${text(value)}</th>` : `<td data-label="${esc(head[index] ?? '')}">${text(value)}</td>`);
    return `<div class="site-table-wrap" role="region" tabindex="0"${label}><table class="site-table">${caption}`
      + `<thead><tr>${head.map((value) => `<th scope="col">${text(value)}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
  },
  note(block, text) {
    const lines = paragraphs(block.text).map((line) => `<p>${text(line)}</p>`).join('');
    if (!lines) return '';
    return `<aside class="site-note">${isText(block.title) ? `<p class="site-note-title">${text(block.title)}</p>` : ''}${lines}</aside>`;
  },
  cards(block, text) {
    const items = list(block.items).filter((item) => item && isText(item.title))
      .map((item) => `<li class="site-card"><h3 class="site-card-title">${text(item.title)}</h3>${isText(item.text) ? `<p>${text(item.text)}</p>` : ''}</li>`).join('');
    return items ? `<ul class="site-cards">${items}</ul>` : '';
  },
  faq(block, text) {
    const items = list(block.items).filter((item) => item && isText(item.q))
      .map((item) => `<details class="site-faq-item"><summary>${text(item.q)}</summary><div class="site-faq-answer">${paragraphs(item.a).map((line) => `<p>${text(line)}</p>`).join('')}</div></details>`).join('');
    return items ? `<div class="site-faq">${items}</div>` : '';
  },
  custom: (block) => (typeof block.html === 'string' ? block.html : ''),
};

/**
 * One block as markup. A block of a type this build does not know prints nothing.
 * @param {SiteBlock} block
 * @param {{ places?: Object<string, string> }} [ctx]
 */
export function blockHtml(block, ctx = {}) {
  const build = block && Object.prototype.hasOwnProperty.call(BLOCKS, block.type) ? BLOCKS[block.type] : null;
  return build ? build(block, (value) => inlineHtml(value, ctx)) : '';
}

/** The sections of a page that can be drawn: a usable id, used once, and a heading. */
export function drawableSections(page) {
  const seen = new Set();
  return list(page?.sections).filter((section) => {
    if (!section || !SECTION_ID.test(String(section.id ?? '')) || seen.has(section.id) || !isText(section.heading)) return false;
    seen.add(section.id);
    return true;
  });
}

/** Whether the page gets its "On this page" list. */
export function hasToc(page) {
  const count = drawableSections(page).length;
  if (page?.toc === false || count === 0) return false;
  return page?.toc === true || count >= TOC_FROM;
}

/**
 * The sections of a page, in order.
 * @param {SitePage} page
 * @param {{ places?: Object<string, string> }} [ctx]
 * @returns {string}
 */
export function sectionsHtml(page, ctx = {}) {
  return drawableSections(page).map((section) => `<section class="site-section" id="site-${section.id}" data-site-section="${section.id}" aria-labelledby="site-${section.id}-title">
      <h2 class="site-section-title" id="site-${section.id}-title" tabindex="-1">${inlineHtml(section.heading, ctx)}</h2>
      ${list(section.blocks).map((block) => blockHtml(block, ctx)).join('\n      ')}
    </section>`).join('\n');
}

/**
 * The "On this page" list. Each entry links to #/<page>/<section id>, a real address; the frame
 * scrolls to the section without building the page again.
 * @param {string} pageId
 * @param {SitePage} page
 * @param {(key: string) => string} t
 * @param {{ places?: Object<string, string> }} [ctx]
 */
export function tocHtml(pageId, page, t, ctx = {}) {
  if (!hasToc(page)) return '';
  const items = drawableSections(page)
    .map((section) => `<li><a class="site-toc-link" href="#/${esc(pageId)}/${section.id}" data-site-jump="${section.id}">${inlineHtml(section.heading, ctx)}</a></li>`).join('');
  return `<nav class="site-toc" aria-labelledby="site-toc-title"><details class="site-toc-box" open><summary class="site-toc-title" id="site-toc-title">${esc(t('site.toc'))}</summary><ol class="site-toc-list">${items}</ol></details></nav>`;
}

/**
 * What is wrong with a page's data, in words; an empty list when it can be drawn in full. For the
 * test of each page module: expect(validatePage(page)).toEqual([]).
 * @param {*} page
 * @returns {string[]}
 */
export function validatePage(page) {
  if (!page || typeof page !== 'object') return ['The page is not an object'];
  const problems = [];
  if (!isText(page.title)) problems.push('The page has no title');
  if (page.intro !== undefined && !paragraphs(page.intro).length) problems.push('The intro is empty');
  if (!Array.isArray(page.sections) || !page.sections.length) problems.push('The page has no sections');
  const seen = new Set();
  list(page.sections).forEach((section, index) => {
    const name = `Section ${index + 1}${section?.id ? ` (${section.id})` : ''}`;
    if (!SECTION_ID.test(String(section?.id ?? ''))) problems.push(`${name}: the id must be lower case letters, digits and hyphens`);
    else if (seen.has(section.id)) problems.push(`${name}: the id is used twice`);
    seen.add(section?.id);
    if (!isText(section?.heading)) problems.push(`${name}: no heading`);
    if (!Array.isArray(section?.blocks) || !section.blocks.length) problems.push(`${name}: no blocks`);
    list(section?.blocks).forEach((block, at) => {
      if (!BLOCK_TYPES.includes(block?.type)) problems.push(`${name}, block ${at + 1}: unknown type "${block?.type}"`);
      else if (!blockHtml(block)) problems.push(`${name}, block ${at + 1} (${block.type}): draws nothing`);
    });
  });
  return problems;
}

/**
 * The date under the title of a legal text, in the reader's language.
 * @param {string|null} iso YYYY-MM-DD
 * @param {string} tag a language tag: 'en', 'ms', 'zh-Hans', 'fi'
 * @returns {string} '' for no date
 */
export function formatUpdated(iso, tag = 'en') {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(tag === 'en' ? 'en-GB' : tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return iso;
  }
}
