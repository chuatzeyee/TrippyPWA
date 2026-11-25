// One trip as its landing shows it (blueprint 2.4), and the parts both model builders share: the
// title rule, the places, the dates, the cost, the route line and the stops of today.
// Pure: `now`, the prefs, the profile, the ticks and the entry check are passed in, and nothing here
// reads the clock, storage or the network. Every result is a new object; no input is changed.
//
// Nothing is invented (blueprint 10): a flight has clock times only when its leg stores them, a
// route says "suggested" until its leg is booked, and a fact whose data is missing is left out.
import { formatCityList, formatClock, formatTempRange } from './locale.js';
import { isoToUtc, safeUrl, isBookedLeg, flightTimeLine, photoCreditText } from './trip-extras.js';
import { groundJourney, journeyMode, routeEnds } from './journey.js';
import { sortDayActivities, startMinutes } from './day-order.js';
import { tripStatus, zonedToday } from './trip-status.js';
import { readiness, reservationItems, summariseEntry, tripReadinessInput } from './readiness.js';
import { checklistKey, legacyChecklistKey, QUICK_KEYS } from './tick-keys.js';
import { costEstimate, costFigures, COST_BASIS_TEXT } from './money.js';
import { tripCurrencyCode } from './cost-sum.js';
import { heroCoverModel } from './cover-model.js';
import { cleanPoints, kmBetween } from './geo.js';
import { typicalWeather, weatherLabel } from './weather.js';
import { dayText, dateRangeText } from './travel-stats.js';

const DAY_MS = 86400000;
const DAY_COLOURS = 7;            // --day-1 to --day-7
const PHOTO_MAX = 4;
const LATER_MAX = 3;
const EVENING = 17 * 60;          // "tonight" starts at 5 PM
/** When a stop without a start time stops counting as ahead: the end of its part of the day. */
const SLOT_END = { morning: 12 * 60, afternoon: EVENING };
const PACE_WORDS = ['Relaxed', 'Easy', 'Balanced', 'Active', 'Packed'];
const STAY_WORDS = { hostel: 'Hostel', hotel: 'Hotel', boutique: 'Boutique stay', apartment: 'Apartment', resort: 'Resort', ryokan: 'Traditional stay' };
const APPROXIMATELY = /^(?:about|approx(?:imately)?\.?|around|roughly|circa|~)\s*/i;
const ACTIONS = {
  share: { label: 'Share', hint: 'Invite someone or copy a link', danger: false },
  pdf: { label: 'Export PDF', hint: 'A printable copy with photos', danger: false },
  edit: { label: 'Edit trip', hint: 'Move, change or remove stops', danger: false },
  tune: { label: 'Fine-tune', hint: 'Swap stops, see paid and free', danger: false },
  'read-view': { label: 'Reader view', hint: 'A plain page that is easy to read', danger: false },
  regenerate: { label: 'Regenerate trip', hint: 'Plan the days again from your answers', danger: false },
  delete: { label: 'Delete trip', hint: 'Remove this plan for good', danger: true },
};
/** The actions that are pages of their own: the last part of their address. */
const LINK_ACTIONS = { tune: 'tune', 'read-view': 'read' };

