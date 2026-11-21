// css/views/shared/trip.css and trip-reset.css: the facts the trip page depends on (blueprint 8.1,
// 8.3). The selector shape and the tier weights are checked by css/views/css-rules.test.js; this file
// checks what the rules say. Owner: F6.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCss } from '../fixtures/checks/css-spec.js';
import { fileProblems } from '../fixtures/checks/css-tiers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TRIP = 'css/views/shared/trip.css';
const RESET = 'css/views/shared/trip-reset.css';
const read = (file) => readFileSync(ROOT + file, 'utf8');
const trip = parseCss(read(TRIP));
const reset = parseCss(read(RESET));
const common = parseCss(read('css/views/shared/common.css'));
const SIX = '.td-wrap[data-view][data-view][data-view][data-view][data-view][data-view]';
const WRAP = '[data-view]:where(.td-wrap)';
const PINNED = 'var(--tv-top) + var(--tv-pinned-h)';

/** Every declaration of the rules that have this exact selector, as { prop: value }, later ones winning. */
const declared = (sheet, selector, at = null) => Object.fromEntries(sheet.rules
  .filter((rule) => rule.selectors.includes(selector) && (at === null || rule.at.join(' ') === at))
  .flatMap((rule) => rule.declarations.map((declaration) => [declaration.prop, declaration.value])));
const rulesWith = (sheet, text) => sheet.rules.filter((rule) => rule.selectors.some((selector) => selector.includes(text)));
const squash = (value) => String(value ?? '').replace(/\s+/g, ' ');

