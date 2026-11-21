// The dashboard as a view draws it (blueprint 2.3): every plan as a card, the plans running now,
// the next departure, the sections of the list and what the plans add up to.
// Pure: the rows, the briefings, `now`, the prefs, the profile, the ticks, the catalogue and the
// list of plans saved on this device are passed in, and nothing here reads the clock, storage or
// the network. Every call returns new objects; no input is changed.
//
// A plan that is still being planned, or whose planning stopped, sits in `inProgress` only: it is
// never live, never the next departure, never counted and never pinned.
import { tripStatus, tripPhase, zonedToday } from './trip-status.js';
import { readiness } from './readiness.js';
import { normaliseTransportExtras } from './journey.js';
import { estimateGenerationMinutes } from './trip-extras.js';
import { listCover } from './cover-model.js';
import { typicalWeather } from './weather.js';
import { travelStats, mapPins, shortHops, addDays, dayText, monthLabel } from './travel-stats.js';
import {
  displayTitle, tripPlaces, placeFlags, tripDates, homeCurrencyOf, planCost, entryInput, zonedMinutes, rowOfToday, todayStops, routeLine,
} from './trip-overview-model.js';

/** How many plans get a briefing: the live ones, then the next departures (blueprint 7.2). */
const BRIEFING_MAX = 8;
const TODO_MAX = 3;
const IN_PROGRESS = new Set(['generating', 'failed']);
const FILTERS = { all: 'All', live: 'Now', upcoming: 'Upcoming', past: 'Past', shared: 'Shared with me' };
const KEEPS = {
  all: () => true, live: (card) => card.phase === 'live', upcoming: (card) => card.phase === 'upcoming',
  past: (card) => card.phase === 'past', shared: (card) => card.shared,
};
const SECTION_PHASES = { inProgress: ['generating', 'failed'], live: ['live'], upcoming: ['upcoming'], past: ['past'], undated: ['undated'] };

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim() : '');
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Rows that carry an id, each id once. */
const plansOf = (rows) => list(rows).filter((row, at, all) => text(row.id) && all.findIndex((other) => text(other.id) === text(row.id)) === at);
const madeAt = (row) => Date.parse(row.created_at) || 0;

// --- Orders -----------------------------------------------------------------------------------------
// Each ends on the id, so two plans never tie.

const newest = (a, b) => madeAt(b.row) - madeAt(a.row) || order(b.id, a.id);
const laterStart = (a, b) => order(b.row.start_date ?? '', a.row.start_date ?? '') || newest(a, b);
const soonest = (a, b) => order(a.row.start_date ?? '', b.row.start_date ?? '') || madeAt(a.row) - madeAt(b.row) || order(a.id, b.id);
// Past plans: the month they started in, newest first, then the later end. Sorting by month first
// keeps every month group in one piece, so the groups and the section are in the same order.
const latest = (a, b) => order(b.card.monthKey, a.card.monthKey)
  || order(b.card.dates.end ?? b.card.dates.start, a.card.dates.end ?? a.card.dates.start) || laterStart(a, b);

/**
 * The plans that get a briefing: live plans first (later start first), then upcoming plans by start
 * date. Plans still being planned, stopped, past or without dates get none.
 * @param {Array<object>} rows   list rows from fetchAllTrips()
 * @param {Date|string|number} now
 * @param {number} [max]         eight when left out
 * @param {string} [deviceZone]
 * @returns {string[]} trip ids, at most `max`
 */
export function briefingIds(rows, now, max = BRIEFING_MAX, deviceZone) {
  const plans = plansOf(rows).filter((row) => !IN_PROGRESS.has(row.status)).map((row) => ({ row, id: text(row.id), phase: tripPhase(row, now, deviceZone) }));
  const of = (phase, sort) => plans.filter((plan) => plan.phase === phase).sort(sort);
  return [...of('live', laterStart), ...of('upcoming', soonest)].slice(0, Math.max(0, Number(max) || 0)).map((plan) => plan.id);
}

// --- Cards ------------------------------------------------------------------------------------------

/** A briefing row with every part in a known shape; the journey is normalised as the trip page does. */
function briefingOf(raw) {
  const ws = isObject(raw.wizard_state) ? raw.wizard_state : {};
  return {
    extras: normaliseTransportExtras(isObject(raw.extras) ? raw.extras : {}, ws.transport?.mode),
    settled: { flights: ws.flights?.settled === true, accommodation: ws.accommodation?.settled === true },
    days: list(raw.days), stops: list(raw.stops),
  };
}

