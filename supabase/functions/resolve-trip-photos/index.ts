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
const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY") || "";
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

async function resolveTrip(tripId: string): Promise<{ activities: number; towns: number }> {
  // Activities that still need a photo and have a venue name.
  const { data: days } = await admin
    .from("itinerary_days")
    .select("id, activities(id, venue_name, category, latitude, longitude, photo_url)")
    .eq("trip_id", tripId);

  const acts: any[] = [];
  for (const d of (days || [])) {
    for (const a of (d.activities || [])) {
      if (a.venue_name && !a.photo_url) acts.push(a);
    }
  }

  let actDone = 0;
  await pool(acts, 4, async (a) => {
    const got = await resolvePhoto({
      query: a.venue_name, kind: "venue", category: a.category,
      lat: Number(a.latitude), lng: Number(a.longitude), maxWidth: 600,
    }, { pexelsKey: PEXELS_API_KEY });
    if (!got?.url) return;
    const stored = await storeImage(got.url, `${tripId}/act-${a.id}`);
    if (!stored) return;
    const { error } = await admin.from("activities").update({ photo_url: stored }).eq("id", a.id);
    if (!error) actDone++;
  });

  // Discover town photos live in trips.extras.towns[*].towns[*].photo.
  let townDone = 0;
  const { data: trip } = await admin.from("trips").select("extras").eq("id", tripId).single();
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
      }, { pexelsKey: PEXELS_API_KEY });
      if (!got?.url) return;
      const safe = String(town.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const stored = await storeImage(got.url, `${tripId}/town-${safe}`);
      if (stored) { town.photo = stored; townDone++; }
    });
    if (townDone > 0) {
      await admin.from("trips").update({ extras }).eq("id", tripId);
    }
  }

  return { activities: actDone, towns: townDone };
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
    const { tripId } = await req.json();
    if (!tripId) return json({ error: "tripId required" }, 400);

    // Background so the caller (generation worker) is not held open.
    // @ts-ignore EdgeRuntime is provided by the Supabase Deno runtime.
    const bg = (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil);
    if (bg) {
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
