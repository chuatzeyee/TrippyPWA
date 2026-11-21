// The pure parts of the trip landing controller (TASKS F11a and F11b, blueprint 3.1 and 4.2). Written
// before the code. Every trip, name and text here is invented.
import { describe, it, expect } from 'vitest';
import {
  notesHtml, assemblePlanPanel, assembleSidePanels, assembleLandingWrap,
  shouldJumpToToday, isRebuild, placeAnchor, openSectionFrom, nextTabIndex, landingSkeletonHtml, classicSkeletonHtml, statusCardHtml, buildLanding, redrawLanding,
  showTab, bindTabKeys, landingParts, patchesEveryRegion, REFRESH_PARTS, entryInputFrom, ENTRY_TIMEOUT_MS, tabsDocked, mapSlotIndex, mapSlotOptions,
  spendingFigures, budgetRingHtml, clockKey, prepSlotHtml, sameCover,
} from './trip-landing.js';
import { renderTripLanding } from '../views/fixtures/stub-view/trip.js';
import { checkTripLanding } from '../views/fixtures/checks/trip-contract.js';

const LANDING = Object.freeze({
  bar: '<header class="tv-bar">BAR</header>', hero: '<div id="td-hero">HERO</div>', tabs: '<nav class="td-tabs">TABS</nav>',
  planIntro: '<p>INTRO</p>', between: '<p>BETWEEN</p>', planOutro: '<p>OUTRO</p>', openSections: [], openSectionsMinWidth: 0,
});
const order = (html, ...marks) => marks.map((mark) => html.indexOf(mark));
const ascending = (list) => list.every((n, i) => n >= 0 && (i === 0 || n > list[i - 1]));

describe('notesHtml', () => {
  it('prints the classic three lines byte for byte when nothing was saved at a known time', () => {
    expect(notesHtml({ stale: false, statusHtml: '<b>S</b>' })).toBe(
      '\n      <div class="td-status-slot"><b>S</b></div>\n      <div class="td-photo-status" role="status" hidden></div>',
    );
    expect(notesHtml({ stale: true, statusHtml: '' })).toBe(
      '<div class="td-stale-note" role="status">Offline, showing your last saved copy</div>\n      <div class="td-status-slot"></div>\n      <div class="td-photo-status" role="status" hidden></div>',
    );
  });
  it('adds when the copy was saved, in the clock format of the user', () => {
    const saved = new Date(2027, 2, 9, 18, 5).toISOString();
    const html = notesHtml({ stale: true, cachedAt: saved, statusHtml: '', locale: 'en-GB' });
    expect(html).toContain('<div class="td-stale-note" role="status">Offline, showing your copy saved 9 Mar at 6:05 PM</div>');
  });
  it('ignores a saved time when the copy is fresh, and one that is not a time', () => {
    expect(notesHtml({ stale: false, cachedAt: '2027-03-09T10:00:00Z', statusHtml: '' })).not.toContain('td-stale-note');
    expect(notesHtml({ stale: true, cachedAt: 'soon', statusHtml: '' })).toContain('Offline, showing your last saved copy</div>');
  });
  it('holds no banned glyph', () => {
    expect(notesHtml({ stale: true, cachedAt: new Date(2027, 0, 1, 0, 0).toISOString(), statusHtml: '', locale: 'en-GB' })).not.toMatch(/[–—·•…]/);
  });
});

describe('assemblePlanPanel', () => {
  const classic = {
    landing: null, sectionCardsHtml: '<i>SECTIONS</i>', dayCardsHtml: '<i>DAYS</i>', tz: 'Europe/Lisbon',
    sidebarHtml: '<aside>SIDE</aside>', backButtonHtml: '<button>BACK</button>', deleteButtonHtml: '<button>DEL</button>',
  };
  it('gives the classic panel byte for byte when there is no landing', () => {
    expect(assemblePlanPanel(classic)).toBe(`<div class="td-tab-panel td-tab-panel--active" data-panel="plan">
        <div class="td-square-itinerary square-only" id="td-square-itinerary"></div>
        <div class="td-body scroll-only">
          <aside>SIDE</aside>
          <div class="td-main">
            <div class="td-day-grid" data-tz="Europe/Lisbon">
          <i>SECTIONS</i><i>DAYS</i>
            </div>
          </div>
        </div>
        <div class="td-plan-footer">
          <button>BACK</button>
          <button>DEL</button>
        </div>
      </div>`);
  });
  it('keeps the classic whitespace when there is no delete button and no timezone', () => {
    const html = assemblePlanPanel({ ...classic, tz: '', deleteButtonHtml: '' });
    expect(html).toContain('<div class="td-day-grid" data-tz="">');
    expect(html).toContain('<button>BACK</button>\n          \n        </div>\n      </div>');
  });
  it('puts the landing slots around the same cards, in the order of blueprint 3.1', () => {
    const html = assemblePlanPanel({ ...classic, landing: LANDING });
    expect(ascending(order(html, 'tv-landing tv-landing--intro', 'INTRO', 'td-body', 'td-main', 'td-day-grid', 'SECTIONS', 'tv-between', 'BETWEEN', 'DAYS', 'tv-landing tv-landing--outro', 'OUTRO'))).toBe(true);
    expect(html).toMatch(/^<div class="td-tab-panel td-tab-panel--active" data-panel="plan" role="tabpanel" id="td-panel-plan" aria-labelledby="td-tab-plan">/);
  });
  it('draws no sidebar, square host or plan footer in view mode', () => {
    const html = assemblePlanPanel({ ...classic, landing: LANDING });
    for (const gone of ['SIDE', 'td-square-itinerary', 'td-plan-footer', 'BACK', 'DEL', 'scroll-only']) expect(html).not.toContain(gone);
  });
  it('leaves the between wrapper out when the view has nothing for it', () => {
    expect(assemblePlanPanel({ ...classic, landing: { ...LANDING, between: '  ' } })).not.toContain('tv-between');
  });
  it('escapes the timezone', () => {
    expect(assemblePlanPanel({ ...classic, tz: '"><script>' })).toContain('data-tz="&quot;&gt;&lt;script&gt;"');
    expect(assemblePlanPanel({ ...classic, landing: LANDING, tz: '"><script>' })).toContain('data-tz="&quot;&gt;&lt;script&gt;"');
  });
});

