// trip-topbar.js: the trip top bar, its labelled actions and the More menu (blueprint 3.4, 4.2;
// ruling R3 pins the menu markup). Owner: F6.
import { describe, it, expect } from 'vitest';
import { topbarHtml, actionButtonsHtml, moreMenuHtml, moreTriggerHtml, BAR_KEYS, MORE_MENU_ID } from './trip-topbar.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf, isElement, isInside } from '../fixtures/checks/html-tree.js';
import { markupRules, regionRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const BANNED = /[\u2013\u2014\u00b7\u2022\u2026\u2192]/;
const ALL_KEYS = ['share', 'pdf', 'edit', 'tune', 'read-view', 'regenerate', 'delete'];
const LINK_KEYS = ['tune', 'read-view'];
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  expect(regionRules(root)).toEqual([]);
  return root;
};
const T = TRIP_FIXTURES;
// The five role and state cases the task names. `failed` keeps only Delete.
const CASES = { owner: T.upcoming, editor: T.editor, viewer: T.viewer, imported: T.imported, failed: T.failed };
const SPLITS = {
  'the default split': {},
  'nothing in the bar': { barKeys: [] },
  'everything in the bar': { barKeys: ALL_KEYS },
  'an empty menu list': { menuKeys: [] },
  'the previews: three in the bar, the rest in More': { barKeys: ['share', 'pdf', 'edit'], menuKeys: ['tune', 'read-view', 'regenerate', 'delete'] },
  'a split that names neither Edit nor Reader view': { barKeys: ['delete'], menuKeys: ['share'] },
  'both lists empty': { barKeys: [], menuKeys: [] },
  'unknown and repeated keys': { barKeys: ['share', 'share', 'fly', HOSTILE], menuKeys: ['pdf', 'pdf', 'nope'] },
};
const regionOf = (root) => all(root, '[data-region="bar-actions"]');
const controlsFor = (scope, action) => (LINK_KEYS.includes(action.key)
  ? all(scope, 'a').filter((a) => attr(a, 'href') === action.href)
  : all(scope, `[data-action="${action.key}"]`));
const menuItems = (root) => all(root, '[role="menuitem"]');
const barButtons = (root) => all(root, '.tv-action');
const keyOf = (el) => attr(el, 'data-action') ?? (/\/read$/.test(attr(el, 'href') ?? '') ? 'read-view' : /\/tune$/.test(attr(el, 'href') ?? '') ? 'tune' : attr(el, 'href') === '#/settings' ? 'settings' : null);

