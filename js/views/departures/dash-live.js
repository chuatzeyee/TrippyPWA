// "Happening now" on the departures dashboard: a boarding pass for the lead live plan and a compact
// row for every other one. Owner: VA.
import { attr, esc, link } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { thumbHtml } from '../shared/photo-frame.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { segmentsHtml } from '../shared/segments.js';
import { readinessChipHtml } from '../shared/readiness-list.js';
import { conditionPhrase, typicalText } from '../shared/day-index.js';
import { COST_BASIS_TEXT, costFigures } from '../../lib/money.js';
import { count, dayText, figures, mono, moneyHtml, passPhotoHtml, statusHtml, stopLine, titleHtml, toneOf, weatherIcon } from './parts.js';

const pendingAttr = (trip) => (trip.briefingPending ? ' data-briefing="pending"' : '');
const tripAttrs = (trip) => `${attr('data-trip-id', trip.id)}${attr('data-key', trip.id)}${pendingAttr(trip)}`;
/** The stretched link that opens a plan; controls drawn over the card sit above it. */
export const cardLink = (trip) => `<a class="trip-card-link" href="${esc(trip.href)}"${attr('aria-label', `Open ${trip.title}`)}${attr('data-focus-key', `open-${trip.id}`)}></a>`;
/** A square thumbnail of a cover: the small original of a legacy photo is all a thumbnail needs. */
export function coverThumb(trip, size, animate) {
  const src = trip.cover.fallbackSrc || trip.cover.src;
  return thumbHtml(src ? { src, alt: '' } : null, { size, animate, tone: toneOf(trip.id) });
}

/**
 * Today's date, the next stop with its time, and how many more follow. The block keeps its place
 * while the briefing is awaited and when the briefing has nothing for today, so "Open today" under
 * it never moves.
 */
function todayHtml(briefing) {
  const { trip, today, nextStop, tonight, remainingToday } = briefing;
  if (trip.briefingPending || !today) return '<div class="dep-today dep-reserve dep-reserve--today" aria-hidden="true"></div>';
  const after = Math.max(0, (Number.isFinite(remainingToday) ? remainingToday : 0) - (nextStop ? 1 : 0));
  const line = stopLine({ nextStop, after, lastTime: tonight && tonight !== nextStop ? tonight.time : null });
  const stop = nextStop
    ? `<div class="dep-nextstop">${nextStop.time ? `<time class="dep-mono">${esc(nextStop.time)}</time>` : ''}<div><strong>${esc(nextStop.title)}</strong><span>${figures(line)}</span></div></div>`
    : `<p class="dep-nostop">${esc(line)}</p>`;
  return `<div class="dep-today">
        <p class="dep-lbl">Today, ${mono(today.dateText)}</p>
        ${stop}
      </div>`;
}

/**
 * Typical weather on a line of its own under the day counter. The line is there with and without
 * the briefing, at the same height, so nothing below it moves when the weather arrives.
 */
function weatherLine(weather) {
  const text = typicalText(weather);
  if (!text) return '<p class="dep-wx dep-wx--line dep-reserve" aria-hidden="true"></p>';
  return `<p class="dep-wx dep-wx--line">${icon(weatherIcon(weather.condition), 18)}<span>${figures(text)}</span></p>`;
}

/** The second column of the pass on wide screens: later today, tomorrow, the end date, the estimate. */
function sideHtml(briefing) {
  const { trip, laterToday, tomorrow, endText } = briefing;
  if (trip.briefingPending) return '<div class="dep-stub-side dep-reserve dep-reserve--side" aria-hidden="true"></div>';
  const later = laterToday.length ? `<p class="dep-lbl">Later today</p>
        <ol class="dep-stops">${laterToday.map((stop) => `<li><time class="dep-mono">${esc(stop.time ?? '')}</time><span>${esc(stop.title)}</span></li>`).join('')}</ol>` : '';
  const weather = tomorrow?.weather ? ` Typical ${tomorrow.weather.range}${tomorrow.weather.condition ? `, ${conditionPhrase(tomorrow.weather.condition)}` : ''}.` : '';
  const next = tomorrow ? `<p class="dep-lbl dep-tomorrow-l">Tomorrow, ${mono(tomorrow.dateText)}</p>
        <p class="dep-tomorrow">${figures(`Day ${tomorrow.dayNumber}, ${tomorrow.title}.${weather}`)}</p>` : '';
  const { lead } = costFigures(trip.cost);
  const cost = lead ? `<div><dt>Activities, estimated</dt><dd>${moneyHtml(lead)} <small>${COST_BASIS_TEXT}</small></dd></div>` : '';
  return `<div class="dep-stub-side">
        ${later}${next}
        <dl class="dep-stubfacts"><div><dt>Plan ends</dt><dd>${mono(endText)}</dd></div>${cost}</dl>
      </div>`;
}

