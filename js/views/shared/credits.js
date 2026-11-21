// Photo sources, the credits list and the trip page foot (blueprint 4.2, 8.5). A card shows only the
// short source on its photo; the full credit, with its licence, is printed here, once. Owner: F5.
import { attr, cls, link } from './html.js';

// Every link carries a data-focus-key, so focus comes back to it when its region is patched.
const out = (href, label, focusKey) => link(href, label, { focusKey });

/**
 * The line that credits the photo providers overall. Inline markup with no wrapper; the same words the
 * classic trip footer prints (js/components/trip-detail.js, renderTripFooter). The markup is not the
 * same byte for byte (focus keys, rel), so the classic footer keeps its own literal.
 */
export const PHOTO_SOURCES_HTML = `Photos via ${out('https://commons.wikimedia.org', 'Wikimedia Commons', 'source-commons')}, ${out('https://openverse.org', 'Openverse', 'source-openverse')} (Creative Commons), venue websites, Google Maps, the web pages credited on each photo &amp; ${out('https://www.pexels.com', 'Pexels', 'source-pexels')}`;

/** The attribution OpenStreetMap asks for wherever its tiles are shown. Inline markup with no wrapper. */
export const MAP_ATTRIBUTION_HTML = `Map data © ${out('https://www.openstreetmap.org/copyright', 'OpenStreetMap', 'source-osm')} contributors`;

/**
 * Every photo credit in full, one line each, inside a keyed details group.
 * @param {Array<{ label: string, full: string, link: string }>|null} credits
 * @param {{ open?: boolean, key?: string, cls?: any }} [opts] key is the data-key (and focus key) of the group;
 *   each link is keyed "<key>-<its address>", with "-2", "-3" after it when credits share one source page
 */
export function creditsListHtml(credits, { open = false, key = 'credits', cls: extra } = {}) {
  const seen = new Set();
  const uses = new Map();
  const rows = (credits ?? []).flatMap((credit) => {
    const text = String(credit?.full || credit?.label || '').trim();
    const id = `${text}|${credit?.link ?? ''}`;
    if (!text || seen.has(id)) return [];
    seen.add(id);
    const nth = (uses.get(credit.link) ?? 0) + 1;
    uses.set(credit.link, nth);
    return [`<li>${link(credit.link, text, { focusKey: `${key}-${credit.link}${nth > 1 ? `-${nth}` : ''}` })}</li>`];
  });
  if (!rows.length) return '';
  return `<details class="${cls('ui-credits', extra)}"${attr('data-key', key)}${attr('open', open)}><summary${attr('data-focus-key', key)}>Photo credits</summary><ul class="ui-credits-list">${rows.join('')}</ul></details>`;
}

/**
 * The foot of the trip page in view mode: the sources line, the credits list, and the map attribution
 * when a map is drawn. Emitted once, as the last content child of .td-wrap.
 * @param {Array<{ label: string, full: string, link: string }>|null} credits
 * @param {{ map?: boolean }} [opts]
 */
export function tripFootHtml(credits, { map = false } = {}) {
  const mapLine = map ? `<p class="ui-foot-line">${MAP_ATTRIBUTION_HTML}</p>` : '';
  return `<footer class="tv-foot">
    <p class="ui-foot-line">${PHOTO_SOURCES_HTML}</p>
    ${creditsListHtml(credits)}
    ${mapLine}
  </footer>`;
}
