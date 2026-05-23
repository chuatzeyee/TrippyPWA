import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FETCH_TIMEOUT = 120_000;

function buildPromptAndSchema(wizardState: any) {
  const dest = wizardState.multiCity && wizardState.destinations?.length > 0
    ? wizardState.destinations.map((d: any) => d.name).join(", ")
    : wizardState.destination?.name;

  const dateInfo = wizardState.dates?.start
    ? `Fixed dates: ${wizardState.dates.start} to ${wizardState.dates.end}`
    : `Flexible: approximately ${wizardState.dates?.duration || 7} days, ${wizardState.dates?.season || "any season"}`;

  const days = wizardState.dates?.duration || (
    wizardState.dates?.start && wizardState.dates?.end
      ? Math.round((new Date(wizardState.dates.end).getTime() - new Date(wizardState.dates.start).getTime()) / 86400000) + 1
      : 7
  );

  const currency = wizardState.destination?.currencyCode || "USD";
  const currencySymbol = wizardState.destination?.currencySymbol || "$";
  const budget = wizardState.budget?.dailyAmount || 100;
  const travelers = wizardState.travelers || 1;

  const homeCity = wizardState.profile?.homeCity || "";
  const homeCountry = wizardState.profile?.homeCountry || "";
  const departureCity = wizardState.departureCity || homeCity;

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
  const isNearbyTrip = !!transportMode && !isSameCity;
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
  const activityGuidance = activityCountMap[paceVal] || activityCountMap[3];

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

  const prompt = `Create a comprehensive hour-by-hour ${days}-day travel itinerary for ${dest}.

TRIP DETAILS:
- ${dateInfo}
- ${travelers} traveler${travelers > 1 ? "s" : ""}${departureCity ? `\n- Departing from: ${departureCity}${homeCountry ? `, ${homeCountry}` : ""}` : ""}
- Daily budget: ${currencySymbol}${budget} per person (${currency})
${accomSettled && accomAddress
  ? `- ACCOMMODATION (PRE-BOOKED): The traveler has ALREADY booked accommodation at "${accomAddress}"${accomCheckIn ? `, checking in ${accomCheckIn}` : ""}. Look up this property and return it as the ONLY accommodation option with badge "Pre-booked". Do NOT suggest alternative accommodation.`
  : `- Accommodation preference: ${accomType}${stars ? ` (${stars}-star)` : ""}, priorities: ${priorities}`}
${isSameCity
  ? `- The traveler LIVES in ${destName}. This is a LOCAL exploration trip. Do NOT include any flights, inter-city transport, or arrival logistics. Start the itinerary directly with Day 1 activities.`
  : isNearbyTrip
  ? `- This is a NEARBY trip — NO FLIGHTS. Primary transport: ${transportLabel[transportMode] || transportMode}. Suggest ${transportLabel[transportMode] || transportMode} options with schedules, operators, duration, and pricing instead of flights.`
  : flightsSettled && settledFlightNumber
  ? `- FLIGHTS (PRE-BOOKED): The traveler has ALREADY booked flight ${settledFlightNumber}${settledArrivalDate ? ` arriving ${settledArrivalDate}` : ""}. Use this EXACT flight number and details for the inbound flight. Do NOT suggest a different airline or flight. For the return flight, suggest a realistic option from the same airline if possible.`
  : `- Flights: ${fareClass} class, ${connectionPref} connections`}
- Travel pace: ${pace} — plan ${activityGuidance}
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
   Each option needs: mode (e.g. "walk", "tram", "mrt", "uber"), label (human-readable). For transit with lines, use format: "MRT Downtown Line from Fort Canning to Stevens" or "Bus 96 from Bourke St to Flinders". ALWAYS include "from [boarding] to [alighting]" for transit. Duration (e.g. "8 min"), cost (e.g. "A$5", "Free"). For multi-leg transit, use SEPARATE transport options per leg — do NOT combine legs into one label. Also keep "gettingThere" as a one-line summary of the recommended option.
5. Include a mix: sightseeing, meals, coffee, shopping, cultural experiences, relaxation based on the traveler's interests.
6. Use REAL venue names, addresses, and realistic current pricing in ${currency}.
7. Include latitude and longitude for every venue.
8. Write rich descriptions (2-3 sentences) explaining what makes each place special and what to expect.
9. Add practical tips for each activity (booking advice, best times, what to order, etc).
10. The timeSlot field should still categorize as morning/afternoon/evening for grouping.
11. For EVERY day, include a "weather" object with the expected weather conditions for that day based on the destination, season, and travel dates. Include condition (e.g. "sunny", "partly cloudy", "rainy"), highC and lowC temperatures in Celsius.
${isNearbyTrip
  ? `12. Include "transport" (NOT flights) with suggested outbound and inbound ${transportLabel[transportMode] || "transport"} options — include operator name, route, duration, schedule frequency, and pricing. For ferries include terminal names. For buses include bus operator and station. For trains include train service name and station.`
  : flightsSettled && settledFlightNumber
  ? `12. Include "flights" — the traveler has PRE-BOOKED flight ${settledFlightNumber}${settledArrivalDate ? ` arriving ${settledArrivalDate}` : ""}. Use this EXACT flight for the outbound/inbound entry. For the other direction, suggest a realistic return flight from the same airline.`
  : `12. Include "flights" with suggested outbound and inbound flight options — recommend a specific airline with a realistic flight number (e.g. SQ237, QF9, JL3) and pricing for ${fareClass} class.`}
${accomSettled && accomAddress
  ? `13. Include "accommodation" with ONLY the pre-booked property: "${accomAddress}". Look up the actual name, neighborhood, and details of this property. Return it as a single item with badge "Pre-booked". Do NOT add alternative options.`
  : `13. Include "accommodation" with 2-3 hotel/apartment options at different price points matching the traveler's ${accomType} preference. Include name, neighborhood, price range, type, highlights, and a badge (Recommended, Best Value, Best Location, or Luxury Pick).`}
14. Include "bookingChecklist" — scan every activity and identify which ones need advance booking (museum tickets, restaurant reservations, tours, shows). Group into "Must Book Ahead" (sells out or requires reservation) and "Good to Book" (walk-in possible but booking saves time). Include the day number and a practical booking note.
15. Include "savingsTips" — an array of 4-6 REAL, SPECIFIC money-saving tips for tourists in ${dest} during the travel dates. These MUST be:
   a) REAL programs, passes, discounts, or free services that actually exist (not generic advice)
   b) SPECIFIC to ${dest} and relevant to the travel dates/season
   c) Safe and legal for tourists to use
   d) Each tip needs: icon (emoji), title (the specific program/pass/offer name), description (what it is, how much it saves, eligibility, how to get it), and estimatedSaving (approximate savings in ${currency}, e.g. "${currencySymbol}50-80")
   Examples of GOOD tips: "Melbourne Free Tram Zone — all trams within the CBD are free for everyone", "Japan Rail Pass 7-Day — ¥50,000 covers unlimited Shinkansen", "Paris Museum Pass 4-Day — €62 covers 50+ museums vs €15-17 each", "Free museum Sundays — first Sunday of each month, most national museums are free"
   Examples of BAD tips: "Check for discounts" (too vague), "Eat street food" (generic), "Use public transport" (obvious)`;

  const systemPrompt = `You are a world-class travel planner who creates incredibly detailed, practical itineraries. Your itineraries read like a knowledgeable local friend guiding someone through the city hour by hour.

