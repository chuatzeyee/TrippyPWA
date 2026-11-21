// credits.js: photo sources, the credits list and the trip page foot (blueprint 4.2, 8.5). Owner: F5.
import { describe, it, expect } from 'vitest';
import { PHOTO_SOURCES_HTML, MAP_ATTRIBUTION_HTML, creditsListHtml, tripFootHtml } from './credits.js';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const { credits } = DASHBOARD_FIXTURES.ready;

describe('PHOTO_SOURCES_HTML', () => {
  it('names the sources the trip page has always named, with links that open safely', () => {
    const root = tree(PHOTO_SOURCES_HTML);
    const text = textOf(root);
    for (const source of ['Wikimedia Commons', 'Openverse', 'venue websites', 'Google Maps', 'Pexels']) expect(text).toContain(source);
    expect(text.startsWith('Photos via')).toBe(true);
    const links = all(root, 'a');
    expect(links.map((a) => attr(a, 'href'))).toEqual(['https://commons.wikimedia.org', 'https://openverse.org', 'https://www.pexels.com']);
    expect(links.every((a) => attr(a, 'rel') === 'noopener noreferrer' && attr(a, 'target') === '_blank')).toBe(true);
  });
});

describe('MAP_ATTRIBUTION_HTML', () => {
  it('credits OpenStreetMap', () => {
    const root = tree(MAP_ATTRIBUTION_HTML);
    expect(textOf(root)).toBe('Map data © OpenStreetMap contributors');
    expect(attr(all(root, 'a')[0], 'href')).toBe('https://www.openstreetmap.org/copyright');
  });
});

describe('creditsListHtml', () => {
  it('lists every credit in full, linked to its source, inside a keyed details group', () => {
    const root = tree(creditsListHtml(credits));
    const [group] = all(root, 'details');
    expect(attr(group, 'data-key')).toBe('credits');
    expect(textOf(all(group, 'summary')[0])).toBe('Photo credits');
    const rows = all(group, 'li');
    expect(rows).toHaveLength(credits.length);
    expect(textOf(rows[0])).toBe(credits[0].full);
    expect(attr(all(rows[0], 'a')[0], 'href')).toBe(credits[0].link);
  });
  it('lists the same credit once', () => {
    expect(all(tree(creditsListHtml([credits[0], credits[0], credits[1]])), 'li')).toHaveLength(2);
  });
  it('writes plain text for a credit with no safe link, and falls back to the short label', () => {
    const root = tree(creditsListHtml([{ label: 'Pexels', full: '', link: 'javascript:alert(1)' }]));
    expect(all(root, 'a')).toHaveLength(0);
    expect(textOf(all(root, 'li')[0])).toBe('Pexels');
  });
  it('escapes hostile text', () => {
    const root = tree(creditsListHtml([{ label: HOSTILE, full: HOSTILE, link: 'https://example.test/?a=1&b=2' }]));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, 'li')[0])).toBe(HOSTILE);
  });
  it('can start open, takes a key of its own, and draws nothing for no credits', () => {
    expect(attr(all(tree(creditsListHtml(credits, { open: true })), 'details')[0], 'open')).toBe('');
    expect(attr(all(tree(creditsListHtml(credits)), 'details')[0], 'open')).toBeNull();
    expect(attr(all(tree(creditsListHtml(credits, { key: 'dash-credits' })), 'details')[0], 'data-key')).toBe('dash-credits');
    expect(creditsListHtml([])).toBe('');
    expect(creditsListHtml(null)).toBe('');
  });
});

