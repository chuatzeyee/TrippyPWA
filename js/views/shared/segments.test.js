// segments.js: the day segments bar (blueprint 1.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { segmentsHtml } from './segments.js';
import { parseHtml, all, attr, classesOf } from '../fixtures/checks/html-tree.js';

const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  return root;
};
const states = (root) => all(root, '.ui-seg').map((seg) => attr(seg, 'data-seg'));

describe('segmentsHtml', () => {
  it('draws none done', () => {
    const root = tree(segmentsHtml(0, 4));
    expect(states(root)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(attr(all(root, '.ui-segs')[0], 'aria-label')).toBe('0 of 4 done');
  });
  it('draws some done, with the current one marked', () => {
    const root = tree(segmentsHtml(9, 12, 10));
    expect(states(root)).toEqual([...Array(9).fill('done'), 'now', 'todo', 'todo']);
    const [bar] = all(root, '.ui-segs');
    expect(attr(bar, 'role')).toBe('img');
    expect(attr(bar, 'aria-label')).toBe('Day 10 of 12');
    expect(attr(bar, 'style')).toBe('--segs:12');
  });
  it('draws all done', () => {
    const root = tree(segmentsHtml(4, 4));
    expect(states(root)).toEqual(['done', 'done', 'done', 'done']);
    expect(classesOf(all(root, '.ui-segs')[0])).toContain('is-complete');
  });
  it('clamps done and current to the total', () => {
    expect(states(tree(segmentsHtml(9, 3)))).toEqual(['done', 'done', 'done']);
    expect(states(tree(segmentsHtml(-2, 3, 8)))).toEqual(['todo', 'todo', 'now']);
  });
  it('takes a label of its own, escaped', () => {
    const root = tree(segmentsHtml(4, 9, null, { label: '4 of 9 days planned <b>' }));
    expect(attr(all(root, '.ui-segs')[0], 'aria-label')).toBe('4 of 9 days planned <b>');
  });
  it('draws nothing without a total', () => {
    for (const total of [0, null, undefined, -1, NaN, '3"x']) expect(segmentsHtml(1, total)).toBe('');
  });
  it('folds a very long plan into at most 60 segments and says the real numbers', () => {
    const root = tree(segmentsHtml(45, 90, 46));
    expect(all(root, '.ui-seg').length).toBeLessThanOrEqual(60);
    expect(attr(all(root, '.ui-segs')[0], 'aria-label')).toBe('Day 46 of 90');
    expect(states(root).filter((state) => state === 'now')).toHaveLength(1);
    for (let day = 1; day <= 90; day += 1) expect(states(tree(segmentsHtml(0, 90, day))).filter((state) => state === 'now')).toHaveLength(1);
  });
});