// daysTotal is the span of the dates, else the length the wizard was given, else unknown. The cause
// of a stop is not known to the app, so the line only says how far the plan got.
function generationOf(row, dates, progress) {
  const failed = row.status === 'failed';
  const daysDone = finite(progress?.daysDone);
  const length = Number(row.wizard_state?.dates?.duration);
  const daysTotal = dates.start && dates.end ? dates.dayCount : length > 0 ? length : null;
  const eta = failed ? null : finite(progress?.etaMinutes) ?? (daysTotal ? estimateGenerationMinutes(Math.max(1, daysTotal - (daysDone ?? 0))) : null);
  const reached = failed && daysDone !== null && daysTotal ? ` after ${daysDone} of ${daysTotal} days` : '';
  return { daysDone, daysTotal, etaMinutes: eta, slow: !failed && Boolean(progress?.slow), error: failed ? `Planning stopped${reached}.` : '' };
}

/**
 * Today in a live plan: its day row and its stops row. The stops of a briefing always carry their
 * date (the repository selects them by it) and there is a row for every dated day in the fetched
 * range, also for a day with no activities. So a dated day without a stops row was not fetched (the
 * copy was saved before the plan reached that day): its stops are unknown, not none. A day row
 * without a date never has a stops row, so nothing is awaited for it.
 */
function liveDay(stand, briefing, now, deviceZone) {
  const today = zonedToday(now, stand.zone, deviceZone);
  const todayRow = rowOfToday(briefing?.days ?? [], stand.live, today);
  const stops = todayRow ? briefing.stops.find((day) => day.date === today) ?? null : null;
  const dated = typeof todayRow?.date === 'string' && todayRow.date.slice(0, 10) === today;
  return { today, todayRow, stops, stopsUnknown: dated && !stops };
}

function planOf(row, context) {
  const { now, deviceZone, prefs, profile, briefings, awaited, offline, generation, ticks, entries, countryName } = context;
  const id = text(row.id);
  const briefing = briefings.get(id) ?? null;
  const stand = tripStatus(row, briefing?.days ?? [], now, deviceZone);
  const inProgress = IN_PROGRESS.has(row.status);
  const phase = inProgress ? row.status : stand.phase;
  const live = phase === 'live' ? stand.live : null;
  const day = live ? liveDay(stand, briefing, now, deviceZone) : null;
  const dates = tripDates(row);
  const places = tripPlaces(row);
  const href = `#/trip/${encodeURIComponent(id)}`;
  const briefed = briefing && !inProgress;
  const card = {
    id, title: displayTitle(row), href, wholeHref: `${href}?today=0`, todayHref: live ? `${href}?today=1` : null, phase, dates,
    daysToGo: phase === 'upcoming' ? stand.daysToGo : null, dayNumber: live?.dayNumber ?? null, daysLeft: live?.daysLeft ?? null,
    places, flags: placeFlags(places), travellers: finite(row.travelers), cover: listCover(row),
    cost: planCost(row, list(row.itinerary_days).flatMap((day) => list(day.activities)), { profile, prefs, dayCount: dates.dayCount }),
    shared: Boolean(row.shared), role: row.shared ? (row.collab_role === 'editor' ? 'editor' : 'viewer') : null,
    imported: row.wizard_state?.imported === true, savedOffline: offline.includes(id),
    readiness: briefed ? readiness({
      phase, status: row.status, extras: briefing.extras, settled: briefing.settled, destinations: places, homeCity: profile?.home_city,
      ticks: ticks?.[id], entry: entryInput(entries?.[id], ticks?.[id], id, profile?.home_flag), now, deviceZone, days: briefing.days, countryName,
    }) : null,
    weather: briefed ? typicalWeather(briefing.days, dates.start) : null,
    // Also while a live plan's saved briefing lacks today's stops: the views then draw their pending state.
    briefingPending: awaited.has(id) || Boolean(day?.stopsUnknown),
    generation: inProgress ? generationOf(row, dates, generation?.[id]) : null,
    monthKey: dates.start ? dates.start.slice(0, 7) : '',
  };
  return { id, row, card, stand, briefing, day };
}

// --- The featured plans -----------------------------------------------------------------------------

