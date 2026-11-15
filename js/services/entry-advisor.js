// What each passport in the group must (or should) do to enter each country on
// the trip: visa status from the passport matrix (visa-advisor), plus the
// paperwork the matrix does not capture (arrival cards, ETAs, eVisas, levies)
// from the researched table in public/data/visa/entry-steps.json.
//
// Advisory only, like visa-advisor: official links, a disclaimer, never a block.
import { logger } from '../lib/logger.js';
import { checkRequirement } from './visa-advisor.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

// Airports seen on routes from Singapore, to find connection countries.
export const AIRPORT_COUNTRY = {
  SIN: 'SG', KUL: 'MY', PEN: 'MY', BKI: 'MY', JHB: 'MY', BKK: 'TH', DMK: 'TH', HKT: 'TH', CNX: 'TH',
  HKG: 'HK', MFM: 'MO', TPE: 'TW', TSA: 'TW', KHH: 'TW', ICN: 'KR', GMP: 'KR', PUS: 'KR', CJU: 'KR',
  NRT: 'JP', HND: 'JP', KIX: 'JP', ITM: 'JP', CTS: 'JP', FUK: 'JP', NGO: 'JP', OKA: 'JP',
  PVG: 'CN', SHA: 'CN', PEK: 'CN', PKX: 'CN', CAN: 'CN', SZX: 'CN', CTU: 'CN', TFU: 'CN', XMN: 'CN', KMG: 'CN',
  MNL: 'PH', CEB: 'PH', CGK: 'ID', DPS: 'ID', SUB: 'ID', BTH: 'ID', SGN: 'VN', HAN: 'VN', DAD: 'VN',
  PNH: 'KH', REP: 'KH', SAI: 'KH', VTE: 'LA', LPQ: 'LA', BWN: 'BN', RGN: 'MM',
  DXB: 'AE', AUH: 'AE', DOH: 'QA', MCT: 'OM', AMM: 'JO', RUH: 'SA', JED: 'SA', IST: 'TR', SAW: 'TR', CAI: 'EG',
  DEL: 'IN', BOM: 'IN', BLR: 'IN', MAA: 'IN', CMB: 'LK', MLE: 'MV', KTM: 'NP',
  SYD: 'AU', MEL: 'AU', BNE: 'AU', PER: 'AU', ADL: 'AU', AKL: 'NZ', CHC: 'NZ', ZQN: 'NZ',
  LHR: 'GB', LGW: 'GB', MAN: 'GB', DUB: 'IE', CDG: 'FR', FRA: 'DE', MUC: 'DE', AMS: 'NL', ZRH: 'CH',
  FCO: 'IT', MXP: 'IT', MAD: 'ES', BCN: 'ES', LIS: 'PT', HEL: 'FI', CPH: 'DK', ARN: 'SE', OSL: 'NO', VIE: 'AT',
  LAX: 'US', SFO: 'US', JFK: 'US', SEA: 'US', YVR: 'CA', YYZ: 'CA', MEX: 'MX',
};

