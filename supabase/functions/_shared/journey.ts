// Getting to and from the destination: flights the traveller already booked,
// and the schema and prompt for suggested flights or ground/sea transport.
//
// Booked flights are never left to the model: it invented times and dropped
// connections (TR892 SIN > TPE > CTS lands 17:00, the model said a direct
// flight landing 08:30 and planned a full first day). The traveller's own
// details go onto the card verbatim, and the model only plans around them.

export type BookedLegInput = { flightNumber?: string; route?: string; depart?: string; arrive?: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Carriers common on routes from Singapore, for the card's airline name (the
// logo itself comes from the flight number prefix).
const AIRLINE_BY_CODE: Record<string, string> = {
  SQ: "Singapore Airlines", TR: "Scoot", "3K": "Jetstar Asia", JQ: "Jetstar", QF: "Qantas",
  MH: "Malaysia Airlines", AK: "AirAsia", D7: "AirAsia X", OD: "Batik Air", GA: "Garuda Indonesia",
  TG: "Thai Airways", FD: "Thai AirAsia", VN: "Vietnam Airlines", VJ: "VietJet Air", PR: "Philippine Airlines",
  "5J": "Cebu Pacific", CX: "Cathay Pacific", UO: "HK Express", JL: "Japan Airlines", NH: "ANA",
  MM: "Peach", KE: "Korean Air", OZ: "Asiana Airlines", CI: "China Airlines", BR: "EVA Air",
  CA: "Air China", MU: "China Eastern", CZ: "China Southern", EK: "Emirates", QR: "Qatar Airways",
  EY: "Etihad Airways", TK: "Turkish Airlines", BA: "British Airways", LH: "Lufthansa", AF: "Air France",
  KL: "KLM", NZ: "Air New Zealand", AI: "Air India", "6E": "IndiGo", UL: "SriLankan Airlines",
};

/** "SIN>tpe - CTS", "SIN TPE CTS" or "SIN → TPE → CTS" as "SIN > TPE > CTS". */
export function normalizeRoute(raw: unknown): string {
  const codes = String(raw || "").toUpperCase().match(/\b[A-Z]{3}\b/g) || [];
  return codes.length >= 2 ? codes.join(" > ") : "";
}

/** "2027-01-13T06:10" as "Wed 13 Jan 06:10"; anything else as ''. */
export function formatLocalDateTime(raw: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(raw || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return "";
  return `${WEEKDAYS[d.getUTCDay()]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[4]}:${m[5]}`;
}

function airlineFor(flightNumber: string): string {
  const code = flightNumber.toUpperCase().replace(/\s+/g, "").slice(0, 2);
  return AIRLINE_BY_CODE[code] || "";
}

function bookedLeg(input: BookedLegInput | undefined): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const flightNumber = String(input.flightNumber || "").trim().slice(0, 20);
  const route = normalizeRoute(input.route);
  const depart = formatLocalDateTime(input.depart);
  const arrive = formatLocalDateTime(input.arrive);
  if (!flightNumber && !route && !depart && !arrive) return null;
  const codes = route ? route.split(" > ") : [];
  return {
    airline: airlineFor(flightNumber),
    flightNumber,
    route,
    depart: depart && codes[0] ? `${depart}, ${codes[0]}` : depart,
    arrive: arrive && codes.length ? `${arrive}, ${codes[codes.length - 1]}` : arrive,
    booked: true,
  };
}

/**
 * The traveller's booked flights in the extras.flights leg shape, from the
 * wizard ("Already booked?"). Older wizard states only had a flight number and
 * an arrival date; those still produce a leg with what is known.
 */
export function bookedFlightLegs(wizardState: any): { outbound: any; inbound: any } | null {
  const f = wizardState?.flights;
  if (!f?.settled) return null;
  const outbound = bookedLeg(f.booked?.outbound) ||
    (f.flightNumber ? bookedLeg({ flightNumber: f.flightNumber }) : null);
  const inbound = bookedLeg(f.booked?.inbound);
  return outbound || inbound ? { outbound, inbound } : null;
}

/** Prompt lines telling the model when the traveller lands and leaves. */
export function bookedFlightPrompt(wizardState: any): string {
  const f = wizardState?.flights;
  if (!f?.settled) return "";
  // Older wizard states kept only a flight number and an arrival date.
  const out = f.booked?.outbound || (f.flightNumber ? { flightNumber: f.flightNumber } : {});
  const back = f.booked?.inbound || {};
  const lines: string[] = [];
  const outRoute = normalizeRoute(out.route);
  const backRoute = normalizeRoute(back.route);
  const outArrive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(out.arrive || "") ? out.arrive.replace("T", " ") : "";
  const backDepart = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(back.depart || "") ? back.depart.replace("T", " ") : "";
  if (out.flightNumber || outArrive || f.arrivalDate) {
    lines.push(`- ARRIVAL FLIGHT (BOOKED, use exactly): ${out.flightNumber || "the traveller's flight"}${outRoute ? ` ${outRoute}` : ""}${outArrive ? ` lands at ${outArrive} local time` : f.arrivalDate ? ` arrives on ${f.arrivalDate}` : ""}. Day 1 starts only after landing: allow about 90 minutes for immigration, bags and the airport transfer, then plan only what fits the rest of that day (for an evening arrival: the transfer, hotel check-in and an easy dinner nearby). Never schedule anything before the landing time.`);
  }
  if (back.flightNumber || backDepart) {
    lines.push(`- DEPARTURE FLIGHT (BOOKED, use exactly): ${back.flightNumber || "the traveller's flight"}${backRoute ? ` ${backRoute}` : ""}${backDepart ? ` departs at ${backDepart} local time` : ""}. On that day, end activities so the traveller leaves for the airport 3 hours before departure, and make the airport transfer the last activity.`);
  }
  return lines.join("\n");
}

// ----- Suggested journeys -----

export const TRANSPORT_MODES = ["bus", "train", "ferry", "car", "taxi"];

/** Instruction for the model's "transport" section (ground or sea). */
export function transportInstruction(modeHint: string): string {
  return `Include "transport" (NOT "flights": do not include a "flights" key, and never name an airline or flight number) with an "outbound" and an "inbound" journey by ${modeHint}. For each journey give:
   - "mode": one of ${TRANSPORT_MODES.join(", ")} (the main vehicle)
   - "operator" and "service" (e.g. operator "Causeway Link", service "CW2"; operator "KTMB", service "Shuttle Tebrau"; operator "Batam Fast", service "ferry")
   - "from": where the traveller boards, as a named place with its area (e.g. "Tanah Merah Ferry Terminal, Singapore", "Kranji MRT bus stop, Singapore"). For a ferry this is the terminal where they EMBARK.
   - "to": where they get off (e.g. "Batam Centre Ferry Terminal, Batam", "JB Sentral, Johor Bahru"). For a ferry this is the terminal where they DISEMBARK.
   - "duration": realistic door-to-door time including any immigration queue, e.g. "1h 30m"
   - "frequency", "priceRange" (per person, local currency), "tips"
   - "border": how the border crossing works if there is one (which checkpoints, in order, e.g. "Clear Singapore immigration at Woodlands Checkpoint, then Malaysian immigration at Sultan Iskandar CIQ"), or "" if none
   - "steps": when the journey needs a change or connection, one entry per part in order, each with "mode", "text" (e.g. "MRT to Kranji", "Causeway Link CW2 across the Causeway to JB Sentral") and "duration". Use [] when it is one direct ride.`;
}

const STEP_SCHEMA = {
  type: "object",
  properties: { mode: { type: "string" }, text: { type: "string" }, duration: { type: "string" } },
  required: ["mode", "text"],
};

const TRANSPORT_LEG_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: TRANSPORT_MODES },
    operator: { type: "string" }, service: { type: "string" },
    from: { type: "string" }, to: { type: "string" },
    duration: { type: "string" }, frequency: { type: "string" }, priceRange: { type: "string" },
    border: { type: "string" }, tips: { type: "string" },
    steps: { type: "array", items: STEP_SCHEMA },
  },
  required: ["mode", "operator", "from", "to", "duration", "priceRange", "border", "steps"],
};

