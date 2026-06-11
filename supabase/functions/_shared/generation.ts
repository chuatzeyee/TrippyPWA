// Shared generation logic used by the async worker (process-generation) and the
// legacy synchronous endpoint (generate-itinerary). Keeping it here prevents the
// ~300-line prompt/schema/provider code from being duplicated across functions.

// Free-tier wall-clock cap is 150s PER invocation. In the async design each
// provider runs in its OWN invocation, so it gets a full 150s — we allow 125s
// for the model fetch and leave ~25s for parse + the replace_itinerary save.
export const FETCH_TIMEOUT = 125_000;

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Total day count for a trip: fixed start+end is authoritative (dates.duration
// defaults to 7 and is not cleared when fixed dates are picked).
export function tripDayCount(wizardState: any): number {
  const hasFixedDates = !!(wizardState.dates?.start && wizardState.dates?.end);
  if (hasFixedDates) {
    return Math.round((new Date(wizardState.dates.end).getTime() - new Date(wizardState.dates.start).getTime()) / 86400000) + 1;
  }
  return wizardState.dates?.duration || 7;
}

// Split a trip into day-batches. Short trips are a single chunk; long ones are
// generated in pieces so each model call stays well within the wall-clock limit.
export function planChunks(totalDays: number, chunkSize = 4): Array<{ from: number; to: number }> {
  const chunks: Array<{ from: number; to: number }> = [];
  for (let from = 1; from <= totalDays; from += chunkSize) {
    chunks.push({ from, to: Math.min(from + chunkSize - 1, totalDays) });
  }
  return chunks.length > 0 ? chunks : [{ from: 1, to: Math.max(1, totalDays) }];
}

// Calendar date (YYYY-MM-DD) for a 1-based trip day, or null without fixed dates.
export function dateForDay(wizardState: any, dayNumber: number): string | null {
  const start = wizardState?.dates?.start;
  if (!start) return null;
  const d = new Date(`${start}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1));
  return d.toISOString().slice(0, 10);
}

// Compact summary of already-generated days, fed to later chunks so they
// continue the SAME trip instead of re-planning the route from scratch.
// Without this, every chunk of a multi-city trip independently re-decides the
// city order — producing duplicate "fly to X" days at each chunk seam.
export function summarizePriorDays(priorDays: any[]): string {
  if (!Array.isArray(priorDays) || priorDays.length === 0) return "";
  const lines = priorDays.map((d: any) => {
    const acts = Array.isArray(d.activities) ? d.activities : [];
    const venues = acts.slice(0, 6).map((a: any) => a.venue_name || a.title).filter(Boolean).join("; ");
    return `Day ${d.day_number}${d.date ? ` (${d.date})` : ""}: ${d.title || ""}${venues ? ` — ${venues}` : ""}`;
  });
  return lines.join("\n");
}

// opts.dayFrom/dayTo scope generation to a day range (1-based, inclusive).
// opts.includeExtras=false drops trip-level sections (flights, accommodation,
// bookingChecklist, savingsTips) so non-first chunks only emit days.
// opts.priorDays: already-generated days (db shape) for continuity context.
export function buildPromptAndSchema(wizardState: any, opts: { dayFrom?: number; dayTo?: number; includeExtras?: boolean; priorDays?: any[] } = {}) {
  const dest = wizardState.multiCity && wizardState.destinations?.length > 0
    ? wizardState.destinations.map((d: any) => d.name).join(", ")
    : wizardState.destination?.name;

  const hasFixedDates = !!(wizardState.dates?.start && wizardState.dates?.end);
  const fixedDays = tripDayCount(wizardState);

  const days = hasFixedDates ? fixedDays : (wizardState.dates?.duration || 7);

  // Chunk scoping. Default to the whole trip when no range is given.
  const dayFrom = opts.dayFrom ?? 1;
  const dayTo = opts.dayTo ?? days;
  const includeExtras = opts.includeExtras ?? true;
  const isChunk = dayFrom > 1 || dayTo < days;
  const chunkDays = dayTo - dayFrom + 1;

  const dateInfo = hasFixedDates
    ? `Fixed dates: ${wizardState.dates.start} to ${wizardState.dates.end} (${fixedDays} days inclusive)`
    : `Flexible: approximately ${wizardState.dates?.duration || 7} days, ${wizardState.dates?.season || "any season"}`;

  const currency = wizardState.destination?.currencyCode || "USD";
  const currencySymbol = wizardState.destination?.currencySymbol || "$";
  const budget = wizardState.budget?.dailyAmount || 100;
  const travelers = wizardState.travelers || 1;

  const homeCity = wizardState.profile?.homeCity || "";
  const homeCountry = wizardState.profile?.homeCountry || "";
  const departureCity = wizardState.departureCity || homeCity;

  // Multi-city routing guidance. The user's city ordering is just a wish-list;
  // the AI should sequence them sensibly: enter at the city nearest/cheapest to
  // reach from the origin, then visit the rest by geographic proximity (shortest
  // total inter-city travel), and depart from the last city.
  const cityNames: string[] = wizardState.multiCity && wizardState.destinations?.length > 1
    ? wizardState.destinations.map((d: any) => d.name)
    : [];
  // Route-planning instructions belong to the FIRST chunk only. Later chunks
  // must follow the route already laid down (see CONTINUITY RULES below) —
  // re-issuing "choose the optimal route" there made each chunk re-plan from
  // scratch and repeat inter-city transfers.
  const isContinuationChunk = (opts.dayFrom ?? 1) > 1;
  const multiCityNote = cityNames.length > 1
    ? (isContinuationChunk
      ? `\n- MULTI-CITY TRIP: ${cityNames.join(", ")}. The route was already chosen in the earlier days (see TRIP SO FAR below) — continue it, do not re-plan it.`
      : `\n- MULTI-CITY ROUTING: The traveler wants to visit ${cityNames.join(", ")} (this is an unordered wish-list, NOT a fixed order).${departureCity ? ` They depart from ${departureCity}.` : ""} You MUST choose the optimal route:
  1. ENTRY: Start at whichever of these cities is nearest and cheapest to reach from ${departureCity || "the origin"} — that is the arrival city (book the inbound flight/transport into it).
  2. ORDER: Then sequence the remaining cities by geographic proximity, minimizing total inter-city travel time — each next city should be the closest unvisited one. Do NOT just follow the order the traveler listed them.
  3. EXIT: Depart back to ${departureCity || "the origin"} from the LAST city in your route (book the return from there).
  4. Allocate days per city proportional to its size/attractions, and include realistic inter-city transport (train/flight/bus) as activities on the travel days. State the chosen route explicitly in the day titles/themes.`)
    : "";

  const accomType = wizardState.accommodation?.type || "hotel";
  const stars = wizardState.accommodation?.stars || 0;
  const priorities = wizardState.accommodation?.priorities?.join(", ") || "none specified";
  const accomSettled = !!wizardState.accommodation?.settled;
  const accomAddress = wizardState.accommodation?.hotelAddress || "";
  const accomCheckIn = wizardState.accommodation?.checkInDate || "";

  const flightsSettled = !!wizardState.flights?.settled;
  const settledFlightNumber = wizardState.flights?.flightNumber || "";
  const settledArrivalDate = wizardState.flights?.arrivalDate || "";

  const destName = wizardState.multiCity
    ? (wizardState.destinations?.[0]?.name || "")
    : (wizardState.destination?.name || "");
  const isSameCity = departureCity && destName
    && departureCity.toLowerCase() === destName.toLowerCase();

  const transportMode = wizardState.transport?.mode || null;
  const isNearbyTrip = (!!transportMode || !!wizardState.isNearbyTrip) && !isSameCity;
  const fareClass = wizardState.flights?.fareClass || "economy";
  const connectionPref = wizardState.flights?.connectionPref || "any";
  const transportLabel: Record<string, string> = {
    ferry: "ferry", bus: "bus / coach", train: "train / rail", drive: "self-drive / car rental"
  };

  const paceMap: Record<number, string> = { 1: "very relaxed", 2: "relaxed", 3: "balanced", 4: "active", 5: "packed" };
  const paceVal = wizardState.style?.pace || 3;
  const pace = paceMap[paceVal] || "balanced";

  const activityCountMap: Record<number, string> = {
    1: "5-6 activities per day with generous breaks and free time",
    2: "6-7 activities per day with comfortable spacing",
    3: "7-9 activities per day with moderate pacing",
    4: "9-11 activities per day, efficiently scheduled",
    5: "11-14 activities per day, hour-by-hour packed schedule"
  };
  // Long trips produce a lot of JSON; cap per-day density on 9+ day trips so the
  // whole itinerary fits in one model response within the wall-clock limit.
  const longTripCountMap: Record<number, string> = {
    1: "4-5 activities per day with generous breaks",
    2: "5-6 activities per day with comfortable spacing",
    3: "6-7 activities per day with moderate pacing",
    4: "7-8 activities per day, efficiently scheduled",
    5: "8-9 activities per day, a full but not exhausting schedule"
  };
  // When generating in chunks, each call covers only a few days, so full density
  // is affordable and we do NOT need the long-trip cap or brevity squeeze.
  const isLongTrip = !isChunk && days >= 9;
  const activityGuidance = (isLongTrip ? longTripCountMap : activityCountMap)[paceVal]
    || (isLongTrip ? longTripCountMap : activityCountMap)[3];
  const brevityNote = isLongTrip
    ? " Keep each activity description to ONE concise sentence and tips to a short phrase — this is a long trip, so prioritize covering all days completely over verbose detail."
    : "";

  const interests = wizardState.style?.activities?.join(", ") || "general sightseeing";

  const nightlifeVal = wizardState.style?.nightlife || 3;
  const nightlife = nightlifeVal >= 4 ? "Include evening/nightlife activities until late (10-11 PM)." : nightlifeVal <= 2 ? "Early evenings preferred, wrap up by 8-9 PM." : "";

  const foodVal = wizardState.style?.food || 3;
  const foodStyle = foodVal >= 4 ? "Recommend upscale restaurants and fine dining." : foodVal <= 2 ? "Focus on local street food, markets, and casual eateries." : "Mix of casual and nice restaurants.";

  const explorationVal = wizardState.style?.exploration || 3;
  const exploration = explorationVal >= 4 ? "Prioritize hidden gems, local neighborhoods, and off-the-beaten-path spots over tourist attractions." : explorationVal <= 2 ? "Focus on must-see landmarks and popular tourist attractions." : "Balance tourist highlights with local discoveries.";

  const freeDays = Array.isArray(wizardState.dates?.freeDays) ? wizardState.dates.freeDays : [];
  const freeDayNote = freeDays.length > 0
    ? `\n- FREE/WORK DAYS: The traveler has commitments ONLY on these specific dates: ${freeDays.join(", ")}. Keep ONLY these exact dates very light — only suggest a breakfast spot, a lunch option, and an evening dinner/activity. Leave the rest of each free day open. All OTHER days must be full itinerary days with normal activity planning. Do NOT make any other day light.`
    : "";

  const extras: string[] = [];
  if (wizardState.summary?.mustDo) extras.push(`Must-do: ${wizardState.summary.mustDo}`);
  if (wizardState.summary?.dietary) extras.push(`Dietary needs: ${wizardState.summary.dietary}`);
  if (wizardState.summary?.avoid) extras.push(`Avoid: ${wizardState.summary.avoid}`);
  if (wizardState.summary?.freeText) extras.push(`Additional notes: ${wizardState.summary.freeText}`);

  // Exact calendar date per chunk day, so the model cannot drift or skip dates.
  const chunkDateLines = hasFixedDates
    ? Array.from({ length: chunkDays }, (_, i) => {
        const n = dayFrom + i;
        return `  dayNumber ${n} = ${dateForDay(wizardState, n)}`;
      }).join("\n")
    : "";

  const priorSummary = isChunk ? summarizePriorDays(opts.priorDays || []) : "";

  const chunkScope = isChunk
    ? `\n\nIMPORTANT SCOPE: This is a ${days}-day trip overall, but generate ONLY days ${dayFrom} through ${dayTo} (${chunkDays} day${chunkDays > 1 ? "s" : ""}) in this response. Number them with their real dayNumber (${dayFrom}..${dayTo}).${chunkDateLines ? `\nUse these EXACT calendar dates:\n${chunkDateLines}` : " Use the correct calendar date for each."}${priorSummary ? `

TRIP SO FAR (days 1-${dayFrom - 1} are ALREADY FINALIZED — shown so you can continue them seamlessly):
${priorSummary}

CONTINUITY RULES (CRITICAL):
1. The trip continues EXACTLY where day ${dayFrom - 1} ends — same city, same hotel. Day ${dayFrom} starts in that city.
2. Do NOT re-plan the route, do NOT repeat any inter-city transfer that already happened above, and do NOT fly/train back to a city only to repeat an earlier transfer. ${cityNames.length > 1 ? "Any city from the wish-list already visited above is DONE unless the route above clearly returns through it." : ""}
3. Do NOT repeat venues, restaurants, or experiences already listed above — plan NEW ones.` : ` Maintain continuity with the rest of the trip (do not repeat venues a traveler would have seen on earlier days; assume earlier days covered the major highlights first).`}`
    : "";

  const prompt = `Create a comprehensive hour-by-hour travel itinerary for ${dest}.${chunkScope}

TRIP DETAILS:
- ${dateInfo}
- ${travelers} traveler${travelers > 1 ? "s" : ""}${departureCity ? `\n- Departing from: ${departureCity}${homeCountry ? `, ${homeCountry}` : ""}` : ""}${multiCityNote}
- Daily budget: ${currencySymbol}${budget} per person (${currency})
${accomSettled && accomAddress
  ? `- ACCOMMODATION (PRE-BOOKED): The traveler has ALREADY booked accommodation at "${accomAddress}"${accomCheckIn ? `, checking in ${accomCheckIn}` : ""}. Look up this property and return it as the ONLY accommodation option with badge "Pre-booked". Do NOT suggest alternative accommodation.`
  : `- Accommodation preference: ${accomType}${stars ? ` (${stars}-star)` : ""}, priorities: ${priorities}`}
${isSameCity
  ? `- The traveler LIVES in ${destName}. This is a LOCAL exploration trip. Do NOT include any flights, inter-city transport, or arrival logistics. Start the itinerary directly with Day 1 activities.`
  : isNearbyTrip
  ? `- This is a NEARBY trip — absolutely NO FLIGHTS. Do NOT invent, suggest, or mention any airline or flight — not even hypothetical ones. Primary transport: ${transportMode ? (transportLabel[transportMode] || transportMode) : "bus, train, or ferry (pick the most common option for this route)"}. Suggest realistic ground/sea transport options with schedules, operators, duration, and pricing.`
  : flightsSettled && settledFlightNumber
  ? `- FLIGHTS (PRE-BOOKED): The traveler has ALREADY booked flight ${settledFlightNumber}${settledArrivalDate ? ` arriving ${settledArrivalDate}` : ""}. Use this EXACT flight number and details for the inbound flight. Do NOT suggest a different airline or flight. For the return flight, suggest a realistic option from the same airline if possible.`
  : `- Flights: ${fareClass} class, ${connectionPref} connections`}
- Travel pace: ${pace} — plan ${activityGuidance}${brevityNote}
- Interests: ${interests}
- ${foodStyle}
- ${exploration}
${nightlife ? `- ${nightlife}` : ""}${freeDayNote}
${extras.length > 0 ? "\nSPECIAL REQUESTS:\n- " + extras.join("\n- ") : ""}

CRITICAL REQUIREMENTS:
1. Every activity MUST have a specific startTime in 24h format (e.g. "09:00", "14:30"). Plan from morning wake-up to evening.
2. Activities should be in chronological order by startTime.
3. Include MEALS: breakfast, lunch, dinner, and coffee/snack breaks as separate activities with specific restaurant recommendations.
4. For EVERY activity after the first of each day, include "transportOptions" — an array of UP TO 3 realistic ways to get from the previous venue:
   a) "walk" — walking directions (omit if distance > 25 min walk)
   b) "public" — public transit (tram, metro, mrt, bus, train, ferry) with route number/name and line name
   c) "private" — ride-share or taxi (Uber globally, Grab for Southeast Asia, DiDi for Australia/China, Gojek for Indonesia, Bolt for Europe/Africa)
   Each option needs: mode (e.g. "walk", "tram", "mrt", "uber"), label (human-readable). For transit with lines, use format: "MRT Downtown Line from Fort Canning to Stevens" or "Bus 96 from Bourke St to Flinders". ALWAYS include "from [boarding] to [alighting]" for transit. Duration (e.g. "8 min"), cost (e.g. "A$5", "Free"). For multi-leg transit, use SEPARATE transport options per leg — do NOT combine legs into one label. Also set "gettingThere" (a ONE-LINE summary of the recommended option), "transportMode", "transportDuration" and "transportCost".
