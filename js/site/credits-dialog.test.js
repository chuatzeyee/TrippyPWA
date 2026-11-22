// The photo credits dialog: what it prints for a page, and what it reads from one.
import { describe, it, expect } from 'vitest';
import { collectPageCredits, creditsDialogHtml } from './credits-dialog.js';
import { tFor } from '../lib/i18n.js';

const t = tFor('en');
const HOSTILE = '<img src=x onerror=alert(1)>';

describe('creditsDialogHtml', () => {
  it('lists every photo with its link, names the providers, then the maps of the page', () => {
    const html = creditsDialogHtml({
      photos: [{ text: 'Kyoto by A. Photographer, CC BY 4.0', href: 'https://commons.wikimedia.org/wiki/File:Kyoto.jpg' }, { text: 'No link', href: '' }],
      sources: true, naturalEarth: true, osm: true,
    }, t);
    expect(html).toContain('<h2 class="site-dialog-title" id="site-credits-title">Photo credits</h2>');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('<li class="site-dialog-photo"><a href="https://commons.wikimedia.org/wiki/File:Kyoto.jpg" target="_blank" rel="noopener noreferrer">Kyoto by A. Photographer, CC BY 4.0</a></li>');
    expect(html).toContain('<li class="site-dialog-photo">No link</li>');
    expect(html).toContain('<a href="https://openverse.org" target="_blank" rel="noopener noreferrer">Openverse</a> (Creative Commons)');
    expect(html).toContain('<li>World outline: Natural Earth, public domain.</li>');
    expect(html).toContain('<li>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors.</li>');
    expect(html).not.toContain('site-dialog-empty');
  });
  it('says so in a plain sentence when the page credits nothing', () => {
    const html = creditsDialogHtml({ photos: [], sources: false, naturalEarth: false, osm: false }, t);
    expect(html).toContain('<p class="site-dialog-empty">This page shows no photos that need a credit.</p>');
    expect(html).not.toContain('<ul');
    expect(creditsDialogHtml(null, t)).toContain('site-dialog-empty');
  });
  it('prints only the map credits that apply', () => {
    const atlas = creditsDialogHtml({ photos: [], sources: false, naturalEarth: true, osm: false }, t);
    expect(atlas).toContain('Natural Earth');
    expect(atlas).not.toContain('OpenStreetMap');
    expect(atlas).not.toContain('site-dialog-empty');
    expect(atlas).not.toContain('Wikimedia');
  });
  it('escapes a credit and a translated sentence', () => {
    const html = creditsDialogHtml({ photos: [{ text: HOSTILE, href: `https://example.test/?q="><script>` }], sources: true, naturalEarth: false, osm: true },
      (key) => (key === 'credits.osm' ? `${HOSTILE} {osm}` : key === 'credits.sources' ? `{commons} ${HOSTILE}` : t(key)));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('OpenStreetMap</a>');
    expect(html).toContain('Wikimedia Commons</a>');
  });
});

// A stand-in for the few DOM calls the reader makes.
function fakeRoot({ items = [], lines = [], has = [] } = {}) {
  const item = ({ text, href }) => ({ textContent: text, querySelector: () => (href === undefined ? null : { getAttribute: () => href }) });
  return {
    querySelectorAll: (selector) => (selector === '.ui-credits-list li' ? items.map(item) : selector === '.ui-foot-line' ? lines.map((text) => ({ textContent: text })) : []),
    querySelector: (selector) => (selector.split(', ').some((part) => has.includes(part)) ? {} : null),
  };
}

describe('collectPageCredits', () => {
  it('reads the photo credits once each, and keeps only a web address as a link', () => {
    const got = collectPageCredits(fakeRoot({ items: [
      { text: '  Kyoto   by A ', href: 'https://a.test/1' }, { text: 'Kyoto by A', href: 'https://a.test/1' },
      { text: 'Local', href: 'javascript:alert(1)' }, { text: 'Plain' }, { text: '   ', href: 'https://a.test/2' },
    ] }));
    expect(got.photos).toEqual([{ text: 'Kyoto by A', href: 'https://a.test/1' }, { text: 'Local', href: '' }, { text: 'Plain', href: '' }]);
    expect(got.sources).toBe(true);
  });
  it('knows the world outline from the line the atlas prints or from the drawing itself', () => {
    expect(collectPageCredits(fakeRoot({ lines: ['Map outline: Natural Earth, public domain.'] })).naturalEarth).toBe(true);
    expect(collectPageCredits(fakeRoot({ has: ['svg.wm-plate'] })).naturalEarth).toBe(true);
    expect(collectPageCredits(fakeRoot()).naturalEarth).toBe(false);
  });
  it('knows an OpenStreetMap map and a trip page', () => {
    expect(collectPageCredits(fakeRoot({ has: ['.leaflet-container'] })).osm).toBe(true);
    expect(collectPageCredits(fakeRoot({ has: ['.tv-foot [data-focus-key="source-osm"]'] })).osm).toBe(true);
    expect(collectPageCredits(fakeRoot({ has: ['.tv-foot'] }))).toMatchObject({ photos: [], sources: true, osm: false });
    expect(collectPageCredits(fakeRoot({ has: ['.td-footer-credit'] }))).toMatchObject({ sources: true, osm: false });
  });
  it('a page with nothing, or no page, credits nothing', () => {
    const none = { photos: [], sources: false, naturalEarth: false, osm: false };
    expect(collectPageCredits(fakeRoot())).toEqual(none);
    expect(collectPageCredits(null)).toEqual(none);
  });
});