export const TRANSPORT_SCHEMA = {
  type: "object",
  properties: { outbound: TRANSPORT_LEG_SCHEMA, inbound: TRANSPORT_LEG_SCHEMA },
  required: ["outbound", "inbound"],
};

export const TRANSPORT_EXAMPLE = {
  outbound: { mode: "bus|train|ferry|car|taxi", operator: "string", service: "string", from: "string (where they board / embark)", to: "string (where they get off / disembark)", duration: "string (door to door)", frequency: "string", priceRange: "string", border: "string", steps: [{ mode: "string", text: "string", duration: "string" }], tips: "string" },
  inbound: { "...same fields": "" },
};

/** The flight route rule shared by suggested flights. */
export const FLIGHT_ROUTE_RULE = `Write each flight's "route" as IATA airport codes joined by " > ", including EVERY stop (e.g. "SIN > TPE > CTS" for a flight that connects in Taipei, "SIN > CTS" only when it is nonstop), and give "duration" as total travel time including any connection, e.g. "9h 50m, 1h 15m in Taipei".`;

/**
 * Final extras.flights: the traveller's booked legs replace the model's
 * suggestion for that direction; an unbooked direction keeps the suggestion.
 */
export function mergeBookedFlights(suggested: any, wizardState: any): any {
  const booked = bookedFlightLegs(wizardState);
  if (!booked) return suggested;
  return {
    outbound: booked.outbound || suggested?.outbound || null,
    inbound: booked.inbound || suggested?.inbound || null,
  };
}
