// auth-ui.js: the pure half of the avatar menu: the trigger, the panel and the context line
// (blueprint 4.3, ruling R3). Opening, the keyboard and the theme write are proven in a browser.
// Owner: F8.
import { describe, it, expect, vi } from 'vitest';
import { parseHtml, all, attr, textOf, classesOf, ancestor } from '../views/fixtures/checks/html-tree.js';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false, setCachedUser: () => {} }));

const { accountMenuHtml, accountButtonHtml, accountContextLine, ACCOUNT_MENU_ID } = await import('./auth-ui.js');

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
// Em dash, en dash, middle dot, bullet, ellipsis, arrow: the copy rules.
const BANNED = /[\u2014\u2013\u00b7\u2022\u2026\u2192]/;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(html).not.toMatch(BANNED);
  return root;
};
const BASE = { name: 'Sam', contextLine: 'Home is Lisbon, prices in EUR', theme: 'dark', square: 'auto', isAdmin: false };
const menu = (opts = {}) => tree(accountMenuHtml({ ...BASE, ...opts }));
const group = (root, label) => all(root, '[role="group"]').find((el) => attr(el, 'aria-label') === label);
const radios = (root, label) => all(group(root, label), '[role="menuitemradio"]');
const checked = (root, label) => radios(root, label).filter((el) => attr(el, 'aria-checked') === 'true').map(textOf);