/**
 * The boarding pass of the lead live plan.
 * @param {import('../contract.js').LiveBriefing} briefing
 * @param {{ animate?: boolean }} ctx
 */
export function livePassHtml(briefing, ctx) {
  const { trip, dayNumber, dayCount, daysLeft, endText, today } = briefing;
  const chip = trip.readiness ? readinessChipHtml(trip.readiness) : '';
  const photo = passPhotoHtml(trip.cover, {
    frame: { priority: true, animate: ctx.animate, tone: toneOf(trip.id), sizes: '(min-width: 1024px) 720px, 100vw' },
    top: `${statusHtml('live', 'Live now', { glass: true, pulse: true })}${chip}`,
    bottom: `<h3 class="dep-pass-title">${titleHtml(trip.title, trip.flags, 24)}</h3>`,
  });
  const left = daysLeft > 0 ? count(daysLeft, 'day left', 'days left') : 'Last day';
  return `<article class="dep-pass dep-pass--live"${tripAttrs(trip)}>
    ${cardLink(trip)}
    ${photo}
    <div class="dep-pass-stub">
      <div class="dep-stub-main">
        <div class="dep-dayline"><span class="dep-lbl">Day</span>${flapDigitsHtml(dayNumber, { cls: 'dep-flap--lg' })}<span class="dep-of">of ${mono(dayCount)}</span></div>
        ${weatherLine(today?.weather ?? trip.weather)}
        ${segmentsHtml(dayNumber - 1, dayCount, dayNumber)}
        <div class="dep-ticks-ends">${mono(dayText(trip.dates.start))}<span>${figures(left)}</span>${mono(endText)}</div>
        ${todayHtml(briefing)}
        <p class="dep-pass-actions">
          ${link(trip.todayHref, 'Open today', { cls: 'ui-btn ui-btn--primary', focusKey: `today-${trip.id}`, attrs: { 'data-now-trip': trip.id } })}
          ${link(trip.wholeHref, 'Whole trip', { cls: 'ui-btn', focusKey: `whole-${trip.id}` })}
        </p>
      </div>
      ${sideHtml(briefing)}
    </div>
  </article>`;
}

/** Another live plan, as one compact row with its own "Open today". */
export function liveRowHtml(briefing, ctx) {
  const { trip, dayNumber, dayCount, endText } = briefing;
  return `<article class="dep-liverow"${tripAttrs(trip)}>
    ${cardLink(trip)}
    ${coverThumb(trip, 56, ctx.animate)}
    <h3 class="dep-liverow-title">${titleHtml(trip.title, trip.flags, 18)}</h3>
    <p class="dep-liverow-meta">${statusHtml('live', `Day ${mono(dayNumber)} of ${mono(dayCount)}`)}<span class="dep-liverow-ends">ends ${mono(endText)}</span></p>
    ${link(trip.todayHref, '', { cls: 'dep-go', focusKey: `today-${trip.id}`, attrs: { 'data-now-trip': trip.id }, html: `<span>Open today</span>${icon('chevron-right', 16)}` })}
  </article>`;
}

/** What the `live` region holds: the pass, then the rows. Empty when nothing is live. */
export function liveHtml(model, ctx) {
  return model.live.map((briefing, i) => (i === 0 ? livePassHtml(briefing, ctx) : liveRowHtml(briefing, ctx))).join('');
}
