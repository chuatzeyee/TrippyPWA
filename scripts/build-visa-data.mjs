// Build per-passport visa requirement files from the passport-index dataset
// (MIT, https://github.com/ilyankou/passport-index-dataset).
//
// Input:  /tmp/passport-index.csv  (passport-index-tidy-iso2.csv)
// Output: public/data/visa/<PASSPORT_ISO2>.json — one small file per passport,
//         loaded on demand for the signed-in user's nationality so the client
//         never downloads the full 39k-row matrix.
//
// Requirement values in the dataset: "visa free" | "visa on arrival" | "e-visa"
// | "eta" | "visa required" | "no admission" | "-1" (same country) | a number
// (visa-free days). We normalise to: { code: vf|voa|ev|eta|vr|na, days? }.
//
// Usage: node scripts/build-visa-data.mjs [path-to-csv]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2] || '/tmp/passport-index.csv';
const outDir = join(root, 'public/data/visa');

function normalise(raw) {
  const v = raw.trim().toLowerCase();
  if (v === '-1') return null; // same country
  if (v === 'visa free') return { c: 'vf' };
  if (v === 'visa on arrival') return { c: 'voa' };
  if (v === 'e-visa') return { c: 'ev' };
  if (v === 'eta') return { c: 'eta' };
  if (v === 'visa required') return { c: 'vr' };
  if (v === 'no admission') return { c: 'na' };
  const days = parseInt(v, 10);
  if (!isNaN(days) && days > 0) return { c: 'vf', d: days };
  return { c: 'vr' }; // unknown value: fail safe toward "check requirements"
}

const lines = readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
const byPassport = new Map();

for (const line of lines) {
  const [passport, dest, ...rest] = line.split(',');
  const req = normalise(rest.join(','));
  if (!req) continue;
  if (!byPassport.has(passport)) byPassport.set(passport, {});
  byPassport.get(passport)[dest] = req;
}

mkdirSync(outDir, { recursive: true });
let count = 0;
for (const [passport, dests] of byPassport) {
  if (!/^[A-Z]{2}$/.test(passport)) continue;
  writeFileSync(join(outDir, `${passport}.json`), JSON.stringify(dests));
  count++;
}
console.log(`Wrote ${count} passport files to ${outDir}`);