describe('accountMenuHtml', () => {
  it('is the panel the shared menu component drives (ruling R3)', () => {
    const root = menu();
    const [panel] = all(root, 'dialog');
    expect(attr(panel, 'id')).toBe(ACCOUNT_MENU_ID);
    expect(attr(panel, 'data-menu')).toBe('');
    expect(classesOf(panel)).toContain('ui-menu');
    expect(attr(panel, 'aria-label')).toBe('Account');
    expect(all(panel, '[role="menu"]')).toHaveLength(1);
    expect(all(root, 'dialog')).toHaveLength(1);
  });

  it('shows the name and the context line above the items', () => {
    const root = menu();
    expect(textOf(all(root, '.auth-menu-name')[0])).toBe('Sam');
    expect(textOf(all(root, '.auth-menu-context')[0])).toBe('Home is Lisbon, prices in EUR');
    // The heading is not an item: it sits outside the list.
    expect(ancestor(all(root, '.auth-menu-name')[0], '[role="menu"]')).toBeNull();
  });

  it('leaves the context line out when there is none', () => {
    expect(all(menu({ contextLine: '' }), '.auth-menu-context')).toHaveLength(0);
    expect(all(menu({ contextLine: null }), '.auth-menu-context')).toHaveLength(0);
    expect(all(menu({ contextLine: '   ' }), '.auth-menu-context')).toHaveLength(0);
  });

  it('links to Settings, and Edit Profile is gone', () => {
    const root = menu();
    const items = all(root, '[role="menuitem"]');
    expect(items.map(textOf)).toEqual(['Settings', 'Sign out']);
    expect(items[0].tag).toBe('a');
    expect(attr(items[0], 'href')).toBe('#/settings');
    const html = accountMenuHtml(BASE);
    expect(html).not.toMatch(/edit profile/i);
    expect(html).not.toContain('#/profile');
  });

  it('draws Theme as a labelled group of three menuitemradio buttons', () => {
    const root = menu();
    const theme = group(root, 'Theme');
    expect(theme).toBeTruthy();
    expect(radios(root, 'Theme').map(textOf)).toEqual(['Dark', 'Light', 'Match device']);
    expect(radios(root, 'Theme').map((el) => attr(el, 'data-value'))).toEqual(['dark', 'light', 'system']);
    for (const radio of radios(root, 'Theme')) {
      expect(radio.tag).toBe('button');
      expect(attr(radio, 'type')).toBe('button');
      expect(attr(radio, 'data-account-radio')).toBe('theme');
      expect(['true', 'false']).toContain(attr(radio, 'aria-checked'));
      // data-theme on a control would switch the colour tokens inside it (css/tokens.css).
      expect(attr(radio, 'data-theme')).toBeNull();
    }
  });

  it('checks exactly the stored theme, and Match device for anything else', () => {
    expect(checked(menu({ theme: 'dark' }), 'Theme')).toEqual(['Dark']);
    expect(checked(menu({ theme: 'light' }), 'Theme')).toEqual(['Light']);
    expect(checked(menu({ theme: 'system' }), 'Theme')).toEqual(['Match device']);
    expect(checked(menu({ theme: 'sepia' }), 'Theme')).toEqual(['Match device']);
    expect(checked(menu({ theme: undefined }), 'Theme')).toEqual(['Match device']);
  });

  it('draws Square layout as a labelled group of three menuitemradio buttons', () => {
    const root = menu();
    expect(radios(root, 'Square layout').map(textOf)).toEqual(['Auto', 'On', 'Off']);
    expect(radios(root, 'Square layout').map((el) => attr(el, 'data-value'))).toEqual(['auto', 'on', 'off']);
    for (const radio of radios(root, 'Square layout')) expect(attr(radio, 'data-account-radio')).toBe('square');
    expect(checked(menu({ square: 'auto' }), 'Square layout')).toEqual(['Auto']);
    expect(checked(menu({ square: 'on' }), 'Square layout')).toEqual(['On']);
    expect(checked(menu({ square: 'off' }), 'Square layout')).toEqual(['Off']);
    expect(checked(menu({ square: 'maybe' }), 'Square layout')).toEqual(['Auto']);
  });

  it('keeps every item and both groups inside the one role="menu"', () => {
    const root = menu({ isAdmin: true });
    const [list] = all(root, '[role="menu"]');
    const inList = (el) => ancestor(el, '[role="menu"]') === list;
    expect(all(root, '[role="menuitem"]').every(inList)).toBe(true);
    expect(all(root, '[role="menuitemradio"]').every(inList)).toBe(true);
    expect(all(root, '[role="group"]').every(inList)).toBe(true);
    expect(all(root, '[role="menuitemradio"]')).toHaveLength(6);
    // The words Theme and Square layout are read once, from the group label.
    for (const label of all(root, '.auth-menu-group-label')) expect(attr(label, 'aria-hidden')).toBe('true');
  });

  it('draws Admin only for an admin, between the groups and Sign out', () => {
    expect(all(menu(), '[role="menuitem"]').map(textOf)).not.toContain('Admin');
    expect(accountMenuHtml(BASE)).not.toContain('#/admin');
    const items = all(menu({ isAdmin: true }), '[role="menuitem"]');
    expect(items.map(textOf)).toEqual(['Settings', 'Admin', 'Sign out']);
    expect(attr(items[1], 'href')).toBe('#/admin');
    for (const truthy of ['true', 1, {}]) expect(accountMenuHtml({ ...BASE, isAdmin: truthy })).not.toContain('#/admin');
  });

  it('ends with Sign out, a button that carries its action', () => {
    const items = all(menu({ isAdmin: true }), '[role^="menuitem"]');
    const last = items[items.length - 1];
    expect(textOf(last)).toBe('Sign out');
    expect(last.tag).toBe('button');
    expect(attr(last, 'type')).toBe('button');
    expect(attr(last, 'data-account-action')).toBe('sign-out');
  });

  it('orders the items: Settings, Theme, Square layout, Admin, Sign out', () => {
    const order = all(menu({ isAdmin: true }), '[role^="menuitem"]').map(textOf);
    expect(order).toEqual(['Settings', 'Dark', 'Light', 'Match device', 'Auto', 'On', 'Off', 'Admin', 'Sign out']);
  });

  it('escapes the name and the context line', () => {
    const html = accountMenuHtml({ ...BASE, name: HOSTILE, contextLine: HOSTILE });
    const root = tree(html);
    expect(all(root, 'img')).toHaveLength(0);
    expect(html).not.toContain('<img');
    expect(textOf(all(root, '.auth-menu-name')[0])).toBe(HOSTILE);
    expect(textOf(all(root, '.auth-menu-context')[0])).toBe(HOSTILE);
  });

  it('does not throw without arguments', () => {
    const root = tree(accountMenuHtml());
    expect(all(root, '[role="menuitem"]').map(textOf)).toEqual(['Settings', 'Sign out']);
    expect(checked(root, 'Theme')).toEqual(['Match device']);
    expect(checked(root, 'Square layout')).toEqual(['Auto']);
  });
});

