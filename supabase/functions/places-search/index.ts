import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, fetchWithTimeout, json } from "../_shared/http.ts";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const PLACES_API_BASE = "https://places.googleapis.com/v1";

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  try {
    if (!GOOGLE_PLACES_API_KEY) {
      return json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500, corsHeaders);
    }

    const { query, location, maxResults = 5 } = await req.json();

    if (!query || query.length < 2) {
      return json({ results: [] }, 200, corsHeaders);
    }

    const searchBody: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: Math.min(maxResults, 10),
    };

    if (location?.lat && location?.lng) {
      searchBody.locationBias = {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: 50000.0,
        },
      };
    }

    const res = await fetchWithTimeout(`${PLACES_API_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType",
      },
      body: JSON.stringify(searchBody),
    });

    if (!res.ok) {
      console.error(`Places API returned ${res.status}`);
      return json({ error: "Places search failed" }, 502, corsHeaders);
    }

    const data = await res.json();
    const results = (data.places || []).map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      lat: p.location?.latitude || null,
      lng: p.location?.longitude || null,
      types: p.types || [],
      primaryType: p.primaryType || "",
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err: any) {
    console.error("Places search error");
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
});