describe('topbarHtml: the bar', () => {
  it('is exactly one header.tv-bar', () => {
    const root = tree(topbarHtml(T.upcoming));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(top[0].tag).toBe('header');
    expect(classesOf(top[0])).toContain('tv-bar');
    expect(root.children.every((child) => isElement(child) || child.text.trim() === '')).toBe(true);
    expect(all(root, '.tv-bar')).toHaveLength(1);
  });
  it('the back control is a link to #/ with the visible word Trips', () => {
    const back = all(tree(topbarHtml(T.upcoming)), 'a.tv-back');
    expect(back).toHaveLength(1);
    expect(attr(back[0], 'href')).toBe('#/');
    expect(textOf(back[0])).toBe('Trips');
    expect(attr(back[0], 'data-focus-key')).toBe('back');
    expect(attr(back[0], 'target')).toBe(null);
    expect(isInside(back[0], '[data-region]')).toBe(false);
  });
  it('carries the PDF status line, empty, as a status region outside bar-actions', () => {
    const root = tree(topbarHtml(T.upcoming));
    const lines = all(root, 'p[data-pdf-status]');
    expect(lines).toHaveLength(1);
    expect(attr(lines[0], 'role')).toBe('status');
    expect(textOf(lines[0])).toBe('');
    expect(isInside(lines[0], '.tv-bar')).toBe(true);
    expect(isInside(lines[0], '[data-region]')).toBe(false);
  });
  it('shows the title and the dates as text, never as a heading', () => {
    const root = tree(topbarHtml(T.multiCity));
    expect(all(root, 'h1, h2, h3')).toHaveLength(0);
    expect(textOf(all(root, '.tv-bar-name')[0])).toBe(T.multiCity.title);
    expect(textOf(all(root, '.tv-bar-dates')[0])).toBe(T.multiCity.dates.text);
    expect(all(all(root, '.tv-bar-title')[0], 'img.ui-flag')).toHaveLength(3);
  });
  it('leaves the dates out for a plan without dates', () => {
    const root = tree(topbarHtml(T.undated));
    const dates = all(root, '.tv-bar-dates');
    expect(dates.every((el) => textOf(el) !== '')).toBe(true);
    expect(textOf(all(root, '.tv-bar-name')[0])).toBe(T.undated.title);
  });
  it('holds no tabs slot unless a width is given, and then one empty slot outside the region', () => {
    expect(all(tree(topbarHtml(T.upcoming)), '[data-tabs-slot]')).toHaveLength(0);
    expect(all(tree(topbarHtml(T.upcoming, {})), '[data-tabs-slot]')).toHaveLength(0);
    for (const bad of [-1, 10.5, NaN, 'wide', null, '1024px', HOSTILE]) expect(all(tree(topbarHtml(T.upcoming, { tabsSlotFrom: bad })), '[data-tabs-slot]')).toHaveLength(0);
    for (const [given, written] of [[1024, '1024'], ['768', '768'], [0, '0']]) {
      const slots = all(tree(topbarHtml(T.upcoming, { tabsSlotFrom: given })), '[data-tabs-slot]');
      expect(slots).toHaveLength(1);
      expect(attr(slots[0], 'data-slot-from')).toBe(written);
      expect(slots[0].children).toHaveLength(0);
      expect(isInside(slots[0], '[data-region]')).toBe(false);
      expect(isInside(slots[0], '.tv-bar')).toBe(true);
    }
  });
  it('escapes a hostile title, dates and action', () => {
    const model = {
      ...T.upcoming, title: HOSTILE, flags: [HOSTILE], dates: { ...T.upcoming.dates, text: HOSTILE },
      actions: [{ key: 'share', label: HOSTILE, hint: HOSTILE, href: '', danger: false }, { key: 'read-view', label: 'Reader view', hint: '', href: 'javascript:alert(1)', danger: false }],
    };
    const root = tree(topbarHtml(model, { tabsSlotFrom: 1024 }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, '.tv-bar-name')[0])).toBe(HOSTILE);
    expect(all(root, 'a').map((a) => attr(a, 'href')).every((href) => href.startsWith('#/'))).toBe(true);
  });
  it('does not change the model it is given', () => {
    const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const model = freeze(structuredClone(T.upcoming));
    const barKeys = freeze(['share']);
    const menuKeys = freeze(['delete']);
    expect(() => topbarHtml(model, { barKeys, menuKeys, tabsSlotFrom: 1024 })).not.toThrow();
  });
  it('gives every control its own focus key', () => {
    const root = tree(topbarHtml(T.upcoming, { tabsSlotFrom: 1024 }));
    const keys = all(root, '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const el of all(root, 'a, button')) expect(attr(el, 'data-focus-key')).not.toBe(null);
  });
  it('prints no banned glyph', () => {
    for (const model of Object.values(T)) expect(topbarHtml(model, { tabsSlotFrom: 1024 })).not.toMatch(BANNED);
  });
});

