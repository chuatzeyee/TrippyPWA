// filter-bar.js: the search field (outside any region) and the filter chips (the filters region).
// Owner: F5.
import { describe, it, expect } from 'vitest';
import { filterBarHtml } from './filter-bar.js';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, isInside, classesOf } from '../fixtures/checks/html-tree.js';
import { markupRules, regionRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  expect(regionRules(root)).toEqual([]);
  return root;
};
const { filter } = DASHBOARD_FIXTURES.ready;

describe('filterBarHtml', () => {
  it('puts the chips before the search field in the markup when a view asks (searchLast)', () => {
    const order = (html) => all(tree(html), '.dv-filter')[0].children.filter((child) => typeof child.tag === 'string' && child.tag).map((child) => classesOf(child)[0]);
    expect(order(filterBarHtml(filter))).toEqual(['dv-search', 'dv-chips']);
    expect(order(filterBarHtml(filter, { searchLast: true }))).toEqual(['dv-chips', 'dv-search']);
    expect(classesOf(all(tree(filterBarHtml(filter, { searchLast: true })), '.dv-filter')[0])).toContain('dv-filter--search-last');
    expect(classesOf(all(tree(filterBarHtml(filter)), '.dv-filter')[0])).not.toContain('dv-filter--search-last');
  });
  it('draws one search input, labelled, outside the filters region', () => {
    const root = tree(filterBarHtml(filter));
    const inputs = all(root, 'input[data-trip-search]');
    expect(inputs).toHaveLength(1);
    const [input] = inputs;
    expect(attr(input, 'type')).toBe('search');
    expect(attr(input, 'data-focus-key')).toBe('trip-search');
    expect(isInside(input, '[data-region]')).toBe(false);
    expect(isInside(input, 'label')).toBe(true);
    expect(textOf(all(root, 'label')[0])).toContain('Search your trips');
  });
  it('draws every option as a chip inside the filters region, with its count', () => {
    const root = tree(filterBarHtml(filter));
    const regions = all(root, '[data-region="filters"]');
    expect(regions).toHaveLength(1);
    const chips = all(regions[0], 'button[data-filter]');
    expect(chips.map((chip) => attr(chip, 'data-filter'))).toEqual(filter.options.map((option) => option.key));
    expect(all(root, '[data-filter]')).toHaveLength(filter.options.length);
    for (const [i, chip] of chips.entries()) {
      const option = filter.options[i];
      expect(attr(chip, 'type')).toBe('button');
      expect(attr(chip, 'data-focus-key')).toBe(`filter-${option.key}`);
      expect(attr(chip, 'data-key')).toBe(`filter-${option.key}`);
      expect(textOf(chip)).toContain(option.label);
      expect(textOf(chip)).toContain(String(option.count));
    }
  });
  it('marks the active chip as pressed', () => {
    const root = tree(filterBarHtml(DASHBOARD_FIXTURES.filtered.filter));
    const pressed = all(root, 'button[aria-pressed="true"]');
    expect(pressed.map((chip) => attr(chip, 'data-filter'))).toEqual(['past']);
    expect(classesOf(pressed[0])).toContain('is-active');
    expect(all(root, 'button[aria-pressed="false"]')).toHaveLength(filter.options.length - 1);
  });
  it('keeps what was typed in the field', () => {
    const [input] = all(tree(filterBarHtml({ ...filter, q: 'kyoto' })), 'input');
    expect(attr(input, 'value')).toBe('kyoto');
  });
  it('escapes a hostile query, label and key', () => {
    const hostile = { q: HOSTILE, active: HOSTILE, expanded: true, options: [{ key: HOSTILE, label: HOSTILE, count: 2 }] };
    const root = tree(filterBarHtml(hostile));
    expect(all(root, 'img')).toHaveLength(0);
    expect(attr(all(root, 'input')[0], 'value')).toBe(HOSTILE);
    expect(attr(all(root, 'button')[0], 'data-filter')).toBe(HOSTILE);
  });
  it('still draws the search field when there are no options', () => {
    const root = tree(filterBarHtml({ q: '', active: 'all', expanded: false, options: [] }));
    expect(all(root, 'input[data-trip-search]')).toHaveLength(1);
    expect(all(root, '[data-region="filters"]')).toHaveLength(1);
  });
  it('does not change the filter it was given', () => {
    const frozen = Object.freeze({ ...filter, options: Object.freeze(filter.options.map((option) => Object.freeze({ ...option }))) });
    expect(() => filterBarHtml(frozen)).not.toThrow();
  });
});