describe('both sheets', () => {
  it('keep the selector rules of their tier', () => {
    expect(fileProblems(TRIP, read(TRIP))).toEqual([]);
    expect(fileProblems(RESET, read(RESET))).toEqual([]);
    expect(trip.errors).toEqual([]);
    expect(reset.errors).toEqual([]);
  });
  it('write motion only for people who have not asked for less', () => {
    for (const sheet of [trip, reset]) {
      for (const rule of sheet.rules) {
        const moves = rule.declarations.some((declaration) => /^(transition|animation)(-|$)/.test(declaration.prop) && !/^none$|^0s$/.test(declaration.value));
        if (moves) expect(rule.at.join(' ')).toContain('prefers-reduced-motion: no-preference');
      }
    }
  });
  it('colour with tokens: no hex colour outside a custom property', () => {
    for (const sheet of [trip, reset]) {
      for (const rule of sheet.rules) {
        for (const { prop, value } of rule.declarations) if (!prop.startsWith('--')) expect(value, `${rule.selectors[0]} ${prop}`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      }
    }
  });
});

describe('trip.css', () => {
  it('sets the layout variables of blueprint 8.3 on the trip root, with their defaults', () => {
    const vars = declared(trip, WRAP, '');
    expect(vars['--tv-max']).toBe('1180px');
    expect(vars['--tv-top']).toBe('env(safe-area-inset-top, 0px)');
    expect(vars['--tv-day-gap']).toBe('12px');
    expect(vars['--tv-day-pad']).toMatch(/^0(px)?$/);
    expect(vars['--tv-pinned-h']).toBeTruthy();
    expect(vars['max-width']).toBe('var(--tv-max)');
  });
  it('leaves --gutter and --dv-max to common.css, where they are 16 px, 24 px from 768 px, and 1180 px', () => {
    for (const rule of trip.rules) for (const { prop } of rule.declarations) expect(['--gutter', '--dv-max']).not.toContain(prop);
    expect(declared(common, '[data-view]', '')['--gutter']).toBe('16px');
    expect(declared(common, '[data-view]', '@media (min-width: 768px)')['--gutter']).toBe('24px');
    expect(declared(common, '[data-view]', '')['--dv-max']).toBe('1180px');
    // #app already pads every page (12 px, 24 px from 768 px): the root adds only what is left of the gutter.
    expect(squash(declared(trip, WRAP, '').padding)).toContain('calc(var(--gutter) - var(--tv-app-pad))');
    expect(declared(trip, WRAP, '')['--tv-app-pad']).toBe('var(--sp-3)');
    expect(declared(trip, WRAP, '@media (min-width: 768px)')['--tv-app-pad']).toBe('var(--sp-6)');
  });
  it('mirrors the side padding #app gives every page, so a change there is noticed here', () => {
    const base = parseCss(read('css/base.css'));
    expect(declared(base, '#app', '').padding).toBe('0 var(--sp-3)');
    expect(declared(base, '#app', '@media (min-width: 768px)').padding).toBe('0 var(--sp-6)');
  });
  it('pins the bar at --tv-top, above the open day header and below the chat panel', () => {
    const bar = declared(trip, `${WRAP} > :where(.tv-bar)`);
    expect(bar.position).toBe('sticky');
    expect(bar.top).toBe('var(--tv-top)');
    expect(squash(bar['z-index'])).toBe('calc(var(--z-sticky) + 10)');
  });
  it('pins the tab list under whatever else is pinned, from --tv-top and --tv-pinned-h', () => {
    const tabs = declared(trip, `${WRAP} > :where(.td-tabs)`);
    expect(tabs.position).toBe('sticky');
    expect(squash(tabs.top)).toBe('calc(var(--tv-top) + var(--tv-pinned-h) - var(--tv-tabs-h))');
    expect(squash(tabs['z-index'])).toMatch(/^calc\(var\(--z-sticky\) \+ \d+\)$/);
    expect(declared(trip, WRAP)['--tv-tabs-h']).toMatch(/^\d+px$/);
  });
  it('hangs everything pinned under the bar from --tv-bar-h, which keeps 56 px until the bar is measured (ruling R31)', () => {
    const vars = declared(trip, WRAP, '');
    expect(vars['--tv-bar-h']).toBe('56px');
    expect(squash(vars['--tv-pinned-h'])).toBe('calc(var(--tv-bar-h) + var(--tv-tabs-h))');
    expect(declared(trip, '[data-view]:where(.td-wrap:has(> .tv-bar .td-tabs))')).toEqual({ '--tv-pinned-h': 'var(--tv-bar-h)' });
    // Only the root declares the variable: a second declaration would fight the measured value.
    const setters = trip.rules.filter((rule) => rule.declarations.some((declaration) => declaration.prop === '--tv-bar-h'));
    expect(setters.flatMap((rule) => rule.selectors)).toEqual([WRAP]);
    expect(read(RESET)).not.toContain('--tv-bar-h');
  });
  it('never sizes the bar from the measured height: its min-height has a variable of its own', () => {
    expect(declared(trip, WRAP, '')['--tv-bar-min-h']).toBe('56px');
    expect(declared(trip, `${WRAP} :where(.tv-bar)`)['min-height']).toBe('var(--tv-bar-min-h)');
    for (const sheet of [trip, reset]) {
      for (const rule of sheet.rules) {
        for (const { prop, value } of rule.declarations) {
          if (/^(min-|max-)?(height|block-size)$/.test(prop)) expect(value, `${rule.selectors[0]} ${prop}`).not.toContain('--tv-bar-h');
        }
      }
    }
  });
  it('lets a crowded bar wrap, so no control ends up off the screen', () => {
    const bar = declared(trip, `${WRAP} :where(.tv-bar)`);
    expect(bar.display).toBe('flex');
    expect(bar['flex-wrap']).toBe('wrap');
    const actions = declared(trip, `${WRAP} :where(.tv-bar-actions)`);
    expect(actions['flex-wrap']).toBe('wrap');
    expect(actions['max-width']).toBe('100%');
    expect(actions['justify-content']).toBe('flex-end');
  });
  it('keeps the hidden word "Day" inside the number chip, whatever scroller a view puts the list in', () => {
    expect(declared(trip, '[data-view] :where(.tv-day-num)').position).toBe('relative');
  });
  it('shows the active day in a strip whose cells open the day from a second button', () => {
    const active = rulesWith(trip, '.tv-day-open.is-active');
    expect(active.length).toBeGreaterThan(0);
  });
  it('pins only direct children of the trip root: a docked tab list does not stick on its own', () => {
    const sticky = trip.rules.filter((rule) => rule.declarations.some((declaration) => declaration.prop === 'position' && declaration.value === 'sticky'));
    // The day panel sticks too, inside its open day card and under the pinned height: it is no part of the pinned chrome.
    expect(sticky.flatMap((rule) => rule.selectors).sort()).toEqual([`${WRAP} :where(.tv-day-aside)`, `${WRAP} > :where(.td-tabs)`, `${WRAP} > :where(.tv-bar)`]);
  });
  it('the day panel: hidden by default, shown and stuck under the open day header from 960 px of card width, never taller than the screen', () => {
    const DAY = '@container tv-day (min-width: 960px)';
    expect(declared(trip, `${WRAP} :where(.tv-day-aside)`, '').display).toBe('none');
    const wide = trip.rules.find((rule) => rule.at.join(' ') === DAY && rule.selectors.includes(`${WRAP} :where(.tv-day-aside)`));
    const value = (prop) => wide.declarations.filter((declaration) => declaration.prop === prop).map((declaration) => squash(declaration.value));
    expect(value('display')).toEqual(['flex']);
    expect(value('position')).toEqual(['sticky']);
    expect(value('top')).toEqual(['calc(var(--tv-day-under) + var(--sp-4))']);
    expect(value('max-height')).toEqual(['calc(100vh - var(--tv-day-under) - var(--sp-8))', 'calc(100dvh - var(--tv-day-under) - var(--sp-8))']);
    expect(value('overflow-y')).toEqual(['auto']);
    const columns = trip.rules.find((rule) => rule.at.join(' ') === DAY && rule.selectors.includes(`${WRAP} :where(.td-day-card-body:has(> .tv-day-aside))`));
    expect(squash(columns.declarations.find((declaration) => declaration.prop === 'grid-template-columns').value)).toBe('minmax(0, 2fr) minmax(300px, 1fr)');
    // The container is the open card that holds a panel, and nothing else: a closed card and a section card are as they were.
    const makers = trip.rules.filter((rule) => rule.declarations.some((declaration) => declaration.prop === 'container' && /tv-day/.test(declaration.value)));
    expect(makers.flatMap((rule) => rule.selectors)).toEqual([`${WRAP} :where(.td-day-card.td-day-card--open:has(> .td-day-card-body > .tv-day-aside))`]);
    // Where the panel and a stop it jumps to rest follows the offsets the resets give the open day header.
    expect(squash(declared(trip, `${WRAP} :where(.td-day-card)`, '')['--tv-day-under'])).toBe(`calc(${PINNED} + var(--sp-2) + var(--tv-day-head-h, 76px))`);
    expect(squash(declared(trip, `${WRAP} :where(.td-activity-card)`)['scroll-margin-top'])).toBe('calc(var(--tv-day-under) + var(--sp-4))');
    expect(squash(declared(trip, `${WRAP} :where(.tv-day-aside-stop)`)['min-height'])).toBe('var(--ui-target)');
  });
  it('draws no coloured side border on the day panel', () => {
    const panel = trip.rules.filter((rule) => rule.selectors.some((selector) => selector.includes('tv-day-aside')));
    expect(panel.length).toBeGreaterThan(10);
    for (const rule of panel) for (const declaration of rule.declarations) expect(declaration.prop).not.toMatch(/^(border-left|border-inline-start|border-right|border-inline-end|box-shadow)/);
  });
  it('makes the .tv-landing wrappers the container-query containers, and never the trip root', () => {
    const landing = declared(trip, `${WRAP} :where(.tv-landing)`);
    expect(landing['container-type']).toBe('inline-size');
    expect(landing['container-name']).toBe('tv-landing');
    const makers = trip.rules.filter((rule) => rule.declarations.some((declaration) => /^(container|container-type|contain|transform|filter|backdrop-filter)$/.test(declaration.prop)));
    for (const rule of makers) for (const selector of rule.selectors) expect(selector).not.toMatch(/^\[data-view\](:where\(\.td-wrap[^)]*\))?$/);
    expect(trip.atRules.filter((rule) => rule.name === 'container').length).toBeGreaterThan(0);
    for (const rule of trip.atRules.filter((one) => one.name === 'container')) expect(rule.prelude).toMatch(/^@container (tv-landing|tv-day) \(/);
  });
  it('gives the jump targets it owns the scroll margin of the pinned height', () => {
    const [rule] = rulesWith(trip, '.ui-ready').filter((one) => one.declarations.some((declaration) => declaration.prop === 'scroll-margin-top'));
    expect(squash(rule.declarations.find((declaration) => declaration.prop === 'scroll-margin-top').value)).toBe(`calc(${PINNED} + 8px)`);
  });
  it('from 1024 px hides the menu items meant for narrow screens, Settings among them, and below it the bar buttons More also holds', () => {
    const wide = trip.rules.filter((rule) => rule.at.join(' ') === '@media (min-width: 1024px)' && rule.declarations.some((declaration) => declaration.prop === 'display' && declaration.value === 'none'));
    const hidden = wide.flatMap((rule) => rule.selectors).join('\n');
    for (const key of ['share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete', 'settings']) {
      expect(hidden).toContain(`[data-narrow-items~="${key}"]`);
      expect(hidden).toContain(`[data-focus-key="menu-${key}"]`);
    }
    expect(hidden).toContain('[data-more="narrow"]');
    const narrow = trip.rules.filter((rule) => rule.at.join(' ') === '@media (max-width: 1023px)' && rule.declarations.some((declaration) => declaration.prop === 'display' && declaration.value === 'none'));
    expect(narrow.flatMap((rule) => rule.selectors).join('\n')).toContain('.tv-action[data-in-menu]');
  });
  it('shows the compact back link of the tab list only while the list is pinned', () => {
    expect(declared(trip, `${WRAP} :where(.tv-tabs-back)`).display).toBe('none');
    expect(declared(trip, `${WRAP} :where(.td-tabs[data-stuck] > .tv-tabs-back)`).display).toBe('inline-flex');
  });
});

describe('trip-reset.css', () => {
  const targets = (prop) => reset.rules.filter((rule) => rule.declarations.some((declaration) => declaration.prop === prop)).flatMap((rule) => rule.selectors);
  it('starts every rule with the six-fold scope', () => {
    expect(reset.rules.length).toBeGreaterThan(0);
    for (const rule of reset.rules) for (const selector of rule.selectors) expect(selector.startsWith(SIX)).toBe(true);
  });
  it('flat day list: the gap and the bottom padding come from the two variables a skin sets', () => {
    const card = declared(reset, `${SIX} :where(.td-day-card)`);
    expect(card['margin-top']).toBe('var(--tv-day-gap)');
    expect(card['padding-bottom']).toBe('var(--tv-day-pad)');
    expect(declared(reset, `${SIX} :where(.td-day-card:first-child)`)['margin-top']).toBe('0');
  });
  it('no hover dim and no lift on the day cards', () => {
    const selectors = targets('filter');
    expect(selectors.join('\n')).toContain('.td-day-grid:not(.td-day-grid--has-open):hover .td-day-card');
    expect(selectors.join('\n')).toContain('.td-day-card:hover');
    expect(selectors.join('\n')).toContain('.td-day-card:active');
    for (const rule of reset.rules.filter((one) => one.declarations.some((declaration) => declaration.prop === 'filter'))) {
      const map = Object.fromEntries(rule.declarations.map((declaration) => [declaration.prop, declaration.value]));
      expect(map.filter).toBe('none');
      expect(map.transform).toBe('none');
    }
    expect(targets('box-shadow').join('\n')).toContain('.td-day-card:hover');
  });
  it('.td-body is a block, at every width and with the chat panel open', () => {
    expect(declared(reset, `${SIX} :where(.td-body)`)).toEqual({ display: 'block' });
  });
  it('from 1440 px the trip root keeps --tv-max when the chat panel is open', () => {
    expect(declared(reset, SIX, '@media (min-width: 1440px)')).toEqual({ 'max-width': 'var(--tv-max)' });
    expect(declared(reset, SIX, '')).toEqual({});
  });
  it('the open day header sticks under the pinned height', () => {
    const header = declared(reset, `${SIX} :where(.td-day-card.td-day-card--open > .td-day-card-header)`);
    expect(squash(header.top)).toBe(`calc(${PINNED} + var(--sp-2))`);
  });
  it('jump targets stop under the pinned height', () => {
    const selectors = targets('scroll-margin-top').join(',');
    for (const hook of ['.td-day-card', '.td-section-card', '.td-tab-panel']) expect(selectors).toContain(hook);
    // The day header is what classic code paths scroll to and focus (a section jump, a focus move): it
    // needs the margin itself, or it lands under the pinned bar (final pass, confirmed major).
    expect(selectors).toMatch(/[\s(,]\.td-day-card-header\s*[),]/);
    for (const rule of reset.rules) {
      for (const { prop, value } of rule.declarations) if (prop === 'scroll-margin-top') expect(squash(value)).toBe(`calc(${PINNED} + 8px)`);
    }
  });
  it('the edit bar sticks under the pinned height, above an open day header and below the bar', () => {
    const bar = declared(reset, `${SIX} :where(.td-edit-bar)`);
    expect(bar.position).toBe('sticky');
    expect(squash(bar.top)).toBe(`calc(${PINNED} + var(--sp-2))`);
    expect(squash(bar['z-index'])).toBe('calc(var(--z-sticky) + 5)');
  });
  it('the update notice sits under the pinned height instead of the nav height', () => {
    expect(squash(declared(reset, `${SIX} :where(.td-update-notice)`).top)).toBe(`calc(${PINNED} + var(--sp-3))`);
    expect(read(RESET)).not.toContain('--nav-h');
  });
  it('the classic day footer cost is hidden and the inert day card block is shown', () => {
    expect(declared(reset, `${SIX} :where(.td-day-footer > .td-day-footer-cost)`)).toEqual({ display: 'none' });
    const block = declared(reset, `${SIX} :where(.td-day-card-header .tv-day-extras)`);
    expect(block.display).toMatch(/^var\(--tv-day-extras-display, \w+\)$/);
    expect(block.display).not.toContain('none');
  });
  it('holds those resets and nothing else', () => {
    const props = new Set(reset.rules.flatMap((rule) => rule.declarations.map((declaration) => declaration.prop)));
    expect([...props].sort()).toEqual(['box-shadow', 'display', 'filter', 'margin-top', 'max-width', 'padding-bottom', 'position', 'scroll-margin-top', 'top', 'transform', 'z-index']);
    expect(reset.rules.length).toBeLessThanOrEqual(14);
    for (const rule of reset.rules) for (const declaration of rule.declarations) expect(declaration.important).toBe(false);
  });
});

describe('trip.css: final wave', () => {
  const sheet = trip;
  const decls = (selector) => Object.fromEntries((sheet.rules.find((rule) => rule.selectors.includes(selector))?.declarations ?? []).map((one) => [one.prop, one.value]));
  it('centres the 44 px target of a glance jump on its text', () => {
    const target = decls('[data-view] :where(.tv-fact-jump)::after');
    expect(target.left).toBe('50%');
    expect(target.translate).toBe('-50% -50%');
    expect(target.width).toBe('max(100%, var(--ui-target))');
  });
  it('makes .tv-between a tv-landing container too', () => {
    const between = sheet.rules.filter((rule) => rule.selectors.includes('[data-view]:where(.td-wrap) :where(.tv-between)')).flatMap((rule) => rule.declarations);
    expect(between.find((one) => one.prop === 'container-type')?.value).toBe('inline-size');
    expect(between.find((one) => one.prop === 'container-name')?.value).toBe('tv-landing');
  });
});
