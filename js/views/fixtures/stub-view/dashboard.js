// The frozen stub view, dashboard half: plain markup, no shared components, every hook of blueprint 3.3.
// Steward: F0. Nobody else edits it; after gate G0 it changes only with the contract.

const P = 'stub';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const GREETING = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' };

function coverHtml(cover) {
  if (cover.kind === 'none') return `<span class="${P}-cover ${P}-cover--none"></span>`;
  const srcset = cover.srcset ? ` srcset="${esc(cover.srcset)}" sizes="96px"` : '';
  const fallback = cover.fallbackSrc ? ` data-fallback="${esc(cover.fallbackSrc)}"` : '';
  return `<img class="${P}-cover" src="${esc(cover.src)}"${srcset}${fallback} alt="" width="96" height="54" loading="lazy" decoding="async">`;
}

function costLine({ cost }) {
  const first = cost.homeFirst ? cost.home : cost.local;
  if (!first) return '';
  return `<p class="${P}-cost">${cost.homeFirst ? 'about ' : ''}${esc(first.text)} per person, activities only</p>`;
}

function statusLine(card) {
  if (card.phase === 'live') return `Day ${esc(card.dayNumber)} of ${esc(card.dates.dayCount)}`;
  if (card.phase === 'upcoming') return card.daysToGo === 1 ? 'Tomorrow' : `In ${esc(card.daysToGo)} days`;
  return card.phase === 'undated' ? 'No dates yet' : 'Past plan';
}

function generatingRow(card) {
  const { daysDone, daysTotal, etaMinutes } = card.generation;
  const progress = daysTotal ? `${esc(daysDone ?? 0)} of ${esc(daysTotal)} days planned` : `${esc(daysDone ?? 0)} days planned so far`;
  const eta = etaMinutes ? `, ~${esc(etaMinutes)} minutes to go` : '';
  return `<li class="${P}-trip" data-trip-id="${esc(card.id)}" data-key="${esc(card.id)}" data-trip-state="generating" role="status">
    <h3 class="${P}-trip-title">${esc(card.title)}</h3>
    <p>Still being planned. ${progress}${eta}.</p>
    <button type="button" data-action="notify-ready" data-focus-key="notify-${esc(card.id)}">Tell me when it is ready</button>
  </li>`;
}

function failedRow(card) {
  const id = esc(card.id);
  const remove = card.shared ? '' : ` <button type="button" data-delete-trip="${id}" data-focus-key="delete-${id}">Delete trip</button>`;
  return `<li class="${P}-trip" data-trip-id="${id}" data-key="${id}" data-trip-state="failed">
    <h3 class="${P}-trip-title">${esc(card.title)}</h3>
    <p>${esc(card.generation.error || 'Planning stopped.')}</p>
    <p><button type="button" data-retry-trip="${id}" data-focus-key="retry-${id}">Try again</button>${remove}</p>
  </li>`;
}

/** One plan as a list item. `extra` is trusted markup for the live and next blocks. */
function tripRow(card, extra = '') {
  if (card.phase === 'generating') return generatingRow(card);
  if (card.phase === 'failed') return failedRow(card);
  const id = esc(card.id);
  const pending = card.briefingPending ? ' data-briefing="pending"' : '';
  const shared = card.shared ? `<p>Shared with you. You can ${card.role === 'editor' ? 'edit' : 'view'} it.</p>` : '';
  const ready = card.readiness ? `<p class="${P}-ready">${esc(card.readiness.headline)}</p>` : '';
  return `<li class="${P}-trip" data-trip-id="${id}" data-key="${id}"${pending}>
    ${coverHtml(card.cover)}
    <h3 class="${P}-trip-title">${esc(card.title)}</h3>
    <p>${esc(card.dates.text)}, ${statusLine(card)}</p>
    ${shared}${ready}${costLine(card)}${extra}
    <a class="trip-card-link" href="${esc(card.href)}" aria-label="${esc(`Open ${card.title}`)}"></a>
  </li>`;
}

function liveExtra(briefing) {
  const { trip, nextStop, today } = briefing;
  const stop = nextStop ? `<p>Next stop${nextStop.time ? ` ${esc(nextStop.time)}` : ''}, ${esc(nextStop.title)}</p>` : '';
  const title = today ? `<p>${esc(today.dateText)}: ${esc(today.title)}</p>` : '';
  return `${title}${stop}
    <p class="${P}-live-links"><a href="${esc(trip.todayHref)}" data-now-trip="${esc(trip.id)}" data-focus-key="today-${esc(trip.id)}">Open today</a>
    <a href="${esc(trip.wholeHref)}" data-focus-key="whole-${esc(trip.id)}">Whole trip</a></p>`;
}

function nextExtra(next) {
  const todo = next.todo.map((item) => `<li>${esc(item.label)}: ${esc(item.status)}</li>`).join('');
  return `<p>${esc(next.route.from.label)} to ${esc(next.route.to.label)}. Departs ${esc(next.departText)}, ${esc(next.lengthText)}.</p>
    ${todo ? `<ul class="${P}-todo">${todo}</ul>` : ''}`;
}

const list = (cards) => `<ul class="${P}-list">${cards.map((card) => tripRow(card)).join('')}</ul>`;
const group = (label, cards) => (cards.length ? `<p class="${P}-group">${label}</p>${list(cards)}` : '');

