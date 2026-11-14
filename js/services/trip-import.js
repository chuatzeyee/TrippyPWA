// Import a hand-researched trip from a JSON file (format: docs/trip-import-format.md).
// Pure: validates + sanitises untrusted file content into the
// { wizardState, itinerary } shape that saveTripWithItinerary() persists.
// Unknown keys are dropped, URLs are http(s)-only, strings are length-capped.

import { safeUrl, isoToUtc } from '../lib/trip-extras.js';

export const IMPORT_VERSION = 1;
export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxDays: 60, maxActivitiesPerDay: 40, maxText: 2000 };

export class TripImportError extends Error {}

const fail = (msg) => { throw new TripImportError(msg); };

function str(v, max = IMPORT_LIMITS.maxText) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function coord(v, limit) {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function isoOrEmpty(v) {
  return isoToUtc(v) === null ? '' : v;
}

function timeSlot(raw) {
  const s = str(raw).toLowerCase();
  if (s === 'morning' || s === 'afternoon' || s === 'evening') return s;
  if (/night|evening|dinner/.test(s)) return 'evening';
  if (/afternoon|lunch/.test(s)) return 'afternoon';
  return 'morning';
}

function parseDestination(raw, emoji) {
  const d = typeof raw === 'string' ? { name: raw } : (raw || {});
  const name = str(d.name, 120);
  if (!name) fail('The trip needs a destination name (trip.destination).');
  return {
    name,
    country: str(d.country, 80),
    emoji: str(emoji || d.emoji, 16),
    flag: str(d.flag, 8),
    currencyCode: str(d.currencyCode, 3).toUpperCase() || 'USD',
    currencySymbol: str(d.currencySymbol, 4) || '$',
    timezone: str(d.timezone, 64) || null,
    lat: coord(d.lat, 90),
    lng: coord(d.lng, 180),
    image: safeUrl(d.image),
  };
}

function parseActivity(a, dayNum, idx, currency) {
  const title = str(a?.title, 200);
  if (!title) fail(`Day ${dayNum}, activity ${idx + 1} needs a title.`);
  return {
    timeSlot: timeSlot(a.timeSlot),
    sortOrder: idx,
    startTime: /^\d{1,2}:\d{2}$/.test(str(a.startTime)) ? str(a.startTime).padStart(5, '0') : '',
    title,
    description: str(a.description),
    venueName: str(a.venueName, 200),
    venueAddress: str(a.venueAddress, 300),
    placeId: '',
    category: str(a.category, 40).toLowerCase() || 'culture',
    durationMinutes: int(a.durationMinutes, 60),
    costAmount: int(a.costAmount),
    costCurrency: str(a.costCurrency, 3).toUpperCase() || currency,
    costNote: str(a.costNote, 300),
    latitude: coord(a.latitude, 90),
    longitude: coord(a.longitude, 180),
    bookingUrl: safeUrl(a.bookingUrl),
    tips: str(a.tips),
    gettingThere: str(a.gettingThere, 500),
    transportMode: str(a.transportMode, 40),
    transportDuration: str(a.transportDuration, 40),
    transportCost: str(a.transportCost, 40),
    transportOptions: [],
  };
}

function parseDays(rawDays, start, end, currency) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) fail('The trip needs at least one day.');
  if (rawDays.length > IMPORT_LIMITS.maxDays) fail(`Too many days (max ${IMPORT_LIMITS.maxDays}).`);
  const seen = new Set();
  return rawDays.map((d, i) => {
    const dayNumber = int(d?.dayNumber, i + 1) || i + 1;
    if (seen.has(dayNumber)) fail(`Day ${dayNumber} appears twice.`);
    seen.add(dayNumber);
    let date = '';
    if (d?.date) {
      const t = isoToUtc(d.date);
      if (t === null) fail(`Day ${dayNumber} has an invalid date.`);
      if (t < start || t > end) fail(`Day ${dayNumber} (${d.date}) is outside the trip dates.`);
      date = d.date;
    }
    const acts = Array.isArray(d?.activities) ? d.activities : [];
    if (acts.length > IMPORT_LIMITS.maxActivitiesPerDay) fail(`Day ${dayNumber} has too many activities (max ${IMPORT_LIMITS.maxActivitiesPerDay}).`);
    return {
      dayNumber,
      date,
      title: str(d?.title, 200) || `Day ${dayNumber}`,
      theme: str(d?.theme, 200),
      weather: d?.weather && typeof d.weather === 'object'
        ? { condition: str(d.weather.condition, 40), highC: coord(d.weather.highC, 90), lowC: coord(d.weather.lowC, 90) }
        : null,
      activities: acts.map((a, idx) => parseActivity(a, dayNumber, idx, currency)),
    };
  });
}