// Schengen members in Trippy's catalogue share one entry ("EU-SCHENGEN").
export const SCHENGEN = new Set(['AT', 'BE', 'CH', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IS', 'IT', 'NL', 'NO', 'PL', 'PT', 'SE', 'LU', 'MT', 'SI', 'SK', 'EE', 'LV', 'LT', 'LI']);

let _steps = null;

/** The researched entry table, keyed by country (ISO2 or "EU-SCHENGEN"). */
export async function loadEntrySteps(fetchImpl = fetch) {
  if (_steps) return _steps;
  const res = await fetchImpl(`${BASE}data/visa/entry-steps.json`);
  if (!res.ok) throw new Error(`entry steps: ${res.status}`);
  const data = await res.json();
  _steps = data.countries || {};
  return _steps;
}

function routeCodes(leg) {
  return String(leg?.route || '').toUpperCase().match(/\b[A-Z]{3}\b/g) || [];
}

/**
 * Countries the trip enters. `visit`: destinations; `transit`: countries only
 * passed through on a flight connection; `home`: the traveller's home country
 * (entered again on the way back). `arrival`: 'air', 'land' or 'sea'.
 */
export function tripCountries({ wizardState, extras, homeFlag, groundMode = '' }) {
  const home = String(homeFlag || '').toUpperCase() || null;
  const dests = wizardState?.multiCity ? (wizardState.destinations || []) : [wizardState?.destination].filter(Boolean);
  const visit = [...new Set(dests.map(d => String(d?.flag || '').toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c) && c !== home))];
  const transit = [];
  if (!groundMode) {
    for (const leg of [extras?.flights?.outbound, extras?.flights?.inbound]) {
      for (const code of routeCodes(leg).slice(1, -1)) {
        const c = AIRPORT_COUNTRY[code];
        if (c && c !== home && !visit.includes(c) && !transit.includes(c)) transit.push(c);
      }
    }
  }
  const arrival = groundMode === 'ferry' ? 'sea' : groundMode ? 'land' : 'air';
  return { visit, transit, home, arrival };
}

const entryKey = (iso2) => (SCHENGEN.has(iso2) ? 'EU-SCHENGEN' : iso2);

/**
 * Items one passport must or should do for one country, given how they arrive
 * and the visa category the matrix gives (vf, voa, ev, eta, vr).
 */
export function applicableItems(entry, { passport, mode, tripStart, matrixCode, places = [], vehicle = '' }) {
  const p = String(passport || '').toUpperCase();
  const where = places.map(x => String(x || '').toLowerCase());
  return (entry?.items || []).filter(item => {
    // Place- or vehicle-specific items (Bali levy, Venice fee, Malaysia's VEP
    // for cars) only when the trip goes there or drives.
    if (Array.isArray(item.places) && item.places.length
      && !item.places.some(pl => where.some(w => w.includes(pl)))) return false;
    if (Array.isArray(item.vehicles) && item.vehicles.length && !item.vehicles.includes(vehicle)) return false;
    if ((item.exemptNationalities || []).map(c => c.toUpperCase()).includes(p)) return false;
    const only = (item.onlyNationalities || []).map(c => c.toUpperCase());
    if (only.length && !only.includes(p)) return false;
    if (Array.isArray(item.modes) && item.modes.length && !item.modes.includes(mode)) return false;
    if (tripStart && item.effectiveFrom && tripStart < item.effectiveFrom) return false;
    if (tripStart && item.effectiveUntil && tripStart > item.effectiveUntil) return false;
    // Visa-type items follow the passport's matrix category; paperwork that
    // applies to everyone (arrival cards, registrations, levies) does not.
    if (item.kind === 'eta') return matrixCode === 'eta' || only.includes(p);
    if (item.kind === 'evisa') return matrixCode === 'ev' || only.includes(p);
    if (item.kind === 'voa-online') return matrixCode === 'voa';
    return true;
  });
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** { from, by } dates for an item before arriving on `arriveDate`. */
export function itemDates(item, arriveDate) {
  if (!arriveDate) return { from: null, by: null };
  const from = Number.isInteger(item.windowDays) ? addDays(arriveDate, -item.windowDays) : null;
  const by = Number.isInteger(item.leadDays) ? addDays(arriveDate, -item.leadDays) : null;
  return { from, by: by && from && by < from ? from : by };
}

/**
 * The full plan: one entry per country (visit, then transit, then home), each
 * with a row per passport. Countries with nothing to report are left out.
 */
export async function entryPlan({ wizardState, extras, passports, homeFlag, groundMode = '', tripStart = null, tripEnd = null }) {
  const group = [...new Set((passports || []).map(p => String(p).toUpperCase()).filter(p => /^[A-Z]{2}$/.test(p)))];
  if (!group.length) return { passports: [], countries: [] };
  let steps = {};
  try { steps = await loadEntrySteps(); } catch (e) {
    logger.warn('data', 'Entry steps unavailable', { error: e?.message });
  }
  const { visit, transit, home, arrival } = tripCountries({ wizardState, extras, homeFlag, groundMode });
  const places = (wizardState?.multiCity ? wizardState.destinations : [wizardState?.destination])
    .filter(Boolean).flatMap(d => [d.name, d.region, d.country].filter(Boolean));
  const roles = [
    ...visit.map(c => ({ iso2: c, role: 'visit', date: tripStart })),
    ...transit.map(c => ({ iso2: c, role: 'transit', date: tripStart })),
    ...(home ? [{ iso2: home, role: 'home', date: tripEnd }] : []),
  ];

  const countries = [];
  for (const { iso2, role, date } of roles) {
    const entry = steps[entryKey(iso2)] || null;
    const rows = [];
    for (const passport of group) {
      if (passport === iso2) continue; // citizens enter freely
      if (role === 'transit') { rows.push({ passport, visa: null, items: [] }); continue; }
      const visa = await checkRequirement(passport, iso2, date).catch(() => null);
      const items = applicableItems(entry, { passport, mode: arrival, tripStart: date, matrixCode: visa?.code, places, vehicle: groundMode })
        .map(item => ({ ...item, dates: itemDates(item, date) }));
      rows.push({ passport, visa, items });
    }
    const hasNews = role === 'transit'
      ? rows.length > 0 && !!entry?.transit
      : rows.some(r => r.items.length || (r.visa && r.visa.code !== 'vf'));
    // Home only matters for companions on another passport.
    if (role === 'home' && !rows.some(r => r.items.length || (r.visa && r.visa.code !== 'vf'))) continue;
    if (!rows.length || (!hasNews && role !== 'visit')) continue;
    countries.push({ iso2, role, transit: entry?.transit || '', landSea: arrival === 'air' ? '' : (entry?.landSea || ''), rows });
  }
  return { passports: group, countries };
}

/** Test hook: reset the cached table. */
export function _resetEntryStepsCache() { _steps = null; }