// The city of an airport, for a route stored as codes only when neither the home city nor the
// destination can stand beside the code (the profile summary can arrive after the first draw).
// Large hubs only; a code that is not here keeps the code as its name.
const AIRPORT_CITY = {
  SIN: 'Singapore', KUL: 'Kuala Lumpur', PEN: 'Penang', BKK: 'Bangkok', DMK: 'Bangkok', HKT: 'Phuket', CNX: 'Chiang Mai',
  HKG: 'Hong Kong', MFM: 'Macau', TPE: 'Taipei', ICN: 'Seoul', GMP: 'Seoul', PUS: 'Busan', NRT: 'Tokyo', HND: 'Tokyo',
  KIX: 'Osaka', CTS: 'Sapporo', FUK: 'Fukuoka', OKA: 'Okinawa', PVG: 'Shanghai', SHA: 'Shanghai', PEK: 'Beijing', PKX: 'Beijing',
  CAN: 'Guangzhou', MNL: 'Manila', CEB: 'Cebu', CGK: 'Jakarta', DPS: 'Bali', SGN: 'Ho Chi Minh City', HAN: 'Hanoi', DAD: 'Da Nang',
  DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha', IST: 'Istanbul', DEL: 'Delhi', BOM: 'Mumbai', CMB: 'Colombo',
  SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', PER: 'Perth', AKL: 'Auckland',
  LHR: 'London', LGW: 'London', CDG: 'Paris', FRA: 'Frankfurt', MUC: 'Munich', AMS: 'Amsterdam', ZRH: 'Zurich', GVA: 'Geneva',
  FCO: 'Rome', MXP: 'Milan', MAD: 'Madrid', BCN: 'Barcelona', LIS: 'Lisbon', OPO: 'Porto', HEL: 'Helsinki', CPH: 'Copenhagen',
  ARN: 'Stockholm', OSL: 'Oslo', BGO: 'Bergen', TOS: 'Tromsø', KEF: 'Reykjavik', VIE: 'Vienna', ATH: 'Athens', DUB: 'Dublin',
  JFK: 'New York', EWR: 'New York', LAX: 'Los Angeles', SFO: 'San Francisco', YVR: 'Vancouver', YYZ: 'Toronto',
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const rows = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim() : '');
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const dateOnly = (value) => (typeof value === 'string' && isoToUtc(value.slice(0, 10)) !== null ? value.slice(0, 10) : null);
const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const capitalise = (words) => words.charAt(0).toUpperCase() + words.slice(1);
const firstDestination = (trip) => (trip?.wizard_state?.multiCity ? trip.wizard_state.destinations?.[0] : trip?.wizard_state?.destination);
/** "A", "A and B", "A, B and C" */
const listText = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '');
/** Minutes after midnight as a clock time in the format the user chose. */
const clock = (minutes) => formatClock(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);

// --- Shared with the dashboard model ----------------------------------------------------------------

/** The places of a plan, from the wizard: every city of a multi-city plan, else the one destination. */
export function tripPlaces(trip) {
  const ws = trip?.wizard_state;
  return rows(ws?.multiCity ? ws.destinations : [ws?.destination]).filter((place) => text(place.name)).map((place) => ({
    name: text(place.name), country: text(place.country), flag: text(place.flag).toLowerCase(),
    lat: finite(place.lat), lng: finite(place.lng), timezone: text(place.timezone) || null,
  }));
}

/** The flags of those places: unique, two letters only. */
export const placeFlags = (places) => [...new Set(places.map((place) => place.flag).filter((flag) => /^[a-z]{2}$/.test(flag)))];

/** @returns {string} the one title rule for both screens: the cities of a multi-city plan, else the stored title */
export function displayTitle(trip) {
  const places = tripPlaces(trip);
  if (trip?.wizard_state?.multiCity && places.length) return formatCityList(places.map((place) => place.name));
  return text(trip?.title) || places[0]?.name || 'My trip';
}

/**
 * The dates of a plan. dayCount is the span of the dates when both are known, else the number of
 * itinerary rows (a plan with only a start date and no rows is one day long).
 */
export function tripDates(trip) {
  const start = dateOnly(trip?.start_date);
  const last = start ? dateOnly(trip?.end_date) : null;
  const end = last && last >= start ? last : null;
  const itineraryDays = rows(trip?.itinerary_days).length;
  const dayCount = end ? Math.round((isoToUtc(end) - isoToUtc(start)) / DAY_MS) + 1 : itineraryDays || (start ? 1 : 0);
  return { start, end, text: dateRangeText(start, end), dayCount, nights: Math.max(0, dayCount - 1), itineraryDays };
}

/** The home currency of the profile summary, or null when none is set. */
export const homeCurrencyOf = (profile) => (text(profile?.home_currency)
  ? { code: text(profile.home_currency).toUpperCase(), symbol: text(profile.home_currency_symbol) } : null);

/** The cost of some activities of a plan, per person; with a dayCount, set against the budget for those days. */
export function planCost(trip, activities, { profile, prefs, dayCount = 0 } = {}) {
  return costEstimate({
    activities, tripCode: tripCurrencyCode(trip), tripSymbol: text(firstDestination(trip)?.currencySymbol) || text(trip?.budget_currency_symbol),
    home: homeCurrencyOf(profile), homeFirst: prefs?.homeCurrencyFirst !== false, budgetDaily: trip?.budget_daily, dayCount,
  });
}

