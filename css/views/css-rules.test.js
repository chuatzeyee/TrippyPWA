// Rule test 4 of 4 (blueprint 8.1 and 9.2): every selector under css/views keeps the shape, the weight
// and the targets of its tier, so the cascade between shared CSS, a skin and the classic resets never
// depends on which file loaded first. Also the declarations no view stylesheet may hold. The rules
// are in js/views/fixtures/checks/css-tiers.js; the second half here proves each one can fail.
// Steward: F0.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCss, specificity } from '../../js/views/fixtures/checks/css-spec.js';
import { STUB_SHEET, fileProblems, selectorProblems } from '../../js/views/fixtures/checks/css-tiers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// --- The tree as it is ------------------------------------------------------------------------------

function filesUnder(dir) {
  let entries = [];
  try { entries = readdirSync(ROOT + dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => (entry.isDirectory() ? filesUnder(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
}
const read = (file) => { try { return readFileSync(ROOT + file, 'utf8'); } catch { return null; } };
const SHEETS = [...filesUnder('css/views').filter((file) => file.endsWith('.css')), STUB_SHEET, 'css/components/settings.css'];

describe('the view stylesheets keep the selector rules', () => {
  it('finds every sheet of the plan', () => {
    for (const file of ['css/views/shared/common.css', 'css/views/shared/trip.css', 'css/views/shared/trip-reset.css', 'css/views/shared/maps.css',
      'css/views/departures.css', 'css/views/concierge.css', 'css/views/atlas.css']) expect(SHEETS).toContain(file);
  });
  it.each(SHEETS)('%s', (file) => {
    const css = read(file);
    expect(css === null ? [`${file} is missing`] : fileProblems(file, css)).toEqual([]);
  });
  it('the cascade probe is in place: one outline-style in the shared sheet, another in each skin', () => {
    const probe = (file) => parseCss(read(file) ?? '').rules.filter((rule) => rule.selectors.some((selector) => selector.includes('.ui-probe')))
      .flatMap((rule) => rule.declarations.filter((declaration) => declaration.prop === 'outline-style').map((declaration) => declaration.value));
    const styles = ['css/views/shared/common.css', 'css/views/departures.css', 'css/views/concierge.css', 'css/views/atlas.css'].map(probe);
    for (const found of styles) expect(found).toHaveLength(1);
    expect(new Set(styles.flat()).size).toBe(4);
    expect(styles.flat()).not.toContain('none');
  });
});

// --- Specificity is computed, not assumed -------------------------------------------------------------

describe('specificity, with :where() as zero', () => {
  it.each([
    ['[data-view] :where(.ui-chip.is-live)', [0, 1, 0]],
    ['[data-view]:where(.td-wrap) :where(.tv-bar)', [0, 1, 0]],
    ['[data-view] :where(.ui-chip)::after', [0, 1, 1]],
    ['[data-view="atlas"][data-view]', [0, 2, 0]],
    ['[data-view="atlas"][data-view] .ui-chip', [0, 3, 0]],
    ['.td-wrap[data-view="atlas"][data-view] .td-day-card .atl-num', [0, 5, 0]],
    ['.td-wrap[data-view][data-view][data-view][data-view][data-view][data-view] :where(.td-body)', [0, 7, 0]],
    [':where([data-theme="light"]) [data-view] :where(.ui-frame)', [0, 1, 0]],
    ['html[data-theme="light"] [data-view="atlas"][data-view] .atl-plate', [0, 4, 1]],
    [':root:not([data-square-mode="on"]) .td-wrap:has(> .td-chat-drawer--open) .td-body', [0, 5, 0]],
    ['#app .a:is(.b, .c .d) li:hover::before', [1, 4, 2]],
    ['.a:not(#x, .y) > *', [1, 1, 0]],
    ['li:nth-child(2n + 1 of .x.y)', [0, 3, 1]],
    ['a:where(#x .y):focus-visible', [0, 1, 1]],
  ])('%s weighs %j', (selector, weight) => {
    expect(specificity(selector)).toEqual(weight);
  });
});

// --- The rules can fail -------------------------------------------------------------------------------

const COMMON = 'css/views/shared/common.css';
const TRIP = 'css/views/shared/trip.css';
const MAPS = 'css/views/shared/maps.css';
const RESET = 'css/views/shared/trip-reset.css';
const ATLAS = 'css/views/atlas.css';
const SETTINGS = 'css/components/settings.css';
const SIX = '.td-wrap[data-view][data-view][data-view][data-view][data-view][data-view]';
const rule = (selector, body = 'color: red') => `${selector} { ${body} }`;

describe('a broken selector fails', () => {
  it.each([
    ['a shared rule that weighs more than 0,1,0', COMMON, '[data-view] .ui-chip', /everything after the scope goes inside one :where\(\)[\s\S]*weighs exactly 0,1,0[\s\S]*weighs 0,2,0/],
    ['a shared rule with a pseudo-class outside :where()', COMMON, '[data-view] :where(.ui-chip):hover', /weighs exactly 0,1,0[\s\S]*weighs 0,2,0/],
    ['a shared rule with two compounds after the scope', COMMON, '[data-view] :where(.ui-card) :where(.ui-chip)', /goes inside one :where\(\)/],
    ['a shared rule without the scope', COMMON, ':where(.ui-chip)', /no \[data-view\] scope/],
    ['a shared rule scoped to one view', COMMON, '[data-view="atlas"] :where(.ui-chip)', /a shared rule starts with \[data-view\]/],
    ['a shared rule with a class on the scope', TRIP, '.td-wrap[data-view] :where(.tv-bar)', /a shared rule starts with \[data-view\][\s\S]*weighs 0,2,0/],
    ['a shared root :where() that names no root class', TRIP, '[data-view]:where(.tv-bar) :where(.tv-back)', /a shared rule starts with \[data-view\] or \[data-view\]:where\(<root class>\)/],
    ['a shared rule on a bare element', COMMON, '[data-view] :where(button)', /a bare element right after the scope \("button"\)/],
    ['a shared rule with one bare branch', COMMON, '[data-view] :where(.ui-chip, a:hover)', /a bare element right after the scope \("a:hover"\)/],
    ['a shared rule on a class of another family', COMMON, '[data-view] :where(.trip-card)', /first compound after the scope must carry/],
    ['a shared rule on a td- class that is not a card hook', TRIP, '[data-view] :where(.td-hero)', /first compound after the scope must carry/],
    ['a leaflet- class outside maps.css', COMMON, '[data-view] :where(.leaflet-bar a)', /first compound after the scope must carry/],
    ['a bare theme qualifier in a shared rule', COMMON, '[data-theme="light"] [data-view] :where(.ui-frame)', /wrapped in :where\(\)[\s\S]*weighs 0,2,0/],
    ['a qualifier that is not theme, motion or trip page', COMMON, ':where(.has-session) [data-view] :where(.ui-frame)', /only a theme, motion or trip-page qualifier/],
    ['a skin rule without the doubled scope', ATLAS, '[data-view="atlas"] .atl-plate', /starts with the doubled scope \[data-view="atlas"\]\[data-view\]/],
    ['a skin rule with no scope at all', ATLAS, '.atl-plate', /starts with the doubled scope/],
    ['a skin rule doubled with the same value', ATLAS, '[data-view="atlas"][data-view="atlas"] .atl-plate', /starts with the doubled scope/],
    ['a skin rule scoped to another view', ATLAS, '[data-view="concierge"][data-view] .atl-plate', /starts with the doubled scope \[data-view="atlas"\]/],
    ['a skin rule above 0,6,0', ATLAS, '[data-view="atlas"][data-view] .atl-a .atl-b .atl-c .atl-d .atl-e', /weighs 0,2,0 to 0,6,0; this one weighs 0,7,0/],
    ['a skin rule with an id', ATLAS, '[data-view="atlas"][data-view] .atl-hero #td-hero', /this one weighs 1,3,0/],
    ['a bare element right after the scope', ATLAS, '[data-view="atlas"][data-view] button', /a bare element right after the scope/],
    ['a universal selector right after the scope', ATLAS, '[data-view="atlas"][data-view] > *', /a bare element right after the scope/],
    ['an element with a pseudo-class right after the scope', ATLAS, '[data-view="atlas"][data-view] a:hover', /a bare element right after the scope/],
    ['another skin\'s prefix right after the scope', ATLAS, '[data-view="atlas"][data-view] .con-brief', /first compound after the scope must carry a atl-/],
    ['a classic class right after the scope', ATLAS, '[data-view="atlas"][data-view] .trip-card', /first compound after the scope must carry/],
    ['a td- class that is not a card hook right after the scope', ATLAS, '[data-view="atlas"][data-view] .td-sidebar', /first compound after the scope must carry/],
    ['a group with one branch outside the allowed classes', ATLAS, '[data-view="atlas"][data-view] :is(.atl-a, .dashboard)', /first compound after the scope must carry/],
    ['a sibling of the root', ATLAS, '[data-view="atlas"][data-view] + .atl-foot', /only a space or > may follow the scope/],
    ['an element on the scope compound', ATLAS, 'div[data-view="atlas"][data-view] .atl-plate', /scope compound may carry a root class/],
    ['a banned td-chat class', ATLAS, '[data-view="atlas"][data-view] .atl-wrap .td-chat-drawer', /td-chat-drawer: classes that start with td-chat/],
    ['a banned class inside :has()', RESET, `${SIX}:where(:has(> .td-chat-drawer--open))`, /classes that start with td-chat/],
    ['a banned class through an attribute selector', ATLAS, '[data-view="atlas"][data-view] .atl-wrap [class*="td-chat"]', /may not appear under css\/views/],
    ['a banned ec- class', COMMON, '[data-view] :where(.ui-card .ec-row)', /ec-row: classes that start with/],
    ['a banned td-alt class', ATLAS, '[data-view="atlas"][data-view] .td-day-card .td-alt-list', /td-alt-list: classes that start with/],
    ['a banned td-share class', ATLAS, '[data-view="atlas"][data-view] .atl-x .td-share-modal', /classes that start with/],
    ['a banned td-activity-edit class', ATLAS, '[data-view="atlas"][data-view] .atl-x .td-activity-edit-form', /classes that start with/],
    ['a reset with five attributes', RESET, '.td-wrap[data-view][data-view][data-view][data-view][data-view] :where(.td-body)', /a reset starts with[\s\S]*weighs exactly 0,7,0; this one weighs 0,6,0/],
    ['a reset with seven attributes', RESET, `${SIX}[data-view] :where(.td-body)`, /weighs exactly 0,7,0; this one weighs 0,8,0/],
    ['a reset whose target is outside :where()', RESET, `${SIX} .td-body`, /goes inside one :where\(\)[\s\S]*this one weighs 0,8,0/],
    ['a reset on a class that is not a td- card hook', RESET, `${SIX} :where(.tv-bar)`, /first compound after the scope must carry a td- card hook/],
    ['a reset on a bare element', RESET, `${SIX} :where(button)`, /a bare element right after the scope/],
    ['a reset without .td-wrap', RESET, '[data-view][data-view][data-view][data-view][data-view][data-view][data-view] :where(.td-body)', /a reset starts with \.td-wrap/],
    ['a reset with a bare qualifier', RESET, `html[data-trip-view] ${SIX} :where(.td-body)`, /wrapped in :where\(\)/],
    ['a Settings rule that does not start with .st-page', SETTINGS, '.st-row .st-label', /a Settings rule starts with \.st-page/],
    ['a Settings rule that is too light', SETTINGS, '.st-page', /weighs at least 0,2,0/],
    ['a Settings rule made weightless', SETTINGS, '.st-page :where(.st-row)', /weighs at least 0,2,0/],
    ['a selector that cannot be read', ATLAS, '[data-view="atlas"][data-view] .atl-x >', /cannot read the selector/],
    ['a skin file with no registered prefix', 'css/views/nomad.css', '[data-view="nomad"][data-view] .nom-x', /no class prefix is registered for a skin called "nomad"/],
  ])('%s', (_name, file, selector, message) => {
    expect(selectorProblems(file, selector).join('\n')).toMatch(message);
  });
});

describe('a selector the blueprint allows passes', () => {
  it.each([
    ['the shared form', COMMON, '[data-view] :where(.ui-chip.is-live)'],
    ['the shared form on a root class', TRIP, '[data-view]:where(.td-wrap) :where(.tv-bar)'],
    ['the shared root itself, for tokens', COMMON, '[data-view]'],
    ['the trip root itself, for layout variables', TRIP, '[data-view]:where(.td-wrap)'],
    ['a shared rule with a pseudo-element', COMMON, '[data-view] :where(.ui-chip)::after'],
    ['a shared rule with states inside :where()', COMMON, '[data-view] :where(.ui-chip:hover, .ui-chip:focus-visible)'],
    ['a shared rule on a deeper element', COMMON, '[data-view] :where(.ui-card > a.trip-card-link)'],
    ['a shared rule on a card hook', TRIP, '[data-view] :where(.td-tabs[data-stuck])'],
    ['a shared child rule', TRIP, '[data-view]:where(.td-wrap) > :where(.tv-bar)'],
    ['a Leaflet override in maps.css', MAPS, '[data-view] :where(.leaflet-bar a)'],
    ['a theme-qualified shared rule, wrapped', COMMON, ':where([data-theme="light"]) [data-view] :where(.ui-frame)'],
    ['a motion-qualified shared rule, wrapped', COMMON, ':where(html[data-motion="reduce"]) [data-view] :where(.ui-flap)'],
    ['a theme-qualified skin rule, bare', ATLAS, '[data-theme="light"] [data-view="atlas"][data-view] .atl-plate'],
    ['a theme-qualified skin rule on html, bare', ATLAS, 'html[data-theme="light"] [data-view="atlas"][data-view] .atl-plate'],
    ['a theme-qualified skin rule, wrapped', ATLAS, ':where([data-theme="light"]) [data-view="atlas"][data-view] .atl-plate'],
    ['a trip-page-qualified reset, wrapped', RESET, `:where(html[data-trip-view]) ${SIX} :where(.td-day-card)`],
    ['the lightest skin rule: the root itself', ATLAS, '[data-view="atlas"][data-view]'],
    ['a skin rule on a shared component', ATLAS, '[data-view="atlas"][data-view] .ui-chip'],
    ['a skin rule on its own class', ATLAS, '[data-view="atlas"][data-view] .atl-rail > li:hover'],
    ['a skin rule on a card hook, with more weight', ATLAS, '.td-wrap[data-view="atlas"][data-view] .td-day-card .td-day-card-header'],
    ['a skin rule that reads a root state', ATLAS, '[data-view="atlas"][data-view][data-active-tab="plan"] .tv-landing'],
    ['a skin rule at exactly 0,6,0', ATLAS, '[data-view="atlas"][data-view] .atl-a .atl-b .atl-c .atl-d'],
    ['a skin rule through a group of allowed classes', ATLAS, '[data-view="atlas"][data-view] :is(.atl-a, .ui-chip) span'],
    ['a skin rule with a pseudo-element', ATLAS, '[data-view="atlas"][data-view] .atl-stamp::before'],
    ['the stub view sheet', STUB_SHEET, '[data-view="stub"][data-view] .stub-trip'],
    ['a reset', RESET, `${SIX} :where(.td-body)`],
    ['a reset on the root itself', RESET, SIX],
    ['a reset with a pseudo-element', RESET, `${SIX} :where(.td-day-card)::before`],
    ['a reset on a nested target', RESET, `${SIX} :where(.td-day-card .tv-day-extras)`],
    ['a Settings rule', SETTINGS, '.st-page .st-row'],
    ['a Settings rule with a theme qualifier', SETTINGS, '[data-theme="light"] .st-page .st-row:hover'],
  ])('%s', (_name, file, selector) => {
    expect(selectorProblems(file, selector)).toEqual([]);
  });
});

describe('a banned declaration or at-rule fails', () => {
  it.each([
    ['text-overflow: ellipsis', ATLAS, rule('[data-view="atlas"][data-view] .atl-title', 'overflow: hidden; text-overflow: ellipsis'), /text-overflow: ellipsis/],
    ['a line clamp', COMMON, rule('[data-view] :where(.ui-title)', 'display: -webkit-box; -webkit-line-clamp: 2'), /-webkit-line-clamp: a line clamp/],
    ['the unprefixed line clamp', ATLAS, rule('[data-view="atlas"][data-view] .atl-title', 'line-clamp: 3'), /line-clamp: a line clamp/],
    ['position: fixed', ATLAS, rule('[data-view="atlas"][data-view] .atl-sheet', 'position: fixed; inset: 0'), /position: fixed/],
    ['position: fixed inside a media query', TRIP, `@media (min-width: 1024px) { ${rule('[data-view] :where(.tv-bar)', 'position:fixed')} }`, /position: fixed/],
    ['position: fixed in the stub sheet', STUB_SHEET, rule('[data-view="stub"][data-view] .stub-trip', 'position: FIXED'), /position: fixed/],
    ['container-type on the trip root', TRIP, rule('[data-view]:where(.td-wrap)', 'container-type: inline-size'), /container-type on \.td-wrap/],
    ['container-type on every view root', COMMON, rule('[data-view]', 'container-type: inline-size'), /container-type on \.td-wrap/],
    ['container-type on a skin root', ATLAS, rule('[data-view="atlas"][data-view]', 'container-type: inline-size'), /container-type on \.td-wrap/],
    ['the container shorthand on the trip root', RESET, rule(SIX, 'container: page / inline-size'), /container on \.td-wrap/],
    ['!important in a shared rule', COMMON, rule('[data-view] :where(.ui-chip)', 'color: red !important'), /color: !important/],
    ['!important in a skin rule', ATLAS, rule('[data-view="atlas"][data-view] .atl-plate', 'color: red!important'), /color: !important/],
    ['!important in maps.css on a rule that is not a Leaflet override', MAPS, rule('[data-view] :where(.wm-plate)', 'color: red !important'), /color: !important/],
    ['@layer', COMMON, `@layer shared { ${rule('[data-view] :where(.ui-chip)')} }`, /@layer is not allowed/],
    ['@import', ATLAS, `@import url("other.css");\n${rule('[data-view="atlas"][data-view] .atl-plate')}`, /@import is not allowed/],
    ['@scope', ATLAS, `@scope (.atl-plate) { ${rule('[data-view="atlas"][data-view] .atl-plate')} }`, /@scope is not allowed/],
    ['a nested rule', ATLAS, '[data-view="atlas"][data-view] .atl-plate { color: red; .atl-pin { color: blue } }', /a rule nested inside/],
    ['a broken selector inside a media query', ATLAS, `@media (min-width: 640px) { ${rule('[data-view="atlas"] .atl-plate')} }`, /css\/views\/atlas\.css:1 "\[data-view="atlas"\] \.atl-plate": a skin rule starts with the doubled scope/],
    ['one bad selector in a list', COMMON, rule('[data-view] :where(.ui-chip),\n[data-view] .ui-card'), /"\[data-view\] \.ui-card": everything after the scope/],
    ['a block that is never closed', ATLAS, '[data-view="atlas"][data-view] .atl-plate { color: red;', /a block is never closed/],
    ['a sheet in a folder with no tier', 'css/components/other.css', rule('.x'), /no tier is known/],
  ])('%s', (_name, file, css, message) => {
    expect(fileProblems(file, css).join('\n')).toMatch(message);
  });

  it.each([
    ['container-type on a landing wrapper', TRIP, rule('[data-view] :where(.tv-landing)', 'container-type: inline-size')],
    ['container-type on the dashboard root only', ATLAS, rule('[data-view="atlas"][data-view].dv-root', 'container-type: inline-size')],
    ['container-type inside the skin', ATLAS, rule('[data-view="atlas"][data-view] .atl-rail', 'container: rail / inline-size')],
    ['position: sticky', TRIP, rule('[data-view]:where(.td-wrap) :where(.tv-bar)', 'position: sticky; top: var(--tv-top)')],
    ['!important in a reset', RESET, rule(`${SIX} :where(.td-body)`, 'display: block !important')],
    ['!important on a Leaflet override', MAPS, rule('[data-view] :where(.leaflet-bar a)', 'width: 44px !important')],
    ['media, container and supports blocks, and keyframes', ATLAS, `@media (prefers-reduced-motion: no-preference) { @container (min-width: 640px) { ${rule('[data-view="atlas"][data-view] .atl-pin', 'animation: atl-pulse 2s')} } }\n@supports (backdrop-filter: blur(4px)) { ${rule('[data-view="atlas"][data-view] .tv-bar', 'backdrop-filter: blur(8px)')} }\n@keyframes atl-pulse { from { opacity: 0 } to { opacity: 1 } }`],
    ['a comment that mentions position: fixed and .td-chat', ATLAS, `/* never position: fixed; .td-chat stays classic { */\n${rule('[data-view="atlas"][data-view] .atl-plate')}`],
    ['text-overflow: clip and a content string with braces', COMMON, rule('[data-view] :where(.ui-chip)::after', 'text-overflow: clip; content: "{a;b}"')],
    ['a Settings sheet is not held to the view declarations', SETTINGS, rule('.st-page .st-toast', 'position: fixed')],
  ])('allows %s', (_name, file, css) => {
    expect(fileProblems(file, css)).toEqual([]);
  });
});
