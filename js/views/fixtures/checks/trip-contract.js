// The hook table of blueprint 3.4 and the placement rules of 3.1 and 3.2, checked on the parts a trip
// landing renderer returns. Steward: F0.
import { all, attr, classesOf, elements, isElement, isInside, matches, parseHtml, textOf } from './html-tree.js';
import { markupRules, regionRules } from './markup-rules.js';

const STRING_PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];
const PART_KEYS = [...STRING_PARTS, 'openSections', 'openSectionsMinWidth', 'dayAside'];
const OPENABLE = ['flights', 'transport', 'entry', 'accommodation'];
const ACTION_KEYS = ['share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete'];
const TAB_KEYS = ['plan', 'spending', 'prep', 'towns'];
const SECTION_TARGETS = ['flights', 'transport', 'accommodation', 'entry', 'checklist'];
const NOT_IN_REGION = ['h1', '[data-trip-search]', '[data-slot="chooser"]', '[data-map-slot]', '[data-tabs-slot]'];
// The landing does not draw these: they stay with the trip page (blueprint 3.4).
const NOT_THE_LANDINGS = ['td-day-card', 'td-section-card', 'td-tab-panel', 'td-edit-bar', 'td-update-notice', 'tv-foot'];
const wholeNumber = (text) => /^\d+$/.test(text ?? '');

function shapeRules(parts) {
  if (!parts || typeof parts !== 'object') return ['renderTripLanding must return an object'];
  const out = [];
  for (const key of STRING_PARTS) if (typeof parts[key] !== 'string') out.push(`${key}: must be a string`);
  for (const key of Object.keys(parts)) if (!PART_KEYS.includes(key)) out.push(`${key}: not a part of the contract`);
  if (!Array.isArray(parts.openSections) || parts.openSections.some((name) => !OPENABLE.includes(name))) out.push(`openSections: any of ${OPENABLE.join(', ')}`);
  if (!Number.isInteger(parts.openSectionsMinWidth) || parts.openSectionsMinWidth < 0) out.push('openSectionsMinWidth: a width in px, 0 for always');
  if ('dayAside' in parts && typeof parts.dayAside !== 'boolean') out.push('dayAside: true or false, or left out');
  return out;
}

const topElements = (root) => root.children.filter(isElement);
const looseText = (root) => root.children.some((child) => !isElement(child) && child.text.trim() !== '');

function barRules(bar, model) {
  const out = [];
  const top = topElements(bar);
  if (top.length !== 1 || !matches(top[0], 'header.tv-bar') || looseText(bar)) out.push('bar: must be exactly one <header class="tv-bar">');
  const back = all(bar, 'a.tv-back');
  if (back.length !== 1 || attr(back[0], 'href') !== '#/' || !/\bTrips\b/.test(textOf(back[0]))) out.push('bar: needs one <a href="#/" class="tv-back"> with the visible word Trips');
  if (all(bar, 'p[data-pdf-status][role="status"]').length !== 1) out.push('bar: needs one <p data-pdf-status role="status">');
  const region = all(bar, '[data-region="bar-actions"]');
  if (region.length !== 1) out.push('bar: needs one data-region="bar-actions"');
  for (const key of ACTION_KEYS) {
    if (all(bar, `[data-action="${key}"]`).some((el) => !isInside(el, '[data-region="bar-actions"]'))) out.push(`bar: the ${key} control belongs inside bar-actions`);
  }
  for (const slot of all(bar, '[data-tabs-slot]')) {
    if (slot.children.length || !wholeNumber(attr(slot, 'data-slot-from'))) out.push('bar: a tabs slot is empty and carries data-slot-from="<px>"');
  }
  if (all(bar, '[data-tabs-slot]').length > 1) out.push('bar: at most one tabs slot');
  if (model.title && all(bar, 'h1').length) out.push('bar: the h1 belongs in hero');
  return out;
}

