// Rule test 1 of 4 (blueprint 9.2): every view, on every model fixture, keeps the hook tables of
// sections 3.3 and 3.4 and the placement rules of 3.1 and 3.2. The second half proves the checks can
// fail: each one is run on markup that breaks exactly one rule. Steward: F0.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES, CTX_FIXTURE } from './fixtures/models.js';
import { checkDashboardHtml } from './fixtures/checks/dashboard-contract.js';
import { checkTripLanding } from './fixtures/checks/trip-contract.js';
import { all, parseHtml } from './fixtures/checks/html-tree.js';
import * as stub from './fixtures/stub-view/view.js';
import * as departures from './departures/view.js';
import * as concierge from './concierge/view.js';
import * as atlas from './atlas/view.js';
import { loadAtlasBody } from './atlas/atlas-page.js';

const VIEWS = { stub, departures, concierge, atlas };
const PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];
const landingHtml = (parts) => PARTS.map((key) => parts[key]).join('\n');

// --- Test inputs ----------------------------------------------------------------------------------

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Every display string gains markup, a quote and an ampersand. Ids, enums, dates and anything a view
// branches on stay as they are, so the same layout is rendered with unsafe text in it.
const HOSTILE = '<b data-injected="1">"\'&';
const TEXT_KEYS = new Set([
  'title', 'name', 'label', 'text', 'note', 'detail', 'status', 'venue', 'firstName', 'homeCity', 'country', 'place',
  'dateText', 'endText', 'departText', 'returnText', 'lengthText', 'statusText', 'placeLine', 'hint', 'theme', 'value',
  'range', 'condition', 'season', 'headline', 'actionLabel', 'alt', 'full', 'chip', 'saving', 'firstArea', 'lastArea',
  'pace', 'error', 'time', 'firstTime', 'lastTime', 'q',
]);
const URL_KEYS = new Set(['src', 'fallbackSrc', 'link', 'photo']);
function hostile(value, key = '', seen = new Map()) {
  if (typeof value === 'string') {
    if (TEXT_KEYS.has(key) && value !== '') return `${value}${HOSTILE}`;
    if (URL_KEYS.has(key) && value !== '') return `${value}?x="><b data-injected="1">&y='`;
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [k, v] of Object.entries(value)) copy[k] = hostile(v, Array.isArray(value) ? key : k, seen);
  return copy;
}
const injected = (html) => {
  const { root, errors } = parseHtml(html);
  return { errors, found: all(root, '[data-injected]').length + all(root, 'b').filter((el) => 'data-injected' in el.attrs).length };
};

// --- The matrix: four views, every fixture --------------------------------------------------------

describe.each(Object.entries(VIEWS))('view %s', (name, view) => {
  it('exports the view contract', () => {
    expect(view.id).toBe(name);
    expect(typeof view.renderDashboard).toBe('function');
    expect(typeof view.renderTripLanding).toBe('function');
    for (const optional of ['mountDashboard', 'mountTripLanding']) {
      if (optional in view) expect(typeof view[optional]).toBe('function');
    }
  });

  describe.each(Object.keys(DASHBOARD_FIXTURES))('dashboard, fixture %s', (key) => {
    const model = DASHBOARD_FIXTURES[key];
    it('keeps the hook table of 3.3', () => {
      expect(checkDashboardHtml(view.renderDashboard(model, CTX_FIXTURE), model)).toEqual([]);
    });
    it('escapes every value and leaves its input alone', () => {
      const unsafe = deepFreeze(hostile(model));
      const html = view.renderDashboard(unsafe, CTX_FIXTURE);
      expect(injected(html)).toEqual({ errors: [], found: 0 });
      expect(view.renderDashboard(unsafe, CTX_FIXTURE)).toBe(html);
    });
  });

  describe.each(Object.keys(TRIP_FIXTURES))('trip landing, fixture %s', (key) => {
    const model = TRIP_FIXTURES[key];
    it('keeps the hook table of 3.4', () => {
      expect(checkTripLanding(view.renderTripLanding(model, CTX_FIXTURE), model, CTX_FIXTURE)).toEqual([]);
    });
    it('escapes every value and leaves its input alone', () => {
      const unsafe = deepFreeze(hostile(model));
      const parts = view.renderTripLanding(unsafe, CTX_FIXTURE);
      expect(injected(landingHtml(parts))).toEqual({ errors: [], found: 0 });
      expect(landingHtml(view.renderTripLanding(unsafe, CTX_FIXTURE))).toBe(landingHtml(parts));
    });
  });
});

