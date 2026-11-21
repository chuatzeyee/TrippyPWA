// menu.js: the pure half of the menus: the markup, where the panel goes, which item a key moves to
// (blueprint 1.3, ruling R3). Opening, the top layer and focus are proven in a browser. Owner: F5.
import { describe, it, expect } from 'vitest';
import { menuHtml, menuPlacement, nextMenuIndex, SHEET_BELOW } from './menu.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const ITEMS = [
  { key: 'share', label: 'Share', hint: 'Send a link' },
  { key: 'delete', label: 'Delete trip', danger: true },
  { key: 'settings', label: 'Settings', href: '#/settings' },
];

describe('menuHtml', () => {
  it('emits the trigger and the panel the frozen stub view pins (ruling R3)', () => {
    const root = tree(menuHtml({ id: 'more-menu', label: 'More', items: ITEMS }));
    const [trigger] = all(root, 'button[data-menu-open="more-menu"]');
    expect(attr(trigger, 'aria-haspopup')).toBe('menu');
    expect(attr(trigger, 'aria-expanded')).toBe('false');
    expect(attr(trigger, 'aria-controls')).toBe('more-menu');
    expect(attr(trigger, 'data-focus-key')).toBe('menu-open-more-menu');
    expect(textOf(trigger)).toBe('More');
    const [panel] = all(root, 'dialog');
    expect(attr(panel, 'id')).toBe('more-menu');
    expect(attr(panel, 'data-menu')).toBe('');
    expect(classesOf(panel)).toContain('ui-menu');
    expect(attr(panel, 'aria-label')).toBe('More');
    expect(all(panel, '[role="menu"]')).toHaveLength(1);
    expect(all(panel, '[role="menuitem"]')).toHaveLength(3);
  });
  it('draws an action as a button with data-action and a link as a link', () => {
    const items = all(tree(menuHtml({ id: 'm', label: 'More', items: ITEMS })), '[role="menuitem"]');
    expect(items[0].tag).toBe('button');
    expect(attr(items[0], 'type')).toBe('button');
    expect(attr(items[0], 'data-action')).toBe('share');
    expect(attr(items[0], 'data-focus-key')).toBe('menu-share');
    expect(textOf(items[0])).toBe('Share Send a link');
    expect(classesOf(items[1])).toContain('is-danger');
    expect(items[2].tag).toBe('a');
    expect(attr(items[2], 'href')).toBe('#/settings');
    expect(items.every((item) => item.parent.tag === 'li' && attr(item.parent, 'role') === 'none')).toBe(true);
  });
  it('holds every action of a trip, so each one is reachable at every width', () => {
    const { actions } = TRIP_FIXTURES.upcoming;
    const root = tree(menuHtml({ id: 'm', label: 'More', items: actions }));
    for (const action of actions) {
      const found = action.href ? all(root, 'a[role="menuitem"]').some((a) => attr(a, 'href') === action.href) : all(root, `button[data-action="${action.key}"]`).length === 1;
      expect(found).toBe(true);
    }
  });
  it('escapes hostile text and refuses an id that is not an id', () => {
    const root = tree(menuHtml({ id: 'm', label: HOSTILE, items: [{ key: HOSTILE, label: HOSTILE, hint: HOSTILE }, { key: 'x', label: 'X', href: 'javascript:alert(1)' }] }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(all(root, 'a')).toHaveLength(0);
    expect(all(root, '[role="menuitem"]')).toHaveLength(1);
    expect(menuHtml({ id: 'a b"c', label: 'More', items: ITEMS })).toBe('');
    expect(menuHtml({ id: 'm', label: 'More', items: [] })).toBe('');
  });
});

describe('menuPlacement', () => {
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1280, height: 800 };
  const menu = { width: 240, height: 300 };
  it('is a bottom sheet below 640 px', () => {
    expect(SHEET_BELOW).toBe(640);
    expect(menuPlacement({ left: 300, top: 10, right: 344, bottom: 54 }, menu, phone)).toEqual({ mode: 'sheet' });
    expect(menuPlacement({ left: 300, top: 10, right: 344, bottom: 54 }, menu, { width: 639, height: 800 }).mode).toBe('sheet');
    expect(menuPlacement({ left: 300, top: 10, right: 344, bottom: 54 }, menu, { width: 640, height: 800 }).mode).toBe('panel');
  });
  it('is a panel under its trigger from 640 px, lined up with the trigger edge nearer the middle', () => {
    const right = menuPlacement({ left: 1180, top: 12, right: 1224, bottom: 56 }, menu, desktop);
    expect(right).toMatchObject({ mode: 'panel', top: 62, left: 1224 - 240 });
    const left = menuPlacement({ left: 40, top: 12, right: 84, bottom: 56 }, menu, desktop);
    expect(left).toMatchObject({ mode: 'panel', top: 62, left: 40 });
  });
  it('stays inside the viewport', () => {
    const wide = menuPlacement({ left: 4, top: 12, right: 48, bottom: 56 }, { width: 240, height: 300 }, desktop);
    expect(wide.left).toBeGreaterThanOrEqual(8);
    const edge = menuPlacement({ left: 1250, top: 12, right: 1290, bottom: 56 }, menu, desktop);
    expect(edge.left + 240).toBeLessThanOrEqual(1280 - 8);
  });
  it('opens upward when there is more room above, and caps its height to the room it has', () => {
    const low = menuPlacement({ left: 600, top: 740, right: 644, bottom: 784 }, menu, desktop);
    expect(low.top).toBe(740 - 6 - 300);
    expect(low.maxHeight).toBe(740 - 6 - 8);
    const tall = menuPlacement({ left: 600, top: 12, right: 644, bottom: 56 }, { width: 240, height: 2000 }, desktop);
    expect(tall.top).toBe(62);
    expect(tall.maxHeight).toBe(800 - 62 - 8);
  });
});

describe('nextMenuIndex', () => {
  it('moves down and up and wraps', () => {
    expect(nextMenuIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextMenuIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextMenuIndex('ArrowUp', 0, 3)).toBe(2);
    expect(nextMenuIndex('ArrowUp', 2, 3)).toBe(1);
  });
  it('goes to the ends with Home and End', () => {
    expect(nextMenuIndex('Home', 2, 3)).toBe(0);
    expect(nextMenuIndex('End', 0, 3)).toBe(2);
  });
  it('enters the list from outside it', () => {
    expect(nextMenuIndex('ArrowDown', -1, 3)).toBe(0);
    expect(nextMenuIndex('ArrowUp', -1, 3)).toBe(2);
  });
  it('gives null for other keys and for an empty menu', () => {
    expect(nextMenuIndex('a', 0, 3)).toBeNull();
    expect(nextMenuIndex('Tab', 0, 3)).toBeNull();
    expect(nextMenuIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
