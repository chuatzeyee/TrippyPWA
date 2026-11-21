// The plans ahead on the Concierge dashboard: the ones still being planned, the next departure with
// what is left to do before leaving, and the other upcoming and undated plans as cards. Three
// regions: `planning`, `next` (the Upcoming section with its lead) and `trips`. Owner: VB.
import { button, cls, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { readinessChipHtml, readinessListHtml } from '../shared/readiness-list.js';
import { segmentsHtml } from '../shared/segments.js';
import { countOf, settledLine } from './words.js';
import { cardLink, costHtml, creditSlot, enter, flagOf, ghost, secHead, sharedLine, tripAttrs, weatherWords } from './parts.js';

const HEAD_ID = 'con-up-h';
const MAX_TODO = 3;
const CARRIES_ON = 'You can leave this page and the planning carries on.';
const PICKS_UP = 'Your answers are saved, and trying again picks up where it stopped.';
/** Unseen text of a usual length, held where late data will be drawn. */
const RESERVE = { weather: ', 10 to 20°C typical', chip: '3 to do', lead: '10 to 20°C, sunny' };
const whole = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const placeName = (card) => card.places?.[0]?.name || card.title;

// --- Still being planned, and planning that stopped ---------------------------------------------------

function progressHtml(generation, { current }) {
  const done = whole(generation?.daysDone);
  const total = whole(generation?.daysTotal);
  const big = total
    ? `<span class="con-num">${done}</span> of ${countOf(total, 'day', 'days')} planned`
    : `<span class="con-num">${done}</span> ${done === 1 ? 'day' : 'days'} planned so far`;
  const bar = total ? segmentsHtml(done, total, current ? Math.min(total, done + 1) : null, { label: `${done} of ${countOf(total, 'day', 'days')} planned` }) : '';
  return `<p class="con-plan-big">${big}</p>${bar}`;
}

function planHead(card) {
  return `<h3 class="con-plan-title">${flagOf(card.flags)}<span>${esc(card.title)}</span></h3>
    <p class="con-plan-dates">${esc(card.dates.text)}</p>${sharedLine(card)}`;
}

function generatingHtml(card) {
  const eta = whole(card.generation?.etaMinutes);
  const lead = eta ? `About ${countOf(eta, 'minute', 'minutes')} left. ` : card.generation?.slow ? 'This is taking longer than usual. ' : '';
  const tell = button('Tell me when it is ready', {
    action: 'notify-ready', focusKey: `notify-${card.id}`, cls: 'ui-btn con-btn con-btn--line', html: `${icon('bell', 18)}<span>Tell me when it is ready</span>`,
  });
  return `<article class="con-plan-card"${tripAttrs(card, 'generating')} role="status">
    ${planHead(card)}
    <p class="con-plan-status"><span class="con-dot"></span><span>Still being planned</span></p>
    ${progressHtml(card.generation, { current: true })}
    <p class="con-plan-note">${esc(lead)}${CARRIES_ON}</p>
    <p class="con-plan-actions">${tell}</p>
  </article>`;
}

function failedHtml(card) {
  const why = String(card.generation?.error ?? '').trim() || 'Planning stopped before the plan was finished.';
  const retry = button('Try again', { focusKey: `retry-${card.id}`, cls: 'ui-btn con-btn con-btn--cta', attrs: { 'data-retry-trip': card.id } });
  const remove = card.shared ? '' : button('Delete this trip', { focusKey: `delete-${card.id}`, cls: 'con-link', attrs: { 'data-delete-trip': card.id } });
  return `<article class="con-plan-card con-plan-card--failed"${tripAttrs(card, 'failed')}>
    ${planHead(card)}
    <p class="con-plan-status con-plan-status--stopped">${icon('warning', 18)}<span>Planning stopped</span></p>
    ${progressHtml(card.generation, { current: false })}
    <p class="con-plan-note">${esc(why)} ${PICKS_UP}</p>
    <p class="con-plan-actions">${retry}${remove}</p>
  </article>`;
}

/** The `planning` region: one card per plan that is generating or failed. Empty when there is none. */
export function planningRegion(model) {
  const cards = model.sections.inProgress.map((card) => (card.phase === 'failed' ? failedHtml(card) : generatingHtml(card))).join('');
  return `<div class="con-planning" data-region="planning">${cards}</div>`;
}

// --- The next departure -------------------------------------------------------------------------------

/** "Before you leave": the rows still to do, each linking to the plan, and one line for what is settled. */
function todoHtml(next) {
  const { trip } = next;
  const readiness = trip.readiness;
  if (!readiness) {
    if (!trip.briefingPending) return '';
    return `<div class="con-todo con-todo--pending">
      <div class="con-todo-head"><h4 class="con-todo-title">Before you leave</h4>${ghost(RESERVE.chip)}</div>
      <p class="con-todo-wait">Checking what is left to do.</p>
    </div>`;
  }
  const settled = settledLine(next.settled);
  return `<div class="con-todo">
    <div class="con-todo-head"><h4 class="con-todo-title">Before you leave</h4>${readinessChipHtml(readiness)}</div>
    ${readinessListHtml(readiness, { heading: 'h4', id: trip.id, href: trip.href, only: 'todo', max: MAX_TODO })}
    ${settled ? `<p class="con-settled"><span class="con-tick" aria-hidden="true">${icon('check', 14)}</span><span>${esc(settled)}</span></p>` : ''}
  </div>`;
}

function nextHtml(next, ctx, { priority }) {
  const { trip } = next;
  const photo = coverFrameHtml(trip.cover, {
    ratio: '3x2', priority, animate: ctx.animate, credit: false, over: creditSlot(trip.cover), name: placeName(trip), flag: trip.flags[0], tone: 5,
    sizes: '(min-width: 900px) 480px, 100vw', cls: 'con-next-frame',
  });
  const who = Number.isFinite(trip.travellers) && trip.travellers > 0 ? ` ${countOf(trip.travellers, 'traveller', 'travellers')}.` : '';
  const weather = weatherWords(trip.weather);
  const weatherRow = weather || trip.briefingPending
    ? `<div><dt>Typical weather</dt><dd>${weather ? esc(weather) : ghost(RESERVE.lead)}</dd></div>` : '';
  const cost = costHtml(trip.cost);
  const facts = weatherRow || cost ? `<dl class="con-facts">${weatherRow}${cost ? `<div><dt>Estimated cost</dt><dd>${cost}</dd></div>` : ''}</dl>` : '';
  return `<article class="con-next"${tripAttrs(trip)}>
    <div class="con-next-photo">${photo}${cardLink(trip)}</div>
    <div class="con-next-body">
      <p class="con-kicker">Next departure</p>
      <h3 class="con-next-title">${flagOf(trip.flags, 28)}<span>${esc(trip.title)}</span></h3>
      <p class="con-next-dates">${esc(trip.dates.text)}. ${esc(next.lengthText)}.${esc(who)}</p>
      ${sharedLine(trip)}
      <div class="con-next-facts">
        <p class="con-count"><span class="con-num">${esc(next.daysToGo)}</span><span class="con-unit"><span>${next.daysToGo === 1 ? 'day' : 'days'}</span> <span>to go</span></span></p>
        ${facts}
      </div>
      ${todoHtml(next)}
    </div>
  </article>`;
}

/** The next departure, when the filtered list still holds it. */
const leadOf = (model) => (model.next && model.sections.upcoming.some((card) => card.id === model.next.trip.id) ? model.next : null);

/**
 * The Upcoming section with the next departure: the `next` region, hidden while there is none.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function upcomingSection(model, ctx) {
  const lead = leadOf(model);
  const total = model.sections.upcoming.length;
  const head = secHead({ id: HEAD_ID, title: 'Upcoming', key: 'head', count: lead ? total : null, countText: countOf(total, 'plan', 'plans'), line: lead ? 'Soonest first.' : '' });
  const body = lead ? nextHtml(lead, ctx, { priority: model.live.length === 0 }) : '';
  return `<section class="${cls('con-sec con-up', enter(ctx, 3))}" aria-labelledby="${HEAD_ID}" data-region="next"${lead ? '' : ' hidden'}>${head}${body}</section>`;
}

// --- The other plans ----------------------------------------------------------------------------------

function upCardHtml(card, ctx) {
  const photo = coverFrameHtml(card.cover, {
    ratio: '16x9', animate: ctx.animate, credit: false, over: creditSlot(card.cover), name: placeName(card), flag: card.flags[0], tone: 4,
    sizes: '(min-width: 768px) 360px, 104px', cls: 'con-up-frame',
  });
  const dated = card.phase !== 'undated';
  const length = dated ? countOf(card.dates.dayCount, 'day', 'days') : `${countOf(card.dates.itineraryDays, 'day', 'days')} planned`;
  const who = Number.isFinite(card.travellers) && card.travellers > 0 ? `, ${countOf(card.travellers, 'traveller', 'travellers')}` : '';
  const weather = card.weather?.range ? `<span>, ${esc(card.weather.range)} typical</span>` : card.briefingPending ? ghost(RESERVE.weather) : '';
  const count = Number.isFinite(card.daysToGo)
    ? `<p class="con-count con-count--sm"><span class="con-num">${esc(card.daysToGo)}</span><span class="con-unit">${card.daysToGo === 1 ? 'day' : 'days'} to go</span></p>` : '';
  const chip = card.readiness ? readinessChipHtml(card.readiness) : card.briefingPending ? ghost(RESERVE.chip) : '';
  return `<article class="con-up-card"${tripAttrs(card)}>
    ${photo}
    <div class="con-up-body">
      <h3 class="con-up-title">${flagOf(card.flags)}<span>${esc(card.title)}</span></h3>
      <p class="con-up-dates">${esc(card.dates.text)}</p>
      <p class="con-up-facts">${esc(length)}${esc(who)}${weather}</p>
      ${sharedLine(card)}
      ${count || chip ? `<div class="con-up-row">${count}${chip}</div>` : ''}
      ${costHtml(card.cost)}
    </div>
    ${cardLink(card)}
  </article>`;
}

/** What to say when a search or a filter leaves the lists empty; '' when something is shown. */
function nothingText(model) {
  const { sections, filter } = model;
  if (!filter.expanded || sections.inProgress.length || sections.upcoming.length || sections.undated.length || sections.past.length) return '';
  if (filter.q) return 'No plan matches that search.';
  if (filter.active === 'shared') return 'Nothing has been shared with you yet.';
  if (filter.active === 'live') return sections.live.length ? '' : 'No plan is running today.';
  if (filter.active === 'upcoming') return 'Nothing is coming up.';
  return filter.active === 'past' ? 'No past plans yet.' : '';
}

/**
 * The `trips` region: the upcoming plans after the next departure, then the plans with no dates.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function tripsRegion(model, ctx) {
  const lead = leadOf(model);
  const cards = [...model.sections.upcoming.filter((card) => card.id !== lead?.trip.id), ...model.sections.undated];
  const none = nothingText(model);
  return `<div class="con-ups" data-region="trips">${cards.map((card) => upCardHtml(card, ctx)).join('')}${none ? `<p class="con-none" data-key="none">${esc(none)}</p>` : ''}</div>`;
}
