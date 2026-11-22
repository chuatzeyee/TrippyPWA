// The time rail of the Atlas dashboard (task table rows 5 and 6): plans that are being planned, the
// next departure in full, the other upcoming plans under month marks, then the past plans by month.
// Five flat regions in page order: planning, next, trips, past (and the passport panel between the
// last two, outside every region). Every direct child of a region carries data-key, so a patch keeps
// the nodes it can. Owner: VC.
import { attr, button, esc, flagChip, link } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { failedCardHtml, generatingCardHtml } from '../shared/state-cards.js';
import { costFigures } from '../../lib/money.js';
import { flagsHtml, placeName, toneOf } from './parts.js';
import { monthNames } from './rail.js';
import { costShort, daysText, fullDate, sharedLine, toGoText, weatherLine } from './words.js';

const cardLink = (card) => `<a class="trip-card-link" href="${esc(card.href)}"${attr('aria-label', `Open ${card.title}`)}${attr('data-focus-key', `open-${card.id}`)}></a>`;
const tripAttrs = (card) => `${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${card.briefingPending ? ' data-briefing="pending"' : ''}`;
const sharedHtml = (card, name) => (card.shared ? `<p class="${name}">${esc(sharedLine(card))}</p>` : '');
const frameOpts = (card, ctx) => ({ credit: false, animate: Boolean(ctx?.animate), name: placeName(card), flag: card.flags?.[0] ?? '', tone: toneOf(card.id) });

/** The countdown of a row: the number apart from its words, or "No dates yet". */
function toGoHtml(card) {
  const toGo = card.phase === 'upcoming' ? toGoText(card.daysToGo) : null;
  if (!toGo) return '<span class="atl-tu-in atl-tu-in--none">No dates yet</span>';
  return `<span class="atl-tu-in"><b>${esc(toGo.count)}</b> ${toGo.words}</span>`;
}

/** The pill of a row: the cost and the length with a thin rule between them, or the one there is. */
function pillHtml(card) {
  const cost = costShort(card.cost);
  const days = card.dates?.dayCount ? daysText(card.dates.dayCount) : '';
  if (!cost && !days) return '';
  const parts = [cost ? `<span class="atl-pill-cost">${esc(cost)}</span>` : '', days ? `<span class="atl-pill-days">${esc(days)}</span>` : ''].filter(Boolean);
  return `<p class="atl-pill">${parts.join('<i class="atl-pill-bar" aria-hidden="true"></i>')}</p>`;
}

/** The flags of a plan, together, in the cell that stands before its name. */
const flagCell = (card, name) => `<span class="${name}">${flagsHtml(card.flags)}</span>`;
/** The widest set of flags on the rail (1 to 3): every row keeps that room, so the names line up. */
const flagRoom = (groups) => Math.min(3, Math.max(1, ...[...groups.upcoming, ...groups.past].flatMap((group) => group.trips.map((card) => (Array.isArray(card.flags) ? card.flags.length : 0)))));

/** Flags, name, dates, pill: the order of every rail entry. */
function upcomingBody(card, kicker = '') {
  const dates = card.dates?.start ? `<p class="atl-tu-dates">${esc(card.dates.text)}</p>` : '';
  return `<div class="atl-tu-body">
      ${kicker}<h3 class="atl-tu-title">${flagCell(card, 'atl-tu-flags')}<span class="atl-tu-name">${esc(card.title)}</span></h3>
      <div class="atl-tu-line">${dates}${pillHtml(card)}</div>${sharedHtml(card, 'atl-tu-meta')}
    </div>`;
}

function upcomingRow(card, ctx, room) {
  return `<article class="atl-tu atl-fr-${room}"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: 'free', sizes: '(min-width: 1024px) 144px, 80px', cls: 'atl-tu-ph' })}
    <p class="atl-tu-side">${toGoHtml(card)}</p>
    ${upcomingBody(card)}
    ${cardLink(card)}
  </article>`;
}

function todoHtml(next) {
  const rows = next.todo.map((item) => `<li class="atl-todo-open"><i class="atl-ring" aria-hidden="true"></i><span>${esc(item.label)}: ${esc(item.status)}${item.due ? `, ${esc(item.due.text)}` : ''}</span></li>`);
  if (next.settled.length) rows.push(`<li class="atl-todo-done"><i class="atl-tick" aria-hidden="true"></i><span>Settled: ${esc(next.settled.map((item) => item.label).join(', '))}</span></li>`);
  return rows.length ? `<ul class="atl-todo">${rows.join('')}</ul>` : '';
}

/** The next departure: the one rail entry that carries a briefing. */
function nextCard(next, ctx, room) {
  const card = next.trip;
  const weather = weatherLine(card.weather);
  const more = card.briefingPending
    ? '<div class="atl-tu-more atl-wait" aria-hidden="true"></div>'
    : `<div class="atl-tu-more">
      ${weather ? `<p class="atl-next-wx">${icon(/sun|clear/i.test(card.weather?.condition ?? '') ? 'sun' : 'cloud', 18)}<span>${esc(weather)}</span></p>` : ''}
      ${todoHtml(next)}
      ${card.readiness ? link(`${card.href}?open=checklist`, 'Open checklist', { cls: 'ui-btn atl-next-open', focusKey: `checklist-${card.id}` }) : ''}
    </div>`;
  return `<article class="atl-tu atl-tu--next atl-fr-${room}"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: 'free', sizes: '(min-width: 1024px) 168px, 80px', cls: 'atl-tu-ph' })}
    <p class="atl-tu-side">${toGoHtml(card)}</p>
    ${upcomingBody(card, '<p class="atl-tu-k"><i aria-hidden="true"></i>Next departure</p>')}
    ${more}
    ${cardLink(card)}
  </article>`;
}

