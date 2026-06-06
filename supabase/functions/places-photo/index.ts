import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, fetchWithTimeout, json } from "../_shared/http.ts";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const PLACES_API_BASE = "https://places.googleapis.com/v1";

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Reject anonymous callers so this is not an open, billable Google relay.
  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  try {
    if (!GOOGLE_PLACES_API_KEY) {
      return json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500, corsHeaders);
    }

    const { place_id, query, location, max_width = 400 } = await req.json();

    if (!place_id && !query) {
      return json({ error: "place_id or query is required" }, 400, corsHeaders);
    }

    let photos: any[] | undefined;
    let resolvedPlaceId: string | undefined;

    if (place_id) {
      const detailsRes = await fetchWithTimeout(
        `${PLACES_API_BASE}/places/${encodeURIComponent(place_id)}?fields=photos`,
        { headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY } }
      );
      if (detailsRes.ok) {
        const details = await detailsRes.json();
        photos = details.photos;
      }
    } else if (query) {
      const searchBody: Record<string, unknown> = {
        textQuery: query,
        maxResultCount: 1,
      };
      if (location?.lat && location?.lng) {
        searchBody.locationBias = {
          circle: { center: { latitude: location.lat, longitude: location.lng }, radius: 5000.0 }
        };
      }
      const searchRes = await fetchWithTimeout(
        `${PLACES_API_BASE}/places:searchText`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.id,places.photos",
          },
          body: JSON.stringify(searchBody),
        }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const place = searchData.places?.[0];
        if (place) {
          resolvedPlaceId = place.id;
          photos = place.photos;
        }
      }
    }

    if (!photos || photos.length === 0) {
      return json({ error: "No photos available" }, 404, corsHeaders);
    }

    const photoName = photos[0].name;
    const mediaRes = await fetchWithTimeout(
      `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${max_width}&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY } }
    );

    if (!mediaRes.ok) {
      return json({ error: "Failed to fetch photo" }, 502, corsHeaders);
    }

    const mediaData = await mediaRes.json();
    const photoUrl = mediaData.photoUri;

    if (!photoUrl) {
      return json({ error: "No photo URL returned" }, 502, corsHeaders);
    }

    const responseBody: Record<string, string> = { url: photoUrl };
    if (resolvedPlaceId) responseBody.placeId = resolvedPlaceId;

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });

  } catch (err) {
    console.error("Places photo error");
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
});
