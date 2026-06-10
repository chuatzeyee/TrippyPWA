// Async itinerary generation worker (chunked).
//
// A trip is generated in day-batches ("chunks"). Each invocation runs ONE chunk
// with ONE provider, so every model call stays well within the ~150s isolate
// budget no matter how long or packed the trip is. The first chunk also produces
// the trip-level extras (flights, accommodation, booking checklist, savings tips).
// Days accumulate on the job row; when the last chunk lands, the whole itinerary
// is saved atomically via the replace_itinerary RPC. On a provider failure within
// a chunk we fall back to the next provider; if all providers fail for a chunk the
// job fails. The client never holds the request open: it watches the trip row via
// Realtime.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPromptAndSchema, validateItinerary, callGemini, callMistral,
  toDbDays, buildExtras, planChunks, tripDayCount, dateForDay,
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

async function failJob(jobId: string, tripId: string, error: string, meta: Record<string, unknown>) {
  await admin.from("generation_jobs").update({ status: "failed", error }).eq("id", jobId);
  await admin.from("trips").update({ status: "failed" }).eq("id", tripId);
  logDb("error", error, meta);
}

async function selfInvoke(jobId: string, tripId: string) {
  // Fire the next chunk/provider as a separate invocation (fresh wall-clock).
  try {
    const res = await fetch(SELF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ jobId }),
    });
    if (!res.ok) throw new Error(`self-invoke ${res.status}`);
  } catch (e: any) {
    await failJob(jobId, tripId, `Self-invoke failed: ${e?.message}`, { jobId, tripId });
  }
}

