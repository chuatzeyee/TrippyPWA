// Server-side town/neighbourhood mapping, computed once at generation time and
// stored in trips.extras.towns so the client's Towns tab renders instantly.
// Mirrors js/services/town-mapper.js (the client copy remains as the fallback
// for trips generated before this existed).
//
// Activities' coordinates are deduped into ~1.3km cells, reverse-geocoded via
// Photon (keyless), sequentially with throttling, under a hard time budget so
// the final-save invocation never risks its 150s wall clock.

const CELL_DEG = 0.012;
const REQUEST_GAP_MS = 120;
const TIME_BUDGET_MS = 60_000;
const UA = "TrippyPWA/2.0 (towns precompute; github.com/chuatzeyee/TrippyPWA)";

const NOISE_LOCALITIES = /^(airport|station|port|harbou?r|terminal \d*|industrial (area|estate|park)|business park)$/i;

function cellKey(lat: number, lng: number): string {
  return `${Math.round(lat / CELL_DEG)}:${Math.round(lng / CELL_DEG)}`;
}

function localityFromProps(p: any): string | null {
  if (!p) return null;
  const candidates = [
    p.district, p.suburb, p.locality,
    ["city", "town", "village", "hamlet"].includes(p.osm_value) ? p.name : null,
    p.city, p.county,
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    const name = String(cand).trim();
    if (name.length > 1 && !NOISE_LOCALITIES.test(name)) return name;
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCity(lat: number, lng: number, cities: Array<{ name: string; lat: number; lng: number }>): string {
  if (!cities || cities.length < 2) return cities?.[0]?.name || "";
  let best: { name: string } | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) { bestKm = km; best = c; }
  }
  return best ? best.name : (cities[0]?.name || "");
}

async function reverseGeocode(lat: number, lng: number): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.features?.[0]?.properties || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compute town groups for db-shaped days (snake_case, as accumulated in
 * generation_jobs.result_days). Returns the same shape the client renders:
 * [{ city, towns: [{ name, days: [{ dayNumber }], venues, activityCount }] }]
 * (dayIndex is derived client-side from dayNumber at render time).
 * Best-effort: returns [] on any systemic failure; partial coverage is fine.
 */
export async function computeTownGroups(dbDays: any[], wizardState: any): Promise<any[]> {
  const started = Date.now();

  // 1. Collect ~1.3km cells.
  const cells = new Map<string, { lat: number; lng: number; hits: Array<{ dayNumber: number; venue: string }> }>();
  for (const day of dbDays || []) {
    for (const a of day.activities || []) {
      const lat = Number(a.latitude);
      const lng = Number(a.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const key = cellKey(lat, lng);
      if (!cells.has(key)) cells.set(key, { lat, lng, hits: [] });
      cells.get(key)!.hits.push({
        dayNumber: day.day_number,
        venue: a.venue_name || a.title || "",
      });
    }
  }
  if (cells.size === 0) return [];

  const cities = ((wizardState?.multiCity ? wizardState.destinations : [wizardState?.destination]) || [])
    .filter(Boolean)
    .map((d: any) => ({ name: d.name, lat: Number(d.lat), lng: Number(d.lng) }));

  // 2. Reverse geocode each cell (sequential, throttled, time-capped).
  const towns = new Map<string, { name: string; city: string; days: Set<number>; venues: string[]; activityCount: number }>();
  for (const cell of cells.values()) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // partial coverage beats a blown budget
    const props = await reverseGeocode(cell.lat, cell.lng);
    const locality = localityFromProps(props);
    if (locality) {
      const city = nearestCity(cell.lat, cell.lng, cities);
      const key = `${city}|${locality}`;
      if (!towns.has(key)) {
        towns.set(key, { name: locality, city, days: new Set(), venues: [], activityCount: 0 });
      }
      const t = towns.get(key)!;
      for (const hit of cell.hits) {
        t.days.add(hit.dayNumber);
        if (hit.venue && t.venues.length < 3 && !t.venues.includes(hit.venue)) t.venues.push(hit.venue);
        t.activityCount++;
      }
    }
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
  }
  if (towns.size === 0) return [];

  // 3. Group by city, sort by first visit.
  const byCity = new Map<string, any[]>();
  for (const t of towns.values()) {
    if (!byCity.has(t.city)) byCity.set(t.city, []);
    byCity.get(t.city)!.push({
      name: t.name,
      days: [...t.days].sort((a, b) => a - b).map((dayNumber) => ({ dayNumber })),
      venues: t.venues,
      activityCount: t.activityCount,
    });
  }
  const groups = [...byCity.entries()].map(([city, list]) => ({
    city,
    towns: list.sort((a, b) => (a.days[0]?.dayNumber || 99) - (b.days[0]?.dayNumber || 99)),
  }));
  groups.sort((a, b) =>
    (a.towns[0]?.days[0]?.dayNumber || 99) - (b.towns[0]?.days[0]?.dayNumber || 99));
  return groups;
}
