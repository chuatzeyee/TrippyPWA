import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, fetchWithTimeout, json } from "../_shared/http.ts";

// "Getting there" recompute when an activity is edited — FREE (OSRM, keyless).
// Replaces Google Directions (billed per call). Response contract unchanged:
// { options, gettingThere, transportMode, transportDuration, transportCost }
//
// ponytail: OSRM has no transit routing (no free global transit API exists).
// Walking comes from a real route; beyond walking range we emit a generic
// transit option — the AI generates the detailed transit at trip creation.

const OSRM = "https://router.project-osrm.org/route/v1/foot/";
const UA = "TrippyPWA/2.0 (directions; github.com/chuatzeyee/TrippyPWA)";

function coords(loc: { lat?: number; lng?: number }): { lat: number; lng: number } | null {
  const lat = Number(loc?.lat), lng = Number(loc?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  try {
    const { origin, destination } = await req.json();
    const o = coords(origin), d = coords(destination);
    if (!o || !d) return json({ error: "origin and destination with lat/lng required" }, 400, corsHeaders);

    const res = await fetchWithTimeout(
      `${OSRM}${o.lng},${o.lat};${d.lng},${d.lat}?overview=false`,
      { headers: { "User-Agent": UA, accept: "application/json" } }, 8_000,
    );
    if (!res.ok) return json({ error: "Directions service unavailable" }, 502, corsHeaders);
    const route = (await res.json())?.routes?.[0];
    if (!route) return json({ error: "No route found" }, 502, corsHeaders);

    const km = route.distance / 1000;
    // Public OSRM's duration can be driving-speed; derive walking time from
    // distance at ~4.8km/h instead, keeping the routed distance (real paths).
    const walkMin = Math.max(1, Math.round(km / 4.8 * 60));
    const distText = km < 1 ? `${Math.round(route.distance / 10) * 10} m` : `${km.toFixed(1)} km`;

    const options: any[] = [];
    // Walking is realistic up to ~2.5km; beyond that lead with transit.
    const walk = { mode: "walk", label: `Walk ${distText}`, duration: `${walkMin} min`, cost: "Free" };
    if (km <= 2.5) options.push(walk);
    if (km > 1.2) {
      options.push({
        mode: "transit",
        label: `Public transit (~${distText})`,
        duration: `~${Math.max(5, Math.round(km * 4))} min`,
        cost: "Check local fares",
      });
    }
    if (km > 2.5) options.push(walk);

    const best = options[0];
    return new Response(JSON.stringify({
      options,
      gettingThere: best.label,
      transportMode: best.mode,
      transportDuration: best.duration,
      transportCost: best.cost,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    console.error("Directions error");
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
});
