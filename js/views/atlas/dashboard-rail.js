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
import { flagsHtml, placeName, titleWithFlags, toneOf } from './parts.js';
import { monthNames } from './rail.js';
import { costLine, daysText, fullDate, lengthText, plansText, sharedLine, toGoText, weatherLine } from './words.js';

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

function metaText(card) {
  const cost = costLine(card.cost);
  return [daysText(card.dates?.dayCount), cost].filter(Boolean).join(', ');
}

function upcomingRow(card, ctx) {
  const dates = card.dates?.start ? `<p class="atl-tu-dates">${esc(card.dates.text)}</p>` : '';
  return `<article class="atl-tu"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: 'free', sizes: '(min-width: 1024px) 168px, 80px', cls: 'atl-tu-ph' })}
    <p class="atl-tu-side">${toGoHtml(card)}</p>
    <div class="atl-tu-body">
      <h3 class="atl-tu-title">${esc(card.title)} ${flagsHtml(card.flags)}</h3>
      ${dates}<p class="atl-tu-meta">${esc(metaText(card))}</p>${sharedHtml(card, 'atl-tu-meta')}
    </div>
    ${cardLink(card)}
  </article>`;
}

function todoHtml(next) {
  const rows = next.todo.map((item) => `<li class="atl-todo-open"><i class="atl-ring" aria-hidden="true"></i><span>${esc(item.label)}: ${esc(item.status)}${item.due ? `, ${esc(item.due.text)}` : ''}</span></li>`);
  if (next.settled.length) rows.push(`<li class="atl-todo-done"><i class="atl-tick" aria-hidden="true"></i><span>Settled: ${esc(next.settled.map((item) => item.label).join(', '))}</span></li>`);
  return rows.length ? `<ul class="atl-todo">${rows.join('')}</ul>` : '';
}

/** The next departure: the one rail entry that carries a briefing. */
function nextCard(next, ctx) {
  const card = next.trip;
  const weather = weatherLine(card.weather);
  const length = [next.lengthText || lengthText(card.dates), costLine(card.cost)].filter(Boolean).join(', ');
  const more = card.briefingPending
    ? '<div class="atl-tu-more atl-wait" aria-hidden="true"></div>'
    : `<div class="atl-tu-more">
      ${weather ? `<p class="atl-next-wx">${icon(/sun|clear/i.test(card.weather?.condition ?? '') ? 'sun' : 'cloud', 18)}<span>${esc(weather)}</span></p>` : ''}
      ${todoHtml(next)}
      ${card.readiness ? link(`${card.href}?open=checklist`, 'Open checklist', { cls: 'ui-btn atl-next-open', focusKey: `checklist-${card.id}` }) : ''}
    </div>`;
  return `<article class="atl-tu atl-tu--next"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: 'free', sizes: '(min-width: 1024px) 168px, 80px', cls: 'atl-tu-ph' })}
    <p class="atl-tu-side">${toGoHtml(card)}</p>
    <div class="atl-tu-body">
      <p class="atl-tu-k"><i aria-hidden="true"></i>Next departure</p>
      <h3 class="atl-tu-title">${esc(card.title)} ${flagsHtml(card.flags)}</h3>
      <p class="atl-tu-dates">${esc(card.dates?.text)}</p>
      <p class="atl-tu-meta">${esc(length)}</p>${sharedHtml(card, 'atl-tu-meta')}
    </div>
    ${more}
    ${cardLink(card)}
  </article>`;
}

function pastRow(card, ctx) {
  const { lead } = costFigures(card.cost);
  const side = lead
    ? `<p class="atl-tp-side"><span class="atl-tp-cost">${esc(lead)}</span><span class="atl-tp-days">per person, ${esc(daysText(card.dates?.dayCount))}</span></p>`
    : `<p class="atl-tp-side"><span class="atl-tp-days">${esc(daysText(card.dates?.dayCount))}</span></p>`;
  return `<article class="atl-tp"${tripAttrs(card)}>
    ${coverFrameHtml(card.cover, { ...frameOpts(card, ctx), ratio: '1x1', sizes: '44px', cls: 'atl-tp-ph', tag: 'span' })}
    <div class="atl-tp-main"><h3 class="atl-tp-title">${titleWithFlags(card.title, flagsHtml(card.flags, { size: 18 }))}</h3><p class="atl-tp-dates">${esc(card.dates?.text)}</p>${sharedHtml(card, 'atl-tp-dates')}</div>
    ${side}
    ${cardLink(card)}
  </article>`;
}

const markHtml = (group, key) => `<p class="atl-rm"${attr('data-key', key)}><span class="atl-rm-k">${esc(group.label)}</span></p>`;
const headHtml = (title, count, note) => `<div class="atl-rg-head" data-key="head"><h3 class="atl-rg-title">${title}</h3>${count ? `<span class="atl-count">${esc(count)}</span>` : ''}<span class="atl-rg-note">${note}</span></div>`;

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
  const head = count || !filter.expanded ? headHtml('Upcoming', count, 'Soonest first') : '';
  const first = shown ? groups.upcoming.find((group) => group.trips.some((card) => card.id === next.trip.id)) : null;
  const nextHtml = shown ? `${head}${markHtml(first, 'mark')}${nextCard(next, ctx)}` : '';
  const rows = groups.upcoming.map((group) => {
    const cards = group.trips.filter((card) => !shown || card.id !== next.trip.id);
    if (!cards.length) return '';
    return `${group === first ? '' : markHtml(group, `mark-${group.key}`)}${cards.map((card) => upcomingRow(card, ctx)).join('')}`;
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

/** The past plans by month: the two latest months open, the older ones closed with their flags. */
export function pastRegionHtml(model, groups, ctx) {
  const { filter, stats } = model;
  if (!groups.past.length) return '<div class="atl-rg atl-rg--past" data-region="past"></div>';
  const total = groups.past.reduce((sum, group) => sum + group.trips.length, 0);
  const months = groups.past.map((group, i) => {
    const flags = group.flags.map((code) => flagChip(code, { size: 18 })).join('');
    const key = `past-${group.key}`;
    // A closed month names its plans; the flags follow the names and never stand alone.
    const names = monthNames(group.trips);
    const what = names || flags
      ? `<span class="atl-rm-what">${names ? `<span class="atl-rm-names">${esc(names)}</span>` : ''}${flags ? `<span class="atl-rm-flags">${flags}</span>` : ''}</span>` : '';
    return `<details class="atl-rmo"${attr('data-key', key)}${attr('open', filter.expanded || i < 2)}>
      <summary class="atl-rm"${attr('data-focus-key', key)}><span class="atl-rm-k">${esc(group.label)}</span><span class="atl-rm-n">${esc(plansText(group.trips.length))}</span>${what}${icon('chevron-down', 18)}</summary>
      <div class="atl-rl">${group.trips.map((card) => pastRow(card, ctx)).join('')}</div>
    </details>`;
  }).join('');
  const first = fullDate(stats?.firstDate);
  const term = !filter.expanded && first ? `<p class="atl-rail-term" data-key="term">First plan, ${esc(first)}</p>` : '';
  return `<div class="atl-rg atl-rg--past" data-region="past">${headHtml('Past', total, 'Most recent first')}${months}${term}</div>`;
}
