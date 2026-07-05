import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, json } from "../_shared/http.ts";
import { callGemini } from "../_shared/generation.ts";

// Tap-for-alternatives (feedback: "mango sticky rice was suggested — let me
// click for 1-2 alternatives like pho or toast and pick one lazily").
// One Gemini Flash call per tap (~$0.001). Returns 2-3 drop-in replacement
// activities near the original, same budget band, different style.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

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
    const { activity, destination, currency = "USD", usedVenues = [] } = await req.json();
    if (!activity?.title) return json({ error: "activity required" }, 400, corsHeaders);

    const near = Number.isFinite(Number(activity.latitude)) && Number(activity.latitude) !== 0
      ? `near latitude ${activity.latitude}, longitude ${activity.longitude} (within ~1.5km)`
      : `in ${destination || "the same area"}`;

    const prompt = `A traveler has this activity in their itinerary:
"${activity.title}" at ${activity.venue_name || "an unnamed venue"} (category: ${activity.category || "general"}, around ${activity.start_time || "daytime"}, cost about ${activity.cost_amount || 0} ${currency}).

Suggest exactly 3 REAL alternative venues/activities ${near} for the same time slot:
- Each must be a genuinely different style/cuisine/experience from the original AND from each other.
- Same rough budget band (within ~50% of the original cost). Costs in ${currency}.
- Real venue names with real coordinates.
- Do NOT suggest any of these already-used venues: ${usedVenues.slice(0, 60).join("; ") || "(none)"}.
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
