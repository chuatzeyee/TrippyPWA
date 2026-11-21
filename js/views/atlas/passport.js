// The passport of the Atlas view: a stamp per country. Plans are not journeys (blueprint section 10,
// rows 3 and 26): a stamp says how many plans name the country, "now" while one is running, and the
// date of one that is coming up. Owner: VC.
import { attr, cls, esc, flagChip } from '../shared/html.js';
import { countriesText, plansText, shortDate } from './words.js';

/** The colour tokens a stamp is inked in, by its place in the list. */
export const STAMP_INKS = Object.freeze(['teal', 'terracotta', 'plum', 'steel', 'amber', 'rose', 'sage']);
const TILTS = [-3, 2, -1, 3, -2, 1, -3, 2, 0, -2, 3];

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const slug = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place';

/**
 * @param {import('../contract.js').TravelStats['byCountry']} byCountry  model.stats.byCountry, in its order
 * @returns {{ stamped: object[], coming: object[] }} stamped: countries of past and current plans;
 *   coming: countries only an upcoming plan names. Each stamp is { key, flag, code3 ('' when the
 *   country has no code: the name then stands alone), country, note, ink, round, tilt }.
 */
export function stampRows(byCountry) {
  const named = (Array.isArray(byCountry) ? byCountry : []).filter((entry) => entry && text(entry.country) !== '');
  const seen = new Map();
  const keyOf = (entry) => {
    const base = `${slug(entry.flag) === 'place' ? '' : `${slug(entry.flag)}-`}${slug(entry.country)}`;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    return nth > 1 ? `${base}-${nth}` : base;
  };
  const stampOf = (entry, i, note) => ({
    key: keyOf(entry), flag: text(entry.flag), code3: text(entry.code3), country: text(entry.country), note,
    ink: STAMP_INKS[i % STAMP_INKS.length], round: i % 3 === 1, tilt: TILTS[i % TILTS.length],
  });
  return {
    stamped: named.filter((entry) => entry.phase !== 'upcoming').map((entry, i) => stampOf(entry, i, entry.phase === 'live' ? 'now' : plansText(entry.trips))),
    coming: named.filter((entry) => entry.phase === 'upcoming').map((entry, i) => ({ ...stampOf(entry, i, shortDate(entry.firstDate) || 'No dates yet'), round: false, tilt: i % 2 ? 2 : -2 })),
  };
}

/** "9 countries: 8 in plans so far, 1 coming up". */
export function passportLine({ stamped = [], coming = [] } = {}) {
  if (!stamped.length && !coming.length) return 'No countries yet';
  if (!coming.length) return `${countriesText(stamped.length)} in plans so far`;
  if (!stamped.length) return `${countriesText(coming.length)} coming up`;
  return `${countriesText(stamped.length + coming.length)}: ${stamped.length} in plans so far, ${coming.length} coming up`;
}

function stampHtml(stamp, pending) {
  const classes = cls('atl-stamp', { 'atl-stamp--round': stamp.round && !pending, 'atl-stamp--pending': pending });
  const style = pending ? `--atl-tilt:${stamp.tilt}deg` : `--atl-ink:var(--${stamp.ink});--atl-tilt:${stamp.tilt}deg`;
  const code = stamp.code3 ? `<code class="atl-stamp-code">${esc(stamp.code3)}</code>` : '';
  return `<li class="${classes}"${attr('data-key', stamp.key)} style="${style}">${flagChip(stamp.flag, { size: 22 })}${code}<b class="atl-stamp-name">${esc(stamp.country)}</b><small class="atl-stamp-note">${esc(stamp.note)}</small></li>`;
}

/** The stamps as two lists: what the plans hold so far, then what is coming up. '' without a country. */
export function stampsHtml({ stamped = [], coming = [] } = {}) {
  const first = stamped.length
    ? `<ul class="atl-stamps"${attr('aria-label', `In plans so far, ${countriesText(stamped.length)}`)}>${stamped.map((stamp) => stampHtml(stamp, false)).join('')}</ul>` : '';
  const next = coming.length
    ? `<p class="atl-stamps-k">Coming up</p><ul class="atl-stamps atl-stamps--pending"${attr('aria-label', `Coming up, ${countriesText(coming.length)}`)}>${coming.map((stamp) => stampHtml(stamp, true)).join('')}</ul>` : '';
  return `${first}${next}`;
}

/** The flags of every country in one row, the ones that are only coming up set back. One image for a reader. */
export function flagRowHtml(rows) {
  const { stamped = [], coming = [] } = rows ?? {};
  const flags = [...stamped.map((stamp) => flagChip(stamp.flag, { size: 20 })), ...coming.map((stamp) => {
    const chip = flagChip(stamp.flag, { size: 20 });
    return chip ? `<span class="atl-flag-pending">${chip}</span>` : '';
  })].join('');
  return flags ? `<span class="atl-flagrow" role="img"${attr('aria-label', passportLine(rows))}>${flags}</span>` : '';
}
