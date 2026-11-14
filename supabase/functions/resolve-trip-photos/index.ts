// Resolve + persist a trip's photos ONCE, off the generation critical path.
//
// For each activity (and each Discover town, and the trip cover) we resolve a
// REAL photo via the shared multi-source resolver (exact ids -> verified web
// photos -> labelled street view), download the bytes, upload them to the public
// `trip-photos` Storage bucket, and write the Storage URL back onto the row
// (activities.photo_url / extras.towns[].photo / trips.cover_image). Credits go
// to trips.extras.photoCredits[activityId]. Venues where nothing trustworthy was
// found are marked photo_source = 'none' so the client never falls back to a
// generic stock image for them.
//
// Callers:
//   - process-generation (service role), fire-and-forget after a trip saves
//   - scripts/backfill-photos.mjs (service role), inline per trip
//   - the app after a trip import (the trip OWNER's JWT), inline, looping while
//     `remaining` > 0
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolvePhotoCandidates, geocodeVenue, isOfficialSite, imageDims, looksLikePhoto, safeFetch, readCapped, MAX_IMAGE_BYTES,
  canCheckDns,
} from "../_shared/photo-resolver.mjs";
import { CORS_MAX_AGE, bearerToken, isServiceRoleRequest } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAPILLARY_TOKEN = Deno.env.get("MAPILLARY_TOKEN") || "";
const BUCKET = "trip-photos";
const ACT_WIDTH = 960;   // Wikimedia standard thumbnail width
const COVER_WIDTH = 1280;

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

async function ownerBudgetExceeded(tripId: string): Promise<boolean> {
  const { data } = await admin.from("trips").select("extras").eq("id", tripId).single();
  const extras = { ...(data?.extras || {}) };
  const today = new Date().toISOString().slice(0, 10);
  const prev = extras.photoResolve?.day === today ? Number(extras.photoResolve.calls) || 0 : 0;
  if (prev >= OWNER_CALLS_PER_DAY) return true;
  extras.photoResolve = { day: today, calls: prev + 1 };
  await admin.from("trips").update({ extras }).eq("id", tripId);
  return false;
}

async function resolveTrip(tripId: string, ownerCall = false) {
  const { data: tripRow } = await admin.from("trips")
    .select("wizard_state, extras, cover_image").eq("id", tripId).single();
  const ws: any = tripRow?.wizard_state || {};
  const dest = ws.multiCity ? ws.destinations?.[0] : ws.destination;
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
    }, { mapillaryToken: MAPILLARY_TOKEN });
    const hit = await storeFirst(cands, `${tripId}/act-${a.id}`);
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
      }, { mapillaryToken: MAPILLARY_TOKEN });
      const safe = String(town.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const hit = await storeFirst(cands, `${tripId}/town-${safe}`);
      if (hit) { town.photo = hit.stored; town.photoSource = hit.cand.source; townDone++; }
    });

    if (!tripRow?.cover_image && dest?.name) {
      const cands = await resolvePhotoCandidates({ query: dest.name, kind: "area", lat: bias?.lat, lng: bias?.lng, maxWidth: COVER_WIDTH },
        { mapillaryToken: MAPILLARY_TOKEN });
      const hit = await storeFirst(cands.filter((c) => c.source !== "street"), `${tripId}/cover`);
      if (hit) {
        await admin.from("trips").update({ cover_image: hit.stored }).eq("id", tripId);
        coverDone = true;
      }
    }
  }

  if (townDone > 0 || Object.keys(credits).length > 0) {
    // Re-read extras right before writing so a concurrent edit isn't clobbered.
    const { data: fresh } = await admin.from("trips").select("extras").eq("id", tripId).single();
    const merged = { ...(fresh?.extras || {}) };
    if (townDone > 0) merged.towns = extras.towns;
    merged.photoCredits = { ...(merged.photoCredits || {}), ...credits };
    await admin.from("trips").update({ extras: merged }).eq("id", tripId);
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
    const { tripId, inline } = await req.json().catch(() => ({}));
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
    if (service && bg && !inline) {
      // @ts-ignore
      EdgeRuntime.waitUntil(resolveTrip(tripId));
      return json({ accepted: true, tripId }, 202);
    }
    const result = await resolveTrip(tripId, !service);
    return json({ ok: true, tripId, ...result }, 200);
  } catch (err: any) {
    console.error("resolve-trip-photos failed", err?.message);
    return json({ error: "Photo resolution failed" }, 500);
  }
});
