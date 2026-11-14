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
  buildPromptAndSchema, validateItinerary, dedupeFoodVenues, callGemini, callMistral,
  toDbDays, buildExtras, planChunks, tripDayCount, dateForDay, sanitizeDbDays,
} from "../_shared/generation.ts";
import { computeTownGroups } from "../_shared/towns.ts";
import { CORS_MAX_AGE, isServiceRoleRequest } from "../_shared/http.ts";

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
  "Access-Control-Max-Age": CORS_MAX_AGE,
};

// Hard limits. Job rows are client-inserted, so never trust their sizes:
// a huge trip, tiny chunks or a long provider list would multiply model calls.
const MAX_TRIP_DAYS = 60;            // same ceiling as trip import
const MIN_CHUNK_SIZE = 2;
const MAX_CHUNK_SIZE = 6;
const DEFAULT_CHUNK_SIZE = 4;
const KNOWN_PROVIDERS = ["gemini", "mistral"];
const MAX_JOB_FAILURES = 24;         // provider failures across the whole job
const LEASE_MS = 160_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
}

function providerList(order: unknown): string[] {
  const list = Array.isArray(order) ? order.filter((p) => KNOWN_PROVIDERS.includes(p)) : [];
  return list.length ? [...new Set(list as string[])] : KNOWN_PROVIDERS;
}

// The job row is client-inserted. Before the service-role worker writes to
// job.trip_id, confirm job.user_id may edit that trip: owner, admin, or an
// editor collaborator (mirrors is_trip_editor: claimed user id or invited email).
async function jobMayWriteTrip(job: any): Promise<boolean> {
  const { data: trip } = await admin.from("trips").select("user_id").eq("id", job.trip_id).maybeSingle();
  if (!trip) return false;
  if (trip.user_id === job.user_id) return true;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", job.user_id).maybeSingle();
  if (profile?.role === "admin") return true;
  const { data: editors } = await admin.from("trip_collaborators")
    .select("user_id, invited_email").eq("trip_id", job.trip_id).eq("role", "editor");
  if (!editors?.length) return false;
  if (editors.some((c: any) => c.user_id === job.user_id)) return true;
  const { data: u } = await admin.auth.admin.getUserById(job.user_id);
  const email = String(u?.user?.email || "").toLowerCase();
  return !!email && editors.some((c: any) => String(c.invited_email || "").toLowerCase() === email);
}

// Outside callers (the app) may only START a job: claim it atomically while it
// is queued or its lease has expired, so repeated or parallel POSTs of the same
// jobId cannot run parallel chains. Continuations (selfInvoke) carry the
// service-role key and skip the claim.
async function claimJob(jobId: string): Promise<any | null> {
  const now = new Date();
  const claim = { status: "processing", lease_until: new Date(now.getTime() + LEASE_MS).toISOString() };
  const claimWhere = () => admin.from("generation_jobs").update(claim)
    .eq("id", jobId).in("status", ["queued", "processing"]);
  // Two single-condition updates, not one .or(): PostgREST re-applies or()
  // filters to the RETURNED rows (PostgREST#3707), and lease_until has just
  // moved into the future, so a successful claim would come back empty.
  const unleased = await claimWhere().is("lease_until", null).select("*");
  if (unleased.data?.[0]) return unleased.data[0];
  const expired = await claimWhere().lt("lease_until", now.toISOString()).select("*");
  return expired.data?.[0] || null;
}