describe.each(Object.entries(CASES))('topbarHtml: the actions of the %s fixture', (name, model) => {
  it.each(Object.entries(SPLITS))('reaches every action inside one bar-actions region with %s', (_label, split) => {
    const root = tree(topbarHtml(model, split));
    const regions = regionOf(root);
    expect(regions).toHaveLength(1);
    const [region] = regions;
    expect(model.actions.length).toBeGreaterThan(0);
    for (const action of model.actions) {
      const controls = controlsFor(region, action);
      expect(controls.length, `${name}: ${action.key}`).toBeGreaterThan(0);
      if (!LINK_KEYS.includes(action.key)) expect(controls.every((el) => el.tag === 'button' && attr(el, 'type') === 'button')).toBe(true);
    }
    // Nothing the model does not offer, and nothing outside the region.
    const offered = model.actions.map((action) => action.key);
    for (const key of ALL_KEYS.filter((one) => !offered.includes(one))) expect(all(root, `[data-action="${key}"]`)).toHaveLength(0);
    if (!offered.includes('read-view')) expect(all(root, 'a').filter((a) => /\/read$/.test(attr(a, 'href')))).toHaveLength(0);
    for (const el of all(root, '[data-action]')) expect(isInside(el, '[data-region="bar-actions"]')).toBe(true);
    for (const el of [...all(root, '[data-menu-open]'), ...all(root, 'dialog')]) expect(isInside(el, '[data-region="bar-actions"]')).toBe(true);
  });
  it('an action the bar shows and the menu holds too is marked on both sides; one the bar alone holds is not', () => {
    for (const split of Object.values(SPLITS)) {
      const root = tree(topbarHtml(model, split));
      const [region] = regionOf(root);
      const inMenu = menuItems(root).map(keyOf);
      const narrow = (attr(region, 'data-narrow-items') ?? '').split(' ').filter(Boolean);
      for (const button of barButtons(root)) {
        const key = keyOf(button);
        expect(attr(button, 'data-in-menu') !== null).toBe(inMenu.includes(key));
        expect(narrow.includes(key)).toBe(inMenu.includes(key));
      }
      // Every key named as narrow-only is in the menu, and is in the bar or is Settings.
      const inBar = barButtons(root).map(keyOf);
      for (const key of narrow) {
        expect(inMenu).toContain(key);
        expect(key === 'settings' || inBar.includes(key)).toBe(true);
      }
    }
  });
});

describe('topbarHtml: the default split', () => {
  it('the bar shows Share, Export PDF and Edit trip as labelled buttons, in that order', () => {
    const root = tree(topbarHtml(T.upcoming));
    expect(BAR_KEYS).toEqual(['share', 'pdf', 'edit']);
    expect(barButtons(root).map(keyOf)).toEqual(['share', 'pdf', 'edit']);
    expect(barButtons(root).map((el) => textOf(el))).toEqual(['Share', 'Export PDF', 'Edit trip']);
    for (const el of barButtons(root)) expect(all(el, 'svg')).toHaveLength(1);
  });
  it('the bar shows only what the role offers', () => {
    expect(barButtons(tree(topbarHtml(T.viewer))).map(keyOf)).toEqual(['pdf']);
    expect(barButtons(tree(topbarHtml(T.editor))).map(keyOf)).toEqual(['share', 'pdf', 'edit']);
    expect(barButtons(tree(topbarHtml(T.failed))).map(keyOf)).toEqual([]);
  });
  it('More holds every action in the model\'s order, then Settings', () => {
    for (const model of Object.values(CASES)) {
      expect(menuItems(tree(topbarHtml(model))).map(keyOf)).toEqual([...model.actions.map((action) => action.key), 'settings']);
    }
  });
  it('the Export PDF button has a label span the stage text is written to, and Edit trip starts unpressed', () => {
    const root = tree(topbarHtml(T.upcoming));
    const [pdf] = barButtons(root).filter((el) => keyOf(el) === 'pdf');
    expect(all(pdf, '[data-pdf-label]').map((el) => textOf(el))).toEqual(['Export PDF']);
    const [edit] = barButtons(root).filter((el) => keyOf(el) === 'edit');
    expect(attr(edit, 'aria-pressed')).toBe('false');
    const [share] = barButtons(root).filter((el) => keyOf(el) === 'share');
    expect(attr(share, 'aria-pressed')).toBe(null);
  });
  it('a danger action in the bar is marked', () => {
    const root = tree(topbarHtml(T.upcoming, { barKeys: ['delete', 'share'] }));
    const [del, share] = barButtons(root);
    expect(keyOf(del)).toBe('delete');
    expect(classesOf(del)).toContain('ui-btn--danger');
    expect(classesOf(share)).not.toContain('ui-btn--danger');
  });
  it('Reader view in the bar is a link to the reader route', () => {
    const root = tree(topbarHtml(T.viewer, { barKeys: ['read-view', 'pdf'] }));
    const [reader] = barButtons(root);
    expect(reader.tag).toBe('a');
    expect(attr(reader, 'href')).toBe(T.viewer.actions.find((action) => action.key === 'read-view').href);
    expect(attr(reader, 'data-action')).toBe(null);
    expect(attr(reader, 'target')).toBe(null);
  });
});

