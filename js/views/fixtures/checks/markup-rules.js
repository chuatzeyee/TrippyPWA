// Rules that hold for any markup a view returns, dashboard or trip landing (blueprint 3.2 and 8.1).
// Steward: F0.
import { all, attr, classesOf, elements } from './html-tree.js';

/** Classic layout classes a view may not reuse (blueprint 8.1). */
export const CLASSIC_LAYOUT = ['dashboard-merged', 'trip-grid', 'trip-card', 'trip-hero', 'td-topbar', 'td-hero', 'td-sidebar', 'td-footer-pills'];
const EMBEDDING = ['script', 'style', 'link', 'iframe', 'object', 'embed', 'base', 'meta'];
// A style attribute may only set custom properties, each to a validated number (with a unit) or to a
// token name. So no layout or colour is ever written inline, and position: fixed cannot slip past the
// stylesheet rules.
const STYLE_VALUE = /^(-?\d+(\.\d+)?(%|px|em|rem|deg|ms|s|fr)?|var\(--[a-z0-9-]+\)|[a-z][a-z0-9-]*)$/i;
const STYLE_NAME = /^--[a-z][a-z0-9-]*$/i;
const LINK = /^(#$|#\/|https?:\/\/)/;

/** @returns {string[]} one line per broken rule */
export function markupRules(root) {
  const out = [];
  const seenIds = new Set();
  for (const el of elements(root)) {
    const where = `<${el.tag}${el.attrs.class ? ` class="${el.attrs.class}"` : ''}>`;
    if (EMBEDDING.includes(el.tag)) out.push(`${where}: a view may not emit <${el.tag}>`);
    for (const name of Object.keys(el.attrs)) {
      if (/^on/.test(name)) out.push(`${where}: inline event handler ${name}`);
    }
    const style = attr(el, 'style');
    if (style !== null) {
      for (const declaration of style.split(';').map((part) => part.trim()).filter(Boolean)) {
        const colon = declaration.indexOf(':');
        const name = declaration.slice(0, colon).trim();
        const value = declaration.slice(colon + 1).trim();
        if (colon < 0 || !STYLE_NAME.test(name) || !STYLE_VALUE.test(value)) {
          out.push(`${where}: style may only set a custom property to a number or a token name, got "${declaration}"`);
        }
      }
    }
    if (el.tag === 'a') {
      const href = attr(el, 'href');
      if (href === null) out.push(`${where}: a link without href`);
      else if (!LINK.test(href)) out.push(`${where}: href must be a hash route or an http(s) URL, got "${href}"`);
    }
    for (const src of [attr(el, 'src'), attr(el, 'data-fallback')]) {
      if (src !== null && src !== '' && !/^(https?:\/\/|\/)/.test(src)) out.push(`${where}: image URL must be http(s) or a public path, got "${src.slice(0, 60)}"`);
    }
    const id = attr(el, 'id');
    if (id !== null) {
      if (seenIds.has(id)) out.push(`id "${id}" is used twice`);
      seenIds.add(id);
    }
    const classic = classesOf(el).filter((name) => CLASSIC_LAYOUT.includes(name));
    if (classic.length) out.push(`${where}: classic layout class ${classic.join(', ')} may not be reused`);
  }
  return out;
}

/** Region names must be unique: a patch finds its region by name. */
export function regionRules(root) {
  const names = all(root, '[data-region]').map((el) => attr(el, 'data-region'));
  const twice = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];
  return [
    ...twice.map((name) => `data-region="${name}" appears more than once`),
    ...(names.includes('') ? ['a data-region has no name'] : []),
  ];
}