function pastRow(card, ctx, room) {
  return `<article class="atl-tp atl-fr-${room}"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: '1x1', sizes: '60px', cls: 'atl-tp-ph', tag: 'span' })}
    ${flagCell(card, 'atl-tp-flags')}
    <div class="atl-tp-main"><h3 class="atl-tp-title">${esc(card.title)}</h3>${sharedHtml(card, 'atl-tp-shared')}</div>
    <div class="atl-tp-meta"><p class="atl-tp-dates">${esc(card.dates?.text)}</p>${pillHtml(card)}</div>
    ${cardLink(card)}
  </article>`;
}

const markHtml = (group, key) => `<p class="atl-rm"${attr('data-key', key)}><span class="atl-rm-k">${esc(group.label)}</span></p>`;
// quiet: the heading is kept for the page outline and screen readers, and takes no room on screen.
const headHtml = (title, quiet = false) => `<div class="atl-rg-head${quiet ? ' atl-rg-head--quiet' : ''}" data-key="head"><h3 class="atl-rg-title${quiet ? ' ui-vh' : ''}">${title}</h3></div>`;

/** Plans that are being planned, or whose planning stopped: not links, and first on the rail. */
export function planningRegionHtml(groups) {
  const cards = groups.planning.map((card) => (card.phase === 'failed'
    ? failedCardHtml(card, { tag: 'article', cls: 'atl-tg atl-tg--failed' })
    : generatingCardHtml(card, { tag: 'article', cls: 'atl-tg atl-tg--busy' }))).join('');
  return `<div class="atl-rg atl-rg--plan" data-region="planning">${cards}</div>`;
}

/**
 * The rail ahead as two regions: `next` (the head, the month mark and the next departure, when the
 * filter left it in) and `trips` (every other upcoming plan under its month mark, the plans without
 * dates, and the end of the rail).
 * @param {import('../contract.js').DashboardModel} model
 * @param {ReturnType<import('./rail.js').railGroups>} groups
 */
export function aheadRegionsHtml(model, groups, ctx) {
  const { filter, next } = model;
  const shown = Boolean(next) && groups.upcoming.some((group) => group.trips.some((card) => card.id === next.trip.id));
  const count = groups.upcoming.reduce((sum, group) => sum + group.trips.length, 0);
  const room = flagRoom(groups);
  const head = count || !filter.expanded ? headHtml('Upcoming', true) : '';
  const first = shown ? groups.upcoming.find((group) => group.trips.some((card) => card.id === next.trip.id)) : null;
  const nextHtml = shown ? `${head}${markHtml(first, 'mark')}${nextCard(next, ctx, room)}` : '';
  const rows = groups.upcoming.map((group) => {
    const cards = group.trips.filter((card) => !shown || card.id !== next.trip.id);
    if (!cards.length) return '';
    return `${group === first ? '' : markHtml(group, `mark-${group.key}`)}${cards.map((card) => upcomingRow(card, ctx, room)).join('')}`;
  }).join('');
  const plan = button('Plan a trip', { action: 'new-trip', focusKey: 'new-trip-rail', cls: 'atl-rail-plan' });
  const after = fullDate(groups.lastAhead);
  const end = filter.expanded ? '' : `<p class="atl-rail-end" data-key="end"><span>${after ? `Nothing planned after ${esc(after)}.` : 'Nothing is planned ahead.'}</span> ${plan}</p>`;
  // A filter can leave the rail bare: say so, or say that what matched is a live plan drawn above.
  const live = (model.sections.live ?? []).length;
  const bare = filter.expanded && !count && !groups.planning.length && !groups.past.length;
  const nothing = bare
    ? `<p class="atl-rail-none" data-key="none">${live ? `${live} ${live === 1 ? 'match is' : 'matches are'} under Happening now.` : 'No plan matches.'}</p>` : '';
  return `<div class="atl-rg atl-rg--up atl-rg--next" data-region="next">${nextHtml}</div>
    <div class="atl-rg atl-rg--up" data-region="trips">${shown ? '' : head}${rows}${end}${nothing}</div>`;
}

/** The past plans by month: the two latest months open, the older ones closed with their names and flags. */
export function pastRegionHtml(model, groups, ctx) {
  const { filter, stats } = model;
  if (!groups.past.length) return '<div class="atl-rg atl-rg--past" data-region="past"></div>';
  const room = flagRoom(groups);
  const months = groups.past.map((group, i) => {
    const flags = group.flags.map((code) => flagChip(code, { size: 18 })).join('');
    const key = `past-${group.key}`;
    // A closed month shows its flags, then names its plans: the flags never stand alone.
    const names = monthNames(group.trips);
    const what = names || flags
      ? `<span class="atl-rm-what">${flags ? `<span class="atl-rm-flags">${flags}</span>` : ''}${names ? `<span class="atl-rm-names">${esc(names)}</span>` : ''}</span>` : '';
    return `<details class="atl-rmo"${attr('data-key', key)}${attr('open', filter.expanded || i < 2)}>
      <summary class="atl-rm"${attr('data-focus-key', key)}><span class="atl-rm-btn"><span class="atl-rm-k">${esc(group.label)}</span>${icon('chevron-down', 18)}</span>${what}</summary>
      <div class="atl-rl">${group.trips.map((card) => pastRow(card, ctx, room)).join('')}</div>
    </details>`;
  }).join('');
  const first = fullDate(stats?.firstDate);
  const term = !filter.expanded && first ? `<p class="atl-rail-term" data-key="term">First plan, ${esc(first)}</p>` : '';
  return `<div class="atl-rg atl-rg--past" data-region="past">${headHtml('Past')}${months}${term}</div>`;
}
