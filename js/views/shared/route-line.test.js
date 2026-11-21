// route-line.js: the route line for flight, ground, multi-city and home plans (blueprint 2.1). Owner: F5.
import { describe, it, expect } from 'vitest';
import { routeLineHtml } from './route-line.js';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const line = (route, opts) => all(tree(routeLineHtml(route, opts)), '.ui-route')[0];
const end = (code, label, note = '') => ({ code, label, note });
const route = (kind, mode, over = {}) => ({ kind, mode, from: end(null, 'Lisbon'), to: end(null, 'Porto'), detail: '', booked: false, times: null, ...over });
const FLIGHT = DASHBOARD_FIXTURES.ready.next.route;
const BOOKED = route('flight', 'plane', { from: end('LIS', 'Lisbon'), to: end('YVR', 'Vancouver'), detail: '14h 20m with one stop', booked: true, times: { depart: '9:40 AM', arrive: '3:05 PM' } });

describe('routeLineHtml', () => {
  it('draws a flight with its codes, the names and the detail', () => {
    const el = line(FLIGHT);
    expect(attr(el, 'data-kind')).toBe('flight');
    expect(attr(el, 'data-mode')).toBe('plane');
    expect(all(el, '.ui-route-code').map(textOf)).toEqual(['LIS', 'RAK']);
    expect(all(el, '.ui-route-name').map(textOf)).toEqual(['Lisbon', 'Marrakech']);
    expect(textOf(all(el, '.ui-route-detail')[0])).toBe('1h 35m, suggested');
    expect(all(el, 'svg')).toHaveLength(1);
    expect(attr(el, 'role')).toBe('img');
    expect(attr(el, 'aria-label')).toBe('Lisbon (LIS) to Marrakech (RAK) by plane. 1h 35m, suggested.');
    expect(attr(el, 'data-booked')).toBeNull();
  });
  it('shows times only when the model has them, and says when it is booked', () => {
    const el = line(BOOKED);
    expect(all(el, '.ui-route-time').map(textOf)).toEqual(['9:40 AM', '3:05 PM']);
    expect(attr(el, 'data-booked')).toBe('');
    expect(attr(el, 'aria-label')).toBe('Lisbon (LIS) to Vancouver (YVR) by plane. 14h 20m with one stop. Departs 9:40 AM, arrives 3:05 PM. Booked.');
    expect(all(line(FLIGHT), '.ui-route-time')).toHaveLength(0);
  });
  it.each([
    ['plane', 'by plane'], ['train', 'by train'], ['bus', 'by bus'], ['ferry', 'by ferry'], ['car', 'by car'], ['taxi', 'by taxi'],
  ])('draws a ground journey by %s', (mode, words) => {
    const el = line(route('ground', mode, { from: end(null, 'Lisbon', 'Santa Apolónia'), to: end(null, 'Porto', 'Campanhã'), detail: 'About 3h' }));
    expect(attr(el, 'data-kind')).toBe('ground');
    expect(attr(el, 'data-mode')).toBe(mode);
    expect(all(el, 'svg')).toHaveLength(1);
    expect(all(el, '.ui-route-code')).toHaveLength(0);
    expect(all(el, '.ui-route-note').map(textOf)).toEqual(['Santa Apolónia', 'Campanhã']);
    expect(attr(el, 'aria-label')).toBe(`Lisbon, Santa Apolónia to Porto, Campanhã ${words}. About 3h.`);
  });
  it('gives each mode its own icon', () => {
    const icons = ['plane', 'train', 'bus', 'ferry', 'car', 'taxi'].map((mode) => {
      const html = routeLineHtml(route('ground', mode));
      return html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    });
    expect(new Set(icons).size).toBe(6);
  });
  it('draws a multi-city route', () => {
    const el = line(route('multi', 'plane', { from: end('LIS', 'Lisbon'), to: end('OSL', 'Oslo'), detail: '3 cities, via Bergen' }));
    expect(attr(el, 'data-kind')).toBe('multi');
    expect(textOf(all(el, '.ui-route-detail')[0])).toBe('3 cities, via Bergen');
    expect(attr(el, 'aria-label')).toBe('Lisbon (LIS) to Oslo (OSL) by plane. 3 cities, via Bergen.');
  });
  it('draws a plan at home as one place, not a journey', () => {
    const el = line(DASHBOARD_FIXTURES.homeCity.cardsById['s-lisbon'] ? route('home', 'car', { to: end(null, 'Lisbon'), detail: 'At home' }) : null);
    expect(attr(el, 'data-kind')).toBe('home');
    expect(all(el, '.ui-route-end')).toHaveLength(1);
    expect(textOf(all(el, '.ui-route-name')[0])).toBe('Lisbon');
    expect(textOf(all(el, '.ui-route-detail')[0])).toBe('At home');
    expect(attr(el, 'aria-label')).toBe('At home in Lisbon.');
  });
  it('falls back to the two names, with no mode, when nothing is known', () => {
    const el = line(route('none', 'plane'));
    expect(attr(el, 'data-kind')).toBe('none');
    expect(attr(el, 'data-mode')).toBeNull();
    expect(all(el, 'svg')).toHaveLength(0);
    expect(attr(el, 'aria-label')).toBe('Lisbon to Porto.');
  });
  it('treats a mode it does not know as no mode', () => {
    const el = line(route('ground', 'rocket"x'));
    expect(attr(el, 'data-mode')).toBeNull();
    expect(all(el, 'svg')).toHaveLength(0);
  });
  it('escapes hostile names, codes, notes, details and times', () => {
    const hostile = route('flight', 'plane', { from: end(HOSTILE, HOSTILE, HOSTILE), to: end(HOSTILE, HOSTILE, HOSTILE), detail: HOSTILE, times: { depart: HOSTILE, arrive: HOSTILE } });
    const root = tree(routeLineHtml(hostile));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, '.ui-route-detail')[0])).toBe(HOSTILE);
  });
  it('draws nothing without a route or without both names', () => {
    expect(routeLineHtml(null)).toBe('');
    expect(routeLineHtml(route('flight', 'plane', { to: end('RAK', '') }))).toBe('');
  });
  it('takes extra classes and does not change the route it was given', () => {
    const frozen = Object.freeze({ ...FLIGHT, from: Object.freeze({ ...FLIGHT.from }), to: Object.freeze({ ...FLIGHT.to }) });
    expect(attr(line(frozen, { cls: 'dep-route' }), 'class')).toBe('ui-route dep-route');
  });
});
