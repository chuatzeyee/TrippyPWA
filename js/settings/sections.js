// The Settings page as markup (blueprint 6.1 to 6.7): the page frame and its eight sections. Pure:
// a state object in, a string out, every value escaped. Each section is made of parts
// (data-st-part), the unit js/settings/settings-page.js patches, so a change redraws one control and
// the focus stays where it is. Owner: F12.
import { attr, cls, esc, link } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { viewPickerHtml } from '../views/shared/view-picker.js';
import { PHOTO_SOURCES_HTML, MAP_ATTRIBUTION_HTML } from '../views/shared/credits.js';
import { costEstimate, costFigures } from '../lib/money.js';
import { formatClock, formatTempRange, getLocale } from '../lib/locale.js';
import { LANGUAGES, resolveLanguage } from '../lib/i18n.js';
import { currencyOptions } from '../data/currency-list.js';
import { notificationRow } from './notify.js';
import { NAME_MAX, cityLabel, nationalityOptions } from './profile-fields.js';
import {
  actionButtonHtml, comboboxHtml, connectionNoticeHtml, segmentedHtml, selectHtml, statusLineHtml, switchHtml, textFieldHtml,
} from './controls.js';

/**
 * @typedef {Object} SettingsState
 * @property {boolean} online
 * @property {import('../lib/prefs.js').Prefs} prefs
 * @property {string} [language]   the language on screen (js/lib/i18n.js getLanguage), shown while the pref is 'auto'
 * @property {{ theme: 'dark'|'light', baseUrl: string, images: boolean, views: Array<{ id: string, name: string, sentence: string }> }} picker
 * @property {{ override: 'auto'|'on'|'off', active: boolean }} square   the stored choice, and whether square layout is on now
 * @property {{ status: 'ready'|'loading'|'offline'|'error', data: object|null }} profile   the profile row
 * @property {{ code: string, symbol: string }|null} home    the home currency known on this device
 * @property {Object<string, ''|'saving'|'saved'|'error'|{ error: string }>} saves   by control: name, city, nationality, nomad, currency
 * @property {{ remote: 'unknown'|'available'|'unavailable', pending: string[] }} sync
 * @property {{ state: string, message: string }} notify     notificationState() and the result of the last action
 * @property {Array<{ id: string, title: string, savedAt: string }>} offlineTrips
 * @property {string} dataMessage    the result of the last action in the Data section
 * @property {string} [accountMessage]  the result of "Delete my account" when it did not happen
 * @property {{ email: string|null, admin: boolean }} account
 * @property {string} buildId
 */

/** The eight sections, in page order. */
export const SECTIONS = Object.freeze([
  { key: 'look', title: 'Look and layout' },
  { key: 'you', title: 'You' },
  { key: 'money', title: 'Money and units' },
  { key: 'trips', title: 'Trips' },
  { key: 'notifications', title: 'Notifications' },
  { key: 'data', title: 'Data' },
  { key: 'account', title: 'Account' },
  { key: 'about', title: 'About' },
].map((section) => Object.freeze(section)));

const titleOf = (key) => SECTIONS.find((section) => section.key === key)?.title ?? '';
const part = (name, html, extra) => `<div class="${cls('st-part', extra)}" data-st-part="${esc(name)}">${html}</div>`;
/**
 * A part that is a live region: it is in the page from the start, empty, and a message is put into
 * it, so a screen reader hears the message whenever it arrives.
 */
const statusPart = (name, id, message) => `<div class="st-part st-part--status" id="${esc(id)}" role="status" data-st-part="${esc(name)}">${message ? `<p class="st-status-text">${esc(message)}</p>` : ''}</div>`;
const card = (html, extra) => `<div class="${cls('st-card', extra)}">${html}</div>`;
const group = (legend, html) => `<fieldset class="st-group"><legend class="st-group-legend">${esc(legend)}</legend>${html}</fieldset>`;

function section(key, body, intro = '') {
  return `<section class="st-section" id="st-${key}" aria-labelledby="st-${key}-title" data-st-section="${key}">
    <h2 class="st-section-title" id="st-${key}-title" tabindex="-1">${esc(titleOf(key))}</h2>
    ${intro ? `<p class="st-section-intro">${esc(intro)}</p>` : ''}
    ${body}
  </section>`;
}

