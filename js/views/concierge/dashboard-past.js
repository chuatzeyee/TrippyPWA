// The lower half of the Concierge dashboard: the stats as one sentence, the past plans by month,
// the short hops and the foot. Regions: `stats`, `past` and `hops`. Owner: VB.
import { attr, cls, esc, flagChip } from '../shared/html.js';
import { coverFrameHtml, tileFrameHtml } from '../shared/photo-frame.js';
import { creditsListHtml } from '../shared/credits.js';
import { pastToggleHtml } from '../shared/state-cards.js';
import { countOf, wordList } from './words.js';
import { cardLink, costHtml, creditSlot, secHead, tripAttrs } from './parts.js';

const STATS_ID = 'con-stats-h';
const PAST_ID = 'con-past-h';
const HOPS_ID = 'con-hops-h';
/** Month groups that start open; older ones fold into a details group when they hold several plans. */
const OPEN_MONTHS = 2;
/** An older month folds from this many plans: a fold for one plan would be longer than its row. */
const FOLD_FROM = 2;
/** Titles named in the summary of a folded month before "and N more". */
const NAMED_PLANS = 3;

// --- Stats --------------------------------------------------------------------------------------------

/**
 * "22 plans, 13 countries, 240 days planned." with the flags and the country names: the `stats` region.
 * '' while there is no plan to count.
 * @param {import('../contract.js').DashboardModel} model
 */
export function statsSection(model) {
  const { trips, countries, daysPlanned, byCountry } = model.stats;
  if (!(trips > 0)) return '';
  const figure = (n, one, many) => `<b>${esc(n)}</b> ${n === 1 ? one : many}`;
  const parts = [figure(trips, 'plan', 'plans'), countries > 0 ? figure(countries, 'country', 'countries') : '', figure(daysPlanned, 'day planned', 'days planned')].filter(Boolean);
  const flags = byCountry.map((entry) => flagChip(entry.flag, { size: 28 })).join('');
  const names = wordList(byCountry.map((entry) => entry.country));
  const side = flags || names ? `<div class="con-stats-side">${flags ? `<p class="con-flags" aria-hidden="true">${flags}</p>` : ''}${names ? `<p class="con-stats-names">${esc(names)}.</p>` : ''}</div>` : '';
  return `<section class="con-stats" aria-labelledby="${STATS_ID}" data-region="stats">
    <h2 class="con-stats-line" id="${STATS_ID}">${parts.join(', ')}.</h2>${side}
  </section>`;
}

// --- Past plans ---------------------------------------------------------------------------------------

function pastRow(card, ctx) {
  const thumb = coverFrameHtml(card.cover, { ratio: '1x1', animate: ctx.animate, credit: false, tone: 6, sizes: '64px', cls: 'con-prow-thumb' });
  const shared = card.shared ? ', shared with you' : '';
  return `<article class="con-prow"${tripAttrs(card)}>
    ${thumb}
    <h3 class="con-prow-title">${esc(card.title)}</h3>
    <div class="con-prow-meta">
      <p class="con-prow-dates">${esc(card.dates.text)}, ${esc(countOf(card.dates.dayCount, 'day', 'days'))}${shared}</p>
      ${costHtml(card.cost, 'con-prow-cost', { short: true })}
    </div>
    ${cardLink(card)}
  </article>`;
}

function monthNames(trips) {
  const titles = trips.map((card) => card.title);
  if (titles.length <= NAMED_PLANS + 1) return `${wordList(titles)}.`;
  return `${titles.slice(0, NAMED_PLANS).join(', ')} and ${titles.length - NAMED_PLANS} more.`;
}

function monthHtml(group, ctx, { folded, open }) {
  const key = `past-${group.key}`;
  const count = countOf(group.trips.length, 'plan', 'plans');
  const what = group.trips.length === 1 ? 'plan' : count;
  const label = `<span class="con-month-name">${esc(group.label)}</span> <span class="con-month-count">${esc(count)}</span>`;
  const rows = `<div class="con-month-rows">${group.trips.map((card) => pastRow(card, ctx)).join('')}</div>`;
  if (!folded) return `<div class="con-month" role="group"${attr('aria-label', group.label)}${attr('data-key', key)}><p class="con-month-label">${label}</p>${rows}</div>`;
  return `<details class="con-month"${attr('data-key', key)}${attr('open', open)}>
    <summary class="con-month-sum"${attr('data-focus-key', key)}>
      <span class="con-month-label">${label}</span>
      <span class="con-month-names">${esc(monthNames(group.trips))}</span>
      <span class="con-month-toggle"><span class="con-month-show">Show the ${esc(what)}</span><span class="con-month-hide">Hide the ${esc(what)}</span></span>
    </summary>${rows}
  </details>`;
}

