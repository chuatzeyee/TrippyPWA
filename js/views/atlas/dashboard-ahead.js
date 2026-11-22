// What stands beside the plate while no plan is live: the next departure as a card in the language of
// the live lead card (cover, the days to go, the dates, the typical weather, what is still to do),
// with the plan after it as a row; or, with nothing ahead, one suggested place for the next plan.
// The time rail keeps its own "Next departure" entry. Owner: VC.
import { attr, button, cls, esc, link } from '../shared/html.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { icon } from '../shared/icons.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { coverBlockHtml, enterClass, flagsHtml, placeName, toneOf } from './parts.js';
import { inDaysText, sharedLine, toGoText, weatherLine } from './words.js';

/** The action of "See more ideas": dashboard.js scrolls to the short hops. */
export const MORE_IDEAS = 'atl-more-ideas';
const SIZES = '(min-width: 1024px) 460px, 100vw';
const list = (value) => (Array.isArray(value) ? value : []);
const cardLink = (card) => `<a class="trip-card-link" href="${esc(card.href)}"${attr('aria-label', `Open ${card.title}`)}${attr('data-focus-key', `ahead-card-${card.id}`)}></a>`;
const tripAttrs = (card) => `${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${card.briefingPending ? ' data-briefing="pending"' : ''}`;
const frameOf = (card, ctx) => ({ animate: Boolean(ctx?.animate), name: placeName(card), flag: card.flags?.[0] ?? '', tone: toneOf(card.id) });

/** What the briefing brings: the typical weather and up to three things still to do, as plain rows. */
function lateHtml(next) {
  const card = next.trip;
  if (card.briefingPending) return '<div class="atl-ahead-late atl-wait" aria-hidden="true"></div>';
  const weather = weatherLine(card.weather);
  const wx = weather ? `<p class="atl-next-wx">${icon(/sun|clear/i.test(card.weather?.condition ?? '') ? 'sun' : 'cloud', 18)}<span>${esc(weather)}</span></p>` : '';
  const rows = list(next.todo).slice(0, 3).map((item) => `<li><i class="atl-ring" aria-hidden="true"></i><span>${esc(item.label)}: ${esc(item.status)}${item.due ? `, ${esc(item.due.text)}` : ''}</span></li>`).join('');
  return wx || rows ? `<div class="atl-ahead-late">${wx}${rows ? `<ul class="atl-todo atl-ahead-todo">${rows}</ul>` : ''}</div>` : '';
}

