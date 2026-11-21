// The selector rules of blueprint 8.1, as functions over the text of a stylesheet: the tier a file
// belongs to, and what is wrong with a selector, a declaration or an at-rule in that tier. Used by
// css/views/css-rules.test.js, which also holds the cases that prove each rule can fail. Steward: F0.
//
//   shared   css/views/shared/common.css, trip.css, maps.css    [data-view] :where(<rest>)          exactly 0,1,0
//   skin     css/views/<id>.css                                  [data-view="<id>"][data-view] ...   0,2,0 to 0,6,0
//   reset    css/views/shared/trip-reset.css                     .td-wrap[data-view] x 6 :where(..)  exactly 0,7,0
//   settings css/components/settings.css                         .st-page ...                        at least 0,2,0
//
// Weights are (ids, classes, elements). What decides between tiers is the class column, so a
// pseudo-element may follow a shared or reset rule, and a skin is held to no ids and 2 to 6 classes.
import { allParts, parseCss, parseSelector, specificity } from './css-spec.js';

// --- The tiers --------------------------------------------------------------------------------------

const SKIN_PREFIX = { departures: 'dep-', concierge: 'con-', atlas: 'atl-' };
export const STUB_SHEET = 'js/views/fixtures/stub-view/stub.css';
const SHARED_PREFIXES = ['ui-', 'dv-', 'tv-', 'wm-'];
/** The classic card hooks a view rule may target (blueprint 8.1). */
const TD_HOOKS = [
  'td-day-grid', 'td-day-card', 'td-day-card-header', 'td-day-card-body', 'td-section-card', 'td-tabs', 'td-tab',
  'td-tab-panel', 'td-body', 'td-main', 'td-edit-bar', 'td-update-notice', 'td-activity-card', 'td-day-footer',
];
const BANNED_CLASS = /^(td-chat|td-alt|td-share|td-activity-edit|ec-)/;
const ROOT_CLASSES = ['dv-root', 'td-wrap', 'st-page'];
const QUALIFIER_ATTRS = ['data-theme', 'data-motion', 'data-trip-view'];
// At-rules that would change which rule wins, whatever the selectors weigh.
const BANNED_AT_RULES = ['layer', 'scope', 'import', 'namespace'];

export function tierOf(file) {
  if (file === 'css/views/shared/trip-reset.css') return { name: 'reset' };
  if (file.startsWith('css/views/shared/')) return { name: 'shared', leaflet: file === 'css/views/shared/maps.css' };
  if (file === STUB_SHEET) return { name: 'skin', id: 'stub', prefix: 'stub-' };
  const skin = /^css\/views\/([\w-]+)\.css$/.exec(file);
  if (skin) return { name: 'skin', id: skin[1], prefix: SKIN_PREFIX[skin[1]] ?? null };
  if (file === 'css/components/settings.css') return { name: 'settings' };
  return null;
}

// --- Reading a selector -----------------------------------------------------------------------------

const isClass = (part, test) => part.type === 'class' && test(part.name);
const isWhere = (part) => part.type === 'pseudo-class' && part.name === 'where' && part.args;
const isGroup = (part) => part.type === 'pseudo-class' && (part.name === 'where' || part.name === 'is') && part.args;
const bareDataView = (part) => part.type === 'attr' && part.name === 'data-view' && part.op === null;
const hasDataView = (compound) => compound.parts.some((part) => part.type === 'attr' && part.name === 'data-view');
const withoutPseudoElement = (compound) => compound.parts.filter((part) => part.type !== 'pseudo-element');
const classesIn = (compound) => allParts({ compounds: [compound] }).filter((part) => part.type === 'class').map((part) => part.name);
const show = (weight) => weight.join(',');

const isQualifierPart = (part) => (part.type === 'tag' && part.name === 'html')
  || (part.type === 'pseudo-class' && part.name === 'root' && part.raw === null)
  || (part.type === 'attr' && QUALIFIER_ATTRS.includes(part.name));