function heroRules(hero, model, ctx) {
  const out = [];
  const h1 = all(hero, 'h1');
  if (h1.length !== 1 || !textOf(h1[0]).includes(model.title)) out.push('hero: needs the only h1, carrying model.title');
  const root = all(hero, '[id="td-hero"]');
  if (root.length !== 1) out.push('hero: needs one element with id="td-hero"');
  for (const el of root) {
    if (attr(el, 'data-region') !== null) out.push('hero: the hero root is not a region');
    if (all(el, '[data-carry="cover"]').length !== 1) out.push('hero: the photo frame needs data-carry="cover", photo or placeholder');
  }
  const status = all(hero, '[data-region="hero-status"]');
  if (status.length !== 1) out.push('hero: needs one data-region="hero-status"');
  for (const el of status) {
    if (all(el, 'h1, img, [data-carry]').length) out.push('hero: hero-status may not wrap the h1 or the image');
  }
  const notes = topElements(parseHtml(ctx.slots.notes).root)[0];
  if (!notes) return out;
  const placed = elements(hero).filter((el) => el.tag === notes.tag && JSON.stringify(el.attrs) === JSON.stringify(notes.attrs));
  if (placed.length !== 1) out.push(`hero: ctx.slots.notes must be placed exactly once, found ${placed.length}`);
  if (placed.some((el) => isInside(el, '[data-region]'))) out.push('hero: ctx.slots.notes may not sit inside a data-region');
  return out;
}

function tabsRules(tabs) {
  const out = [];
  const top = topElements(tabs);
  if (top.length !== 1 || !matches(top[0], '.td-tabs') || looseText(tabs)) return ['tabs: must be exactly one .td-tabs element'];
  const list = top[0];
  if (attr(list, 'role') !== 'tablist') out.push('tabs: .td-tabs needs role="tablist"');
  const items = all(list, '.td-tab');
  const keys = items.map((el) => attr(el, 'data-tab'));
  if (keys.join() !== TAB_KEYS.join()) out.push(`tabs: needs .td-tab[data-tab] for ${TAB_KEYS.join(', ')}, in that order`);
  const active = items.filter((el) => classesOf(el).includes('td-tab--active'));
  if (active.length !== 1) out.push(`tabs: exactly one .td-tab--active, found ${active.length}`);
  for (const el of items) {
    if (attr(el, 'role') !== 'tab') out.push('tabs: every .td-tab needs role="tab"');
    if (attr(el, 'aria-selected') !== String(active.includes(el))) out.push('tabs: aria-selected must follow .td-tab--active');
  }
  return out;
}

function actionRules(whole, model) {
  const out = [];
  const offered = model.actions.map((action) => action.key);
  for (const action of model.actions) {
    const controls = action.key === 'read-view'
      ? all(whole, 'a').filter((a) => attr(a, 'href') === action.href)
      : all(whole, `[data-action="${action.key}"]`);
    if (!controls.length) out.push(`action ${action.key}: not reachable`);
    if (action.key !== 'read-view' && controls.some((el) => el.tag !== 'button')) out.push(`action ${action.key}: must be a button`);
  }
  for (const key of ACTION_KEYS.filter((name) => !offered.includes(name))) {
    if (all(whole, `[data-action="${key}"]`).length) out.push(`action ${key}: drawn although the model does not offer it`);
  }
  if (!offered.includes('read-view') && all(whole, 'a').some((a) => /\/read$/.test(attr(a, 'href') ?? ''))) out.push('action read-view: linked although the model does not offer it');
  return out;
}

