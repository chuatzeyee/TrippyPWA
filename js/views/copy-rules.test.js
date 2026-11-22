// Rule test 3 of 4 (blueprint 9.2): the copy rules. No em dash, en dash, middle dot, bullet glyph,
// arrow or ellipsis character, written out or as an HTML entity, in the new sources or in anything a
// view renders; and none of the phrases that claim real travel or promise weather. The second half
// proves each rule can fail. This file is a test, so the scan skips it. Steward: F0.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES, CTX_FIXTURE } from './fixtures/models.js';
import * as stub from './fixtures/stub-view/view.js';
import * as departures from './departures/view.js';
import * as concierge from './concierge/view.js';
import * as atlas from './atlas/view.js';
import { loadAtlasBody } from './atlas/atlas-page.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// --- The rules --------------------------------------------------------------------------------------

/** The glyphs js/lib/trip-extras.test.js already bans, the ellipsis, and the other shapes of a bullet. */
const BANNED_GLYPHS = new Map([
  [0x2014, 'em dash'], [0x2013, 'en dash'], [0x00b7, 'middle dot'], [0x2022, 'bullet'], [0x2192, 'arrow'],
  [0x2026, 'ellipsis'], [0x2027, 'hyphenation point'], [0x2219, 'bullet operator'], [0x25cf, 'black circle'],
  [0x25e6, 'white bullet'], [0x2023, 'triangular bullet'], [0x2043, 'hyphen bullet'],
]);
const NAMED_ENTITIES = {
  mdash: 0x2014, ndash: 0x2013, middot: 0x00b7, centerdot: 0x00b7, bull: 0x2022, bullet: 0x2022, rarr: 0x2192,
  rightarrow: 0x2192, hellip: 0x2026, mldr: 0x2026, hybull: 0x2043,
};
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;
const CSS_ESCAPE = /\\([0-9a-f]{2,6})\b/gi;
const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** @returns {string[]} every banned glyph in `text`, as a character or as an HTML entity */
function glyphProblems(text, where) {
  const out = [];
  let index = 0;
  for (const char of text) {
    const name = BANNED_GLYPHS.get(char.codePointAt(0));
    if (name) out.push(`${where}:${lineAt(text, index)} holds the ${name} character (${hex(char.codePointAt(0))})`);
    index += char.length;
  }
  for (const match of text.matchAll(ENTITY)) {
    const ref = match[1].toLowerCase();
    const code = ref[0] !== '#' ? NAMED_ENTITIES[ref] : ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (BANNED_GLYPHS.has(code)) out.push(`${where}:${lineAt(text, match.index)} holds ${match[0]}, the ${BANNED_GLYPHS.get(code)} entity`);
  }
  return out;
}

/** The same glyphs written as a CSS escape (content: "\2022"). */
function cssEscapeProblems(text, where) {
  return [...text.matchAll(CSS_ESCAPE)].filter((match) => BANNED_GLYPHS.has(parseInt(match[1], 16)))
    .map((match) => `${where}:${lineAt(text, match.index)} holds the CSS escape \\${match[1]}, the ${BANNED_GLYPHS.get(parseInt(match[1], 16))}`);
}

// Plans are not journeys, and stored weather is a seasonal guess (blueprint D9 and section 10).
const BANNED_PHRASES = [/trips you took/gi, /you went/gi, /\bvisited\b/gi];
const FORECAST = /forecast/gi;
const NOT_A = /not a\s+$/i;

/** @returns {string[]} every phrase that claims real travel, and every "forecast" that is not "not a forecast" */
function phraseProblems(text, where) {
  const out = [];
  for (const phrase of BANNED_PHRASES) {
    for (const match of text.matchAll(phrase)) out.push(`${where}:${lineAt(text, match.index)} says "${match[0]}"`);
  }
  for (const match of text.matchAll(FORECAST)) {
    if (!NOT_A.test(text.slice(Math.max(0, match.index - 8), match.index))) out.push(`${where}:${lineAt(text, match.index)} says "${match[0]}" without "not a"`);
  }
  return out;
}