const isBareQualifier = (compound) => compound.parts.length > 0 && compound.parts.every(isQualifierPart);
const isWrappedQualifier = (compound) => compound.parts.length === 1 && Boolean(isWhere(compound.parts[0]))
  && compound.parts[0].args.every((arg) => arg.compounds.length === 1 && isBareQualifier(arg.compounds[0]));

/** True when the compound carries an allowed class itself, or is a :where()/:is() whose every branch starts with one. */
function carriesAllowedClass(compound, allowed) {
  if (compound.parts.some((part) => isClass(part, allowed))) return true;
  const groups = compound.parts.filter(isGroup);
  return groups.length > 0 && groups.every((group) => group.args.every((arg) => arg.compounds[0].parts.some((part) => isClass(part, allowed))));
}
const startsWithElement = (compound) => compound.parts.length > 0 && (compound.parts[0].type === 'tag' || compound.parts[0].type === 'universal')
  && !compound.parts.some((part) => part.type === 'class');

function qualifierProblems(before, scope, tier) {
  const out = [];
  for (const compound of before) {
    if (isWrappedQualifier(compound)) continue;
    if (!isBareQualifier(compound)) out.push('only a theme, motion or trip-page qualifier may come before the scope (html, :root, [data-theme], [data-motion], [data-trip-view])');
    else if (tier.name !== 'skin') out.push('in this tier a qualifier before the scope is wrapped in :where(), so it adds no weight');
  }
  if ([...before.slice(1), ...(before.length ? [scope] : [])].some((compound) => compound.combinator !== ' ')) out.push('a qualifier is an ancestor: only a space may follow it');
  return out;
}

/** The one compound a shared or reset rule may have after its scope: :where(<rest>), then perhaps a pseudo-element. */
function whereRestProblems(after, allowed, wanted) {
  if (!after.length) return [];
  const [rest] = after;
  const parts = withoutPseudoElement(rest);
  if (after.length > 1 || parts.length !== 1 || !isWhere(parts[0]) || (rest.combinator !== ' ' && rest.combinator !== '>')) {
    return ['everything after the scope goes inside one :where(), so it adds no weight'];
  }
  return parts[0].args.flatMap((arg) => {
    const first = arg.compounds[0];
    if (first.parts.some((part) => isClass(part, allowed))) return [];
    return [startsWithElement(first) ? `a bare element right after the scope ("${arg.text}")` : `the first compound after the scope must carry ${wanted} ("${arg.text}")`];
  });
}

function sharedProblems(scope, after, tier, weight, pseudoElement) {
  const out = [];
  const parts = withoutPseudoElement(scope);
  const rootWhere = parts[1];
  const rootOk = !rootWhere || (isWhere(rootWhere) && rootWhere.args.every((arg) => arg.compounds.length === 1
    && arg.compounds[0].parts.some((part) => isClass(part, (name) => ROOT_CLASSES.includes(name)))
    && !arg.compounds[0].parts.some((part) => part.type === 'tag' || part.type === 'id')));
  if (parts.length > 2 || !bareDataView(parts[0]) || !rootOk) out.push('a shared rule starts with [data-view] or [data-view]:where(<root class>)');
  const allowed = (name) => SHARED_PREFIXES.some((prefix) => name.startsWith(prefix)) || TD_HOOKS.includes(name) || (tier.leaflet && name.startsWith('leaflet-'));
  out.push(...whereRestProblems(after, allowed, `a ${SHARED_PREFIXES.join(', ')}class or a td- card hook${tier.leaflet ? ' (or a leaflet- class)' : ''}`));
  if (weight[0] !== 0 || weight[1] !== 1 || weight[2] !== (pseudoElement ? 1 : 0)) out.push(`a shared rule weighs exactly 0,1,0 (a pseudo-element may follow); this one weighs ${show(weight)}`);
  return out;
}