describe('assembleSidePanels', () => {
  const parts = { spendingHtml: '<i>SPEND</i>', quickChecklistHtml: '<i>QUICK</i>', bookingChecklistHtml: '<i>BOOK</i>' };
  it('gives the three classic panels byte for byte when there is no landing', () => {
    expect(assembleSidePanels({ landing: null, ...parts })).toBe(`<div class="td-tab-panel" data-panel="spending">
        <div class="td-spending-grid">
          <i>SPEND</i>
        </div>
      </div>

      <div class="td-tab-panel" data-panel="prep">
        <div class="td-prep-grid">
          <div id="td-visa-slot"></div>
          <i>QUICK</i>
          <i>BOOK</i>
        </div>
      </div>

      <div class="td-tab-panel" data-panel="towns">
        <div class="td-towns" id="td-towns"></div>
      </div>`);
  });
  it('names each panel for its tab and hides it in view mode', () => {
    const html = assembleSidePanels({ landing: LANDING, ...parts });
    for (const key of ['spending', 'prep', 'towns']) {
      expect(html).toContain(`<div class="td-tab-panel" data-panel="${key}" role="tabpanel" id="td-panel-${key}" aria-labelledby="td-tab-${key}" hidden>`);
    }
    expect(ascending(order(html, 'td-spending-grid', 'SPEND', 'td-prep-grid', 'td-visa-slot', 'QUICK', 'BOOK', 'id="td-towns"'))).toBe(true);
  });
});

describe('assembleLandingWrap', () => {
  const html = assembleLandingWrap({ landing: LANDING, planPanelHtml: '<div>PLAN</div>', sidePanelsHtml: '<div>SIDEPANELS</div>', footHtml: '<footer class="tv-foot">FOOT</footer>' });
  it('orders the children of the wrap as blueprint 3.1 draws them', () => {
    expect(ascending(order(html, 'BAR', 'tv-landing tv-landing--hero', 'HERO', 'TABS', 'PLAN', 'SIDEPANELS', 'FOOT'))).toBe(true);
  });
  it('keeps the bar and the tab list outside every wrapper, so they can pin for the whole page', () => {
    expect(html.startsWith('<header class="tv-bar">BAR</header>')).toBe(true);
    expect(html).toContain('<div class="tv-landing tv-landing--hero"><div id="td-hero">HERO</div></div>\n<nav class="td-tabs">TABS</nav>');
  });
});

describe('placeAnchor', () => {
  const port = { scrollY: 900, height: 800 };
  const panel = { key: 'panel:plan', top: -700, bottom: 4000 };
  it('is null at the top of the page, with no block in sight, and for input that is not a list', () => {
    expect(placeAnchor([{ key: 'day:0', top: 300, bottom: 500 }], { scrollY: 0, height: 800 })).toBe(null);
    expect(placeAnchor([{ key: 'day:0', top: 900, bottom: 1100 }, { key: 'panel:prep', top: 0, bottom: 0 }], port)).toBe(null);
    expect(placeAnchor(null, port)).toBe(null);
    expect(placeAnchor([null, { key: 'day:1', top: NaN, bottom: 5 }], port)).toBe(null);
  });
  it('marks the card that was jumped to, not what is left of the card before it', () => {
    const boxes = [panel, { key: 'day:4', top: -300, bottom: -206 }, { key: 'day:5', top: -94, bottom: 0.3 }, { key: 'day:6', top: 0.3, bottom: 2400 }];
    expect(placeAnchor(boxes, port)).toEqual({ key: 'day:6', offset: 0 });
  });
  it('marks the long card the user is reading inside when the next one starts low or out of sight', () => {
    const inside = [panel, { key: 'day:2', top: -1200, bottom: 520 }, { key: 'day:3', top: 532, bottom: 640 }];
    expect(placeAnchor(inside, port)).toEqual({ key: 'day:2', offset: -1200 });
    expect(placeAnchor([panel, { key: 'section:transport', top: -40, bottom: 1900 }], port)).toEqual({ key: 'section:transport', offset: -40 });
  });
  it('marks a tab panel only while no card is in sight', () => {
    expect(placeAnchor([{ key: 'panel:plan', top: 0, bottom: 0 }, { key: 'panel:spending', top: -350, bottom: 900 }], port)).toEqual({ key: 'panel:spending', offset: -350 });
    expect(placeAnchor([{ key: 'panel:plan', top: -200, bottom: 3000 }, { key: 'day:0', top: 1400, bottom: 1500 }], port)).toEqual({ key: 'panel:plan', offset: -200 });
  });
});

describe('shouldJumpToToday', () => {
  const on = { openTodayFirst: true };
  const off = { openTodayFirst: false };
  it('jumps for today=1, whatever the pref and the phase', () => {
    for (const prefs of [on, off]) for (const phase of ['live', 'upcoming', 'past', 'undated']) expect(shouldJumpToToday('today=1', prefs, phase)).toBe(true);
  });
  it('never jumps for today=0, the whole-trip link', () => {
    expect(shouldJumpToToday('today=0', on, 'live')).toBe(false);
    expect(shouldJumpToToday(new URLSearchParams('today=0&open=flights'), on, 'live')).toBe(false);
  });
  it('with no today in the address, jumps only when the pref is on and the plan is live', () => {
    expect(shouldJumpToToday('', on, 'live')).toBe(true);
    expect(shouldJumpToToday(null, on, 'live')).toBe(true);
    expect(shouldJumpToToday('open=flights', on, 'live')).toBe(true);
    expect(shouldJumpToToday('', off, 'live')).toBe(false);
    for (const phase of ['upcoming', 'past', 'undated', undefined]) expect(shouldJumpToToday('', on, phase)).toBe(false);
    expect(shouldJumpToToday('', null, 'live')).toBe(false);
  });
  it('reads any other value of today as absent', () => {
    expect(shouldJumpToToday('today=yes', off, 'live')).toBe(false);
    expect(shouldJumpToToday('today=', on, 'live')).toBe(true);
  });
  it('never jumps on a reload', () => {
    expect(shouldJumpToToday('today=1', on, 'live', { reload: true })).toBe(false);
    expect(shouldJumpToToday('', on, 'live', { reload: true })).toBe(false);
    expect(shouldJumpToToday('today=1', on, 'live', { reload: false })).toBe(true);
  });
});