/** What readiness() takes as `entry`: an entry plan is reduced with this device's ticks, anything else passes through. */
export function entryInput(entry, ticks, tripId, homeFlag) {
  return isObject(entry) && Array.isArray(entry.countries) ? summariseEntry(entry, ticks?.entryDone, tripId, homeFlag ?? '') : entry ?? 'checking';
}

/** Minutes after midnight in a zone (the device's when `zone` is left out). */
export function zonedMinutes(now, zone) {
  const read = (timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  let parts;
  try { parts = read(zone || undefined); } catch { parts = read('UTC'); }
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value) || 0;
  return part('hour') * 60 + part('minute');
}

/**
 * The row of `days` that holds today for a live plan: the one tripStatus() points at (by date, else
 * by day number), unless that row is dated another day. A plan can have fewer rows than calendar
 * days, and the row with today's number may then belong to tomorrow.
 * @param {Array<{ date?: string|null }>} days   the rows tripStatus() was given
 * @param {{ dayIndex: number|null }|null} live  tripStatus().live
 * @param {string} today                         the date in the zone of the trip
 */
export function rowOfToday(days, live, today) {
  const row = live && live.dayIndex !== null ? days[live.dayIndex] : null;
  return row && (dateOnly(row.date) ?? today) === today ? row : null;
}

const stopLine = ({ activity, at }) => ({ time: at === null ? null : clock(at), title: text(activity.title), venue: text(activity.venue_name) || null });

/**
 * What is left of a day at `nowMinutes`. A timed stop is ahead until its start time has passed. A stop
 * without a time is ahead while it is listed after the last timed stop that has passed and its part
 * of the day has not ended; it is never the next stop. `tonight` is the last timed stop from 5 PM on.
 * @param {Array<object>} activities   the day's activity rows, in any order
 * @returns {{ nextStop: object|null, laterToday: object[], tonight: object|null, remainingToday: number }}
 *   StopLine values; laterToday holds at most three of the stops after the next one
 */
export function todayStops(activities, nowMinutes) {
  const { next, rest } = stopsAhead(activities, nowMinutes);
  const tonight = [...rest].reverse().find((stop) => stop.at !== null && stop.at >= EVENING);
  return {
    nextStop: next ? stopLine(next) : null,
    laterToday: rest.slice(0, LATER_MAX).map(stopLine),
    tonight: tonight ? stopLine(tonight) : null,
    remainingToday: rest.length + (next ? 1 : 0),
  };
}

/**
 * The one reading of a day for both screens: the next timed stop and every stop after it, by the
 * rule stated at todayStops(). The dashboard card counts them (remainingToday); the trip page lists
 * them (live.today.laterToday), so "N more after it" is the same figure on both at the same moment.
 */
function stopsAhead(activities, nowMinutes) {
  const stops = sortDayActivities(rows(activities)).map((activity) => ({ activity, at: startMinutes(activity.start_time) }));
  const passed = stops.reduce((last, stop, i) => (stop.at !== null && stop.at < nowMinutes ? i : last), -1);
  const ahead = stops.slice(passed + 1).filter(({ activity, at }) => at !== null || nowMinutes < (SLOT_END[activity.time_slot] ?? 24 * 60));
  const at = ahead.findIndex((stop) => stop.at !== null);
  return { next: at < 0 ? null : ahead[at], rest: at < 0 ? ahead : ahead.slice(at + 1) };
}

/**
 * Today on the trip page. laterToday is every stop after the next one, in order (the contract sets
 * no maximum here, unlike the dashboard's list of three): its length is the dashboard's
 * remainingToday less the next stop, and its last timed entry is the last stop of the day.
 * remainingToday and tonight are the dashboard card's own two values (todayStops), so a view can
 * print "7 more after it, the last at 6:45 PM" with the same figures on both screens.
 */
function tripToday(todayRow, nowMinutes) {
  const { next, rest } = stopsAhead(todayRow.activities, nowMinutes);
  const { tonight, remainingToday } = todayStops(todayRow.activities, nowMinutes);
  return { title: text(todayRow.title), nextStop: next ? stopLine(next) : null, laterToday: rest.map(stopLine), tonight, remainingToday };
}