5. Include a mix: sightseeing, meals, coffee, shopping, cultural experiences, relaxation based on the traveler's interests.
6. Use REAL venue names, addresses, and realistic current pricing in ${currency}.
7. Include latitude and longitude for every venue.
8. Write rich descriptions (2-3 sentences) explaining what makes each place special and what to expect.
9. Add practical tips for each activity (booking advice, best times, what to order, etc).
10. The timeSlot field should still categorize as morning/afternoon/evening for grouping.
11. For EVERY day, include a "weather" object with the expected weather conditions for that day based on the destination, season, and travel dates. Include condition (e.g. "sunny", "partly cloudy", "rainy"), highC and lowC temperatures in Celsius.
${!includeExtras ? `12. Output ONLY the "days" array for days ${dayFrom}..${dayTo}. Do NOT include flights, transport, accommodation, bookingChecklist, or savingsTips — those are generated separately.` : `${isNearbyTrip
  ? `12. Include "transport" (NOT "flights" — do NOT include a "flights" key at all) with suggested outbound and inbound ${transportMode ? (transportLabel[transportMode] || transportMode) : "ground/sea transport"} options — include operator name, mode (bus/train/ferry/drive), route, duration, schedule frequency, and pricing. For ferries include terminal names. For buses include bus operator and station. For trains include train service name and station. NEVER generate airline names or flight numbers.`
  : flightsSettled && settledFlightNumber
  ? `12. Include "flights" — the traveler has PRE-BOOKED flight ${settledFlightNumber}${settledArrivalDate ? ` arriving ${settledArrivalDate}` : ""}. Use this EXACT flight for the outbound/inbound entry. For the other direction, suggest a realistic return flight from the same airline.`
  : `12. Include "flights" with suggested outbound and inbound flight options for ${fareClass} class. ${departureCity ? `The OUTBOUND flight MUST depart from ${departureCity}${homeCountry ? ` (${homeCountry})` : ""} and arrive at the entry city you selected above; the INBOUND flight MUST return from the last city of the route back to ${departureCity}. Use airlines and routes that realistically serve ${departureCity}.` : "Use the traveler's stated origin as the departure point."} Recommend a specific airline with a realistic flight number (e.g. SQ237, QF9, JL3) and pricing.`}
${accomSettled && accomAddress
  ? `13. Include "accommodation" with ONLY the pre-booked property: "${accomAddress}". Look up the actual name, neighborhood, and details of this property. Return it as a single item with badge "Pre-booked". Do NOT add alternative options.`
  : `13. Include "accommodation" with hotel/apartment options matching the traveler's ${accomType} preference. Each item needs: name, area (neighborhood), priceRange, type, highlights, a badge (Recommended, Best Value, Best Location, or Luxury Pick), and "city" (which city it is in).${cityNames.length > 1 ? ` This is a MULTI-CITY trip — provide 2-3 options FOR EACH city the traveler stays in (${cityNames.join(", ")}), and set "city" to that city's name so options can be grouped per city.` : ` Provide 2-3 options and set "city" to ${destName || "the destination"}.`}`}
