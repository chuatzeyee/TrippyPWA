// Journeys to and from the destination: the ground and sea legs (bus, train,
// ferry, car, taxi) in one shape whatever shape they were stored in, and the
// airport codes of a flight route. Pure: no DOM, no network, no storage.
//
// Moved here from js/components/transport-card.js and
// js/services/entry-advisor.js, which re-export what they used to define.

/** Every main vehicle a stored ground or sea leg can name (journey.ts on the server). */
export const TRANSPORT_MODES = Object.freeze(['bus', 'train', 'ferry', 'car', 'taxi']);

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

const MODE_PATTERNS = [
  ['ferry', /\b(ferry|ferries|boat|catamaran|jetty)\b/],
  ['train', /\b(train|trains|rail|railway|ktm|ktmb|ets|rts|mrt|lrt|metro|shinkansen)\b|shuttle tebrau/],
  ['bus', /\b(bus|buses|coach|causeway link|plusliner|aeroline|transtar)\b/],
  ['taxi', /\b(taxi|grab|uber|gojek|cab)\b/],
  ['car', /\b(car|drive|self-drive|rental)\b/],
];

/**
 * Main vehicle from free text; '' when it can't tell. Hints are tried in
 * order, strongest first (mode, operator, service, then route, tips), so a
 * tip that mentions trains can't relabel a bus. Whole words only: "tickets"
 * must not read as "ets".
 */
export function modeFrom(...hints) {
  for (const hint of hints) {
    const t = text(hint).toLowerCase();
    if (!t) continue;
    for (const [mode, re] of MODE_PATTERNS) if (re.test(t)) return mode;
  }
  return '';
}

// "A to B", "A > B", "A - B" or an arrow between them (only a spaced hyphen,
// so "Kuala-Lumpur" stays). The escapes are a right arrow, a heavy arrow and
// an en dash: this file holds none of those characters itself.
function splitRoute(route) {
  const parts = text(route).split(/\s+(?:to|\u2192|\u2794|>|-|\u2013)\s+/i).map(s => s.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : [text(route), ''];
}

const NOT_A_FLIGHT = /n\/?a|bus|train|rail|ferry|coach|ktm|shuttle|causeway|express|plusliner/i;

/** A misfiled ground journey stored under extras.flights (older trips). */
export function looksLikeGroundLeg(leg) {
  if (!leg || typeof leg !== 'object') return false;
  const number = text(leg.flightNumber);
  const airline = text(leg.airline);
  if (number && NOT_A_FLIGHT.test(number) && !/^[A-Z0-9]{2}\s?\d{1,4}$/i.test(number)) return true;
  return !!modeFrom(airline) && !/airline|airways|air\b|jet|scoot|airasia/i.test(airline);
}

// A stored mode as one of TRANSPORT_MODES, or '' when it is something else.
function storedMode(raw) {
  const m = raw.toLowerCase();
  if (m === 'drive' || m === 'self-drive') return 'car';
  return TRANSPORT_MODES.includes(m) ? m : '';
}

/** One leg in a single shape, from any of the stored shapes. */
export function normalizeLeg(leg) {
  if (!leg || typeof leg !== 'object') return null;
  const [routeFrom, routeTo] = splitRoute(leg.route);
  const operator = text(leg.operator) || text(leg.airline);
  // Older misfiled legs put the service in flightNumber: "Shuttle Tebrau (or
  // Bus)" keeps "Shuttle Tebrau"; "N/A (Bus)" keeps nothing.
  const service = text(leg.service) || text(leg.flightNumber).replace(/\([^)]*\)/g, '').replace(/^n\/?a\b/i, '').trim();
  const mode = storedMode(text(leg.mode)) || modeFrom(leg.mode, operator, leg.flightNumber, service, leg.route, leg.terminal, leg.tips) || 'bus';
  const steps = Array.isArray(leg.steps)
    ? leg.steps.map(s => ({ mode: storedMode(text(s?.mode)) || modeFrom(s?.mode, s?.text) || '', text: text(s?.text), duration: text(s?.duration) }))
      .filter(s => s.text)
    : [];
  return {
    mode,
    operator: operator.replace(/\s*\(or similar[^)]*\)/i, ''),
    service,
    from: text(leg.from) || routeFrom,
    to: text(leg.to) || routeTo,
    duration: text(leg.duration),
    frequency: text(leg.frequency),
    price: text(leg.priceRange),
    border: text(leg.border),
    terminal: text(leg.terminal),
    steps,
    tips: text(leg.tips),
  };
}