const routeEnd = (code, label, note = '') => ({ code: code || null, label: text(label), note: text(note) });
// A stored route can leave a stray arrow or hyphen on a name ("Lisbon -"): never printed.
const tidy = (label) => text(label).replace(/^[\s>-]+|[\s>-]+$/g, '');
const clockIn = (value) => { const found = /\b\d{1,2}:\d{2}(?:\s?[ap]\.?m\b\.?)?/i.exec(text(value)); return found ? formatClock(found[0]) : ''; };

/**
 * The one-line route of a plan (blueprint 2.1). A multi-city plan runs from its first city to its
 * last; a stored journey gives a flight or a ground line for the leg out (the leg back, turned
 * round, when only that is stored); a plan in the home city with no journey is at home; anything
 * else falls back to the home city and the destination by name.
 * @param {{ extras?: object|null, places?: Array<{ name: string }>, homeCity?: string, sorted?: boolean }} input
 *   extras after normaliseTransportExtras(), null when no briefing has arrived; sorted is the wizard's
 *   "travel is already arranged" flag: such a flight is never called suggested
 * @returns {import('../views/contract.js').RouteLine}
 */
export function routeLine({ extras, places = [], homeCity = '', sorted = false } = {}) {
  const home = text(homeCity);
  const names = places.map((place) => place.name);
  const stored = isObject(extras?.transport) && (extras.transport.outbound || extras.transport.inbound) ? extras.transport : extras?.flights;
  const back = !isObject(stored?.outbound) && isObject(stored?.inbound);
  const leg = isObject(stored?.outbound) ? stored.outbound : back ? stored.inbound : null;
  const journey = leg ? groundJourney(extras) : null;
  const mode = journey ? journeyMode(journey) : 'plane';
  const base = { kind: 'none', mode: 'plane', from: routeEnd(null, home), to: routeEnd(null, names[0]), detail: '', booked: isBookedLeg(leg), times: null };
  if (names.length > 1) {
    const via = names.slice(1, -1);
    const detail = `${names.length} cities${via.length ? `, via ${listText(via)}` : ''}`;
    return { ...base, kind: 'multi', mode, from: routeEnd(null, names[0]), to: routeEnd(null, names[names.length - 1]), detail };
  }
  if (!leg) return home && sameName(home, names[0]) ? { ...base, kind: 'home', mode: 'car', from: routeEnd(null, names[0]), detail: 'At home' } : base;
  const ends = routeEnds(leg);
  const [from, to] = back ? [ends?.to, ends?.from] : [ends?.from, ends?.to];
  // A route stored as codes only has no city beside the code: the home city and the destination stand
  // in, then the city of the airport when it is a well-known one, and only then the code itself.
  const end = (found, fallback, note) => {
    const label = tidy(found?.label);
    const airport = Object.hasOwn(AIRPORT_CITY, found?.code ?? '') ? AIRPORT_CITY[found.code] : '';
    return routeEnd(found?.code, label && label !== found?.code ? label : fallback || airport || label, note);
  };
  const shown = journey ? journey.outbound || journey.inbound : leg;
  const time = flightTimeLine(shown.duration, journey ? [] : ends?.via).replace(APPROXIMATELY, '').replace(/[.\s]+$/, '');
  const [depart, arrive] = back ? ['', ''] : [clockIn(leg.depart), clockIn(leg.arrive)];
  return {
    ...base, kind: journey ? 'ground' : 'flight', mode,
    from: end(from, home, journey && !back ? shown.terminal : ''), to: end(to, names[0] ?? ''),
    detail: journey ? `${shown.operator || capitalise(mode)}${time ? `, about ${time}` : ''}`
      : base.booked || sorted ? time : time ? `${time}, suggested` : 'Suggested, not booked',
    times: depart && arrive ? { depart, arrive } : null,
  };
}

// --- The trip page ----------------------------------------------------------------------------------

