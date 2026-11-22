// Pure logic of the trip chat (Trippy Concierge): the bounded request built
// from a trip, the write each validated edit stands for, and the plain
// sentence that proposes it. No DOM, no network: tested in
// itinerary-chat-plan.test.js. The bounds, the validation and the reply shape
// are shared with the edge function (supabase/functions/_shared/chat-plan.mjs).
import { convert, canConvert } from '../data/currencies.js';
import { formatClock } from '../lib/locale.js';
import { isBookedLeg, isoToUtc } from '../lib/trip-extras.js';
import { boundedPlan, boundedHistory, validateEdits, validateChoices, CHAT_LIMITS } from '../../supabase/functions/_shared/chat-plan.mjs';

export { validateEdits, validateChoices, CHAT_LIMITS };

const text = (v) => String(v ?? '').trim();
const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

export function tripCurrency(trip) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  return String(dest?.currencyCode || trip.budget_currency || 'USD').toUpperCase();
}

// An activity's cost in the trip currency, which is what the chat model is told
// every cost is in. 0 when its own currency can't be converted.
function costInTrip(activity, code) {
  const amount = Number(activity?.cost_amount) || 0;
  const from = text(activity?.cost_currency).toUpperCase();
  if (!amount || !/^[A-Z]{3}$/.test(from) || from === code) return Math.round(amount);
  return canConvert(from) && canConvert(code) ? convert(amount, from, code) : 0;
}

const findStop = (trip, id) => {
  for (const day of trip.itinerary_days || []) {
    const activity = (day.activities || []).find(a => a.id === id);
    if (activity) return { day, activity };
  }
  return null;
};

function legsOf(extras) {
  const from = (set, kind, pick) => ['outbound', 'inbound']
    .filter(leg => set?.[leg] && typeof set[leg] === 'object')
    .map(leg => ({ leg, kind, booked: isBookedLeg(set[leg]), bookingRef: set[leg].bookingRef, ...pick(set[leg]) }));
  const flights = from(extras?.flights, 'flight', l => ({
    carrier: l.airline, number: l.flightNumber, route: l.route, depart: l.depart, arrive: l.arrive, duration: l.duration,
  }));
  return flights.length ? flights : from(extras?.transport, 'transport', l => ({
    carrier: [l.mode, l.operator].filter(Boolean).join(' '), number: l.service,
    route: [l.from, l.to].filter(Boolean).join(' to '), duration: l.duration,
  }));
}

/** The plan the chat sees: the trip cut to what a question or a change needs, every cost in the trip currency. */
export function planForChat(trip) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const code = tripCurrency(trip);
  const extras = trip.extras || {};
  return boundedPlan({
    destination: dest?.name || trip.title || '',
    currency: code,
    startDate: trip.start_date,
    endDate: trip.end_date,
    travelers: trip.travelers || ws?.travelers,
    days: (trip.itinerary_days || []).map(d => ({
      ...d, activities: (d.activities || []).map(a => ({ ...a, cost_amount: costInTrip(a, code) })),
    })),
    stays: extras.accommodation,
    legs: legsOf(extras),
    toBook: (Array.isArray(extras.bookingChecklist) ? extras.bookingChecklist : []).flatMap(g => (Array.isArray(g?.items) ? g.items : [])),
  });
}

/**
 * The body of one itinerary-chat request.
 * @param {object} trip
 * @param {string} message
 * @param {{ role: 'user'|'bot', text: string }[]} [history] earlier turns of this visit
 */
export function buildChatRequest(trip, message, history = []) {
  const request = { message: text(message).slice(0, CHAT_LIMITS.message), history: boundedHistory(history), ...planForChat(trip) };
  if (bytes(request) <= CHAT_LIMITS.maxBodyBytes) return request;
  // A very long trip: the descriptions go first, so times, places, costs and notes still fit.
  return { ...request, days: request.days.map(d => ({ ...d, activities: d.activities.map(a => ({ ...a, description: '' })) })) };
}
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

// ===== What an edit writes =====

