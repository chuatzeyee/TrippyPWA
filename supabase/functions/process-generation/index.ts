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
//
// Recovery: a worker can die mid-chunk (wall clock, eviction). Its lease then
// expires and the dispatch_stale_generations cron (migration 021) starts the
// job again through claimJob, which counts the dead run as a failed attempt so
// the same doomed call is not replayed forever.
//
// Fencing: every run holds a lease_token. A claim issues a new one, and each
// hand-off to the next invocation rotates it. All job writes require the
// caller's token, so a run that was presumed dead but is still going (or a
// duplicate hand-off) cannot overwrite the days of the run that replaced it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPromptAndSchema, validateItinerary, dedupeFoodVenues, callGemini, callMistral,
  toDbDays, buildExtras, planChunks, tripDayCount, dateForDay, sanitizeDbDays,
  accommodationVenues, FETCH_TIMEOUT, GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL,
  type ProviderResult,
} from "../_shared/generation.ts";
import { computeTownGroups } from "../_shared/towns.ts";
import { CORS_MAX_AGE, isServiceRoleRequest } from "../_shared/http.ts";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
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
// Server-chosen order; the job row's provider_order is ignored. Two Gemini
// models with separate capacity come first: Mistral's key has been rate
// limited (429 on every call since 2026-11-15) and is kept only as a last try.
const PROVIDERS = ["gemini", "gemini-lite", "mistral"];
const MAX_JOB_FAILURES = 24;         // provider failures across the whole job
const LEASE_MS = 160_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ["queued", "processing"];

// Wall clock. Free-tier workers are killed at about 150s, so each invocation
// plans to finish within BUDGET_MS of receiving its request: the model call is
// given whatever is left after keeping SAVE_RESERVE_MS for validation, the job
// write and the hand-off to the next invocation.
const BUDGET_MS = 140_000;
const SAVE_RESERVE_MS = 15_000;
const MIN_CALL_MS = 45_000;          // a packed chunk rarely finishes faster
const ROUND_TWO_PAUSE_MS = 15_000;
const RETRY_PAUSE_MS = 5_000;
const RESUME_WINDOW_MS = 48 * 3600_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
}

