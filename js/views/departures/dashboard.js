// The departures dashboard (blueprint 3.1, 3.3): a departures board. Sections in order: the greeting
// row, Happening now, Next departure, Your trips, Travel stats, Short hops, the foot. Each section
// is built in its own file of this folder; this one puts them together and holds the states that
// have no plans to show (empty, load error). Owner: VA.
import { emptyStateHtml, loadErrorHtml, staleBannerHtml } from '../shared/state-cards.js';
import { filterBarHtml } from '../shared/filter-bar.js';
import { icon } from '../shared/icons.js';
import { countRegion, drawCtx, mono, savedText, sectionHead } from './parts.js';
import { headHtml, mountClocks } from './dash-head.js';
import { liveHtml } from './dash-live.js';
import { nextPassHtml } from './dash-next.js';
import { boardsHtml } from './dash-board.js';
import { footHtml, hopListHtml, hopsHtml, statsHtml } from './dash-stats.js';

// The cascade probe: the harness reads its computed outline-style to prove the skin beats the shared sheet.
const PROBE = '<span class="ui-probe" hidden></span>';
const SEARCH_LABEL = 'Search trips, cities or countries';
const enter = (ctx) => (ctx.animate ? ' dep-enter' : '');

/** Happening now beside Next departure. Both regions exist even when they hold nothing. */
function briefHtml(model, ctx) {
  const { next } = model;
  const live = model.live.length;
  return `<div class="dep-brief${enter(ctx)}">
    <section class="dep-now" aria-labelledby="dep-now-h">
      ${sectionHead('dep-now-h', 'Happening now', countRegion('now-count', live || ''))}
      <div class="dep-live" data-region="live">${liveHtml(model, ctx)}</div>
    </section>
    <section class="dep-next" aria-labelledby="dep-next-h">
      ${sectionHead('dep-next-h', 'Next departure', `<span class="dep-note" data-region="next-date">${next ? mono(next.departText) : ''}</span>`)}
      <div class="dep-next-slot" data-region="next">${next ? nextPassHtml(next, ctx, { priority: live === 0 }) : ''}</div>
    </section>
  </div>`;
}

/** The search field and the filter chips beside the heading, then the boards. */
function tripsHtml(model, ctx) {
  return `<section class="dep-trips${enter(ctx)}" aria-labelledby="dep-trips-h">
    <div class="dep-toolbar">
      ${sectionHead('dep-trips-h', 'Your trips', countRegion('trips-count', model.counts.all))}
      ${filterBarHtml(model.filter, { label: SEARCH_LABEL })}
    </div>
    <div class="dep-boards" data-region="trips">${boardsHtml(model, ctx)}</div>
  </section>`;
}

/** A new account: both ways to start, what importing does, an empty board and a few hops to begin with. */
function emptyHtml(model, ctx) {
  return `<div class="dep-empty${enter(ctx)}">
    ${emptyStateHtml(model, { title: 'You have no trips yet.', text: 'Plan your first in about five minutes, or bring in one you have already booked.' })}
    <p class="dep-empty-hint">Import reads an itinerary you already have and lays it out as a Trippy trip.</p>
    <div class="dep-board dep-empty-board">
      <div class="dep-board-top"><span class="dep-board-ic">${icon('plane', 20)}</span><p class="dep-board-title">Upcoming</p>${mono(0)}</div>
      <p class="dep-empty-line">Your trips will be listed here, soonest first, each with a countdown and what is left to do.</p>
    </div>
    ${hopListHtml(model)}
  </div>`;
}

/**
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} inner HTML of the dashboard root
 */
export function renderDashboard(model, given) {
  const ctx = drawCtx(given);
  if (model.state === 'error') {
    return `${headHtml(model, ctx)}
  ${loadErrorHtml({ message: 'Your trips are safe. Check the connection and try again.' })}${PROBE}`;
  }
  if (model.state === 'empty') {
    return `${headHtml(model, ctx)}
  ${emptyHtml(model, ctx)}
  ${footHtml(model, { credits: false })}${PROBE}`;
  }
  return `${headHtml(model, ctx)}
  <div data-slot="chooser"></div>
  ${staleBannerHtml(model.stale, { savedText: savedText(model.stale?.savedAt) })}
  ${briefHtml(model, ctx)}
  ${tripsHtml(model, ctx)}
  ${statsHtml(model, ctx)}
  ${hopsHtml(model, ctx)}
  ${footHtml(model)}${PROBE}`;
}

/**
 * Called once per mounted root. The controller mounts the photo frames, the menus and the flap
 * digits; all this view adds is the ticking of its two clocks.
 * @param {Element} root
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function mountDashboard(root, model, ctx) {
  mountClocks(root, model, ctx);
}