const STAY_KEYS = ['name', 'area', 'type', 'city', 'priceRange', 'highlights', 'badge', 'checkIn', 'checkOut', 'booked', 'url', 'bookingRef', 'address'];
const LEG_KEYS = ['route', 'airline', 'flightNumber', 'duration', 'priceRange', 'tips', 'depart', 'arrive', 'booked', 'bookingRef', 'seats', 'baggage', 'manageUrl'];

// A stay in the shape the import and the generator store (trip-import.js parseStays), plus the traveller's note.
function stayEntry(fields) {
  const stay = Object.fromEntries(STAY_KEYS.map(k => [k, k === 'booked' ? Boolean(fields.booked) : text(fields[k])]));
  return fields.note ? { ...stay, note: text(fields.note) } : stay;
}

/**
 * The extras after a stay or flight edit, or null when the edit no longer fits
 * them (the stay it names has moved or gone). Never mutates `extras`.
 */
export function applyExtrasEdit(extras, edit) {
  const base = extras && typeof extras === 'object' ? extras : {};
  const stays = Array.isArray(base.accommodation) ? base.accommodation : [];
  const withStays = (accommodation) => ({ ...base, accommodation });
  const at = (change) => {
    const old = stays[edit.stayIndex];
    if (!old || !sameName(old.name, edit.stayName)) return null;
    return withStays(stays.map((s, i) => (i === edit.stayIndex ? change(old) : s)));
  };
  const given = edit.stay || {};

  switch (edit.kind) {
    case 'stay-book':
      return at(old => ({ ...old, ...given, booked: true }));
    case 'stay-note': {
      const { note: _old, ...rest } = stays[edit.stayIndex] || {};
      return at(() => (edit.note ? { ...rest, note: edit.note } : rest));
    }
    case 'stay-replace':
      // A stay booked since the proposal was made is left alone.
      if ((stays[edit.stayIndex]?.booked || text(stays[edit.stayIndex]?.bookingRef)) && !edit.overrideBooked) return null;
      return at(old => stayEntry({ city: old.city, checkIn: old.checkIn, checkOut: old.checkOut, ...given, booked: false, bookingRef: '' }));
    case 'stay-add':
      return withStays([...stays, stayEntry({ ...given, booked: edit.booked, badge: edit.booked ? 'Pre-booked' : '' })]);
    case 'flight-book': {
      const { leg, ...flight } = edit.flight || {};
      if (leg !== 'outbound' && leg !== 'inbound') return null;
      const old = base.flights?.[leg];
      // Another flight than the suggested one: the suggestion's time, price and tip are not about it.
      const kept = old && (!flight.flightNumber || sameName(old.flightNumber, flight.flightNumber))
        ? old : { ...(old || {}), duration: '', priceRange: '', tips: '' };
      const next = { ...Object.fromEntries(LEG_KEYS.map(k => [k, ''])), ...kept, ...flight, booked: true };
      return { ...base, flights: { outbound: null, inbound: null, ...(base.flights || {}), [leg]: next } };
    }
    default:
      return null;
  }
}