describe('isRebuild', () => {
  it('counts a redraw of the route as a rebuild only when a draw of the same trip was finished since the last navigation', () => {
    expect(isRebuild(true, 'trip-1', 'trip-1')).toBe(true);
    expect(isRebuild(true, null, 'trip-1')).toBe(false); // the first draw was overtaken: this one is the first
    expect(isRebuild(true, 'trip-2', 'trip-1')).toBe(false);
    expect(isRebuild(false, 'trip-1', 'trip-1')).toBe(false);
    expect(isRebuild(undefined, undefined, undefined)).toBe(false);
    expect(isRebuild(true, '', '')).toBe(false);
  });
  it('lets the first finished draw make the today and open= jumps a redraw would drop', () => {
    const on = { openTodayFirst: true };
    expect(shouldJumpToToday('', on, 'live', { reload: isRebuild(true, null, 'trip-1') })).toBe(true);
    expect(shouldJumpToToday('today=1', on, 'upcoming', { reload: isRebuild(true, null, 'trip-1') })).toBe(true);
    expect(shouldJumpToToday('', on, 'live', { reload: isRebuild(true, 'trip-1', 'trip-1') })).toBe(false);
  });
});

describe('openSectionFrom', () => {
  it('reads a section the page can open', () => {
    for (const name of ['flights', 'transport', 'entry', 'accommodation', 'checklist']) expect(openSectionFrom(`today=0&open=${name}`)).toBe(name);
    expect(openSectionFrom(new URLSearchParams('open=flights'))).toBe('flights');
  });
  it('gives nothing for anything else', () => {
    for (const query of ['', null, 'open=', 'open=spending', 'open=flights"]', 'open=__proto__']) expect(openSectionFrom(query)).toBe('');
  });
});

describe('nextTabIndex', () => {
  it('moves with the arrow keys and wraps at both ends', () => {
    expect(nextTabIndex('ArrowRight', 0, 4)).toBe(1);
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 4)).toBe(3);
    expect(nextTabIndex('ArrowLeft', 2, 4)).toBe(1);
  });
  it('goes to the ends with Home and End', () => {
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 1, 4)).toBe(3);
  });
  it('answers -1 for every other key and for an empty list', () => {
    for (const key of ['Enter', ' ', 'Tab', 'ArrowDown', 'a']) expect(nextTabIndex(key, 1, 4)).toBe(-1);
    expect(nextTabIndex('ArrowRight', 0, 0)).toBe(-1);
  });
});

// The classic tab row with no landing, as plain objects: the four tabs and their panels (gate G2).
function classicTabRow() {
  const node = (classes, dataset) => {
    const names = new Set(classes);
    const attrs = new Map();
    return {
      dataset, keydown: [],
      classList: { toggle: (name, on) => (on ? names.add(name) : names.delete(name)), contains: (name) => names.has(name) },
      setAttribute: (name, value) => attrs.set(name, String(value)),
      getAttribute: (name) => attrs.get(name) ?? null,
      hasAttribute: (name) => attrs.has(name),
      addEventListener(type, fn) { if (type === 'keydown') this.keydown.push(fn); },
      closest: () => ({ dataset: {} }),
    };
  };
  const keys = ['plan', 'spending', 'prep', 'towns'];
  const tabs = keys.map((key, i) => node(i === 0 ? ['td-tab', 'td-tab--active'] : ['td-tab'], { tab: key }));
  const panels = keys.map((key, i) => node(i === 0 ? ['td-tab-panel', 'td-tab-panel--active'] : ['td-tab-panel'], { panel: key }));
  const container = { querySelectorAll: (selector) => (selector === '.td-tab' ? tabs : selector === '.td-tab-panel' ? panels : []) };
  return { container, tabs, panels };
}
const tabStops = (tabs) => tabs.map((tab) => tab.getAttribute('tabindex'));
const activeOf = (nodes, name) => nodes.filter((el) => el.classList.contains(name)).map((el) => el.dataset.tab ?? el.dataset.panel);