async function runChunk(jobId: string) {
  const { data: job } = await admin.from("generation_jobs").select("*").eq("id", jobId).single();
  if (!job) { logDb("error", "Job not found", { jobId }); return; }
  if (job.status === "succeeded" || job.status === "failed") return; // already terminal

  const wizardState = job.wizard_state || {};
  const totalDays = job.total_days || tripDayCount(wizardState);
  const chunkSize = job.chunk_size || 4;
  const chunks = planChunks(totalDays, chunkSize);
  const chunkIdx: number = job.chunk_idx || 0;

  const providers: string[] = job.provider_order || ["gemini", "mistral"];
  const providerIdx: number = job.provider_idx || 0;

  // All chunks done: save the accumulated itinerary atomically.
  if (chunkIdx >= chunks.length) {
    const dbDays = (job.result_days as any[]) || [];
    const extras = (job.result_extras as Record<string, unknown>) || {};
    const { error: rpcErr } = await admin.rpc("replace_itinerary", {
      p_trip_id: job.trip_id,
      p_title: job.result_title || "",
      p_extras: extras,
      p_days: dbDays,
    });
    if (rpcErr) {
      await failJob(jobId, job.trip_id, `Save failed: ${rpcErr.message}`, { jobId, tripId: job.trip_id });
      return;
    }
    await admin.from("generation_jobs").update({ status: "succeeded", error: "" }).eq("id", jobId);
    const actCount = dbDays.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0);
    logDb("info", `Itinerary generated (${dbDays.length}/${totalDays} days, ${actCount} activities, ${chunks.length} chunks)`,
      { jobId, tripId: job.trip_id, userId: job.user_id });
    return;
  }

  if (providerIdx >= providers.length) {
    await failJob(jobId, job.trip_id, `Generation failed: all providers failed on chunk ${chunkIdx + 1}/${chunks.length}`,
      { jobId, tripId: job.trip_id, userId: job.user_id, error: job.error });
    return;
  }

  const { from, to } = chunks[chunkIdx];
  const isFirstChunk = chunkIdx === 0;
  const provider = providers[providerIdx];

  await admin.from("generation_jobs").update({
    status: "processing", last_provider: provider,
    lease_until: new Date(Date.now() + 160_000).toISOString(),
  }).eq("id", jobId);

  const { prompt, systemPrompt, jsonSchema, geminiSchema, expectedDays, currency } =
    buildPromptAndSchema(wizardState, {
      dayFrom: from, dayTo: to, includeExtras: isFirstChunk,
      priorDays: (job.result_days as any[]) || [],
    });

  const callProvider = async (): Promise<{ data: any; error: string | null }> => {
    if (provider === "gemini" && GEMINI_API_KEY) {
      return callGemini(prompt, systemPrompt, geminiSchema, GEMINI_API_KEY, GEMINI_MODEL);
    }
    if (provider === "mistral" && MISTRAL_API_KEY) {
      return callMistral(prompt, systemPrompt, jsonSchema, MISTRAL_API_KEY);
    }
    return { data: null, error: `Provider ${provider} not configured` };
  };

  const started = Date.now();
  let result = await callProvider();

  // Transient capacity errors (503/502/429, tagged [retryable]) usually clear in
  // seconds — retry the same provider once before burning it and falling back.
  // Only when the failure came back fast (a 503 returns in ~1-2s): 15s gate +
  // 5s backoff + 125s retry fetch stays within the 150s isolate wall-clock.
  if (!result.data && result.error?.includes("[retryable]") && Date.now() - started < 15_000) {
    logDb("info", `${provider} returned a transient error on chunk ${chunkIdx + 1}, retrying once`,
      { jobId, tripId: job.trip_id, userId: job.user_id, provider, error: result.error });
    await new Promise(r => setTimeout(r, 5_000));
    result = await callProvider();
  }

  if (result.data) {
    const { fatal, issues } = validateItinerary(result.data, expectedDays);
    if (fatal) {
      result = { data: null, error: `Validation failed: ${issues[0]}` };
      logDb("warn", `${provider} produced an invalid chunk ${chunkIdx + 1}`, { jobId, tripId: job.trip_id, issues });
    }
  }

  if (result.data) {
    // Accumulate this chunk's days; capture extras + title from the first chunk.
    // Day numbers and dates are stamped deterministically from the chunk range —
    // models drift (skipped or duplicate dates at chunk seams) when left to them.
    const newDays = toDbDays(result.data, currency).map((d: any, i: number) => {
      const n = from + i;
      return { ...d, day_number: n, date: dateForDay(wizardState, n) ?? d.date };
    });
    const accumulated = [ ...((job.result_days as any[]) || []), ...newDays ];
    const update: Record<string, unknown> = {
      result_days: accumulated,
      chunk_idx: chunkIdx + 1,
      provider_idx: 0, // reset provider for the next chunk
      // Stay 'processing' with a fresh lease between chunks so recover_stale_jobs
      // cannot requeue an in-flight job and double-run a chunk (which would
      // duplicate days in result_days). The next invocation re-leases.
      status: "processing",
      lease_until: new Date(Date.now() + 160_000).toISOString(),
      error: "",
    };
    if (isFirstChunk) {
      update.result_extras = buildExtras(result.data, provider);
      update.result_title = result.data.tripTitle || "";
    }
    await admin.from("generation_jobs").update(update).eq("id", jobId);
    logDb("info", `Chunk ${chunkIdx + 1}/${chunks.length} done via ${provider} (days ${from}-${to}, ${newDays.length} days)`,
      { jobId, tripId: job.trip_id, userId: job.user_id, provider });
    await selfInvoke(jobId, job.trip_id);
    return;
  }

  // Provider failed on this chunk. Advance provider; if exhausted, fail the job.
  const nextProvider = providerIdx + 1;
  await admin.from("generation_jobs").update({
    provider_idx: nextProvider, attempt: (job.attempt || 0) + 1, error: result.error || "Unknown",
    // Stay 'processing' with a fresh lease while a fallback is pending (same
    // anti-double-run reasoning as the chunk-advance path).
    status: nextProvider < providers.length ? "processing" : "failed",
    lease_until: nextProvider < providers.length ? new Date(Date.now() + 160_000).toISOString() : null,
  }).eq("id", jobId);

  logDb("warn", `${provider} failed on chunk ${chunkIdx + 1}, ${nextProvider < providers.length ? "falling back" : "no more providers"}`,
    { jobId, tripId: job.trip_id, userId: job.user_id, provider, error: result.error });

  if (nextProvider < providers.length) {
    await selfInvoke(jobId, job.trip_id);
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
      EdgeRuntime.waitUntil(runChunk(jobId));
      return new Response(JSON.stringify({ accepted: true, jobId }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback (local dev / older runtime): run inline so the job never stalls.
    await runChunk(jobId);
    return new Response(JSON.stringify({ accepted: true, jobId, inline: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