function resetProblems(scope, after, weight, pseudoElement) {
  const out = [];
  const parts = withoutPseudoElement(scope);
  const wrap = parts.filter((part) => isClass(part, (name) => name === 'td-wrap')).length;
  const doubled = parts.filter(bareDataView).length;
  const other = parts.filter((part) => !isClass(part, (name) => name === 'td-wrap') && !bareDataView(part) && !isWhere(part)).length;
  if (wrap !== 1 || doubled !== 6 || other) out.push('a reset starts with .td-wrap[data-view][data-view][data-view][data-view][data-view][data-view]');
  out.push(...whereRestProblems(after, (name) => TD_HOOKS.includes(name), 'a td- card hook'));
  if (weight[0] !== 0 || weight[1] !== 7 || weight[2] !== (pseudoElement ? 1 : 0)) out.push(`a reset weighs exactly 0,7,0; this one weighs ${show(weight)}`);
  return out;
}

function skinProblems(scope, after, tier, weight) {
  const out = [];
  if (tier.prefix === null) return [`no class prefix is registered for a skin called "${tier.id}"`];
  const views = scope.parts.filter((part) => part.type === 'attr' && part.name === 'data-view');
  const own = views.some((part) => part.op === '=' && part.value === tier.id);
  const foreign = views.some((part) => part.op !== null && !(part.op === '=' && part.value === tier.id));
  if (!own || !views.some(bareDataView) || foreign) out.push(`a skin rule starts with the doubled scope [data-view="${tier.id}"][data-view]`);
  if (scope.parts.some((part) => part.type === 'tag' || part.type === 'id' || isClass(part, (name) => !ROOT_CLASSES.includes(name)))) {
    out.push('the scope compound may carry a root class (.td-wrap, .dv-root), attributes and pseudo-classes only');
  }
  if (after.length) {
    const [first] = after;
    const allowed = (name) => name.startsWith(tier.prefix) || SHARED_PREFIXES.some((prefix) => name.startsWith(prefix)) || TD_HOOKS.includes(name);
    if (first.combinator !== ' ' && first.combinator !== '>') out.push('a skin styles what is inside its root: only a space or > may follow the scope');
    if (!carriesAllowedClass(first, allowed)) {
      out.push(startsWithElement(first) ? 'a bare element right after the scope' : `the first compound after the scope must carry a ${tier.prefix}, ${SHARED_PREFIXES.join(', ')}class or a td- card hook`);
    }
  }
  if (weight[0] !== 0 || weight[1] < 2 || weight[1] > 6) out.push(`a skin rule weighs 0,2,0 to 0,6,0; this one weighs ${show(weight)}`);
  return out;
}

function settingsProblems(parsed, weight) {
  const at = parsed.compounds.findIndex((compound) => compound.parts.some((part) => isClass(part, (name) => name === 'st-page')));
  const before = at < 0 ? [] : parsed.compounds.slice(0, at);
  const out = [];
  if (at < 0 || before.some((compound) => !isBareQualifier(compound) && !isWrappedQualifier(compound))) out.push('a Settings rule starts with .st-page');
  if (weight[0] === 0 && weight[1] < 2) out.push(`a Settings rule weighs at least 0,2,0 (.st-page and one more class); this one weighs ${show(weight)}`);
  return out;
}

/** @returns {string[]} what is wrong with one selector of one file; empty when it keeps the rules of its tier */
export function selectorProblems(file, text) {
  const tier = tierOf(file);
  const parsed = parseSelector(text);
  if (parsed.error) return [`cannot read the selector: ${parsed.error}`];
  const weight = specificity(parsed);
  if (tier.name === 'settings') return settingsProblems(parsed, weight);
  const out = [];
  for (const part of allParts(parsed)) {
    const named = part.type === 'class' ? part.name : part.type === 'attr' && part.name === 'class' ? (part.value ?? '') : '';
    if (named.split(/\s+/).some((name) => BANNED_CLASS.test(name)) || /td-(chat|alt|share|activity-edit)/.test(named)) {
      out.push(`${named}: classes that start with td-chat, td-alt, td-share, td-activity-edit or ec- may not appear under css/views`);
    }
  }
  const scopeAt = parsed.compounds.findIndex(hasDataView);
  if (scopeAt < 0) return [...out, tier.name === 'skin' ? `a skin rule starts with the doubled scope [data-view="${tier.id}"][data-view]` : 'no [data-view] scope: the rule would also match the classic screens'];
  const before = parsed.compounds.slice(0, scopeAt);
  const scope = parsed.compounds[scopeAt];
  const after = parsed.compounds.slice(scopeAt + 1);
  const last = parsed.compounds[parsed.compounds.length - 1];
  const pseudoElement = last.parts.some((part) => part.type === 'pseudo-element');
  out.push(...qualifierProblems(before, scope, tier));
  if (tier.name === 'shared') out.push(...sharedProblems(scope, after, tier, weight, pseudoElement));
  if (tier.name === 'reset') out.push(...resetProblems(scope, after, weight, pseudoElement));
  if (tier.name === 'skin') out.push(...skinProblems(scope, after, tier, weight));
  return out;
}

