// The small pieces every section of the admin console is built from: pills, avatars, chips, search,
// sortable table heads, state cards and the page frame. Strings only; every value from the database
// goes through esc() or attr() before it reaches the markup.
import { attr, cls, esc, flagChip } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { displayName, flagCode, formatTime, homeLabel, initials, num, safeAvatar } from './admin-format.js';
import { statusLabel } from './admin-filters.js';

export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'overview', label: 'Overview' }),
  Object.freeze({ key: 'people', label: 'People' }),
  Object.freeze({ key: 'trips', label: 'Trips' }),
  Object.freeze({ key: 'activity', label: 'Activity' }),
]);

export const isSection = (key) => SECTIONS.some((section) => section.key === key);

const STATUS_TONES = { planning: 'quiet', generating: 'busy', generated: 'ok', active: 'ok', completed: 'quiet', failed: 'bad' };
const LEVEL_TONES = { error: 'bad', warn: 'warn', info: 'quiet' };
const LEVEL_WORDS = { error: 'Error', warn: 'Warning', info: 'Info' };

/** A pill: a dot that carries the tone and words that carry the meaning. */
export function pillHtml(label, tone = 'quiet') {
  return `<span class="adm-pill" data-tone="${esc(tone)}"><i class="adm-pill-dot" aria-hidden="true"></i>${esc(label)}</span>`;
}

export function statusPillHtml(status) {
  return pillHtml(statusLabel(status), Object.hasOwn(STATUS_TONES, status) ? STATUS_TONES[status] : 'quiet');
}

export function levelPillHtml(level) {
  const known = Object.hasOwn(LEVEL_WORDS, level);
  return pillHtml(known ? LEVEL_WORDS[level] : 'Other', known ? LEVEL_TONES[level] : 'quiet');
}

/** A quiet word tag (a role, a category). */
export function tagHtml(label) {
  return `<span class="adm-tag">${esc(label)}</span>`;
}

/**
 * The picture of a person, or their initials. The address is checked (http or https only) and the
 * image carries the initials, so the page can fall back to them when the picture does not load.
 */
export function avatarHtml(profile, { small = false } = {}) {
  const name = displayName(profile);
  const letters = initials(name);
  const src = safeAvatar(profile?.avatar_url);
  const classes = cls('adm-avatar', { 'adm-avatar--small': small });
  if (!src) return `<span class="${classes}" aria-hidden="true">${esc(letters)}</span>`;
  const size = small ? 28 : 40;
  return `<img class="${classes}" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${attr('data-adm-initials', letters)}>`;
}

/** The flag and the home of a person, or "Not set". */
export function homeHtml(profile) {
  const label = homeLabel(profile);
  if (!label) return '<span class="adm-quiet">Not set</span>';
  return `<span class="adm-home">${flagChip(flagCode(profile.home_flag), { size: 20 })}<span>${esc(label)}</span></span>`;
}

/**
 * A group of filter chips. One is pressed at a time.
 * @param {{ name: string, label: string, active: string, options: Array<{ key: string, label: string, count?: number|null }> }} group
 */
export function chipsHtml({ name, label, active, options }) {
  const chips = options.map((option) => {
    const on = option.key === active;
    const key = `chip-${name}-${option.key}`;
    const count = Number.isFinite(option.count) ? ` <span class="ui-chip-count">${num(option.count)}</span>` : '';
    return `<button type="button" class="${cls('ui-chip', { 'is-active': on })}"${attr('data-adm-chip', name)}${attr('data-adm-value', option.key)}${attr('data-focus-key', key)} aria-pressed="${on}"><span class="ui-chip-label">${esc(option.label)}</span>${count}</button>`;
  }).join('');
  return `<div class="adm-chips ui-scroll-fade" role="group"${attr('aria-label', label)}>${chips}</div>`;
}

