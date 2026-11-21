// The greeting row of the departures dashboard: the h1, the date, the summary sentence, the two
// clocks and the two ways to start a plan. Owner: VA.
import { attr, button, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { clockParts, summarySentence } from './parts.js';

const GREETING = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' };
const TICK_MS = 15000;

/** The digits of one clock: hours and minutes as flap cells, the marker beside them. */
function clockFaceHtml(parts) {
  const marker = parts.marker ? `<span class="dep-mono dep-clock-m">${esc(parts.marker)}</span>` : '';
  return `${flapDigitsHtml(Number(parts.hours), { minDigits: parts.hours.length })}<i class="dep-clock-sep" aria-hidden="true">:</i>${flapDigitsHtml(Number(parts.minutes), { minDigits: 2 })}${marker}`;
}

function clockHtml(key, label, iso, timeZone) {
  const parts = clockParts(iso, timeZone);
  if (!parts) return '';
  return `<div class="dep-clock"${attr('data-key', key)}${attr('data-dep-clock', timeZone)}><span class="dep-lbl">${esc(label)}</span><span class="dep-clock-t" data-dep-clock-face role="img"${attr('aria-label', parts.text)}>${clockFaceHtml(parts)}</span></div>`;
}

/**
 * Trip time (the first destination of the lead live plan, blueprint section 10 row 19) and home time.
 * A clock without a known time zone is left out; with neither there is no block at all.
 */
function clocksHtml(model) {
  const lead = model.live[0] ?? null;
  const place = lead?.trip.places[0]?.name || lead?.trip.title;
  const trip = lead ? clockHtml('trip', `${place}, on this trip`, model.now.iso, lead.timezone) : '';
  const home = clockHtml('home', `${model.user.homeCity || 'Home'}, home`, model.now.iso, model.user.homeTimezone);
  if (!trip && !home) return '';
  return `<div class="dep-clocks" data-region="clocks" role="group" aria-label="${trip && home ? 'Time on this trip and at home' : trip ? 'Time on this trip' : 'Time at home'}">${trip}${home}</div>`;
}

const startButtons = () => `<p class="dep-hello-actions">
    ${button('Plan a trip', { action: 'new-trip', cls: 'ui-btn ui-btn--primary', html: `${icon('plus', 18)}<span>Plan a trip</span>` })}
    ${button('Import a trip', { action: 'import-trip', cls: 'ui-btn', html: `${icon('import', 18)}<span>Import a trip</span>` })}
  </p>`;

/**
 * The block that holds the h1. The name is the `lead` region: it can arrive after the list.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ animate?: boolean }} ctx
 */
export function headHtml(model, ctx) {
  const empty = model.state === 'empty';
  const name = model.user.firstName ? `, ${esc(model.user.firstName)}` : '';
  const greeting = empty ? 'Welcome' : GREETING[model.now.partOfDay] ?? GREETING.morning;
  const summary = model.state === 'ready' ? summarySentence(model) : '';
  // The date and the sentence are regions (ruling R41): both change while the page is open (midnight,
  // a plan that finishes or is imported), and the controller patches regions only. The sentence keeps
  // its region on a ready page with nothing to say, so the frame of the page stays the same.
  const sum = model.state === 'ready' ? `<span class="dep-hello-sum" data-region="summary">${esc(summary)}</span>` : '';
  const sub = empty ? '' : `<p class="dep-hello-sub"><span class="dep-hello-date dep-mono" data-region="today">${esc(model.now.dateText)}</span>${sum}</p>`;
  return `<header class="dep-hello${ctx.animate ? ' dep-enter' : ''}">
    <div class="dep-hello-main">
      <h1 class="dep-hello-h">${empty ? greeting : `<span data-region="greeting">${greeting}</span>`}<span data-region="lead">${name}</span></h1>
      ${sub}
    </div>
    ${model.state === 'ready' ? clocksHtml(model) : ''}
    ${empty ? '' : startButtons()}
  </header>`;
}

/** Brings every clock under `root` to the instant `iso`. Touches a clock only when its minute changed. */
export function tickClocks(root, iso) {
  for (const clock of root.querySelectorAll('[data-dep-clock]')) {
    const face = clock.querySelector('[data-dep-clock-face]');
    const parts = clockParts(iso, clock.getAttribute('data-dep-clock'));
    if (!face || !parts || face.getAttribute('aria-label') === parts.text) continue;
    face.innerHTML = clockFaceHtml(parts);
    face.setAttribute('aria-label', parts.text);
  }
}

/**
 * Keeps the clocks going from the model's own instant (model.now.iso plus the time since the mount),
 * so the page never reads the device clock for anything but the time that has passed.
 * @returns {boolean} whether a timer was started
 */
export function mountClocks(root, model, ctx) {
  if (!root.querySelectorAll('[data-dep-clock]').length) return false;
  const base = Date.parse(model.now.iso);
  if (Number.isNaN(base)) return false;
  const started = Date.now();
  const timer = setInterval(() => tickClocks(root, new Date(base + (Date.now() - started)).toISOString()), TICK_MS);
  ctx.onCleanup(() => clearInterval(timer));
  return true;
}
