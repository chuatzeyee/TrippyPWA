// The comparison page of an imported trip as HTML strings: no DOM, no network. The controller is
// trip-compare.js, the model comes from buildComparison() in js/lib/trip-compare.js. The first
// screen is trip-compare-start-html.js, the pieces both share are trip-compare-parts.js.
import { formatWeekdayDate } from '../lib/locale.js';
import {
  attr, cls, esc, icon, SIDE_LABELS, plural, sideTagHtml, planCoverHtml, datesText, motifHtml, noteHtml, skeletonHtml, kindIconHtml,
  stopThumbHtml, bothIconHtml,
} from './trip-compare-parts.js';
import { compareStartHtml } from './trip-compare-start-html.js';

export { SIDE_LABELS, compareStartHtml };

const OFFLINE_TEXT = 'You are offline. This is the copy saved on this device, and the actions are off until you are back online.';
const WAITING_TEXT = 'Trippy is writing its plan.';
const WAITING_MORE = 'This takes a few minutes, and you can leave this page while it works. Your own plan is below to read meanwhile.';
const vh = (text) => `<span class="ui-vh">${esc(text)}</span>`;
const tripHref = (state) => `#/trip/${esc(encodeURIComponent(state.tripId ?? ''))}`;

function decideHtml(state, where) {
  const off = attr('disabled', Boolean(state.offline));
  const both = state.status === 'ready' ? `<button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="keep-both"${off}>Keep both</button>` : '';
  return `<div class="cmp-actions cmp-actions--${where}">
      <button type="button" class="btn btn--ghost btn--pill cmp-btn cmp-btn--line" data-compare-action="keep-mine"${off}>Keep only my plan</button>${both}
    </div>`;
}

function headHtml(state) {
  const start = state.status === 'start';
  const compared = ['waiting', 'failed', 'ready'].includes(state.status);
  const plan = state.model?.plans?.mine;
  const facts = !compared || !plan ? '' : [
    ['pin', plan.destination], ['calendar', datesText(plan), true], ['people', plan.travelers > 0 ? plural(plan.travelers, 'traveller', 'travellers') : ''],
  ].filter(([, text]) => text).map(([name, text, mono]) => `<li class="cmp-fact">${icon(name, 16)}<span${mono ? ' class="cmp-mono"' : ''}>${esc(text)}</span></li>`).join('');
  const sub = start ? `<p class="cmp-sub">Imported plan: ${esc(state.title || 'your trip')}</p>` : facts ? `<ul class="cmp-facts cmp-sub">${facts}</ul>` : '';
  return `<header class="cmp-head">
    <a class="cmp-back" href="${tripHref(state)}">${icon('back', 18)}<span>Back to the trip</span></a>
    <div class="cmp-head-row">
      <div class="cmp-head-text">
        <h1 class="cmp-title">${start || (!compared && !state.title) ? 'Compare with a Trippy plan' : esc(state.title || 'Your trip')}</h1>
        ${sub}
      </div>
      ${compared ? decideHtml(state, 'head') : ''}
    </div>
  </header>`;
}

// ----- The two plans, face to face -----

