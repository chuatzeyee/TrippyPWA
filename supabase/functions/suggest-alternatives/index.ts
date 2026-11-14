import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { clip, corsHeadersFor, getCallerUserId, json, overDailyLimit, readJsonBody } from "../_shared/http.ts";
import { callGemini } from "../_shared/generation.ts";

// Tap-for-alternatives (feedback: "mango sticky rice was suggested — let me
// click for 1-2 alternatives like pho or toast and pick one lazily").
// One Gemini Flash call per tap (~$0.001). Returns 2-3 drop-in replacement
// activities near the original, same budget band, different style.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

// Input bounds: everything below is interpolated into the prompt.
const MAX_BODY_BYTES = 64_000;
const MAX_USED_VENUES = 60;
const MAX_FIELD = 120;
const DAILY_LIMIT = 150;            // alternative lookups per user per day

const SCHEMA = {
  type: "object",
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          venueName: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          costAmount: { type: "number" },
          durationMinutes: { type: "number" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          tips: { type: "string" },
        },
        required: ["title", "venueName", "description", "category", "costAmount", "latitude", "longitude"],
      },
    },
  },
  required: ["alternatives"],
};

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);
  if (!GEMINI_API_KEY) return json({ error: "Not configured" }, 500, corsHeaders);

  try {
    const { body, status } = await readJsonBody(req, MAX_BODY_BYTES);
    if (status === 413) return json({ error: "Request too large" }, 413, corsHeaders);
    const raw = body && typeof body === "object" ? body.activity : null;
    const title = clip(raw?.title, MAX_FIELD);
    if (!title) return json({ error: "activity required" }, 400, corsHeaders);

    const venueName = clip(raw.venue_name, MAX_FIELD);
    const category = clip(raw.category, 40);
    const startTime = clip(raw.start_time, 8);
    const cost = Number.isFinite(Number(raw.cost_amount)) ? Math.max(0, Math.round(Number(raw.cost_amount))) : 0;
    const lat = Number(raw.latitude);
    const lng = Number(raw.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const destination = clip(body.destination, 100);
    const currency = /^[A-Za-z]{3}$/.test(String(body.currency || "")) ? String(body.currency).toUpperCase() : "USD";
    const usedVenues = (Array.isArray(body.usedVenues) ? body.usedVenues : [])
      .slice(0, MAX_USED_VENUES).map((v: unknown) => clip(v, 80)).filter(Boolean);

    if (await overDailyLimit(req, "alternatives", DAILY_LIMIT)) {
      return json({ error: "Daily limit for alternatives reached. Try again tomorrow." }, 429, corsHeaders);
    }

    const near = hasCoords
      ? `near latitude ${lat}, longitude ${lng} (within ~1.5km)`
      : `in ${destination || "the same area"}`;

    const prompt = `A traveler has this activity in their itinerary:
"${title}" at ${venueName || "an unnamed venue"} (category: ${category || "general"}, around ${startTime || "daytime"}, cost about ${cost} ${currency}).

Suggest exactly 3 REAL alternative venues/activities ${near} for the same time slot:
- Each must be a genuinely different style/cuisine/experience from the original AND from each other.
- Same rough budget band (within ~50% of the original cost). Costs in ${currency}.
- Real venue names with real coordinates.
- Do NOT suggest any of these already-used venues: ${usedVenues.join("; ") || "(none)"}.
- Do NOT suggest the original venue.
- Keep descriptions to 1-2 sentences; include one practical tip each.`;

    const { data, error } = await callGemini(
      prompt,
      "You are a precise local travel guide. Only real venues. Respond in the given JSON schema.",
      SCHEMA, GEMINI_API_KEY, GEMINI_MODEL, 4_000,
    );
    if (error || !data?.alternatives?.length) {
      return json({ error: error || "No alternatives found" }, 502, corsHeaders);
    }

    return new Response(JSON.stringify({ alternatives: data.alternatives.slice(0, 3) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return json({ error: "Internal error" }, 500, corsHeaders);
  }
});
