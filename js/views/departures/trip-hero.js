// The hero of the departures trip page: a boarding pass (cover, title, status, countdown, route line,
// the dates, the action row) and the facts card under it. Owner: VA.
//
// The words over the photo are siblings of the photo frame, never inside it: the controller swaps
// or carries the frame as one node (data-carry="cover"), and the title and the status must not
// travel with it. The status pill, the countdown and the route line are one region (hero-status); CSS
// lays its children out in different cells of the pass. The route is in the region because it follows
// the profile (ruling R41): a plan at home has a route only once the home city is known, and the
// controller patches regions, never the hero. Its box is there also while there is no route.
import { button, esc } from '../shared/html.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { routeLineHtml } from '../shared/route-line.js';
import { glanceHtml } from '../shared/glance.js';
import { actionButtonsHtml, moreTriggerHtml } from '../shared/trip-topbar.js';
import { count, dayText, figures, mono, passPhotoHtml, pillFor, statusHtml, stopLine, titleHtml, toneOf } from './parts.js';

/** The actions the hero row shows as buttons; everything else is in More. */
const ROW_KEYS = ['share', 'pdf', 'edit'];
/** The facts card: the cost first and large. The ready count is the board below, not a fact here. */
const FACT_KEYS = ['cost', 'stops', 'weather', 'pace', 'stay'];

const fact = (label, html) => (html ? `<div><dt>${esc(label)}</dt><dd>${html}</dd></div>` : '');

/** The most later stops the model lists (contract: laterToday holds at most three). */
const LATER_MAX = 3;

/**
 * How many stops follow the next one today, and when the last of them starts. The figure is the
 * model's count of every stop left (remainingToday, the one the dashboard card prints), when the
 * model gives it. Without it the list of later stops is the only source, and a full list may be cut
 * short: then no figure is stated, because a wrong one would disagree with the dashboard.
 * @returns {{ after: number|null, lastTime: string|null }}
 */
function stopsLeft(today) {
  const next = today.nextStop;
  const later = Array.isArray(today.laterToday) ? today.laterToday : [];
  if (Number.isFinite(today.remainingToday)) {
    const last = today.tonight && today.tonight !== next ? today.tonight.time : null;
    return { after: Math.max(0, today.remainingToday - (next ? 1 : 0)), lastTime: last ?? null };
  }
  if (later.length >= LATER_MAX) return { after: null, lastTime: null };
  return { after: later.length, lastTime: later.length ? later[later.length - 1].time : null };
}

/** While the plan is live: the day number, the way to today's card, and the next stop. */
function liveHtml(model) {
  const { dayNumber, dayCount, dayIndex, today } = model.live;
  const jump = Number.isInteger(dayIndex) && model.days[dayIndex]
    ? button('Open today', { cls: 'ui-btn ui-btn--primary dep-today-btn', focusKey: 'hero-today', attrs: { 'data-day-jump': dayIndex } }) : '';
  const day = `<div class="dep-countline dep-countline--live"><span class="dep-lbl">Day</span>${flapDigitsHtml(dayNumber, { cls: 'dep-flap--xl' })}<span class="dep-of">of ${mono(dayCount)}</span>${jump}</div>`;
  if (!today) return day;
  const next = today.nextStop;
  const line = stopLine({ nextStop: next, ...stopsLeft(today) });
  const stop = next
    ? `<div class="dep-nextstop">${next.time ? `<time class="dep-mono">${esc(next.time)}</time>` : ''}<div><strong>${esc(next.title)}</strong><span>${figures(line)}</span></div></div>`
    : `<p class="dep-nostop">${esc(line)}</p>`;
  return `${day}<div class="dep-today"><p class="dep-lbl">Today${today.title ? `: ${esc(today.title)}` : ''}</p>${stop}</div>`;
}

/** The countdown, the day number, or how long the plan is, by where the plan stands. */
function countHtml(model) {
  if (model.phase === 'live' && model.live) return liveHtml(model);
  if (model.phase === 'upcoming' && Number.isFinite(model.daysToGo)) {
    return `<div class="dep-countline">${flapDigitsHtml(model.daysToGo, { cls: 'dep-flap--xl dep-flap--hot' })}<span class="dep-countline-l">${model.daysToGo === 1 ? 'day' : 'days'} to<br>departure</span></div>`;
  }
  const days = model.dates.dayCount;
  return days > 0 ? `<div class="dep-countline">${flapDigitsHtml(days, { cls: 'dep-flap--xl' })}<span class="dep-countline-l">${days === 1 ? 'day' : 'days'}<br>planned</span></div>` : '';
}

function factsHtml(model) {
  const { dates, travellers } = model;
  const length = dates.dayCount > 0 ? figures(`${count(dates.dayCount, 'day', 'days')}, ${count(dates.nights, 'night', 'nights')}`) : '';
  // A plan whose dates have passed was planned, not taken: its dates are not a departure and a return.
  const [from, to] = model.phase === 'past' ? ['Planned start', 'Planned end'] : ['Departs', 'Returns'];
  return `<dl class="dep-facts">
        ${fact(from, mono(dayText(dates.start, { year: true })))}${fact(to, mono(dayText(dates.end, { year: true })))}
        ${fact('Length', length)}${fact('Travellers', mono(travellers))}
      </dl>`;
}

/** Share, Export PDF and Edit trip as far as the model offers them, then More (the bar's own menu). */
function stripHtml(model) {
  return `<div class="dep-strip">${actionButtonsHtml(model.actions, { keys: ROW_KEYS, where: 'hero' })}${moreTriggerHtml({ where: 'hero' })}</div>`;
}

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} the `hero` part: the pass (id td-hero), the facts card, the controller's notes
 */
export function heroHtml(model, ctx) {
  const pill = pillFor(model);
  const place = model.placeLine ? `<p class="dep-pass-place">${esc(model.placeLine)}</p>` : '';
  const photo = passPhotoHtml(model.cover, {
    frame: { priority: true, animate: ctx.animate, carry: 'cover', tone: toneOf(model.id), sizes: '(min-width: 1024px) 680px, 100vw' },
    bottom: `<h1 class="dep-pass-title">${titleHtml(model.title, model.flags, 28)}</h1>${place}`,
  });
  // splitAbout: "about" in front of a converted estimate is set small in the body face beside the large figure.
  const facts = glanceHtml(model.glance, { keys: FACT_KEYS, label: 'Trip facts', splitAbout: true }) || glanceHtml(model.glance, { label: 'Trip facts', splitAbout: true });
  return `<div class="dep-hero${ctx.animate ? ' dep-enter' : ''}" id="td-hero">
    <div class="dep-pass dep-pass--trip">
      ${photo}
      <div class="dep-hero-status" data-region="hero-status">
        <p class="dep-hero-pill">${statusHtml(pill.kind, esc(pill.text), { glass: true, pulse: pill.kind === 'live' })}</p>
        ${countHtml(model)}
        <div class="dep-hero-route">${routeLineHtml(model.route)}</div>
      </div>
      <div class="dep-pass-stub">
        ${factsHtml(model)}
      </div>
      ${stripHtml(model)}
    </div>
  </div>
  ${facts}
  <div class="dep-notes">${ctx.slots.notes}</div>`;
}
