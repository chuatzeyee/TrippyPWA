import { logger } from '../lib/logger.js';

// Advisory visa/travel-authorisation lookups. Data is static JSON served from
// our own CDN: per-passport requirement files generated from the MIT-licensed
// passport-index dataset (scripts/build-visa-data.mjs), plus a hand-curated
// table of electronic travel authorisations (fees, lead times, official URLs).
//
// This feature is deliberately ADVISORY-ONLY: codes are simplified, datasets
// lag reality, and entry decisions belong to border authorities — every output
// must be displayed with the disclaimer and link ONLY to official portals.

const REQ_LABELS = {
  vf: 'Visa-free',
  voa: 'Visa on arrival',
  ev: 'eVisa required',
  eta: 'Electronic travel authorisation required',
  vr: 'Visa required',
  na: 'Entry restricted',
};

// Recommended application lead time (days before departure) per category, used
// when the destination has no curated authorisation entry.
const DEFAULT_LEAD_DAYS = { ev: 14, eta: 7, vr: 45 };

let _authorisations = null;
const _passportCache = new Map();

const BASE = import.meta.env.BASE_URL || '/';

async function fetchJson(path) {
  const res = await fetch(`${BASE}data/visa/${path}`);
  if (!res.ok) throw new Error(`visa data ${path}: ${res.status}`);
  return res.json();
}

async function loadAuthorisations() {
  if (_authorisations) return _authorisations;
  const data = await fetchJson('authorisations.json');
  delete data._comment;
  _authorisations = data;
  return data;
}

async function loadPassport(passportIso2) {
  const key = passportIso2.toUpperCase();
  if (_passportCache.has(key)) return _passportCache.get(key);
  const data = await fetchJson(`${key}.json`);
  _passportCache.set(key, data);
  return data;
}

// Date arithmetic on YYYY-MM-DD strings, calendar-safe.
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Look up entry requirements for one passport and one destination country.
 *
 * @param {string} passportIso2 - traveller's passport country (ISO2, any case)
 * @param {string} destIso2 - destination country (ISO2, any case)
 * @param {string|null} departDate - trip start date YYYY-MM-DD (for apply-by)
 * @returns advisory object or null when no action is needed / data missing
 */
export async function checkRequirement(passportIso2, destIso2, departDate) {
  if (!passportIso2 || !destIso2) return null;
  const passport = passportIso2.toUpperCase();
  const dest = destIso2.toUpperCase();
  if (passport === dest) return null;

  let req, auths;
  try {
    [req, auths] = await Promise.all([
      loadPassport(passport).then(m => m[dest]),
      loadAuthorisations(),
    ]);
  } catch (e) {
    logger.warn('data', 'Visa lookup failed', { passport, dest, error: e?.message });
    return null;
  }
  if (!req) return null;

  const auth = auths[dest] || null;
  // The matrix may say visa-free while the destination still demands an
  // ARRIVAL CARD from everyone (TH TDAC, SG SGAC). eTA-kind entries, however,
  // only apply when the matrix itself says 'eta' — exemptions (e.g. K-ETA's
  // exempt nationalities) are encoded per passport in the matrix.
  // VOA destinations with a pre-purchasable eVisa (e.g. Indonesia e-VOA) are
  // surfaced too — buying in advance skips the airport queue.
  const voaWithEvisa = req.c === 'voa' && auth?.kind === 'evisa';
  const needsAction = req.c === 'ev' || req.c === 'eta' || req.c === 'vr'
    || voaWithEvisa || (auth && auth.kind === 'arrival-card');
  if (!needsAction && req.c !== 'na') {
    return {
      level: 'ok',
      code: req.c,
      label: REQ_LABELS[req.c] || req.c,
      stayDays: req.d || null,
      auth: null,
      applyBy: null,
    };
  }
  if (req.c === 'na') {
    return { level: 'blocked', code: 'na', label: REQ_LABELS.na, stayDays: null, auth: null, applyBy: null };
  }

  // The curated authorisation entry only applies when the PASSPORT's matrix
  // category matches its kind. ESTA (kind=eta) is only for nationalities whose
  // matrix entry says 'eta' — an Indian passport gets 'vr' for the US and must
  // see "Visa required", not ESTA. Same for eVisas. Arrival cards are universal
  // paperwork but must not mask a visa requirement (IN→SG shows the eVisa, with
  // the arrival card as a note).
  // voa also accepts evisa-kind entries (advance purchase option).
  const KIND_FOR_CODE = { eta: 'eta', ev: 'evisa', voa: 'evisa' };
  const cardOnly = auth?.kind === 'arrival-card' && (req.c === 'vf' || req.c === 'voa');
  const visaMasksCard = auth?.kind === 'arrival-card' && !cardOnly;
  const authMatches = auth && (cardOnly || auth.kind === KIND_FOR_CODE[req.c]);

  const effectiveAuth = authMatches ? auth : null;
  const leadDays = effectiveAuth?.leadDays ?? DEFAULT_LEAD_DAYS[req.c] ?? 14;
  const applyBy = departDate ? addDays(departDate, -leadDays) : null;
  // Arrival cards can only be filed inside a window before arrival.
  const applyFrom = departDate && effectiveAuth?.window ? addDays(departDate, -effectiveAuth.window) : null;

  return {
    level: cardOnly ? 'info' : 'action',
    code: req.c,
    label: cardOnly || effectiveAuth ? (effectiveAuth?.name || REQ_LABELS[req.c]) : REQ_LABELS[req.c] || req.c,
    stayDays: req.d || null,
    auth: effectiveAuth,
    // Surface the masked arrival card as a note so it isn't lost entirely.
    extraNote: visaMasksCard ? `Also submit the ${auth.name} (free) within ${auth.window || 3} days of arrival.` : null,
    applyBy,
    applyFrom,
  };
}

/**
 * Check all distinct destination countries of a trip's wizard state.
 * Returns one advisory per country that needs attention (level !== 'ok').
 */
export async function checkTrip(wizardState, nationalityIso2) {
  if (!nationalityIso2) return [];
  const dests = wizardState?.multiCity
    ? (wizardState.destinations || [])
    : (wizardState?.destination ? [wizardState.destination] : []);
  const countries = [...new Set(dests.map(d => (d.flag || '').toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c)))];
  const departDate = wizardState?.dates?.start || null;

  const results = await Promise.all(
    countries.map(c => checkRequirement(nationalityIso2, c, departDate)
      .then(r => r && r.level !== 'ok' ? { country: c, ...r } : null))
  );
  return results.filter(Boolean);
}

export const VISA_DISCLAIMER =
  'Entry requirements are provided for general guidance only and may be out of date. ' +
  'Always verify with the official government source or your embassy before travelling. ' +
  'Approval of a visa or travel authorisation does not guarantee entry.';
