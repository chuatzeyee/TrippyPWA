import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
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
    const isNomad = wizardState.profile?.isNomad || false;

    const accomType = wizardState.accommodation?.type || "hotel";
    const stars = wizardState.accommodation?.stars || 0;
    const priorities = wizardState.accommodation?.priorities?.join(", ") || "none specified";

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
      ? `\n- FREE/WORK DAYS: The traveler has commitments on ${freeDays.join(", ")}. Keep these days very light — only suggest a breakfast spot, a lunch option, and an evening dinner/activity. Leave the rest of the day free for work or conferences.`
      : "";

    const extras = [];
    if (wizardState.summary?.mustDo) extras.push(`Must-do: ${wizardState.summary.mustDo}`);
    if (wizardState.summary?.dietary) extras.push(`Dietary needs: ${wizardState.summary.dietary}`);
    if (wizardState.summary?.avoid) extras.push(`Avoid: ${wizardState.summary.avoid}`);
    if (wizardState.summary?.freeText) extras.push(`Additional notes: ${wizardState.summary.freeText}`);

    const prompt = `Create a comprehensive hour-by-hour ${days}-day travel itinerary for ${dest}.

TRIP DETAILS:
- ${dateInfo}
- ${travelers} traveler${travelers > 1 ? "s" : ""}${departureCity ? `\n- Departing from: ${departureCity}${homeCountry ? `, ${homeCountry}` : ""}` : ""}
- Daily budget: ${currencySymbol}${budget} per person (${currency})
- Accommodation preference: ${accomType}${stars ? ` (${stars}-star)` : ""}, priorities: ${priorities}
${isSameCity
  ? `- The traveler LIVES in ${destName}. This is a LOCAL exploration trip. Do NOT include any flights, inter-city transport, or arrival logistics. Start the itinerary directly with Day 1 activities.`
  : isNearbyTrip
  ? `- This is a NEARBY trip — NO FLIGHTS. Primary transport: ${transportLabel[transportMode] || transportMode}. Suggest ${transportLabel[transportMode] || transportMode} options with schedules, operators, duration, and pricing instead of flights.`
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
  : `12. Include "flights" with suggested outbound and inbound flight options — recommend a specific airline with a realistic flight number (e.g. SQ237, QF9, JL3) and pricing for ${fareClass} class.`}
13. Include "accommodation" with 2-3 hotel/apartment options at different price points matching the traveler's ${accomType} preference. Include name, neighborhood, price range, type, highlights, and a badge (Recommended, Best Value, Best Location, or Luxury Pick).
14. Include "bookingChecklist" — scan every activity and identify which ones need advance booking (museum tickets, restaurant reservations, tours, shows). Group into "Must Book Ahead" (sells out or requires reservation) and "Good to Book" (walk-in possible but booking saves time). Include the day number and a practical booking note.`;

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      systemInstruction: {
        parts: [{
          text: `You are a world-class travel planner who creates incredibly detailed, practical itineraries. Your itineraries read like a knowledgeable local friend guiding someone through the city hour by hour.

Key principles:
- Every activity has a specific start time and transport instructions from the previous location
- Recommend SPECIFIC restaurants, cafes, and bars by name — not generic "find a restaurant"
- Include realistic walking/transit times between venues
- Mix popular attractions with hidden gems locals love
- Account for opening hours, busy periods, and booking requirements
- Costs should be realistic current prices in local currency
- Descriptions should be vivid and helpful, not generic

The "tripTitle" should be SHORT: just the city or region name (e.g. "Melbourne", "Tokyo", "Barcelona to Madrid"). Do NOT include duration, day count, or long descriptive subtitles.

Respond ONLY with valid JSON matching the provided schema.`
        }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
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
                    description: "Expected weather for this day",
                    properties: {
                      condition: { type: "string", description: "Weather condition: sunny, partly cloudy, cloudy, rainy, stormy, snowy" },
                      highC: { type: "integer", description: "Expected high temperature in Celsius" },
                      lowC: { type: "integer", description: "Expected low temperature in Celsius" }
                    },
                    required: ["condition", "highC", "lowC"]
                  },
                  activities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        startTime: { type: "string", description: "24h time e.g. 09:00, 14:30" },
                        timeSlot: { type: "string", enum: ["morning", "afternoon", "evening"] },
                        sortOrder: { type: "integer" },
                        title: { type: "string" },
                        description: { type: "string", description: "2-3 sentences about what makes this place special" },
                        venueName: { type: "string" },
                        venueAddress: { type: "string" },
                        category: { type: "string" },
                        durationMinutes: { type: "integer" },
                        costAmount: { type: "integer" },
                        costCurrency: { type: "string" },
                        costNote: { type: "string" },
                        latitude: { type: "number" },
                        longitude: { type: "number" },
                        tips: { type: "string" },
                        gettingThere: { type: "string", description: "One-line summary of recommended transport, e.g. 'Tram 96, 15 min, A$5'" },
                        transportMode: { type: "string", description: "Primary mode: walk, tram, bus, train, taxi, uber, ferry, drive" },
                        transportDuration: { type: "string", description: "e.g. 10 min, 25 min" },
                        transportCost: { type: "string", description: "e.g. Free, A$5, included in day pass" },
                        transportOptions: {
                          type: "array",
                          description: "Up to 3 transport alternatives: walk, public transit, private hire",
                          items: {
                            type: "object",
                            properties: {
                              mode: { type: "string", description: "Transport mode: walk, tram, bus, metro, mrt, train, taxi, uber, grab, gojek, bolt, ferry, bicycle" },
                              label: { type: "string", description: "Human-readable route with from/to stations, e.g. 'MRT Downtown Line from Bugis to Bayfront', 'Tram 96 from Bourke St to Flinders', 'Walk along Collins Street'" },
                              duration: { type: "string", description: "e.g. 8 min, 15 min" },
                              cost: { type: "string", description: "e.g. Free, A$5, A$12-15" }
                            },
                            required: ["mode", "label", "duration", "cost"]
                          }
                        }
                      },
                      required: ["startTime", "timeSlot", "sortOrder", "title", "description", "venueName", "category", "durationMinutes", "costAmount", "costCurrency"]
                    }
                  }
                },
                required: ["dayNumber", "title", "activities"]
              }
            },
            ...(isNearbyTrip ? {
              transport: {
                type: "object",
                description: `Suggested ${transportLabel[transportMode] || "transport"} options for this nearby trip`,
                properties: {
                  outbound: {
                    type: "object",
                    properties: {
                      operator: { type: "string", description: "Transport operator name, e.g. Batam Fast, KLIA Express, StarMart" },
                      mode: { type: "string", description: "ferry, bus, train, or drive" },
                      route: { type: "string", description: "e.g. HarbourFront → Batam Centre" },
                      terminal: { type: "string", description: "Departure terminal or station name" },
                      duration: { type: "string", description: "e.g. 1h 15m" },
                      frequency: { type: "string", description: "e.g. Every 30 min, 4 daily departures" },
                      priceRange: { type: "string", description: "e.g. S$25-40" },
                      tips: { type: "string" }
                    },
                    required: ["operator", "mode", "route", "duration", "priceRange"]
                  },
                  inbound: {
                    type: "object",
                    properties: {
                      operator: { type: "string" },
                      mode: { type: "string" },
                      route: { type: "string" },
                      terminal: { type: "string" },
                      duration: { type: "string" },
                      frequency: { type: "string" },
                      priceRange: { type: "string" },
                      tips: { type: "string" }
                    },
                    required: ["operator", "mode", "route", "duration", "priceRange"]
                  }
                },
                required: ["outbound", "inbound"]
              }
            } : {
              flights: {
                type: "object",
                description: "Suggested flight options for this trip",
                properties: {
                  outbound: {
                    type: "object",
                    properties: {
                      airline: { type: "string" },
                      flightNumber: { type: "string", description: "e.g. SQ237, QF9, JL3" },
                      route: { type: "string", description: "e.g. SIN → MEL" },
                      duration: { type: "string", description: "e.g. 7h 15m" },
                      priceRange: { type: "string", description: "e.g. $400-600" },
                      tips: { type: "string", description: "Booking tips, best time to book, etc." }
                    },
                    required: ["airline", "flightNumber", "route", "duration", "priceRange"]
                  },
                  inbound: {
                    type: "object",
                    properties: {
                      airline: { type: "string" },
                      flightNumber: { type: "string", description: "e.g. SQ238, QF10" },
                      route: { type: "string" },
                      duration: { type: "string" },
                      priceRange: { type: "string" },
                      tips: { type: "string" }
                    },
                    required: ["airline", "flightNumber", "route", "duration", "priceRange"]
                  }
                },
                required: ["outbound", "inbound"]
              }
            }),
            accommodation: {
              type: "array",
              description: "2-3 accommodation options at different price points",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  area: { type: "string", description: "Neighborhood, e.g. CBD, Shibuya" },
                  priceRange: { type: "string", description: "e.g. $120-200/night" },
                  type: { type: "string", description: "e.g. boutique hotel, apartment, hostel" },
                  highlights: { type: "string", description: "Key features, 1-2 sentences" },
                  badge: { type: "string", description: "One of: Recommended, Best Value, Best Location, Luxury Pick" }
                },
                required: ["name", "area", "priceRange", "type", "highlights", "badge"]
              }
            },
            bookingChecklist: {
              type: "array",
              description: "Items that need advance booking, grouped by priority",
              items: {
                type: "object",
                properties: {
                  group: { type: "string", description: "Group name: Must Book Ahead, Good to Book, No Booking Needed" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", description: "Activity or restaurant name" },
                        day: { type: "integer", description: "Which day number this is on" },
                        note: { type: "string", description: "Booking tip, e.g. 'Sells out weeks ahead', 'Walk-in OK but long wait'" },
                        url: { type: "string", description: "Official booking URL if known" }
                      },
                      required: ["label", "day", "note"]
                    }
                  }
                },
                required: ["group", "items"]
              }
            }
          },
          required: ["tripTitle", "days"]
        },
        temperature: 0.7
      }
    };

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      let detail = "";
      try { detail = JSON.parse(errText)?.error?.message || errText.substring(0, 200); } catch { detail = errText.substring(0, 200); }
      return new Response(
        JSON.stringify({ error: `Gemini ${geminiRes.status}: ${detail}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "No content returned from AI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let itinerary;
    try {
      itinerary = JSON.parse(textContent);
    } catch {
      console.error("Failed to parse Gemini JSON:", textContent.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Invalid response format from AI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!itinerary.days || !Array.isArray(itinerary.days)) {
      return new Response(
        JSON.stringify({ error: "AI returned incomplete itinerary" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(itinerary),
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
