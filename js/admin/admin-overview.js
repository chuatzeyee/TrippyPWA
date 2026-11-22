// Overview: the figures that matter, a drawn chart of the last 12 weeks, generation health and what
// needs a look. Strings only, built from the pure numbers of admin-stats.js.
import { attr, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { num, plural, relativeTime } from './admin-format.js';
import { chartScale, errorCountsFromFacts, generationHealth, needsAttention, overviewFigures, weeklySeries } from './admin-stats.js';
import { noteHtml } from './admin-parts.js';

const MAX_FAILURES = 5;
const MAX_ATTENTION = 8;
const WEEK_W = 40;
const BAR_W = 13;
const PLOT_H = 100;

export function figuresHtml(figures) {
  const items = figures.map((figure) => `<div class="adm-figure"${attr('data-alert', figure.alert ? 'true' : null)}>
      <dt class="adm-figure-label">${esc(figure.label)}</dt>
      <dd class="adm-figure-value">${esc(figure.value)}</dd>
      <dd class="adm-figure-change">${esc(figure.change)}</dd>
    </div>`).join('');
  return `<dl class="adm-figures">${items}</dl>`;
}

function barHtml(x, value, top, series, label) {
  if (!value) return '';
  const height = Math.max(2, Math.round((value / top) * PLOT_H * 100) / 100);
  return `<rect class="adm-bar" data-series="${series}" x="${x}" y="${PLOT_H - height}" width="${BAR_W}" height="${height}"><title>${esc(label)}</title></rect>`;
}

/**
 * Sign-ups and trips per week as bars. The picture has a spoken summary and a table for screen
 * readers; the labels are HTML, so they stay readable at any width.
 * @param {Array<{ start: string, label: string, people: number, trips: number }>} series
 */
export function chartHtml(series) {
  const { top, ticks } = chartScale(series);
  const people = series.reduce((sum, week) => sum + week.people, 0);
  const trips = series.reduce((sum, week) => sum + week.trips, 0);
  const summary = `${plural(people, 'sign-up', 'sign-ups')} and ${plural(trips, 'trip', 'trips')} in the last ${series.length} weeks`;
  const width = series.length * WEEK_W;
  const gap = (WEEK_W - BAR_W * 2 - 2) / 2;
  const lines = ticks.map((tick) => { const y = PLOT_H - (tick / top) * PLOT_H; return `<line class="adm-grid" x1="0" x2="${width}" y1="${y}" y2="${y}"/>`; }).join('');
  const bars = series.map((week, i) => {
    const x = i * WEEK_W + gap;
    return barHtml(x, week.people, top, 'people', `Week of ${week.label}: ${plural(week.people, 'sign-up', 'sign-ups')}`)
      + barHtml(x + BAR_W + 2, week.trips, top, 'trips', `Week of ${week.label}: ${plural(week.trips, 'trip', 'trips')}`);
  }).join('');
  const weeks = series.map((week, i) => `<li class="adm-chart-week"${attr('data-shown', (series.length - 1 - i) % 3 === 0 ? 'true' : null)}>${esc(week.label)}</li>`).join('');
  const rows = series.map((week) => `<tr><th scope="row">Week of ${esc(week.label)}</th><td>${num(week.people)}</td><td>${num(week.trips)}</td></tr>`).join('');
  return `<section class="adm-card adm-chart-card" aria-labelledby="adm-chart-title">
    <div class="adm-card-head">
      <div>
        <h2 class="adm-card-title" id="adm-chart-title">Sign-ups and trips per week</h2>
        <p class="adm-card-sub">${esc(summary)}</p>
      </div>
      <ul class="adm-legend" aria-hidden="true">
        <li><i class="adm-legend-mark" data-series="people"></i>Sign-ups</li>
        <li><i class="adm-legend-mark" data-series="trips"></i>Trips</li>
      </ul>
    </div>
    <div class="adm-chart">
      <div class="adm-chart-axis" aria-hidden="true">${ticks.map((tick) => `<span>${num(tick)}</span>`).join('')}</div>
      <svg class="adm-chart-svg" viewBox="0 0 ${width} ${PLOT_H}" preserveAspectRatio="none" role="img"${attr('aria-label', summary)} focusable="false">${lines}${bars}</svg>
      <ol class="adm-chart-weeks" aria-hidden="true">${weeks}</ol>
    </div>
    <table class="ui-vh">
      <caption>Sign-ups and trips per week</caption>
      <thead><tr><th scope="col">Week</th><th scope="col">Sign-ups</th><th scope="col">Trips</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

/** What needs a look. Each line is a button that leads to the right row or filter. */
export function attentionHtml(items) {
  const shown = items.slice(0, MAX_ATTENTION);
  const more = items.length - shown.length;
  const list = shown.map((item) => `<li>
      <button type="button" class="adm-attn" data-adm-goto="${esc(item.section)}"${attr('data-adm-id', item.id ?? null)}${attr('data-adm-value', item.chip ?? null)}${attr('data-focus-key', `attn-${item.key}`)}>
        <i class="adm-attn-dot" data-kind="${esc(item.kind)}" aria-hidden="true"></i>
        <span class="adm-attn-text"><span class="adm-attn-title">${esc(item.title)}</span><span class="adm-attn-detail">${esc(item.detail)}</span></span>
        ${icon('chevron-right', 18)}
      </button>
    </li>`).join('');
  const body = shown.length
    ? `<ul class="adm-attn-list">${list}</ul>${more > 0 ? `<p class="adm-card-foot">And ${plural(more, 'more item', 'more items')}. Clear these first.</p>` : ''}`
    : `<div class="adm-calm">${icon('check-circle', 24)}<p class="adm-calm-title">Nothing needs you right now</p><p class="adm-calm-text">No failed or stuck plans, no bursts of errors, and nobody is waiting in setup.</p></div>`;
  return `<section class="adm-card adm-attn-card" aria-labelledby="adm-attn-title">
    <div class="adm-card-head">
      <div>
        <h2 class="adm-card-title" id="adm-attn-title">Needs attention</h2>
        <p class="adm-card-sub">${shown.length ? plural(items.length, 'item', 'items') : 'All clear'}</p>
      </div>
    </div>
    ${body}
  </section>`;
}

/**
 * Generation health: the success rate of the last 30 days and the plans that are still failed.
 * @param {ReturnType<typeof generationHealth>} health
 * @param {{ now: Date|string, busyTrips?: Set<string>, timeZone?: string }} ctx
 */
export function healthHtml(health, { now, busyTrips = new Set(), timeZone } = {}) {
  const finished = health.succeeded + health.failed;
  const rate = health.rate === null
    ? '<p class="adm-rate-value adm-rate-value--words">No plans yet</p><p class="adm-rate-text">No plan finished in the last 30 days.</p>'
    : `<p class="adm-rate-value">${health.rate}%</p><p class="adm-rate-text">${num(health.succeeded)} of ${plural(finished, 'plan', 'plans')} succeeded in the last 30 days.</p>`;
  const meter = health.rate === null ? '' : `<svg class="adm-meter" viewBox="0 0 100 4" preserveAspectRatio="none" role="img"${attr('aria-label', `${health.rate} percent succeeded`)} focusable="false"><rect class="adm-meter-track" width="100" height="4"/><rect class="adm-meter-fill" width="${health.rate}" height="4"/></svg>`;
  const counts = `<dl class="adm-rate-counts">
      <div><dt>Succeeded</dt><dd>${num(health.succeeded)}</dd></div>
      <div><dt>Failed</dt><dd>${num(health.failed)}</dd></div>
      <div><dt>Running</dt><dd>${num(health.running)}</dd></div>
    </dl>`;
  const shown = health.failures.slice(0, MAX_FAILURES);
  const more = health.failures.length - shown.length;
  const rows = shown.map((failure) => {
    const busy = failure.tripId ? busyTrips.has(failure.tripId) : false;
    const title = failure.tripId
      ? `<button type="button" class="adm-linkish" data-adm-goto="trips"${attr('data-adm-id', failure.tripId)}${attr('data-focus-key', `fail-${failure.key}`)}>${esc(failure.title)}</button>`
      : `<span>${esc(failure.title)}</span>`;
    const retry = failure.canRetry && failure.tripId
      ? `<button type="button" class="ui-btn ui-btn--small" data-adm-action="retry-trip"${attr('data-adm-id', failure.tripId)}${attr('data-focus-key', `fail-retry-${failure.key}`)}${attr('disabled', busy)}${attr('aria-label', `Try planning ${failure.title} again`)}>${icon('refresh', 16)}<span>${busy ? 'Starting' : 'Try again'}</span></button>`
      : '';
    return `<li class="adm-fail">
        <div class="adm-fail-text">
          <p class="adm-fail-title">${title}</p>
          <p class="adm-fail-meta">${esc(failure.owner)}${failure.at ? `, ${esc(relativeTime(failure.at, now, { timeZone }))}` : ''}</p>
          <p class="adm-fail-error">${esc(failure.error)}</p>
        </div>
        ${retry}
      </li>`;
  }).join('');
  const failures = shown.length
    ? `<ul class="adm-fail-list">${rows}</ul>${more > 0 ? `<p class="adm-card-foot"><button type="button" class="adm-linkish" data-adm-goto="trips" data-adm-value="failed" data-focus-key="fail-all">See all ${num(health.failures.length)} failed plans</button></p>` : ''}`
    : `<div class="adm-calm">${icon('check-circle', 24)}<p class="adm-calm-title">No failed plans</p><p class="adm-calm-text">Every plan that was asked for is either finished or still being written.</p></div>`;
  return `<section class="adm-card adm-health" aria-labelledby="adm-health-title">
    <div class="adm-card-head">
      <div>
        <h2 class="adm-card-title" id="adm-health-title">Generation health</h2>
        <p class="adm-card-sub">How planning with the AI models is going</p>
      </div>
    </div>
    <div class="adm-health-body">
      <div class="adm-rate">${rate}${meter}${counts}</div>
      <div class="adm-fails">
        <h3 class="adm-sub-title">Still failed</h3>
        ${failures}
      </div>
    </div>
  </section>`;
}

/**
 * The whole Overview section.
 * @param {{ now: Date|string, timeZone?: string, data: object, busyTrips?: Set<string> }} vm
 */
export function overviewHtml(vm) {
  const { data, now, timeZone } = vm;
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const errors = data.errors ?? errorCountsFromFacts(data.facts, now);
  const figures = overviewFigures({ people: data.people, trips: data.trips, peopleTotal: data.peopleTotal, tripsTotal: data.tripsTotal, errors, now });
  const notes = (data.warnings ?? []).map(noteHtml).join('');
  return `<div class="adm-overview">
    ${notes}
    ${figuresHtml(figures)}
    <div class="adm-split">
      ${chartHtml(weeklySeries(data.people, data.trips, now))}
      ${attentionHtml(needsAttention({ people: data.people, trips: data.trips, facts: data.facts, now, timeZone }))}
    </div>
    ${healthHtml(generationHealth(data.jobs, data.trips, peopleById, now), { now, busyTrips: vm.busyTrips, timeZone })}
  </div>`;
}
