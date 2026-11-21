// tabs.js: the one tab list of the trip page, with the classic tab hooks (blueprint 3.4, 4.2; ruling R3
// pins the ids). Owner: F6.
import { describe, it, expect } from 'vitest';
import { tabsHtml, TRIP_TABS } from './tabs.js';
import { ICON_NAMES } from './icons.js';
import { parseHtml, all, attr, textOf, classesOf, isElement } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const KEYS = ['plan', 'spending', 'prep', 'towns'];
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const tabsOf = (root) => all(root, '.td-tab');

describe('tabsHtml', () => {
  it('emits exactly one element: the tab list, with the classic class and its role', () => {
    const root = tree(tabsHtml('plan'));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(root.children.every((child) => isElement(child) || child.text.trim() === '')).toBe(true);
    expect(classesOf(top[0])).toContain('td-tabs');
    expect(attr(top[0], 'role')).toBe('tablist');
    expect(attr(top[0], 'aria-label')).toBe('Trip sections');
    expect(all(root, '.td-tabs')).toHaveLength(1);
  });
  it('draws the four tabs in order, as buttons with the classic hooks and their words', () => {
    const tabs = tabsOf(tree(tabsHtml('plan')));
    expect(tabs.map((tab) => attr(tab, 'data-tab'))).toEqual(KEYS);
    expect(tabs.map((tab) => textOf(tab))).toEqual(['Plan', 'Spending', 'Prep', 'Discover']);
    for (const tab of tabs) {
      expect(tab.tag).toBe('button');
      expect(attr(tab, 'type')).toBe('button');
      expect(attr(tab, 'role')).toBe('tab');
    }
  });
  it('gives each tab the id and the panel id that ruling R3 pins', () => {
    for (const tab of tabsOf(tree(tabsHtml('plan')))) {
      const key = attr(tab, 'data-tab');
      expect(attr(tab, 'id')).toBe(`td-tab-${key}`);
      expect(attr(tab, 'aria-controls')).toBe(`td-panel-${key}`);
      expect(attr(tab, 'data-focus-key')).toBe(`tab-${key}`);
    }
  });
  it.each(KEYS)('marks %s as the one active tab: class, aria-selected and roving tabindex', (active) => {
    const tabs = tabsOf(tree(tabsHtml(active)));
    for (const tab of tabs) {
      const on = attr(tab, 'data-tab') === active;
      expect(classesOf(tab).includes('td-tab--active')).toBe(on);
      expect(attr(tab, 'aria-selected')).toBe(String(on));
      expect(attr(tab, 'tabindex')).toBe(on ? '0' : '-1');
    }
    expect(tabs.filter((tab) => attr(tab, 'tabindex') === '0')).toHaveLength(1);
  });
  it('falls back to Plan for a key that is not a tab', () => {
    for (const bad of [undefined, null, '', 'discover', '"><img src=x onerror=alert(1)>']) {
      const active = tabsOf(tree(tabsHtml(bad))).filter((tab) => classesOf(tab).includes('td-tab--active'));
      expect(active.map((tab) => attr(tab, 'data-tab'))).toEqual(['plan']);
    }
  });
  it('alone, it holds no back control', () => {
    const root = tree(tabsHtml('plan'));
    expect(all(root, 'a')).toHaveLength(0);
    expect(tree(tabsHtml('plan', {})).children.filter(isElement)).toHaveLength(1);
  });
  it('with withBack, a compact link to the trip list leads the row and is not a tab', () => {
    const root = tree(tabsHtml('spending', { withBack: true }));
    const [list] = all(root, '.td-tabs');
    const links = all(list, 'a');
    expect(links).toHaveLength(1);
    const [back] = links;
    expect(list.children.filter(isElement)[0]).toBe(back);
    expect(attr(back, 'href')).toBe('#/');
    expect(classesOf(back)).toContain('tv-tabs-back');
    expect(classesOf(back)).not.toContain('td-tab');
    expect(classesOf(back)).not.toContain('tv-back');
    expect(attr(back, 'aria-label')).toBe('Trips');
    expect(attr(back, 'role')).toBe(null);
    expect(tabsOf(root).map((tab) => attr(tab, 'data-tab'))).toEqual(KEYS);
    expect(root.children.filter(isElement)).toHaveLength(1);
  });
  it('is the same node whether it stands alone or is docked in the bar: nothing in it names its place', () => {
    expect(tabsHtml('plan')).toBe(tabsHtml('plan', { withBack: false }));
    expect(tabsHtml('plan')).not.toMatch(/data-tabs-slot|tv-bar/);
  });
  it('draws each tab with an icon of the shared family and a label span', () => {
    for (const tab of TRIP_TABS) expect(ICON_NAMES).toContain(tab.icon);
    for (const tab of tabsOf(tree(tabsHtml('plan')))) {
      expect(all(tab, 'svg')).toHaveLength(1);
      expect(all(tab, '.tv-tab-label')).toHaveLength(1);
    }
  });
  it('lists the tabs as data, frozen', () => {
    expect(TRIP_TABS.map((tab) => tab.key)).toEqual(KEYS);
    expect(Object.isFrozen(TRIP_TABS)).toBe(true);
  });
});