14. Include "bookingChecklist" — scan every activity and identify which ones need advance booking (museum tickets, restaurant reservations, tours, shows). Group into "Must Book Ahead" (sells out or requires reservation) and "Good to Book" (walk-in possible but booking saves time). Include the day number and a practical booking note.`}
${includeExtras ? `15. Include "savingsTips" — an array of 4-6 REAL, SPECIFIC money-saving tips for tourists in ${dest} during the travel dates. These MUST be:
   a) REAL programs, passes, discounts, or free services that actually exist (not generic advice)
   b) SPECIFIC to ${dest} and relevant to the travel dates/season
   c) Safe and legal for tourists to use
   d) Each tip needs: icon (emoji), title (the specific program/pass/offer name), description (what it is, how much it saves, eligibility, how to get it), and estimatedSaving (approximate savings in ${currency}, e.g. "${currencySymbol}50-80")` : ""}`;

  const systemPrompt = `You are a world-class travel planner who creates incredibly detailed, practical itineraries. Your itineraries read like a knowledgeable local friend guiding someone through the city hour by hour.

Key principles:
- Every activity has a specific start time and transport instructions from the previous location
- Recommend SPECIFIC restaurants, cafes, and bars by name — not generic "find a restaurant"
- Include realistic walking/transit times between venues
- Mix popular attractions with hidden gems locals love
- Account for opening hours, busy periods, and booking requirements
- Costs should be realistic current prices in local currency
- Descriptions should be vivid and helpful, not generic

The "tripTitle" should be SHORT: just the city or region name (e.g. "Melbourne", "Tokyo"). For multiple cities, join them with commas and an ampersand (e.g. "Barcelona & Madrid", "Tokyo, Osaka & Kyoto"). Do NOT include duration, day count, or long descriptive subtitles.

Respond ONLY with valid JSON. No markdown fences, no explanation — raw JSON only.`;

  const jsonSchema: Record<string, unknown> = {
    tripTitle: "string",
    days: [{
      dayNumber: "integer",
      date: "string (ISO 8601: YYYY-MM-DD)",
      title: "string",
      theme: "string",
      weather: { condition: "string", highC: "integer", lowC: "integer" },
      activities: [{
        startTime: "string (24h: 09:00)",
        timeSlot: "morning|afternoon|evening",
        sortOrder: "integer",
        title: "string",
        description: "string (2-3 sentences)",
        venueName: "string",
        venueAddress: "string",
        category: "string",
        durationMinutes: "integer",
        costAmount: "integer",
        costCurrency: "string",
        costNote: "string",
        latitude: "number",
        longitude: "number",
        tips: "string",
        gettingThere: "string",
        transportMode: "string",
        transportDuration: "string",
        transportCost: "string",
        transportOptions: [{ mode: "string", label: "string", duration: "string", cost: "string" }]
      }]
    }],
  };
  if (includeExtras) {
    jsonSchema.accommodation = [{ name: "string", area: "string", city: "string", priceRange: "string", type: "string", highlights: "string", badge: "string" }];
    jsonSchema.bookingChecklist = [{ group: "string", items: [{ label: "string", day: "integer", note: "string", url: "string (optional)" }] }];
    jsonSchema.savingsTips = [{ icon: "string (emoji)", title: "string", description: "string", estimatedSaving: "string" }];
    if (isNearbyTrip) {
      jsonSchema.transport = { outbound: { operator: "string", mode: "string", route: "string", terminal: "string", duration: "string", frequency: "string", priceRange: "string", tips: "string" }, inbound: { "...same fields": "" } };
    } else if (!isSameCity) {
      jsonSchema.flights = { outbound: { airline: "string", flightNumber: "string", route: "string", duration: "string", priceRange: "string", tips: "string" }, inbound: { "...same fields": "" } };
    }
  }

  const geminiSchema = {
    type: "object" as const,
    properties: {
      tripTitle: { type: "string" },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dayNumber: { type: "integer" },
            date: { type: "string", description: "ISO 8601 date: YYYY-MM-DD" },
            title: { type: "string" },
            theme: { type: "string" },
            weather: {
              type: "object",
              properties: { condition: { type: "string" }, highC: { type: "integer" }, lowC: { type: "integer" } },
              required: ["condition", "highC", "lowC"]
            },
            activities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  startTime: { type: "string" }, timeSlot: { type: "string", enum: ["morning", "afternoon", "evening"] },
                  sortOrder: { type: "integer" }, title: { type: "string" },
                  description: { type: "string" }, venueName: { type: "string" },
                  venueAddress: { type: "string" }, category: { type: "string" },
                  durationMinutes: { type: "integer" }, costAmount: { type: "integer" },
                  costCurrency: { type: "string" }, costNote: { type: "string" },
                  latitude: { type: "number" }, longitude: { type: "number" },
                  tips: { type: "string" }, gettingThere: { type: "string" },
                  transportMode: { type: "string" }, transportDuration: { type: "string" },
                  transportCost: { type: "string" },
                  transportOptions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { mode: { type: "string" }, label: { type: "string" }, duration: { type: "string" }, cost: { type: "string" } },
                      required: ["mode", "label", "duration", "cost"]
                    }
                  }
                },
                required: ["startTime", "timeSlot", "sortOrder", "title", "description", "venueName", "category", "durationMinutes", "costAmount", "costCurrency"]
              }
            }
          },
          required: ["dayNumber", "date", "title", "activities"]
        }
      },
      ...(includeExtras ? {
        ...(isNearbyTrip ? {
          transport: {
            type: "object",
            properties: {
              outbound: { type: "object", properties: { operator: { type: "string" }, mode: { type: "string" }, route: { type: "string" }, terminal: { type: "string" }, duration: { type: "string" }, frequency: { type: "string" }, priceRange: { type: "string" }, tips: { type: "string" } }, required: ["operator", "mode", "route", "duration", "priceRange"] },
              inbound: { type: "object", properties: { operator: { type: "string" }, mode: { type: "string" }, route: { type: "string" }, terminal: { type: "string" }, duration: { type: "string" }, frequency: { type: "string" }, priceRange: { type: "string" }, tips: { type: "string" } }, required: ["operator", "mode", "route", "duration", "priceRange"] }
            },
            required: ["outbound", "inbound"]
          }
        } : {
          flights: {
            type: "object",
            properties: {
              outbound: { type: "object", properties: { airline: { type: "string" }, flightNumber: { type: "string" }, route: { type: "string" }, duration: { type: "string" }, priceRange: { type: "string" }, tips: { type: "string" } }, required: ["airline", "flightNumber", "route", "duration", "priceRange"] },
              inbound: { type: "object", properties: { airline: { type: "string" }, flightNumber: { type: "string" }, route: { type: "string" }, duration: { type: "string" }, priceRange: { type: "string" }, tips: { type: "string" } }, required: ["airline", "flightNumber", "route", "duration", "priceRange"] }
            },
            required: ["outbound", "inbound"]
          }
        }),
        accommodation: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, area: { type: "string" }, city: { type: "string" }, priceRange: { type: "string" }, type: { type: "string" }, highlights: { type: "string" }, badge: { type: "string" } },
            required: ["name", "area", "priceRange", "type", "highlights", "badge"]
          }
        },
        bookingChecklist: {
          type: "array",
          items: {
            type: "object",
            properties: { group: { type: "string" }, items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, day: { type: "integer" }, note: { type: "string" }, url: { type: "string" } }, required: ["label", "day", "note"] } } },
            required: ["group", "items"]
          }
        },
        savingsTips: {
          type: "array",
          items: {
            type: "object",
            properties: {
              icon: { type: "string", description: "Emoji icon" },
              title: { type: "string", description: "Name of the specific program, pass, or offer" },
              description: { type: "string", description: "What it is, how to get it, eligibility" },
              estimatedSaving: { type: "string", description: "Approximate savings in local currency" }
            },
            required: ["icon", "title", "description", "estimatedSaving"]
          }
        }
      } : {})
    },
    required: includeExtras ? ["tripTitle", "days"] : ["days"]
  };

  return { prompt, systemPrompt, jsonSchema, geminiSchema, expectedDays: chunkDays, totalDays: days, dayFrom, dayTo, includeExtras, currency };
}