function liveBriefing({ row, card, stand, briefing, day }, isLead, { now }) {
  const { live, zone } = stand;
  const { today, todayRow, stops } = day;
  const tomorrow = addDays(today, 1);
  const days = briefing?.days ?? [];
  const tomorrowRow = live.daysLeft > 0
    ? days.find((day) => day.date === tomorrow) ?? days.find((day) => !day.date && Number(day.day_number) === live.dayNumber + 1) : null;
  const dayLine = (day, date) => ({ dateText: dayText(date), title: text(day.title), weather: typicalWeather([day], row.start_date) });
  return {
    trip: card, isLead, timezone: zone, dayNumber: live.dayNumber, dayCount: live.dayCount, daysLeft: live.daysLeft,
    endText: dayText(card.dates.end ?? card.dates.start),
    today: todayRow ? dayLine(todayRow, today) : null,
    ...todayStops(stops?.activities, zonedMinutes(now, zone)),
    tomorrow: tomorrowRow ? { dayNumber: live.dayNumber + 1, ...dayLine(tomorrowRow, tomorrow) } : null,
  };
}

function nextDeparture({ card, briefing }, { profile }) {
  const items = card.readiness?.items ?? [];
  const { start, end, dayCount, nights } = card.dates;
  return {
    trip: card, daysToGo: card.daysToGo,
    route: routeLine({ extras: briefing?.extras ?? null, places: card.places, homeCity: profile?.home_city, sorted: briefing?.settled.flights }),
    departText: dayText(start, true), returnText: dayText(end ?? start, true),
    lengthText: `${plural(dayCount, 'day')}${nights ? `, ${plural(nights, 'night')}` : ''}`,
    todo: items.filter((item) => item.state === 'todo').slice(0, TODO_MAX), settled: items.filter((item) => item.state === 'done'),
  };
}

// --- Sections, filter -------------------------------------------------------------------------------

/** The past plans by the month they started in, in the order they are given. */
function monthGroups(past) {
  return [...new Set(past.map((card) => card.monthKey))].map((key) => ({ key, label: monthLabel(key), trips: past.filter((card) => card.monthKey === key) }));
}

const sectionsOf = (cards) => Object.fromEntries(Object.entries(SECTION_PHASES).map(([name, phases]) => [name, cards.filter((card) => phases.includes(card.phase))]));

/**
 * The same model with only the matches in its sections and month groups. Everything else stands:
 * cardsById, live, next, the counts and the statistics stay whole, so the featured plans do not
 * move while the user types. `q` matches when every word of it is in the title, a place or a
 * country. It may be called on a model that is already filtered: it then starts from cardsById,
 * which holds every card in section order (as long as the ids are not whole numbers).
 * @param {import('../views/contract.js').DashboardModel} model
 * @param {{ q?: string, filter?: 'all'|'live'|'upcoming'|'past'|'shared' }} [state]   an unknown filter reads as 'all'
 * @returns {import('../views/contract.js').DashboardModel} a new model; filter.expanded is true while a query or a filter is on
 */
export function applyDashboardFilter(model, { q, filter } = {}) {
  const query = typeof q === 'string' ? q : '';
  const active = Object.hasOwn(KEEPS, filter ?? '') ? filter : 'all';
  const words = text(query).toLowerCase().split(' ').filter(Boolean);
  const matches = (card) => {
    const hay = [card.title, ...card.places.flatMap((place) => [place.name, place.country])].join(' ').toLowerCase();
    return KEEPS[active](card) && words.every((word) => hay.includes(word));
  };
  // An unfiltered model has every card in its sections; a filtered one only in cardsById.
  const every = model.filter.expanded ? Object.values(model.cardsById) : Object.values(model.sections).flat();
  const sections = sectionsOf(every.filter(matches));
  return {
    ...model, sections, pastByMonth: monthGroups(sections.past),
    filter: { ...model.filter, q: query, active, expanded: query !== '' || active !== 'all' },
  };
}

// --- The model --------------------------------------------------------------------------------------

function creditsOf(covers) {
  const lines = covers.filter((cover) => cover.credit).map((cover) => ({ label: cover.credit.chip, full: cover.credit.full, link: cover.credit.link }));
  return lines.filter((line, at) => lines.findIndex((other) => other.link === line.link && other.full === line.full) === at);
}