function pastGroups(model) {
  if (!model.pastByMonth.length) return '';
  const months = model.pastByMonth.map((month, i) => `<details class="${P}-month" data-key="past-${esc(month.key)}"${i === 0 || model.filter.expanded ? ' open' : ''}>
    <summary>${esc(month.label)}</summary>${list(month.trips)}</details>`).join('');
  const total = model.sections.past.length;
  const toggle = model.filter.expanded ? '' : `<button type="button" data-action="show-all-past" data-focus-key="show-all-past">Show all ${esc(total)} past plans</button>`;
  return `<p class="${P}-group">Past plans</p>${months}${toggle}`;
}

function filterBar({ filter }) {
  const chips = filter.options.map((option) => `<button type="button" data-filter="${esc(option.key)}" data-focus-key="filter-${esc(option.key)}" aria-pressed="${option.key === filter.active}">${esc(option.label)} ${esc(option.count)}</button>`).join('');
  return `<label class="${P}-search">Search your trips <input type="search" data-trip-search data-focus-key="trip-search" value="${esc(filter.q)}"></label>
    <div class="${P}-filters" data-region="filters">${chips}</div>`;
}

function hopsSection(model) {
  if (!model.hops.length) return '';
  const hops = model.hops.map((hop) => `<li data-key="${esc(hop.name)}"><button type="button" data-action="plan-city" data-city="${esc(hop.name)}" data-focus-key="hop-${esc(hop.name)}">${esc(hop.name)}, ${esc(hop.country)}, ~${esc(hop.km)} km. ${esc(hop.note)}</button></li>`).join('');
  return `<section class="${P}-hops" aria-labelledby="${P}-hops-h">
    <h2 id="${P}-hops-h">Short hops from ${esc(model.user.homeCity)}</h2>
    <ul data-region="hops" data-keep-scroll>${hops}</ul>
  </section>`;
}

const planButtons = (first) => `<p class="${P}-actions">
    <button type="button" data-action="new-trip" data-focus-key="new-trip">${first ? 'Plan your first trip' : 'Plan a trip'}</button>
    <button type="button" data-action="import-trip" data-focus-key="import-trip">Import a trip</button>
  </p>`;
const PROBE = '<span class="ui-probe" hidden></span>';

function head(model, greeting) {
  const name = model.user.firstName ? `, ${esc(model.user.firstName)}` : '';
  return `<header class="${P}-head">
    <h1 class="${P}-title">${greeting}<span data-region="lead">${name}</span></h1>
    <p class="${P}-date">${esc(model.now.dateText)}</p>
    ${planButtons(model.state === 'empty')}
  </header>`;
}

function readyBody(model) {
  const { sections } = model;
  const stale = model.stale ? `<p class="${P}-banner" role="status">This list was saved on this device and may be out of date.
    <button type="button" data-action="retry-trips" data-focus-key="retry-trips">Try again</button></p>` : '';
  const live = model.live.map((briefing) => tripRow(briefing.trip, liveExtra(briefing))).join('');
  const next = model.next ? `<ul class="${P}-list">${tripRow(model.next.trip, nextExtra(model.next))}</ul>` : '';
  const { trips, countries, daysPlanned } = model.stats;
  return `<div data-slot="chooser"></div>
  ${stale}
  <section class="${P}-live" aria-labelledby="${P}-live-h">
    <h2 id="${P}-live-h">Happening now</h2>
    <ul class="${P}-list" data-region="live">${live}</ul>
  </section>
  <section class="${P}-next" aria-labelledby="${P}-next-h">
    <h2 id="${P}-next-h">Next departure</h2>
    <div data-region="next">${next}</div>
  </section>
  <section class="${P}-trips" aria-labelledby="${P}-trips-h">
    <h2 id="${P}-trips-h">Your trips</h2>
    ${filterBar(model)}
    <div data-region="trips">
      ${group('Still being planned', sections.inProgress)}${group('Happening now', sections.live)}${group('Upcoming', sections.upcoming)}${group('No dates yet', sections.undated)}${pastGroups(model)}
    </div>
  </section>
  <section class="${P}-stats" aria-labelledby="${P}-stats-h">
    <h2 id="${P}-stats-h">Travel stats</h2>
    <p data-region="stats">${esc(trips)} trips planned, ${esc(countries)} countries, ${esc(daysPlanned)} days planned.</p>
  </section>
  ${hopsSection(model)}`;
}

/** @returns {string} inner HTML of the dashboard root */
export function renderDashboard(model, ctx) {
  void ctx;
  if (model.state === 'error') {
    return `${head(model, GREETING[model.now.partOfDay])}
  <div class="${P}-error" role="alert">
    <p>Your trips could not be loaded.</p>
    <button type="button" data-action="retry-trips" data-focus-key="retry-trips">Try again</button>
  </div>${PROBE}`;
  }
  if (model.state === 'empty') {
    return `${head(model, 'Welcome')}
  <p class="${P}-empty">Nothing is planned yet.</p>
  ${hopsSection(model)}${PROBE}`;
  }
  return `${head(model, GREETING[model.now.partOfDay])}
  ${readyBody(model)}${PROBE}`;
}

/** Optional in the contract. The stub binds nothing: every hook is handled by the controllers. */
export function mountDashboard(root, model, ctx) {
  void root; void model; void ctx;
}
