import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const DIRECTIONS_BASE = "https://maps.googleapis.com/maps/api/directions/json";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function toCoordStr(loc: { lat?: number; lng?: number; address?: string; name?: string }): string {
  if (loc.lat && loc.lng) return `${loc.lat},${loc.lng}`;
  return loc.address || loc.name || "";
}

function buildTransitLabel(steps: any[]): string {
  const transitSteps = steps.filter((s: any) => s.travel_mode === "TRANSIT");
  if (transitSteps.length === 0) return "Public transit";

  return transitSteps
    .map((s: any) => {
      const td = s.transit_details;
      if (!td) return "Transit";
      const lineName = td.line?.short_name || td.line?.name || "";
      const vehicleType = (td.line?.vehicle?.type || "TRANSIT").toLowerCase();
      const mode =
        vehicleType === "heavy_rail" || vehicleType === "commuter_train"
          ? "Train"
          : vehicleType === "subway" || vehicleType === "metro_rail"
          ? "Metro"
          : vehicleType === "tram" || vehicleType === "light_rail"
          ? "Tram"
          : vehicleType === "bus"
          ? "Bus"
          : vehicleType === "ferry"
          ? "Ferry"
          : "Transit";
      const from = td.departure_stop?.name || "";
      const to = td.arrival_stop?.name || "";
      const stops = td.num_stops ? `${td.num_stops} stops` : "";

      let label = `${mode} ${lineName}`.trim();
      if (from && to) label += ` from ${from} to ${to}`;
      else if (to) label += ` to ${to}`;
      if (stops) label += ` (${stops})`;
      return label;
    })
    .join(", then ");
}

function buildGettingThere(steps: any[]): string {
  const parts: string[] = [];
  for (const s of steps) {
    if (s.travel_mode === "WALKING") {
      const dist = s.distance?.text || "";
      const dur = s.duration?.text || "";
      if (dist || dur) parts.push(`Walk ${dist} (${dur})`.trim());
    } else if (s.travel_mode === "TRANSIT") {
      const td = s.transit_details;
      if (!td) continue;
      const lineName = td.line?.short_name || td.line?.name || "";
      const vehicleType = (td.line?.vehicle?.type || "").toLowerCase();
      const mode =
        vehicleType === "heavy_rail" || vehicleType === "commuter_train"
          ? "Train"
          : vehicleType === "subway" || vehicleType === "metro_rail"
          ? "Metro"
          : vehicleType === "tram" || vehicleType === "light_rail"
          ? "Tram"
          : vehicleType === "bus"
          ? "Bus"
          : vehicleType === "ferry"
          ? "Ferry"
          : "Transit";
      const to = td.arrival_stop?.name || "";
      let part = `${mode} ${lineName}`.trim();
      if (to) part += ` to ${to}`;
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts.join(", then ") : "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { origin, destination } = await req.json();
    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: "origin and destination required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originStr = toCoordStr(origin);
    const destStr = toCoordStr(destination);
    if (!originStr || !destStr) {
      return new Response(
        JSON.stringify({ error: "Invalid origin or destination" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const modes = ["transit", "walking"];
    const fetches = modes.map((mode) =>
      fetch(
        `${DIRECTIONS_BASE}?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&mode=${mode}&key=${GOOGLE_API_KEY}`
      )
        .then((r) => r.json())
        .then((data) => ({ mode, data }))
        .catch(() => ({ mode, data: { status: "ERROR" } }))
    );

    const results = await Promise.all(fetches);
    const options: any[] = [];

    for (const { mode, data } of results) {
      if (data.status !== "OK" || !data.routes?.length) continue;
      const leg = data.routes[0].legs[0];

      if (mode === "transit") {
        options.push({
          mode: "transit",
          label: buildTransitLabel(leg.steps),
          duration: leg.duration.text,
          cost: "Check local fares",
        });
      } else if (mode === "walking") {
        options.push({
          mode: "walk",
          label: `Walk ${leg.distance.text}`,
          duration: leg.duration.text,
          cost: "Free",
        });
      }
    }

    const transitResult = results.find((r) => r.mode === "transit" && r.data.status === "OK");
    let gettingThere = "";
    if (transitResult?.data.routes?.[0]) {
      gettingThere = buildGettingThere(transitResult.data.routes[0].legs[0].steps);
    }

    const best = options[0];

    return new Response(
      JSON.stringify({
        options,
        gettingThere: gettingThere || best?.label || "",
        transportMode: best?.mode || "",
        transportDuration: best?.duration || "",
        transportCost: best?.cost || "",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err: any) {
    console.error("Directions error:", err.message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