/** A search field. The input stays out of every redrawn region, so typing is never interrupted. */
export function searchHtml({ name, label, value = '' }) {
  return `<label class="dv-search adm-search">
      <span class="ui-vh">${esc(label)}</span>
      ${icon('search', 18)}
      <input class="dv-search-input" type="search"${attr('data-adm-search', name)}${attr('data-focus-key', `search-${name}`)}${attr('value', value)}${attr('placeholder', label)} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    </label>`;
}

/**
 * The head of a table. A sortable column is a button inside its header cell and says which way it
 * is sorted.
 * @param {string} table  the table the sort belongs to ('people', 'trips')
 * @param {Array<{ key?: string, label: string, sortable?: boolean, hidden?: boolean, cls?: string }>} columns
 * @param {{ key: string, dir: 'asc'|'desc' }|null} sort
 */
export function theadHtml(table, columns, sort) {
  const cells = columns.map((column) => {
    const classes = cls(column.cls, { 'adm-th--plain': !column.sortable });
    if (!column.sortable) {
      const words = column.hidden ? `<span class="ui-vh">${esc(column.label)}</span>` : esc(column.label);
      return `<th scope="col" role="columnheader"${attr('class', classes || null)}>${words}</th>`;
    }
    const on = sort?.key === column.key;
    const state = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th scope="col" role="columnheader" aria-sort="${state}"${attr('class', classes || null)}><button type="button" class="${cls('adm-sort', { 'is-active': on })}"${attr('data-adm-sort', column.key)}${attr('data-adm-table', table)}${attr('data-focus-key', `sort-${table}-${column.key}`)}><span>${esc(column.label)}</span>${on ? `<span class="adm-sort-mark" data-dir="${sort.dir}">${icon('chevron-down', 16)}</span>` : ''}</button></th>`;
  }).join('');
  return `<thead role="rowgroup"><tr role="row">${cells}</tr></thead>`;
}

/** A table cell that names its column, so the same row reads as a card on a phone. */
export function td(label, html, { cls: names } = {}) {
  return `<td role="cell"${attr('class', cls(names, { 'adm-td--labelled': Boolean(label) }) || null)}${attr('data-label', label || null)}>${html}</td>`;
}

/** An empty list: one sentence, and a way out when a filter is the reason. */
export function emptyHtml(title, text, { clear = false } = {}) {
  const action = clear ? '<p class="dv-state-actions"><button type="button" class="ui-btn ui-btn--small" data-adm-action="clear-filters" data-focus-key="clear-filters">Clear the search and filters</button></p>' : '';
  return `<div class="dv-state adm-empty">
    <p class="dv-state-title">${esc(title)}</p>
    <p class="dv-state-text">${esc(text)}</p>${action}
  </div>`;
}

/** A load error with Try again. */
export function errorHtml(title, text, { action = 'reload' } = {}) {
  return `<div class="dv-state dv-error adm-error" role="alert">
    ${icon('warning', 24)}
    <p class="dv-state-title">${esc(title)}</p>
    <p class="dv-state-text">${esc(text)}</p>
    <p class="dv-state-actions"><button type="button" class="ui-btn ui-btn--primary"${attr('data-adm-action', action)}${attr('data-focus-key', action)}>Try again</button></p>
  </div>`;
}

/** A quiet line under a list: "Showing the newest 1,000 of 4,210 trips." */
export function noteHtml(text) {
  return text ? `<p class="adm-note">${icon('info', 16)}<span>${esc(text)}</span></p>` : '';
}

function tabHtml(section, active, badge) {
  const on = section.key === active;
  const count = Number.isFinite(badge) && badge > 0 ? ` <span class="adm-tab-count">${num(badge)}</span>` : '';
  return `<button type="button" class="${cls('adm-tab', { 'is-active': on })}" role="tab" id="adm-tab-${section.key}" aria-selected="${on}" aria-controls="adm-panel" tabindex="${on ? 0 : -1}"${attr('data-adm-tab', section.key)}${attr('data-focus-key', `tab-${section.key}`)}>${esc(section.label)}${count}</button>`;
}

/** The section tabs. `badges` gives a count for a tab ({ people: 19, trips: 42 }). */
export function tabsHtml(active, badges = {}) {
  return `<nav class="adm-tabs" role="tablist" aria-label="Admin sections">${SECTIONS.map((section) => tabHtml(section, active, badges[section.key])).join('')}</nav>`;
}

/**
 * The head of the page: the title, one line of live status, when it was last refreshed, Refresh.
 * @param {{ status: string, loadedAt?: string|Date|null, busy?: boolean, online?: boolean, timeZone?: string, refresh?: boolean }} head
 */
export function headHtml({ status, loadedAt = null, busy = false, online = true, timeZone, refresh = true }) {
  const when = loadedAt ? `<span class="adm-head-when">Updated ${esc(formatTime(loadedAt, { timeZone }))}</span>` : '';
  const offline = online ? '' : `<p class="adm-offline" role="status">${icon('offline', 18)}<span>You are offline. These numbers are from the last refresh.</span></p>`;
  const action = refresh
    ? `<button type="button" class="ui-btn adm-refresh" data-adm-action="reload" data-focus-key="reload"${attr('disabled', busy || !online)}>${icon('refresh', 18)}<span>${busy ? 'Refreshing' : 'Refresh'}</span></button>`
    : '';
  return `<header class="adm-head">
    <div class="adm-head-row">
      <h1 class="adm-title">Admin</h1>
      ${action}
    </div>
    <p class="adm-status" role="status"><span class="adm-status-text">${esc(status)}</span>${when}</p>
    ${offline}
  </header>`;
}

/** The frame of every state of the page. */
export function frameHtml(inner) {
  return `<div class="container adm" data-view="admin">${inner}</div>`;
}

/** The page while the first numbers load: the real head and the shape of what is coming. */
export function loadingPageHtml() {
  const figures = Array.from({ length: 6 }, () => '<div class="adm-figure"><span class="adm-skel adm-skel--label"></span><span class="adm-skel adm-skel--figure"></span><span class="adm-skel adm-skel--line"></span></div>').join('');
  return frameHtml(`${headHtml({ status: 'Loading the latest numbers', refresh: false })}
    <div class="adm-skel-tabs" aria-hidden="true"><span class="adm-skel adm-skel--tabs"></span></div>
    <div class="adm-loading" role="status" aria-busy="true">
      <span class="ui-vh">Loading</span>
      <div class="adm-figures" aria-hidden="true">${figures}</div>
      <div class="adm-split" aria-hidden="true">
        <div class="adm-card adm-skel-card"><span class="adm-skel adm-skel--label"></span><span class="adm-skel adm-skel--block"></span></div>
        <div class="adm-card adm-skel-card"><span class="adm-skel adm-skel--label"></span><span class="adm-skel adm-skel--line"></span><span class="adm-skel adm-skel--line"></span><span class="adm-skel adm-skel--line"></span></div>
      </div>
    </div>`);
}

/** The page for a signed in person who is not an admin. */
export function deniedPageHtml() {
  return frameHtml(`${headHtml({ status: 'This page is for the people who run Trippy.', refresh: false })}
    <div class="dv-state adm-denied">
      <p class="dv-state-title">Your account is not an admin</p>
      <p class="dv-state-text">There is nothing for you to manage here. Your trips and your settings are where they always are.</p>
      <p class="dv-state-actions"><a class="ui-btn ui-btn--primary" href="#/" data-focus-key="home">${icon('home', 18)}<span>Back to your trips</span></a></p>
    </div>`);
}

/** The page when nothing could be loaded. */
export function failedPageHtml({ online = true, message = '' } = {}) {
  const card = online
    ? errorHtml('The admin data could not be loaded', message || 'Check your connection, then try again.')
    : errorHtml('You are offline', 'The admin console needs a connection. It loads again by itself when you are back online.');
  return frameHtml(`${headHtml({ status: online ? 'Nothing could be loaded.' : 'Waiting for a connection.', refresh: false })}${card}`);
}
