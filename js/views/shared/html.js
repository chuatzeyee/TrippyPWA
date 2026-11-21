// Escaping and the smallest markup builders (blueprint 1.3). Every shared component and every view
// builds its strings through these, so a model value can never reach the page unescaped. Owner: F5.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ATTR_NAME = /^[a-zA-Z_:][\w:.-]*$/;
const CLASS_NAME = /^-?[_a-zA-Z][\w-]*$/;
const FLAG_CODE = /^[a-z]{2}(-[a-z]{2,3})?$/;
/** The class a button takes when its caller names none: the neutral look in css/views/shared/common.css. */
const BUTTON_BASE = 'ui-btn';

/** Text for an element or an attribute value. Zero stays "0"; null and undefined become ''. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * One attribute with its leading space. Null, undefined and false leave it out, true writes it bare.
 * A name that is not an attribute name, or an inline event handler, is refused.
 */
export function attr(name, value) {
  if (value === null || value === undefined || value === false) return '';
  if (!ATTR_NAME.test(name) || /^on/i.test(name)) return '';
  return value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
}

/** A map of attributes, in its own order. */
export function attrs(map) {
  return Object.entries(map ?? {}).map(([name, value]) => attr(name, value)).join('');
}

/** A class list from strings, lists and `{ name: flag }` maps. Returns the bare list, not the attribute. */
export function cls(...names) {
  const out = [];
  const add = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) entry.forEach(add);
    else if (typeof entry === 'object') Object.entries(entry).forEach(([name, on]) => { if (on) add(name); });
    else String(entry).split(/\s+/).forEach((name) => { if (CLASS_NAME.test(name) && !out.includes(name)) out.push(name); });
  };
  names.forEach(add);
  return out.join(' ');
}

/** The address when it is a hash route or an http(s) URL, else ''. */
export function safeHref(url) {
  return typeof url === 'string' && /^(#$|#\/|https?:\/\/)/i.test(url) ? url : '';
}

/** The address when it is an http(s) URL or a public path, else ''. */
export function safeSrc(url) {
  return typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : '';
}

/**
 * A flag image for a validated code ("pt", "gb-sct"), '' for anything else.
 * @param {string} code
 * @param {{ size?: number, label?: string }} [opts] size is the width in px; label becomes the alt text
 */
export function flagChip(code, { size = 20, label = '' } = {}) {
  if (typeof code !== 'string' || !FLAG_CODE.test(code)) return '';
  const width = Number.isFinite(size) && size >= 8 && size <= 96 ? Math.round(size) : 20;
  const file = width > 20 ? 'w80' : 'w40';
  return `<img class="ui-flag" src="https://flagcdn.com/${file}/${code}.png" width="${width}" height="${Math.round(width * 0.75)}"${attr('alt', label)} loading="lazy" decoding="async">`;
}

/**
 * A link. An http(s) address opens in a new tab with no referrer; an unsafe address gives a span.
 * @param {string} href
 * @param {string} label  text, escaped here
 * @param {{ cls?: any, focusKey?: string, attrs?: object, html?: string }} [opts]
 *   html is trusted inner markup that replaces the label
 */
export function link(href, label, { cls: names, focusKey, attrs: extra, html } = {}) {
  const inner = html ?? esc(label);
  const classes = cls(names);
  const to = safeHref(href);
  if (!to) return `<span${attr('class', classes || null)}>${inner}</span>`;
  const outside = /^https?:/i.test(to);
  return `<a href="${esc(to)}"${attr('class', classes || null)}${attr('data-focus-key', focusKey)}${outside ? ' target="_blank" rel="noopener noreferrer"' : ''}${attrs(extra)}>${inner}</a>`;
}

/**
 * A real button.
 * @param {string} label  text, escaped here
 * @param {{ cls?: any, action?: string, focusKey?: string, attrs?: object, html?: string, disabled?: boolean,
 *           pressed?: boolean }} [opts]
 *   cls     the caller's classes, written as given. With none, the button takes "ui-btn", so it never
 *           shows the browser's own button face (base.css gives every button the page ink, which
 *           cannot be read on it in the dark theme). A caller that names its own class styles the
 *           whole control: background, border and ink.
 *   action  becomes data-action and, unless focusKey is given, data-focus-key
 */
export function button(label, { cls: names, action, focusKey, attrs: extra, html, disabled = false, pressed } = {}) {
  const classes = cls(names) || BUTTON_BASE;
  return `<button type="button"${attr('class', classes)}${attr('data-action', action)}${attr('data-focus-key', focusKey ?? action)}${attr('aria-pressed', pressed === undefined ? null : String(pressed))}${attr('disabled', disabled)}${attrs(extra)}>${html ?? esc(label)}</button>`;
}

/** Text for screen readers only. */
export function visuallyHidden(text) {
  const value = String(text ?? '');
  return value ? `<span class="ui-vh">${esc(value)}</span>` : '';
}
