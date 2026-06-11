// Long-tail city catalogue for the wizard typeahead. A slim static index
// (~25 KB gzipped, 2,000 cities from GeoNames) is lazy-loaded on first search;
// full records hydrate on selection. Sits between the curated inline list
// (instant, hand-tuned) and the live resolver (anything on Earth):
//   curated 125  →  catalogue 2,000  →  live resolver fallback.

import { logger } from '../lib/logger.js';
import { currencySymbolFor } from './currency-map.js';

const BASE = import.meta.env.BASE_URL || '/';

let _index = null;
let _loading = null;

// Lazy-load and memoise the search index; concurrent callers share one fetch.
export function loadCatalogue() {
  if (_index) return Promise.resolve(_index);
  if (_loading) return _loading;
  _loading = fetch(`${BASE}data/cities-index.json`)
    .then(r => (r.ok ? r.json() : []))
    .then(rows => {
      _index = rows.map(([name, country, flag, id]) => ({
        name, country, flag, id,
        key: `${name} ${country}`.toLowerCase(),
      }));
      return _index;
    })
    .catch(e => {
      logger.warn('data', 'City catalogue load failed', { error: e?.message });
      _index = [];
      return _index;
    });
  return _loading;
}

// Substring search over name+country. Cheap enough at 2k rows that fuzzy
// scoring isn't worth a dependency; the live resolver handles misspellings.
export function searchCatalogue(query, limit = 6) {
  if (!_index || !query) return [];
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const starts = [];
  const contains = [];
  for (const c of _index) {
    if (c.name.toLowerCase().startsWith(q)) starts.push(c);
    else if (c.key.includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

// Hydrate the full destination record for a picked index entry. Returns a
// DESTINATIONS-shaped object, or null (caller falls back to the live resolver).
export async function hydrateCity(entry) {
  try {
    const res = await fetch(`${BASE}data/cities/${entry.id}.json`);
    if (!res.ok) return null;
    const c = await res.json();
    return {
      name: c.name,
      country: c.country,
      flag: c.flag,
      lat: c.lat,
      lng: c.lng,
      currencyCode: c.currencyCode,
      currencySymbol: currencySymbolFor(c.currencyCode),
      timezone: c.timezone,
      budgetRange: c.budgetRange,
      image: c.image,
      catalogue: true,
    };
  } catch (e) {
    logger.warn('data', 'City hydrate failed', { id: entry.id, error: e?.message });
    return null;
  }
}
