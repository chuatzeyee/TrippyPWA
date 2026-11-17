// Resolve + persist a trip's photos ONCE, off the generation critical path.
//
// For each activity (and each Discover town) we resolve a REAL photo via the
// shared multi-source resolver (exact ids -> verified web photos -> labelled
// street view), download the bytes, upload them to the public `trip-photos`
// Storage bucket, and write the Storage URL back onto the row
// (activities.photo_url / extras.towns[].photo). Credits go to
// trips.extras.photoCredits[activityId]. Venues where nothing trustworthy was
// found are marked photo_source = 'none' so the client never falls back to a
// generic stock image for them.
//
// The trip COVER (final pass, or alone with { coverOnly: true }) comes from the
// cover picker (_shared/cover-resolver.mjs): Pexels gated on the city name,
// Commons Featured/Quality/Valued images, Wikidata-linked images, an optional
// Gemini vision check. A large copy (up to 2400px for Pexels, Wikimedia
// standard widths, max 3 MB) and a 1280px copy are stored at
// <tripId>/cover-v2-<w>w-<tag>.jpg; trips.cover_image = the large copy and
// trips.extras.cover = { v: 2, large, small, focusY, credit, ... }. Only an
// empty cover, the old automatic pick or a v2 copy whose record was lost is
// ever replaced. The tag is new for every pick, so two pickers on one trip
// never overwrite each other's files.
//
// Every write to trips.extras is a compare-and-swap on trips.updated_at
// (bumped by a trigger on each write): a write that raced another one is
// recomputed from a fresh read, so concurrent runs never drop each other's
// keys (photoCredits, towns, cover, photoResolve).
//
// Callers:
//   - process-generation (service role), fire-and-forget after a trip saves
//   - scripts/backfill-photos.mjs (service role), inline per trip
//   - the app after a trip import (the trip OWNER's JWT), inline, looping while
//     `remaining` > 0
//   - the app when the owner opens a trip without a v2 cover: { coverOnly: true }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolvePhotoCandidates, geocodeVenue, isOfficialSite, imageDims, looksLikePhoto, safeFetch, readCapped, MAX_IMAGE_BYTES,
  canCheckDns, coverNeedsPick, coverSizes, coverRecord, noCoverRecord, mergeCoverExtras, coverLandmarks, isCoverHost, coverCopyPath,
  COVER_MAX_BYTES, COVER_MIN_BPP, COVER_RELAXED_MIN_WIDTH,
} from "../_shared/photo-resolver.mjs";
import { findCoverCandidates } from "../_shared/cover-resolver.mjs";
import { resolveWebPhoto, visionPick } from "../_shared/photo-web.mjs";
import { GEMINI_FALLBACK_MODEL } from "../_shared/generation.ts";
import { updateRowVersioned } from "../_shared/trip-row.mjs";
import { CORS_MAX_AGE, bearerToken, isServiceRoleRequest } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
// Web photo sources, used only when the licensed ones find nothing. Each is
// skipped while its key is unset.
const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY") || "";
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") || "";
// Cover judge: a quick vision check, so the fast Flash-Lite model.
const GEMINI_MODEL = GEMINI_FALLBACK_MODEL;
const BUCKET = "trip-photos";
const ACT_WIDTH = 960;   // Wikimedia standard thumbnail width
const COVER_TRIES = 4;   // ranked cover candidates to try downloading

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": CORS_MAX_AGE,
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Download an image URL and upload its bytes to Storage at `path`. Returns the
// public URL, or null on any failure (the row simply stays photo-less).
async function storeImage(srcUrl: string, path: string): Promise<string | null> {
  try {
    // Candidate URLs can come from venue websites / OSM tags: SSRF-guarded fetch,
    // redirects re-checked, body capped while streaming.
    const res = await safeFetch(srcUrl, {}, 12_000);
    if (!res?.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) { res.body?.cancel(); return null; }
    const bytes = await readCapped(res, MAX_IMAGE_BYTES);
    if (!bytes) return null;
    // Real photographs only: no logos, banners, flags or tiny thumbnails.
    if (!looksLikePhoto(imageDims(bytes), bytes.byteLength, contentType)) return null;
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const fullPath = `${path}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(fullPath, bytes, {
      contentType, upsert: true, cacheControl: "604800",
    });
    if (error) return null;
    return admin.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl;
  } catch {
    return null;
  }
}

// A linked (not stored) web photo must still download and look like a photo.
async function isRealPhoto(url: string): Promise<boolean> {
  try {
    const res = await safeFetch(url, {}, 12_000);
    if (!res?.ok) return false;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) { res.body?.cancel(); return false; }
    const bytes = await readCapped(res, MAX_IMAGE_BYTES);
    return !!bytes && looksLikePhoto(imageDims(bytes), bytes.byteLength, contentType);
  } catch {
    return false;
  }
}

// Store the first candidate that downloads cleanly and passes the photo check.
type Candidate = { url: string; source: string; credit?: Credit };
async function storeFirst(cands: Candidate[], path: string): Promise<{ stored: string; cand: Candidate } | null> {
  for (const cand of cands.slice(0, 4)) {
    const stored = await storeImage(cand.url, path);
    if (stored) return { stored, cand };
  }
  return null;
}

// Bounded-concurrency map (the resolver hits public APIs; keep it gentle).
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx]); } catch { /* one photo failing must not stop the rest */ }
    }
  });
  await Promise.all(workers);
}

// Cap activities per invocation (a 100+ venue trip in one call exceeds the
// compute budget, HTTP 546); the caller re-invokes while `remaining` > 0.
const ACT_BATCH = 8;
// Owner (non-service) callers: per-trip daily call budget and a cap on how many
// venues a single trip may resolve, so the shared free APIs and Storage can't be
// abused by re-invoking directly.
const OWNER_CALLS_PER_DAY = 30;
const OWNER_MAX_VENUES = 150;
const NO_PHOTO_CATEGORIES = new Set(["transport", "flight", "arrival", "departure"]);

type Credit = { creator?: string; license?: string; via?: string; link?: string };
type TripRow = Record<string, any>;

// Every trips.extras write goes through this compare-and-swap (see
// _shared/trip-row.mjs), so concurrent runs never drop each other's keys.
function updateTripRow(tripId: string, columns: string, change: (fresh: TripRow) => TripRow | null) {
  return updateRowVersioned(admin, {
    table: "trips", id: tripId, columns, change,
    log: (msg: string, detail?: string) => console.error(`resolve-trip-photos: ${msg}`, detail ?? ""),
  });
}

async function ownerBudgetExceeded(tripId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  let exceeded = false;
  await updateTripRow(tripId, "extras", (fresh) => {
    const extras = fresh.extras || {};
    const prev = extras.photoResolve?.day === today ? Number(extras.photoResolve.calls) || 0 : 0;
    exceeded = prev >= OWNER_CALLS_PER_DAY;
    return exceeded ? null : { extras: { ...extras, photoResolve: { day: today, calls: prev + 1 } } };
  });
  return exceeded;
}

// ---------------------------------------------------------------- trip cover

type Sized = { url: string; w: number; h: number };
type StoredCopy = Sized & { path: string };
type CoverCopy = { bytes: Uint8Array; contentType: string; width: number; height: number };
type CoverOutcome = { picked: boolean; record: Record<string, unknown>; image: string };

// The first stop of the trip (multi-city: the first city).
function tripDestination(ws: any): any {
  return ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
}

// One cover copy from the Pexels or Wikimedia image CDN, checked to be a real
// photo of at most COVER_MAX_BYTES.
async function fetchCoverCopy(url: string): Promise<CoverCopy | null> {
  if (!isCoverHost(url)) return null;
  try {
    const res = await safeFetch(url, {}, 20_000);
    if (!res?.ok) { res?.body?.cancel(); return null; }
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|webp)$/.test(contentType)) { res.body?.cancel(); return null; }
    const bytes = await readCapped(res, COVER_MAX_BYTES);
    if (!bytes) return null;
    const dims = imageDims(bytes);
    if (!dims || !looksLikePhoto(dims, bytes.byteLength, contentType, COVER_MIN_BPP)) return null;
    return { bytes, contentType, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

async function uploadCoverCopy(tripId: string, img: CoverCopy, tag: string): Promise<StoredCopy | null> {
  const path = coverCopyPath(tripId, img, tag);
  if (!path) return null;
  const { error } = await admin.storage.from(BUCKET).upload(path, img.bytes, {
    contentType: img.contentType, upsert: true, cacheControl: "604800",
  });
  if (error) return null;
  return { url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, w: img.width, h: img.height, path };
}

// Store the large copy (the first size option that downloads cleanly) and,
// when it is smaller, the 1280px copy, all under this pick's tag. Null when
// no large copy could be stored.
async function storeCover(tripId: string, cand: any, tag: string): Promise<{ large: StoredCopy; small: StoredCopy | null } | null> {
  const sizes = coverSizes(cand);
  let large: StoredCopy | null = null;
  for (const option of sizes.large) {
    const img = await fetchCoverCopy(option.url);
    if (!img || img.width < COVER_RELAXED_MIN_WIDTH) continue;
    large = await uploadCoverCopy(tripId, img, tag);
    if (large) break;
  }
  if (!large) return null;
  let small: StoredCopy | null = null;
  if (sizes.small && sizes.small.w < large.w) {
    const img = await fetchCoverCopy(sizes.small.url);
    if (img && img.width < large.w) small = await uploadCoverCopy(tripId, img, tag);
  }
  return { large, small };
}

// extras.cover keeps { url, w, h } per copy, not the Storage path.
const sizedOnly = ({ url, w, h }: StoredCopy): Sized => ({ url, w, h });

// A tag shared by one pick's copies; new for every pick (see coverCopyPath).
function newPickTag(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// Copies of a pick that lost the race to another picker: never referenced by
// any row (their names are unique to this pick), so safe to delete.
async function removeCopies(paths: string[]) {
  if (!paths.length) return;
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) console.error("resolve-trip-photos: could not remove unused cover copies", error.message);
}

// Whether the trip still wants a cover (another run may have saved one while
// this one searched). Re-read right before downloading and uploading.
async function stillNeedsPick(tripId: string): Promise<boolean> {
  const { data, error } = await admin.from("trips").select("cover_image, extras").eq("id", tripId).single();
  return !error && Boolean(data) && coverNeedsPick(data, tripId);
}

// Write the cover onto a FRESH read of the row (compare-and-swap, see
// updateTripRow): extras merged so concurrent photo writes survive, and
// nothing written if a cover was chosen or picked meanwhile.
async function saveCover(tripId: string, record: Record<string, unknown>, image: string): Promise<boolean> {
  const { written } = await updateTripRow(tripId, "cover_image, extras", (fresh) =>
    coverNeedsPick(fresh, tripId) ? { cover_image: image, extras: mergeCoverExtras(fresh.extras, record) } : null);
  return written;
}

// Pick, store and save a cover. Null when nothing was written (a source or a
// download failed: tried again next time; or another run saved one first).
async function pickCover(tripId: string, row: any, dest: any, activities: any[]): Promise<CoverOutcome | null> {
  const found = await findCoverCandidates(
    { dest, startDate: row?.start_date, endDate: row?.end_date, landmarks: coverLandmarks(activities, dest) },
    { pexelsKey: PEXELS_API_KEY, geminiKey: GEMINI_API_KEY, geminiModel: GEMINI_MODEL },
  );
  const tag = newPickTag();
  for (const cand of found.ranked.slice(0, COVER_TRIES)) {
    if (!(await stillNeedsPick(tripId))) return null;
    const stored = await storeCover(tripId, cand, tag);
    if (!stored) continue;
    const { large, small } = stored;
    const record = coverRecord(cand, { large: sizedOnly(large), small: small ? sizedOnly(small) : null, ctx: found.ctx });
    if (await saveCover(tripId, record, large.url)) return { picked: true, record, image: large.url };
    await removeCopies([large.path, small?.path].filter((p): p is string => Boolean(p)));
    return null;
  }
  // Only a complete search that found nothing usable is recorded as "none"
  // (the client then shows the plain header; the backfill retries in 30 days).
  if (found.ranked.length || !found.complete) return null;
  const record = noCoverRecord();
  return (await saveCover(tripId, record, "")) ? { picked: false, record, image: "" } : null;
}

// { coverOnly: true }: only the cover pass. Reports the trip's cover as it now
// stands, so the app can update the header without reloading the trip.
async function resolveCoverOnly(tripId: string) {
  const { data: row } = await admin.from("trips")
    .select("wizard_state, extras, cover_image, start_date, end_date").eq("id", tripId).single();
  const dest = tripDestination(row?.wizard_state);
  let outcome: CoverOutcome | null = null;
  if (row && dest?.name && coverNeedsPick(row, tripId)) {
    const { data: days } = await admin.from("itinerary_days")
      .select("activities(venue_name, venue_address, category, latitude, longitude)").eq("trip_id", tripId);
    outcome = await pickCover(tripId, row, dest, (days || []).flatMap((d: any) => d.activities || []));
  }
  if (outcome) return { cover: outcome.picked, coverImage: outcome.image, coverRecord: outcome.record };
  // Nothing written by this call: report the row as it is now (another run
  // may have picked the cover meanwhile).
  const { data: now } = await admin.from("trips").select("cover_image, extras").eq("id", tripId).single();
  return { cover: false, coverImage: now?.cover_image ?? null, coverRecord: now?.extras?.cover ?? null };
}

// ---------------------------------------------------------------- whole trip

async function resolveTrip(tripId: string, ownerCall = false) {
  const { data: tripRow } = await admin.from("trips")
    .select("wizard_state, extras, cover_image, start_date, end_date").eq("id", tripId).single();
  const ws: any = tripRow?.wizard_state || {};
  const dest = tripDestination(ws);
  const bias = dest && Number.isFinite(Number(dest.lat)) && Number.isFinite(Number(dest.lng))
    ? { lat: Number(dest.lat), lng: Number(dest.lng) } : undefined;

  const { data: days } = await admin
    .from("itinerary_days")
    .select("id, activities(id, venue_name, venue_address, category, booking_url, latitude, longitude, photo_url, photo_source)")
    .eq("trip_id", tripId);

  const pending: any[] = [];
  for (const d of (days || [])) {
    for (const a of (d.activities || [])) {
      if (a.venue_name && !a.photo_url && a.photo_source !== "none"
        && !NO_PHOTO_CATEGORIES.has(String(a.category || "").toLowerCase())) pending.push(a);
    }
  }
  const eligible = ownerCall ? pending.slice(0, OWNER_MAX_VENUES) : pending;
  const acts = eligible.slice(0, ACT_BATCH);
  const remaining = Math.max(0, eligible.length - acts.length);
  const credits: Record<string, Credit> = {};

  let actDone = 0;
  await pool(acts, 4, async (a) => {
    let lat = Number(a.latitude), lng = Number(a.longitude);
    const city = String(a.venue_address || "").split(",").pop()?.trim() || "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      const geo = await geocodeVenue(a.venue_name, { address: a.venue_address || "", bias });
      if (geo) {
        lat = geo.lat; lng = geo.lng;
        await admin.from("activities").update({ latitude: lat, longitude: lng }).eq("id", a.id);
      }
    }
    const cands = await resolvePhotoCandidates({
      query: a.venue_name, kind: "venue", category: a.category, city,
      website: isOfficialSite(a.booking_url) ? a.booking_url : "",
      lat, lng, maxWidth: ACT_WIDTH,
    });
    // Photos tied to the venue by an id or its own site are trusted. Commons and
    // Openverse matches only share the venue's name in a file title, which in a
    // dense city often shows something else (a bus at the "Peak Tram Lower
    // Terminus", hoardings at "M+"), so they must pass the vision check.
    const NAME_MATCHED = new Set(["commons", "openverse"]);
    const place = { query: a.venue_name, city, category: a.category, lat, lng };
    let hit = await storeFirst(cands.filter((c: Candidate) => !NAME_MATCHED.has(c.source)), `${tripId}/act-${a.id}`);
    const fuzzy = cands.filter((c: Candidate) => NAME_MATCHED.has(c.source)).slice(0, 3);
    if (!hit && fuzzy.length && GEMINI_API_KEY) {
      const ok = await visionPick(fuzzy, place, { geminiKey: GEMINI_API_KEY, model: GEMINI_FALLBACK_MODEL });
      if (ok) hit = await storeFirst([ok], `${tripId}/act-${a.id}`);
    }
    if (!hit && (SERPER_API_KEY || TAVILY_API_KEY)) {
      // Nothing licensed: a Google Maps place photo (Serper) or a vision-checked
      // web photo (Tavily), linked with its source rather than copied.
      const web = await resolveWebPhoto(
        place,
        { serperKey: SERPER_API_KEY, tavilyKey: TAVILY_API_KEY, geminiKey: GEMINI_API_KEY, model: GEMINI_FALLBACK_MODEL },
      );
      if (web && (web.source !== "maps" || await isRealPhoto(web.url))) hit = { stored: web.url, cand: web };
    }
    if (!hit) {
      // Tried and found nothing trustworthy: remember, so neither this worker
      // nor the client's legacy live-resolve retries it with a generic image.
      await admin.from("activities").update({ photo_source: "none" }).eq("id", a.id);
      return;
    }
    const { error } = await admin.from("activities")
      .update({ photo_url: hit.stored, photo_source: hit.cand.source }).eq("id", a.id);
    if (!error) {
      actDone++;
      if (hit.cand.credit) credits[a.id] = hit.cand.credit;
    }
  });

  // Final pass only: Discover towns + trip cover (small, once).
  const extras = { ...(tripRow?.extras || {}) };
  let townDone = 0;
  let coverDone = false;
  if (remaining === 0) {
    const groups: any[] = Array.isArray(extras.towns) ? extras.towns : [];
    const townList: { town: any; city: string }[] = [];
    for (const g of groups) for (const t of (g.towns || [])) if (!t.photo) townList.push({ town: t, city: g.city || "" });
    await pool(townList, 3, async ({ town, city }) => {
      const cell = Array.isArray(town.cells) && town.cells[0] ? town.cells[0] : null;
      const cands = await resolvePhotoCandidates({
        query: `${town.name} ${city}`.trim(), kind: "area",
        lat: cell ? Number(cell[0]) : undefined, lng: cell ? Number(cell[1]) : undefined, maxWidth: ACT_WIDTH,
      });
      const safe = String(town.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const hit = await storeFirst(cands, `${tripId}/town-${safe}`);
      if (hit) { town.photo = hit.stored; town.photoSource = hit.cand.source; townDone++; }
    });

    if (dest?.name && tripRow && coverNeedsPick(tripRow, tripId)) {
      const activities = (days || []).flatMap((d: any) => d.activities || []);
      coverDone = Boolean((await pickCover(tripId, tripRow, dest, activities))?.picked);
    }
  }

  if (townDone > 0 || Object.keys(credits).length > 0) {
    // Merged into a fresh read (compare-and-swap) so a concurrent cover pick
    // or credit write is never clobbered.
    await updateTripRow(tripId, "extras", (fresh) => {
      const merged = { ...(fresh.extras || {}) };
      if (townDone > 0) merged.towns = extras.towns;
      merged.photoCredits = { ...(merged.photoCredits || {}), ...credits };
      return { extras: merged };
    });
  }

  return { activities: actDone, attempted: acts.length, towns: townDone, cover: coverDone, remaining };
}

// The signed-in user owns this trip (token verified by GoTrue, not just decoded).
async function isTripOwner(token: string, tripId: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: trip } = await admin.from("trips").select("user_id").eq("id", tripId).single();
  return trip?.user_id === data.user.id;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = bearerToken(req);
    const { tripId, inline, coverOnly } = await req.json().catch(() => ({}));
    if (!tripId || typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) return json({ error: "tripId required" }, 400);

    // Service callers (process-generation, backfill script) send the exact
    // service-role key; everyone else must be the trip owner with a JWT that
    // GoTrue verifies. A JWT's role claim is never trusted on its own: with
    // --no-verify-jwt nothing upstream has checked its signature.
    const service = await isServiceRoleRequest(req);
    if (!service && !(await isTripOwner(token, tripId))) return json({ error: "Unauthorized" }, 401);
    // The SSRF guard fails closed without DNS: without a resolver every fetch
    // would be refused and each venue wrongly marked 'none'. Stop instead.
    if (!canCheckDns()) return json({ error: "Photo fetching is unavailable right now" }, 503);
    if (!service && await ownerBudgetExceeded(tripId)) return json({ error: "Daily photo limit reached for this trip" }, 429);

    // Service callers may fire-and-forget (background, 202). Owners always run
    // inline in batches so the app can show progress and re-render when done.
    // @ts-ignore EdgeRuntime is provided by the Supabase Deno runtime.
    const bg = (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil);
    const run = coverOnly === true ? () => resolveCoverOnly(tripId) : () => resolveTrip(tripId, !service);
    if (service && bg && !inline) {
      // @ts-ignore
      EdgeRuntime.waitUntil(run());
      return json({ accepted: true, tripId }, 202);
    }
    const result = await run();
    return json({ ok: true, tripId, ...result }, 200);
  } catch (err: any) {
    console.error("resolve-trip-photos failed", err?.message);
    return json({ error: "Photo resolution failed" }, 500);
  }
});
