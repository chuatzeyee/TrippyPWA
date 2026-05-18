import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const PLACES_API_BASE = "https://places.googleapis.com/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GOOGLE_PLACES_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { place_id, query, location, max_width = 400 } = await req.json();

    if (!place_id && !query) {
      return new Response(
        JSON.stringify({ error: "place_id or query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let photos: any[] | undefined;
    let resolvedPlaceId: string | undefined;

    if (place_id) {
      const detailsRes = await fetch(
        `${PLACES_API_BASE}/places/${place_id}?fields=photos&key=${GOOGLE_PLACES_API_KEY}`,
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
      const searchRes = await fetch(
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
      return new Response(
        JSON.stringify({ error: "No photos available" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const photoName = photos[0].name;
    const mediaRes = await fetch(
      `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${max_width}&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY}`
    );

    if (!mediaRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photo" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mediaData = await mediaRes.json();
    const photoUrl = mediaData.photoUri;

    if (!photoUrl) {
      return new Response(
        JSON.stringify({ error: "No photo URL returned" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseBody: Record<string, string> = { url: photoUrl };
    if (resolvedPlaceId) responseBody.placeId = resolvedPlaceId;

    return new Response(
      JSON.stringify(responseBody),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400"
        }
      }
    );

  } catch (err) {
    console.error("Places photo error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