describe('showTab and bindTabKeys on the classic tab row', () => {
  it('bindTabKeys starts the roving tabindex on the active tab and listens for keys on every tab', () => {
    const { container, tabs } = classicTabRow();
    bindTabKeys(container);
    expect(tabStops(tabs)).toEqual(['0', '-1', '-1', '-1']);
    expect(tabs.map((tab) => tab.keydown.length)).toEqual([1, 1, 1, 1]);
  });
  it('showTab moves the roving tabindex with the tab once it is bound', () => {
    const { container, tabs, panels } = classicTabRow();
    bindTabKeys(container);
    expect(showTab(container, 'prep')).toBe(true);
    expect(tabStops(tabs)).toEqual(['-1', '-1', '0', '-1']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false']);
    expect([activeOf(tabs, 'td-tab--active'), activeOf(panels, 'td-tab-panel--active')]).toEqual([['prep'], ['prep']]);
  });
  it('showTab adds no tabindex to a row that was never bound: square mode keeps the classic markup', () => {
    const { container, tabs, panels } = classicTabRow();
    expect(showTab(container, 'spending')).toBe(true);
    expect(tabs.filter((tab) => tab.hasAttribute('tabindex'))).toEqual([]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
    expect([activeOf(tabs, 'td-tab--active'), activeOf(panels, 'td-tab-panel--active')]).toEqual([['spending'], ['spending']]);
  });
  it('showTab answers false for a tab that is not there and changes nothing', () => {
    const { container, tabs } = classicTabRow();
    expect(showTab(container, 'map')).toBe(false);
    expect(activeOf(tabs, 'td-tab--active')).toEqual(['plan']);
  });
});

describe('landingSkeletonHtml', () => {
  const html = landingSkeletonHtml();
  it('is a loading status with a working link back to the trips', () => {
    expect(html).toMatch(/<div class="td-wrap td-skel td-skel--landing" role="status" aria-busy="true">/);
    expect(html).toContain('<a href="#/" class="td-skel-back">Trips</a>');
    expect(html).toContain('<span class="td-skel-label">Loading trip</span>');
  });
  it('shows a bar, a hero block and three rows, and no heading', () => {
    expect(html.match(/class="td-skel-day"/g)).toHaveLength(3);
    expect(html).toContain('td-skel-bar');
    expect(html).toContain('td-skel-hero');
    expect(html).not.toMatch(/<h1|data-view/);
  });
});

describe('classicSkeletonHtml', () => {
  it('is the loading screen the classic page always had, byte for byte', () => {
    const day = `
    <div class="td-skel-day">
      <div class="td-skel-num skel-shimmer"></div>
      <div class="td-skel-lines">
        <div class="td-skel-line skel-shimmer"></div>
        <div class="td-skel-line td-skel-line--short skel-shimmer"></div>
      </div>
    </div>`;
    expect(classicSkeletonHtml()).toBe(`
    <div class="td-wrap td-skel" role="status" aria-busy="true">
      <span class="td-skel-label">Loading trip</span>
      <div class="td-skel-topbar">
        <div class="td-skel-tabs skel-shimmer"></div>
        <div class="td-skel-actions skel-shimmer"></div>
      </div>
      <div class="td-skel-hero skel-shimmer"></div>
      <div class="td-skel-days">${day}${day}${day}</div>
    </div>`);
  });
});

describe('statusCardHtml', () => {
  const days = [{ id: 'd1' }];
  it('draws nothing for a settled plan that has days', () => {
    expect(statusCardHtml({ status: 'ready', itinerary_days: days })).toBe('');
    expect(statusCardHtml({ itinerary_days: days }, { canRetry: true })).toBe('');
  });
  it('says a plan is being built, with other words when the old days are still shown', () => {
    expect(statusCardHtml({ status: 'generating', itinerary_days: [] })).toBe(`
      <div class="td-status-card" role="status" data-trip-status="generating">
        <span class="td-status-spinner" aria-hidden="true"></span>
        <div class="td-status-text">
          <strong>Building your itinerary</strong>
          <p>This usually takes 1 to 2 minutes. You can leave this page and come back.</p>
        </div>
      </div>`);
    const again = statusCardHtml({ status: 'generating', itinerary_days: days });
    expect(again).toContain('<strong>Building a new itinerary</strong>');
    expect(again).toContain("<p>You're seeing your current plan until the new one is ready.</p>");
  });
  it('offers the retry of a failed plan to its owner only', () => {
    expect(statusCardHtml({ status: 'failed', itinerary_days: [] }, { canRetry: true })).toBe(`
      <div class="td-status-card td-status-card--failed" role="alert" data-trip-status="failed">
        <div class="td-status-text">
          <strong>We couldn't build this itinerary</strong>
          <p>Something went wrong while planning this trip.</p>
        </div>
        <button type="button" class="btn btn--primary btn--pill btn--sm" data-action="retry-generation">Try again</button>
      </div>`);
    const other = statusCardHtml({ status: 'failed', itinerary_days: days }, { canRetry: false });
    expect(other).not.toContain('retry-generation');
    expect(other).toContain("<strong>We couldn't build a new itinerary</strong>");
    expect(other).toContain('<p>Your current plan is unchanged.</p>');
    expect(other).toMatch(/<\/div>\n {8}\n {6}<\/div>$/);
  });
  it('offers Edit and regenerate for a plan with no days, unless it was imported', () => {
    expect(statusCardHtml({ status: 'ready', itinerary_days: [] })).toBe(`
      <div class="td-status-card" data-trip-status="empty">
        <div class="td-status-text">
          <strong>No days planned yet</strong>
          <p>Regenerate the itinerary to fill in your days.</p>
        </div>
        <button type="button" class="btn btn--primary btn--pill btn--sm" data-action="regenerate-empty">Edit and regenerate</button>
      </div>`);
    const imported = statusCardHtml({ wizard_state: { imported: true } });
    expect(imported).toContain('<p>This trip was imported without any days.</p>');
    expect(imported).not.toContain('regenerate-empty');
  });
});

describe('landingParts', () => {
  it('names what each caller refreshes (blueprint 4.2, "Keeping the landing true")', () => {
    expect(landingParts('totals')).toEqual(['glance', 'dayindex', 'map', 'days']);
    expect(landingParts('photos')).toEqual(['map', 'dayindex', 'days']);
    expect(landingParts('ticks')).toEqual(['readiness', 'glance', 'hero-status']);
    expect(landingParts('entry')).toEqual(['readiness', 'glance', 'hero-status']);
    expect(landingParts('role')).toEqual(['bar-actions']);
    expect(landingParts('clock')).toEqual(['hero-status', 'dayindex']);
    expect(landingParts('profile')).toEqual(['hero-status', 'glance', 'readiness', 'dayindex', 'days']);
    // Ruling R41: late data patches every region the view drew; a change made on the page patches the named ones.
    for (const change of ['profile', 'entry']) expect(patchesEveryRegion(change)).toBe(true);
    for (const change of ['totals', 'photos', 'failed', 'ticks', 'role', 'clock', '', null, undefined]) expect(patchesEveryRegion(change)).toBe(false);
  });
  it('a plan that stopped also loses the Ready fact of the glance row, which is counted from readiness', () => {
    expect(landingParts('failed')).toEqual(['hero-status', 'bar-actions', 'readiness', 'glance']);
  });
  it('a plan that is being planned again (Try again) refreshes what a plan that stopped does', () => {
    expect(landingParts('status')).toEqual(landingParts('failed'));
    expect(patchesEveryRegion('status')).toBe(false);
  });
  it('names only parts refreshLanding can refresh', () => {
    expect(REFRESH_PARTS).toEqual(['hero-status', 'glance', 'dayindex', 'readiness', 'bar-actions', 'map-caption', 'map', 'days']);
    for (const change of ['totals', 'photos', 'failed', 'ticks', 'entry', 'role', 'clock']) {
      expect(landingParts(change).length).toBeGreaterThan(0);
      for (const part of landingParts(change)) expect(REFRESH_PARTS).toContain(part);
    }
  });
  it('gives nothing for a change it does not know, and lists nobody can change', () => {
    for (const change of ['', 'cover', 'toString', '__proto__', null, undefined]) expect(landingParts(change)).toEqual([]);
    expect(Object.isFrozen(landingParts('totals'))).toBe(true);
    expect(Object.isFrozen(REFRESH_PARTS)).toBe(true);
  });
});

describe('entryInputFrom', () => {
  const plan = Object.freeze({ passports: ['SG'], countries: [] });
  it('passes a plan on as the card computed it', () => {
    expect(entryInputFrom({ plan, reason: null }, 120)).toBe(plan);
  });
  it('says there is no passport when the card asks for one', () => {
    expect(entryInputFrom({ plan: null, reason: 'no-passport' }, 120)).toEqual({ reason: 'no-passport' });
  });
  it('says the check failed when the card could not compute a plan, with or without a reason', () => {
    expect(entryInputFrom({ plan: null, reason: 'failed' }, 120)).toEqual({ reason: 'failed' });
    expect(entryInputFrom({ plan: null, reason: null }, 120)).toEqual({ reason: 'failed' });
    expect(entryInputFrom({ plan: null, reason: 'anything else' }, 120)).toEqual({ reason: 'failed' });
  });
  it('is null only while the check is running (ruling R28)', () => {
    expect(entryInputFrom(null, 0)).toBeNull();
    expect(entryInputFrom(undefined, ENTRY_TIMEOUT_MS - 1)).toBeNull();
  });
  it('reads as failed once 8 seconds have passed without an answer', () => {
    expect(ENTRY_TIMEOUT_MS).toBe(8000);
    expect(entryInputFrom(null, 8000)).toEqual({ reason: 'failed' });
    expect(entryInputFrom(null, 60000)).toEqual({ reason: 'failed' });
  });
  it('lets an answer that came late win over the timeout', () => {
    expect(entryInputFrom({ plan, reason: null }, 60000)).toBe(plan);
    expect(entryInputFrom({ plan: null, reason: 'no-passport' }, 60000)).toEqual({ reason: 'no-passport' });
  });
  it('takes the arguments of onPlan as a list too', () => {
    expect(entryInputFrom([plan, null], 0)).toBe(plan);
    expect(entryInputFrom([null, 'no-passport'], 0)).toEqual({ reason: 'no-passport' });
  });
  it('does not take a time that is not a number for a timeout', () => {
    expect(entryInputFrom(null, NaN)).toBeNull();
    expect(entryInputFrom(null, undefined)).toBeNull();
  });
});

describe('tabsDocked', () => {
  it('docks the tab list in the bar from the width the slot names', () => {
    expect(tabsDocked('1024', 1024)).toBe(true);
    expect(tabsDocked('1024', 1440)).toBe(true);
    expect(tabsDocked('1024', 1023)).toBe(false);
    expect(tabsDocked(640, 700)).toBe(true);
  });
  it('never docks without a slot, and always in a slot that names no width', () => {
    expect(tabsDocked(null, 1920)).toBe(false);
    expect(tabsDocked(undefined, 1920)).toBe(false);
    expect(tabsDocked('', 320)).toBe(true);
    expect(tabsDocked('wide', 320)).toBe(true);
  });
});

describe('mapSlotIndex', () => {
  const two = [{ from: null, below: '1024' }, { from: '1024', below: null }];
  it('picks the first slot whose range holds the width: from is inclusive, below is exclusive', () => {
    expect(mapSlotIndex(two, 390)).toBe(0);
    expect(mapSlotIndex(two, 1023)).toBe(0);
    expect(mapSlotIndex(two, 1024)).toBe(1);
    expect(mapSlotIndex([{ from: '640', below: '1024' }, { from: '0' }], 800)).toBe(0);
  });
  it('takes a slot with no range at every width', () => {
    expect(mapSlotIndex([{}], 320)).toBe(0);
    expect(mapSlotIndex([{ from: '', below: 'x' }], 2000)).toBe(0);
  });
  it('answers -1 when no slot fits, so the map leaves the page', () => {
    expect(mapSlotIndex([{ from: '1024' }], 800)).toBe(-1);
    expect(mapSlotIndex([], 800)).toBe(-1);
    expect(mapSlotIndex(null, 800)).toBe(-1);
  });
});

describe('mapSlotOptions (ruling R29)', () => {
  it('gives the defaults for a slot with no attribute', () => {
    expect(mapSlotOptions({})).toEqual({ fullButton: true });
    expect(mapSlotOptions(null)).toEqual({ fullButton: true });
  });
  it('leaves the full-map button to the view for data-map-full="off"', () => {
    expect(mapSlotOptions({ full: 'off' }).fullButton).toBe(false);
    expect(mapSlotOptions({ full: 'on' }).fullButton).toBe(true);
  });
  it('names the caption element of the view', () => {
    expect(mapSlotOptions({ caption: 'atlas-map-words' })).toEqual({ fullButton: true, captionId: 'atlas-map-words' });
    expect(mapSlotOptions({ caption: '  ' })).toEqual({ fullButton: true });
  });
});

describe('spendingFigures', () => {
  const figure = (amount, code, text) => ({ amount, code, text });
  const cost = (over = {}) => ({
    basis: 'perPerson', local: figure(6347, 'HKD', 'HKD 6,347'), home: figure(1099, 'SGD', 'S$1,099'), homeFirst: true, excluded: 0,
    budget: figure(8000, 'HKD', 'HKD 8,000'), budgetHome: figure(1385, 'SGD', 'S$1,385'), ...over,
  });
  it('leads with the home figure, with "about", when the user wants home currency first', () => {
    const out = spendingFigures(cost());
    expect(out.lead).toBe('about S$1,099');
    expect(out.other).toBe('HKD 6,347');
    expect(out.basis).toBe('Per person, activities only');
    expect(out.ring).toEqual({ spent: 6347, budget: 8000, spentHtml: 'about S$1,099', budgetHtml: 'about S$1,385', homeHtml: 'HKD 6,347' });
  });
  it('leads with the trip currency otherwise and keeps "about" on the converted one', () => {
    const out = spendingFigures(cost({ homeFirst: false }));
    expect(out.lead).toBe('HKD 6,347');
    expect(out.other).toBe('about S$1,099');
    expect(out.ring.budgetHtml).toBe('HKD 8,000');
  });
  it('has one figure when nothing converts and no budget when none is set', () => {
    const out = spendingFigures(cost({ home: null, homeFirst: false, budget: null, budgetHome: null }));
    expect(out.other).toBe('');
    expect(out.ring).toEqual({ spent: 6347, budget: 0, spentHtml: 'HKD 6,347', budgetHtml: '', homeHtml: '' });
  });
  it('escapes what it hands to the ring', () => {
    expect(spendingFigures(cost({ homeFirst: false, home: null, local: figure(5, 'XXX', '<b>5') })).ring.spentHtml).toBe('&lt;b&gt;5');
  });
  it('is empty for a plan with no cost', () => {
    expect(spendingFigures(null)).toEqual({ lead: '', other: '', basis: 'Per person, activities only', ring: { spent: 0, budget: 0, spentHtml: '', budgetHtml: '', homeHtml: '' } });
  });
});

describe('budgetRingHtml', () => {
  it('is the ring the classic Spending tab always drew, byte for byte', () => {
    expect(budgetRingHtml({ spent: 50, budget: 200, spentHtml: '$50', budgetHtml: '$200', homeHtml: '≈ S$68 SGD' })).toBe(`
    <div class="td-budget-ring">
      <svg class="td-budget-ring-svg" viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-inset)" stroke-width="10"></circle>
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--terracotta)" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="81.7 326.7"
          transform="rotate(-90 60 60)"></circle>
      </svg>
      <div class="td-budget-ring-center">
        <span class="td-budget-ring-spent">$50</span>
        <span class="td-budget-ring-of">of $200</span>
        <span class="td-budget-ring-home">≈ S$68 SGD</span>
      </div>
    </div>`);
  });
  it('leaves the budget and the second figure out when there is none, with the classic blank lines', () => {
    expect(budgetRingHtml({ spent: 50, budget: 0, spentHtml: '$50', budgetHtml: 'Free', homeHtml: '' })).toContain(`<span class="td-budget-ring-spent">$50</span>
        
        
      </div>`);
    expect(budgetRingHtml({ spent: 50, budget: 0, spentHtml: '$50' })).toContain('stroke-dasharray="0.0 326.7"');
  });
  it('fills the ring and turns it red when the plan is over the budget', () => {
    const over = budgetRingHtml({ spent: 300, budget: 200, spentHtml: '$300', budgetHtml: '$200', homeHtml: '' });
    expect(over).toContain('stroke="var(--error)"');
    expect(over).toContain('stroke-dasharray="326.7 326.7"');
  });
});

describe('prepSlotHtml', () => {
  const ready = {
    items: [
      { area: 'travel', target: 'flights', label: 'Flights', state: 'todo', status: 'Not booked yet', detail: '', actionLabel: 'See flights', source: 'data', tickKey: 'flights', due: null },
      { area: 'entry', target: 'entry', label: 'Entry requirements', state: 'checking', status: 'Checking', detail: '', actionLabel: 'See the details', source: 'data', tickKey: null, due: null },
    ],
    done: 0, total: 2, todo: 1, pending: 1, headline: '0 of 2 ready', perDevice: true, collapsed: false,
  };
  it('is one region around the Trip prep card, so a tick can patch it in place', () => {
    const html = prepSlotHtml(ready);
    expect(html.startsWith('<div class="td-prep-slot" data-region="prep-card">')).toBe(true);
    expect(html.match(/data-region=/g)).toHaveLength(1);
    expect(html).toContain('0 of 2 ready');
    expect(html).toContain('data-tick-key="flights"');
    expect(html).toContain('data-section-jump="entry"');
  });
  it('keeps the region when there is nothing to prepare, so a later answer has a place to go', () => {
    expect(prepSlotHtml(null)).toBe('<div class="td-prep-slot" data-region="prep-card"></div>');
  });
});

describe('sameCover', () => {
  it('compares what a frame shows: the photo address, or none', () => {
    const photo = { kind: 'photo', src: 'https://img.example/a.jpg' };
    expect(sameCover(photo, { ...photo, focusY: 20 })).toBe(true);
    expect(sameCover(photo, { kind: 'photo', src: 'https://img.example/b.jpg' })).toBe(false);
    expect(sameCover({ kind: 'none', src: '' }, { kind: 'none', src: '' })).toBe(true);
    expect(sameCover({ kind: 'none', src: '' }, photo)).toBe(false);
    expect(sameCover(null, undefined)).toBe(true);
  });
});

// A plan in Porto: an owner, a destination (so the entry row applies), two days, one placed stop.
const PORTO = Object.freeze({
  id: 't-9', user_id: 'me', title: 'Ten days of soup', status: 'ready', start_date: '2027-04-02', end_date: '2027-04-04', travelers: 2,
  budget_currency: 'EUR', budget_currency_symbol: '€', budget_daily: 100,
  wizard_state: Object.freeze({ destination: Object.freeze({ name: 'Porto', country: 'Portugal', flag: 'pt', lat: 41.15, lng: -8.61, currencyCode: 'EUR', currencySymbol: '€', timezone: 'Europe/Lisbon' }) }),
  extras: Object.freeze({ flights: Object.freeze({ outbound: Object.freeze({ route: 'Singapore (SIN) to Porto (OPO)' }) }) }),
  itinerary_days: Object.freeze([
    Object.freeze({ id: 'd1', day_number: 1, date: '2027-04-02', title: 'Arrive <b>', activities: Object.freeze([
      Object.freeze({ id: 'a1', title: 'Soup', start_time: '12:30', cost_amount: 12, cost_currency: 'EUR', latitude: 41.14, longitude: -8.61, photo_url: 'https://img.example/soup.jpg' }),
      Object.freeze({ id: 'a2', title: 'More soup', start_time: '19:00', cost_amount: 8, cost_currency: 'EUR' }),
    ]) }),
    Object.freeze({ id: 'd2', day_number: 2, date: '2027-04-03', title: '', activities: Object.freeze([]) }),
  ]),
});
const STUB = Object.freeze({ id: 'stub', renderTripLanding });
const NOTES = '<div class="td-status-slot"></div><div class="td-photo-status" role="status" hidden></div>';
const landingOpts = (over = {}) => ({
  userId: 'me', role: null, now: new Date('2027-03-10T09:00:00Z'), notes: NOTES, ticks: { quick: {}, checklist: {}, entryDone: {} },
  profile: { home_city: 'Singapore', home_flag: 'sg', home_currency: 'SGD', home_currency_symbol: 'S$', nationality: 'SG' },
  prefs: Object.freeze({ openTodayFirst: true, homeCurrencyFirst: true, showVenuePhotos: true }), theme: 'dark', reducedMotion: false, animate: true, baseUrl: '/', ...over,
});
const viewOf = (viewMod, trip = PORTO, entry = null) => ({ tripId: trip.id, trip, viewMod, cleanups: [], landing: null, entry });
const entryRow = (view) => view.landing.model.readiness.items.find((item) => item.area === 'entry');

describe('buildLanding on the frozen stub view', () => {
  it('answers null without a view, so the page renders classic', () => {
    expect(buildLanding(viewOf(null), PORTO, landingOpts())).toBeNull();
    expect(buildLanding(viewOf({ id: 'x' }), PORTO, landingOpts())).toBeNull();
  });
  it('gives the parts of the view and keeps the model and the context on the view object', () => {
    const view = viewOf(STUB);
    const parts = buildLanding(view, PORTO, landingOpts());
    expect(Object.keys(parts).sort()).toEqual(['bar', 'between', 'dayAside', 'hero', 'openSections', 'openSectionsMinWidth', 'planIntro', 'planOutro', 'tabs']);
    expect(view.landing.parts).toBe(parts);
    expect(view.landing.model.id).toBe('t-9');
    expect(view.landing.ctx.slots.notes).toBe(NOTES);
    expect(view.landing.ctx.animate).toBe(true);
    expect(Object.isFrozen(view.landing.ctx.prefs)).toBe(true);
    expect(view.landing.dayExtras).toHaveLength(PORTO.itinerary_days.length);
    for (const block of view.landing.dayExtras) expect(block).toContain('data-day-extras=');
  });
  it('builds the day panels only for a view that asks for them (dayAside), one a day, none for a day without stops', () => {
    const plain = { id: 'plain', renderTripLanding: (model, ctx) => { const { dayAside, ...parts } = renderTripLanding(model, ctx); void dayAside; return parts; } };
    const off = viewOf(plain);
    buildLanding(off, PORTO, landingOpts());
    expect(off.landing.dayAsides).toEqual(['', '']);
    const no = viewOf({ id: 'no', renderTripLanding: (model, ctx) => ({ ...renderTripLanding(model, ctx), dayAside: false }) });
    buildLanding(no, PORTO, landingOpts());
    expect(no.landing.dayAsides).toEqual(['', '']);
    const on = viewOf({ id: 'on', renderTripLanding: (model, ctx) => ({ ...renderTripLanding(model, ctx), dayAside: true }) });
    buildLanding(on, PORTO, landingOpts());
    expect(on.landing.dayAsides).toHaveLength(2);
    expect(on.landing.dayAsides[0]).toContain('<aside class="tv-day-aside" data-day-aside="0"');
    expect(on.landing.dayAsides[0]).toContain('data-stop-jump="a2"');
    expect(on.landing.dayAsides[0]).toContain('1 of 2 stops on the map');
    expect(on.landing.dayAsides[1]).toBe('');
  });
  it('builds the real model: glance facts, readiness, the map points, the cost and the owner actions', () => {
    const view = viewOf(STUB);
    buildLanding(view, PORTO, landingOpts());
    const { model } = view.landing;
    expect(model.title).toBe('Ten days of soup');
    expect(model.role).toBe('owner');
    expect(model.actions.map((action) => action.key)).toEqual(['share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete']);
    expect(model.glance.map((fact) => fact.key)).toEqual(expect.arrayContaining(['ready', 'stops', 'cost']));
    expect(model.readiness.items.map((item) => item.area)).toEqual(['travel', 'entry']);
    expect(model.map.points).toHaveLength(1);
    expect(model.cost.local.amount).toBe(20);
    expect(model.days.map((row) => row.stops)).toEqual([2, 0]);
  });
  it('keeps the prep card, the foot and what a refresh needs beside the parts', () => {
    const view = viewOf(STUB);
    buildLanding(view, PORTO, landingOpts());
    expect(view.landing.prepHtml).toContain('data-region="prep-card"');
    expect(view.landing.prepHtml).toContain(view.landing.model.readiness.headline);
    expect(view.landing.footHtml.startsWith('<footer class="tv-foot')).toBe(true);
    expect(view.landing.footHtml).toContain('OpenStreetMap');
    expect(view.landing.role).toBeNull();
    expect(view.landing.facts.userId).toBe('me');
  });
  it('reads the entry check from the view: checking, then what the card answered', () => {
    const checking = viewOf(STUB);
    buildLanding(checking, PORTO, landingOpts());
    expect(entryRow(checking)).toMatchObject({ state: 'checking', status: 'Checking' });
    const noPassport = viewOf(STUB, PORTO, { plan: null, reason: 'no-passport' });
    buildLanding(noPassport, PORTO, landingOpts());
    expect(entryRow(noPassport)).toMatchObject({ state: 'todo', status: 'Add your passport' });
    const failed = viewOf(STUB, PORTO, { plan: null, reason: 'failed' });
    buildLanding(failed, PORTO, landingOpts());
    expect(entryRow(failed)).toMatchObject({ state: 'todo', status: 'Could not check' });
  });
  it('counts a tick of this device', () => {
    const view = viewOf(STUB);
    buildLanding(view, PORTO, landingOpts({ ticks: { quick: { flights: true }, checklist: {}, entryDone: {} } }));
    expect(view.landing.model.readiness.done).toBe(1);
    expect(view.landing.prepHtml).toContain('1 of 2 ready');
  });
  it('carries no venue photo when the user turned them off', () => {
    const on = viewOf(STUB);
    buildLanding(on, PORTO, landingOpts());
    expect(on.landing.model.days[0].photos).toHaveLength(1);
    const off = viewOf(STUB);
    buildLanding(off, PORTO, landingOpts({ prefs: Object.freeze({ showVenuePhotos: false }) }));
    expect(off.landing.model.days[0].photos).toEqual([]);
    expect(off.landing.dayExtras[0]).not.toContain('soup.jpg');
  });
  it('keeps the contract of blueprint 3.4 with the stub view, for an owner, a viewer and an editor', () => {
    for (const who of [{ userId: 'me' }, { userId: 'someone', role: 'viewer' }, { userId: 'someone', role: 'editor' }]) {
      const view = viewOf(STUB);
      const parts = buildLanding(view, PORTO, landingOpts(who));
      expect(checkTripLanding(parts, view.landing.model, view.landing.ctx)).toEqual([]);
    }
  });
  it('gives someone else the actions of the role, and Edit trip only to an editor', () => {
    const keys = (who) => { const view = viewOf(STUB); buildLanding(view, PORTO, landingOpts(who)); return view.landing.model.actions.map((action) => action.key); };
    expect(keys({ userId: 'someone', role: null })).toEqual(['pdf', 'read-view']);
    expect(keys({ userId: 'someone', role: 'viewer' })).toEqual(['pdf', 'read-view']);
    expect(keys({ userId: 'someone', role: 'editor' })).toEqual(['share', 'pdf', 'edit', 'read-view']);
  });
  it('carries one h1 with the title and a day row for every itinerary day', () => {
    const view = viewOf(STUB);
    const parts = buildLanding(view, PORTO, landingOpts());
    expect(parts.hero.match(/<h1/g)).toHaveLength(1);
    expect(parts.hero).toContain('>Ten days of soup</h1>');
    expect(parts.planIntro).toContain('data-day-jump="0"');
    expect(parts.planIntro).toContain('data-day-jump="1"');
    expect(parts.planIntro).toContain('Arrive &lt;b&gt;');
  });
  it('registers cleanups on the view and hands patched regions to the listeners', () => {
    const view = viewOf(STUB);
    buildLanding(view, PORTO, landingOpts());
    const seen = [];
    view.landing.ctx.onCleanup(() => seen.push('clean'));
    view.landing.ctx.onPatched((region) => seen.push(region));
    view.landing.patched('glance', null);
    view.cleanups.forEach((fn) => fn());
    expect(seen).toEqual(['glance', 'clean']);
  });
  it('answers null when the renderer throws or returns something that is not the six parts', () => {
    const errors = [];
    const onError = (error) => errors.push(error.message);
    expect(buildLanding(viewOf({ id: 'bad', renderTripLanding: () => { throw new Error('no'); } }), PORTO, landingOpts({ onError }))).toBeNull();
    expect(buildLanding(viewOf({ id: 'bad', renderTripLanding: () => ({ bar: '' }) }), PORTO, landingOpts({ onError }))).toBeNull();
    expect(buildLanding(viewOf({ id: 'bad', renderTripLanding: () => null }), PORTO, landingOpts({ onError }))).toBeNull();
    expect(errors).toHaveLength(3);
  });
  it('does not change the trip', () => {
    expect(() => buildLanding(viewOf(STUB), PORTO, landingOpts())).not.toThrow();
  });
});

describe('redrawLanding', () => {
  const built = (trip = PORTO, over = {}) => { const view = viewOf(STUB, trip); buildLanding(view, trip, landingOpts(over)); return view; };
  const facts = (over = {}) => ({ now: new Date('2027-03-10T09:00:00Z'), role: null, entry: null, ticks: { quick: {}, checklist: {}, entryDone: {} }, ...over });
  it('draws the open plan again from view.trip, with no motion, and changes nothing on the view', () => {
    const view = built();
    const before = view.landing.model;
    const next = redrawLanding(view, facts());
    expect(next.model).not.toBe(before);
    expect(next.model).toEqual(before);
    expect(next.parts.hero).toBe(view.landing.parts.hero);
    expect(view.landing.model).toBe(before);
    const seen = [];
    redrawLanding({ ...view, viewMod: { id: 'probe', renderTripLanding: (model, ctx) => { seen.push(ctx.animate); return renderTripLanding(model, ctx); } } }, facts());
    expect(seen).toEqual([false]);
  });
  it('follows the plan as it is now: a stop removed changes the stops, the cost and the pins', () => {
    const view = built();
    view.trip = { ...PORTO, itinerary_days: [{ ...PORTO.itinerary_days[0], activities: [PORTO.itinerary_days[0].activities[1]] }, PORTO.itinerary_days[1]] };
    const next = redrawLanding(view, facts());
    expect(next.model.days[0].stops).toBe(1);
    expect(next.model.cost.local.amount).toBe(8);
    expect(next.model.map.points).toEqual([]);
    expect(next.dayExtras[0]).not.toBe(view.landing.dayExtras[0]);
    expect(next.footHtml).not.toContain('OpenStreetMap');
  });
  it('draws the day panels again from the plan and the ticks as they are now', () => {
    const trip = { ...PORTO, extras: { ...PORTO.extras, bookingChecklist: [{ group: 'Must Book Ahead', items: [{ label: 'Soup table', day: 1 }] }] } };
    const view = viewOf({ id: 'on', renderTripLanding: (model, ctx) => ({ ...renderTripLanding(model, ctx), dayAside: true }) }, trip);
    buildLanding(view, trip, landingOpts());
    expect(view.landing.dayAsides[0]).toContain('data-state="todo">To book<');
    const ticked = redrawLanding(view, facts({ ticks: { quick: { reservations: true }, checklist: {}, entryDone: {} } }));
    expect(ticked.dayAsides[0]).toContain('data-state="done">Booked<');
    view.trip = { ...trip, itinerary_days: [{ ...trip.itinerary_days[0], activities: [trip.itinerary_days[0].activities[1]] }, trip.itinerary_days[1]] };
    const next = redrawLanding(view, facts());
    expect(next.dayAsides[0]).not.toContain('data-stop-jump="a1"');
    expect(next.dayAsides[0]).toContain('data-stop-jump="a2"');
    expect(redrawLanding(built(), facts()).dayAsides.every((html) => html === '' || html.includes('tv-day-aside'))).toBe(true);
  });
  it('takes the role, the entry answer and the ticks it is given', () => {
    const view = built(PORTO, { userId: 'someone' });
    expect(view.landing.model.actions.map((action) => action.key)).not.toContain('edit');
    const next = redrawLanding(view, facts({ role: 'editor', entry: { reason: 'failed' }, ticks: { quick: { flights: true }, checklist: {}, entryDone: {} } }));
    expect(next.model.actions.map((action) => action.key)).toContain('edit');
    expect(next.model.readiness.items.find((item) => item.area === 'entry').status).toBe('Could not check');
    expect(next.model.readiness.done).toBe(1);
    expect(next.prepHtml).toContain('Could not check');
  });
  it('shows a plan that failed while open: Planning stopped, no edit action, nothing to prepare', () => {
    const view = built();
    view.trip = { ...PORTO, status: 'failed' };
    const next = redrawLanding(view, facts());
    expect(next.model.statusText).toBe('Planning stopped');
    expect(next.model.actions.map((action) => action.key)).toEqual(['read-view', 'delete']);
    expect(next.model.readiness).toBeNull();
    expect(next.parts.hero).toContain('Planning stopped');
  });
  it('answers null without a landing, and when the renderer throws', () => {
    expect(redrawLanding(viewOf(STUB), facts())).toBeNull();
    const view = built();
    expect(redrawLanding({ ...view, viewMod: { id: 'bad', renderTripLanding: () => { throw new Error('no'); } } }, facts())).toBeNull();
  });
});

describe('clockKey', () => {
  const at = (iso, trip = PORTO) => { const view = viewOf(STUB, trip); buildLanding(view, trip, landingOpts({ now: new Date(iso) })); return clockKey(view.landing.model); };
  it('stays the same while nothing a clock can change has changed', () => {
    expect(at('2027-03-10T09:00:00Z')).toBe(at('2027-03-10T09:01:00Z'));
    expect(at('2027-04-02T10:00:00Z')).toBe(at('2027-04-02T10:01:00Z'));
  });
  it('changes with the date in the plan: the countdown, then the day of the plan', () => {
    expect(at('2027-03-10T09:00:00Z')).not.toBe(at('2027-03-11T09:00:00Z'));
    expect(at('2027-04-02T10:00:00Z')).not.toBe(at('2027-04-03T10:00:00Z'));
    expect(at('2027-04-04T10:00:00Z')).not.toBe(at('2027-04-05T10:00:00Z'));
  });
  it('changes when the next stop moves on', () => {
    expect(at('2027-04-02T11:00:00Z')).not.toBe(at('2027-04-02T13:00:00Z'));
  });
  it('is a string for a plan with nothing live', () => {
    expect(typeof clockKey(null)).toBe('string');
  });
});