// Thrown database errors are retried by the cron (see runSafely); returning
// false here would have failed the job as "Not allowed" for a network blip.
function must<T>(res: { data: T; error: any }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// The job row is client-inserted. Before the service-role worker writes to
// job.trip_id, confirm job.user_id may edit that trip: owner, admin, or an
// editor collaborator (mirrors is_trip_editor: claimed user id or invited email).
async function jobMayWriteTrip(job: any): Promise<boolean> {
  const trip: any = must(await admin.from("trips").select("user_id").eq("id", job.trip_id).maybeSingle(), "trip lookup");
  if (!trip) return false;
  if (trip.user_id === job.user_id) return true;
  const profile: any = must(await admin.from("profiles").select("role").eq("id", job.user_id).maybeSingle(), "profile lookup");
  if (profile?.role === "admin") return true;
  const editors: any[] = must(await admin.from("trip_collaborators")
    .select("user_id, invited_email").eq("trip_id", job.trip_id).eq("role", "editor"), "collaborator lookup") || [];
  if (!editors.length) return false;
  if (editors.some((c: any) => c.user_id === job.user_id)) return true;
  const { data: u, error } = await admin.auth.admin.getUserById(job.user_id);
  if (error) throw new Error(`user lookup: ${error.message}`);
  const email = String(u?.user?.email || "").toLowerCase();
  return !!email && editors.some((c: any) => String(c.invited_email || "").toLowerCase() === email);
}

// Outside callers (the app, the recovery cron) may only START a job: claim it
// atomically while it is queued or its lease has expired, so repeated or
// parallel POSTs of the same jobId cannot run parallel chains. Continuations
// (handOff) carry the service-role key and a lease token, and skip the claim.
// `revived` = the previous worker died holding the lease.
async function claimJob(jobId: string): Promise<{ job: any; revived: boolean } | null> {
  const now = new Date();
  const claim = {
    status: "processing", lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
    lease_token: crypto.randomUUID(),
  };
  const claimWhere = () => admin.from("generation_jobs").update(claim)
    .eq("id", jobId).in("status", ACTIVE);
  // Two single-condition updates, not one .or(): PostgREST re-applies or()
  // filters to the RETURNED rows (PostgREST#3707), and lease_until has just
  // moved into the future, so a successful claim would come back empty.
  const unleased = await claimWhere().is("lease_until", null).select("*");
  if (unleased.data?.[0]) return { job: unleased.data[0], revived: false };
  const expired = await claimWhere().lt("lease_until", now.toISOString()).select("*");
  return expired.data?.[0] ? { job: expired.data[0], revived: true } : null;
}

// Updates the job only while it is still active AND this run still holds the
// lease token, so a late write can never bring a failed or superseded job back
// to life, nor overwrite a newer run's progress. Returns false when the write
// did not apply (the caller must stop).
async function updateActiveJob(jobId: string, token: string, patch: Record<string, unknown>): Promise<boolean> {
  const rows = must(await admin.from("generation_jobs").update(patch)
    .eq("id", jobId).eq("lease_token", token).in("status", ACTIVE).select("id"), "job update");
  return Array.isArray(rows) && rows.length > 0;
}

// Only the trip's newest job may write to it. A Retry or Regenerate started
// while an older job was still running used to leave both running, and the
// last one to finish overwrote the other's itinerary or marked the trip failed.
async function isCurrentJob(job: any): Promise<boolean> {
  const latest: any = must(await admin.from("generation_jobs").select("id")
    .eq("trip_id", job.trip_id).order("created_at", { ascending: false }).limit(1).maybeSingle(), "latest job");
  if (latest?.id === job.id) return true;
  await admin.from("generation_jobs").update({ status: "failed", error: "Superseded by a newer generation", lease_until: null })
    .eq("id", job.id).in("status", ACTIVE);
  logDb("info", "Stopped a job superseded by a newer generation", { jobId: job.id, tripId: job.trip_id });
  return false;
}

function logDb(level: string, message: string, metadata: Record<string, unknown> = {}) {
  admin.from("app_logs").insert({
    level, category: "generation", message, metadata, source: "edge",
    user_id: (metadata.userId as string) || null,
    trip_id: (metadata.tripId as string) || null,
  }).then(() => {}, () => {});
}

// Fails the job (if this run still holds it), and the trip too unless a newer
// job owns it.
async function failJob(job: any, token: string, error: string, meta: Record<string, unknown>) {
  const { data: rows } = await admin.from("generation_jobs").update({ status: "failed", error, lease_until: null })
    .eq("id", job.id).eq("lease_token", token).in("status", ACTIVE).select("id");
  if (!rows?.length) return; // another run owns the job now
  if (await isCurrentJob(job).catch(() => false)) {
    await admin.from("trips").update({ status: "failed" }).eq("id", job.trip_id);
  }
  logDb("error", error, meta);
}

// Writes `patch` with a fresh lease and a new token, then fires the next
// chunk/provider as a separate invocation (fresh wall clock) carrying that
// token. If the hand-off fails, nothing is released: the lease simply expires
// and the recovery cron resumes the job, keeping every day generated so far.
// (Releasing early could start a second run while an ambiguous hand-off was in
// fact running.)
async function handOff(job: any, token: string, patch: Record<string, unknown>): Promise<void> {
  const next = crypto.randomUUID();
  const ok = await updateActiveJob(job.id, token, {
    ...patch, status: "processing", lease_token: next,
    lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
  });
  if (!ok) return;
  try {
    const res = await fetch(SELF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ jobId: job.id, token: next }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`self-invoke ${res.status}`);
  } catch (e: any) {
    logDb("warn", `Hand-off to the next chunk failed; the recovery cron will resume after the lease: ${e?.message}`,
      { jobId: job.id, tripId: job.trip_id });
  }
}

