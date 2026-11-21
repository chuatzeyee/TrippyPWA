// The hero of the Concierge trip landing: the cover from edge to edge, the title in the heading face
// (sized by its length), the dates and who travels, and the countdown in numerals. While the plan
// runs the countdown gives way to today. Then the actions row for narrow screens and the notes the
// controller hands over. Owner: VB.
import { button, esc, flagChip } from '../shared/html.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { segmentsHtml } from '../shared/segments.js';
import { actionButtonsHtml } from '../shared/trip-topbar.js';
import { countOf, titleStep } from './words.js';
import { creditSlot, factRow, stopHtml } from './parts.js';

const MAX_FLAGS = 3;
/** The row under the hero holds the first three of these that the model offers; More has them all. */
const ROW_KEYS = ['share', 'pdf', 'edit', 'read-view'];
const ROW_SIZE = 3;

/** "Marrakech, Morocco. 7 days, 6 nights. 2 travellers. Shared with you. You can view it." */
function metaText(model) {
  const { dates } = model;
  const length = dates.start
    ? `${countOf(dates.dayCount, 'day', 'days')}, ${countOf(dates.nights, 'night', 'nights')}.`
    : dates.dayCount ? `${countOf(dates.dayCount, 'day', 'days')}.` : '';
  const who = Number.isFinite(model.travellers) && model.travellers > 0 ? `${countOf(model.travellers, 'traveller', 'travellers')}.` : '';
  const shared = model.role === 'viewer' ? 'Shared with you. You can view it.' : model.role === 'editor' ? 'Shared with you. You can edit it.' : '';
  return [model.placeLine ? `${model.placeLine}.` : '', length, who, shared].filter(Boolean).join(' ');
}

/** A running plan: its day in numerals, the segments, today's title, the next stop and the way to today. */
function liveHtml(model) {
  const { dayNumber, dayCount, today } = model.live;
  const todayIndex = model.days.findIndex((row) => row.isToday);
  const rows = today ? [factRow('Today', esc(today.title)), today.nextStop ? factRow('Next stop', stopHtml(today.nextStop)) : ''].join('') : '';
  const open = todayIndex >= 0
    ? button('Open today', { cls: 'ui-btn con-btn con-btn--cta', focusKey: 'hero-today', attrs: { 'data-day-jump': todayIndex } }) : '';
  return `<p class="con-live-day">Day <span class="con-num">${esc(dayNumber)}</span> of ${esc(dayCount)}</p>
    ${segmentsHtml(dayNumber - 1, dayCount, dayNumber)}
    ${rows ? `<dl class="con-bl">${rows}</dl>` : ''}
    ${open ? `<p class="con-live-actions">${open}</p>` : ''}`;
}

/** What the `hero-status` region holds: the countdown, the day of a running plan, or the plain state. */
function statusHtml(model) {
  if (model.status !== 'failed' && model.phase === 'live' && model.live) return liveHtml(model);
  if (model.status !== 'failed' && model.phase === 'upcoming' && Number.isFinite(model.daysToGo)) {
    return `<p class="con-count con-hero-count"><span class="con-num">${esc(model.daysToGo)}</span><span class="con-unit"><span>${model.daysToGo === 1 ? 'day' : 'days'}</span> <span>to go</span></span></p>`;
  }
  return `<p class="con-hero-state">${esc(model.statusText)}</p>`;
}

/**
 * The `hero` part: the hero itself (id td-hero, the photo frame carried across a refresh), the
 * actions row and ctx.slots.notes, placed once and in no region.
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function heroHtml(model, ctx) {
  const photo = coverFrameHtml(model.cover, {
    ratio: 'free', priority: true, carry: 'cover', animate: ctx.animate, credit: false, tone: 2, sizes: '100vw', cls: 'con-hero-photo',
  });
  const flags = model.flags.slice(0, MAX_FLAGS).map((code) => flagChip(code, { size: 24 })).join('');
  const live = model.status !== 'failed' && model.phase === 'live' && model.live;
  const keys = ROW_KEYS.filter((key) => model.actions.some((action) => action.key === key)).slice(0, ROW_SIZE);
  const row = keys.length ? `<div class="con-toolrow">${actionButtonsHtml(model.actions, { keys, where: 'hero', cls: 'con-tool' })}</div>` : '';
  return `<header class="con-hero${live ? ' con-hero--live' : ''}" id="td-hero" data-title-step="${titleStep(model.title)}">
    ${photo}${creditSlot(model.cover)}
    <div class="con-hero-in">
      <h1 class="con-hero-title">${esc(model.title)}</h1>
      <div class="con-hero-facts">
        <p class="con-hero-dates">${flags}${model.dates.start ? `<span>${esc(model.dates.text)}</span>` : ''}</p>
        <p class="con-hero-meta">${esc(metaText(model))}</p>
      </div>
      <div class="con-hero-status" data-region="hero-status">${statusHtml(model)}</div>
    </div>
  </header>
  ${row}
  <div class="con-notes">${ctx.slots.notes}</div>`;
}