describe('topbarHtml: the More menu', () => {
  it('is the markup ruling R3 pins, driven by mountMenus', () => {
    const root = tree(topbarHtml(T.upcoming));
    const triggers = all(root, 'button[data-menu-open]');
    expect(triggers).toHaveLength(1);
    const [trigger] = triggers;
    expect(attr(trigger, 'data-menu-open')).toBe(MORE_MENU_ID);
    expect(attr(trigger, 'aria-haspopup')).toBe('menu');
    expect(attr(trigger, 'aria-expanded')).toBe('false');
    expect(attr(trigger, 'aria-controls')).toBe(MORE_MENU_ID);
    expect(textOf(trigger)).toBe('More');
    const panels = all(root, 'dialog[data-menu]');
    expect(panels).toHaveLength(1);
    expect(attr(panels[0], 'id')).toBe(MORE_MENU_ID);
    expect(all(panels[0], '[role="menu"]')).toHaveLength(1);
    expect(menuItems(panels[0]).length).toBe(T.upcoming.actions.length + 1);
  });
  it('ends with a Settings link that is marked for narrow screens', () => {
    for (const [name, model] of Object.entries(CASES)) {
      for (const split of Object.values(SPLITS)) {
        const root = tree(topbarHtml(model, split));
        const items = menuItems(root);
        const last = items[items.length - 1];
        expect(last.tag, name).toBe('a');
        expect(attr(last, 'href')).toBe('#/settings');
        expect(textOf(last)).toMatch(/^Settings\b/);
        expect(attr(last, 'data-focus-key')).toBe('menu-settings');
        expect(items.filter((item) => attr(item, 'href') === '#/settings')).toHaveLength(1);
        expect(attr(regionOf(root)[0], 'data-narrow-items').split(' ')).toContain('settings');
      }
    }
  });
  it('says when More has nothing for a wide screen, so its trigger can be hidden there', () => {
    const narrowOnly = (model, split) => attr(regionOf(tree(topbarHtml(model, split)))[0], 'data-more');
    expect(narrowOnly(T.upcoming, {})).toBe(null);
    expect(narrowOnly(T.viewer, {})).toBe(null);
    expect(narrowOnly(T.upcoming, { barKeys: ALL_KEYS })).toBe('narrow');
    expect(narrowOnly(T.failed, { barKeys: ['delete'] })).toBe('narrow');
    expect(narrowOnly(T.failed, {})).toBe(null);
  });
  it('a plan with no action at all still has the bar, the region and the way to Settings', () => {
    const root = tree(topbarHtml({ ...T.failed, actions: [] }));
    expect(regionOf(root)).toHaveLength(1);
    expect(all(root, '[data-action]')).toHaveLength(0);
    expect(menuItems(root).map(keyOf)).toEqual(['settings']);
    expect(attr(regionOf(root)[0], 'data-more')).toBe('narrow');
    expect(all(root, 'a.tv-back')).toHaveLength(1);
  });
  it('takes another menu id, and refuses one that is not an id', () => {
    const root = tree(topbarHtml(T.upcoming, { menuId: 'trip-more-2' }));
    expect(attr(all(root, 'dialog')[0], 'id')).toBe('trip-more-2');
    expect(attr(all(root, '[data-menu-open]')[0], 'data-menu-open')).toBe('trip-more-2');
    expect(attr(all(tree(topbarHtml(T.upcoming, { menuId: HOSTILE })), 'dialog')[0], 'id')).toBe(MORE_MENU_ID);
  });
});