/** Who may do what (blueprint 2.4); the same rule as actionAvailability() of the trip page. */
function actionsFor(trip, role, { hasDays, imported }) {
  const failed = trip.status === 'failed';
  const building = trip.status === 'generating';
  const canEdit = role !== 'viewer';
  const can = {
    share: canEdit && hasDays && !failed, pdf: hasDays && !failed, edit: canEdit && hasDays && !failed && !building,
    tune: canEdit && hasDays && !failed && !building, 'read-view': hasDays,
    regenerate: role === 'owner' && !failed && !building && !imported, delete: role === 'owner',
  };
  return Object.keys(ACTIONS).filter((key) => can[key])
    .map((key) => ({ key, ...ACTIONS[key], href: LINK_ACTIONS[key] ? `#/trip/${encodeURIComponent(text(trip.id))}/${LINK_ACTIONS[key]}` : '' }));
}

/** The day rows of a plan in day order, each with its stops in the order of the day. New objects. */
const planDays = (trip) => [...rows(trip?.itinerary_days)].sort((a, b) => (Number(a.day_number) || 0) - (Number(b.day_number) || 0))
  .map((day) => ({ ...day, activities: sortDayActivities(rows(day.activities)) }));

/** The activities of a day whose stored photo can be shown, at most four. */
const shownPhotos = (day) => day.activities.filter((activity) => safeUrl(activity.photo_url)).slice(0, PHOTO_MAX);

function dayRow(trip, day, index, { showPhotos, money, isToday }) {
  const date = dateOnly(day.date) ?? '';
  const times = day.activities.map((activity) => startMinutes(activity.start_time)).filter((minutes) => minutes !== null);
  const photos = showPhotos ? shownPhotos(day).map((activity) => ({ src: safeUrl(activity.photo_url), alt: text(activity.title) || text(activity.venue_name) })) : [];
  const range = isObject(day.weather) ? formatTempRange(day.weather.lowC, day.weather.highC) : '';
  return {
    index, dayNumber: Number(day.day_number) || index + 1, date, dateText: dayText(date), title: text(day.title), theme: text(day.theme),
    stops: day.activities.length, cost: planCost(trip, day.activities, money),
    weather: range ? { range, condition: weatherLabel(day.weather.condition) } : null,
    colorIndex: (index % DAY_COLOURS) + 1, thumb: photos[0] ?? null, photos,
    firstTime: times.length ? clock(Math.min(...times)) : null, lastTime: times.length ? clock(Math.max(...times)) : null, isToday,
  };
}

/** Stops with coordinates that can be believed: finite, not (0, 0) and within reach of the plan's places. */
function mapPoints(days, places) {
  const points = days.flatMap((day, dayIndex) => day.activities.map((activity, at) => ({
    lat: activity.latitude, lng: activity.longitude, dayNumber: Number(day.day_number) || dayIndex + 1, dayIndex, order: at + 1,
    title: text(activity.title), colorIndex: (dayIndex % DAY_COLOURS) + 1,
  })));
  return cleanPoints(points, places.filter((place) => place.lat !== null && place.lng !== null));
}

/** The areas of extras.towns that belong to a day of the plan, as the Discover tab lists them. */
function areasOf(extras, days, showPhotos) {
  const numbers = new Set(days.map((day) => Number(day.day_number)));
  return rows(extras?.towns).flatMap((group) => rows(group.towns))
    .filter((town) => text(town.name) && rows(town.days).some((entry) => numbers.has(Number(entry.dayNumber))))
    .map((town) => ({ name: text(town.name), photo: showPhotos ? safeUrl(town.photo) : '', stops: Number(town.activityCount) || 0 }));
}

// The cover and every photo handed out, each credit once. A photo with no stored credit has no line.
function creditsOf(cover, activities, stored) {
  const lines = [
    cover.credit ? { label: cover.credit.chip, full: cover.credit.full, link: cover.credit.link } : null,
    ...activities.map((activity) => stored?.[activity.id]).filter(isObject)
      .map((credit) => ({ label: text(credit.via) || 'Photo credit', full: photoCreditText(credit), link: safeUrl(credit.link) })),
  ].filter((line) => line && line.full);
  return lines.filter((line, at) => lines.findIndex((other) => other.full === line.full && other.link === line.link) === at);
}

