import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { clip, corsHeadersFor, getCallerUserId, json, overDailyLimit, readJsonBody } from "../_shared/http.ts";
import { callGemini } from "../_shared/generation.ts";

// Chat edits on the itinerary ("make day 2 more relaxed", "swap dinner for
// something vegetarian"). One Gemini call: trip context + user message ->
// a STRUCTURED PATCH of activity-level edits. The client previews the patch
// as a diff and applies it via the existing repositories — this function never
// writes anything itself.
//
// ponytail: activities only in v1. Flights/hotels live in extras with different
// shapes; add a patch type for them if chat editing earns it.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

// Input bounds: the client sends the whole trip, so cap what reaches the prompt.
const MAX_BODY_BYTES = 1_000_000;   // same ceiling as a trip import file
const MAX_DAYS = 60;                // IMPORT_LIMITS.maxDays
const MAX_ACTS_PER_DAY = 40;        // IMPORT_LIMITS.maxActivitiesPerDay
const MAX_FIELD = 120;              // per title / venue / category in the context
const MAX_MESSAGE = 500;
const DAILY_LIMIT = 60;             // chat requests per user per day

const PATCH_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["modify", "remove", "add"] },
          activityId: { type: "string" },
          dayNumber: { type: "number" },
          reason: { type: "string" },
          activity: {
            type: "object",
            properties: {
              title: { type: "string" },
              venueName: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              startTime: { type: "string" },
              durationMinutes: { type: "number" },
              costAmount: { type: "number" },
              latitude: { type: "number" },
              longitude: { type: "number" },
              tips: { type: "string" },
            },
          },
        },
        required: ["op", "dayNumber", "reason"],
      },
    },
  },
  required: ["reply", "edits"],
};

// Bounded copy of the client's days: only the fields the prompt uses, capped in
// count and length, so a request cannot inflate the model call.
function boundedDays(days: any[]): any[] {
  return days.slice(0, MAX_DAYS).filter((d) => d && typeof d === "object").map((d: any) => ({
    day_number: Number.isFinite(Number(d.day_number)) ? Math.trunc(Number(d.day_number)) : 0,
    date: clip(d.date, 10),
    title: clip(d.title, MAX_FIELD),
    activities: (Array.isArray(d.activities) ? d.activities : [])
      .slice(0, MAX_ACTS_PER_DAY)
      .filter((a: any) => a && typeof a === "object")
      .map((a: any) => ({
        id: clip(a.id, 64),
        start_time: clip(a.start_time, 8),
        title: clip(a.title, MAX_FIELD),
        venue_name: clip(a.venue_name, MAX_FIELD),
        category: clip(a.category, 40),
        cost_amount: Number.isFinite(Number(a.cost_amount)) ? Math.round(Number(a.cost_amount)) : 0,
      })),
  }));
}

// Compact trip context: id/day/time/venue/cost per activity, enough for the
// model to reference real ids without blowing the token budget.
function tripContext(days: any[]): string {
  return days.map((d: any) => {
    const acts = d.activities.map((a: any) =>
      `  [${a.id}] ${a.start_time || "?"} ${a.title} @ ${a.venue_name || "?"} (${a.category || "?"}, ${a.cost_amount})`
    ).join("\n");
    return `Day ${d.day_number}${d.date ? ` (${d.date})` : ""}: ${d.title}\n${acts}`;
  }).join("\n");
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);
  if (!GEMINI_API_KEY) return json({ error: "Not configured" }, 500, corsHeaders);

  try {
    const { body, status } = await readJsonBody(req, MAX_BODY_BYTES);
    if (status === 413) return json({ error: "Trip too large to edit by chat" }, 413, corsHeaders);
    if (!body || typeof body !== "object") return json({ error: "message and days required" }, 400, corsHeaders);
    const message = clip(body.message, MAX_MESSAGE);
    if (!message || !Array.isArray(body.days)) return json({ error: "message and days required" }, 400, corsHeaders);
    const days = boundedDays(body.days);
    const destination = clip(body.destination, 100);
    const currency = /^[A-Za-z]{3}$/.test(String(body.currency || "")) ? String(body.currency).toUpperCase() : "USD";

    if (await overDailyLimit(req, "chat", DAILY_LIMIT)) {
      return json({ error: "Daily chat limit reached. Try again tomorrow." }, 429, corsHeaders);
    }

    const prompt = `CURRENT ITINERARY for a trip to ${destination || "the destination"} (costs in ${currency}):
${tripContext(days)}

TRAVELER REQUEST: "${message}"

Produce activity-level edits that fulfil the request:
- "modify": include activityId of the existing activity and the full replacement "activity" object (real venue, real coordinates).
- "remove": include activityId.
- "add": include dayNumber, no activityId, and the full new "activity" object with a startTime that fits the day's flow.
- Only touch what the request asks for. Keep everything else intact.
- Never schedule a venue already used elsewhere in the trip.
- If the request is about flights or hotels, return zero edits and explain in "reply" that only day activities can be edited here for now.
- "reply" is a short friendly summary of what you changed (or why nothing changed).`;

    const { data, error } = await callGemini(
      prompt,
      "You are a precise travel itinerary editor. Only real venues with real coordinates. Respond in the given JSON schema.",
      PATCH_SCHEMA, GEMINI_API_KEY, GEMINI_MODEL, 8_000, false,
    );
    if (error || !data) return json({ error: error || "No response" }, 502, corsHeaders);

    // Validate edits reference real activity ids; drop any that don't.
    const validIds = new Set<string>();
    for (const d of days) for (const a of d.activities) if (a.id) validIds.add(a.id);
    const edits = (data.edits || []).filter((e: any) =>
      e.op === "add" ? !!e.activity?.title : validIds.has(e.activityId));

    return new Response(JSON.stringify({ reply: data.reply || "", edits }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return json({ error: "Internal error" }, 500, corsHeaders);
  }
});
