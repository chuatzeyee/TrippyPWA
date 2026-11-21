// The hook table of blueprint 3.3, checked on the HTML string a dashboard renderer returns.
// Steward: F0.
import { all, ancestor, attr, isInside, matches, parseHtml, previousElement, textOf } from './html-tree.js';
import { markupRules, regionRules } from './markup-rules.js';

const IN_PROGRESS = ['generating', 'failed'];
const NOT_IN_REGION = ['h1', '[data-trip-search]', '[data-slot="chooser"]', '[data-map-slot]', '[data-tabs-slot]'];
const WHOLE_TRIP = /whole trip/i;

function tripElementRules(el, model) {
  const id = attr(el, 'data-trip-id');
  const card = model.cardsById[id];
  const at = `trip element ${id}`;
  if (!card) return [`${at}: no such plan in the model`];
  const out = [];
  if (attr(el, 'data-key') !== id) out.push(`${at}: data-key must equal the plan id`);
  if (isInside(el, '[data-trip-id]')) out.push(`${at}: sits inside another trip element`);
  const state = attr(el, 'data-trip-state');
  const links = all(el, 'a').filter((a) => (attr(a, 'href') ?? '').startsWith(card.href));
  if (IN_PROGRESS.includes(card.phase)) {
    if (state !== card.phase) out.push(`${at}: needs data-trip-state="${card.phase}"`);
    if (links.length) out.push(`${at}: a ${card.phase} plan has no link`);
    if (card.phase === 'generating' && !matches(el, '[role="status"]') && !all(el, '[role="status"]').length) out.push(`${at}: a generating card needs role="status"`);
    if (card.phase === 'failed') {
      if (!all(el, `[data-retry-trip="${id}"]`).length) out.push(`${at}: a failed plan needs data-retry-trip`);
      const canDelete = all(el, `[data-delete-trip="${id}"]`).length > 0;
      if (card.shared && canDelete) out.push(`${at}: no delete on a plan shared with the user`);
      if (!card.shared && !canDelete) out.push(`${at}: a failed plan of the user's own needs data-delete-trip`);
    }
    return out;
  }
  if (state !== null) out.push(`${at}: data-trip-state is for generating and failed plans only`);
  const stretched = all(el, 'a.trip-card-link');
  if (stretched.length !== 1) out.push(`${at}: needs exactly one a.trip-card-link, found ${stretched.length}`);
  for (const link of stretched) {
    if (attr(link, 'href') !== card.href) out.push(`${at}: the card link must use the neutral href ${card.href}`);
    if (attr(link, 'aria-label') !== `Open ${card.title}`) out.push(`${at}: the card link needs aria-label="Open ${card.title}"`);
  }
  if (!all(el, 'h3').some((h3) => textOf(h3).includes(card.title))) out.push(`${at}: the trip title must be an h3`);
  if (!card.briefingPending && attr(el, 'data-briefing') !== null) out.push(`${at}: data-briefing is for a plan whose briefing is still awaited`);
  if (card.cover.fallbackSrc) {
    for (const img of all(el, 'img').filter((image) => attr(image, 'src') === card.cover.src)) {
      if (attr(img, 'data-fallback') !== card.cover.fallbackSrc) out.push(`${at}: the cover needs data-fallback with the original URL`);
    }
  }
  return out;
}

function presenceRules(root, model) {
  const out = [];
  const drawn = new Set(all(root, '[data-trip-id]').map((el) => attr(el, 'data-trip-id')));
  const { sections, filter } = model;
  const must = [...sections.inProgress, ...sections.live, ...sections.upcoming, ...sections.undated, ...(filter.expanded ? sections.past : sections.past.slice(0, 1))];
  for (const card of must) if (!drawn.has(card.id)) out.push(`plan ${card.id} (${card.phase}) is not drawn`);
  for (const card of Object.values(model.cardsById).filter((one) => one.briefingPending && drawn.has(one.id))) {
    if (!all(root, `[data-trip-id="${card.id}"][data-briefing="pending"]`).length) out.push(`plan ${card.id}: its briefing is awaited, so a card needs data-briefing="pending"`);
  }
  for (const briefing of model.live) {
    const { id, todayHref } = briefing.trip;
    const today = all(root, `a[data-now-trip="${id}"]`);
    if (!today.length) out.push(`live plan ${id}: needs an "Open today" link with data-now-trip`);
    if (today.some((a) => attr(a, 'href') !== todayHref)) out.push(`live plan ${id}: the data-now-trip link must use todayHref`);
  }
  return out;
}