// The stay by name once it is known: a booked one, or the one entry of a stay arranged before planning.
function stayFact(ws, extras, arranged) {
  const stays = rows(extras?.accommodation).filter((stay) => text(stay.name));
  const booked = arranged && stays.length === 1 ? stays : stays.filter((stay) => stay.booked || text(stay.bookingRef));
  if (booked.length) return { value: text(booked[0].name), note: booked.length > 1 ? `and ${booked.length - 1} more` : '' };
  const type = ws?.accommodation?.type;
  if (!Object.hasOwn(STAY_WORDS, type ?? '')) return null;
  const stars = Number(ws.accommodation.stars);
  return { value: type === 'hotel' && stars >= 1 && stars <= 5 ? `${stars}-star hotel` : STAY_WORDS[type], note: '' };
}

/**
 * The facts under the title. Each is there only when its data is. While the plan is live the facts
 * do not lead with "Ready": readiness is then one collapsed line below them (blueprint 7.3,
 * readiness.collapsed), and stating it twice put "1 of 4, 3 things left" first on day 10 of 12.
 * The stops fact counts every stop of the plan, placed on the map or not: the one count of stops.
 */
function glanceOf({ ready, stops, dayRows, cost, weather, ws, extras, arranged }) {
  const fact = (key, label, value, note = '', jump = '') => ({ key, label, value, note, jump });
  const figures = costFigures(cost);
  const stay = stayFact(ws, extras, arranged);
  const left = ready && (ready.todo ? `${plural(ready.todo, 'thing')} left` : ready.pending ? 'Checking entry requirements' : 'Nothing left to do');
  return [
    ready && !ready.collapsed && fact('ready', 'Ready', `${ready.done} of ${ready.total}`, left, 'readiness'),
    stops > 0 && fact('stops', 'Stops', String(stops), `about ${Math.max(1, Math.round(stops / dayRows))} a day`),
    figures.lead && fact('cost', 'Estimated cost', figures.lead, `${COST_BASIS_TEXT}${figures.other ? `. ${capitalise(figures.other)}` : ''}`, 'spending'),
    weather && fact('weather', 'Typical weather', weather.range, [weather.condition, weather.season].filter(Boolean).join(', ')),
    PACE_WORDS[Number(ws?.style?.pace) - 1] && fact('pace', 'Pace', PACE_WORDS[Number(ws.style.pace) - 1]),
    stay && fact('stay', 'Stay', stay.value, stay.note, 'accommodation'),
  ].filter(Boolean);
}

/**
 * @param {object} input
 * @param {object} input.trip                 a full trips row with wizard_state, extras and itinerary_days(activities)
 * @param {Date|string|number} input.now      required; rebuild with a fresh one to move "next stop" on
 * @param {string} [input.deviceZone]         the zone of the device (tests pass it)
 * @param {object} [input.prefs]              getPrefs(): homeCurrencyFirst and showVenuePhotos are read here
 * @param {object|null} [input.profile]       the profile summary: home city, flag and currency
 * @param {{ quick?: object, checklist?: object, entryDone?: object }} [input.ticks]   readTicks(trip.id)
 * @param {*} [input.entry]                   'checking' (also when left out), { reason }, an entryPlan() result or a summariseEntry() result
 * @param {string|null} [input.userId]        the signed-in user; the owner of the row gets the owner's actions
 * @param {'editor'|'viewer'|null} [input.role]   the role on someone else's plan; anything else reads as viewer
 * @param {boolean} [input.stale]             the row is the copy saved on this device, saved at `cachedAt`
 * @param {string|null} [input.cachedAt]
 * @param {(iso2: string) => string} [input.countryName]   names a passport in the entry detail
 * @returns {import('../views/contract.js').TripOverviewModel}
 */