// The drawn half of the Atlas page is a chunk of its own (ruling R40): with it loaded the rules
// below read the whole page (plates, places, passport), not only its head.
await loadAtlasBody();
if (atlas.renderAtlasPage) {
  describe('the atlas page', () => {
    it.each(Object.keys(DASHBOARD_FIXTURES))('fixture %s: one h1, sound markup, nothing injected', (key) => {
      const html = atlas.renderAtlasPage(DASHBOARD_FIXTURES[key], CTX_FIXTURE);
      const { root, errors } = parseHtml(html);
      expect(errors).toEqual([]);
      expect(all(root, 'h1')).toHaveLength(1);
      expect(injected(atlas.renderAtlasPage(deepFreeze(hostile(DASHBOARD_FIXTURES[key])), CTX_FIXTURE))).toEqual({ errors: [], found: 0 });
    });
  });
}

// --- The checks can fail: dashboard ---------------------------------------------------------------

/** Replaces `from` (which must be present) and returns the new markup. */
function swap(html, from, to) {
  const found = typeof from === 'string' ? html.includes(from) : from.test(html);
  if (!found) throw new Error(`test setup: ${from} is not in the markup, so nothing would be broken`);
  return html.replace(from, to);
}
const dash = (key) => ({ model: DASHBOARD_FIXTURES[key], html: stub.renderDashboard(DASHBOARD_FIXTURES[key], CTX_FIXTURE) });
const brokenDashboard = (key, from, to) => {
  const { model, html } = dash(key);
  return checkDashboardHtml(swap(html, from, to), model).join('\n');
};

