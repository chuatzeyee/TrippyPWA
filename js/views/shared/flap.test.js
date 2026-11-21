// flap.js: split-flap digits with a hidden copy of the real number (blueprint 1.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { flapDigitsHtml, flapFrames } from './flap.js';
import { parseHtml, all, attr, classesOf, textOf } from '../fixtures/checks/html-tree.js';

const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  return root;
};
const cellsOf = (root) => all(root, '.flap-cell');
const shown = (root) => cellsOf(root).map((cell) => textOf(all(cell, '.flap-face')[0])).join('');

describe('flapDigitsHtml', () => {
  it.each([[0, '0'], [9, '9'], [100, '100'], [12, '12']])('shows %s as the cells %s', (value, digits) => {
    const root = tree(flapDigitsHtml(value));
    expect(shown(root)).toBe(digits);
    expect(cellsOf(root)).toHaveLength(digits.length);
  });
  it('pads to a minimum width with zeros', () => {
    expect(shown(tree(flapDigitsHtml(9, { minDigits: 2 })))).toBe('09');
    expect(shown(tree(flapDigitsHtml(0, { minDigits: 3 })))).toBe('000');
    expect(shown(tree(flapDigitsHtml(100, { minDigits: 2 })))).toBe('100');
  });
  it('hides the cells from assistive technology and carries the real number beside them', () => {
    const root = tree(flapDigitsHtml(9, { minDigits: 2 }));
    const [wrap] = all(root, '.ui-flap');
    const [cells] = all(wrap, '.ui-flap-cells');
    expect(attr(cells, 'aria-hidden')).toBe('true');
    expect(cellsOf(cells)).toHaveLength(2);
    const [real] = all(wrap, '.ui-vh');
    expect(textOf(real)).toBe('9');
    expect(attr(wrap, 'data-flap')).toBe('9');
  });
  it('reuses the classic cell markup', () => {
    const [cell] = cellsOf(tree(flapDigitsHtml(7)));
    expect(all(cell, '.flap-face')).toHaveLength(1);
    expect(textOf(all(cell, '.flap-top .flap-top-text'.split(' ')[1])[0])).toBe('7');
    expect(textOf(all(cell, '.flap-bottom-text')[0])).toBe('7');
    expect(all(cell, '.flap-top')).toHaveLength(1);
    expect(all(cell, '.flap-bottom')).toHaveLength(1);
  });
  it('rounds a fraction, and shows zero for a negative or missing value', () => {
    expect(shown(tree(flapDigitsHtml(11.6)))).toBe('12');
    expect(shown(tree(flapDigitsHtml(-3)))).toBe('0');
    expect(shown(tree(flapDigitsHtml(null)))).toBe('0');
    expect(shown(tree(flapDigitsHtml('"><img src=x>')))).toBe('0');
    expect(all(tree(flapDigitsHtml('"><img src=x>')), 'img')).toHaveLength(0);
  });
  it('ignores a minimum width that is not a small whole number', () => {
    expect(shown(tree(flapDigitsHtml(5, { minDigits: -2 })))).toBe('5');
    expect(shown(tree(flapDigitsHtml(5, { minDigits: 99 })))).toBe('5');
    expect(shown(tree(flapDigitsHtml(5, { minDigits: '2"x' })))).toBe('5');
  });
  it('takes extra classes', () => {
    expect(classesOf(all(tree(flapDigitsHtml(5, { cls: 'ui-flap--xl' })), '.ui-flap')[0])).toContain('ui-flap--xl');
  });
});

describe('flapFrames', () => {
  it('counts each cell up from zero to its digit', () => {
    expect(flapFrames('12')).toEqual([['0', '0'], ['1', '1'], ['1', '2']]);
  });
  it('is one frame when every digit is zero', () => {
    expect(flapFrames('00')).toEqual([['0', '0']]);
  });
  it('caps the run so a 9 does not take nine steps', () => {
    const frames = flapFrames('9', { maxSteps: 4 });
    expect(frames).toHaveLength(5);
    expect(frames[0]).toEqual(['0']);
    expect(frames[frames.length - 1]).toEqual(['9']);
  });
  it('always ends on the real digits', () => {
    for (const digits of ['7', '30', '100', '365']) {
      const frames = flapFrames(digits);
      expect(frames[frames.length - 1].join('')).toBe(digits);
    }
  });
});
