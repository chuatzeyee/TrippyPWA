// The search field and the filter chips (blueprint 3.3). The input sits outside any region, so a
// patch never interrupts typing; the chips are the `filters` region, keyed so a patch keeps the
// focused chip. Owner: F5.
import { attr, cls, esc } from './html.js';
import { icon } from './icons.js';

/**
 * @param {{ q: string, active: string, expanded: boolean, options: Array<{ key: string, label: string, count: number }> }} filter
 * @param {{ label?: string, searchLast?: boolean, cls?: any }} [opts] label names the search field;
 *   searchLast puts the chips before the search field in the markup (and so in the tab order), for a
 *   view whose bar reads chips first: the order is never changed by CSS (blueprint 8.3). The root then
 *   also carries dv-filter--search-last.
 */
export function filterBarHtml(filter, { label = 'Search your trips', searchLast = false, cls: extra } = {}) {
  const { q = '', active = 'all', options = [] } = filter ?? {};
  const chips = options.map((option) => {
    const on = option.key === active;
    const key = `filter-${option.key}`;
    return `<button type="button" class="${cls('ui-chip', { 'is-active': on })}"${attr('data-filter', option.key)}${attr('data-key', key)}${attr('data-focus-key', key)} aria-pressed="${on}"><span class="ui-chip-label">${esc(option.label)}</span> <span class="ui-chip-count">${esc(option.count)}</span></button>`;
  }).join('');
  const search = `<label class="dv-search">
      <span class="ui-vh">${esc(label)}</span>
      ${icon('search', 18)}
      <input class="dv-search-input" type="search" data-trip-search data-focus-key="trip-search"${attr('value', q)}${attr('placeholder', label)} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    </label>`;
  const group = `<div class="dv-chips" data-region="filters" role="group" aria-label="Filter trips">${chips}</div>`;
  const last = searchLast === true;
  return `<div class="${cls('dv-filter', { 'dv-filter--search-last': last }, extra)}">
    ${last ? group : search}
    ${last ? search : group}
  </div>`;
}
