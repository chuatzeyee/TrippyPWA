import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, json, overDailyLimit, readJsonBody } from "../_shared/http.ts";
import { callGemini, GEMINI_FALLBACK_MODEL, GEMINI_PRIMARY_MODEL } from "../_shared/generation.ts";
import {
  boundedHistory, boundedPlan, buildChatPrompt, CHAT_LIMITS, CHAT_REPLY_SCHEMA, CHAT_SYSTEM_PROMPT, chatReply, clip,
} from "../_shared/chat-plan.mjs";

// The trip chat (Trippy Concierge). One Gemini call: the bounded plan, the
// last few turns and the traveller's message go in; an answer comes out,
// with proposed edits when the message asks for a change (activities, a note
// on a stop, stays, a booked flight). Every edit is validated against the ids
// and indexes that were sent. The client shows each as a proposal and writes
// it only when the traveller applies it: this function never writes anything.
// The pure parts live in ../_shared/chat-plan.mjs (tested in Node).

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const DAILY_LIMIT = 60;             // chat requests per user per day

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);
  if (!GEMINI_API_KEY) return json({ error: "Not configured" }, 500, corsHeaders);

  try {
    const { body, status } = await readJsonBody(req, CHAT_LIMITS.maxBodyBytes);
    if (status === 413) return json({ error: "Trip too large for the chat" }, 413, corsHeaders);
    if (!body || typeof body !== "object") return json({ error: "message and days required" }, 400, corsHeaders);
    const message = clip(body.message, CHAT_LIMITS.message);
    if (!message || !Array.isArray(body.days)) return json({ error: "message and days required" }, 400, corsHeaders);
    const plan = boundedPlan(body);

    if (await overDailyLimit(req, "chat", DAILY_LIMIT)) {
      return json({ error: "Daily chat limit reached. Try again tomorrow." }, 429, corsHeaders);
    }

    // The free tier's quota is per model: when the main model refuses or fails, the lighter one answers.
    const prompt = buildChatPrompt(plan, boundedHistory(body.history), message);
    let { data, error } = await callGemini(prompt, CHAT_SYSTEM_PROMPT, CHAT_REPLY_SCHEMA, GEMINI_API_KEY, GEMINI_PRIMARY_MODEL, 8_000, false);
    if (error || !data) {
      ({ data, error } = await callGemini(prompt, CHAT_SYSTEM_PROMPT, CHAT_REPLY_SCHEMA, GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, 8_000, false));
    }
    if (error || !data) {
      console.error("itinerary-chat: both models failed", String(error).slice(0, 300));
      return json({ error: /\b429\b/.test(String(error)) ? "busy" : "No response" }, 502, corsHeaders);
    }

    return json(chatReply(data, plan), 200, corsHeaders);
  } catch {
    return json({ error: "Internal error" }, 500, corsHeaders);
  }
});
