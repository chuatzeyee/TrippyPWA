// nav.js: the two pure halves of the app bar: the labelled links after the wordmark and the controls
// on the right (blueprint 4.3). Rendering, the theme write and the route listener are proven in a
// browser. Owner: F8.
import { describe, it, expect, vi } from 'vitest';
import { parseHtml, all, attr, textOf, classesOf } from '../views/fixtures/checks/html-tree.js';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false, setCachedUser: () => {} }));

const { navLinksHtml, navActionsHtml } = await import('./nav.js');

// Em dash, en dash, middle dot, bullet, ellipsis, arrow: the copy rules.
const BANNED = /[\u2014\u2013\u00b7\u2022\u2026\u2192]/;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(html).not.toMatch(BANNED);
  return root;
};
const links = (opts) => all(tree(navLinksHtml(opts)), 'a');
const labels = (opts) => links(opts).map(textOf);
const current = (opts) => links(opts).filter((a) => attr(a, 'aria-current') !== null);

describe('navLinksHtml', () => {
  it('draws Trips for everyone: signed out, every view, square layout, any route', () => {
    const cases = [
      { viewId: 'atlas', path: '/', signedIn: false, square: false },
      { viewId: 'departures', path: '/', signedIn: true, square: false },
      { viewId: 'concierge', path: '/trip/abc', signedIn: true, square: false },
      { viewId: 'atlas', path: '/', signedIn: true, square: true },
      { viewId: 'stub', path: '/settings', signedIn: true, square: false },
    ];
    for (const opts of cases) {
      const [first] = links(opts);
      expect(textOf(first)).toBe('Trips');
      expect(attr(first, 'href')).toBe('#/');
    }
  });

  it('draws Atlas only for the atlas view of someone signed in', () => {
    expect(labels({ viewId: 'atlas', path: '/', signedIn: true, square: false })).toEqual(['Trips', 'Atlas']);
    expect(labels({ viewId: 'departures', path: '/', signedIn: true, square: false })).toEqual(['Trips']);
    expect(labels({ viewId: 'concierge', path: '/', signedIn: true, square: false })).toEqual(['Trips']);
    expect(labels({ viewId: 'stub', path: '/', signedIn: true, square: false })).toEqual(['Trips']);
    expect(labels({ viewId: 'atlas', path: '/', signedIn: false, square: false })).toEqual(['Trips']);
    const [, atlas] = links({ viewId: 'atlas', path: '/', signedIn: true, square: false });
    expect(attr(atlas, 'href')).toBe('#/atlas');
  });

  it('never draws Atlas in square layout, where #/atlas bounces home', () => {
    expect(labels({ viewId: 'atlas', path: '/', signedIn: true, square: true })).toEqual(['Trips']);
    expect(labels({ viewId: 'atlas', path: '/atlas', signedIn: true, square: true })).toEqual(['Trips']);
  });

  it('puts aria-current="page" on the link of the open route and on no other', () => {
    const on = (path) => current({ viewId: 'atlas', path, signedIn: true, square: false });
    expect(on('/').map(textOf)).toEqual(['Trips']);
    expect(on('/atlas').map(textOf)).toEqual(['Atlas']);
    expect(on('/').map((a) => attr(a, 'aria-current'))).toEqual(['page']);
    expect(on('/trip/abc')).toEqual([]);
    expect(on('/settings')).toEqual([]);
    expect(on('/wizard/2')).toEqual([]);
    // The route is /atlas but the link is not drawn: nothing is marked.
    expect(current({ viewId: 'departures', path: '/atlas', signedIn: true, square: false })).toEqual([]);
  });

  it('reads the route with or without the #, with a query, and empty as home', () => {
    const on = (path) => current({ viewId: 'atlas', path, signedIn: true, square: false }).map(textOf);
    expect(on('#/')).toEqual(['Trips']);
    expect(on('')).toEqual(['Trips']);
    expect(on('#')).toEqual(['Trips']);
    expect(on('/?from=share')).toEqual(['Trips']);
    expect(on('#/atlas?region=asia')).toEqual(['Atlas']);
    expect(on('/atlas/')).toEqual([]);
    // The sign-in callback is not a route: the app draws the dashboard under it.
    expect(on('#access_token=abc&refresh_token=def')).toEqual(['Trips']);
  });

  it('gives every link the class the stylesheet sizes to 44 px', () => {
    for (const a of links({ viewId: 'atlas', path: '/', signedIn: true, square: false })) expect(classesOf(a)).toContain('nav-link');
  });

  it('does not throw on missing or odd input, and still draws Trips', () => {
    expect(labels()).toEqual(['Trips']);
    expect(labels({})).toEqual(['Trips']);
    expect(labels({ viewId: null, path: null, signedIn: 'yes', square: 0 })).toEqual(['Trips']);
    expect(current({ viewId: 'atlas', path: 42, signedIn: true, square: false })).toEqual([]);
  });
});