describe('actionButtonsHtml', () => {
  it('draws every action it is given, in order, as controls with data-action', () => {
    const root = tree(actionButtonsHtml(T.upcoming.actions));
    expect(barButtons(root).map(keyOf)).toEqual(ALL_KEYS);
    expect(all(root, '[data-region]')).toHaveLength(0);
    expect(all(root, 'dialog')).toHaveLength(0);
  });
  it('draws only the keys asked for, in the order asked, and only when the model offers them', () => {
    expect(barButtons(tree(actionButtonsHtml(T.upcoming.actions, { keys: ['edit', 'share'] }))).map(keyOf)).toEqual(['edit', 'share']);
    expect(barButtons(tree(actionButtonsHtml(T.viewer.actions, { keys: ['share', 'pdf', 'edit'] }))).map(keyOf)).toEqual(['pdf']);
    expect(actionButtonsHtml(T.failed.actions, { keys: ['share', 'pdf', 'edit'] })).toBe('');
    expect(actionButtonsHtml([], {})).toBe('');
    expect(actionButtonsHtml(null)).toBe('');
  });
  it('names the place in its focus keys, so a hero row and the bar never share one', () => {
    const bar = all(tree(actionButtonsHtml(T.upcoming.actions)), '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    const hero = all(tree(actionButtonsHtml(T.upcoming.actions, { where: 'hero' })), '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    expect(bar).toEqual(ALL_KEYS.map((key) => `bar-${key}`));
    expect(hero).toEqual(ALL_KEYS.map((key) => `hero-${key}`));
    const odd = all(tree(actionButtonsHtml(T.upcoming.actions, { where: HOSTILE })), '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    expect(odd.every((key) => /^[\w-]+$/.test(key))).toBe(true);
  });
  it('takes extra classes for the buttons', () => {
    for (const el of barButtons(tree(actionButtonsHtml(T.upcoming.actions, { cls: 'ui-btn--small' })))) expect(classesOf(el)).toEqual(expect.arrayContaining(['ui-btn', 'tv-action', 'ui-btn--small']));
  });
});

describe('moreMenuHtml and moreTriggerHtml', () => {
  it('holds the actions it is given and ends with Settings', () => {
    const root = tree(moreMenuHtml(T.editor.actions));
    expect(menuItems(root).map(keyOf)).toEqual([...T.editor.actions.map((action) => action.key), 'settings']);
    expect(all(root, 'button[data-menu-open]')).toHaveLength(1);
  });
  it('can leave Settings out (a menu drawn where the app nav is always shown)', () => {
    expect(menuItems(tree(moreMenuHtml(T.editor.actions, { settings: false }))).map(keyOf)).toEqual(T.editor.actions.map((action) => action.key));
    expect(moreMenuHtml([], { settings: false })).toBe('');
  });
  it('carries each action\'s hint, and marks the danger one', () => {
    const items = menuItems(tree(moreMenuHtml(T.upcoming.actions)));
    for (const [i, action] of T.upcoming.actions.entries()) {
      expect(textOf(items[i])).toContain(action.label);
      expect(textOf(items[i])).toContain(action.hint);
      expect(classesOf(items[i]).includes('is-danger')).toBe(action.danger);
      expect(all(items[i], 'svg')).toHaveLength(1);
    }
  });
  it('a second trigger for the same menu is a button in the R3 shape with its own focus key', () => {
    const root = tree(`${moreTriggerHtml({ where: 'hero' })}${topbarHtml(T.upcoming)}`);
    const triggers = all(root, 'button[data-menu-open]');
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(attr(trigger, 'data-menu-open')).toBe(MORE_MENU_ID);
      expect(attr(trigger, 'aria-controls')).toBe(MORE_MENU_ID);
      expect(attr(trigger, 'aria-haspopup')).toBe('menu');
      expect(attr(trigger, 'aria-expanded')).toBe('false');
      expect(textOf(trigger)).toBe('More');
    }
    expect(new Set(triggers.map((el) => attr(el, 'data-focus-key'))).size).toBe(2);
  });
});