// --- Declarations and at-rules ------------------------------------------------------------------------

/** True when the rule's subject can be the trip page root, .td-wrap. */
function subjectCanBeTripRoot(text) {
  const parsed = parseSelector(text);
  if (parsed.error) return true;
  const scopeAt = parsed.compounds.findIndex(hasDataView);
  const subject = parsed.compounds[parsed.compounds.length - 1];
  const classes = classesIn(subject);
  if (classes.includes('td-wrap')) return true;
  return scopeAt === parsed.compounds.length - 1 && !classes.some((name) => name === 'dv-root' || name === 'st-page');
}
const targetsLeaflet = (text) => {
  const parsed = parseSelector(text);
  const rest = parsed.error ? [] : parsed.compounds.slice(parsed.compounds.findIndex(hasDataView) + 1);
  const where = rest[0]?.parts.find(isWhere);
  return Boolean(where) && where.args.every((arg) => arg.compounds[0].parts.some((part) => isClass(part, (name) => name.startsWith('leaflet-'))));
};

function declarationProblems(file, rule) {
  const tier = tierOf(file);
  if (tier.name === 'settings') return [];
  const out = [];
  for (const { prop, value, important } of rule.declarations) {
    const plain = value.toLowerCase();
    if (prop === 'text-overflow' && plain.includes('ellipsis')) out.push('text-overflow: ellipsis (titles wrap, they are never cut)');
    if (/^(-webkit-)?line-clamp$/.test(prop) && !/^(none|unset|initial)$/.test(plain)) out.push(`${prop}: a line clamp (titles wrap, they are never cut)`);
    if (prop === 'position' && plain === 'fixed') out.push('position: fixed (menus, sheets and the full map are <dialog> elements in the top layer)');
    const makesContainer = (prop === 'container-type' && plain !== 'normal') || (prop === 'container' && /size|scroll-state/.test(plain));
    if (makesContainer && rule.selectors.some(subjectCanBeTripRoot)) out.push(`${prop} on .td-wrap (it would become the containing block of the fixed chat button)`);
    const leafletOverride = tier.leaflet && rule.selectors.every(targetsLeaflet);
    if (important && tier.name !== 'reset' && !leafletOverride) out.push(`${prop}: !important (it would beat the next tier whatever the selectors weigh; only resets and Leaflet overrides may use it)`);
  }
  return out;
}

/** @returns {string[]} every broken rule of one stylesheet */
export function fileProblems(file, css) {
  const tier = tierOf(file);
  if (!tier) return [`${file}: no tier is known for this file`];
  const { rules, atRules, errors } = parseCss(css);
  const out = errors.map((error) => `${file}: ${error}`);
  if (tier.name !== 'settings') {
    for (const { name, line } of atRules) if (BANNED_AT_RULES.includes(name)) out.push(`${file}:${line} @${name} is not allowed under css/views`);
  }
  for (const rule of rules) {
    for (const selector of rule.selectors) out.push(...selectorProblems(file, selector).map((problem) => `${file}:${rule.line} "${selector}": ${problem}`));
    out.push(...declarationProblems(file, rule).map((problem) => `${file}:${rule.line} "${rule.selectors.join(', ')}": ${problem}`));
  }
  return out;
}