export function buildTripOverviewModel({ trip, now, deviceZone, prefs, profile, ticks, entry, userId, role, stale, cachedAt, countryName } = {}) {
  const row = isObject(trip) ? trip : {};
  const ws = isObject(row.wizard_state) ? row.wizard_state : {};
  const showPhotos = prefs?.showVenuePhotos !== false;
  const money = { profile, prefs };
  const days = planDays(row);
  const activities = days.flatMap((day) => day.activities);
  const status = row.status === 'generating' || row.status === 'failed' ? row.status : days.length ? 'ok' : 'empty';
  const stand = tripStatus(row, days, now, deviceZone);
  const places = tripPlaces(row);
  const dates = tripDates(row);
  const title = displayTitle(row);
  const cover = heroCoverModel(row);
  const cost = planCost(row, activities, { ...money, dayCount: dates.dayCount });
  const weather = typicalWeather(days, dates.start);
  const ready = tripReadinessInput(row, {
    status, phase: stand.phase, now, deviceZone, ticks, homeCity: profile?.home_city, countryName, entry: entryInput(entry, ticks, row.id, profile?.home_flag),
  });
  const readinessNow = readiness(ready);
  const todayRow = rowOfToday(days, stand.live, zonedToday(now, stand.zone, deviceZone));
  const areas = areasOf(row.extras, days, showPhotos);
  const tips = rows(row.extras?.savingsTips).filter((tip) => text(tip.title) || text(tip.description));
  const who = row.user_id && row.user_id === userId ? 'owner' : role === 'editor' ? 'editor' : 'viewer';
  const imported = ws.imported === true;
  const onlyPlace = places.length === 1 && !sameName(title, places[0].name) ? places[0] : null;
  return {
    id: text(row.id), title,
    placeLine: !onlyPlace ? '' : onlyPlace.country && !sameName(onlyPlace.country, onlyPlace.name) ? `${onlyPlace.name}, ${onlyPlace.country}` : onlyPlace.name,
    flags: placeFlags(places), status, phase: stand.phase, statusText: stand.text, daysToGo: stand.daysToGo,
    live: stand.live ? {
      dayNumber: stand.live.dayNumber, dayCount: stand.live.dayCount, dayIndex: stand.live.dayIndex,
      today: todayRow ? tripToday(todayRow, zonedMinutes(now, stand.zone)) : null,
    } : null,
    dates, travellers: finite(row.travelers), cover,
    route: routeLine({ extras: ready.extras, places, homeCity: profile?.home_city, sorted: ready.settled.flights }),
    glance: glanceOf({
      ready: readinessNow, stops: activities.length, dayRows: days.length, cost, weather, ws, extras: ready.extras, arranged: ready.settled.accommodation,
    }),
    readiness: readinessNow,
    days: days.map((day, index) => dayRow(row, day, index, { showPhotos, money, isToday: day === todayRow })),
    map: { points: mapPoints(days, places), dayCount: days.length },
    brief: {
      pace: PACE_WORDS[Number(ws.style?.pace) - 1] ?? '', interests: (Array.isArray(ws.style?.activities) ? ws.style.activities : []).map(text).filter(Boolean),
      areaCount: areas.length, firstArea: areas[0]?.name ?? '', lastArea: areas[areas.length - 1]?.name ?? '',
    },
    cost, areas,
    tips: { shown: tips.slice(0, 2).map((tip) => ({ title: text(tip.title), text: text(tip.description), saving: text(tip.estimatedSaving) })), total: tips.length },
    actions: actionsFor(row, who, { hasDays: days.length > 0, imported }),
    role: who, imported, offline: stale ? { savedAt: cachedAt ?? null } : null,
    credits: creditsOf(cover, showPhotos ? days.flatMap(shownPhotos) : [], row.extras?.photoCredits),
  };
}

// --- The day panel ----------------------------------------------------------------------------------

/** A stop belongs to the nearest area within this distance (the rule of the area labels between stops). */
const AREA_MAX_KM = 2;
/** A checklist label and a stop are the same thing only when the shorter name has at least this many letters. */
const NAME_MIN = 4;

/** The areas of a day in the order its stops reach them, each once; without a placed stop, the areas the plan lists for the day. */
function dayAreas(day, extras) {
  const towns = rows(extras?.towns).flatMap((group) => rows(group.towns)).filter((town) => text(town.name));
  const cells = towns.flatMap((town) => (Array.isArray(town.cells) ? town.cells : []).filter((cell) => Array.isArray(cell) && cell.length === 2)
    .map((cell) => ({ at: cell, name: text(town.name) })));
  const reached = cleanPoints(day.activities).map((activity) => cells
    .map((cell) => ({ name: cell.name, km: kmBetween(activity, cell.at) }))
    .filter((cell) => cell.km < AREA_MAX_KM).sort((a, b) => a.km - b.km)[0]?.name).filter(Boolean);
  const listed = towns.filter((town) => rows(town.days).some((entry) => Number(entry.dayNumber) === Number(day.day_number))).map((town) => text(town.name));
  return [...new Set(reached.length ? reached : listed)];
}

