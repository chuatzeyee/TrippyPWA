// "Happening now" on the Atlas dashboard (task table row 2): the lead plan as a card with its cover,
// its day, the day segments, the next stop and both ways in; any other live plan as a row. Owner: VC.
import { attr, cls, esc, link } from '../shared/html.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { segmentsHtml } from '../shared/segments.js';
import { coverBlockHtml, enterClass, placeName, toneOf } from './parts.js';
import { daysLeftText, sharedLine } from './words.js';

const cardLink = (card) => `<a class="trip-card-link" href="${esc(card.href)}"${attr('aria-label', `Open ${card.title}`)}${attr('data-focus-key', `open-${card.id}`)}></a>`;
const pendingAttr = (card) => (card.briefingPending ? ' data-briefing="pending"' : '');
const sharedHtml = (card, name) => (card.shared ? `<p class="${name}">${esc(sharedLine(card))}</p>` : '');

/**
 * The next-stop box. It is always drawn, at one height that holds a title of two lines, so "Open
 * today" keeps its place when the briefing arrives. Two lines only (a label and the stop): a third
 * would make the height depend on the data.
 */
function stopHtml(briefing) {
  const { trip, nextStop, today } = briefing;
  if (trip.briefingPending) return '<div class="atl-stop atl-wait" aria-hidden="true"></div>';
  if (nextStop) {
    const time = nextStop.time ? `<span class="atl-stop-time">${esc(nextStop.time)}</span>` : '';
    return `<div class="${cls('atl-stop', { 'atl-stop--untimed': !time })}">${time}<p class="atl-stop-text"><span class="atl-stop-k">Next stop today</span><span class="atl-stop-title">${esc(nextStop.title)}</span></p></div>`;
  }
  if (today?.title) return `<div class="atl-stop atl-stop--untimed"><p class="atl-stop-text"><span class="atl-stop-k">Today, nothing more is planned</span><span class="atl-stop-title">${esc(today.title)}</span></p></div>`;
  return '<div class="atl-stop atl-stop--untimed"><p class="atl-stop-text"><span class="atl-stop-k">Today</span><span class="atl-stop-title">Nothing is planned for today</span></p></div>';
}

const todayLinks = (card, wide) => `${link(card.todayHref, 'Open today', { cls: cls('ui-btn', { 'ui-btn--primary': wide }, 'atl-today'), focusKey: `today-${card.id}`, attrs: { 'data-now-trip': card.id } })}`;

function leadHtml(briefing, ctx) {
  const card = briefing.trip;
  const frame = { priority: true, animate: Boolean(ctx?.animate), name: placeName(card), flag: card.flags?.[0] ?? '', tone: toneOf(card.id), sizes: '(min-width: 1024px) 460px, 100vw' };
  const over = `<h3 class="atl-now-title">${esc(card.title)}</h3>`;
  const left = `${daysLeftText(briefing.daysLeft)}${briefing.endText ? `, ends ${briefing.endText}` : ''}`;
  return `<article class="atl-lead"${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${pendingAttr(card)}>
    ${coverBlockHtml(card.cover, { cls: 'atl-now-photo', over, frame })}
    <div class="atl-now-body">
      <p class="atl-dayline"><strong>Day ${esc(briefing.dayNumber)} of ${esc(briefing.dayCount)}</strong><span>${esc(left)}</span></p>
      ${segmentsHtml(briefing.dayNumber - 1, briefing.dayCount, briefing.dayNumber, { label: `Day ${briefing.dayNumber} of ${briefing.dayCount}`, cls: 'atl-track' })}
      ${stopHtml(briefing)}
      ${sharedHtml(card, 'atl-now-shared')}
      <p class="atl-now-actions">${todayLinks(card, true)}${link(card.wholeHref, 'Open whole trip', { cls: 'ui-btn atl-whole', focusKey: `whole-${card.id}` })}</p>
    </div>
    ${cardLink(card)}
  </article>`;
}

function alsoHtml(briefing, ctx) {
  const card = briefing.trip;
  const thumb = coverFrameHtml(card.cover, { ratio: '1x1', credit: false, sizes: '48px', animate: Boolean(ctx?.animate), name: placeName(card), flag: card.flags?.[0] ?? '', tone: toneOf(card.id), cls: 'atl-also-ph', tag: 'span' });
  return `<article class="atl-also"${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${pendingAttr(card)}>
    ${thumb}
    <div class="atl-also-text"><h3 class="atl-also-title">${esc(card.title)}</h3><p class="atl-also-note">Also happening now, day ${esc(briefing.dayNumber)} of ${esc(briefing.dayCount)}</p>${sharedHtml(card, 'atl-also-note')}</div>
    ${todayLinks(card, false)}
    ${cardLink(card)}
  </article>`;
}

/**
 * The section, or the empty live region alone when no plan is live (the region exists in every
 * ready state, so a patch always finds it).
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function nowHtml(model, ctx) {
  const live = Array.isArray(model.live) ? model.live : [];
  if (!live.length) return '<div class="atl-now-list" data-region="live"></div>';
  const cards = live.map((briefing, i) => (i === 0 ? leadHtml(briefing, ctx) : alsoHtml(briefing, ctx))).join('');
  return `<section class="${cls('atl-now', enterClass(ctx))}" aria-labelledby="atl-now-h">
    <div class="atl-gh"><span class="atl-pulse" aria-hidden="true"></span><h2 class="atl-gh-title" id="atl-now-h">Happening now</h2><span class="atl-count">${esc(live.length)}</span><span class="atl-gh-note">Today, ${esc(model.now?.dateText)}</span></div>
    <div class="atl-now-list" data-region="live">${cards}</div>
  </section>`;
}