function timeSlotFor(startTime) {
  const h = parseInt(text(startTime).split(':')[0], 10);
  if (!Number.isFinite(h)) return 'morning';
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/**
 * The one write a validated edit stands for, against the trip as it is now:
 *   { type: 'update', id, updates } | { type: 'delete', id } | { type: 'add', dayId, activity }
 *   | { type: 'note', id, note } | { type: 'extras', change(extras) }
 * or null when the edit no longer matches the trip.
 */
export function editWrite(trip, edit) {
  if (validateEdits([edit], planForChat(trip)).edits.length !== 1) return null;
  const code = tripCurrency(trip);
  const a = edit.activity || {};
  switch (edit.kind) {
    case 'activity-remove':
      return { type: 'delete', id: edit.activityId };
    case 'activity-note':
      return { type: 'note', id: edit.activityId, note: edit.note };
    case 'activity-modify': {
      // The cost is priced in the trip currency. Write it (with that currency)
      // only when it differs from the cost the model was shown, so an
      // untouched cost keeps the activity's own amount and currency.
      const { costAmount, ...rest } = a;
      const before = findStop(trip, edit.activityId)?.activity;
      const cost = costAmount !== undefined && Math.round(costAmount) !== costInTrip(before, code)
        ? { costAmount, costCurrency: code } : {};
      return { type: 'update', id: edit.activityId, updates: { ...rest, ...cost } };
    }
    case 'activity-add': {
      const day = (trip.itinerary_days || []).find(d => d.day_number === edit.dayNumber);
      return day?.id ? { type: 'add', dayId: day.id, activity: { ...a, costCurrency: code, timeSlot: timeSlotFor(a.startTime) } } : null;
    }
    default:
      return applyExtrasEdit(trip.extras, edit) ? { type: 'extras', change: extras => applyExtrasEdit(extras, edit) } : null;
  }
}

// ===== The proposal in plain words =====

function shortDate(iso) {
  const t = isoToUtc(iso);
  return t === null ? '' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
const stayDates = (s) => (shortDate(s?.checkIn) && shortDate(s?.checkOut) ? `${shortDate(s.checkIn)} to ${shortDate(s.checkOut)}` : '');
const list = (parts) => parts.filter(Boolean).join(', ');
const at = (time) => (time ? ` at ${formatClock(time)}` : '');

/** One sentence that says what applying `edit` does, e.g. "Mark Hotel Granvia as booked, confirmation 12345". */
export function proposalText(edit, trip) {
  const stop = findStop(trip, edit.activityId)?.activity;
  const stopName = text(stop?.venue_name) || text(stop?.title) || 'this stop';
  const day = `day ${edit.dayNumber}`;
  const a = edit.activity || {};
  const s = edit.stay || {};
  const stayName = text(edit.stayName) || 'this stay';
  switch (edit.kind) {
    case 'activity-add':
      return `Add to ${day}: ${a.title}${at(a.startTime)}`;
    case 'activity-remove':
      return `Remove ${text(stop?.title) || stopName} from ${day}`;
    case 'activity-modify': {
      const old = text(stop?.title) || stopName;
      if (a.title && !sameName(a.title, old)) return `Change ${old} on ${day} to ${a.title}${at(a.startTime)}`;
      return a.startTime && a.startTime !== text(stop?.start_time).slice(0, 5)
        ? `Move ${old} on ${day} to ${formatClock(a.startTime)}` : `Update ${old} on ${day}`;
    }
    case 'activity-note':
      return edit.note ? `Add note to ${stopName}: ${formatClock(edit.note)}` : `Remove the note on ${stopName}`;
    case 'stay-book':
      return list([`Mark ${s.name || stayName} as booked`, s.bookingRef && `confirmation ${s.bookingRef}`, stayDates(s), s.address]);
    case 'stay-add':
      return list([`Add ${s.name} as ${edit.booked ? 'a booked stay' : 'a stay option'}`, s.area,
        s.bookingRef && `confirmation ${s.bookingRef}`, stayDates(s), !edit.booked && s.priceRange]);
    case 'stay-replace':
      return list([`Replace ${edit.overrideBooked ? 'your booked stay ' : ''}${stayName} with ${s.name}`, s.area, s.priceRange]);
    case 'stay-note':
      return edit.note ? `Add note to ${stayName}: ${formatClock(edit.note)}` : `Remove the note on ${stayName}`;
    case 'flight-book': {
      const f = edit.flight || {};
      return list([`Mark the ${f.leg === 'inbound' ? 'return' : 'outbound'} flight${f.flightNumber ? ` ${f.flightNumber}` : ''} as booked`,
        f.bookingRef && `reference ${f.bookingRef}`, f.depart && `departs ${formatClock(f.depart)}`]);
    }
    default:
      return '';
  }
}

/** What a tappable choice says (and sends when tapped): "Nishiki Market on day 3 at 10:00 AM". */
export function choiceText(choice, trip) {
  const found = choice.activityId ? findStop(trip, choice.activityId) : null;
  if (found) {
    const { activity, day } = found;
    return `${text(activity.venue_name) || text(activity.title)} on day ${day.day_number}${at(text(activity.start_time).slice(0, 5))}`;
  }
  const stay = trip.extras?.accommodation?.[choice.stayIndex];
  return stay?.name ? list([text(stay.name), text(stay.area) || text(stay.city)]) : '';
}