const copyProblems = (text, where) => [...glyphProblems(text, where), ...phraseProblems(text, where)];

// --- What is scanned --------------------------------------------------------------------------------

function filesUnder(dir) {
  let entries = [];
  try { entries = readdirSync(ROOT + dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => (entry.isDirectory() ? filesUnder(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
}
// Other tasks create files while this runs: a file that has just gone is skipped, not failed.
const read = (file) => { try { return readFileSync(ROOT + file, 'utf8'); } catch { return null; } };
const isSource = (file) => /\.m?js$/.test(file) && !/\.test\.m?js$/.test(file);

/** The js/lib files this effort adds as new modules (blueprint 1.1, the "New" table). */
const NEW_LIB = [
  'prefs', 'theme', 'motion', 'weather', 'trip-status', 'money', 'readiness', 'cover-model', 'geo', 'country-codes',
  'travel-stats', 'dashboard-model', 'trip-overview-model',
].map((name) => `js/lib/${name}.js`);
const SOURCES = [
  ...filesUnder('js/views'), ...filesUnder('js/settings'),
  'js/components/dashboard-views.js', 'js/components/trip-landing.js', 'js/components/trip-landing-mount.js', ...NEW_LIB,
].filter(isSource);
const STYLES = [...filesUnder('css/views'), 'css/components/settings.css', ...filesUnder('js/views').filter((file) => file.endsWith('.css'))]
  .filter((file) => file.endsWith('.css'));

const VIEWS = { stub, departures, concierge, atlas };
const PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];

describe('the new sources keep the copy rules', () => {
  it('finds the sources, so the scan does not pass on an empty list', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(60);
    expect(SOURCES).toContain('js/views/fixtures/stub-view/dashboard.js');
    expect(SOURCES).toContain('js/settings/sections.js');
    expect(SOURCES).toContain('js/lib/readiness.js');
    expect(STYLES.length).toBeGreaterThanOrEqual(8);
  });
  it('no banned glyph and no banned phrase in any source file', () => {
    const problems = SOURCES.flatMap((file) => { const text = read(file); return text === null ? [] : copyProblems(text, file); });
    expect(problems).toEqual([]);
  });
  it('no banned glyph in the view and Settings stylesheets, as a character or as an escape', () => {
    const problems = STYLES.flatMap((file) => { const text = read(file); return text === null ? [] : [...glyphProblems(text, file), ...cssEscapeProblems(text, file)]; });
    expect(problems).toEqual([]);
  });
});

describe.each(Object.entries(VIEWS))('what view %s renders keeps the copy rules', (name, view) => {
  it.each(Object.keys(DASHBOARD_FIXTURES))('dashboard, fixture %s', (key) => {
    expect(copyProblems(view.renderDashboard(DASHBOARD_FIXTURES[key], CTX_FIXTURE), `${name} dashboard ${key}`)).toEqual([]);
  });
  it.each(Object.keys(TRIP_FIXTURES))('trip landing, fixture %s', (key) => {
    const parts = view.renderTripLanding(TRIP_FIXTURES[key], CTX_FIXTURE);
    expect(PARTS.flatMap((part) => copyProblems(parts[part], `${name} trip ${key} ${part}`))).toEqual([]);
  });
});

// The drawn half of the Atlas page is a chunk of its own (ruling R40): with it loaded the rules
// below read the whole page (plates, places, passport), not only its head.
await loadAtlasBody();
if (atlas.renderAtlasPage) {
  describe('what the atlas page renders keeps the copy rules', () => {
    it.each(Object.keys(DASHBOARD_FIXTURES))('fixture %s', (key) => {
      expect(copyProblems(atlas.renderAtlasPage(DASHBOARD_FIXTURES[key], CTX_FIXTURE), `atlas page ${key}`)).toEqual([]);
    });
  });
}

// --- The rules can fail -----------------------------------------------------------------------------

describe('the glyph rule fails on each banned glyph', () => {
  it.each([...BANNED_GLYPHS])('U+%s as a character (%s)', (code, glyphName) => {
    const text = `const label = 'Kyoto ${String.fromCodePoint(code)} Nara';`;
    expect(glyphProblems(text, 'a.js')).toEqual([`a.js:1 holds the ${glyphName} character (${hex(code)})`]);
  });
  it.each(Object.keys(NAMED_ENTITIES))('&%s; as a named entity', (entity) => {
    expect(glyphProblems(`<p>Kyoto &${entity}; Nara</p>`, 'html')).toHaveLength(1);
  });
  it.each(['&#8212;', '&#x2014;', '&#X2013;', '&#183;', '&#8226;', '&#8230;', '&#x2026;', '&#8594;'])('%s as a numeric entity', (entity) => {
    expect(glyphProblems(`<p>Kyoto ${entity} Nara</p>`, 'html')).toHaveLength(1);
  });
  it('reports the line, and every glyph on it', () => {
    const text = `one\ntwo ${String.fromCodePoint(0x2014)} three ${String.fromCodePoint(0x2026)}\n`;
    expect(glyphProblems(text, 'b.js')).toEqual(['b.js:2 holds the em dash character (U+2014)', 'b.js:2 holds the ellipsis character (U+2026)']);
  });
  it('fails on a banned glyph written as a CSS escape', () => {
    expect(cssEscapeProblems('.x::before { content: "\\2022"; }', 'a.css')).toHaveLength(1);
    expect(cssEscapeProblems('.x::before { content: "\\2014 "; }', 'a.css')).toHaveLength(1);
    expect(cssEscapeProblems('.x::before { content: "\\201C"; }', 'a.css')).toEqual([]);
  });
  it('allows the characters real copy needs', () => {
    const text = "Tromsø, 16 to 23°C, ~S$1,090 & more. That's 3 things, isn't it? [...rest] => x - y; a?.b ?? c; &amp; &lt; &#39; &nbsp; &deg;";
    expect(glyphProblems(text, 'ok.js')).toEqual([]);
  });
});

describe('the phrase rule fails on each banned phrase', () => {
  it.each([
    ['Trips you took in 2026', /says "Trips you took"/],
    ['You went in Jun 2026', /says "You went"/],
    ['12 countries visited', /says "visited"/],
    ['const visited = new Set();', /says "visited"/],
    ['The forecast for Friday', /says "forecast" without "not a"/],
    ['Weather forecast, 16 to 23 degrees', /says "forecast" without "not a"/],
    ['const forecastDays = 3;', /says "forecast" without "not a"/],
    ['This is not the forecast you want', /says "forecast" without "not a"/],
  ])('%s', (text, message) => {
    expect(phraseProblems(text, 'c.js').join('\n')).toMatch(message);
  });
  it('allows "not a forecast", and words that only contain a banned one', () => {
    expect(phraseProblems('Typical for the season, not a forecast.', 'ok')).toEqual([]);
    expect(phraseProblems('Weather is typical, Not A Forecast', 'ok')).toEqual([]);
    expect(phraseProblems('12 countries planned, 3 revisitedPlans, an unvisitedList', 'ok')).toEqual([]);
    expect(phraseProblems('Planned Jun 2026. Trips you planned. When you go.', 'ok')).toEqual([]);
  });
  it('catches a phrase in rendered markup', () => {
    const html = stub.renderDashboard(DASHBOARD_FIXTURES.ready, CTX_FIXTURE).replace('trips planned', 'trips you took');
    expect(copyProblems(html, 'stub dashboard ready').join('\n')).toMatch(/says "trips you took"/);
  });
  it('catches a glyph that reaches the markup through the model', () => {
    const model = { ...TRIP_FIXTURES.upcoming, title: `Marrakech ${String.fromCodePoint(0x2013)} the Atlas` };
    const parts = stub.renderTripLanding(model, CTX_FIXTURE);
    expect(copyProblems(parts.hero, 'stub trip hero').join('\n')).toMatch(/holds the en dash character/);
  });
});