describe('navActionsHtml', () => {
  const GUEST = { account: false, pending: false, square: false, squareOverride: 'auto', theme: 'dark' };
  const ACCOUNT = { ...GUEST, account: true };
  const ids = (opts) => all(tree(navActionsHtml(opts)), '[id]').map((el) => attr(el, 'id'));

  it('without an avatar menu keeps the square toggle and the theme button in the bar', () => {
    expect(ids(GUEST)).toEqual(['square-toggle', 'theme-toggle', 'auth-slot']);
    expect(ids({ ...GUEST, square: true })).toEqual(['square-toggle', 'theme-toggle', 'auth-slot']);
  });

  it('with an avatar menu draws no bare theme button and no admin icon', () => {
    expect(ids(ACCOUNT)).toEqual(['auth-slot']);
    const html = navActionsHtml(ACCOUNT);
    expect(html).not.toContain('nav-admin-link');
    expect(html).not.toContain('#/admin');
    expect(navActionsHtml(GUEST)).not.toContain('#/admin');
  });

  it('with an avatar menu keeps the square toggle only while square layout is on', () => {
    expect(ids({ ...ACCOUNT, square: true })).toEqual(['square-toggle', 'auth-slot']);
    expect(ids({ ...ACCOUNT, square: true, squareOverride: 'on' })).toEqual(['square-toggle', 'auth-slot']);
    expect(ids({ ...ACCOUNT, square: false, squareOverride: 'off' })).toEqual(['auth-slot']);
  });

  it('while the stored session is being restored draws only the slot, so nothing appears and goes', () => {
    expect(ids({ ...GUEST, pending: true })).toEqual(['auth-slot']);
    expect(ids({ ...GUEST, pending: true, square: true })).toEqual(['square-toggle', 'auth-slot']);
  });

  it('labels the theme button with what a press does', () => {
    const button = (theme) => all(tree(navActionsHtml({ ...GUEST, theme })), 'button[id="theme-toggle"]')[0];
    expect(attr(button('dark'), 'aria-label')).toBe('Switch to light theme');
    expect(attr(button('light'), 'aria-label')).toBe('Switch to dark theme');
    expect(attr(button('dark'), 'type')).toBe('button');
  });

  it('writes the square override on the toggle, with its label', () => {
    const toggle = (squareOverride) => all(tree(navActionsHtml({ ...GUEST, squareOverride })), 'button[id="square-toggle"]')[0];
    expect(attr(toggle('auto'), 'data-square-state')).toBe('auto');
    expect(attr(toggle('on'), 'data-square-state')).toBe('on');
    expect(attr(toggle('off'), 'data-square-state')).toBe('off');
    expect(attr(toggle('on'), 'aria-label')).toBe('Square layout: on (tap to force off)');
    expect(attr(toggle('on'), 'title')).toBe(attr(toggle('on'), 'aria-label'));
    expect(attr(toggle('sideways'), 'data-square-state')).toBe('auto');
    expect(attr(toggle('"><b>'), 'aria-label')).toBe('Square layout: auto (tap to force on)');
  });

  it('does not throw without arguments and reads as signed out', () => {
    expect(ids()).toEqual(['square-toggle', 'theme-toggle', 'auth-slot']);
  });
});