// Retry keeps finished work: a new job for the same trip and the same wizard
// state adopts the days its failed predecessor already generated, instead of
// starting again from day 1.
async function adoptPreviousProgress(job: any, token: string): Promise<any> {
  const { data: prev } = await admin.from("generation_jobs")
    .select("id, wizard_state, result_days, result_extras, result_title")
    .eq("trip_id", job.trip_id).eq("status", "failed").neq("id", job.id)
    .lt("created_at", job.created_at)
    .gt("created_at", new Date(Date.now() - RESUME_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!prev) return job;
  const days = Array.isArray(prev.result_days) ? prev.result_days : [];
  if (!days.length || JSON.stringify(prev.wizard_state) !== JSON.stringify(job.wizard_state)) return job;
  const adopted = { result_days: days, result_extras: prev.result_extras, result_title: prev.result_title || "" };
  if (!(await updateActiveJob(job.id, token, adopted))) return job;
  logDb("info", `Resuming from ${days.length} day(s) generated by the previous attempt`,
    { jobId: job.id, tripId: job.trip_id, userId: job.user_id, previousJobId: prev.id });
  return { ...job, ...adopted };
}

// Trip-level extras (flights or transport, hotels, checklist) are requested
// until they are captured. Usually that is the first chunk, but a cut-off first
// reply only keeps its complete days, so a later pass asks again.
function hasTripExtras(x: any): boolean {
  return !!(x && (x.accommodation || x.flights || x.transport || x.bookingChecklist));
}

// Each chunk may try every provider twice (two full rounds) before the job
// fails: round one absorbs transient capacity errors, round two catches the
// case where every provider hiccupped in the same minute.
const MAX_PROVIDER_ROUNDS = 2;

// `run.token` is this invocation's lease token: handed in by a continuation, or
// issued by claimJob. runSafely reads it after a crash.
async function runChunk(jobId: string, continuation: boolean, startedAt: number, run: { token: string | null }) {
  const timeLeft = () => startedAt + BUDGET_MS - Date.now();

  let job: any = null;
  let revived = false;
  if (continuation) {
    job = must(await admin.from("generation_jobs").select("*").eq("id", jobId).maybeSingle(), "job read");
    if (!job) { logDb("error", "Job not found", { jobId }); return; }
    // A stale or duplicate hand-off: another run holds the job now.
    if (!run.token || job.lease_token !== run.token) {
      logDb("info", "Ignoring a hand-off whose run no longer holds the job", { jobId, tripId: job.trip_id });
      return;
    }
  } else {
    const claimed = await claimJob(jobId);
    if (!claimed) { logDb("info", "Job not claimable (running, finished or unknown); ignoring start", { jobId }); return; }
    ({ job, revived } = claimed);
    run.token = job.lease_token;
  }
  const token = run.token as string;
  if (!ACTIVE.includes(job.status)) return; // already terminal
  const meta = { jobId, tripId: job.trip_id, userId: job.user_id };

  if (!(await isCurrentJob(job))) return;

  if (!(await jobMayWriteTrip(job))) {
    // Fail the JOB only: the trip belongs to someone else, never touch it.
    await admin.from("generation_jobs").update({ status: "failed", error: "Not allowed", lease_until: null }).eq("id", jobId);
    logDb("warn", "Rejected generation job for a trip the requester cannot edit", meta);
    return;
  }

  const providers = PROVIDERS;
  let providerIdx: number = clampInt(job.provider_idx, 0, providers.length * MAX_PROVIDER_ROUNDS, 0);
  let attempt = Number(job.attempt) || 0;

  // The previous worker died mid-run (killed at the wall clock, evicted). Count
  // it as a failed attempt so a call that always overruns moves on to the next
  // provider instead of replaying forever.
  if (revived) {
    providerIdx += 1;
    attempt += 1;
    if (!(await updateActiveJob(jobId, token, { provider_idx: providerIdx, attempt }))) return;
    logDb("warn", "Previous worker stopped mid-run; resuming with the next provider", { ...meta, providerIdx });
  }

  if (!continuation && !(job.result_days || []).length) job = await adoptPreviousProgress(job, token);

  const wizardState = job.wizard_state || {};
  const totalDays = Number(job.total_days) > 0 ? Math.trunc(Number(job.total_days)) : tripDayCount(wizardState);
  if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > MAX_TRIP_DAYS) {
    // User-safe wording: the app may show generation_jobs.error for this case.
    const reason = totalDays > MAX_TRIP_DAYS
      ? `Trips can be up to ${MAX_TRIP_DAYS} days long. Please shorten the dates.`
      : "This trip's dates are not valid. Please pick the dates again.";
    await failJob(job, token, reason, { ...meta, totalDays });
    return;
  }
  if (attempt >= MAX_JOB_FAILURES) {
    await failJob(job, token, `Generation failed: too many provider failures (${attempt})`, meta);
    return;
  }
  const chunkSize = clampInt(job.chunk_size, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE, DEFAULT_CHUNK_SIZE);
  const chunks = planChunks(totalDays, chunkSize);

  // Day-cursor chunking: the next chunk always starts after the last day we
  // actually HAVE, not at a precomputed boundary. A salvaged partial chunk
  // (e.g. 2 of 4 days) simply advances the cursor by 2 and the next pass
  // regenerates from day 3 of that range — no work is thrown away.
  const priorDays: any[] = Array.isArray(job.result_days) ? job.result_days : [];
  const daysDone = priorDays.length;
  const chunkIdx = Math.min(Math.floor(daysDone / chunkSize), chunks.length - 1);

  // All days generated: save the accumulated itinerary atomically.
  if (daysDone >= totalDays) {
    await saveItinerary(job, token, wizardState, totalDays, chunks.length, meta);
    return;
  }

  if (providerIdx >= providers.length * MAX_PROVIDER_ROUNDS) {
    await failJob(job, token, `Generation failed: all providers exhausted on chunk ${chunkIdx + 1}/${chunks.length}`,
      { ...meta, error: job.error });
    return;
  }

  // Generate from the cursor to the end of the current chunk's range.
  const from = daysDone + 1;
  const to = Math.min(chunks[chunkIdx].to, totalDays);
  const needExtras = !hasTripExtras(job.result_extras);
  const provider = providers[providerIdx % providers.length];

  if (!(await updateActiveJob(jobId, token, {
    status: "processing", last_provider: provider,
    lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
  }))) return;

  const { prompt, systemPrompt, jsonSchema, geminiSchema, expectedDays, currency } =
    buildPromptAndSchema(wizardState, { dayFrom: from, dayTo: to, includeExtras: needExtras, priorDays });

  const callProvider = (timeoutMs: number): Promise<ProviderResult> => {
    if (provider === "gemini" && GEMINI_API_KEY) {
      return callGemini(prompt, systemPrompt, geminiSchema, GEMINI_API_KEY, GEMINI_PRIMARY_MODEL, undefined, true, timeoutMs);
    }
    if (provider === "gemini-lite" && GEMINI_API_KEY) {
      return callGemini(prompt, systemPrompt, geminiSchema, GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, undefined, true, timeoutMs);
    }
    if (provider === "mistral" && MISTRAL_API_KEY) {
      return callMistral(prompt, systemPrompt, jsonSchema, MISTRAL_API_KEY, timeoutMs);
    }
    return Promise.resolve({ data: null, error: `Provider ${provider} not configured` });
  };
  // Time the model may use in this invocation, keeping room to save after it.
  const callBudget = () => Math.min(FETCH_TIMEOUT, timeLeft() - SAVE_RESERVE_MS);

  // Second round = every provider already failed once this chunk. Pause so a
  // shared upstream hiccup can clear, but never so long that the call would
  // not fit in what is left of this invocation.
  if (providerIdx >= providers.length) {
    const pause = Math.min(ROUND_TWO_PAUSE_MS, callBudget() - MIN_CALL_MS);
    if (pause > 0) await sleep(pause);
  }

  // Not enough wall clock left for a real call (a slow claim or lookup): hand
  // off to a fresh invocation without counting a failure.
  if (callBudget() < MIN_CALL_MS) {
    logDb("info", `Not enough time left for chunk ${chunkIdx + 1}; handing off`, meta);
    await handOff(job, token, {});
    return;
  }

  const callStarted = Date.now();
  let result = await callProvider(callBudget());

  // Overloaded (503/502, tagged [retryable]) usually clears in seconds: retry
  // the same provider once if the failure came back fast and the retry still
  // fits. Rate limits (429) move straight on to the next provider.
  if (!result.data && result.error?.includes("[retryable]") && Date.now() - callStarted < 15_000
      && callBudget() - RETRY_PAUSE_MS >= MIN_CALL_MS) {
    logDb("info", `${provider} is overloaded on chunk ${chunkIdx + 1}, retrying once`, { ...meta, provider, error: result.error });
    await sleep(RETRY_PAUSE_MS);
    result = await callProvider(callBudget());
  }

  if (result.data) {
    if (result.note) logDb("warn", `Chunk ${chunkIdx + 1}: ${result.note}`, { ...meta, provider });
    const { fatal, issues } = validateItinerary(result.data, expectedDays);
    if (fatal) {
      result = { data: null, error: `Validation failed: ${issues[0]}` };
      logDb("warn", `${provider} produced an invalid chunk ${chunkIdx + 1}`, { ...meta, issues });
    } else {
      // Drop repeated meals (not whole days). Meals at the traveller's own
      // hotel may repeat. Only a chunk made entirely of repeats retries.
      const stays = accommodationVenues(needExtras ? result.data : job.result_extras, wizardState);
      const dupeIssues = dedupeFoodVenues(result.data, priorDays, stays);
      if (dupeIssues.length) {
        logDb("warn", `Chunk ${chunkIdx + 1} repeated venues`, { ...meta, issues: dupeIssues });
        if (result.data.days.length === 0) {
          result = { data: null, error: `Validation failed: ${dupeIssues[0]}` };
        }
      }
    }
  }

  if (result.data) {
    // Accumulate this chunk's days; capture extras + title once.
    // Day numbers and dates are stamped deterministically from the chunk range —
    // models drift (skipped or duplicate dates at chunk seams) when left to them.
    const newDays = toDbDays(result.data, currency).map((d: any, i: number) => {
      const n = from + i;
      return { ...d, day_number: n, date: dateForDay(wizardState, n) ?? d.date };
    });
    const accumulated = [...priorDays, ...newDays];
    // handOff keeps the job 'processing' with a fresh lease between chunks so
    // the recovery cron cannot restart an in-flight job and double-run a chunk
    // (which would duplicate days in result_days).
    const update: Record<string, unknown> = {
      result_days: accumulated,
      chunk_idx: Math.floor(accumulated.length / chunkSize), // observability only; cursor derives from result_days
      provider_idx: 0, // fresh provider rounds for the next pass
      error: "",
    };
    if (needExtras && hasTripExtras(result.data)) {
      update.result_extras = buildExtras(result.data, provider);
      update.result_title = result.data.tripTitle || "";
    }
    const partial = newDays.length < (to - from + 1) ? ` (partial, ${to - (from + newDays.length - 1)} day(s) regenerate next pass)` : "";
    logDb("info", `Days ${from}-${from + newDays.length - 1}/${totalDays} done via ${provider}${partial}`, { ...meta, provider });
    await handOff(job, token, update);
    return;
  }

  // Provider failed on this chunk. Advance provider; if both rounds are
  // exhausted, fail the job.
  const nextProvider = providerIdx + 1;
  const exhausted = nextProvider >= providers.length * MAX_PROVIDER_ROUNDS;
  logDb("warn", `${provider} failed on chunk ${chunkIdx + 1}, ${!exhausted ? (nextProvider >= providers.length ? "starting second provider round" : "falling back") : "no more providers"}`,
    { ...meta, provider, error: result.error });
  if (exhausted) {
    await failJob(job, token, `Generation failed: all providers exhausted on chunk ${chunkIdx + 1}/${chunks.length}. Last error: ${result.error || "Unknown"}`, meta);
    return;
  }
  await handOff(job, token, { provider_idx: nextProvider, attempt: attempt + 1, error: result.error || "Unknown" });
}

