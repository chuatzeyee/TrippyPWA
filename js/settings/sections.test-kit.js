// What the two test files of js/settings/sections.js share: a small tag walker (this test run has no
// DOM) and the states the sections are drawn in. Not a test file. Owner: F12.
import { SECTIONS } from './sections.js';
import { DEFAULT_PREFS } from '../lib/prefs.js';
import { VIEW_CHOICES } from '../views/shared/view-picker.js';

export const BANNED = /[\u2014\u2013\u00b7\u2022\u2027\u2219\u2026]/; // em dash, en dash, middle dot, bullets, ellipsis
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'path', 'rect', 'line', 'circle', 'polyline', 'polygon', 'ellipse']);

/** Every element of a markup string, with its attributes, its ancestors and the text right inside it. */
export function walk(html) {
  const out = [];
  const stack = [];
  const tagPattern = /<(\/)?([a-zA-Z][\w-]*)((?:\s+[\w:.-]+(?:="[^"]*")?)*)\s*(\/)?>|([^<]+)/g;
  for (const match of html.matchAll(tagPattern)) {
    const [, closing, rawTag, rawAttrs, selfClosing, text] = match;
    if (text !== undefined) {
      if (stack.length) stack.at(-1).text += text;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing) {
      while (stack.length && stack.at(-1).tag !== tag) stack.pop();
      stack.pop();
      continue;
    }
    const attrs = Object.fromEntries([...rawAttrs.matchAll(/([\w:.-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? true]));
    const el = { tag, attrs, parents: [...stack], text: '', children: [] };
    if (stack.length) stack.at(-1).children.push(el);
    out.push(el);
    if (!VOID.has(tag) && !selfClosing) stack.push(el);
  }
  return out;
}
export const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
export const byId = (els, id) => els.find((el) => el.attrs.id === id);
export const inside = (el, tag) => el.parents.some((parent) => parent.tag === tag);

export const PROFILE = Object.freeze({
  display_name: 'Avery Lindqvist', home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt', is_nomad: false,
  home_currency: 'EUR', home_currency_symbol: '€', nationality: 'pt',
});
export const SAVED_TRIPS = [
  { id: 't1', title: 'Porto & the Douro <valley>', start_date: '2027-03-02', end_date: '2027-03-09', savedAt: new Date(2026, 10, 19, 10, 10).toISOString() },
  { id: 't2', title: 'Kyoto in autumn', start_date: null, end_date: null, savedAt: new Date(2026, 10, 18, 21, 5).toISOString() },
];

/** A whole state: signed in, online, profile loaded, nothing pending. */
export function state(over = {}) {
  return {
    online: true,
    prefs: { ...DEFAULT_PREFS },
    picker: { theme: 'dark', baseUrl: '/', images: false, views: VIEW_CHOICES },
    square: { override: 'auto', active: false },
    profile: { status: 'ready', data: { ...PROFILE } },
    home: { code: 'EUR', symbol: '€' },
    saves: {},
    sync: { remote: 'unavailable', pending: [] },
    notify: { state: 'default', message: '' },
    offlineTrips: SAVED_TRIPS,
    dataMessage: '',
    account: { email: 'avery@example.com', admin: false },
    buildId: 'dev',
    ...over,
  };
}
export const OFFLINE = () => state({ online: false, profile: { status: 'offline', data: null }, sync: { remote: 'unknown', pending: ['theme'] } });
export const ERROR = () => state({ profile: { status: 'error', data: null }, saves: { name: 'error', currency: 'error' }, dataMessage: 'Your trips could not be deleted. Try again.' });
export const LOADING = () => state({ profile: { status: 'loading', data: null } });
export const VARIANTS = { normal: state, offline: OFFLINE, error: ERROR, loading: LOADING };
export const KEYS = SECTIONS.map((section) => section.key);


/** The outer markup of the element with this id (enough for a text check). */
export function byIdHtml(html, id) {
  const at = html.indexOf(`id="${id}"`);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<', at), html.indexOf('</', at));
}