describe('accountButtonHtml', () => {
  it('is the trigger the shared menu component drives (ruling R3)', () => {
    const [trigger] = all(tree(accountButtonHtml({ name: 'Sam', avatarUrl: '' })), 'button');
    expect(attr(trigger, 'data-menu-open')).toBe(ACCOUNT_MENU_ID);
    expect(attr(trigger, 'aria-haspopup')).toBe('menu');
    expect(attr(trigger, 'aria-expanded')).toBe('false');
    expect(attr(trigger, 'aria-controls')).toBe(ACCOUNT_MENU_ID);
    expect(attr(trigger, 'aria-label')).toBe('Account menu');
    expect(attr(trigger, 'type')).toBe('button');
    expect(attr(trigger, 'id')).toBe('auth-user-toggle');
  });

  it('shows the photo when there is one, else the first letter of the name', () => {
    const withPhoto = tree(accountButtonHtml({ name: 'Sam', avatarUrl: 'https://example.com/a.png' }));
    const [img] = all(withPhoto, 'img');
    expect(attr(img, 'src')).toBe('https://example.com/a.png');
    expect(attr(img, 'alt')).toBe('');
    expect(attr(img, 'referrerpolicy')).toBe('no-referrer');
    const initial = tree(accountButtonHtml({ name: 'sam', avatarUrl: '' }));
    expect(all(initial, 'img')).toHaveLength(0);
    expect(textOf(all(initial, '.auth-avatar--initials')[0])).toBe('S');
  });

  it('refuses an address that is not http(s) and escapes the rest', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/a.png', HOSTILE]) {
      expect(all(tree(accountButtonHtml({ name: 'Sam', avatarUrl: bad })), 'img')).toHaveLength(0);
    }
    const root = tree(accountButtonHtml({ name: HOSTILE, avatarUrl: `https://example.com/a.png?x="><b>` }));
    expect(all(root, 'b')).toHaveLength(0);
    expect(attr(all(root, 'img')[0], 'src')).toBe('https://example.com/a.png?x="><b>');
  });

  it('does not throw without a name', () => {
    expect(all(tree(accountButtonHtml()), 'button')).toHaveLength(1);
    expect(textOf(all(tree(accountButtonHtml({ name: '', avatarUrl: null })), '.auth-avatar--initials')[0])).toBe('');
  });
});

describe('accountContextLine', () => {
  const summary = (over) => ({ userId: 'u1', home_city: 'Lisbon', home_country: 'Portugal', home_currency: 'EUR', is_nomad: false, ...over });

  it('names the home and the currency prices are shown in', () => {
    expect(accountContextLine(summary())).toBe('Home is Lisbon, prices in EUR');
    expect(accountContextLine(summary({ home_city: null, home_country: 'Norway', home_currency: 'NOK' }))).toBe('Home is Norway, prices in NOK');
  });

  it('says only what is known', () => {
    expect(accountContextLine(summary({ home_currency: null }))).toBe('Home is Lisbon');
    expect(accountContextLine(summary({ home_city: null, home_country: null }))).toBe('Prices in EUR');
    expect(accountContextLine(summary({ home_city: '  ', home_country: '', home_currency: ' ' }))).toBe('');
  });

  it('names no home for someone with no home base', () => {
    expect(accountContextLine(summary({ is_nomad: true }))).toBe('Prices in EUR');
    expect(accountContextLine(summary({ is_nomad: true, home_currency: null }))).toBe('');
  });

  it('is empty without a summary', () => {
    expect(accountContextLine(null)).toBe('');
    expect(accountContextLine(undefined)).toBe('');
    expect(accountContextLine('Lisbon')).toBe('');
  });

  it('does not change the summary', () => {
    const input = Object.freeze(summary());
    expect(() => accountContextLine(input)).not.toThrow();
  });
});