/**
 * Past plans by month, newest first: the `past` region. The two latest months are open, an older one
 * with several plans is a details group, and every group is open while a search or a filter is on.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function pastSection(model, ctx) {
  const total = model.sections.past.length;
  const expanded = model.filter.expanded;
  const folds = (group, i) => i >= OPEN_MONTHS && group.trips.length >= FOLD_FROM;
  const months = model.pastByMonth.map((group, i) => monthHtml(group, ctx, { folded: expanded || folds(group, i), open: expanded })).join('');
  const more = !expanded && model.pastByMonth.some(folds) ? `<p class="con-past-more" data-key="more">${pastToggleHtml(total)}</p>` : '';
  const head = secHead({
    id: PAST_ID, title: 'Past plans', key: 'head', count: total || null, countText: countOf(total, 'plan', 'plans'),
    line: total ? 'Newest first, by the month each plan starts.' : '',
  });
  return `<section class="con-sec con-past" aria-labelledby="${PAST_ID}" data-region="past"${total ? '' : ' hidden'}>${head}${months}${more}</section>`;
}

// --- Short hops ---------------------------------------------------------------------------------------

function hopHtml(hop, ctx, { compact }) {
  const where = `${hop.country}, about ${hop.km} km`;
  const lines = compact ? '' : `<span class="con-hop-line">${esc(where)}</span><span class="con-hop-line">${esc(hop.note)}</span>`;
  const tile = tileFrameHtml(hop.cover, {
    tag: 'span', animate: ctx.animate, scrim: true, credit: false, tone: 7, sizes: '(min-width: 900px) 280px, 45vw',
    over: `<span class="con-hop-name">${esc(hop.name)}</span>${lines}`,
  });
  return `<li class="con-hop"${attr('data-key', hop.name)}>
    <button type="button" class="con-hop-btn" data-action="plan-city"${attr('data-city', hop.name)}${attr('data-focus-key', `hop-${hop.name}`)}${attr('aria-label', `Plan a trip to ${hop.name}. ${where}. ${hop.note}.`)}>${tile}</button>
    ${compact ? '' : creditSlot(hop.cover)}
  </li>`;
}

/**
 * Short hops from the home city, nearest first: a snap row on phones (it fades at the edge where a
 * tile is cut, the shared ui-scroll-fade), a grid on wide screens. The list is the `hops` region. `compact` is the row of small tiles under an empty dashboard.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @param {{ compact?: boolean }} [opts]
 */
export function hopsSection(model, ctx, { compact = false } = {}) {
  if (!model.hops.length) return '';
  const home = String(model.user?.homeCity ?? '').trim();
  const head = compact
    ? `<h2 class="con-start-sub" id="${HOPS_ID}">Or start with a short hop${home ? ` from ${esc(home)}` : ''}.</h2>`
    : secHead({ id: HOPS_ID, title: home ? `Short hops from ${home}` : 'Short hops', line: 'Nearest first. Distances are straight lines from home.' });
  const tiles = model.hops.map((hop) => hopHtml(hop, ctx, { compact })).join('');
  return `<section class="${cls('con-sec con-hops-sec', { 'con-hops-sec--start': compact })}" aria-labelledby="${HOPS_ID}">
    ${head}
    <ul class="${cls('con-hops ui-scroll-fade', { 'con-hops--compact': compact })}" data-region="hops" data-keep-scroll="hops">${tiles}</ul>
  </section>`;
}

// --- Foot ---------------------------------------------------------------------------------------------

/**
 * The estimate and typical-weather note, then every photo credit in full. The credits are the
 * `credits` region, there also when it is empty: their order follows the cards, so a plan that
 * finishes or arrives changes them, and a region is patched where the frame would be drawn again.
 * @param {import('../contract.js').DashboardModel} model
 * @returns {string}
 */
export function footHtml(model) {
  const code = model.user?.homeCurrency?.code;
  const money = code ? `Amounts in ${esc(code)} are estimates.` : 'Amounts are estimates, in the currency of each plan.';
  return `<footer class="con-foot">
    <p class="con-foot-note">Weather is the typical range for the season, not a forecast. ${money}</p>
    <div class="con-foot-credits" data-region="credits">${creditsListHtml(model.credits)}</div>
  </footer>`;
}
