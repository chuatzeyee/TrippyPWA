// The one readiness rule (blueprint 2.2 and 7.3): what is still to arrange before a plan starts.
// Used by the dashboard, the trip landing and the Prep card, so the three always show one count.
// Pure: `now`, the ticks and the entry check are passed in; nothing here reads the clock, storage
// or the network. Each area is one decision table, read top to bottom: the first row that matches
// decides. The rules it builds on (booked legs, stay dates, ground journeys, entry rows, tick keys)
// live in the modules imported below and are not repeated here.
import { groundJourney, normaliseTransportExtras } from './journey.js';
import { isBookedLeg, stayInfo, deadlineInfo, sortChecklistItems, flightTimeLine, isoToUtc } from './trip-extras.js';
import { mergeRows, needsHaveTick, entryHaveKey, entryDoneKey, visaLine, timingLine } from './entry-rules.js';
import { checklistKey, legacyChecklistKey, QUICK_KEYS } from './tick-keys.js';
import { hasEntryCard } from './trip-shape.js';
import { zonedToday } from './trip-status.js';

const AREAS = {
  flights: { area: 'travel', target: 'flights', label: 'Flights', actionLabel: 'See flights', tickKey: QUICK_KEYS.flights },
  transport: { area: 'travel', target: 'transport', label: 'Transport', actionLabel: 'See transport', tickKey: QUICK_KEYS.transport },
  stay: { area: 'stay', target: 'accommodation', label: 'Stay', actionLabel: 'See stays', tickKey: QUICK_KEYS.accommodation },
  entry: { area: 'entry', target: 'entry', label: 'Entry requirements', actionLabel: 'See the details', tickKey: null },
  reservations: { area: 'reservations', target: 'checklist', label: 'Reservations', actionLabel: 'Open the checklist', tickKey: QUICK_KEYS.reservations },
};
/** Statuses of a plan that has nothing to get ready yet. */
const NOT_PLANNED = new Set(['generating', 'failed', 'empty']);
/** Nothing is booked ahead for these. */
const DRIVEN = new Set(['car', 'taxi']);
const TICKED = 'Marked as booked on this device';
const SORTED_DETAIL = 'Already arranged, as you said when planning.';
const VEHICLE_WORD = /\b(?:bus|coach|train|rail|railway|ferry|boat|car|taxi|shuttle)\b/i;
const APPROXIMATELY = /^(?:about|approx(?:imately)?\.?|around|roughly|circa|~)\s*/i;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
/** A saved tick: the store's own key, set to something truthy. */
const isOn = (store, key) => owns(store, key) && Boolean(store[key]);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim() : '');
const sentence = (words) => (words ? `${words.replace(/[.\s]+$/, '')}.` : '');
const capitalise = (words) => words.charAt(0).toUpperCase() + words.slice(1);
const lowerFirst = (words) => words.charAt(0).toLowerCase() + words.slice(1);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "A", "A and B", "A, B and C"; past `max` names the rest become "2 more". */
function listText(names, max = Infinity) {
  const list = names.filter(Boolean);
  const shown = list.length > max ? [...list.slice(0, max), `${list.length - max} more`] : list;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] || '';
}

