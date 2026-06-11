// Build the expanded wizard city catalogue from GeoNames + Wikipedia.
//
// Inputs (download first):
//   /tmp/cities15000.txt  — GeoNames dump (https://download.geonames.org/export/dump/cities15000.zip, CC-BY 4.0)
//   /tmp/countryInfo.txt  — GeoNames country table (ISO → name, currency)
//
// Outputs:
//   public/data/cities-index.json — slim typeahead index [[name, country, iso2, id], ...]
//   public/data/cities/<id>.json  — full per-city record, hydrated on selection
//
// Images come from Wikipedia PageImages (batched, 50 titles/request) — the same
// Wikimedia CDN the curated list uses. Budgets use a country-tier heuristic
// scaled by city population (estimates, labelled as such in the UI; refine with
// an LLM pass or BudgetYourTrip data later).
//
// Usage: node scripts/build-cities.mjs [N]   (default N=2000 top cities by population)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = parseInt(process.argv[2] || '2000', 10);
const UA = 'TrippyPWA/2.0 (city catalogue build; github.com/chuatzeyee/TrippyPWA)';

// --- 1. countryInfo: ISO2 -> { name, currency } -----------------------------
const countries = new Map();
for (const line of readFileSync('/tmp/countryInfo.txt', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  countries.set(f[0], { name: f[4], currency: f[10] || 'USD' });
}

// Daily-budget country tiers (USD/day comfortable). Rough but sane defaults;
// the curated top-100 list keeps its hand-tuned numbers and overrides these.
const TIER_EXPENSIVE = new Set(['CH', 'NO', 'IS', 'DK', 'SE', 'FI', 'LU', 'IE', 'US', 'AU', 'NZ', 'GB', 'SG', 'HK', 'IL', 'QA', 'AE', 'JP', 'CA', 'NL', 'AT', 'BE', 'FR', 'DE', 'KR', 'MC', 'LI', 'BM', 'KY']);
const TIER_CHEAP = new Set(['IN', 'PK', 'BD', 'NP', 'LK', 'VN', 'LA', 'KH', 'MM', 'ID', 'PH', 'BO', 'PY', 'NI', 'HN', 'GT', 'EG', 'MA', 'TN', 'DZ', 'ET', 'TZ', 'UG', 'KE', 'NG', 'GH', 'SN', 'MG', 'UA', 'MD', 'UZ', 'KG', 'TJ', 'AM', 'GE', 'AL', 'MK', 'BA', 'RS', 'TR', 'MX', 'CO', 'PE', 'EC', 'TH', 'MY', 'CN']);

function budgetFor(iso2, population) {
  const base = TIER_EXPENSIVE.has(iso2) ? 160 : TIER_CHEAP.has(iso2) ? 55 : 95;
  // Big cities cost more: +25% above 5M, +12% above 1M.
  const mult = population > 5_000_000 ? 1.25 : population > 1_000_000 ? 1.12 : 1;
  const comfortable = Math.round(base * mult / 5) * 5;
  return {
    backpacker: Math.max(15, Math.round(comfortable * 0.35 / 5) * 5),
    comfortable,
    luxury: Math.round(comfortable * 2.4 / 10) * 10,
  };
}

// --- 2. GeoNames cities: top-N by population --------------------------------
const seen = new Set();
const cities = [];
for (const line of readFileSync('/tmp/cities15000.txt', 'utf8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  // fields: 0 id, 1 name, 2 ascii, 4 lat, 5 lng, 6 fclass, 7 fcode, 8 country, 14 population, 17 timezone
  if (f[6] !== 'P') continue;
  const key = `${f[1]}|${f[8]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  cities.push({
    id: parseInt(f[0], 10),
    name: f[1],
    ascii: f[2],
    lat: parseFloat(f[4]),
    lng: parseFloat(f[5]),
    iso2: f[8],
    population: parseInt(f[14], 10) || 0,
    timezone: f[17] || null,
  });
}
cities.sort((a, b) => b.population - a.population);
const top = cities.slice(0, N);
console.log(`Parsed ${cities.length} cities, taking top ${top.length}`);

// --- 3. Images: Wikidata P18 joined on GeoNames ID (P1566) -------------------
// Title-based Wikipedia matching mis-hits (country flags, disambiguation pages);
// the P1566 join is exact. Special:FilePath?width=500 gives a 500px thumbnail.
async function fetchWikidataImages(ids) {
  const values = ids.map(id => `"${id}"`).join(' ');
  const query = `SELECT ?gnid ?image WHERE { VALUES ?gnid { ${values} } ?city wdt:P1566 ?gnid. ?city wdt:P18 ?image. }`;
  const res = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query }), {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`WDQS ${res.status}`);
  const data = await res.json();
  const out = {};
  for (const b of data.results?.bindings || []) {
    const gnid = parseInt(b.gnid.value, 10);
    if (out[gnid]) continue; // first image wins when an item has several P18s
    out[gnid] = `${b.image.value.replace('http://', 'https://')}?width=500`;
  }
  return out;
}

const images = {};
const BATCH = 200;
for (let i = 0; i < top.length; i += BATCH) {
  const ids = top.slice(i, i + BATCH).map(c => c.id);
  try {
    Object.assign(images, await fetchWikidataImages(ids));
  } catch (e) {
    console.error(`\nWDQS batch ${i}: ${e.message} — retrying once`);
    await new Promise(r => setTimeout(r, 3000));
    try { Object.assign(images, await fetchWikidataImages(ids)); } catch (e2) { console.error(`retry failed: ${e2.message}`); }
  }
  process.stdout.write(`\rimages: ${Math.min(i + BATCH, top.length)}/${top.length}`);
  await new Promise(r => setTimeout(r, 1000));
}
console.log();
const withImage = top.filter(c => images[c.id]).length;
console.log(`Images resolved: ${withImage}/${top.length} (${(withImage / top.length * 100).toFixed(1)}%)`);

// --- 4. Emit ------------------------------------------------------------------
const outDir = join(root, 'public/data/cities');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const index = [];
for (const c of top) {
  const country = countries.get(c.iso2) || { name: c.iso2, currency: 'USD' };
  index.push([c.name, country.name, c.iso2.toLowerCase(), c.id]);
  writeFileSync(join(outDir, `${c.id}.json`), JSON.stringify({
    name: c.name,
    country: country.name,
    flag: c.iso2.toLowerCase(),
    lat: c.lat,
    lng: c.lng,
    currencyCode: country.currency,
    timezone: c.timezone,
    budgetRange: budgetFor(c.iso2, c.population),
    image: images[c.id] || '',
    population: c.population,
  }));
}
writeFileSync(join(root, 'public/data/cities-index.json'), JSON.stringify(index));
console.log(`Wrote cities-index.json (${index.length} entries) + ${index.length} city files`);
