// One-off backfill: resolve + store photos for trips generated before the
// photo-store rollout. Thin driver — it finds trips that still have activities
// without a photo_url and POSTs each tripId to the deployed resolve-trip-photos
// edge function, which does the actual resolve + Storage upload + write-back
// (the same code path generation uses, so old and new trips end up identical).
//
// Idempotent: resolve-trip-photos only touches activities/towns lacking a photo,
// so re-running is safe and cheap.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase/access-token) \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/backfill-photos.mjs [limit]
//
//   ... node scripts/backfill-photos.mjs --covers [limit]
//   Covers only ({ coverOnly: true }): trips whose cover is empty or the old
//   automatic pick, a v2 copy whose extras.cover was lost, and "nothing found"
//   verdicts older than 30 days. The edge
//   function re-checks the same rule before writing, so a cover a user chose
//   is never replaced.

const PROJECT = 'hrbhwnscjeokaovoivmn';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN required (Management API)'); process.exit(1); }
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required (to invoke resolve-trip-photos)'); process.exit(1); }

const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/resolve-trip-photos`;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const coversOnly = process.argv.includes('--covers');
const limit = parseInt(process.argv.filter(a => a !== '--covers')[2] || '100', 10);

if (coversOnly) {
  await backfillCovers();
  process.exit(0);
}

// Trips with at least one venue activity still missing a photo.
const trips = await sql(`
  select distinct d.trip_id as id
  from itinerary_days d
  join activities a on a.day_id = d.id
  where a.venue_name <> '' and coalesce(a.photo_url, '') = ''
  order by d.trip_id
  limit ${limit}`);

console.log(`Backfilling photos for ${trips.length} trip(s)`);

let ok = 0, failed = 0;
for (const { id } of trips) {
  // The function resolves a capped batch per call (compute budget) and reports
  // `remaining`; loop until the trip is fully done. inline:true waits for each.
  let totalActs = 0, totalTowns = 0, tripFailed = false;
  for (let pass = 0; pass < 12; pass++) {
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ tripId: id, inline: true }),
        signal: AbortSignal.timeout(180_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { tripFailed = true; console.log(`- ${id}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 100)}`); break; }
      totalActs += body.activities || 0;
      totalTowns += body.towns || 0;
      if (!body.remaining) break; // trip fully resolved
    } catch (e) {
      tripFailed = true; console.log(`- ${id}: ${e.message}`); break;
    }
  }
  if (tripFailed) { failed++; }
  else { ok++; console.log(`- ${id}: ${totalActs} acts / ${totalTowns} towns`); }
}

console.log(`Done: ${ok} ok, ${failed} failed`);

// One coverOnly call per trip. Same rule as coverNeedsPick() in
// supabase/functions/_shared/cover-rank.mjs.
async function backfillCovers() {
  const rows = await sql(`
    select id from trips
    where status is distinct from 'generating' and (
      (extras->'cover' is null
        and (coalesce(cover_image, '') = '' or position('/trip-photos/' || id::text || '/cover.' in cover_image) > 0))
      -- one of our v2 copies whose record was lost (Regenerate Itinerary replaces extras)
      or (position('/trip-photos/' || id::text || '/cover-v2-' in coalesce(cover_image, '')) > 0
        and cover_image is distinct from extras->'cover'->'large'->>'url')
      or (extras->'cover'->>'none' = 'true' and coalesce(cover_image, '') = ''
        and (extras->'cover'->>'triedAt')::timestamptz < now() - interval '30 days'))
    order by created_at desc
    limit ${limit}`);
  console.log(`Picking covers for ${rows.length} trip(s)`);
  let picked = 0, none = 0, failed = 0;
  for (const { id } of rows) {
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ tripId: id, coverOnly: true, inline: true }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { failed++; console.log(`- ${id}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 100)}`); continue; }
      if (body.cover) { picked++; console.log(`- ${id}: ${body.coverRecord?.source} ${body.coverRecord?.sourceId}`); }
      else { none++; console.log(`- ${id}: ${body.coverRecord?.none ? 'nothing usable' : 'not picked (try again later)'}`); }
    } catch (e) {
      failed++; console.log(`- ${id}: ${e.message}`);
    }
  }
  console.log(`Covers: ${picked} picked, ${none} without, ${failed} failed`);
}
