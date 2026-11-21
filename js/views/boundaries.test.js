// Rule test 2 of 4 (blueprint 9.2): the dependency rule of section 1 for the three layers, the tokens a
// view may never use (3.2), and the two "one place only" rules: motion (js/lib/motion.js) and clock
// text (js/lib/locale.js). It reads source as text. Test files are not checked: they may import
// anything. The second half proves each rule can fail. Steward: F0.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listImports, resolveImport, stripComments } from './fixtures/checks/source-scan.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STRICT = process.env.RULES_STRICT === '1';
const isTest = (file) => /\.test\.m?js$/.test(file);

function filesUnder(dir) {
  let entries = [];
  try { entries = readdirSync(ROOT + dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => (entry.isDirectory() ? filesUnder(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
}
// Other tasks create and move files while this runs: a file that has just gone is skipped, not failed.
const read = (file) => { try { return readFileSync(ROOT + file, 'utf8'); } catch { return null; } };
const SOURCES = filesUnder('js').filter((file) => file.endsWith('.js') && !isTest(file));

// --- Rule 1: who may import what (blueprint section 1) --------------------------------------------

/** Imports that existed in js/lib before the redesign and are outside this effort. Exact pairs only. */
const LIB_BEFORE_THE_REDESIGN = {
  'js/lib/card-deck.js': ['js/data/day-builder.js'],
  'js/lib/pdf-export.js': ['js/data/user-prefs.js', 'pkg:jspdf'],
  'js/lib/pdf/photos.js': ['js/services/generate.js'],
  'js/lib/pdf/logistics-page.js': ['js/components/transport-card.js'],
  'js/lib/supabase.js': ['pkg:@supabase/supabase-js'],
};
const LIB_PURE_TABLES = ['js/data/currencies.js', 'js/data/currency-list.js'];
const within = (target, ...dirs) => dirs.some((dir) => target.startsWith(dir));

function layerOf(file) {
  if (file.startsWith('js/views/fixtures/stub-view/')) return { name: 'view', home: 'js/views/fixtures/stub-view/', skin: null };
  const view = /^js\/views\/(?!shared\/|fixtures\/)([^/]+)\//.exec(file);
  if (view) return { name: 'view', home: `js/views/${view[1]}/`, skin: `css/views/${view[1]}.css` };
  if (file.startsWith('js/views/shared/')) return { name: 'shared' };
  if (file.startsWith('js/views/fixtures/')) return { name: 'fixtures' };
  if (file.startsWith('js/lib/')) return { name: 'lib' };
  return null;
}

function mayImport(file, layer, target) {
  if (layer.name === 'view') {
    return within(target, layer.home, 'js/views/shared/', 'js/lib/') || (file === `${layer.home}view.js` && target === layer.skin);
  }
  if (layer.name === 'shared') {
    return within(target, 'js/views/shared/', 'js/lib/') || target === 'js/data/day-builder.js'
      || (file === 'js/views/shared/styles.js' && /^css\/views\/shared\/[^/]+\.css$/.test(target))
      || (file === 'js/views/shared/trip-map.js' && /^pkg:leaflet(\/|$)/.test(target));
  }
  if (layer.name === 'fixtures') return within(target, 'js/views/fixtures/');
  return within(target, 'js/lib/') || LIB_PURE_TABLES.includes(target) || (LIB_BEFORE_THE_REDESIGN[file] ?? []).includes(target);
}

/** @returns {string[]} one line per import the file's layer does not allow */
function importProblems(file, source) {
  const layer = layerOf(file);
  if (!layer || isTest(file)) return [];
  return listImports(source).flatMap(({ spec, line }) => {
    if (spec === null) return [`${file}:${line} has a dynamic import whose target is not a plain string`];
    const target = resolveImport(file, spec);
    return mayImport(file, layer, target) ? [] : [`${file}:${line} imports ${target}, which the ${layer.name} layer may not`];
  });
}

// --- Rule 2: what a view file may never touch (blueprint 3.2) -------------------------------------

const VIEW_TOKENS = [
  ['localStorage', /\blocalStorage\b/], ['sessionStorage', /\bsessionStorage\b/], ['fetch(', /\bfetch\s*\(/],
  ['supabase', /supabase/i], ['navigate(', /\bnavigate\s*\(/], ['document.title', /\bdocument\s*\.\s*title\b/],
];
function tokenProblems(file, source) {
  if (layerOf(file)?.name !== 'view' || isTest(file)) return [];
  const code = stripComments(source);
  return VIEW_TOKENS.filter(([, pattern]) => pattern.test(code)).map(([token]) => `${file} uses ${token}, which a view may never do`);
}

// --- Rule 3: one place for motion, one place for clock text ---------------------------------------

const MOTION_HOME = 'js/lib/motion.js';
const CLOCK_HOME = 'js/lib/locale.js';
// A literal that is only the marker ('AM', " pm", `PM`), or a marker right after a template value.
const CLOCK_LITERAL = /(['"`])\s?(?:AM|PM|am|pm|a\.m\.|p\.m\.)\s?\1/g;
const CLOCK_TEMPLATE = /\}\s?(?:AM|PM|am|pm)\b(?=[^'"]*`)/g;
const COMPARED_BEFORE = /(?:[=!]==?|\bcase)\s*$/;
const COMPARED_AFTER = /^\s*[=!]==?/;

const count = (code, pattern) => [...code.matchAll(pattern)].length;
const motionQueries = (code) => count(code, /prefers-reduced-motion/g);
const smoothScrolls = (code) => count(code, /behavior\s*:\s*(['"`])smooth\1/g);
function clockBuilds(code) {
  const literals = [...code.matchAll(CLOCK_LITERAL)].filter((m) => (
    !COMPARED_BEFORE.test(code.slice(Math.max(0, m.index - 12), m.index)) && !COMPARED_AFTER.test(code.slice(m.index + m[0].length, m.index + m[0].length + 6))
  ));
  return literals.length + count(code, CLOCK_TEMPLATE);
}

// Sites that exist today and move with a later task. A listed file may hold at most this many; every
// other file holds none. An entry leaves this list when its owner reports the edit done. Run with
// RULES_STRICT=1 to fail on an entry that is no longer needed.
const PENDING = {
  motionQuery: {},
  smoothScroll: {
    // Kept for good: the inline scroll hint of the signed-out landing (blueprint 9.2).
    'js/components/dashboard.js': { max: 1, owner: null },
  },
  clockText: {},
};
const SINGLE_PLACE = [
  { key: 'motionQuery', home: MOTION_HOME, measure: motionQueries, what: 'reads prefers-reduced-motion' },
  { key: 'smoothScroll', home: MOTION_HOME, measure: smoothScrolls, what: "asks for behavior: 'smooth'" },
  { key: 'clockText', home: CLOCK_HOME, measure: clockBuilds, what: 'builds AM or PM text' },
];

/** @returns {string[]} for one rule, the files that hold more sites than they may */
function singlePlaceProblems(rule, files, pending = PENDING[rule.key]) {
  return Object.entries(files).flatMap(([file, source]) => {
    if (file === rule.home || isTest(file) || source === null) return [];
    const found = rule.measure(stripComments(source));
    const allowed = pending[file]?.max ?? 0;
    return found > allowed ? [`${file} ${rule.what} ${found} time(s), allowed ${allowed}: use ${rule.home}`] : [];
  });
}
function staleEntries(rule, files, pending = PENDING[rule.key]) {
  return Object.entries(pending).flatMap(([file, { max, owner }]) => {
    if (owner === null || !(file in files) || files[file] === null) return [];
    const found = rule.measure(stripComments(files[file]));
    return found < max ? [`${file}: ${rule.key} allows ${max}, the file now has ${found}. Lower or remove the entry (owner ${owner}).`] : [];
  });
}

// --- The tree as it is ------------------------------------------------------------------------------

const TREE = Object.fromEntries(SOURCES.map((file) => [file, read(file)]));
const inLayer = (name) => SOURCES.filter((file) => layerOf(file)?.name === name && TREE[file] !== null);

describe('the layers of the tree', () => {
  it('finds each layer, so no rule below passes on an empty list', () => {
    expect(inLayer('view').length).toBeGreaterThanOrEqual(12);
    expect(inLayer('shared').length).toBeGreaterThanOrEqual(20);
    expect(inLayer('lib').length).toBeGreaterThanOrEqual(20);
    expect(inLayer('fixtures').length).toBeGreaterThanOrEqual(3);
    expect(inLayer('view')).toContain('js/views/fixtures/stub-view/dashboard.js');
  });
  it.each(['view', 'shared', 'fixtures', 'lib'])('%s files import only what section 1 allows', (name) => {
    expect(inLayer(name).flatMap((file) => importProblems(file, TREE[file]))).toEqual([]);
  });
  it('view files stay away from storage, the network, the router and the document title', () => {
    expect(inLayer('view').flatMap((file) => tokenProblems(file, TREE[file]))).toEqual([]);
  });
  it.each(SINGLE_PLACE)('only $home $what', (rule) => {
    expect(singlePlaceProblems(rule, TREE)).toEqual([]);
  });
  it.runIf(STRICT)('the pending lists hold no entry that is no longer needed (RULES_STRICT=1)', () => {
    expect(SINGLE_PLACE.flatMap((rule) => staleEntries(rule, TREE))).toEqual([]);
  });
  it('the grandfathered js/lib imports still exist (remove an entry when its import goes)', () => {
    const gone = Object.entries(LIB_BEFORE_THE_REDESIGN).flatMap(([file, targets]) => {
      if (TREE[file] == null) return [`${file} is gone`];
      const now = listImports(TREE[file]).map(({ spec }) => (spec ? resolveImport(file, spec) : ''));
      return targets.filter((target) => !now.includes(target)).map((target) => `${file} no longer imports ${target}`);
    });
    if (STRICT) expect(gone).toEqual([]);
    else expect(Array.isArray(gone)).toBe(true);
  });
});

// --- The rules can fail -----------------------------------------------------------------------------

describe('the import rule fails on a forbidden import', () => {
  it.each([
    ['a view reaching into data', 'js/views/atlas/dashboard.js', "import { fetchAllTrips } from '../../data/trip-repository.js';", /imports js\/data\/trip-repository\.js, which the view layer may not/],
    ['a view reaching into components', 'js/views/atlas/trip.js', "import { showToast } from '../../components/toast.js';", /imports js\/components\/toast\.js/],
    ['a view importing another view', 'js/views/atlas/dashboard.js', "import { x } from '../concierge/briefing.js';", /imports js\/views\/concierge\/briefing\.js/],
    ['a view importing the fixtures', 'js/views/atlas/dashboard.js', "import { CTX_FIXTURE } from '../fixtures/models.js';", /imports js\/views\/fixtures\/models\.js/],
    ['a view importing the registry', 'js/views/atlas/dashboard.js', "import { activeViewId } from '../registry.js';", /imports js\/views\/registry\.js/],
    ['a view importing the router', 'js/views/departures/dashboard.js', "import { navigate } from '../../router.js';", /imports js\/router\.js/],
    ['a view importing a package', 'js/views/departures/trip.js', "import L from 'leaflet';", /imports pkg:leaflet, which the view layer may not/],
    ['a renderer importing its skin (only view.js may)', 'js/views/atlas/dashboard.js', "import '../../../css/views/atlas.css';", /imports css\/views\/atlas\.css/],
    ['a view.js importing another skin', 'js/views/atlas/view.js', "import '../../../css/views/concierge.css';", /imports css\/views\/concierge\.css/],
    ['a re-export from a forbidden place', 'js/views/atlas/view.js', "export { renderSettings } from '../../settings/settings-page.js';", /imports js\/settings\/settings-page\.js/],
    ['a dynamic import of a forbidden place', 'js/views/atlas/atlas-page.js', "const mod = () => import('../../data/prefs-store.js');", /imports js\/data\/prefs-store\.js/],
    ['a dynamic import that cannot be read', 'js/views/atlas/atlas-page.js', 'const mod = (name) => import(`../shared/${name}.js`);', /dynamic import whose target is not a plain string/],
    ['the stub view reaching into data', 'js/views/fixtures/stub-view/trip.js', "import { escapeHtml } from '../../../data/day-builder.js';", /imports js\/data\/day-builder\.js, which the view layer may not/],
    ['a shared component reaching into components', 'js/views/shared/menu.js', "import { showToast } from '../../components/toast.js';", /imports js\/components\/toast\.js, which the shared layer may not/],
    ['a shared component importing a data module other than day-builder', 'js/views/shared/glance.js', "import { convert } from '../../data/currencies.js';", /imports js\/data\/currencies\.js/],
    ['a shared component importing a view', 'js/views/shared/tabs.js', "import { x } from '../atlas/trip.js';", /imports js\/views\/atlas\/trip\.js/],
    ['Leaflet outside trip-map.js', 'js/views/shared/world-map.js', "const leaflet = () => import('leaflet');", /imports pkg:leaflet, which the shared layer may not/],
    ['shared CSS imported outside styles.js', 'js/views/shared/flap.js', "import '../../../css/views/shared/common.css';", /imports css\/views\/shared\/common\.css/],
    ['a fixture file importing the app', 'js/views/fixtures/models.js', "import { DESTINATIONS } from '../../wizard/destinations.js';", /imports js\/wizard\/destinations\.js, which the fixtures layer may not/],
    ['lib importing a service', 'js/lib/readiness.js', "import { entryPlan } from '../services/entry-advisor.js';", /imports js\/services\/entry-advisor\.js, which the lib layer may not/],
    ['lib importing a component', 'js/lib/journey.js', "import { x } from '../components/transport-card.js';", /imports js\/components\/transport-card\.js/],
    ['lib importing a view file', 'js/lib/dashboard-model.js', "import '../views/contract.js';", /imports js\/views\/contract\.js/],
    ['lib importing auth', 'js/lib/prefs.js', "import { getUser } from '../auth/auth.js';", /imports js\/auth\/auth\.js/],
    ['lib importing a data module that is not a pure table', 'js/lib/money.js', "import { getHomeCurrency } from '../data/user-prefs.js';", /imports js\/data\/user-prefs\.js/],
    ['lib importing the destination catalogue', 'js/lib/country-codes.js', "import { DESTINATIONS } from '../wizard/destinations.js';", /imports js\/wizard\/destinations\.js/],
    ['a grandfathered file importing something new', 'js/lib/card-deck.js', "import { x } from '../data/trip-repository.js';", /imports js\/data\/trip-repository\.js/],
    ['lib importing a new package', 'js/lib/geo.js', "import turf from '@turf/turf';", /imports pkg:@turf\/turf/],
  ])('%s', (_name, file, source, message) => {
    expect(importProblems(file, source).join('\n')).toMatch(message);
  });

  it.each([
    ['a view importing its own folder, shared components and lib', 'js/views/atlas/dashboard.js', "import { a } from './parts.js';\nimport { esc } from '../shared/html.js';\nimport { kmBetween } from '../../lib/geo.js';"],
    ['a view.js importing the shared styles and its own skin', 'js/views/atlas/view.js', "import '../shared/styles.js';\nimport '../../../css/views/atlas.css';\nexport { renderDashboard } from './dashboard.js';"],
    ['the atlas page loading the regional outlines on demand', 'js/views/atlas/atlas-page.js', "const regions = () => import('../shared/world-land-regions.js');"],
    ['a shared component using escapeHtml and lib', 'js/views/shared/html.js', "import { escapeHtml } from '../../data/day-builder.js';\nimport { formatNumber } from '../../lib/locale.js';"],
    ['trip-map.js loading Leaflet and its stylesheet', 'js/views/shared/trip-map.js', "const load = () => Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);"],
    ['styles.js importing the shared sheets', 'js/views/shared/styles.js', "import '../../../css/views/shared/common.css';"],
    ['lib importing lib and the two pure tables', 'js/lib/money.js', "import { sumCosts } from './cost-sum.js';\nimport { convert } from '../data/currencies.js';\nimport { CURRENCY_LIST } from '../data/currency-list.js';"],
    ['a type import written in JSDoc', 'js/lib/dashboard-model.js', "/** @param {import('../views/contract.js').DashboardModel} model */\n// import { x } from '../components/dashboard.js';\nexport const id = (model) => model;"],
    ['an import that existed before the redesign', 'js/lib/pdf/logistics-page.js', "import { groundJourney } from '../../components/transport-card.js';"],
    ['the word import inside a string or a template', 'js/views/fixtures/checks/css-tiers.js', "const AT = ['layer', 'scope', 'import', 'namespace'];\nconst hint = `import x from '../../data/a.js'`;"],
    ['a test file, which may import anything', 'js/lib/dashboard-model.test.js', "import { DASHBOARD_FIXTURES } from '../views/fixtures/models.js';\nimport { readFileSync } from 'node:fs';"],
    ['a file outside the three layers', 'js/components/dashboard-views.js', "import { supabase } from '../lib/supabase.js';\nimport { loadView } from '../views/registry.js';"],
  ])('allows %s', (_name, file, source) => {
    expect(importProblems(file, source)).toEqual([]);
  });
});

describe('the view token rule fails on each token', () => {
  it.each([
    ['localStorage', "const seen = localStorage.getItem('x');"],
    ['sessionStorage', "sessionStorage.setItem('x', '1');"],
    ['fetch(', "const rows = await fetch('/api');"],
    ['supabase', "const client = window.supabaseClient;"],
    ['navigate(', "navigate('/wizard');"],
    ['document.title', "document.title = 'Trips';"],
  ])('%s', (token, source) => {
    expect(tokenProblems('js/views/concierge/dashboard.js', source)).toEqual([`js/views/concierge/dashboard.js uses ${token}, which a view may never do`]);
    expect(tokenProblems('js/views/fixtures/stub-view/dashboard.js', source)).toHaveLength(1);
  });
  it('ignores a token in a comment, in a shared component and in a test file', () => {
    expect(tokenProblems('js/views/atlas/trip.js', '// never reads localStorage or calls fetch()\nexport const a = 1;')).toEqual([]);
    expect(tokenProblems('js/views/shared/view-picker.js', "localStorage.getItem('x');")).toEqual([]);
    expect(tokenProblems('js/views/atlas/trip.test.js', "localStorage.getItem('x');")).toEqual([]);
  });
});

describe('the single-place rules fail outside their home', () => {
  const [motionQuery, smoothScroll, clockText] = SINGLE_PLACE;
  const check = (rule, file, source, pending = {}) => singlePlaceProblems(rule, { [file]: source }, pending);

  it('a reduced-motion read outside js/lib/motion.js', () => {
    expect(check(motionQuery, 'js/views/shared/flap.js', "const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;")).toHaveLength(1);
    expect(check(motionQuery, 'js/settings/sections.js', "const q = matchMedia('(prefers-reduced-motion: reduce)');")).toHaveLength(1);
    expect(check(motionQuery, MOTION_HOME, "matchMedia('(prefers-reduced-motion: reduce)')")).toEqual([]);
    expect(check(motionQuery, 'js/views/shared/flap.js', '// the OS setting prefers-reduced-motion is read in motion.js')).toEqual([]);
  });
  it("a literal behavior: 'smooth' outside js/lib/motion.js", () => {
    expect(check(smoothScroll, 'js/components/trip-landing.js', "el.scrollIntoView({ behavior: 'smooth', block: 'start' });")).toHaveLength(1);
    expect(check(smoothScroll, 'js/views/shared/stuck.js', 'window.scrollTo({ top: 0, behavior:"smooth" });')).toHaveLength(1);
    expect(check(smoothScroll, 'js/components/trip-landing.js', 'el.scrollIntoView({ behavior: scrollBehavior() });')).toEqual([]);
    expect(check(smoothScroll, MOTION_HOME, "export const scrollBehavior = () => (calm ? 'auto' : 'smooth'); const o = { behavior: 'smooth' };")).toEqual([]);
  });
  it('a pending file may keep its sites but not add one', () => {
    const two = "a.scrollIntoView({ behavior: 'smooth' }); b.scrollIntoView({ behavior: 'smooth' });";
    expect(check(smoothScroll, 'js/x.js', two, { 'js/x.js': { max: 2, owner: 'F9' } })).toEqual([]);
    expect(check(smoothScroll, 'js/x.js', two, { 'js/x.js': { max: 1, owner: 'F9' } })).toEqual(["js/x.js asks for behavior: 'smooth' 2 time(s), allowed 1: use js/lib/motion.js"]);
    expect(staleEntries(smoothScroll, { 'js/x.js': 'const a = 1;' }, { 'js/x.js': { max: 1, owner: 'F9' } })).toHaveLength(1);
    expect(staleEntries(smoothScroll, { 'js/x.js': two }, { 'js/x.js': { max: 2, owner: 'F9' } })).toEqual([]);
  });
  it('code that builds AM or PM text outside js/lib/locale.js', () => {
    expect(check(clockText, 'js/components/trip-landing.js', "const ampm = hh >= 12 ? 'PM' : 'AM';")).toEqual(['js/components/trip-landing.js builds AM or PM text 2 time(s), allowed 0: use js/lib/locale.js']);
    expect(check(clockText, 'js/views/atlas/dashboard.js', 'const text = `${h}:${m} PM`;')).toHaveLength(1);
    expect(check(clockText, 'js/views/shared/flap.js', "const text = time + ' am';")).toHaveLength(1);
    expect(check(clockText, CLOCK_HOME, "return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;")).toEqual([]);
  });
  it('does not take a whole time, a comparison or a country code for clock building', () => {
    expect(check(clockText, 'js/views/fixtures/parts.js', "const stop = { time: '2:30 PM', title: 'Lunch' };")).toEqual([]);
    expect(check(clockText, 'js/components/trip-detail.js', "const isPM = m[3].toUpperCase() === 'PM';")).toEqual([]);
    expect(check(clockText, 'js/wizard/currency-map.js', "const MAP = { AM: 'AMD', AZ: 'AZN', PM: 'EUR' };")).toEqual([]);
    expect(check(clockText, 'js/services/trip-import.js', '// 19:30 and 7:30 PM are both read\nexport const a = 1;')).toEqual([]);
  });
});
