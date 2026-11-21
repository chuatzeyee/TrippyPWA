// The home city field of Settings (blueprint 6.2): the keyboard rules of its result list and the
// markup of the options. The DOM binding is checked in the browser. Owner: F12.
import { describe, it, expect } from 'vitest';
import { comboStart, comboReduce, cityOptionsHtml, optionId } from './city-combobox.js';

const open = (count, active = -1) => ({ open: true, count, active });
const key = (name) => ({ type: 'key', key: name });

describe('comboReduce: results', () => {
  it('starts closed with nothing active', () => {
    expect(comboStart()).toEqual({ open: false, count: 0, active: -1 });
  });
  it('opens when results arrive and closes when there are none', () => {
    expect(comboReduce(comboStart(), { type: 'results', count: 3 })).toEqual({ state: open(3), effect: null });
    expect(comboReduce(open(3, 1), { type: 'results', count: 0 })).toEqual({ state: comboStart(), effect: null });
  });
  it('new results drop the active option, so Enter never picks a row the user has not seen', () => {
    expect(comboReduce(open(5, 4), { type: 'results', count: 2 }).state).toEqual(open(2));
  });
  it('close keeps nothing', () => {
    expect(comboReduce(open(3, 2), { type: 'close' })).toEqual({ state: comboStart(), effect: null });
  });
});

describe('comboReduce: keys', () => {
  it('ArrowDown walks down and wraps to the first', () => {
    expect(comboReduce(open(3), key('ArrowDown')).state.active).toBe(0);
    expect(comboReduce(open(3, 0), key('ArrowDown')).state.active).toBe(1);
    expect(comboReduce(open(3, 2), key('ArrowDown')).state.active).toBe(0);
  });
  it('ArrowUp walks up and wraps to the last', () => {
    expect(comboReduce(open(3), key('ArrowUp')).state.active).toBe(2);
    expect(comboReduce(open(3, 2), key('ArrowUp')).state.active).toBe(1);
    expect(comboReduce(open(3, 0), key('ArrowUp')).state.active).toBe(2);
  });
  it('an arrow on a closed list asks for results', () => {
    expect(comboReduce(comboStart(), key('ArrowDown'))).toEqual({ state: comboStart(), effect: { type: 'search' } });
    expect(comboReduce(comboStart(), key('ArrowUp'))).toEqual({ state: comboStart(), effect: { type: 'search' } });
  });
  it('Enter chooses the active option', () => {
    expect(comboReduce(open(3, 1), key('Enter'))).toEqual({ state: comboStart(), effect: { type: 'choose', index: 1 } });
  });
  it('Enter with nothing active chooses the only result, and nothing among several', () => {
    expect(comboReduce(open(1), key('Enter'))).toEqual({ state: comboStart(), effect: { type: 'choose', index: 0 } });
    expect(comboReduce(open(3), key('Enter'))).toEqual({ state: open(3), effect: null });
  });
  it('Enter on a closed list commits what is typed', () => {
    expect(comboReduce(comboStart(), key('Enter'))).toEqual({ state: comboStart(), effect: { type: 'commit' } });
  });
  it('Escape closes an open list, and on a closed one puts the saved city back', () => {
    expect(comboReduce(open(3, 1), key('Escape'))).toEqual({ state: comboStart(), effect: null });
    expect(comboReduce(comboStart(), key('Escape'))).toEqual({ state: comboStart(), effect: { type: 'revert' } });
  });
  it('other keys change nothing', () => {
    const state = open(3, 1);
    expect(comboReduce(state, key('a'))).toEqual({ state, effect: null });
    expect(comboReduce(state, key('Tab'))).toEqual({ state, effect: null });
    expect(comboReduce(state, { type: 'nonsense' })).toEqual({ state, effect: null });
  });
  it('does not change the state it is given', () => {
    const state = Object.freeze(open(3, 1));
    comboReduce(state, key('ArrowDown'));
    comboReduce(state, key('Enter'));
    expect(state).toEqual(open(3, 1));
  });
});

describe('cityOptionsHtml', () => {
  const RESULTS = [
    { name: 'Lisbon', country: 'Portugal', flag: 'pt' },
    { name: 'Porto <b>', country: 'Portugal "PT"', flag: 'pt' },
    { name: 'Nowhere', country: 'Unknown', flag: '../x' },
  ];
  it('writes one option per result with an id, its place in the list and what is active', () => {
    const html = cityOptionsHtml(RESULTS, 1, 'st-city-list');
    const options = html.match(/<li [^>]*role="option"[^>]*>/g);
    expect(options).toHaveLength(3);
    expect(options[0]).toContain(`id="${optionId('st-city-list', 0)}"`);
    expect(options[0]).toContain('data-index="0"');
    expect(options[0]).toContain('aria-selected="false"');
    expect(options[1]).toContain('aria-selected="true"');
    expect(options[1]).toContain('is-active');
    expect(options[0]).not.toContain('is-active');
  });
  it('escapes names and refuses a flag code that is not one', () => {
    const html = cityOptionsHtml(RESULTS, -1, 'st-city-list');
    expect(html).toContain('Porto &lt;b&gt;');
    expect(html).toContain('Portugal &quot;PT&quot;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('../x');
    expect(html.match(/flagcdn\.com/g)).toHaveLength(2);
  });
  it('is empty for no results', () => {
    expect(cityOptionsHtml([], -1, 'st-city-list')).toBe('');
    expect(cityOptionsHtml(null, -1, 'st-city-list')).toBe('');
  });
  it('flag images are decoration: the name is in the text', () => {
    for (const img of cityOptionsHtml(RESULTS, -1, 'st-city-list').match(/<img [^>]*>/g)) expect(img).toContain('alt=""');
  });
});