function jumpRules(whole, model) {
  const out = [];
  const has = (selector) => all(whole, selector).length > 0;
  const need = (name, wanted) => { if (wanted && !has(`[data-region="${name}"]`)) out.push(`needs data-region="${name}" (its model part is not empty)`); };
  need('glance', model.glance.length);
  need('readiness', model.readiness);
  need('dayindex', model.days.length);
  need('map-caption', model.map.points.length);
  for (const row of model.days) if (!has(`[data-day-jump="${row.index}"]`)) out.push(`day ${row.dayNumber}: no data-day-jump="${row.index}"`);
  for (const el of all(whole, '[data-day-jump]')) {
    if (!model.days[Number(attr(el, 'data-day-jump'))] || !wholeNumber(attr(el, 'data-day-jump'))) out.push(`data-day-jump="${attr(el, 'data-day-jump')}" is not a day row`);
  }
  for (const el of all(whole, '[data-section-jump]')) {
    const target = attr(el, 'data-section-jump');
    if (!SECTION_TARGETS.includes(target)) out.push(`data-section-jump="${target}" is not a section`);
    if (attr(el, 'aria-controls') !== `td-section-${target}`) out.push(`data-section-jump="${target}" needs aria-controls="td-section-${target}"`);
  }
  if (model.readiness && !model.readiness.collapsed) {
    for (const item of model.readiness.items) if (!has(`[data-section-jump="${item.target}"]`)) out.push(`readiness row ${item.area}: no data-section-jump="${item.target}"`);
  }
  for (const el of all(whole, '[data-map-day]')) {
    const day = attr(el, 'data-map-day');
    if (!wholeNumber(day) || Number(day) > model.map.dayCount) out.push(`data-map-day="${day}" is not 0 or a day number`);
  }
  const slots = all(whole, '[data-map-slot]');
  if (slots.length > 2 || (model.map.points.length && !slots.length)) out.push(`needs one or two map slots, found ${slots.length}`);
  for (const slot of slots) {
    const bounds = [attr(slot, 'data-map-from'), attr(slot, 'data-map-below')].filter((value) => value !== null);
    if (slot.children.length || bounds.some((value) => !wholeNumber(value))) out.push('a map slot is empty; data-map-from and data-map-below are px numbers');
  }
  if (slots.length === 2) {
    const [from, below] = [attr(slots[0], 'data-map-from') ?? attr(slots[1], 'data-map-from'), attr(slots[0], 'data-map-below') ?? attr(slots[1], 'data-map-below')];
    if (from === null || below === null || from !== below) out.push('two map slots must split the widths at one px value (data-map-from on one, data-map-below on the other)');
  }
  return out;
}

/**
 * @param {object} parts  what renderTripLanding returned
 * @param {object} model  the TripOverviewModel it was rendered from
 * @param {object} ctx    the ViewCtx it was rendered with
 * @returns {string[]} one line per broken rule; empty when the parts keep the contract
 */
export function checkTripLanding(parts, model, ctx) {
  const shape = shapeRules(parts);
  if (shape.length) return shape;
  const trees = Object.fromEntries(STRING_PARTS.map((key) => [key, parseHtml(parts[key])]));
  const out = STRING_PARTS.flatMap((key) => trees[key].errors.map((error) => `${key}: markup: ${error}`));
  // One tree of all six parts, in page order, for the rules that look at the landing as a whole.
  const whole = { tag: '', attrs: {}, children: [], parent: null };
  for (const key of STRING_PARTS) {
    for (const child of trees[key].root.children) { child.parent = whole; whole.children.push(child); }
    trees[key].root.children.forEach((child) => { child.part = key; });
  }
  const partOf = (el) => { let top = el; while (top.parent && top.parent !== whole) top = top.parent; return top.part; };
  out.push(...markupRules(whole), ...regionRules(whole));
  if (all(whole, 'h1').length !== 1) out.push(`needs exactly one h1, found ${all(whole, 'h1').length}`);
  for (const selector of NOT_IN_REGION) {
    if (all(whole, selector).some((el) => isInside(el, '[data-region]'))) out.push(`${selector} may not sit inside a data-region`);
  }
  for (const el of all(whole, '.tv-bar')) if (partOf(el) !== 'bar') out.push(`.tv-bar may sit only in bar, found in ${partOf(el)}`);
  for (const el of all(whole, '.td-tabs')) if (partOf(el) !== 'tabs') out.push(`.td-tabs may sit only in tabs, found in ${partOf(el)}`);
  for (const el of all(whole, 'h1')) if (partOf(el) !== 'hero') out.push(`the h1 belongs in hero, found in ${partOf(el)}`);
  for (const el of all(whole, '[data-tabs-slot]')) if (partOf(el) !== 'bar') out.push(`a tabs slot may sit only in bar, found in ${partOf(el)}`);
  for (const el of elements(whole)) {
    const foreign = classesOf(el).filter((name) => NOT_THE_LANDINGS.includes(name) || name.startsWith('td-chat'));
    if (foreign.length) out.push(`the landing does not draw ${foreign.join(', ')}`);
  }
  const subtree = (key) => ({ tag: '', attrs: {}, parent: null, children: whole.children.filter((child) => child.part === key) });
  out.push(...barRules(subtree('bar'), model), ...heroRules(subtree('hero'), model, ctx), ...tabsRules(subtree('tabs')));
  out.push(...actionRules(whole, model), ...jumpRules(whole, model));
  return out;
}