/** How far Trippy's plan is, in days; a calm moving line while that is not known. */
export function progressHtml(progress) {
  const total = Math.max(0, Math.trunc(Number(progress?.total)) || 0);
  const done = Math.min(total, Math.max(0, Math.trunc(Number(progress?.done)) || 0));
  const known = total > 0 && progress?.done !== null && progress?.done !== undefined;
  const text = !known ? 'Starting' : done >= total ? 'Finishing the last details' : done === 0 ? `Planning the first of ${plural(total, 'day', 'days')}` : `${done} of ${plural(total, 'day', 'days')} written`;
  return `<div class="cmp-progress" data-compare-progress>
      <div class="${cls('cmp-progress-track', { 'is-unknown': !known || done === 0 })}"${known ? ` role="progressbar" aria-label="Days written" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"` : ' aria-hidden="true"'}><span class="cmp-progress-fill" style="--v:${known ? Math.round((done / total) * 100) : 0}%"></span></div>
      <p class="cmp-progress-text cmp-mono">${esc(text)}</p>
    </div>`;
}

function planCardHtml(key, state) {
  const plan = state.model.plans[key];
  if (key === 'theirs' && state.status === 'waiting') {
    return `<section class="cmp-card cmp-plancard cmp-plancard--writing" role="status">
      <div class="cmp-writing-head">${sideTagHtml('theirs')}${motifHtml({ cls: 'cmp-motif--small' })}</div>
      <p class="cmp-writing-title">${WAITING_TEXT}</p>
      ${state.offline ? '' : progressHtml(state.progress)}
      <p class="cmp-writing-text">${WAITING_MORE}</p>
    </section>`;
  }
  if (key === 'theirs' && state.status === 'failed') {
    return `<section class="cmp-card cmp-plancard cmp-plancard--failed" role="alert">
      <div class="cmp-writing-head">${sideTagHtml('theirs')}</div>
      <p class="cmp-writing-title">${icon('warning', 20)}<span>${esc(state.error || "Trippy couldn't finish its plan this time.")}</span></p>
      <p class="cmp-writing-text">Nothing of your own plan was touched. You can ask Trippy to write it again.</p>
      <div class="cmp-actions"><button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="retry"${attr('disabled', Boolean(state.offline))}>${icon('refresh', 18)}<span>Try again</span></button></div>
    </section>`;
  }
  const line = `${plural(plan.days, 'day', 'days')}, ${plural(plan.stops, 'stop', 'stops')}`;
  const over = `${sideTagHtml(key)}<p class="cmp-plancard-line cmp-mono">${esc(line)}</p>`;
  return `<section class="cmp-plancard cmp-plancard--${key}" aria-label="${SIDE_LABELS[key]}">${planCoverHtml(plan, { over, priority: key === 'mine', cls: 'cmp-cover--band' })}</section>`;
}

// ----- Summary: each measure as two figures facing each other -----

function pairHtml(row, state) {
  const ready = state.status === 'ready';
  const top = Math.max(row.mineValue, ready ? row.theirsValue : 0);
  const sideHtml = (key) => {
    const pending = key === 'theirs' && !ready;
    const value = pending ? (state.status === 'failed' ? 'Not written' : 'Being written') : row[key] === '' ? 'Not known' : row[key];
    const figure = pending ? 0 : row[`${key}Value`];
    const quiet = pending || figure === 0;
    const bar = `<span class="cmp-meter" aria-hidden="true"><span class="cmp-meter-fill" style="--v:${top > 0 ? Math.round((figure / top) * 100) : 0}%"></span></span>`;
    return `<span class="cmp-pair-side cmp-pair-side--${key}">${vh(`${SIDE_LABELS[key]}: `)}<span class="${cls('cmp-pair-value', { 'cmp-pair-value--quiet': quiet && !/^[\d~]/.test(value) })}">${esc(value)}</span>${bar}</span>`;
  };
  return `<li class="cmp-pair"><span class="cmp-pair-label">${esc(row.label)}</span>${sideHtml('mine')}${sideHtml('theirs')}</li>`;
}

function overlapHtml(model) {
  const { both, onlyMine, onlyTheirs } = model.overlap;
  if (both + onlyMine + onlyTheirs === 0) return '';
  const part = (key, count, text) => (count > 0 ? `<span class="cmp-overlap-item"><span class="cmp-swatch cmp-swatch--${key}" aria-hidden="true"></span>${esc(text)}</span>` : '');
  const seg = (key, count) => (count > 0 ? `<span class="cmp-overlap-seg cmp-overlap-seg--${key}" style="flex-grow:${count}"></span>` : '');
  const lead = both === 0 ? '<span class="cmp-overlap-item">No place appears in both plans</span>' : part('both', both, `${plural(both, 'place', 'places')} in both`);
  return `<div class="cmp-overlap">
      <h3 class="cmp-eyebrow">Places</h3>
      <div class="cmp-overlap-bar" aria-hidden="true">${seg('mine', onlyMine)}${seg('both', both)}${seg('theirs', onlyTheirs)}</div>
      <p class="cmp-shared">${[lead, part('mine', onlyMine, `${onlyMine} only in yours`), part('theirs', onlyTheirs, `${onlyTheirs} only in Trippy's`)].filter(Boolean).join('')}</p>
    </div>`;
}

function summaryHtml(model, state) {
  return `<section class="cmp-card cmp-summary" aria-label="Summary">
    <ul class="cmp-pairs"><li class="cmp-pair cmp-pair--head" aria-hidden="true">${sideTagHtml('mine')}<span class="cmp-eyebrow">At a glance</span>${sideTagHtml('theirs')}</li>${model.summary.map((row) => pairHtml(row, state)).join('')}</ul>
    ${state.status === 'ready' ? overlapHtml(model) : ''}
  </section>`;
}

// ----- The pinned row: days to jump to, and on a phone the side shown -----

function barHtml(model, side) {
  const chips = model.days.length < 2 ? '' : `<nav class="cmp-daynav" aria-label="Jump to a day">
      <span class="cmp-daynav-label" aria-hidden="true">Day</span>
      <div class="cmp-daychips ui-scroll-fade">${model.days.map((day, i) => `<button type="button" class="tv-day-chip cmp-daychip" data-compare-jump="${day.number}"${attr('aria-current', i === 0 ? 'true' : null)}>${vh('Day ')}${day.number}</button>`).join('')}</div>
    </nav>`;
  const short = { mine: 'Yours', theirs: "Trippy's" };
  return `<div class="cmp-bar" data-compare-bar>
    <div class="cmp-bar-row">
      ${chips}
      <div class="cmp-switch" role="group" aria-label="Plan shown">
        ${['mine', 'theirs'].map((key) => `<button type="button" class="cmp-switch-btn" data-compare-side="${key}" aria-pressed="${key === side}">${short[key]}</button>`).join('')}
      </div>
    </div>
    <div class="cmp-colheads" aria-hidden="true">${sideTagHtml('mine')}${sideTagHtml('theirs')}</div>
  </div>`;
}

// ----- Days -----

function stopHtml(stop, { mine, addable, added, off }) {
  const kind = stop.category ? `<span class="cmp-stop-kind">${kindIconHtml(stop.kind)}<span>${esc(stop.category)}</span></span>` : '';
  const cost = stop.cost ? `<span class="cmp-stop-cost cmp-mono">${esc(stop.cost)}</span>` : '';
  const action = added ? `<span class="cmp-added">${icon('check', 16)}Added</span>`
    : addable && !stop.inBoth ? `<button type="button" class="cmp-add" data-compare-add="${esc(stop.id)}"${attr('disabled', off)}>${icon('plus', 16)}<span>Add to my plan</span></button>` : '';
  const both = stop.inBoth && !added ? `<span class="cmp-both">${bothIconHtml()}<span>In both${stop.otherDay ? `, ${mine ? "Trippy's" : 'your'} day ${stop.otherDay}` : ''}</span></span>` : '';
  return `<li class="${cls('cmp-stop', { 'cmp-stop--both': stop.inBoth || added })}">
    <span class="cmp-stop-time cmp-mono">${esc(stop.time)}</span>
    ${stopThumbHtml(stop)}
    <div class="cmp-stop-main">
      <span class="cmp-stop-name">${esc(stop.name)}</span>
      ${kind || cost ? `<span class="cmp-stop-meta">${kind}${cost}</span>` : ''}
    </div>
    ${both}${action}
  </li>`;
}

function sideHtml(key, side, day, state) {
  const pending = key === 'theirs' && state.status !== 'ready';
  const added = state.added ?? new Set();
  const empty = (text, mark = '') => `<p class="cmp-empty">${mark}${text}</p>`;
  const body = pending ? (state.status === 'failed' ? empty('Not written yet.') : `${skeletonHtml(3, 'cmp-skel--stops')}${empty('Being written.')}`)
    : !side.exists ? empty(`This plan has no day ${day.number}.`)
      : side.stops.length === 0 ? empty('Nothing planned for this day.')
        : `<ul class="cmp-stops">${side.stops.map((stop) => stopHtml(stop, {
          mine: key === 'mine', addable: key === 'theirs' && Boolean(day.mine.dayId), added: key === 'theirs' && added.has(stop.id), off: Boolean(state.offline),
        })).join('')}</ul>`;
  const shown = side.exists && !pending;
  return `<section class="cmp-side cmp-side--${key}" data-side-panel="${key}">
    <h3 class="cmp-side-head"><span class="cmp-side-label">${SIDE_LABELS[key]}</span>${side.title && shown ? `<span class="cmp-side-title">${esc(side.title)}</span>` : ''}${shown && side.stops.length ? `<span class="cmp-side-count cmp-mono">${plural(side.stops.length, 'stop', 'stops')}</span>` : ''}</h3>
    ${body}
  </section>`;
}

function dayHtml(day, state) {
  const date = day.date ? formatWeekdayDate(day.date) : '';
  return `<li class="cmp-day" data-compare-day="${day.number}">
    <h2 class="cmp-day-title"><span class="cmp-day-name">Day ${day.number}</span>${date ? `<span class="cmp-day-date cmp-mono">${esc(date)}</span>` : ''}</h2>
    <div class="cmp-day-cols">${sideHtml('mine', day.mine, day, state)}${sideHtml('theirs', day.theirs, day, state)}</div>
  </li>`;
}

// ----- The end: the two choices -----

function endHtml(state) {
  const off = attr('disabled', Boolean(state.offline));
  const ready = state.status === 'ready';
  const mine = `<div class="cmp-card cmp-choice">
      ${sideTagHtml('mine')}
      <h3 class="cmp-choice-title">Stay with your plan</h3>
      <p class="cmp-choice-text">${ready ? "Deletes Trippy's plan for good. Your imported plan stays as it is, with every stop you added from Trippy's." : "Stops the comparison and deletes Trippy's plan. Your imported plan stays as it is."}</p>
      <button type="button" class="btn btn--ghost btn--pill cmp-btn cmp-btn--line" data-compare-action="keep-mine"${off}>Keep only my plan</button>
    </div>`;
  const theirs = ready ? `<div class="cmp-card cmp-choice">
      ${sideTagHtml('theirs')}
      <h3 class="cmp-choice-title">Have both in your trips</h3>
      <p class="cmp-choice-text">Trippy's plan joins your trips as a plan of its own, named after this one. Your imported plan stays as it is.</p>
      <button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="keep-both"${off}>Keep both</button>
    </div>` : `<div class="cmp-card cmp-choice cmp-choice--later">
      ${sideTagHtml('theirs')}
      <h3 class="cmp-choice-title">${state.status === 'failed' ? 'Not written yet' : 'Still being written'}</h3>
      <p class="cmp-choice-text">Once Trippy's plan is here you can also keep it, as a trip of its own next to yours.</p>
    </div>`;
  return `<section class="cmp-end" aria-labelledby="cmp-end-title">
    <h2 class="cmp-end-title" id="cmp-end-title">When you are done</h2>
    <div class="cmp-duo cmp-duo--end">${mine}${theirs}</div>
  </section>`;
}

const loadingHtml = () => `<div class="cmp-loading" role="status">
    <p class="cmp-loading-text">Loading the comparison</p>
    <div class="cmp-duo" aria-hidden="true">${[0, 1].map(() => `<div class="cmp-card cmp-loading-card"><span class="cmp-skel-block"></span>${skeletonHtml(4)}</div>`).join('')}</div>
  </div>`;

const errorHtml = (state) => `<section class="cmp-card cmp-failed" role="alert">
    <span class="cmp-failed-mark">${icon(state.offline ? 'offline' : 'warning', 24)}</span>
    <div class="cmp-failed-text">
      <h2 class="cmp-card-title">The comparison did not load</h2>
      <p class="cmp-card-text">${esc(state.error || 'Check your connection, then try again.')}</p>
    </div>
    <button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="reload">${icon('refresh', 18)}<span>Try again</span></button>
  </section>`;

/**
 * The whole page.
 * @param {object} state
 *   tripId, title; status 'loading' | 'error' | 'start' | 'waiting' | 'failed' | 'ready';
 *   model (buildComparison) for start, waiting, failed and ready; inputs, inputError, busy and home
 *   (the home currency) for start; progress { done, total } in days while waiting, when known;
 *   side 'mine' | 'theirs' (the one a phone shows); offline; notice; error; added (Set of stop ids)
 * @returns {string}
 */
export function comparePageHtml(state) {
  const side = state.side === 'theirs' ? 'theirs' : 'mine';
  const notes = `${state.offline ? noteHtml(OFFLINE_TEXT, 'offline') : ''}${noteHtml(state.notice)}`;
  let body;
  if (state.status === 'loading') body = loadingHtml();
  else if (state.status === 'error') body = errorHtml(state);
  else if (state.status === 'start') body = compareStartHtml(state);
  else {
    body = `<div class="cmp-duo cmp-duo--plans">${planCardHtml('mine', state)}${planCardHtml('theirs', state)}</div>
    ${summaryHtml(state.model, state)}${barHtml(state.model, side)}
    <ol class="cmp-days">${state.model.days.map((day) => dayHtml(day, state)).join('')}</ol>
    ${state.model.days.length === 0 ? '<p class="cmp-empty">Neither plan has any days yet.</p>' : ''}
    ${endHtml(state)}`;
  }
  return `<div class="cmp-page" data-view="compare" data-compare-page data-side="${side}" data-status="${esc(state.status)}">
    ${headHtml(state)}${notes}${body}
  </div>`;
}

/** The one action on an imported trip's page (owner only): an invitation to the comparison. */
export function compareEntryHtml(trip) {
  const has = typeof trip?.wizard_state?.compareTrip === 'string' && trip.wizard_state.compareTrip !== '';
  return `<div class="cmp-entry" data-compare-entry>
    ${motifHtml({ cls: 'cmp-entry-motif' })}
    <div class="cmp-entry-text">
      <p class="cmp-entry-title">${has ? "Trippy's plan is next to yours" : 'See what Trippy would plan'}</p>
      <p class="cmp-entry-sub">${has ? 'Read the two day by day, take the stops you like, then keep one or both.' : 'This plan was imported. Trippy can write its own for the same trip and set the two side by side.'}</p>
    </div>
    <a class="btn btn--primary btn--pill cmp-entry-btn" href="#/trip/${esc(encodeURIComponent(trip?.id ?? ''))}/compare"><span>${has ? 'Open comparison' : 'Compare with a Trippy plan'}</span>${icon('chevron-right', 16)}</a>
  </div>`;
}
