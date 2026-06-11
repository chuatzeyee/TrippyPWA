// One-off backfill: compute extras.towns for trips generated before the
// server-side towns precompute existed (process-generation now does this at
// save time; see supabase/functions/_shared/towns.ts — this script mirrors
// that logic exactly so old and new trips carry identical data).
//
// Reads/writes production via the Supabase Management API SQL endpoint.
// Photon is queried sequentially with throttling, one trip at a time.
//
// Usage: SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase/access-token) node scripts/backfill-towns.mjs [limit]

const PROJECT = 'hrbhwnscjeokaovoivmn';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN required'); process.exit(1); }

const CELL_DEG = 0.012;
const REQUEST_GAP_MS = 150;
const UA = 'TrippyPWA/2.0 (towns backfill; github.com/chuatzeyee/TrippyPWA)';
const NOISE = /^(airport|station|port|harbou?r|terminal \d*|industrial (area|estate|park)|business park)$/i;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const cellKey = (lat, lng) => `${Math.round(lat / CELL_DEG)}:${Math.round(lng / CELL_DEG)}`;

function localityFromProps(p) {
  if (!p) return null;
  const candidates = [
    p.district, p.suburb, p.locality,
    ['city', 'town', 'village', 'hamlet'].includes(p.osm_value) ? p.name : null,
    p.city, p.county,
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    const name = String(cand).trim();
    if (name.length > 1 && !NOISE.test(name)) return name;
  }
  return null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCity(lat, lng, cities) {
  if (!cities || cities.length < 2) return cities?.[0]?.name || '';
  let best = null, bestKm = Infinity;
  for (const c of cities) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) { bestKm = km; best = c; }
  }
  return best ? best.name : (cities[0]?.name || '');
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json())?.features?.[0]?.properties || null;
  } catch { return null; }
}

async function computeTowns(rows, wizardState, geoCache) {
  const cells = new Map();
  for (const r of rows) {
    const lat = Number(r.latitude), lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    const key = cellKey(lat, lng);
    if (!cells.has(key)) cells.set(key, { lat, lng, hits: [] });
    cells.get(key).hits.push({ dayNumber: r.day_number, venue: r.venue_name || '' });
  }
  if (!cells.size) return [];

  const cities = ((wizardState?.multiCity ? wizardState.destinations : [wizardState?.destination]) || [])
    .filter(Boolean).map(d => ({ name: d.name, lat: Number(d.lat), lng: Number(d.lng) }));

  const towns = new Map();
  for (const [key, cell] of cells) {
    let props;
    if (geoCache.has(key)) {
      props = geoCache.get(key);
    } else {
      props = await reverseGeocode(cell.lat, cell.lng);
      geoCache.set(key, props);
      await new Promise(r => setTimeout(r, REQUEST_GAP_MS));
    }
    const locality = localityFromProps(props);
    if (!locality) continue;
    const city = nearestCity(cell.lat, cell.lng, cities);
    const tkey = `${city}|${locality}`;
    if (!towns.has(tkey)) towns.set(tkey, { name: locality, city, days: new Set(), venues: [], activityCount: 0, cells: [] });
    const t = towns.get(tkey);
    t.cells.push([Number(cell.lat.toFixed(4)), Number(cell.lng.toFixed(4))]);
    for (const hit of cell.hits) {
      t.days.add(hit.dayNumber);
      if (hit.venue && t.venues.length < 3 && !t.venues.includes(hit.venue)) t.venues.push(hit.venue);
      t.activityCount++;
    }
  }
  if (!towns.size) return [];

  const byCity = new Map();
  for (const t of towns.values()) {
    if (!byCity.has(t.city)) byCity.set(t.city, []);
    byCity.get(t.city).push({
      name: t.name,
      days: [...t.days].sort((a, b) => a - b).map(dayNumber => ({ dayNumber })),
      venues: t.venues,
      activityCount: t.activityCount,
      cells: t.cells,
    });
  }
  const byCityGroups = [...byCity.entries()].map(([city, list]) => ({
    city, towns: list.sort((a, b) => (a.days[0]?.dayNumber || 99) - (b.days[0]?.dayNumber || 99)),
  }));
  byCityGroups.sort((a, b) => (a.towns[0]?.days[0]?.dayNumber || 99) - (b.towns[0]?.days[0]?.dayNumber || 99));
  return byCityGroups;
}

const limit = parseInt(process.argv[2] || '100', 10);
const trips = await sql(`
  select id from trips
  where status in ('generated','active','completed') and not (extras ? 'towns')
  order by created_at desc limit ${limit}`);
console.log(`Backfilling ${trips.length} trips`);

// Shared geocode cache across trips: many trips share destinations.
const geoCache = new Map();
let done = 0, skipped = 0;
for (const { id } of trips) {
  const [meta] = await sql(`select wizard_state from trips where id = '${id}'`);
  const rows = await sql(`
    select d.day_number, a.venue_name, a.latitude, a.longitude
    from itinerary_days d join activities a on a.day_id = d.id
    where d.trip_id = '${id}' and a.latitude is not null`);
  const groups = await computeTowns(rows, meta?.wizard_state, geoCache);
  if (!groups.length) { skipped++; console.log(`- ${id}: no mappable activities, skipped`); continue; }
  const payload = JSON.stringify({ towns: groups }).replace(/'/g, "''");
  await sql(`update trips set extras = coalesce(extras, '{}'::jsonb) || '${payload}'::jsonb where id = '${id}'`);
  done++;
  console.log(`- ${id}: ${groups.reduce((n, g) => n + g.towns.length, 0)} towns in ${groups.length} group(s)`);
}
console.log(`Done: ${done} backfilled, ${skipped} skipped, geocode cache ${geoCache.size} cells`);