// ---- The status line under the title (blueprint 5.2) ----

/**
 * Where the preferences are saved, in plain words.
 * @param {{ remote?: 'unknown'|'available'|'unavailable', pending?: string[], online?: boolean }} [facts]
 *   remote   remotePrefsState(): 'unavailable' before migration 022
 *   pending  pendingPrefKeys(): changed here, not yet stored in the account
 */
export function syncStatusText({ remote = 'unknown', pending = [], online = true } = {}) {
  if (remote === 'unavailable') return 'Saved on this device';
  if (remote === 'available' && pending.length === 0) return 'Saved on this device and to your account';
  return online ? 'Saved on this device. Syncing to your account' : 'Saved on this device. Syncing when you are back online';
}

function syncLineHtml(state) {
  const text = syncStatusText({ ...state.sync, online: state.online });
  const synced = state.sync?.remote === 'available' && (state.sync.pending ?? []).length === 0;
  return `<p class="st-sync" role="status" data-st-part="sync">${icon(synced ? 'check' : 'device', 16)}<span>${esc(text)}</span></p>`;
}

// ---- Examples under the unit controls (blueprint 6.3) ----

const EXAMPLE_TRIP = Object.freeze({ total: 6347, code: 'HKD', symbol: 'HK$' });
const EXAMPLE_TRIP_FOR_HKD = Object.freeze({ total: 120000, code: 'JPY', symbol: '¥' });

/**
 * The example lines, as the app would print them now. Time and temperature follow the display prefs
 * the prefs store has applied (js/lib/locale.js); money follows the two arguments.
 * @param {{ homeCurrencyFirst: boolean, home: { code: string, symbol?: string }|null }} input
 * @returns {{ money: string, temperature: string, time: string }}
 */
export function exampleTexts({ homeCurrencyFirst, home } = {}) {
  const trip = String(home?.code ?? '').toUpperCase() === EXAMPLE_TRIP.code ? EXAMPLE_TRIP_FOR_HKD : EXAMPLE_TRIP;
  const { lead, other } = costFigures(costEstimate({ total: trip.total, tripCode: trip.code, tripSymbol: trip.symbol, home, homeFirst: homeCurrencyFirst }));
  let money = `${lead}, then ${other}`;
  if (!other) {
    money = home?.code
      ? `${lead}. Your home currency has no exchange rate in Trippy, so amounts stay in the trip currency.`
      : `${lead}. Set a home currency to see converted amounts.`;
  }
  return { money, temperature: formatTempRange(16, 23), time: formatClock('14:30') };
}

// ---- Look and layout (6.1) ----

const SQUARE_NOTE = 'Square layout uses the standard look. Your view applies on other screens.';