// Validate-and-salvage. Instead of rejecting a whole chunk because the model's
// response was truncated, keep every COMPLETE day (has activities) and let the
// day-cursor in the worker generate the remainder in the next invocation.
// fatal=true only when nothing usable survives — a truncated 2-of-4-day reply
// still moves the trip forward 2 days instead of burning the provider.
export function validateItinerary(data: any, expectedDays: number): { issues: string[]; fatal: boolean } {
  const issues: string[] = [];
  if (!data?.days || !Array.isArray(data.days) || data.days.length === 0) {
    return { issues: ["No days array"], fatal: true };
  }
  if (data.days.length > expectedDays) {
    issues.push(`AI returned ${data.days.length} days, trimming to ${expectedDays}`);
    data.days = data.days.slice(0, expectedDays);
  }

  // Drop incomplete days (truncated JSON usually cuts mid-day, leaving the last
  // day with no activities). The cursor regenerates whatever is dropped.
  const complete = data.days.filter((d: any) => Array.isArray(d.activities) && d.activities.length > 0);
  if (complete.length < data.days.length) {
    issues.push(`Dropped ${data.days.length - complete.length} incomplete day(s)`);
  }
  data.days = complete;

  if (data.days.length === 0) {
    return { issues: [...issues, "No complete days in response"], fatal: true };
  }
  if (data.days.length < expectedDays) {
    issues.push(`Expected ${expectedDays} days, got ${data.days.length} — remainder regenerates next pass`);
  }
  return { issues, fatal: false };
}