/**
 * The trip's ground/sea journey, or null when it travels by air. Covers
 * extras.transport and older trips whose bus legs were stored as flights.
 */
export function groundJourney(extras) {
  const t = extras?.transport;
  if (t && (t.outbound || t.inbound)) {
    return { outbound: normalizeLeg(t.outbound), inbound: normalizeLeg(t.inbound) };
  }
  const f = extras?.flights;
  if (f && [f.outbound, f.inbound].filter(Boolean).every(looksLikeGroundLeg) && (f.outbound || f.inbound)) {
    return { outbound: normalizeLeg(f.outbound), inbound: normalizeLeg(f.inbound) };
  }
  return null;
}

/** Main mode for the card header: the outbound's, else the return's. */
export function journeyMode(journey) {
  return journey?.outbound?.mode || journey?.inbound?.mode || 'bus';
}

/** Every three-letter code in a leg's route, in order ("SIN > TPE > CTS"). */
export function routeCodes(leg) {
  return String(leg?.route || '').toUpperCase().match(/\b[A-Z]{3}\b/g) || [];
}

const AIRPORT_CODE = /^[A-Z]{3}$/;
const CODE_IN_BRACKETS = /\(([A-Z]{3})\)/;
const BARE_CODES = /^[A-Z]{3}(?:[\s,/-]+[A-Z]{3})+$/;
const NO_END = Object.freeze({ code: null, label: '' });

// One stop of a flight route: "SIN", "Singapore (SIN)" or "Singapore".
function flightStop(part) {
  const raw = text(part);
  if (!raw) return null;
  if (AIRPORT_CODE.test(raw)) return { code: raw, label: raw };
  const m = CODE_IN_BRACKETS.exec(raw);
  if (!m) return { code: null, label: raw };
  return { code: m[1], label: raw.replace(m[0], '').replace(/\s+/g, ' ').trim() || m[1] };
}

// The stops of a flight route in order, and the stops named after "via".
function flightStops(route) {
  const [main, ...viaTail] = route.split(/\s+via\s+/i);
  const parts = BARE_CODES.test(main.trim())
    ? main.trim().split(/[\s,/-]+/)
    : main.split(/\s*(?:->|\u2192|\u2794|>)\s*|\s+(?:to|-|\u2013|\u2014)\s+/i);
  return {
    stops: parts.map(flightStop).filter(Boolean),
    via: viaTail.join(',').split(/\s*(?:,|&|\band\b)\s*/i).map(flightStop).filter(Boolean),
  };
}

/**
 * The two ends of a leg for a one-line route, and what lies between them:
 * `{ from: { code, label }, to: { code, label }, via: [] }`.
 *
 * `code` is an airport code only when the stored route of a flight has one for
 * that end, in capitals ("SIN > TPE > CTS", "Singapore (SIN) to Sapporo
 * (CTS)"); `label` is then the city beside it, or the code itself. For a
 * flight stored by city name, and for every ground or sea leg (raw or from
 * normalizeLeg), `code` is null and `label` is the place name. An end that is
 * not known has `{ code: null, label: '' }`. Null when neither end is known.
 */
export function routeEnds(leg) {
  if (!leg || typeof leg !== 'object') return null;
  if (text(leg.mode) || text(leg.from) || text(leg.to) || looksLikeGroundLeg(leg)) {
    const { from, to } = normalizeLeg(leg);
    return from || to ? { from: { code: null, label: from }, to: { code: null, label: to }, via: [] } : null;
  }
  if (typeof leg.route !== 'string') return null;
  const { stops, via } = flightStops(leg.route);
  if (!stops.length) return null;
  return {
    from: stops[0],
    to: stops.length > 1 ? stops[stops.length - 1] : { ...NO_END },
    via: [...stops.slice(1, -1), ...via].map(stop => stop.code || stop.label),
  };
}

/**
 * Older trips planned as a ground or sea journey kept its legs under
 * extras.flights. Returns extras with those legs under `transport` instead (no
 * `flights` key), each marked with `mode` and with the airline as its
 * operator; or the very same object when there is nothing to move. `mode` is
 * the wizard's transport mode (wizard_state.transport.mode): without one, or
 * when `transport` is already there, nothing moves. Never changes `extras`.
 */
export function normaliseTransportExtras(extras, mode) {
  if (!mode || !extras?.flights || extras.transport) return extras;
  const { flights, ...rest } = extras;
  const asTransport = (leg) => (leg ? { ...leg, mode, operator: leg.airline || '' } : undefined);
  return { ...rest, transport: { outbound: asTransport(flights.outbound), inbound: asTransport(flights.inbound) } };
}