describe('the dashboard checks fail on broken markup', () => {
  it('passes the untouched stub, so each failure below comes from its one change', () => {
    for (const key of Object.keys(DASHBOARD_FIXTURES)) expect(checkDashboardHtml(dash(key).html, dash(key).model)).toEqual([]);
  });
  it.each([
    ['a second h1', 'ready', '<h2 id="stub-live-h">Happening now</h2>', '<h1>Happening now</h1><h2 id="stub-live-h">x</h2>', /exactly one h1, found 2/],
    ['no h1', 'ready', /<h1 class="stub-title">(.*?)<\/h1>/, '<p>$1</p>', /exactly one h1, found 0/],
    ['the h1 as a region', 'ready', '<h1 class="stub-title">', '<h1 class="stub-title" data-region="lead2">', /h1 itself may not be a region/],
    ['the h1 inside a region', 'ready', /<h1 class="stub-title">(.*?)<\/h1>/, '<div data-region="top"><h1>$1</h1></div>', /h1 may not sit inside a data-region/],
    ['the search field inside a region', 'ready', '<label class="stub-search">', '<label class="stub-search" data-region="search">', /\[data-trip-search\] may not sit inside a data-region/],
    ['the chooser slot inside a region', 'ready', '<div data-slot="chooser"></div>', '<div data-region="pick"><div data-slot="chooser"></div></div>', /chooser"\] may not sit inside a data-region/],
    ['no chooser slot', 'ready', '<div data-slot="chooser"></div>', '', /exactly one chooser slot, found 0/],
    ['a chooser slot away from the h1', 'ready', '<div data-slot="chooser"></div>', '<p>Between</p><div data-slot="chooser"></div>', /directly after the block that holds the h1/],
    ['a chooser slot with content', 'ready', '<div data-slot="chooser"></div>', '<div data-slot="chooser"><p>x</p></div>', /chooser slot is an empty div/],
    ['no import control', 'ready', / data-action="import-trip"/, '', /needs data-action="import-trip"/],
    ['no plan control in the empty state', 'empty', / data-action="new-trip"/, '', /state empty: needs data-action="new-trip"/],
    ['a missing region', 'ready', ' data-region="next"', '', /needs data-region="next", even when empty/],
    ['a region used twice', 'ready', '<div data-region="next">', '<div data-region="trips">', /data-region="trips" appears more than once/],
    ['a load error without role alert', 'error', ' role="alert"', '', /role="alert" panel holding data-action="retry-trips"/],
    ['a stale banner without a retry', 'stale', / data-action="retry-trips"/, '', /role="status" banner holding data-action="retry-trips"/],
    ['a card link with the today href', 'ready', 'class="trip-card-link" href="#/trip/s-seville"', 'class="trip-card-link" href="#/trip/s-seville?today=1"', /card link must use the neutral href/],
    ['a card without its link', 'ready', /<a class="trip-card-link" href="#\/trip\/s-rome"[^>]*><\/a>/, '', /s-rome: needs exactly one a\.trip-card-link, found 0/],
    ['a card link without its label', 'ready', ' aria-label="Open Rome in November"', '', /aria-label="Open Rome in November"/],
    ['a card without data-key', 'ready', ' data-key="s-rome"', '', /s-rome: data-key must equal the plan id/],
    ['a trip title that is not an h3', 'ready', /<h3 class="stub-trip-title">Rome in November<\/h3>/, '<p>Rome in November</p>', /s-rome: the trip title must be an h3/],
    ['an unknown plan', 'ready', 'data-trip-id="s-rome"', 'data-trip-id="s-nowhere"', /s-nowhere: no such plan in the model/],
    ['a live plan without Open today', 'ready', / data-now-trip="s-seville"/, '', /live plan s-seville: needs an "Open today" link/],
    ['Open today on the neutral href', 'ready', '<a href="#/trip/s-seville?today=1" data-now-trip', '<a href="#/trip/s-seville" data-now-trip', /data-now-trip link must use todayHref/],
    ['Whole trip on the neutral href', 'ready', '<a href="#/trip/s-seville?today=0"', '<a href="#/trip/s-seville"', /"whole trip" control must use wholeHref/],
    ['an upcoming plan that is not drawn', 'noLive', /<li class="stub-trip" data-trip-id="s-vancouver"[\s\S]*?<\/li>/, '', /plan s-vancouver \(upcoming\) is not drawn/],
    ['a generating card with a link', 'generating', '<p>Still being planned.', '<a href="#/trip/s-dublin">Open</a><p>Still being planned.', /a generating plan has no link/],
    ['a generating card without its state', 'generating', ' data-trip-state="generating"', '', /needs data-trip-state="generating"/],
    ['a generating card without role status', 'generating', ' data-trip-state="generating" role="status"', ' data-trip-state="generating"', /generating card needs role="status"/],
    ['a failed plan without Try again', 'failed', / data-retry-trip="s-istanbul"/, '', /failed plan needs data-retry-trip/],
    ['a failed plan of the user without Delete', 'failed', / data-delete-trip="s-istanbul"/, '', /own needs data-delete-trip/],
    ['Delete on a failed plan that is shared', 'failedShared', ' data-retry-trip="s-istanbul"', ' data-retry-trip="s-istanbul" data-delete-trip="s-istanbul"', /no delete on a plan shared with the user/],
    ['a pending briefing with no reserved space', 'briefingPending', / data-briefing="pending"/g, '', /s-seville: its briefing is awaited/],
    ['a pending mark on a settled card', 'ready', 'data-key="s-rome"', 'data-key="s-rome" data-briefing="pending"', /s-rome: data-briefing is for a plan whose briefing is still awaited/],
    ['a legacy cover without its fallback', 'ready', / data-fallback="[^"]*250px-Sevilla[^"]*"/, '', /s-seville: the cover needs data-fallback/],
    ['a hop that is not a button', 'ready', /<button type="button" data-action="plan-city" data-city="Porto"[^>]*>(.*?)<\/button>/, '<span data-action="plan-city" data-city="Porto">$1</span>', /plan-city" must be a button with data-city/],
    ['a hop missing from the hops region', 'ready', / data-action="plan-city" data-city="Porto"/, '', /hop Porto: no plan-city button/],
    ['a filter chip outside its region', 'ready', ' data-region="filters"', '', /data-filter chips belong in the filters region/],
    ['a month group without a key', 'ready', ' data-key="past-2026-11"', '', /every details group needs data-key/],
    ['a section without a labelled heading', 'ready', ' aria-labelledby="stub-live-h"', '', /every section needs aria-labelledby/],
    ['a board table without rows', 'ready', '<ul class="stub-list" data-region="live">', '<ul class="stub-list" data-region="live" role="table">', /role="table" needs role="row" parts/],
    ['an inline event handler', 'ready', '<h2 id="stub-live-h">', '<h2 id="stub-live-h" onclick="go()">', /inline event handler onclick/],
    ['a style attribute with a free value', 'ready', '<h2 id="stub-live-h">', '<h2 id="stub-live-h" style="--bg: url(x.png)">', /style may only set a custom property to a number or a token name/],
    ['a style attribute that sets a real property', 'ready', '<h2 id="stub-live-h">', '<h2 id="stub-live-h" style="position: fixed">', /style may only set a custom property/],
    ['a javascript link', 'ready', '<a href="#/trip/s-seville?today=0"', '<a href="javascript:void(0)"', /href must be a hash route or an http\(s\) URL/],
    ['a classic layout class', 'ready', '<ul class="stub-list" data-region="live">', '<ul class="stub-list trip-grid" data-region="live">', /classic layout class trip-grid/],
    ['an unclosed element', 'ready', '</header>', '', /markup: <header> is never closed/],
    ['an unescaped ampersand', 'ready', 'Vienna &amp; Budapest</h3>', 'Vienna & Budapest</h3>', /markup: bare & in text/],
    ['a script element', 'ready', '<span class="ui-probe" hidden></span>', '<script>track()</script>', /may not emit <script>/],
  ])('%s', (_name, fixture, from, to, message) => {
    expect(brokenDashboard(fixture, from, to)).toMatch(message);
  });

  it('accepts a style attribute that holds a number or a token', () => {
    const { model, html } = dash('ready');
    const styled = swap(html, '<h2 id="stub-live-h">', '<h2 id="stub-live-h" style="--focus-y: 38%; --day-color: var(--day-3); --cols: 3">');
    expect(checkDashboardHtml(styled, model)).toEqual([]);
  });
  it('reads a filtered model: every past row must be drawn', () => {
    const html = swap(dash('filtered').html, /<li class="stub-trip" data-trip-id="s-vienna-budapest"[\s\S]*?<\/li>/, '');
    expect(checkDashboardHtml(html, DASHBOARD_FIXTURES.filtered).join('\n')).toMatch(/plan s-vienna-budapest \(past\) is not drawn/);
  });
  it('sees an injected element, so the escaping test above can fail', () => {
    expect(injected('<svg viewBox="0 0 1 1"><title>Rome<b data-injected="1">x</b></title><path d="M0 0"/></svg>').found).toBeGreaterThan(0);
    expect(injected('<svg viewBox="0 0 1 1"><title>Rome &amp; Lazio</title><path d="M0 0"/></svg>')).toEqual({ errors: [], found: 0 });
    expect(injected('<p>Rome<b data-injected="1">x</b></p>').found).toBeGreaterThan(0);
    expect(injected('<p title="Rome"><b data-injected="1">">x</b></p>').found).toBeGreaterThan(0);
    expect(injected('<p>Rome &lt;b data-injected=&quot;1&quot;&gt;</p>')).toEqual({ errors: [], found: 0 });
  });
});

// --- The checks can fail: trip landing ------------------------------------------------------------

const land = (key) => ({ model: TRIP_FIXTURES[key], parts: stub.renderTripLanding(TRIP_FIXTURES[key], CTX_FIXTURE) });
const brokenLanding = (key, change) => {
  const { model, parts } = land(key);
  return checkTripLanding({ ...parts, ...change(parts) }, model, CTX_FIXTURE).join('\n');
};
const NOTES = CTX_FIXTURE.slots.notes;

describe('the trip landing checks fail on broken parts', () => {
  it('takes the optional day panel flag, on or off', () => {
    for (const dayAside of [true, false]) expect(checkTripLanding({ ...land('upcoming').parts, dayAside }, land('upcoming').model, CTX_FIXTURE)).toEqual([]);
  });
  it('passes the untouched stub, so each failure below comes from its one change', () => {
    for (const key of Object.keys(TRIP_FIXTURES)) expect(checkTripLanding(land(key).parts, land(key).model, CTX_FIXTURE)).toEqual([]);
  });
  it.each([
    ['a missing part', 'upcoming', () => ({ between: undefined }), /between: must be a string/],
    ['an unknown part', 'upcoming', () => ({ footer: '' }), /footer: not a part of the contract/],
    ['an unknown section to open', 'upcoming', () => ({ openSections: ['checklist'] }), /openSections: any of flights, transport, entry, accommodation/],
    ['a width that is not a number', 'upcoming', () => ({ openSectionsMinWidth: '768' }), /openSectionsMinWidth: a width in px/],
    ['a day panel flag that is not a boolean', 'upcoming', () => ({ dayAside: 'yes' }), /dayAside: true or false, or left out/],
    ['a bar that is not one header', 'upcoming', (p) => ({ bar: `${p.bar}<div></div>` }), /bar: must be exactly one <header class="tv-bar">/],
    ['a back control that goes elsewhere', 'upcoming', (p) => ({ bar: swap(p.bar, '<a href="#/" class="tv-back"', '<a href="#/atlas" class="tv-back"') }), /needs one <a href="#\/" class="tv-back">/],
    ['a back control without the word Trips', 'upcoming', (p) => ({ bar: swap(p.bar, '>Trips</a>', '>Back</a>') }), /visible word Trips/],
    ['no PDF status line', 'upcoming', (p) => ({ bar: swap(p.bar, ' data-pdf-status', '') }), /needs one <p data-pdf-status role="status">/],
    ['no bar-actions region', 'upcoming', (p) => ({ bar: swap(p.bar, ' data-region="bar-actions"', '') }), /needs one data-region="bar-actions"/],
    ['a tabs slot with content', 'upcoming', (p) => ({ bar: swap(p.bar, '<div data-tabs-slot data-slot-from="1024"></div>', '<div data-tabs-slot data-slot-from="1024">x</div>') }), /a tabs slot is empty/],
    ['a tabs slot inside a region', 'upcoming', (p) => ({ bar: swap(swap(p.bar, '<div data-tabs-slot data-slot-from="1024"></div>', ''), 'data-region="bar-actions">', 'data-region="bar-actions"><div data-tabs-slot data-slot-from="1024"></div>') }), /\[data-tabs-slot\] may not sit inside a data-region/],
    ['a tabs slot outside the bar', 'upcoming', (p) => ({ hero: `${p.hero}<div data-tabs-slot data-slot-from="1024"></div>` }), /a tabs slot may sit only in bar, found in hero/],
    ['a second bar in the hero', 'upcoming', (p) => ({ hero: `<header class="tv-bar"></header>${p.hero}` }), /\.tv-bar may sit only in bar, found in hero/],
    ['a second tab list in the intro', 'upcoming', (p) => ({ planIntro: `${p.planIntro}<nav class="td-tabs"></nav>` }), /\.td-tabs may sit only in tabs, found in planIntro/],
    ['a wrapped tab list', 'upcoming', (p) => ({ tabs: `<div>${p.tabs}</div>` }), /tabs: must be exactly one \.td-tabs element/],
    ['a tab list without the Prep tab', 'upcoming', (p) => ({ tabs: swap(p.tabs, /<button[^>]*data-tab="prep"[^>]*>Prep<\/button>/, '') }), /needs \.td-tab\[data-tab\] for plan, spending, prep, towns/],
    ['two active tabs', 'upcoming', (p) => ({ tabs: swap(p.tabs, 'class="td-tab" data-tab="prep"', 'class="td-tab td-tab--active" data-tab="prep"') }), /exactly one \.td-tab--active, found 2/],
    ['a tab list without its role', 'upcoming', (p) => ({ tabs: swap(p.tabs, ' role="tablist"', '') }), /\.td-tabs needs role="tablist"/],
    ['the h1 in the bar', 'upcoming', (p) => ({ bar: swap(p.bar, /<p class="stub-bar-title">(.*?)<\/p>/, '<h1>$1</h1>'), hero: swap(p.hero, /<h1 class="stub-trip-title">(.*?)<\/h1>/, '<p>$1</p>') }), /the h1 belongs in hero, found in bar/],
    ['two h1 elements', 'upcoming', (p) => ({ planIntro: `<h1>Plan</h1>${p.planIntro}` }), /needs exactly one h1, found 2/],
    ['an h1 that does not carry the title', 'upcoming', (p) => ({ hero: swap(p.hero, /<h1 class="stub-trip-title">.*?<\/h1>/, '<h1>Your trip</h1>') }), /needs the only h1, carrying model\.title/],
    ['no hero root id', 'upcoming', (p) => ({ hero: swap(p.hero, ' id="td-hero"', '') }), /needs one element with id="td-hero"/],
    ['a photo frame that cannot be carried over', 'noCover', (p) => ({ hero: swap(p.hero, ' data-carry="cover"', '') }), /photo frame needs data-carry="cover", photo or placeholder/],
    ['no hero-status region', 'upcoming', (p) => ({ hero: swap(p.hero, ' data-region="hero-status"', '') }), /needs one data-region="hero-status"/],
    ['a hero-status region around the h1', 'upcoming', (p) => ({ hero: swap(swap(p.hero, ' data-region="hero-status"', ''), '<div class="stub-hero" id="td-hero">', '<div class="stub-hero" id="td-hero"><div data-region="hero-status"><h1>x</h1></div>') }), /hero-status may not wrap the h1 or the image/],
    ['the notes left out', 'upcoming', (p) => ({ hero: swap(p.hero, NOTES, '') }), /ctx\.slots\.notes must be placed exactly once, found 0/],
    ['the notes placed twice', 'upcoming', (p) => ({ hero: `${p.hero}${NOTES}` }), /ctx\.slots\.notes must be placed exactly once, found 2/],
    ['the notes placed in the intro', 'upcoming', (p) => ({ hero: swap(p.hero, NOTES, ''), planIntro: `${NOTES}${p.planIntro}` }), /ctx\.slots\.notes must be placed exactly once, found 0/],
    ['the notes inside a region', 'upcoming', (p) => ({ hero: swap(p.hero, NOTES, `<div data-region="notes">${NOTES}</div>`) }), /ctx\.slots\.notes may not sit inside a data-region/],
    ['a map slot inside a region', 'upcoming', (p) => ({ between: swap(p.between, '<div class="stub-map">', '<div class="stub-map" data-region="map">') }), /\[data-map-slot\] may not sit inside a data-region/],
    ['no map slot although points exist', 'upcoming', (p) => ({ between: swap(p.between, '<div data-map-slot></div>', '') }), /needs one or two map slots, found 0/],
    ['a map slot with content', 'upcoming', (p) => ({ between: swap(p.between, '<div data-map-slot></div>', '<div data-map-slot><p>Map</p></div>') }), /a map slot is empty/],
    ['two map slots with different widths', 'upcoming', (p) => ({ between: swap(p.between, '<div data-map-slot></div>', '<div data-map-slot data-map-from="1024"></div><div data-map-slot data-map-below="900"></div>') }), /two map slots must split the widths at one px value/],
    ['an action that cannot be reached', 'upcoming', (p) => ({ bar: swap(p.bar, / data-action="regenerate"/, '') }), /action regenerate: not reachable/],
    ['Edit trip shown to a viewer', 'viewer', (p) => ({ hero: `${p.hero}<button type="button" data-action="edit">Edit trip</button>` }), /action edit: drawn although the model does not offer it/],
    ['Reader view linked on a failed plan', 'failed', (p) => ({ hero: `${p.hero}<a href="#/trip/s-marrakech/read">Reader view</a>` }), /action read-view: linked although the model does not offer it/],
    ['an action that is not a button', 'upcoming', (p) => ({ bar: swap(p.bar, /<button type="button" data-action="share" data-focus-key="bar-share">Share<\/button>/, '<span data-action="share">Share</span>') }), /action share: must be a button/],
    ['a bar action outside bar-actions', 'upcoming', (p) => ({ bar: swap(p.bar, '<p class="stub-bar-title">', '<button type="button" data-action="share">Share</button><p class="stub-bar-title">') }), /the share control belongs inside bar-actions/],
    ['a day without a jump', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, ' data-day-jump="3"', '') }), /day 4: no data-day-jump="3"/],
    ['a jump to a day that does not exist', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, ' data-day-jump="3"', ' data-day-jump="30"') }), /data-day-jump="30" is not a day row/],
    ['no day index region', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, ' data-region="dayindex"', '') }), /needs data-region="dayindex"/],
    ['no glance region', 'upcoming', (p) => ({ hero: swap(p.hero, ' data-region="glance"', '') }), /needs data-region="glance"/],
    ['no readiness region', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, ' data-region="readiness"', '') }), /needs data-region="readiness"/],
    ['no map caption region', 'upcoming', (p) => ({ between: swap(p.between, ' data-region="map-caption"', '') }), /needs data-region="map-caption"/],
    ['a readiness row without its jump', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, / data-section-jump="flights" aria-controls="td-section-flights"/, '') }), /readiness row travel: no data-section-jump="flights"/],
    ['a section jump without aria-controls', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, ' aria-controls="td-section-flights"', '') }), /needs aria-controls="td-section-flights"/],
    ['a section jump to an unknown section', 'upcoming', (p) => ({ planIntro: swap(p.planIntro, 'data-section-jump="flights" aria-controls="td-section-flights"', 'data-section-jump="visa" aria-controls="td-section-visa"') }), /data-section-jump="visa" is not a section/],
    ['a day card drawn by the landing', 'upcoming', (p) => ({ between: `${p.between}<div class="td-day-card"></div>` }), /the landing does not draw td-day-card/],
    ['a chat class in the landing', 'upcoming', (p) => ({ planOutro: `${p.planOutro}<div class="td-chat-fab"></div>` }), /the landing does not draw td-chat-fab/],
    ['a classic layout class', 'upcoming', (p) => ({ hero: swap(p.hero, 'class="stub-hero"', 'class="stub-hero td-hero"') }), /classic layout class td-hero/],
    ['an id used twice', 'upcoming', (p) => ({ planOutro: `${p.planOutro}<p id="td-hero"></p>` }), /id "td-hero" is used twice/],
    ['an unclosed part', 'upcoming', (p) => ({ planIntro: `<div>${p.planIntro}` }), /planIntro: markup: <div> is never closed/],
  ])('%s', (_name, fixture, change, message) => {
    expect(brokenLanding(fixture, change)).toMatch(message);
  });

  it('accepts two map slots that split the widths at one value', () => {
    const { model, parts } = land('upcoming');
    const hero = `${parts.hero}<div data-map-slot data-map-from="1024"></div>`;
    const between = swap(parts.between, '<div data-map-slot></div>', '<div data-map-slot data-map-below="1024"></div>');
    expect(checkTripLanding({ ...parts, hero, between }, model, CTX_FIXTURE)).toEqual([]);
  });
  it('accepts an action that appears twice, inline and in the menu', () => {
    const { parts } = land('upcoming');
    expect(parts.bar.match(/data-action="share"/g)).toHaveLength(2);
  });
});
