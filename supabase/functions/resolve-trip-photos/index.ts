// Resolve + persist a trip's photos ONCE, off the generation critical path.
//
// For each activity (and each Discover town) we resolve a photo via the shared
// multi-source resolver, download the bytes, upload them to the public
// `trip-photos` Storage bucket, and write the resulting Storage URL back onto
// the row (activities.photo_url) / trips.extras.towns[].photo. Opening the trip
// then does zero photo fetching.
//
// Invoked fire-and-forget by process-generation after a trip saves, and directly
// (per trip) by scripts/backfill-photos.mjs. Service-role only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePhoto } from "../_shared/photo-resolver.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAPILLARY_TOKEN = Deno.env.get("MAPILLARY_TOKEN") || "";
const BUCKET = "trip-photos";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const res = await fetch(srcUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1024) return null; // junk/placeholder guard
    // Backstop against the free Storage tier: the resolver returns ~30-200KB
    // thumbnails, so anything above 1.5MB is an un-resized original we skip.
    if (bytes.byteLength > 1_500_000) return null;
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

// Geocode a venue name to lat/lng via Photon (keyless), biased toward the trip's
// destination so "Wild Honey" resolves to the right city. Returns null when the
// name can't be placed — that venue then has no street-view fallback.
async function geocodeVenue(name: string, bias?: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  if (!name) return null;
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1`;
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      url += `&lat=${bias.lat}&lon=${bias.lng}&zoom=12&location_bias_scale=0.5`;
    }
    const res = await fetch(url, {
      headers: { accept: "application/json", "User-Agent": "TrippyPWA/2.0 (photo geocode)" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const f = (await res.json())?.features?.[0];
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]), lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Sanity: if we have a bias, reject a match more than ~150km away (wrong city).
    if (bias && Number.isFinite(bias.lat)) {
      const dKm = Math.hypot((lat - bias.lat) * 111, (lng - bias.lng) * 111 * Math.cos(lat * Math.PI / 180));
      if (dKm > 150) return null;
    }
    return { lat, lng };
  } catch {
    return null;
  }
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

// Cap activities resolved per invocation. A 100+ venue trip done in one call
// exceeds the function's compute budget (HTTP 546 WORKER_RESOURCE_LIMIT), so we
// process a batch and report how many remain; the caller re-invokes until 0.
const ACT_BATCH = 25;

async function resolveTrip(tripId: string): Promise<{ activities: number; towns: number; remaining: number }> {
  // Activities that still need a photo and have a venue name.
  const { data: days } = await admin
    .from("itinerary_days")
    .select("id, activities(id, venue_name, category, latitude, longitude, photo_url)")
    .eq("trip_id", tripId);

  const pending: any[] = [];
  for (const d of (days || [])) {
    for (const a of (d.activities || [])) {
      if (a.venue_name && !a.photo_url) pending.push(a);
    }
  }
  const acts = pending.slice(0, ACT_BATCH);
  const remaining = Math.max(0, pending.length - acts.length);

  // Destination coordinate to bias geocoding of coordinate-less venues.
  const { data: tripRow } = await admin.from("trips").select("wizard_state").eq("id", tripId).single();
  const ws: any = tripRow?.wizard_state || {};
  const dest = ws.multiCity ? ws.destinations?.[0] : ws.destination;
  const bias = dest && Number.isFinite(Number(dest.lat)) && Number.isFinite(Number(dest.lng))
    ? { lat: Number(dest.lat), lng: Number(dest.lng) } : undefined;

  let actDone = 0;
  await pool(acts, 6, async (a) => {
    let lat = Number(a.latitude), lng = Number(a.longitude);
    // No coordinates from the generator -> geocode the venue name so it can still
    // get a street-level photo. Persist the coords (also benefits maps/towns).
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      const geo = await geocodeVenue(a.venue_name, bias);
      if (geo) {
        lat = geo.lat; lng = geo.lng;
        await admin.from("activities").update({ latitude: lat, longitude: lng }).eq("id", a.id);
      }
    }
    const got = await resolvePhoto({
      query: a.venue_name, kind: "venue", category: a.category,
      lat, lng, maxWidth: 600,
    }, { mapillaryToken: MAPILLARY_TOKEN });
    if (!got?.url) return;
    const stored = await storeImage(got.url, `${tripId}/act-${a.id}`);
    if (!stored) return;
    // photo_source lets the UI label a street-level fallback ("Street view")
    // so it never masquerades as a photo of the venue itself.
    const { error } = await admin.from("activities")
      .update({ photo_url: stored, photo_source: got.source }).eq("id", a.id);
    if (!error) actDone++;
  });

  // Discover town photos — only once all activities are resolved, so a batched
  // run does its (small) town work in the final pass, not redundantly each time.
  let townDone = 0;
  const { data: trip } = remaining === 0
    ? await admin.from("trips").select("extras").eq("id", tripId).single()
    : { data: null };
  const extras = trip?.extras || {};
  const groups: any[] = Array.isArray(extras.towns) ? extras.towns : [];
  if (groups.length) {
    const townList: { town: any; city: string }[] = [];
    for (const g of groups) for (const t of (g.towns || [])) {
      if (!t.photo) townList.push({ town: t, city: g.city || "" });
    }
    await pool(townList, 3, async ({ town, city }) => {
      const cell = Array.isArray(town.cells) && town.cells[0] ? town.cells[0] : null;
      const got = await resolvePhoto({
        query: `${town.name} ${city}`.trim(), kind: "area",
        lat: cell ? Number(cell[0]) : undefined, lng: cell ? Number(cell[1]) : undefined,
        maxWidth: 600,
      }, { mapillaryToken: MAPILLARY_TOKEN });
      if (!got?.url) return;
      const safe = String(town.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const stored = await storeImage(got.url, `${tripId}/town-${safe}`);
      if (stored) { town.photo = stored; town.photoSource = got.source; townDone++; }
    });
    if (townDone > 0) {
      await admin.from("trips").update({ extras }).eq("id", tripId);
    }
  }

  return { activities: actDone, towns: townDone, remaining };
}

// True if the bearer token is a Supabase service-role JWT (role claim).
function isServiceRole(auth: string): boolean {
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (SERVICE_KEY && token === SERVICE_KEY) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Service-role only (this writes Storage + rows for any trip).
  if (!isServiceRole(req.headers.get("Authorization") || "")) return json({ error: "Unauthorized" }, 401);

  try {
    const { tripId, inline } = await req.json();
    if (!tripId) return json({ error: "tripId required" }, 400);

    // The generation worker fire-and-forgets (background, returns 202 fast). The
    // backfill driver passes inline:true and WAITS for completion — background
    // tasks are time-capped and a large trip's many slow lookups can be cut off
    // mid-run, leaving photos unresolved.
    // @ts-ignore EdgeRuntime is provided by the Supabase Deno runtime.
    const bg = (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil);
    if (bg && !inline) {
      // @ts-ignore
      EdgeRuntime.waitUntil(resolveTrip(tripId));
      return json({ accepted: true, tripId }, 202);
    }
    const result = await resolveTrip(tripId);
    return json({ ok: true, tripId, ...result }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
