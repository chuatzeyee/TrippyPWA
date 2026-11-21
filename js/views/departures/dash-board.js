// "Your trips" on the departures dashboard: the boards. Live and upcoming plans are tables with
// explicit table roles (CSS turns them into rows on phones); past and undated plans are a compact
// log; plans still being planned or stopped are the shared state cards. Owner: VA.
import { attr, cls, esc, visuallyHidden } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { readinessChipHtml } from '../shared/readiness-list.js';
import { failedCardHtml, generatingCardHtml, pastToggleHtml } from '../shared/state-cards.js';
import { costFigures } from '../../lib/money.js';
import { count, dayText, figures, mono, moneyHtml, readinessNote, statusHtml, titleHtml } from './parts.js';
import { cardLink, coverThumb } from './dash-live.js';

/** How many past rows a phone shows before "Show all". */
export const PAST_SHOWN = 6;

// A row prints its figure alone, so each board says what the figure is.
const COST_NOTE = 'Costs are per person, activities only.';
const COLUMNS = {
  live: ['Ends', 'Photo', 'Destination', 'Day', 'Length', 'Activities estimated', 'Status'],
  upcoming: ['Departs', 'Photo', 'Destination', 'Departs in', 'Length', 'Activities estimated', 'Readiness'],
};
const cell = (name, html) => `<div class="dep-d-${name}" role="cell">${html}</div>`;
const pendingAttr = (card) => (card.briefingPending ? ' data-briefing="pending"' : '');
const tripAttrs = (card) => `${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${pendingAttr(card)}`;

/** "Shared with you. You can edit." Never a name: a profile is readable only by its owner. */
function sharedHtml(card) {
  if (!card.shared) return '';
  return `<span class="dep-shared">${icon('people', 16)}<span>Shared with you. ${card.role === 'editor' ? 'You can edit.' : 'You can view it.'}</span></span>`;
}

/** "Morocco, 2 travellers" under a destination. */
function subText(card) {
  const country = card.places[0]?.country ?? '';
  const people = card.travellers ? count(card.travellers, 'traveller', 'travellers') : '';
  return [country, people].filter(Boolean).join(', ');
}

function costCell(card) {
  const { lead, other } = costFigures(card.cost);
  if (!lead) return visuallyHidden('No estimate yet');
  return `<span>${moneyHtml(lead)}</span>${other ? `<small>${moneyHtml(other)}</small>` : ''}`;
}

function destCell(card, { next = false } = {}) {
  const sub = subText(card);
  return `<h3 class="dep-d-name">${titleHtml(card.title, card.flags, 18)}${next ? '<span class="dep-tag">Next</span>' : ''}</h3>${sub ? `<span class="dep-d-sub">${figures(sub)}</span>` : ''}${sharedHtml(card)}${cardLink(card)}`;
}

const chevron = () => `<span class="dep-d-go" aria-hidden="true">${icon('chevron-right', 16)}</span>`;

/** A row of the "Happening now" board. `endText` comes from the plan's live briefing. */
function liveRow(card, ctx, endText) {
  const range = `<span class="dep-only-phone">${mono(card.dates.text)}</span><span class="dep-only-desk">${mono(endText || card.dates.text)}</span>`;
  const left = card.daysLeft > 0 ? `${mono(card.daysLeft)} ${card.daysLeft === 1 ? 'day' : 'days'} left` : 'Last day';
  const status = `${statusHtml('live', `Live<span class="dep-only-desk"> now</span><span class="dep-only-phone">, day ${mono(card.dayNumber)} of ${mono(card.dates.dayCount)}</span>`)}<span class="dep-st-note">${left}</span>`;
  return `<div class="dep-drow dep-drow--now" role="row"${tripAttrs(card)}>
      ${cell('date', range)}${cell('thumb', coverThumb(card, 56, ctx.animate))}${cell('dest', destCell(card))}
      ${cell('in', `${flapDigitsHtml(card.dayNumber)}<span class="dep-d-in-l">of ${mono(card.dates.dayCount)}</span>`)}
      ${cell('len', `${mono(card.dates.dayCount)} ${card.dates.dayCount === 1 ? 'day' : 'days'}`)}${cell('cost', costCell(card))}
      ${cell('status', `<span class="dep-d-st">${status}</span>${chevron()}`)}
    </div>`;
}

/** A row of the "Upcoming" board: the countdown, and what is left to do. */
function upcomingRow(card, ctx, nextId) {
  const days = card.dates.dayCount;
  const date = `${mono(dayText(card.dates.start, { year: true }) || card.dates.text)}<span class="dep-only-phone">, ${mono(days)} ${days === 1 ? 'day' : 'days'}</span>`;
  const isNext = card.id === nextId;
  const note = readinessNote(card.readiness);
  const ready = card.readiness
    ? `${readinessChipHtml(card.readiness)}${note ? `<span class="dep-st-note">${esc(note)}</span>` : ''}`
    : card.briefingPending ? '<span class="dep-reserve dep-reserve--chip" aria-hidden="true"></span>' : '';
  return `<div class="dep-drow" role="row"${tripAttrs(card)}>
      ${cell('date', date)}${cell('thumb', coverThumb(card, 56, ctx.animate))}${cell('dest', destCell(card, { next: isNext }))}
      ${cell('in', `${flapDigitsHtml(card.daysToGo, { cls: isNext ? 'dep-flap--hot' : '' })}<span class="dep-d-in-l">${card.daysToGo === 1 ? 'day' : 'days'}</span>`)}
      ${cell('len', `${mono(days)} ${days === 1 ? 'day' : 'days'}`)}${cell('cost', costCell(card))}
      ${cell('status', `<span class="dep-d-st">${ready}</span>${chevron()}`)}
    </div>`;
}