/** Whether a checklist entry is for this day: by its day number, else by a stop of the day named in its label. */
function isForDay(entry, day) {
  const number = Number(entry.day);
  if (Number.isInteger(number) && number >= 1) return number === Number(day.day_number);
  const label = text(entry.label).toLowerCase();
  return day.activities.flatMap((activity) => [text(activity.title), text(activity.venue_name)]).map((name) => name.toLowerCase())
    .some((name) => name.length >= NAME_MIN && label.length >= NAME_MIN && (label.includes(name) || name.includes(label)));
}

/**
 * What to book for a day, from extras.bookingChecklist, with the ticks of this device. The new tick
 * key decides once it was ever written, else the key saved before it existed (the rule of the
 * checklist itself); the one "Reservations" tick of Trip prep books every item readiness counts.
 */
function dayBookings(day, extras, ticks) {
  const stored = isObject(ticks?.checklist) ? ticks.checklist : {};
  const allBooked = Boolean(isObject(ticks?.quick) && ticks.quick[QUICK_KEYS.reservations]);
  const counted = new Set(reservationItems(extras?.bookingChecklist).map((entry) => entry.item));
  return rows(extras?.bookingChecklist).flatMap((group) => rows(group.items).filter((entry) => text(entry.label) && isForDay(entry, day)).map((entry) => {
    const key = checklistKey(group.group, entry);
    const ticked = Object.hasOwn(stored, key) ? Boolean(stored[key]) : Boolean(stored[legacyChecklistKey(entry)]);
    return { label: text(entry.label), booked: ticked || (allBooked && counted.has(entry)) };
  }));
}

/**
 * The panel beside the stops of one open day: its stops on a small map, the facts of the day, what
 * to book for it and the stops as a list. For that day only; nothing here is about the plan.
 * @param {object} [input]
 * @param {object} input.day       the itinerary day row, its activities in the order of the day
 * @param {import('../views/contract.js').DayIndexRow} input.row   the row of the same day in model.days
 * @param {Array<import('../views/contract.js').MapPoint>} [input.points]   model.map.points (every day)
 * @param {object|null} [input.extras]   trip.extras: towns and bookingChecklist are read
 * @param {{ quick?: object, checklist?: object }} [input.ticks]   readTicks(trip.id)
 * @returns {import('../views/contract.js').DayAsideModel|null} null for a day without stops
 */
export function dayAsideModel({ day, row, points, extras, ticks } = {}) {
  if (!isObject(day) || !isObject(row)) return null;
  const stops = rows(day.activities);
  if (!stops.length) return null;
  const placed = rows(points).filter((point) => point.dayIndex === row.index);
  return {
    index: row.index, dayNumber: row.dayNumber, colorIndex: row.colorIndex,
    map: placed.length ? { points: placed, placed: placed.length, total: stops.length } : null,
    stops: stops.length, firstTime: row.firstTime ?? null, lastTime: row.lastTime ?? null, cost: row.cost ?? null, weather: row.weather ?? null,
    areas: dayAreas({ ...day, activities: stops }, extras),
    book: dayBookings({ ...day, activities: stops }, extras, ticks),
    list: stops.map((activity, at) => {
      const minutes = startMinutes(activity.start_time);
      return { id: text(activity.id), at, number: at + 1, time: minutes === null ? '' : clock(minutes), title: text(activity.title) || text(activity.venue_name) };
    }),
  };
}

/**
 * The day panels of a plan, one for each row of model.days (null for a day without stops).
 * @param {{ trip?: object, model?: import('../views/contract.js').TripOverviewModel, ticks?: object }} [input]
 *   the trip the model was built from, and readTicks(trip.id)
 * @returns {Array<import('../views/contract.js').DayAsideModel|null>}
 */
export function dayAsideModels({ trip, model, ticks } = {}) {
  const days = planDays(trip);
  return rows(model?.days).map((row) => dayAsideModel({ day: days[row.index], row, points: model.map?.points, extras: trip?.extras, ticks }));
}
