import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, fetchWithTimeout, json } from "../_shared/http.ts";

// Venue autocomplete for the activity editor — FREE (Photon/OSM, keyless).
// Replaces Google Places Text Search, which billed per keystroke-search.
// Response contract unchanged: { results: [{ placeId, name, address, lat, lng, types, primaryType }] }

const PHOTON = "https://photon.komoot.io/api/";
const UA = "TrippyPWA/2.0 (place search; github.com/chuatzeyee/TrippyPWA)";

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  try {
    const { query, location, maxResults = 5 } = await req.json();
    if (!query) return json({ error: "query is required" }, 400, corsHeaders);

    let url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=${Math.min(Number(maxResults) || 5, 10)}`;
    if (location?.lat && location?.lng) {
      url += `&lat=${location.lat}&lon=${location.lng}&zoom=12&location_bias_scale=0.5`;
    }

    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return json({ error: "Place search failed" }, 502, corsHeaders);

    const data = await res.json();
    const results = (data.features || [])
      .filter((f: any) => f.properties?.name)
      .map((f: any) => {
        const p = f.properties || {};
        const address = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.district, p.city, p.country]
          .filter(Boolean).join(", ");
        return {
          placeId: p.osm_id ? `osm-${p.osm_type || "N"}${p.osm_id}` : "",
          name: p.name,
          address,
          lat: f.geometry?.coordinates?.[1] ?? null,
          lng: f.geometry?.coordinates?.[0] ?? null,
          types: [p.osm_key, p.osm_value].filter(Boolean),
          primaryType: p.osm_value || "",
        };
      });

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    console.error("Places search error");
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
});