function logDb(level: string, message: string, metadata: Record<string, unknown> = {}) {
  admin.from("app_logs").insert({
    level, category: "generation", message, metadata, source: "edge",
    user_id: (metadata.userId as string) || null,
    trip_id: (metadata.tripId as string) || null,
  }).then(() => {}, () => {});
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

// Each chunk may try every provider twice (two full rounds) before the job
// fails: round one absorbs transient capacity errors, round two catches the
// case where both providers hiccupped in the same minute.
const MAX_PROVIDER_ROUNDS = 2;

async function runChunk(jobId: string, continuation: boolean) {
  let job: any = null;
  if (continuation) {
    ({ data: job } = await admin.from("generation_jobs").select("*").eq("id", jobId).maybeSingle());
    if (!job) { logDb("error", "Job not found", { jobId }); return; }
  } else {
    job = await claimJob(jobId);
    if (!job) { logDb("info", "Job not claimable (running, finished or unknown); ignoring start", { jobId }); return; }
  }
  if (job.status === "succeeded" || job.status === "failed") return; // already terminal

  if (!(await jobMayWriteTrip(job))) {
    // Fail the JOB only: the trip belongs to someone else, never touch it.
    await admin.from("generation_jobs").update({ status: "failed", error: "Not allowed", lease_until: null }).eq("id", jobId);
    logDb("warn", "Rejected generation job for a trip the requester cannot edit",
      { jobId, tripId: job.trip_id, userId: job.user_id });
    return;
  }

  const wizardState = job.wizard_state || {};
  const totalDays = Number(job.total_days) > 0 ? Math.trunc(Number(job.total_days)) : tripDayCount(wizardState);
  if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > MAX_TRIP_DAYS) {
    // User-safe wording: the app may show generation_jobs.error for this case.
    const reason = totalDays > MAX_TRIP_DAYS
      ? `Trips can be up to ${MAX_TRIP_DAYS} days long. Please shorten the dates.`
      : "This trip's dates are not valid. Please pick the dates again.";
    await failJob(jobId, job.trip_id, reason, { jobId, tripId: job.trip_id, userId: job.user_id, totalDays });
    return;
  }
  if ((Number(job.attempt) || 0) >= MAX_JOB_FAILURES) {
    await failJob(jobId, job.trip_id, `Generation failed: too many provider failures (${job.attempt})`,
      { jobId, tripId: job.trip_id, userId: job.user_id });
    return;
  }
  const chunkSize = clampInt(job.chunk_size, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE, DEFAULT_CHUNK_SIZE);
  const chunks = planChunks(totalDays, chunkSize);

  // Day-cursor chunking: the next chunk always starts after the last day we
  // actually HAVE, not at a precomputed boundary. A salvaged partial chunk
  // (e.g. 2 of 4 days) simply advances the cursor by 2 and the next pass
  // regenerates from day 3 of that range — no work is thrown away.
  const daysDone: number = Array.isArray(job.result_days) ? job.result_days.length : 0;
  const chunkIdx = Math.min(Math.floor(daysDone / chunkSize), chunks.length - 1);

  const providers: string[] = providerList(job.provider_order);
  const providerIdx: number = clampInt(job.provider_idx, 0, providers.length * MAX_PROVIDER_ROUNDS, 0);

  // All days generated: save the accumulated itinerary atomically.
  if (daysDone >= totalDays) {
    const dbDays = sanitizeDbDays((job.result_days as any[]) || []);
    const extras = (job.result_extras as Record<string, unknown>) || {};

    // Pre-compute the Towns tab (reverse-geocoded neighbourhoods) so the client
    // renders it instantly. Best-effort and time-capped: a geocoding outage
    // must never block the itinerary save — the client falls back to on-device
    // geocoding when extras.towns is absent.
    try {
      const towns = await computeTownGroups(dbDays, wizardState);
      if (towns.length > 0) extras.towns = towns;
    } catch (e: any) {
      logDb("warn", "Towns precompute failed; client will geocode on demand",
        { jobId, tripId: job.trip_id, error: e?.message });
    }

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
    logDb("info", `Itinerary generated (${dbDays.length}/${totalDays} days, ${actCount} activities, ${chunks.length} chunks, ${(extras.towns as any[])?.length || 0} town groups)`,
      { jobId, tripId: job.trip_id, userId: job.user_id });

    // Resolve + store venue/town photos once, in a separate invocation, so this
    // chunk's wall-clock is unaffected. Best-effort: a photo outage never blocks
    // the (already-saved) itinerary; the client falls back to a live fetch.
    fetch(`${SUPABASE_URL}/functions/v1/resolve-trip-photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ tripId: job.trip_id }),
    }).catch(() => {});
    return;
  }

  if (providerIdx >= providers.length * MAX_PROVIDER_ROUNDS) {
    await failJob(jobId, job.trip_id, `Generation failed: all providers exhausted on chunk ${chunkIdx + 1}/${chunks.length}`,
      { jobId, tripId: job.trip_id, userId: job.user_id, error: job.error });
    return;
  }

  // Generate from the cursor to the end of the current chunk's range.
  const from = daysDone + 1;
  const to = Math.min(chunks[chunkIdx].to, totalDays);
  const isFirstChunk = daysDone === 0;
  const provider = providers[providerIdx % providers.length];

  await admin.from("generation_jobs").update({
    status: "processing", last_provider: provider,
    lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
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

  // Second round = both providers already failed once this chunk. Pause before
  // retrying so a shared upstream hiccup has time to clear (fresh 150s budget,
  // so 20s is affordable).
  if (providerIdx >= providers.length) {
    await new Promise(r => setTimeout(r, 20_000));
  }

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
    } else {
      // Drop days that repeat a food venue (partial-day salvage; the cursor
      // regenerates dropped days). If the FIRST day repeats, the chunk is empty
      // and falls through to the provider-retry path like any bad chunk.
      const dupeIssues = dedupeFoodVenues(result.data, (job.result_days as any[]) || []);
      if (dupeIssues.length) {
        logDb("warn", `Chunk ${chunkIdx + 1} repeated venues`, { jobId, tripId: job.trip_id, issues: dupeIssues });
        if (result.data.days.length === 0) {
          result = { data: null, error: `Validation failed: ${dupeIssues[0]}` };
        }
      }
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
      chunk_idx: Math.floor(accumulated.length / chunkSize), // observability only; cursor derives from result_days
      provider_idx: 0, // fresh provider rounds for the next pass
      // Stay 'processing' with a fresh lease between chunks so recover_stale_jobs
      // cannot requeue an in-flight job and double-run a chunk (which would
      // duplicate days in result_days). The next invocation re-leases.
      status: "processing",
      lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
      error: "",
    };
    if (isFirstChunk) {
      update.result_extras = buildExtras(result.data, provider);
      update.result_title = result.data.tripTitle || "";
    }
    await admin.from("generation_jobs").update(update).eq("id", jobId);
    const partial = newDays.length < (to - from + 1) ? ` (partial, ${to - (from + newDays.length - 1)} day(s) regenerate next pass)` : "";
    logDb("info", `Days ${from}-${from + newDays.length - 1}/${totalDays} done via ${provider}${partial}`,
      { jobId, tripId: job.trip_id, userId: job.user_id, provider });
    await selfInvoke(jobId, job.trip_id);
    return;
  }

  // Provider failed on this chunk. Advance provider; if both rounds are
  // exhausted, fail the job.
  const nextProvider = providerIdx + 1;
  const exhausted = nextProvider >= providers.length * MAX_PROVIDER_ROUNDS;
  await admin.from("generation_jobs").update({
    provider_idx: nextProvider, attempt: (job.attempt || 0) + 1, error: result.error || "Unknown",
    // Stay 'processing' with a fresh lease while a fallback is pending (same
    // anti-double-run reasoning as the chunk-advance path).
    status: exhausted ? "failed" : "processing",
    lease_until: exhausted ? null : new Date(Date.now() + LEASE_MS).toISOString(),
  }).eq("id", jobId);

  logDb("warn", `${provider} failed on chunk ${chunkIdx + 1}, ${!exhausted ? (nextProvider >= providers.length ? "starting second provider round" : "falling back") : "no more providers"}`,
    { jobId, tripId: job.trip_id, userId: job.user_id, provider, error: result.error });

  if (!exhausted) {
    await selfInvoke(jobId, job.trip_id);
  } else {
    await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobId } = await req.json().catch(() => ({}));
    if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
      return new Response(JSON.stringify({ error: "jobId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Deployed with --no-verify-jwt (self-invocation uses the service key), so
    // the gateway checks nothing: only an exact service-key match continues a
    // running chain; anyone else can at most start a queued job (claimJob).
    const continuation = await isServiceRoleRequest(req);

    // Respond immediately; do the slow work in the background so the caller (and
    // the platform's request timer) is not held open for the provider latency.
    // @ts-ignore EdgeRuntime is provided by the Supabase Deno runtime.
    const bg = (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil);
    if (bg) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runChunk(jobId, continuation));
      return new Response(JSON.stringify({ accepted: true, jobId }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback (local dev / older runtime): run inline so the job never stalls.
    await runChunk(jobId, continuation);
    return new Response(JSON.stringify({ accepted: true, jobId, inline: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