async function saveItinerary(job: any, token: string, wizardState: any, totalDays: number, chunkCount: number, meta: Record<string, unknown>) {
  const dbDays = sanitizeDbDays((job.result_days as any[]) || []);
  const extras = { ...((job.result_extras as Record<string, unknown>) || {}) };

  // Pre-compute the Towns tab (reverse-geocoded neighbourhoods) so the client
  // renders it instantly. Best-effort and time-capped: a geocoding outage
  // must never block the itinerary save — the client falls back to on-device
  // geocoding when extras.towns is absent.
  try {
    const towns = await computeTownGroups(dbDays, wizardState);
    if (towns.length > 0) extras.towns = towns;
  } catch (e: any) {
    logDb("warn", "Towns precompute failed; client will geocode on demand", { ...meta, error: e?.message });
  }

  // A newer job owns the trip, or another run owns this job: never save.
  if (!(await isCurrentJob(job))) return;
  if (!(await updateActiveJob(job.id, token, { lease_until: new Date(Date.now() + LEASE_MS).toISOString() }))) return;

  const { error: rpcErr } = await admin.rpc("replace_itinerary", {
    p_trip_id: job.trip_id,
    p_title: job.result_title || "",
    p_extras: extras,
    p_days: dbDays,
  });
  if (rpcErr) {
    await failJob(job, token, `Save failed: ${rpcErr.message}`, meta);
    return;
  }
  await admin.from("generation_jobs").update({ status: "succeeded", error: "", lease_until: null })
    .eq("id", job.id).eq("lease_token", token);
  const actCount = dbDays.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0);
  logDb("info", `Itinerary generated (${dbDays.length}/${totalDays} days, ${actCount} activities, ${chunkCount} chunks, ${(extras.towns as any[])?.length || 0} town groups)`, meta);

  // Resolve + store venue/town photos once, in a separate invocation, so this
  // chunk's wall-clock is unaffected. Best-effort: a photo outage never blocks
  // the (already-saved) itinerary; the client falls back to a live fetch.
  fetch(`${SUPABASE_URL}/functions/v1/resolve-trip-photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ tripId: job.trip_id }),
  }).catch(() => {});
}

// An exception (a database blip, a bug) must not leave the job 'processing'
// with nobody working on it: record it and release the lease so the recovery
// cron starts it again. The attempt counter still bounds repeats.
async function runSafely(jobId: string, continuation: boolean, startedAt: number, token: string | null) {
  const run = { token };
  try {
    await runChunk(jobId, continuation, startedAt, run);
  } catch (e: any) {
    const error = `Worker error: ${e?.message || e}`;
    logDb("error", error, { jobId });
    if (!run.token) return; // nothing claimed, nothing to release
    try {
      const { data: job } = await admin.from("generation_jobs").select("attempt").eq("id", jobId).maybeSingle();
      await admin.from("generation_jobs")
        .update({ error, attempt: (Number(job?.attempt) || 0) + 1, lease_until: new Date().toISOString() })
        .eq("id", jobId).eq("lease_token", run.token).in("status", ACTIVE);
    } catch { /* the cron still sees the lease expire */ }
  }
}

serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobId, token } = await req.json().catch(() => ({}));
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
      EdgeRuntime.waitUntil(runSafely(jobId, continuation, startedAt, continuation && typeof token === "string" ? token : null));
      return new Response(JSON.stringify({ accepted: true, jobId }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback (local dev / older runtime): run inline so the job never stalls.
    await runSafely(jobId, continuation, startedAt, continuation && typeof token === "string" ? token : null);
    return new Response(JSON.stringify({ accepted: true, jobId, inline: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
