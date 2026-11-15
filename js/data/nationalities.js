// Shared by the profile, the trip wizard and the entry requirements card.
// Passport countries for the nationality selector (ISO2 lowercase, matching
// the app's flag-code convention). Names mirror common passport designations.
export const NATIONALITIES = [
  ['sg', 'Singapore'], ['my', 'Malaysia'], ['id', 'Indonesia'], ['th', 'Thailand'],
  ['ph', 'Philippines'], ['vn', 'Vietnam'], ['kh', 'Cambodia'], ['la', 'Laos'],
  ['mm', 'Myanmar'], ['bn', 'Brunei'], ['cn', 'China'], ['hk', 'Hong Kong'],
  ['tw', 'Taiwan'], ['jp', 'Japan'], ['kr', 'South Korea'], ['in', 'India'],
  ['lk', 'Sri Lanka'], ['bd', 'Bangladesh'], ['pk', 'Pakistan'], ['np', 'Nepal'],
  ['au', 'Australia'], ['nz', 'New Zealand'], ['us', 'United States'], ['ca', 'Canada'],
  ['mx', 'Mexico'], ['br', 'Brazil'], ['ar', 'Argentina'], ['cl', 'Chile'],
  ['co', 'Colombia'], ['pe', 'Peru'], ['gb', 'United Kingdom'], ['ie', 'Ireland'],
  ['fr', 'France'], ['de', 'Germany'], ['it', 'Italy'], ['es', 'Spain'],
  ['pt', 'Portugal'], ['nl', 'Netherlands'], ['be', 'Belgium'], ['ch', 'Switzerland'],
  ['at', 'Austria'], ['se', 'Sweden'], ['no', 'Norway'], ['dk', 'Denmark'],
  ['fi', 'Finland'], ['is', 'Iceland'], ['pl', 'Poland'], ['cz', 'Czechia'],
  ['hu', 'Hungary'], ['gr', 'Greece'], ['hr', 'Croatia'], ['ro', 'Romania'],
  ['tr', 'Türkiye'], ['il', 'Israel'], ['ae', 'United Arab Emirates'], ['sa', 'Saudi Arabia'],
  ['qa', 'Qatar'], ['eg', 'Egypt'], ['ma', 'Morocco'], ['za', 'South Africa'],
  ['ke', 'Kenya'], ['ng', 'Nigeria'], ['ru', 'Russia'], ['ua', 'Ukraine'],
];

/** Display name for a passport code ('sg' -> 'Singapore'); the code itself when unknown. */
export function nationalityName(code) {
  const c = String(code || '').toLowerCase();
  return NATIONALITIES.find(([k]) => k === c)?.[1] || c.toUpperCase();
}

export function searchNationalities(query) {
  const q = String(query || '').toLowerCase();
  return NATIONALITIES.filter(([, name]) => name.toLowerCase().includes(q)).slice(0, 8);
}