export function lookSectionHtml(state) {
  const { prefs, picker, square } = state;
  const on = picker.views.find((view) => view.id === prefs.view)?.name ?? '';
  const pickerHtml = viewPickerHtml({
    size: 'full', current: prefs.view, theme: picker.theme, baseUrl: picker.baseUrl, views: picker.views, images: picker.images === true,
    status: on ? `${on} is on.` : '',
  });
  const note = square.active ? `<p class="st-note">${icon('info', 16)}<span>${SQUARE_NOTE}</span></p>` : '';
  const theme = segmentedHtml({
    id: 'st-theme', name: 'theme', legend: 'Theme', value: prefs.theme, inputAttrs: { 'data-st-pref': 'theme' },
    options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match device' }],
  });
  const squareControl = segmentedHtml({
    id: 'st-square', name: 'square', legend: 'Square layout', value: square.override, inputAttrs: { 'data-st-square': true },
    help: 'Card paging for square screens. Saved on this device.',
    options: [{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
  });
  const motion = segmentedHtml({
    id: 'st-motion', name: 'motion', legend: 'Motion', value: prefs.motion, inputAttrs: { 'data-st-pref': 'motion' },
    help: 'Reduce motion turns off animations and smooth scrolling.',
    options: [{ value: 'system', label: 'Match device' }, { value: 'reduce', label: 'Reduce motion' }],
  });
  // The pref is 'auto' until a language is chosen: the control shows the one on screen (state.language).
  const language = selectHtml({
    id: 'st-language', label: 'Language', value: resolveLanguage(prefs.language, [state.language]), inputAttrs: { 'data-st-pref': 'language' },
    help: 'For the footer and the About, Privacy policy and Terms of use pages. The rest of Trippy is in English for now.',
    options: LANGUAGES.map(({ code, name }) => ({ value: code, label: name })),
  });
  return section('look', `
    ${card(`<p class="st-lead">Choose how your dashboard and your trip pages look. Your choice applies at once.</p>${part('picker', pickerHtml)}${part('square-note', note)}`, 'st-card--picker')}
    ${card(`${part('theme', theme)}${part('square', squareControl)}${part('motion', motion)}${part('language', language)}`)}`);
}

// ---- You (6.2) ----

export function youSectionHtml(state) {
  const { profile, saves = {} } = state;
  const intro = 'Trippy uses these to greet you, to plan from your home city and to check entry rules for your passport.';
  if (profile.status !== 'ready') {
    return section('you', card(`${part('name', connectionNoticeHtml(profile.status, 'you'))}${part('home', '')}${part('nationality', '')}`), intro);
  }
  const row = profile.data ?? {};
  const nomad = row.is_nomad === true;
  const name = textFieldHtml({
    id: 'st-name', label: 'Name', value: row.display_name ?? '', status: statusLineHtml('name', saves.name),
    inputAttrs: { 'data-st-field': 'name', maxlength: NAME_MAX, autocomplete: 'name', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done' },
  });
  const city = comboboxHtml({
    id: 'st-city', label: nomad ? 'Home city (optional)' : 'Home city and country', value: cityLabel(row), placeholder: 'Search for a city',
    help: 'Type a few letters and choose from the list. It also sets how numbers and dates are written.',
    status: statusLineHtml('city', saves.city),
  });
  const traveller = switchHtml({
    id: 'st-nomad', label: 'Full-time traveller', checked: nomad, inputAttrs: { 'data-st-field': 'nomad' },
    help: 'With no fixed home, the home city becomes optional, and short hops and home arcs are hidden.',
    status: statusLineHtml('nomad', saves.nomad),
  });
  const passport = selectHtml({
    id: 'st-nationality', label: 'Passport nationality', value: String(row.nationality ?? '').trim().toLowerCase(), options: nationalityOptions(row.nationality),
    help: 'For visa and entry guidance on your trips.', inputAttrs: { 'data-st-field': 'nationality', autocomplete: 'off' },
    status: statusLineHtml('nationality', saves.nationality),
  });
  return section('you', card(`${part('name', name)}${part('home', group('Where you are based', `${city}${traveller}`))}${part('nationality', passport)}`), intro);
}

// ---- Money and units (6.3) ----

function currencyRowHtml(state) {
  const { profile, saves = {} } = state;
  if (profile.status !== 'ready') return `<div class="st-row st-row--notice"><p class="st-label">Home currency</p>${connectionNoticeHtml(profile.status, 'money')}</div>`;
  const row = profile.data ?? {};
  const stored = typeof row.home_currency === 'string' ? row.home_currency : '';
  const options = currencyOptions(stored, row.home_currency_symbol ?? '').map((entry) => ({
    value: entry.code, label: entry.name === entry.code ? entry.code : `${entry.name} (${entry.code})`,
  }));
  return selectHtml({
    id: 'st-currency', label: 'Home currency', value: stored, inputAttrs: { 'data-st-field': 'currency', autocomplete: 'off' },
    options: stored ? options : [{ value: '', label: 'Choose a currency' }, ...options],
    help: 'Trip costs are converted to it with approximate rates.', status: statusLineHtml('currency', saves.currency),
  });
}

export function moneySectionHtml(state) {
  const { prefs, home = null } = state;
  const examples = exampleTexts({ homeCurrencyFirst: prefs.homeCurrencyFirst, home });
  const homeFirst = switchHtml({
    id: 'st-home-first', label: 'Show my home currency first', checked: prefs.homeCurrencyFirst, example: examples.money,
    inputAttrs: { 'data-st-pref': 'homeCurrencyFirst' },
  });
  const temperature = segmentedHtml({
    id: 'st-temperature', name: 'temperatureUnit', legend: 'Temperature', value: prefs.temperatureUnit, example: examples.temperature,
    inputAttrs: { 'data-st-pref': 'temperatureUnit' }, options: [{ value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }],
  });
  const time = segmentedHtml({
    id: 'st-time', name: 'timeFormat', legend: 'Time', value: prefs.timeFormat, example: examples.time,
    inputAttrs: { 'data-st-pref': 'timeFormat' }, options: [{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }],
  });
  return section('money', card(`${part('currency', group('Currency', `${currencyRowHtml(state)}${homeFirst}`))}${part('temperature', temperature)}${part('time', time)}`));
}

// ---- Trips (6.4) ----

export function tripsSectionHtml(state) {
  const { prefs } = state;
  const switches = [
    switchHtml({ id: 'st-open-today', label: "Open today's plan first when a trip is live", checked: prefs.openTodayFirst, help: 'Whole trip links always open at the top.', inputAttrs: { 'data-st-pref': 'openTodayFirst' } }),
    switchHtml({ id: 'st-auto-open', label: 'Open the next day as I scroll', checked: prefs.autoOpenNextDay, inputAttrs: { 'data-st-pref': 'autoOpenNextDay' } }),
    switchHtml({
      id: 'st-venue-photos', label: 'Show venue photos', checked: prefs.showVenuePhotos, inputAttrs: { 'data-st-pref': 'showVenuePhotos' },
      help: 'On the trip page: stops, day thumbnails and areas. Cover photos stay, and the PDF export always includes photos.',
    }),
  ];
  return section('trips', card(part('trip-page', group('On the trip page', switches.join('')))));
}

// ---- Notifications (6.5) ----

export function notificationsSectionHtml(state) {
  const row = notificationRow(state.notify?.state);
  const body = `<div class="st-row st-row--action">
      <h3 class="st-label">Tell me when a trip is ready</h3>
      <p class="st-help" id="st-notify-text">${esc(row.text)}</p>
      ${row.action ? actionButtonHtml(row.action.label, { action: row.action.key, describedBy: 'st-notify-text' }) : ''}
    </div>`;
  return section('notifications', card(`${part('notify', body)}${statusPart('notify-status', 'st-notify-status', state.notify?.message)}`));
}

// ---- Data (6.6) ----

/** "Saved 19 Nov 2026, 10:10 AM" in the device's zone; '' when the time is missing or not a time. */
export function savedAtText(iso) {
  const time = typeof iso === 'string' ? new Date(iso) : null;
  if (!time || Number.isNaN(time.getTime())) return '';
  const date = new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(time);
  const clock = formatClock(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
  return `Saved ${date}, ${clock}`;
}

export function dataSectionHtml(state) {
  const trips = Array.isArray(state.offlineTrips) ? state.offlineTrips : [];
  const list = trips.length
    ? `<ul class="st-saved-list" aria-labelledby="st-saved-title">${trips.map((trip) => `<li class="st-saved-item">
        <span class="st-saved-title">${esc(trip?.title || 'Untitled trip')}</span>
        <span class="st-saved-when">${esc(savedAtText(trip?.savedAt))}</span>
      </li>`).join('')}</ul>`
    : '<p class="st-empty">No trips are saved on this device yet. Open a trip while online to keep a copy.</p>';
  const saved = `<div class="st-row st-row--action">
      <h3 class="st-label" id="st-saved-title">Trips saved on this device</h3>
      ${list}
      <p class="st-help" id="st-clear-help">Clearing removes the trips, the trip list and the briefings kept on this device. Your trips stay in your account.</p>
      ${actionButtonHtml('Clear offline copies', { action: 'clear-offline', disabled: trips.length === 0, describedBy: 'st-clear-help' })}
    </div>`;
  const remove = `<div class="st-row st-row--action st-row--danger">
      <h3 class="st-label">Delete all my trips</h3>
      <p class="st-help" id="st-delete-help">Deletes every trip you own, for good. Trips shared with you stay, and so do your profile and settings.${state.online ? '' : ' This needs a connection.'}</p>
      ${actionButtonHtml('Delete all my trips', { action: 'delete-trips', danger: true, disabled: !state.online, describedBy: 'st-delete-help' })}
    </div>`;
  return section('data', card(`${part('saved', saved)}${part('delete', remove)}${statusPart('data-status', 'st-data-status', state.dataMessage)}`));
}

// ---- Account, About (6.7) ----

export function accountSectionHtml(state) {
  const { account = {}, online } = state;
  const who = account.email
    ? `<p class="st-account-line">Signed in as <strong class="st-account-email">${esc(account.email)}</strong></p>`
    : '<p class="st-account-line">You are signed in on this device.</p>';
  const admin = account.admin === true ? link('#/admin', 'Admin', { cls: 'ui-btn', focusKey: 'admin', attrs: { id: 'st-admin' } }) : '';
  const body = `<div class="st-row st-row--action">
      ${who}
      ${online ? '' : '<p class="st-help" id="st-sign-out-help">Signing out needs a connection.</p>'}
      <div class="st-actions">${actionButtonHtml('Sign out', { action: 'sign-out', disabled: !online, describedBy: online ? null : 'st-sign-out-help' })}${admin}</div>
    </div>`;
  // The user deletes the account here, themselves: nobody has to be written to (migration 023).
  const remove = `<div class="st-row st-row--action st-row--danger">
      <h3 class="st-label">Delete my account</h3>
      <p class="st-help" id="st-delete-account-help">Deletes your account for good: your profile and settings, every trip you own with its photos and share links, your invitations and your usage records. A trip you own is deleted for the people you shared it with too. This cannot be undone.${online ? '' : ' This needs a connection.'}</p>
      ${actionButtonHtml('Delete my account', { action: 'delete-account', danger: true, disabled: !online, describedBy: 'st-delete-account-help' })}
    </div>`;
  return section('account', card(`${part('account', body)}${part('delete-account', remove)}${statusPart('account-status', 'st-account-status', state.accountMessage)}`));
}

/** The hash in the entry file name ("/assets/index-BxK3f_9a.js" gives "BxK3f_9a"); '' when there is none. */
export function entryBuildId(src) {
  return /\/assets\/[\w.]+-([\w-]{6,})\.js(?:[?#]|$)/.exec(String(src ?? ''))?.[1] ?? '';
}

export function aboutSectionHtml(state) {
  const build = state.buildId ? `Version ${esc(state.buildId)}` : 'Version not known';
  const body = `<div class="st-row st-row--about">
      <p class="st-about-build">${build}</p>
      <p class="st-about-line">${PHOTO_SOURCES_HTML}</p>
      <p class="st-about-line">${MAP_ATTRIBUTION_HTML}</p>
      <p class="st-about-line">World outline: Natural Earth, public domain</p>
    </div>`;
  return section('about', card(part('about', body)));
}

// ---- The page ----

const BUILDERS = Object.freeze({
  look: lookSectionHtml, you: youSectionHtml, money: moneySectionHtml, trips: tripsSectionHtml,
  notifications: notificationsSectionHtml, data: dataSectionHtml, account: accountSectionHtml, about: aboutSectionHtml,
});

/** One section by its key; '' for a key that is not a section. */
export function sectionHtml(key, state) {
  return Object.hasOwn(BUILDERS, key) ? BUILDERS[key](state) : '';
}

/**
 * The whole page: the root, the title with Done, the status line, the "On this page" chips and the
 * eight sections.
 * @param {SettingsState} state
 */
export function settingsPageHtml(state) {
  // The first section is marked until js/settings/toc.js has looked at where the page is.
  const chips = SECTIONS.map(({ key, title }, i) => `<li><button type="button" class="ui-chip st-toc-chip" data-st-jump="${key}" aria-controls="st-${key}"${attr('aria-current', i === 0 ? 'true' : null)}>${esc(title)}</button></li>`).join('');
  return `<div class="st-page" data-view="settings">
    <header class="st-head">
      <div class="st-head-row">
        <h1 class="st-title">Settings</h1>
        <a class="ui-btn st-done" href="#/" data-st-done${attr('data-focus-key', 'done')}>Done</a>
      </div>
      ${syncLineHtml(state)}
    </header>
    <div class="st-layout">
      <nav class="st-toc" aria-labelledby="st-toc-title">
        <h2 class="st-toc-title" id="st-toc-title">On this page</h2>
        <ul class="st-toc-list" data-st-cut="none">${chips}</ul>
      </nav>
      <div class="st-sections">${SECTIONS.map(({ key }) => sectionHtml(key, state)).join('')}</div>
    </div>
  </div>`;
}