function nextHtml(next, ctx) {
  const card = next.trip;
  const toGo = toGoText(next.daysToGo);
  // The length as two figures with a sign each: the days, then the nights. Said in words for a screen reader.
  const days = Number(card.dates?.dayCount);
  const nights = Number(card.dates?.nights);
  const span = Number.isFinite(days) && days > 0
    ? `<span class="atl-span"${attr('role', 'img')}${attr('aria-label', `${days} ${days === 1 ? 'day' : 'days'}${nights > 0 ? `, ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}`)}><span>${esc(days)}${icon('sun', 16)}</span>${nights > 0 ? `<span>${esc(nights)}${icon('moon', 16)}</span>` : ''}</span>`
    : '';
  const checklist = card.readiness ? link(`${card.href}?open=checklist`, 'Open checklist', { cls: 'ui-btn atl-whole', focusKey: `ahead-checklist-${card.id}` }) : '';
  return `<article class="atl-lead atl-lead--ahead"${tripAttrs(card)}>
    ${coverBlockHtml(card.cover, { cls: 'atl-now-photo', over: `<h3 class="atl-now-title">${esc(card.title)}</h3>`, frame: { ...frameOf(card, ctx), priority: true, sizes: SIZES } })}
    <div class="atl-now-body">
      <p class="atl-dayline atl-togo">${toGo ? `<strong>${flapDigitsHtml(next.daysToGo, { cls: 'atl-flaps atl-togo-flaps' })} ${toGo.words}</strong>` : ''}<span><span>${esc(card.dates?.text)}</span>${span}</span></p>
      ${lateHtml(next)}
      ${card.shared ? `<p class="atl-now-shared">${esc(sharedLine(card))}</p>` : ''}
      <p class="atl-now-actions">${link(card.href, 'Open trip', { cls: 'ui-btn ui-btn--primary atl-today', focusKey: `ahead-open-${card.id}` })}${checklist}</p>
    </div>
    ${cardLink(card)}
  </article>`;
}

/** The upcoming plan after the next one. Read from cardsById, so a filter on the rail does not move it. */
const afterOf = (model) => Object.values(model.cardsById ?? {}).find((card) => card.phase === 'upcoming' && card.id !== model.next.trip.id && Number.isFinite(card.daysToGo)) ?? null;

function thenHtml(card, ctx) {
  const thumb = coverFrameHtml(card.cover, { ...frameOf(card, ctx), ratio: '1x1', credit: false, sizes: '48px', cls: 'atl-also-ph', tag: 'span' });
  const when = inDaysText(card.daysToGo);
  return `<article class="atl-also"${tripAttrs(card)}>
    ${thumb}
    <div class="atl-also-text"><h3 class="atl-also-title">Then ${esc(card.title)}</h3><p class="atl-also-note">${esc(when.charAt(0).toUpperCase() + when.slice(1))}${card.dates?.text ? `, ${esc(card.dates.text)}` : ''}</p></div>
    ${link(card.href, 'Open', { cls: 'ui-btn atl-today', focusKey: `ahead-then-${card.id}`, attrs: { 'aria-label': `Open ${card.title}` } })}
    ${cardLink(card)}
  </article>`;
}

/** One place for the next plan. "Plan this trip" is the hook of a short hop tile: the planner opens with the place filled in. */
function ideaHtml({ hop, reason }, ctx) {
  const frame = { animate: Boolean(ctx?.animate), name: hop.name, flag: hop.flag, tone: toneOf(hop.name), priority: true, sizes: SIZES };
  return `<article class="atl-lead atl-lead--idea"${attr('data-key', `idea-${hop.name}`)}>
    ${coverBlockHtml(hop.cover, { cls: 'atl-now-photo', over: `<h3 class="atl-now-title">${esc(hop.name)}</h3>`, frame })}
    <div class="atl-now-body">
      <p class="atl-dayline"><strong class="atl-idea-where">${flagsHtml([hop.flag], { size: 18 })}${esc(hop.country)}</strong></p>
      <p class="atl-idea-why">${esc(reason)}</p>
      <p class="atl-now-actions">${button('Plan this trip', { action: 'plan-city', cls: 'ui-btn ui-btn--primary atl-today', focusKey: `idea-${hop.name}`, attrs: { 'data-city': hop.name } })}${button('See more ideas', { action: MORE_IDEAS, cls: 'ui-btn atl-whole', focusKey: 'more-ideas' })}</p>
    </div>
  </article>`;
}

/**
 * The section beside the plate while no plan is live, or '' when there is neither an upcoming plan
 * nor a place to suggest (then the plate takes the row). The live region stays in it, empty, so a
 * patch always finds it; what is drawn sits in the region `ahead`.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function aheadHtml(model, ctx) {
  const next = model.next ?? null;
  const idea = next ? null : model.suggestion ?? null;
  if (!next && !idea?.hop) return '';
  const after = next ? afterOf(model) : null;
  const cards = next ? `${nextHtml(next, ctx)}${after ? thenHtml(after, ctx) : ''}` : ideaHtml(idea, ctx);
  const note = next ? `Today, ${esc(model.now?.dateText)}` : `A short hop from ${esc(model.user?.homeCity || 'home')}`;
  return `<section class="${cls('atl-now', enterClass(ctx))}" aria-labelledby="atl-ahead-h">
    <div class="atl-gh"><h2 class="atl-gh-title" id="atl-ahead-h">${next ? 'Next departure' : 'Suggested trip'}</h2><span class="atl-gh-note">${note}</span></div>
    <div class="atl-now-list" data-region="live"></div>
    <div class="atl-now-list" data-region="ahead">${cards}</div>
  </section>`;
}