describe('tripFootHtml', () => {
  it('is the one foot of the trip page: sources, credits, and the map line when a map is drawn', () => {
    const root = tree(tripFootHtml(TRIP_FIXTURES.upcoming.credits, { map: true }));
    const feet = all(root, 'footer.tv-foot');
    expect(feet).toHaveLength(1);
    expect(textOf(feet[0])).toContain('Photos via');
    expect(all(feet[0], 'details')).toHaveLength(1);
    expect(all(feet[0], 'li')).toHaveLength(TRIP_FIXTURES.upcoming.credits.length);
    expect(textOf(feet[0])).toContain('Map data © OpenStreetMap contributors');
  });
  it('leaves the map line out when no map is drawn', () => {
    expect(textOf(tree(tripFootHtml(credits)))).not.toContain('OpenStreetMap');
    expect(textOf(tree(tripFootHtml(credits, { map: false })))).not.toContain('OpenStreetMap');
  });
  it('still names the sources when there are no credits', () => {
    const root = tree(tripFootHtml([]));
    expect(textOf(root)).toContain('Photos via');
    expect(all(root, 'details')).toHaveLength(0);
  });
});

describe('focus keys (blueprint 3.5 rule 4)', () => {
  const CONTROLS = 'a, button, summary, input, select, textarea';
  const keysOf = (root) => all(root, CONTROLS).map((el) => attr(el, 'data-focus-key'));
  const allKeyed = (keys) => keys.every((key) => typeof key === 'string' && key !== '');

  it('names every link of the two source lines', () => {
    expect(keysOf(tree(PHOTO_SOURCES_HTML))).toEqual(['source-commons', 'source-openverse', 'source-pexels']);
    expect(keysOf(tree(MAP_ATTRIBUTION_HTML))).toEqual(['source-osm']);
  });
  it('names every link of the credits list, each with a key of its own', () => {
    const keys = keysOf(tree(creditsListHtml(credits)));
    expect(keys).toHaveLength(credits.length + 1);
    expect(allKeyed(keys)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('credits');
    expect(keys[1]).toBe(`credits-${credits[0].link}`);
  });
  it('keeps the keys apart when two credits share one source page', () => {
    const same = [
      { label: 'Pexels', full: 'Photo: Ana Reis, Pexels', link: 'https://www.pexels.com/' },
      { label: 'Pexels', full: 'Photo: Rui Costa, Pexels', link: 'https://www.pexels.com/' },
      { label: 'Pexels', full: 'Photo: Eva Lima, Pexels', link: 'https://www.pexels.com/' },
    ];
    const keys = keysOf(tree(creditsListHtml(same))).slice(1);
    expect(keys).toEqual(['credits-https://www.pexels.com/', 'credits-https://www.pexels.com/-2', 'credits-https://www.pexels.com/-3']);
  });
  it('keeps the same key for a credit when another is added after it', () => {
    const before = keysOf(tree(creditsListHtml(credits.slice(0, 2))));
    const after = keysOf(tree(creditsListHtml(credits)));
    expect(after.slice(0, before.length)).toEqual(before);
  });
  it('builds the keys of a second list from its own key, so two lists on one page do not clash', () => {
    const keys = keysOf(tree(creditsListHtml(credits, { key: 'dash-credits' })));
    expect(keys.every((key) => key.startsWith('dash-credits'))).toBe(true);
  });
  it('does not share a key with the credit chip of the same photo', () => {
    const chipKey = `credit-${credits[0].link}`;
    expect(keysOf(tree(creditsListHtml(credits)))).not.toContain(chipKey);
  });
  it('escapes a hostile link inside the key', () => {
    const root = tree(creditsListHtml([{ label: 'x', full: 'x', link: `https://example.test/?q="><img src=x onerror=alert(1)>` }]));
    expect(all(root, 'img')).toHaveLength(0);
    expect(attr(all(all(root, 'li')[0], 'a')[0], 'data-focus-key')).toBe(`credits-https://example.test/?q="><img src=x onerror=alert(1)>`);
  });
  it('leaves no control of the trip foot without a key, and repeats none', () => {
    const keys = keysOf(tree(tripFootHtml(TRIP_FIXTURES.upcoming.credits, { map: true })));
    expect(keys.length).toBeGreaterThan(4);
    expect(allKeyed(keys)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