/** "Tue 2 Mar" for a 'YYYY-MM-DD' date, '' for anything else. */
function dayText(iso) {
  const time = isoToUtc(iso);
  if (time === null) return '';
  const date = new Date(time);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** The date on the device as a Date that deadlineInfo() reads the same on any machine. */
function deviceDate(now, deviceZone) {
  const [year, month, day] = zonedToday(now, deviceZone, deviceZone).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The earliest real date among `dates` as a due date, or null. */
function dueOf(dates, today) {
  const by = dates.filter((date) => isoToUtc(date) !== null).sort()[0];
  return by ? { by, text: `by ${dayText(by)}`, state: deadlineInfo(by, today).state } : null;
}

const item = (kind, state, status, detail, over = {}) => ({ ...AREAS[kind], state, status, detail, source: 'data', due: null, ...over });
/** One evaluated area: its row, and whether a tick decided its state or could still change it. */
const settledByData = (row) => ({ item: row, perDevice: false });
const settledByTicks = (row) => ({ item: row, perDevice: true });

// --- Travel -----------------------------------------------------------------------------------------

// The legs as stored, from the place groundJourney() reads them: transport, else flights.
function storedLegs(extras) {
  const transport = extras.transport;
  const source = isObject(transport) && (transport.outbound || transport.inbound) ? transport : extras.flights;
  return [['out', source?.outbound], ['back', source?.inbound]].filter(([, leg]) => isObject(leg)).map(([way, leg]) => ({ way, leg }));
}

const durationText = (value) => flightTimeLine(value).replace(APPROXIMATELY, '').replace(/[.\s]+$/, '');
const flightNumbers = (legs) => legs.map(({ way, leg }) => (text(leg.flightNumber) ? `${text(leg.flightNumber)} ${way}` : '')).filter(Boolean);

function suggestedFlights(legs) {
  const numbers = flightNumbers(legs);
  const [out, back] = ['out', 'back'].map((way) => durationText(legs.find((leg) => leg.way === way)?.leg.duration));
  const times = legs.length === 1 ? out || back
    : out && back ? (out === back ? `${out} each way` : `${out} out and ${back} back`)
      : out ? `${out} out` : back ? `${back} back` : '';
  return `${numbers.length ? `Suggested ${numbers.join(' and ')}` : 'Suggested flights'}${times ? `, about ${times}` : ''}.`;
}

function bookedFlights(legs) {
  const numbers = flightNumbers(legs);
  return numbers.length ? `${numbers.join(' and ')}.` : legs.length > 1 ? 'Both flights are booked.' : 'Your flight is booked.';
}

function groundTrip(journey) {
  const leg = journey.outbound || journey.inbound;
  const lead = !leg.operator ? capitalise(leg.mode) : VEHICLE_WORD.test(leg.operator) ? leg.operator : `${leg.operator} ${leg.mode}`;
  const time = durationText(leg.duration);
  return `${lead}${time ? `, about ${time}` : ''}.`;
}

function openLeg(legs, isGround) {
  const open = legs.find(({ leg }) => !isBookedLeg(leg));
  const which = open.way === 'out' ? 'Outbound' : 'Return';
  if (isGround) return `${which} journey still to arrange.`;
  const number = text(open.leg.flightNumber);
  return `${which} flight still to book${number ? `, suggested ${number}` : ''}.`;
}

function travelArea({ extras, settled, quick }) {
  const journey = groundJourney(extras);
  const kind = journey ? 'transport' : 'flights';
  const legs = storedLegs(extras);
  if (!legs.length && !settled.flights) return null;                                                       // row 1
  if (journey && [journey.outbound, journey.inbound].filter(Boolean).every((leg) => DRIVEN.has(leg.mode))) return null;   // row 2
  const about = journey ? groundTrip(journey) : legs.length ? suggestedFlights(legs) : '';
  const booked = legs.filter(({ leg }) => isBookedLeg(leg)).length;
  if (legs.length && booked === legs.length) return settledByData(item(kind, 'done', 'Booked', journey ? about : bookedFlights(legs)));   // row 3
  if (booked) return settledByData(item(kind, 'todo', `${booked} of ${legs.length} legs booked`, openLeg(legs, Boolean(journey)), { tickKey: null }));   // row 4
  if (settled.flights) return settledByData(item(kind, 'done', 'Sorted', SORTED_DETAIL));                 // row 5
  if (isOn(quick, AREAS[kind].tickKey)) return settledByTicks(item(kind, 'done', TICKED, about, { source: 'device' }));   // row 6
  return settledByTicks(item(kind, 'todo', journey ? 'Not arranged yet' : 'Not booked yet', about));       // row 7
}

// --- Stay -------------------------------------------------------------------------------------------

const hasStayDates = (entry) => Boolean(entry.checkIn || entry.checkOut);
const isBookedStay = (entry) => Boolean(entry.booked || text(entry.bookingRef));
const placed = (entry) => `${text(entry.name)}${text(entry.area) ? ` in ${text(entry.area)}` : ''}`;

/**
 * The stay entries grouped the way the Stay card shows them. When any entry carries a check-in or
 * a check-out date the entries are a sequence of stays (an imported plan) and each is its own
 * group. Otherwise the planner's alternatives are grouped by city; with at most one city named
 * they are all alternatives for one stay; with several, entries without a city form one more group.
 * @param {Array<object>} accommodation   extras.accommodation
 * @returns {Array<Array<object>>} the same entry objects, never changed
 */
export function stayGroups(accommodation) {
  const entries = Array.isArray(accommodation) ? accommodation.filter(isObject) : [];
  if (entries.some(hasStayDates)) return entries.map((entry) => [entry]);
  const cities = [...new Set(entries.map((entry) => text(entry.city)).filter(Boolean))];
  if (cities.length <= 1) return entries.length ? [entries] : [];
  const unnamed = entries.filter((entry) => !text(entry.city));
  return [...cities.map((city) => entries.filter((entry) => text(entry.city) === city)), ...(unnamed.length ? [unnamed] : [])];
}

function stayOptions(groups, isSequence) {
  const entries = groups.flat();
  if (!entries.length) return '';
  const first = text(entries[0].name);
  if (isSequence && groups.length > 1) return sentence(`${groups.length} stays to book${first ? `, starting with ${first}` : ''}`);
  if (groups.length > 1) return sentence(`Options to compare in ${listText(groups.map((group) => text(group[0].city)), 3)}`);
  if (entries.length === 1) return first ? `${placed(entries[0])} is the suggested stay.` : '1 option to look at.';
  const pick = entries.find((entry) => /recommended/i.test(text(entry.badge)) && text(entry.name));
  return `${entries.length} options to compare.${pick ? ` ${placed(pick)} is the recommended pick.` : ''}`;
}

function bookedStays(groups) {
  const booked = groups.map((group) => group.find(isBookedStay));
  if (booked.length > 1) return sentence(listText(booked.map((entry) => text(entry.name)), 3));
  const nights = stayInfo(booked[0].checkIn, booked[0].checkOut)?.nights;
  return sentence(`${text(booked[0].name)}${nights ? `, ${plural(nights, 'night')}` : ''}`);
}

const isHomeCityPlan = (destinations, homeCity) => Array.isArray(destinations) && destinations.length === 1
  && text(homeCity) !== '' && text(destinations[0]?.name).toLowerCase() === text(homeCity).toLowerCase();

function stayArea({ extras, settled, quick, destinations, homeCity }) {
  const groups = stayGroups(extras.accommodation);
  if (!groups.length && !settled.accommodation) return null;                                               // row 1
  const booked = groups.filter((group) => group.some(isBookedStay));
  const ticked = isOn(quick, AREAS.stay.tickKey);
  if (isHomeCityPlan(destinations, homeCity) && !booked.length && !settled.accommodation && !ticked) return null;   // row 2
  const isSequence = groups.some((group) => hasStayDates(group[0]));
  const open = groups.filter((group) => !group.some(isBookedStay));
  const compare = open.some((group) => group.length > 1) ? { actionLabel: 'Compare stays' } : {};
  if (groups.length && booked.length === groups.length) {                                                  // row 3
    const status = groups.length === 1 ? 'Booked' : groups.length === 2 ? 'Both stays booked' : `All ${groups.length} stays booked`;
    return settledByData(item('stay', 'done', status, bookedStays(groups)));
  }
  if (booked.length) {                                                                                     // row 4
    const names = open.map((group) => (isSequence ? '' : text(group[0].city)) || text(group[0].name) || 'one more stay');
    return settledByData(item('stay', 'todo', `${booked.length} of ${groups.length} stays booked`, `Still open: ${listText(names, 3)}.`, { ...compare, tickKey: null }));
  }
  if (settled.accommodation) {                                                                             // row 5
    const only = groups.length === 1 && groups[0].length === 1 ? text(groups[0][0].name) : '';
    return settledByData(item('stay', 'done', 'Sorted', only ? `${only}, already arranged.` : SORTED_DETAIL));
  }
  const about = stayOptions(groups, isSequence);
  if (ticked) return settledByTicks(item('stay', 'done', TICKED, about, { source: 'device' }));            // row 6
  return settledByTicks(item('stay', 'todo', 'None booked', about, compare));                              // row 7
}

// --- Entry requirements -----------------------------------------------------------------------------

/**
 * What the readiness rule needs from an entry plan (entryPlan() in the entry advisor) and the
 * ticks of `entry-done-<tripId>`. Rows are the card's rows: merged with mergeRows(), countries
 * that are only passed through left out.
 * @param {{ passports: string[], countries: Array<object>, checked?: boolean }|null} plan
 * @param {Object<string, boolean>} entryDone   readTicks(tripId).entryDone
 * @param {string} tripId
 * @param {string} [homeFlag]   the profile's home country; without it the area is never hidden
 * @returns {{ reason: 'failed' }|{ checked: boolean, passports: string[], hidden: boolean,
 *   rows: Array<{ iso2: string, role: string, passports: string[], visa: object|null, items: object[] }>,
 *   restricted: boolean, required: number,
 *   open: Array<{ key: string, name: string, iso2: string, by: string|null, item: object }>,
 *   haveNeeded: number, haveOpen: Array<{ key: string, iso2: string, passports: string[], line: string }> }}
 *   `{ reason: 'failed' }` when there is no plan to read. `hidden`: the entry card would hide itself.
 *   `open`: required items not ticked. `haveOpen`: rows that need an "I have this" tick and have none.
 */
export function summariseEntry(plan, entryDone, tripId, homeFlag = '') {
  if (!isObject(plan) || !Array.isArray(plan.passports) || !Array.isArray(plan.countries)) return { reason: 'failed' };
  const done = isObject(entryDone) ? entryDone : {};
  const passports = plan.passports.map((passport) => String(passport).toUpperCase());
  const home = String(homeFlag || '').toUpperCase();
  const rows = plan.countries
    .filter((country) => isObject(country) && country.role !== 'transit' && Array.isArray(country.rows))
    .flatMap((country) => mergeRows(country.rows.filter(isObject).map((row) => ({ ...row, items: Array.isArray(row.items) ? row.items.filter(isObject) : [] })))
      .map((row) => ({ iso2: country.iso2, role: country.role, passports: row.passports, visa: row.visa ?? null, items: row.items })));
  const required = rows.flatMap((row) => row.items.filter((entryItem) => entryItem.required).map((entryItem) => ({
    key: entryDoneKey(tripId, row.iso2, row.passports, entryItem.id), name: text(entryItem.name), iso2: row.iso2, by: entryItem.dates?.by ?? null, item: entryItem,
  })));
  const have = rows.filter((row) => needsHaveTick(row))
    .map((row) => ({ key: entryHaveKey(tripId, row.iso2, row.passports), iso2: row.iso2, passports: row.passports, line: visaLine(row.visa) }));
  return {
    checked: plan.checked !== false,
    passports,
    hidden: plan.countries.length === 0 && passports.every((passport) => passport === home),
    rows,
    restricted: rows.some((row) => row.visa?.code === 'na'),
    required: required.length, open: required.filter((entryItem) => !isOn(done, entryItem.key)),
    haveNeeded: have.length, haveOpen: have.filter((row) => !isOn(done, row.key)),
  };
}

function passportsLabel(codes, countryName) {
  const lookup = typeof countryName === 'function' ? countryName : () => '';
  const names = codes.map((code) => text(lookup(code)) || code);
  return `${listText(names)} passport${names.length > 1 ? 's' : ''}`;
}

function entryArea({ destinations, entry, today, countryName }) {
  if (!Array.isArray(destinations) || destinations.length === 0) return null;                              // row 1
  const row = (state, status, detail, over) => item('entry', state, status, detail, over);
  if (entry === undefined || entry === null || entry === 'checking') return settledByData(row('checking', 'Checking', ''));   // row 2
  if (entry.reason === 'no-passport' || (!entry.reason && Array.isArray(entry.passports) && entry.passports.length === 0)) {   // row 3
    return settledByData(row('todo', 'Add your passport', 'Trippy needs your passport to check visas and arrival cards.', { actionLabel: 'Add passport' }));
  }
  if (entry.reason || entry.checked === false || ![entry.rows, entry.open, entry.haveOpen].every(Array.isArray)) {   // row 4
    return settledByData(row('todo', 'Could not check', 'The entry rules could not be loaded. Check the official immigration sites.'));
  }
  if (entry.hidden) return null;                                                                           // row 5
  const restricted = entry.rows.find((entryRow) => entryRow.visa?.code === 'na');
  if (restricted) {                                                                                        // row 6
    const who = passportsLabel(restricted.passports, countryName);
    return settledByData(row('todo', visaLine(restricted.visa), `${who}: check the official immigration site before you book anything.`));
  }
  if (entry.open.length) {                                                                                 // row 7
    const [first] = entry.open;
    const one = entry.open.length === 1;
    const status = one && first.name ? first.name : `${plural(entry.open.length, 'thing')} to do`;
    const detail = one ? sentence(timingLine(first.item)) || 'Required before you travel.' : sentence(listText(entry.open.map((open) => open.name), 2));
    return settledByTicks(row('todo', status, detail, { due: dueOf(entry.open.map((open) => open.by), today) }));
  }
  if (entry.haveOpen.length) {                                                                             // row 8
    return settledByTicks(row('todo', entry.haveOpen[0].line, 'Tick "I have this" on the entry card once you have it.'));
  }
  if (entry.required + entry.haveNeeded > 0) {                                                             // row 9, settled by ticks
    return settledByTicks(row('done', 'All done', 'Everything required for entry is ticked off.', { source: 'device' }));
  }
  const clear = entry.rows.find((entryRow) => visaLine(entryRow.visa));                                    // row 9, nothing was needed
  return settledByData(row('done', 'Nothing to file', clear
    ? `${passportsLabel(clear.passports, countryName)}: ${lowerFirst(visaLine(clear.visa))}.`
    : 'Nothing to prepare for entry with these passports.'));
}

// --- Reservations -----------------------------------------------------------------------------------

/**
 * The checklist items that count as reservations: those of every group whose name contains
 * "must", or of all groups when none does. Each comes with the name of its group (the tick key
 * needs it), in the order the checklist shows them.
 * @param {Array<{ group: string, items: Array<object> }>} checklist   extras.bookingChecklist
 * @returns {Array<{ group: string, item: object }>}
 */
export function reservationItems(checklist) {
  const groups = (Array.isArray(checklist) ? checklist : []).filter((group) => isObject(group) && Array.isArray(group.items));
  const must = groups.filter((group) => /must/i.test(text(group.group)));
  return (must.length ? must : groups)
    .flatMap((group) => sortChecklistItems(group.items.filter(isObject)).map((entry) => ({ group: group.group, item: entry })));
}

// The new key decides when it was ever written (false too); else the key saved before it existed.
function isTicked(checklist, { group, item: entry }) {
  const key = checklistKey(group, entry);
  if (owns(checklist, key)) return Boolean(checklist[key]);
  return isOn(checklist, legacyChecklistKey(entry));
}

function dayNote(entry, days) {
  const day = Number(entry.day);
  if (!Number.isInteger(day) || day < 1) return '';
  const stored = days.find((dayRow) => Number(dayRow?.day_number) === day)?.date;
  const date = typeof stored === 'string' ? dayText(stored.slice(0, 10)) : '';
  return ` (for day ${day}${date ? `, ${date}` : ''})`;
}

function reservationsArea({ extras, quick, checklist, days, today }) {
  const entries = reservationItems(extras.bookingChecklist);
  if (!entries.length) return null;                                                                        // row 1
  const done = (detail) => settledByTicks(item('reservations', 'done', 'All booked', detail, { source: 'device' }));
  if (isOn(quick, AREAS.reservations.tickKey)) return done('Marked as booked on this device.');            // row 2, the one tick
  const open = entries.filter((entry) => !isTicked(checklist, entry));
  if (!open.length) {                                                                                      // row 2, every item
    const count = entries.length;
    return done(count === 1 ? 'The one reservation is ticked off.' : `${count === 2 ? 'Both' : `All ${count}`} reservations are ticked off.`);
  }
  const labels = open.map(({ item: entry }) => `${text(entry.label)}${dayNote(entry, days)}`);             // row 3
  return settledByTicks(item('reservations', 'todo', `${open.length} to book`, sentence(listText(labels, 2)), {
    source: 'device', due: dueOf(open.map(({ item: entry }) => entry.by), today),
  }));
}

// --- The rule ---------------------------------------------------------------------------------------

/**
 * @typedef {Object} ReadinessInput
 * @property {'upcoming'|'live'|'past'|'undated'} phase   tripPhase()
 * @property {string} [status]     'generating', 'failed' and 'empty' give null; any other word is a planned trip
 * @property {object|null} extras  the plan's extras after normaliseTransportExtras(): flights, transport,
 *                                 accommodation, bookingChecklist
 * @property {{ flights?: boolean, accommodation?: boolean }} [settled]   wizard_state.flights.settled and
 *                                 wizard_state.accommodation.settled
 * @property {Array<{ name?: string }>} [destinations]   the wizard's destinations; none means no entry card
 * @property {string} [homeCity]   the profile's home city
 * @property {{ quick?: object, checklist?: object }} [ticks]   readTicks(tripId)
 * @property {'checking'|{ reason: 'no-passport'|'failed' }|object|null} [entry]   'checking' (also when left
 *                                 out), a reason, or what summariseEntry() returned
 * @property {Date|string|number} now   decides whether a due date is overdue, soon or later
 * @property {string} [deviceZone]      the zone `now` is read in; the zone of the machine when left out
 * @property {Array<{ day_number: number, date: string|null }>} [days]   to say which day a reservation is for
 * @property {(iso2: string) => string} [countryName]   names a passport ("Singapore"); the code stands in without it
 */

/**
 * @param {ReadinessInput} input
 * @returns {import('../views/contract.js').Readiness|null} null for a past plan, for a plan that is
 *   generating, failed or empty, and when no area applies
 */
export function readiness(input = {}) {
  const today = deviceDate(input.now, input.deviceZone);
  if (input.phase === 'past' || NOT_PLANNED.has(input.status)) return null;
  const ticks = isObject(input.ticks) ? input.ticks : {};
  const context = {
    extras: isObject(input.extras) ? input.extras : {},
    settled: { flights: Boolean(input.settled?.flights), accommodation: Boolean(input.settled?.accommodation) },
    destinations: input.destinations, homeCity: input.homeCity, entry: input.entry, countryName: input.countryName,
    quick: isObject(ticks.quick) ? ticks.quick : {},
    checklist: isObject(ticks.checklist) ? ticks.checklist : {},
    days: Array.isArray(input.days) ? input.days : [],
    today,
  };
  const areas = [travelArea(context), stayArea(context), entryArea(context), reservationsArea(context)].filter(Boolean);
  if (!areas.length) return null;
  const items = areas.map((evaluated) => evaluated.item);
  const count = (state) => items.filter((row) => row.state === state).length;
  const done = count('done');
  return {
    items, done, total: items.length, todo: count('todo'), pending: count('checking'),
    headline: done === items.length ? 'Ready' : `${done} of ${items.length} ready`,
    perDevice: areas.some((evaluated) => evaluated.perDevice), collapsed: input.phase === 'live',
  };
}

/**
 * The parts of a full trip row that readiness() reads, in the shape it reads them. The caller
 * adds the rest: phase, now, ticks, entry, homeCity (and status, to override the row's own).
 * @param {object} trip   a trips row with wizard_state, extras and itinerary_days
 * @param {Partial<ReadinessInput>} [rest]
 * @returns {ReadinessInput}
 */
export function tripReadinessInput(trip, rest = {}) {
  const ws = trip?.wizard_state;
  return {
    status: trip?.status,
    extras: normaliseTransportExtras(trip?.extras ?? null, ws?.transport?.mode),
    settled: { flights: Boolean(ws?.flights?.settled), accommodation: Boolean(ws?.accommodation?.settled) },
    destinations: hasEntryCard(trip) ? (ws.multiCity ? ws.destinations : [ws.destination]) : [],
    days: Array.isArray(trip?.itinerary_days) ? trip.itinerary_days : [],
    ...rest,
  };
}
