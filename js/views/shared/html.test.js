// html.js: escaping and the smallest markup builders (blueprint 1.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { esc, attr, attrs, cls, flagChip, link, button, visuallyHidden, safeHref, safeSrc } from './html.js';
import { readFileSync } from 'node:fs';
import { parseHtml, all, attr as read, textOf } from '../fixtures/checks/html-tree.js';
import { parseCss } from '../fixtures/checks/css-spec.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  return root;
};

describe('esc', () => {
  it('escapes the five characters', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('keeps zero and false as text, and turns null and undefined into nothing', () => {
    expect(esc(0)).toBe('0');
    expect(esc(false)).toBe('false');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
  it('does not escape twice by accident', () => {
    expect(esc('&amp;')).toBe('&amp;amp;');
  });
});

describe('attr and attrs', () => {
  it('writes a leading space, the name and the escaped value', () => {
    expect(attr('title', 'a "b" <c>')).toBe(' title="a &quot;b&quot; &lt;c&gt;"');
  });
  it('leaves the attribute out for null, undefined and false', () => {
    expect(attr('hidden', null)).toBe('');
    expect(attr('hidden', undefined)).toBe('');
    expect(attr('hidden', false)).toBe('');
  });
  it('writes a bare attribute for true and keeps zero and the empty string', () => {
    expect(attr('hidden', true)).toBe(' hidden');
    expect(attr('data-n', 0)).toBe(' data-n="0"');
    expect(attr('alt', '')).toBe(' alt=""');
  });
  it('refuses a name that is not an attribute name', () => {
    expect(attr('x onclick="y"', 'z')).toBe('');
    expect(attr('on click', 'z')).toBe('');
  });
  it('refuses an inline event handler', () => {
    expect(attr('onclick', 'alert(1)')).toBe('');
    expect(attr('ONERROR', 'alert(1)')).toBe('');
  });
  it('joins a map of attributes in order', () => {
    expect(attrs({ id: 'a', hidden: false, 'data-x': '<' })).toBe(' id="a" data-x="&lt;"');
    expect(attrs(null)).toBe('');
  });
});

describe('cls', () => {
  it('joins strings, lists and flag maps, dropping what is falsy', () => {
    expect(cls('a', null, ['b', false, 'c'], { d: true, e: 0 }, '')).toBe('a b c d');
  });
  it('splits on spaces and drops repeats', () => {
    expect(cls('a b', 'b')).toBe('a b');
  });
  it('drops a token that is not a class name', () => {
    expect(cls('ok', 'bad"onx', '<i>')).toBe('ok');
  });
});

describe('safeHref and safeSrc', () => {
  it('keeps hash routes and http(s) links', () => {
    expect(safeHref('#/trip/1')).toBe('#/trip/1');
    expect(safeHref('#')).toBe('#');
    expect(safeHref('https://example.test/a?b=1')).toBe('https://example.test/a?b=1');
  });
  it('drops scripts, data URLs and anything else', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.test', 'trip.html', '', null, undefined, 4]) {
      expect(safeHref(bad)).toBe('');
    }
  });
  it('keeps http(s) images and public paths, drops the rest', () => {
    expect(safeSrc('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
    expect(safeSrc('/img/views/atlas-dark.webp')).toBe('/img/views/atlas-dark.webp');
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.test/a.jpg', 'img/a.jpg', '', null]) expect(safeSrc(bad)).toBe('');
  });
});

describe('flagChip', () => {
  it('draws a flag image for a two-letter code', () => {
    const [img] = all(tree(flagChip('pt')), 'img.ui-flag');
    expect(read(img, 'src')).toBe('https://flagcdn.com/w40/pt.png');
    expect(read(img, 'width')).toBe('20');
    expect(read(img, 'height')).toBe('15');
    expect(read(img, 'alt')).toBe('');
  });
  it('accepts a subdivision code and a larger size', () => {
    const [img] = all(tree(flagChip('gb-sct', { size: 28, label: 'Scotland' })), 'img');
    expect(read(img, 'src')).toBe('https://flagcdn.com/w80/gb-sct.png');
    expect(read(img, 'height')).toBe('21');
    expect(read(img, 'alt')).toBe('Scotland');
  });
  it('gives nothing for anything else', () => {
    for (const bad of ['', null, undefined, 'PT', 'p', 'ptx', 'p"t', '../x', '<b>', 12]) expect(flagChip(bad)).toBe('');
  });
});

describe('link', () => {
  it('writes the link, its classes, the focus key and extra attributes', () => {
    const [a] = all(tree(link('#/trip/7', 'Open today', { cls: 'ui-btn', focusKey: 'today-7', attrs: { 'data-now-trip': '7' } })), 'a');
    expect(read(a, 'href')).toBe('#/trip/7');
    expect(read(a, 'class')).toBe('ui-btn');
    expect(read(a, 'data-focus-key')).toBe('today-7');
    expect(read(a, 'data-now-trip')).toBe('7');
    expect(textOf(a)).toBe('Open today');
  });
  it('escapes a hostile label and hostile attribute values', () => {
    const html = link('#/', HOSTILE, { focusKey: HOSTILE, attrs: { title: HOSTILE } });
    const root = tree(html);
    expect(all(root, 'img')).toHaveLength(0);
    const [a] = all(root, 'a');
    expect(textOf(a)).toBe(HOSTILE);
    expect(read(a, 'title')).toBe(HOSTILE);
  });
  it('opens an outside link in a new tab without a referrer', () => {
    const [a] = all(tree(link('https://example.test/', 'Source')), 'a');
    expect(read(a, 'rel')).toBe('noopener noreferrer');
    expect(read(a, 'target')).toBe('_blank');
  });
  it('writes plain text in a span when the address is unsafe', () => {
    const root = tree(link('javascript:alert(1)', 'Source', { cls: 'ui-credit' }));
    expect(all(root, 'a')).toHaveLength(0);
    expect(textOf(all(root, 'span.ui-credit')[0])).toBe('Source');
  });
  it('takes trusted inner markup through opts.html', () => {
    const root = tree(link('#/', 'ignored', { html: '<b>Trips</b>' }));
    expect(all(root, 'b')).toHaveLength(1);
  });
});

describe('button', () => {
  it('is a real button with a type, an action and a focus key', () => {
    const [el] = all(tree(button('Plan a trip', { action: 'new-trip', cls: ['ui-btn', 'ui-btn--primary'] })), 'button');
    expect(read(el, 'type')).toBe('button');
    expect(read(el, 'data-action')).toBe('new-trip');
    expect(read(el, 'data-focus-key')).toBe('new-trip');
    expect(read(el, 'class')).toBe('ui-btn ui-btn--primary');
    expect(textOf(el)).toBe('Plan a trip');
  });
  it('takes its own focus key, a disabled state and a pressed state', () => {
    const [el] = all(tree(button('Past', { focusKey: 'filter-past', disabled: true, pressed: false, attrs: { 'data-filter': 'past' } })), 'button');
    expect(read(el, 'data-focus-key')).toBe('filter-past');
    expect(read(el, 'disabled')).toBe('');
    expect(read(el, 'aria-pressed')).toBe('false');
    expect(read(el, 'data-filter')).toBe('past');
  });
  it('escapes a hostile label', () => {
    const root = tree(button(HOSTILE, { action: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, 'button')[0])).toBe(HOSTILE);
  });
  it('takes the shared base class when it is given no class, so it never shows the browser face', () => {
    const bare = [
      button('Plan a trip'), button('Plan a trip', {}), button('Plan a trip', { action: 'new-trip' }), button('Plan a trip', { cls: '' }),
      button('Plan a trip', { cls: null }), button('Plan a trip', { cls: [] }), button('Plan a trip', { cls: { 'is-on': false } }),
      button('Plan a trip', { cls: HOSTILE }),
    ];
    for (const html of bare) expect(read(all(tree(html), 'button')[0], 'class')).toBe('ui-btn');
  });
  it('keeps the classes it is given and adds none', () => {
    const classOf = (opts) => read(all(tree(button('Past', opts)), 'button')[0], 'class');
    expect(classOf({ cls: 'ui-chip' })).toBe('ui-chip');
    expect(classOf({ cls: ['atl-open', { 'is-on': true }] })).toBe('atl-open is-on');
    expect(classOf({ cls: 'ui-btn ui-btn--small' })).toBe('ui-btn ui-btn--small');
  });
});

describe('what css/views/shared/common.css gives these builders', () => {
  const { rules, errors } = parseCss(readFileSync(new URL('../../../css/views/shared/common.css', import.meta.url), 'utf8'));
  // The declarations a class gets at every width and in both themes: rules outside any at-rule whose
  // selector is [data-view] :where(...) with `.name` alone as one of its branches.
  const baseLook = (name) => {
    const own = rules.filter((rule) => rule.at.length === 0 && rule.selectors.some((selector) => {
      const inner = /^\[data-view\] :where\((.*)\)$/.exec(selector.trim());
      return Boolean(inner) && inner[1].split(',').map((branch) => branch.trim()).includes(`.${name}`);
    }));
    return Object.fromEntries(own.flatMap((rule) => rule.declarations.map((declaration) => [declaration.prop, declaration.value])));
  };

  it('reads the sheet', () => {
    expect(errors).toEqual([]);
    expect(rules.length).toBeGreaterThan(50);
  });
  it.each(['ui-btn', 'ui-menu-btn', 'ui-chip', 'ui-ready-action'])('.%s sets its own face, border and ink, and is a 44 px target', (name) => {
    const look = baseLook(name);
    expect(look.background).toBeTruthy();
    expect(look.border).toBeTruthy();
    expect(look.color).toMatch(/^var\(--ink/);
    expect(look['min-height']).toBe('var(--ui-target)');
    expect(look.font).toBeTruthy();
    expect(look.cursor).toBe('pointer');
  });
  it('.ui-vh keeps hidden text at the left edge of its containing block, so it cannot widen the page from inside a sideways scroller', () => {
    // An absolutely placed box with no placed ancestor inside the scroller is not clipped by it. Left at
    // its static place (far along the scrolled row) it would add that distance to the width of the page.
    const look = baseLook('ui-vh');
    expect(look.position).toBe('absolute');
    expect(look.left).toBe('0');
    expect(look.top).toBeUndefined(); // it stays on its own line: a screen reader that scrolls to it does not jump to the top
    expect([look.width, look.height, look.overflow]).toEqual(['1px', '1px', 'hidden']);
  });
  it('the base class a bare button() takes is one of them', () => {
    const base = read(all(tree(button('Plan a trip')), 'button')[0], 'class');
    expect(baseLook(base).background).toBeTruthy();
    expect(baseLook(base)['min-width']).toBe('var(--ui-target)');
  });
});

describe('visuallyHidden', () => {
  it('wraps escaped text in the hidden-text class', () => {
    const [span] = all(tree(visuallyHidden('12 <days>')), 'span.ui-vh');
    expect(textOf(span)).toBe('12 <days>');
  });
  it('gives nothing for empty text', () => {
    expect(visuallyHidden('')).toBe('');
    expect(visuallyHidden(null)).toBe('');
  });
});
