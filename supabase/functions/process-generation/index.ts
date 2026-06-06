// Async itinerary generation worker.
//
// Each invocation processes ONE provider attempt for a job, so every provider
// gets its own fresh ~150s isolate budget instead of sharing one (the old
// sequential design starved the Mistral fallback). On success it saves the
// itinerary atomically via the replace_itinerary RPC and marks the trip
// 'generated'. On a recoverable failure it advances to the next provider and
// re-invokes itself. The client never holds the request open — it watches the
// trip row via Realtime.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPromptAndSchema, validateItinerary, callGemini, callMistral,
  toDbDays, buildExtras,
} from "../_shared/generation.ts";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SELF_URL = `${SUPABASE_URL}/functions/v1/process-generation`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logDb(level: string, message: string, metadata: Record<string, unknown> = {}) {
  admin.from("app_logs").insert({
    level, category: "generation", message, metadata, source: "edge",
    user_id: (metadata.userId as string) || null,
    trip_id: (metadata.tripId as string) || null,
  }).then(() => {}).catch(() => {});
}

async function runProvider(jobId: string) {
  const { data: job } = await admin.from("generation_jobs").select("*").eq("id", jobId).single();
  if (!job) { logDb("error", "Job not found", { jobId }); return; }
  if (job.status === "succeeded" || job.status === "failed") return; // already terminal

  const providers: string[] = job.provider_order || ["gemini", "mistral"];
  const idx: number = job.provider_idx || 0;

  if (idx >= providers.length) {
    await admin.from("generation_jobs").update({ status: "failed", error: job.error || "All providers failed" }).eq("id", jobId);
    await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
    logDb("error", "Generation failed: all providers exhausted", { jobId, tripId: job.trip_id, userId: job.user_id, error: job.error });
    return;
  }

  const provider = providers[idx];
  await admin.from("generation_jobs").update({
    status: "processing", last_provider: provider,
    lease_until: new Date(Date.now() + 160_000).toISOString(),
  }).eq("id", jobId);

  const wizardState = job.wizard_state || {};
  const { prompt, systemPrompt, jsonSchema, geminiSchema, expectedDays, currency } = buildPromptAndSchema(wizardState);

  let result: { data: any; error: string | null } = { data: null, error: "No provider key" };
  if (provider === "gemini" && GEMINI_API_KEY) {
    result = await callGemini(prompt, systemPrompt, geminiSchema, GEMINI_API_KEY, GEMINI_MODEL);
  } else if (provider === "mistral" && MISTRAL_API_KEY) {
    result = await callMistral(prompt, systemPrompt, jsonSchema, MISTRAL_API_KEY);
  } else {
    result = { data: null, error: `Provider ${provider} not configured` };
  }

  let warnings: string[] = [];
  if (result.data) {
    const { issues, fatal } = validateItinerary(result.data, expectedDays);
    warnings = issues;
    if (fatal) {
      result = { data: null, error: `Validation failed: ${issues[0]}` };
      logDb("warn", `${provider} produced an invalid itinerary`, { jobId, tripId: job.trip_id, issues });
    }
  }

  if (result.data) {
    const dbDays = toDbDays(result.data, currency);
    const extras = buildExtras(result.data, provider);
    const { error: rpcErr } = await admin.rpc("replace_itinerary", {
      p_trip_id: job.trip_id,
      p_title: result.data.tripTitle || "",
      p_extras: extras,
      p_days: dbDays,
    });
    if (rpcErr) {
      // Save failed — the RPC is transactional so the old itinerary is intact.
      await admin.from("generation_jobs").update({ status: "failed", error: `Save failed: ${rpcErr.message}` }).eq("id", jobId);
      await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
      logDb("error", "replace_itinerary RPC failed", { jobId, tripId: job.trip_id, error: rpcErr.message });
      return;
    }
    await admin.from("generation_jobs").update({
      status: "succeeded", validation_warnings: warnings, error: "",
    }).eq("id", jobId);
    // trips.status is set to 'generated' inside the RPC.
    const actCount = dbDays.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0);
    logDb("info", `Itinerary generated via ${provider} (${dbDays.length}/${expectedDays} days, ${actCount} activities)`,
      { jobId, tripId: job.trip_id, userId: job.user_id, provider, validationWarnings: warnings });
    return;
  }

  // Provider failed. Advance to the next provider and re-invoke.
  const nextIdx = idx + 1;
  await admin.from("generation_jobs").update({
    provider_idx: nextIdx, attempt: (job.attempt || 0) + 1, error: result.error || "Unknown",
    status: nextIdx < providers.length ? "queued" : "failed",
  }).eq("id", jobId);

  logDb("warn", `${provider} failed, ${nextIdx < providers.length ? "falling back" : "no more providers"}`,
    { jobId, tripId: job.trip_id, userId: job.user_id, provider, error: result.error });

  if (nextIdx < providers.length) {
    // Fire the next provider as a separate invocation (fresh wall-clock budget).
    // If the self-invoke fails to even dispatch, the job would be orphaned in
    // 'queued' forever, so mark it failed in that case.
    try {
      const res = await fetch(SELF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) throw new Error(`self-invoke ${res.status}`);
    } catch (e: any) {
      logDb("error", "Self-invoke failed, marking job failed", { jobId, tripId: job.trip_id, error: e?.message });
      await admin.from("generation_jobs").update({ status: "failed", error: `Self-invoke failed: ${e?.message}` }).eq("id", jobId);
      await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
    }
  } else {
    await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Respond immediately; do the slow work in the background so the caller (and
    // the platform's request timer) is not held open for the provider latency.
    // @ts-ignore EdgeRuntime is provided by the Supabase Deno runtime.
    const bg = (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil);
    if (bg) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runProvider(jobId));
      return new Response(JSON.stringify({ accepted: true, jobId }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback (local dev / older runtime): run inline so the job never stalls.
    await runProvider(jobId);
    return new Response(JSON.stringify({ accepted: true, jobId, inline: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