export async function callGemini(
  prompt: string, systemPrompt: string, geminiSchema: any,
  apiKey: string, model: string, maxOutputTokens = 32_000
): Promise<{ data: any; error: string | null }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt + "\nRespond ONLY with valid JSON matching the provided schema." }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      temperature: 0.7,
      maxOutputTokens,
      // 2.5 Flash is a thinking model. Leaving thinking UNBOUNDED lets it consume
      // the entire output-token budget and return empty text (finishReason
      // MAX_TOKENS). A small bounded budget keeps quality without starving output.
      thinkingConfig: { thinkingBudget: 512 },
    }
  };

  try {
    const res = await fetchWithTimeout(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, FETCH_TIMEOUT);

    if (!res.ok) {
      const errText = await res.text();
      const retryable = res.status === 429 || res.status === 503 || res.status === 502;
      return { data: null, error: `Gemini ${res.status}: ${errText.substring(0, 200)}${retryable ? " [retryable]" : ""}` };
    }

    const geminiData = await res.json();
    const cand = geminiData.candidates?.[0];
    const textContent = cand?.content?.parts?.[0]?.text;
    if (!textContent) {
      // Surface WHY there's no text (MAX_TOKENS, SAFETY, RECITATION...) so the
      // failure is diagnosable instead of an opaque "No content".
      const reason = cand?.finishReason || geminiData.promptFeedback?.blockReason || "unknown";
      return { data: null, error: `No content from Gemini (finishReason: ${reason})` };
    }

    const cleaned = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { data: null, error: "Gemini returned unparseable JSON (likely truncated)" };
    }
    if (!parsed.days || !Array.isArray(parsed.days)) return { data: null, error: "Gemini returned incomplete itinerary" };

    return { data: parsed, error: null };
  } catch (err: any) {
    if (err.name === "AbortError") return { data: null, error: "Gemini request timed out" };
    return { data: null, error: `Gemini error: ${err.message || "Unknown"}` };
  }
}