const boardTop = (id, glyph, title, total, note = '') => `<div class="dep-board-top"><span class="dep-board-ic">${icon(glyph, 20)}</span><p class="dep-board-title"${attr('id', id)}>${esc(title)}</p>${mono(total)}${note ? `<span class="dep-note">${esc(note)}</span>` : ''}</div>`;

/** A board that is a table from desktop width and a list of rows below it. `rows` is trusted markup. */
function tableBoard(name, glyph, title, total, note, rows) {
  const id = `dep-board-${name}-h`;
  const head = COLUMNS[name].map((label, i) => `<span role="columnheader">${i === 1 ? visuallyHidden(label) : esc(label)}</span>`).join('');
  return `<div class="dep-board dep-board--table"${attr('data-key', `board-${name}`)}>
    ${boardTop(id, glyph, title, total, note)}
    <div class="dep-table" role="table" aria-labelledby="${id}">
      <div class="dep-board-head" role="row">${head}</div>
      ${rows}
    </div>
  </div>`;
}

/** A row of the compact log: past plans and plans with no dates. */
function logRow(card, ctx) {
  const { lead } = costFigures(card.cost);
  const days = card.dates.dayCount;
  return `<article class="dep-lrow"${tripAttrs(card)}>
      ${cardLink(card)}${coverThumb(card, 44, ctx.animate)}
      <div class="dep-l-main"><h3 class="dep-l-name">${titleHtml(card.title, card.flags, 16)}</h3><span class="dep-l-meta dep-mono">${esc(card.dates.text)}</span>${sharedHtml(card)}</div>
      <div class="dep-l-cost">${lead ? `<span>${moneyHtml(lead)}</span>` : ''}<small>${mono(days)} ${days === 1 ? 'day' : 'days'}</small></div>
    </article>`;
}

function logBoard(name, glyph, title, cards, ctx, { note = '', all = true, toggle = '' } = {}) {
  return `<div class="dep-board dep-board--log"${attr('data-key', `board-${name}`)}>
    ${boardTop(`dep-board-${name}-h`, glyph, title, cards.length, note)}
    <div class="${cls('dep-log', { 'dep-log--all': all })}">${cards.map((card) => logRow(card, ctx)).join('')}</div>
    ${toggle}
  </div>`;
}

/**
 * A plan still being planned, or one whose planning stopped: the shared card beside its thumbnail.
 * The dates go after the status line: the status sits beside the title where both fit on one line
 * and under it where they do not, and the dates follow either way.
 */
function progressRow(card, ctx) {
  const meta = card.dates.start ? `<p class="dep-card-meta dep-mono">${esc(card.dates.text)}</p>` : '';
  const opts = { tag: 'article', afterStatus: meta };
  const shared = card.phase === 'failed' ? failedCardHtml(card, opts) : generatingCardHtml(card, opts);
  return `<div class="dep-srow" data-state="${card.phase === 'failed' ? 'failed' : 'generating'}">${coverThumb(card, 56, ctx.animate)}${shared}</div>`;
}

/**
 * What the `trips` region holds: one keyed block per group that has plans.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ animate?: boolean }} ctx
 */
export function boardsHtml(model, ctx) {
  const { sections, filter } = model;
  const ends = new Map(model.live.map((briefing) => [briefing.trip.id, briefing.endText]));
  const nextId = model.next?.trip.id ?? '';
  const total = sections.past.length;
  const all = filter.expanded || total <= PAST_SHOWN;
  const blocks = [
    sections.inProgress.length ? `<div class="dep-progress" data-key="board-progress">${sections.inProgress.map((card) => progressRow(card, ctx)).join('')}</div>` : '',
    sections.live.length ? tableBoard('live', 'pin', 'Happening now', sections.live.length, COST_NOTE, sections.live.map((card) => liveRow(card, ctx, ends.get(card.id))).join('')) : '',
    sections.upcoming.length ? tableBoard('upcoming', 'plane', 'Upcoming', sections.upcoming.length, `Soonest first. ${COST_NOTE}`, sections.upcoming.map((card) => upcomingRow(card, ctx, nextId)).join('')) : '',
    sections.undated.length ? logBoard('undated', 'clock', 'No dates yet', sections.undated, ctx, { note: COST_NOTE }) : '',
    total ? logBoard('past', 'calendar', 'Past plans', sections.past, ctx, { note: `Most recent first. ${COST_NOTE}`, all, toggle: all ? '' : pastToggleHtml(total) }) : '',
  ].filter(Boolean);
  if (blocks.length) return blocks.join('\n');
  return `<p class="dep-empty-line" data-key="board-none">${filter.expanded ? 'Nothing matches. Clear the search or pick another filter.' : 'Your trips will be listed here, soonest first, each with a countdown and what is left to do.'}</p>`;
}