function parseLeg(l) {
  if (!l || typeof l !== 'object') return null;
  return {
    route: str(l.route, 120),
    airline: str(l.airline, 80),
    flightNumber: str(l.flightNumber, 40),
    duration: str(l.duration, 80),
    priceRange: str(l.priceRange, 80),
    tips: str(l.tips, 500),
    depart: str(l.depart, 80),
    arrive: str(l.arrive, 80),
    booked: Boolean(l.booked),
    bookingRef: str(l.bookingRef, 20),
    seats: str(l.seats, 60),
    baggage: str(l.baggage, 80),
    manageUrl: safeUrl(l.manageUrl),
  };
}

function parseExtras(obj) {
  const extras = {};
  if (obj.flights && typeof obj.flights === 'object') {
    extras.flights = { outbound: parseLeg(obj.flights.outbound), inbound: parseLeg(obj.flights.inbound) };
  }
  if (Array.isArray(obj.accommodation)) {
    extras.accommodation = obj.accommodation
      .filter(a => str(a?.name))
      .map(a => ({
        name: str(a.name, 120), area: str(a.area, 120), type: str(a.type, 60), city: str(a.city, 80),
        priceRange: str(a.priceRange, 80), highlights: str(a.highlights, 600), badge: str(a.badge, 30),
        checkIn: isoOrEmpty(a.checkIn), checkOut: isoOrEmpty(a.checkOut),
        booked: Boolean(a.booked), url: safeUrl(a.url),
      }));
  }
  if (Array.isArray(obj.bookingChecklist)) {
    extras.bookingChecklist = obj.bookingChecklist
      .filter(g => str(g?.group))
      .map(g => ({
        group: str(g.group, 80),
        items: (Array.isArray(g.items) ? g.items : [])
          .filter(it => str(it?.label))
          .map(it => ({ label: str(it.label, 200), day: int(it.day, 0) || null, note: str(it.note, 300), by: isoOrEmpty(it.by), url: safeUrl(it.url) })),
      }));
  }
  if (Array.isArray(obj.savingsTips)) {
    extras.savingsTips = obj.savingsTips
      .filter(t => str(t?.title))
      .map(t => ({ icon: str(t.icon, 8), title: str(t.title, 120), description: str(t.description, 600), estimatedSaving: str(t.estimatedSaving, 60) }));
  }
  return extras;
}

export function parseTripImport(text) {
  if (typeof text !== 'string') fail('Could not read the file.');
  if (text.length > IMPORT_LIMITS.maxBytes) fail('This file is too large to import (max 1 MB).');
  let obj;
  try { obj = JSON.parse(text); } catch { fail('This file is not valid JSON.'); }
  if (!obj || obj.trippy !== IMPORT_VERSION) fail('This is not a Trippy import file (it needs "trippy": 1).');

  const trip = obj.trip || {};
  const title = str(trip.title, 120) || fail('The trip needs a title (trip.title).');
  const destination = parseDestination(trip.destination, trip.emoji);
  const start = isoToUtc(trip.startDate);
  if (start === null) fail('The trip start date must be YYYY-MM-DD (trip.startDate).');
  const end = isoToUtc(trip.endDate);
  if (end === null || end < start) fail('The trip end date must be YYYY-MM-DD and not before the start (trip.endDate).');

  const days = parseDays(obj.days, start, end, destination.currencyCode);

  const wizardState = {
    imported: true,
    destination,
    destinations: [],
    multiCity: false,
    dates: { mode: 'fixed', start: trip.startDate, end: trip.endDate },
    budget: { preset: null, dailyAmount: int(trip.dailyBudget) },
    travelers: Math.min(int(trip.travelers, 1) || 1, 20),
    summary: { freeText: str(trip.subtitle, 300) },
  };

  return { wizardState, itinerary: { tripTitle: title, days, ...parseExtras(obj) } };
}