Key principles:
- Every activity has a specific start time and transport instructions from the previous location
- Recommend SPECIFIC restaurants, cafes, and bars by name — not generic "find a restaurant"
- Include realistic walking/transit times between venues
- Mix popular attractions with hidden gems locals love
- Account for opening hours, busy periods, and booking requirements
- Costs should be realistic current prices in local currency
- Descriptions should be vivid and helpful, not generic

The "tripTitle" should be SHORT: just the city or region name (e.g. "Melbourne", "Tokyo", "Barcelona to Madrid"). Do NOT include duration, day count, or long descriptive subtitles.

Respond ONLY with valid JSON. No markdown fences, no explanation — raw JSON only.`;

  const jsonSchema = {
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
    flights: { outbound: { airline: "string", flightNumber: "string", route: "string", duration: "string", priceRange: "string", tips: "string" }, inbound: { "...same fields": "" } },
    transport: { outbound: { operator: "string", mode: "string", route: "string", terminal: "string", duration: "string", frequency: "string", priceRange: "string", tips: "string" }, inbound: { "...same fields": "" } },
    accommodation: [{ name: "string", area: "string", priceRange: "string", type: "string", highlights: "string", badge: "string" }],
    bookingChecklist: [{ group: "string", items: [{ label: "string", day: "integer", note: "string", url: "string (optional)" }] }],
    savingsTips: [{ icon: "string (emoji)", title: "string", description: "string", estimatedSaving: "string" }]
  };

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
              properties: {
                condition: { type: "string" },
                highC: { type: "integer" },
                lowC: { type: "integer" }
              },
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
          properties: { name: { type: "string" }, area: { type: "string" }, priceRange: { type: "string" }, type: { type: "string" }, highlights: { type: "string" }, badge: { type: "string" } },
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
    },
    required: ["tripTitle", "days"]
  };

  return { prompt, systemPrompt, jsonSchema, geminiSchema };
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function callMistral(prompt: string, systemPrompt: string, jsonSchema: any): Promise<{ data: any; error: string | null }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 10000, 20000];

  const schemaInstruction = `\n\nYou MUST return a JSON object matching this exact structure:\n${JSON.stringify(jsonSchema, null, 2)}\n\nReturn ONLY raw JSON. No markdown fences, no explanation.`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
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

      if (res.status === 429 || res.status === 503) {
        console.error(`Mistral ${res.status} on attempt ${attempt + 1}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        const errText = await res.text();
        return { data: null, error: `Mistral ${res.status}: ${errText.substring(0, 200)}` };
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("Mistral API error:", errText);
        return { data: null, error: `Mistral ${res.status}: ${errText.substring(0, 200)}` };
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) return { data: null, error: "No content from Mistral" };

      const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      if (!parsed.days || !Array.isArray(parsed.days)) return { data: null, error: "Mistral returned incomplete itinerary" };

      return { data: parsed, error: null };
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.error(`Mistral timeout on attempt ${attempt + 1}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        return { data: null, error: "Mistral request timed out" };
      }
      return { data: null, error: `Mistral error: ${err.message || "Unknown"}` };
    }
  }

  return { data: null, error: "Mistral: all retries exhausted" };
}

async function callGemini(prompt: string, systemPrompt: string, geminiSchema: any): Promise<{ data: any; error: string | null }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 10000, 20000];

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt + "\nRespond ONLY with valid JSON matching the provided schema." }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      temperature: 0.7
    }
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, FETCH_TIMEOUT);

      if (res.status === 429 || res.status === 503) {
        console.error(`Gemini ${res.status} on attempt ${attempt + 1}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        const errText = await res.text();
        return { data: null, error: `Gemini ${res.status}: ${errText.substring(0, 200)}` };
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini API error:", errText);
        return { data: null, error: `Gemini ${res.status}: ${errText.substring(0, 200)}` };
      }

      const geminiData = await res.json();
      const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textContent) return { data: null, error: "No content from Gemini" };

      const cleaned = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      if (!parsed.days || !Array.isArray(parsed.days)) return { data: null, error: "Gemini returned incomplete itinerary" };

      return { data: parsed, error: null };
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.error(`Gemini timeout on attempt ${attempt + 1}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        return { data: null, error: "Gemini request timed out" };
      }
      return { data: null, error: `Gemini error: ${err.message || "Unknown"}` };
    }
  }

  return { data: null, error: "Gemini: all retries exhausted" };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!MISTRAL_API_KEY && !GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No AI provider configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wizardState = await req.json();

    if (!wizardState?.destination?.name && !(wizardState?.destinations?.length > 0)) {
      return new Response(
        JSON.stringify({ error: "Destination is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, systemPrompt, jsonSchema, geminiSchema } = buildPromptAndSchema(wizardState);

    let result: { data: any; error: string | null } = { data: null, error: null };
    let provider = "";

    if (MISTRAL_API_KEY) {
      provider = "Mistral";
      console.log("Trying Mistral (primary)...");
      result = await callMistral(prompt, systemPrompt, jsonSchema);
    }

    if (!result.data && GEMINI_API_KEY) {
      if (provider) console.log(`${provider} failed: ${result.error}. Falling back to Gemini...`);
      provider = "Gemini";
      result = await callGemini(prompt, systemPrompt, geminiSchema);
    }

    if (!result.data) {
      return new Response(
        JSON.stringify({ error: result.error || "All AI providers failed", retryable: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Itinerary generated via ${provider}`);
    return new Response(
      JSON.stringify(result.data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