/**
 * @param {object} input
 * @param {Array<object>} input.rows            list rows from fetchAllTrips(); ignored when loadError is set
 * @param {Array<object>} [input.briefings]     rows from readSavedBriefings() or fetchTripBriefings(); a plan without one has no readiness yet
 * @param {Date|string|number} input.now        required; rebuild with a fresh one to move "next stop" on
 * @param {string} [input.deviceZone]           the zone of the device (tests pass it)
 * @param {object} [input.prefs]                getPrefs(): homeCurrencyFirst is read here
 * @param {object|null} [input.profile]         the profile summary: name, home city, flag and currency, is_nomad
 * @param {Object<string, object>} [input.ticks]      trip id to readTicks(id)
 * @param {Object<string, *>} [input.entries]         trip id to the entry check: 'checking' (also when absent), { reason },
 *                                              an entryPlan() result or a summariseEntry() result
 * @param {Array<object>} [input.catalogue]     the destination catalogue: the home point, the home clock and the short hops come from it
 * @param {Array<string|{ id: string }>} [input.offlineIds]   listOfflineTrips(), most recently opened first
 * @param {Object<string, { daysDone?: number|null, etaMinutes?: number|null, slow?: boolean }>} [input.generation]   progress of the plans being planned
 * @param {boolean} [input.loadError]           the list could not be loaded: state 'error', never 'empty'
 * @param {boolean} [input.stale]               the list is the copy saved on this device, saved at `cachedAt`
 * @param {string|null} [input.cachedAt]
 * @param {number} [input.briefingMax]          as given to briefingIds(); eight when left out
 * @param {(iso2: string) => string} [input.countryName]   names a passport in the entry detail
 * @returns {import('../views/contract.js').DashboardModel} unfiltered; cardsById holds the cards in section order
 */
export function buildDashboardModel(input = {}) {
  const { now, deviceZone, prefs, profile, loadError = false } = input;
  const today = zonedToday(now, deviceZone, deviceZone);
  const minutes = zonedMinutes(now, deviceZone);
  const rows = loadError ? [] : plansOf(input.rows);
  const briefings = new Map(list(input.briefings).filter((raw) => text(raw.id)).map((raw) => [text(raw.id), briefingOf(raw)]));
  const offline = (Array.isArray(input.offlineIds) ? input.offlineIds : []).map((entry) => text(isObject(entry) ? entry.id : entry)).filter(Boolean);
  const awaited = new Set(briefingIds(rows, now, input.briefingMax ?? BRIEFING_MAX, deviceZone).filter((id) => !briefings.has(id)));
  const context = { ...input, briefings, awaited, offline };
  const plans = rows.map((row) => planOf(row, context));
  const rank = (plan) => (offline.includes(plan.id) ? offline.indexOf(plan.id) : offline.length);
  const sorted = {
    inProgress: newest, live: (a, b) => rank(a) - rank(b) || laterStart(a, b), upcoming: soonest, past: latest, undated: newest,
  };
  const inSection = Object.fromEntries(Object.entries(SECTION_PHASES)
    .map(([name, phases]) => [name, plans.filter((plan) => phases.includes(plan.card.phase)).sort(sorted[name])]));
  const ordered = Object.values(inSection).flat();
  const cards = ordered.map((plan) => plan.card);
  const sections = sectionsOf(cards);
  const home = list(input.catalogue).find((place) => text(profile?.home_city) && sameName(place.name, profile.home_city)) ?? null;
  // Each count is what its filter shows, so "All" includes the plans still being planned.
  const counts = {
    all: cards.length, live: sections.live.length, upcoming: sections.upcoming.length, past: sections.past.length,
    shared: cards.filter((card) => card.shared).length,
  };
  const hops = loadError ? [] : shortHops(cards, { home, catalogue: input.catalogue, nomad: profile?.is_nomad === true });
  return {
    state: loadError ? 'error' : cards.length ? 'ready' : 'empty',
    stale: input.stale ? { savedAt: input.cachedAt ?? null } : null,
    now: { iso: new Date(now).toISOString(), dateText: dayText(today), partOfDay: minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening' },
    user: {
      firstName: text(profile?.display_name).split(' ')[0], homeCity: text(profile?.home_city), homeFlag: text(profile?.home_flag).toLowerCase(),
      homeTimezone: text(home?.timezone) || null, homeCurrency: homeCurrencyOf(profile),
    },
    live: inSection.live.map((plan, at) => liveBriefing(plan, at === 0, context)),
    next: inSection.upcoming.length ? nextDeparture(inSection.upcoming[0], context) : null,
    sections, pastByMonth: monthGroups(sections.past),
    cardsById: Object.fromEntries(cards.map((card) => [card.id, card])),
    counts,
    filter: { q: '', active: 'all', expanded: false, options: Object.keys(FILTERS).map((key) => ({ key, label: FILTERS[key], count: counts[key] })) },
    stats: travelStats(cards, { homeFlag: profile?.home_flag, homePoint: home, homeCurrency: homeCurrencyOf(profile), now, deviceZone }),
    hops, pins: mapPins(cards, home),
    credits: creditsOf([...cards.map((card) => card.cover), ...hops.map((hop) => hop.cover)]),
  };
}