export async function callMistral(
  prompt: string, systemPrompt: string, jsonSchema: any, apiKey: string
): Promise<{ data: any; error: string | null }> {
  const schemaInstruction = `\n\nYou MUST return a JSON object matching this exact structure:\n${JSON.stringify(jsonSchema, null, 2)}\n\nReturn ONLY raw JSON. No markdown fences, no explanation.`;

  try {
    const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt + schemaInstruction },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    }, FETCH_TIMEOUT);

    if (!res.ok) {
      const errText = await res.text();
      const retryable = res.status === 429 || res.status === 503 || res.status === 502;
      return { data: null, error: `Mistral ${res.status}: ${errText.substring(0, 200)}${retryable ? " [retryable]" : ""}` };
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { data: null, error: "No content from Mistral" };

    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { data: null, error: "Mistral returned unparseable JSON (likely truncated)" };
    }
    if (!parsed.days || !Array.isArray(parsed.days)) return { data: null, error: "Mistral returned incomplete itinerary" };

    return { data: parsed, error: null };
  } catch (err: any) {
    if (err.name === "AbortError") return { data: null, error: "Mistral request timed out" };
    return { data: null, error: `Mistral error: ${err.message || "Unknown"}` };
  }
}

// Models occasionally emit coordinates as arrays or strings ("[60.16, 60.18]")
// which Postgres rejects with "invalid input syntax for type numeric". Coerce
// to a finite number or null.
function toFiniteNumber(v: unknown): number | null {
  if (Array.isArray(v)) v = v[0];
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const VALID_SLOTS = new Set(["morning", "afternoon", "evening"]);
function normSlot(raw: any): string {
  if (!raw) return "morning";
  const s = String(raw).toLowerCase().trim();
  if (VALID_SLOTS.has(s)) return s;
  if (s.includes("morning") || s.includes("breakfast")) return "morning";
  if (s.includes("afternoon") || s.includes("lunch")) return "afternoon";
  if (s.includes("evening") || s.includes("night") || s.includes("dinner")) return "evening";
  return "morning";
}

// Maps an AI itinerary (camelCase) into the snake_case p_days shape consumed by
// the replace_itinerary RPC. Currency falls back to the destination code, never
// blindly to USD when the activity itself specifies one.
export function toDbDays(itinerary: any, fallbackCurrency: string): any[] {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  return days.map((d: any, i: number) => {
    let safeDate: string | null = null;
    if (d.date) {
      const parsed = new Date(d.date);
      if (!isNaN(parsed.getTime())) safeDate = parsed.toISOString().slice(0, 10);
    }
    const activities = Array.isArray(d.activities) ? d.activities : [];
    return {
      day_number: d.dayNumber ?? d.day_number ?? (i + 1),
      date: safeDate,
      title: d.title || `Day ${d.dayNumber ?? (i + 1)}`,
      theme: d.theme || "",
      weather: d.weather || {},
      activities: activities.map((a: any, j: number) => ({
        time_slot: normSlot(a.timeSlot ?? a.time_slot),
        sort_order: a.sortOrder ?? a.sort_order ?? j,
        start_time: a.startTime ?? a.start_time ?? "",
        title: a.title ?? "",
        description: a.description ?? "",
        venue_name: a.venueName ?? a.venue_name ?? "",
        venue_address: a.venueAddress ?? a.venue_address ?? "",
        place_id: a.placeId ?? a.place_id ?? "",
        category: a.category ?? "culture",
        duration_minutes: a.durationMinutes ?? a.duration_minutes ?? 60,
        cost_amount: Math.round(a.costAmount ?? a.cost_amount ?? 0),
        cost_currency: a.costCurrency ?? a.cost_currency ?? fallbackCurrency,
        cost_note: a.costNote ?? a.cost_note ?? "",
        latitude: toFiniteNumber(a.latitude),
        longitude: toFiniteNumber(a.longitude),
        booking_url: a.bookingUrl ?? a.booking_url ?? "",
        tips: a.tips ?? "",
        getting_there: a.gettingThere ?? a.getting_there ?? "",
        transport_mode: a.transportMode ?? a.transport_mode ?? "",
        transport_duration: a.transportDuration ?? a.transport_duration ?? "",
        transport_cost: a.transportCost ?? a.transport_cost ?? "",
        transport_options: a.transportOptions ?? a.transport_options ?? [],
      })),
    };
  });
}

// Re-sanitise accumulated db-shaped days right before the atomic save. Days
// generated before a sanitiser fix may carry malformed values (e.g. array
// coordinates) that Postgres rejects; this heals them without regeneration.
export function sanitizeDbDays(days: any[]): any[] {
  return (days || []).map((d: any) => ({
    ...d,
    activities: (d.activities || []).map((a: any) => ({
      ...a,
      latitude: toFiniteNumber(a.latitude),
      longitude: toFiniteNumber(a.longitude),
      cost_amount: Math.round(toFiniteNumber(a.cost_amount) ?? 0),
    })),
  }));
}

export function buildExtras(itinerary: any, provider: string): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (itinerary.flights) extras.flights = itinerary.flights;
  if (itinerary.transport) extras.transport = itinerary.transport;
  if (itinerary.accommodation) extras.accommodation = itinerary.accommodation;
  if (itinerary.bookingChecklist) extras.bookingChecklist = itinerary.bookingChecklist;
  if (itinerary.savingsTips) extras.savingsTips = itinerary.savingsTips;
  extras.provider = provider;
  return extras;
}
