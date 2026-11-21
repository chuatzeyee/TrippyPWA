// City search for the home city field (profile wizard, Settings). Results come
// from the destination catalogue, so a chosen city's name, country and flag
// always agree. Moved here from js/profile/profile-wizard.js.
import { DESTINATIONS } from '../wizard/destinations.js';

const MAX_RESULTS = 8;

function getUniqueCities() {
  const seen = new Set();
  return DESTINATIONS.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Catalogue cities whose name or country contains `query` (any case), sorted
 * by name, eight at most; a missing query counts as an empty one. The entries
 * are the catalogue's own objects: read them, do not change them.
 */
export function searchCities(query) {
  const q = String(query ?? '').toLowerCase();
  return getUniqueCities().filter(d =>
    d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q)
  ).slice(0, MAX_RESULTS);
}
