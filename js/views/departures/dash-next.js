// "Next departure" on the departures dashboard: the boarding pass with the countdown, the route line,
// the dates and what is left to do before leaving. Owner: VA.
import { attr, esc } from '../shared/html.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { routeLineHtml } from '../shared/route-line.js';
import { readinessChipHtml, readinessListHtml } from '../shared/readiness-list.js';
import { conditionPhrase } from '../shared/day-index.js';
import { figures, mono, passPhotoHtml, statusHtml, titleHtml, toneOf } from './parts.js';

const fact = (label, html, wide = false) => (html ? `<div${wide ? ' class="dep-wide"' : ''}><dt>${esc(label)}</dt><dd>${html}</dd></div>` : '');

/**
 * Typical weather as a fact: the range in mono, the condition in words, the season. Its place is
 * kept while the briefing is awaited and when the plan has no weather, so the pass does not change
 * height when the briefing arrives.
 */
function weatherFact(trip) {
  const weather = trip.weather;
  if (!weather?.range) return '<div class="dep-wide dep-reserve dep-reserve--fact" aria-hidden="true"></div>';
  const words = conditionPhrase(weather.condition);
  return fact('Typical weather', `${mono(weather.range)}${words ? `, ${esc(words)}` : ''}${weather.season ? `<small>${esc(weather.season)}</small>` : ''}`, true);
}

/** "Left to do before you leave": the rows still to do, each a link to the plan. */
function todoHtml(next) {
  const { trip, todo } = next;
  if (trip.briefingPending) return '<div class="dep-reserve dep-reserve--todo" aria-hidden="true"></div>';
  if (!trip.readiness) return '';
  if (!todo.length) {
    const settled = trip.readiness.done >= trip.readiness.total;
    return `<p class="dep-lbl">${settled ? 'Nothing left to do before you leave' : 'One check is still running'}</p>`;
  }
  return `<p class="dep-lbl">Left to do before you leave</p>
      ${readinessListHtml(trip.readiness, { heading: 'h4', id: 'next', href: trip.href, only: 'todo', max: 3, cls: 'dep-todo' })}`;
}

/**
 * @param {import('../contract.js').NextDeparture} next
 * @param {{ animate?: boolean }} ctx
 * @param {{ priority?: boolean }} [opts] priority: this is the first cover of the page (nothing is live)
 */
export function nextPassHtml(next, ctx, { priority = false } = {}) {
  const { trip, daysToGo } = next;
  const pill = trip.readiness
    ? readinessChipHtml(trip.readiness)
    : trip.briefingPending ? '<span class="dep-reserve dep-reserve--chip" aria-hidden="true"></span>' : statusHtml('idle', 'Upcoming', { glass: true });
  const photo = passPhotoHtml(trip.cover, {
    frame: { priority, animate: ctx.animate, tone: toneOf(trip.id), sizes: '(min-width: 1024px) 420px, 100vw' },
    top: pill,
    bottom: `<h3 class="dep-pass-title">${titleHtml(trip.title, trip.flags, 24)}</h3>`,
  });
  const open = `Open ${trip.title}`;
  return `<article class="dep-pass dep-pass--next"${attr('data-trip-id', trip.id)}${attr('data-key', trip.id)}${trip.briefingPending ? ' data-briefing="pending"' : ''}>
    ${photo}
    <div class="dep-pass-stub">
      <div class="dep-countline">${flapDigitsHtml(daysToGo, { cls: 'dep-flap--xl dep-flap--hot' })}<span class="dep-countline-l">${daysToGo === 1 ? 'day' : 'days'} to<br>departure</span></div>
      ${routeLineHtml(next.route)}
      <dl class="dep-facts">
        ${fact('Departs', mono(next.departText))}${fact('Returns', mono(next.returnText))}
        ${fact('Length', figures(next.lengthText))}${fact('Travellers', mono(trip.travellers))}
        ${weatherFact(trip)}
      </dl>
    </div>
    <div class="dep-perf" aria-hidden="true"></div>
    <div class="dep-pass-todo">
      ${todoHtml(next)}
      <a class="trip-card-link ui-btn dep-pass-open" href="${esc(trip.href)}"${attr('aria-label', open)}${attr('data-focus-key', `open-${trip.id}`)}>${esc(open)}</a>
    </div>
  </article>`;
}