function controlRules(root, model) {
  const out = [];
  for (const el of all(root, '[data-now-trip]')) {
    const card = model.cardsById[attr(el, 'data-now-trip')];
    if (!card || card.phase !== 'live') out.push(`data-now-trip="${attr(el, 'data-now-trip')}" is not a live plan`);
    if (el.tag !== 'a') out.push('data-now-trip must sit on a link');
  }
  const wholeHrefs = Object.values(model.cardsById).map((card) => card.wholeHref);
  for (const a of all(root, 'a')) {
    if (!WHOLE_TRIP.test(`${textOf(a)} ${attr(a, 'aria-label') ?? ''}`)) continue;
    const owner = ancestor(a, '[data-trip-id]');
    const wanted = owner ? model.cardsById[attr(owner, 'data-trip-id')]?.wholeHref : null;
    const href = attr(a, 'href');
    if (wanted ? href !== wanted : !wholeHrefs.includes(href)) out.push(`a "whole trip" control must use wholeHref, got ${href}`);
  }
  for (const el of all(root, '[data-action="plan-city"]')) {
    if (el.tag !== 'button' || !attr(el, 'data-city')) out.push('data-action="plan-city" must be a button with data-city');
  }
  const hopsRegion = all(root, '[data-region="hops"]')[0];
  if (hopsRegion) {
    for (const hop of model.hops) {
      if (!all(hopsRegion, '[data-action="plan-city"]').some((el) => attr(el, 'data-city') === hop.name)) out.push(`hop ${hop.name}: no plan-city button in the hops region`);
    }
  }
  const filterKeys = model.filter.options.map((option) => option.key);
  for (const el of all(root, '[data-filter]')) {
    if (!isInside(el, '[data-region="filters"]')) out.push('data-filter chips belong in the filters region');
    if (!filterKeys.includes(attr(el, 'data-filter'))) out.push(`data-filter="${attr(el, 'data-filter')}" is not a filter option`);
  }
  const detailKeys = all(root, 'details').map((el) => attr(el, 'data-key'));
  if (detailKeys.some((key) => !key)) out.push('every details group needs data-key');
  if (new Set(detailKeys).size !== detailKeys.length) out.push('details groups share a data-key');
  return out;
}

function landmarkRules(root) {
  const out = [];
  for (const section of all(root, 'section')) {
    const label = attr(section, 'aria-labelledby');
    if (!label || !all(section, 'h2').some((h2) => attr(h2, 'id') === label)) out.push('every section needs aria-labelledby naming an h2 inside it');
  }
  for (const table of all(root, '[role="table"]')) {
    for (const role of ['row', 'columnheader', 'cell']) {
      if (!all(table, `[role="${role}"]`).length) out.push(`a board with role="table" needs role="${role}" parts`);
    }
  }
  return out;
}

function stateRules(root, model) {
  const out = [];
  const count = (selector) => all(root, selector).length;
  for (const action of ['new-trip', 'import-trip']) {
    if (!count(`[data-action="${action}"]`)) out.push(`state ${model.state}: needs data-action="${action}"`);
  }
  const retryIn = (role) => all(root, `[role="${role}"]`).some((el) => all(el, '[data-action="retry-trips"]').length);
  if (model.state === 'error' && !retryIn('alert')) out.push('load error: needs a role="alert" panel holding data-action="retry-trips"');
  if (model.stale && !retryIn('status')) out.push('stale list: needs a role="status" banner holding data-action="retry-trips"');
  if (model.state !== 'ready') {
    if (count('[data-trip-id]')) out.push(`state ${model.state}: draws a trip`);
    return out;
  }
  for (const region of ['lead', 'live', 'next', 'trips']) {
    if (!count(`[data-region="${region}"]`)) out.push(`ready: needs data-region="${region}", even when empty`);
  }
  const slots = all(root, '[data-slot="chooser"]');
  if (slots.length !== 1) out.push(`ready: needs exactly one chooser slot, found ${slots.length}`);
  for (const slot of slots) {
    if (slot.tag !== 'div' || slot.children.length) out.push('the chooser slot is an empty div');
    const before = previousElement(slot);
    if (!before || !(before.tag === 'h1' || all(before, 'h1').length)) out.push('the chooser slot sits directly after the block that holds the h1');
  }
  return out;
}

/**
 * @param {string} html   what renderDashboard returned
 * @param {object} model  the DashboardModel it was rendered from
 * @returns {string[]} one line per broken rule; empty when the markup keeps the contract
 */
export function checkDashboardHtml(html, model) {
  if (typeof html !== 'string') return ['renderDashboard must return a string'];
  const { root, errors } = parseHtml(html);
  const out = [...errors.map((error) => `markup: ${error}`), ...markupRules(root), ...regionRules(root)];
  const h1 = all(root, 'h1');
  if (h1.length !== 1) out.push(`needs exactly one h1, found ${h1.length}`);
  if (h1.some((el) => attr(el, 'data-region') !== null)) out.push('the h1 itself may not be a region');
  for (const selector of NOT_IN_REGION) {
    if (all(root, selector).some((el) => isInside(el, '[data-region]'))) out.push(`${selector} may not sit inside a data-region`);
  }
  out.push(...stateRules(root, model), ...landmarkRules(root));
  if (model.state !== 'ready') return out;
  for (const el of all(root, '[data-trip-id]')) out.push(...tripElementRules(el, model));
  out.push(...presenceRules(root, model), ...controlRules(root, model));
  return out;
}
