// "Entry requirements" card: what each passport in the group needs for every
// country on the trip, in the order the traveller meets them. Sits right after
// the Flights / Transport card. Items can be ticked off (kept on this device).
import { escapeHtml as esc } from '../data/day-builder.js';
import { NATIONALITIES, nationalityName } from '../data/nationalities.js';
import { safeUrl } from '../lib/trip-extras.js';
import { logger } from '../lib/logger.js';
import { entryPlan } from '../services/entry-advisor.js';
import { VISA_DISCLAIMER } from '../services/visa-advisor.js';
import { groundJourney, journeyMode } from './transport-card.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_LABELS = {
  'arrival-card': 'Arrival card', eta: 'Travel authorisation', evisa: 'eVisa',
  'voa-online': 'Visa on arrival, online', levy: 'Tourist levy', registration: 'Online registration',
};
const VISA_TONE = { vf: 'ok', voa: 'note', eta: 'action', ev: 'action', vr: 'action', na: 'blocked' };
const COUNTRY_NAMES = new Map(NATIONALITIES.map(([c, n]) => [c.toUpperCase(), n]));
COUNTRY_NAMES.set('EU-SCHENGEN', 'Schengen area');

const PASSPORT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 3c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm4 13H8v-2h8v2zm-4-7c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';

const flag = (iso2) => {
  const c = String(iso2 || '').toLowerCase();
  return /^[a-z]{2}$/.test(c) ? `<img class="ec-flag" src="https://flagcdn.com/w40/${c}.png" alt="" width="20" height="15" loading="lazy">` : '';
};
const countryName = (iso2) => COUNTRY_NAMES.get(String(iso2).toUpperCase()) || String(iso2).toUpperCase();
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : '';
};

/** One line on the visa status for a passport. Exported for tests. */
export function visaLine(visa) {
  if (!visa) return '';
  if (visa.code === 'vf') return visa.stayDays ? `Visa-free, up to ${visa.stayDays} days` : 'Visa-free';
  if (visa.code === 'voa') return 'Visa on arrival';
  if (visa.code === 'eta') return 'Travel authorisation needed before you fly';
  if (visa.code === 'ev') return 'eVisa needed before you travel';
  if (visa.code === 'vr') return 'Visa needed. Apply at an embassy or consulate well ahead';
  if (visa.code === 'na') return 'Entry is restricted for this passport';
  return visa.label || '';
}

/** "Do from 10 Jan, by 10 Jan" style timing. Exported for tests. */
export function timingLine(item) {
  const { from, by } = item.dates || {};
  if (from && by && from === by) return `Do it on ${shortDate(from)}, it can't be done earlier`;
  if (from && by) return `Do it between ${shortDate(from)} and ${shortDate(by)}`;
  if (from) return `Opens ${shortDate(from)}, do it before you arrive`;
  if (by) return `Do it by ${shortDate(by)}`;
  return '';
}

function itemHtml(item, key, done) {
  const url = safeUrl(item.url);
  const timing = timingLine(item);
  return `
    <li class="ec-item${done ? ' is-done' : ''}">
      <label class="ec-check">
        <input type="checkbox" data-entry-done="${esc(key)}" ${done ? 'checked' : ''}>
        <span class="ec-item-name">${esc(item.name)}</span>
      </label>
      <p class="ec-item-meta">
        <span class="ec-tag ec-tag--${item.required ? 'required' : 'optional'}">${item.required ? 'Required' : 'Recommended'}</span>
        <span>${esc(KIND_LABELS[item.kind] || '')}</span>
        ${item.fee ? `<span>${esc(item.fee)}</span>` : ''}
      </p>
      ${timing ? `<p class="ec-item-when">${esc(timing)}</p>` : ''}
      ${item.steps?.length || item.note ? `
        <details class="ec-more">
          <summary>How to do it</summary>
          ${item.steps?.length ? `<ol class="ec-steps">${item.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
          ${item.note ? `<p class="ec-note">${esc(item.note)}</p>` : ''}
        </details>` : ''}
      ${url ? `<a class="ec-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official site ${OPEN_ICON}</a>` : ''}
    </li>`;
}

/**
 * Rows with the same visa status and the same paperwork become one row naming
 * every passport it covers. Exported for tests.
 */
export function mergeRows(rows) {
  const groups = [];
  for (const row of rows) {
    const sig = `${row.visa?.code || ''}|${row.visa?.stayDays || ''}|${row.items.map(i => i.id).join(',')}`;
    const same = groups.find(g => g.sig === sig);
    if (same) same.passports.push(row.passport);
    else groups.push({ sig, ...row, passports: [row.passport] });
  }
  return groups;
}

function passportsLabel(list) {
  const names = list.map(nationalityName);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${joined} passport${names.length > 1 ? 's' : ''}`;
}

function countryHtml(country, { many, done, tripId, groupSize }) {
  const sub = country.role === 'transit' ? 'Connection only'
    : country.role === 'home' ? 'Coming home' : '';
  const merged = mergeRows(country.rows);
  // Name the passports whenever a row does not cover the whole group.
  const label = many && (merged.length > 1 || merged[0]?.passports.length < groupSize);
  const rows = merged.map(row => {
    const tone = VISA_TONE[row.visa?.code] || 'ok';
    const line = country.role === 'transit' ? '' : visaLine(row.visa);
    return `
      <div class="ec-row">
        ${label ? `<p class="ec-passport">${row.passports.map(flag).join('')}${esc(passportsLabel(row.passports))}</p>` : ''}
        ${line ? `<p class="ec-visa ec-visa--${tone}"><span class="ec-dot" aria-hidden="true"></span>${esc(line)}</p>` : ''}
        ${row.items.length ? `<ul class="ec-items">${row.items.map(item => {
          const key = `${tripId}:${country.iso2}:${row.passports.join('+')}:${item.id}`;
          return itemHtml(item, key, !!done[key]);
        }).join('')}</ul>` : ''}
      </div>`;
  }).join('');
  return `
    <section class="ec-country">
      <h4 class="ec-country-name">${flag(country.iso2)}<span>${esc(countryName(country.iso2))}</span>${sub ? `<span class="ec-role">${sub}</span>` : ''}</h4>
      ${country.role === 'transit' && country.transit ? foldedHtml(country.transit) : rows}
      ${country.landSea ? foldedHtml(country.landSea, 'Crossing by land or sea') : ''}
    </section>`;
}

/** First sentence shown, the rest behind "More". Exported for tests. */
export function splitLead(text) {
  const t = String(text || '').trim();
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(t);
  return m ? [m[1], m[2]] : [t, ''];
}

function foldedHtml(text, title = '') {
  const [lead, rest] = splitLead(text);
  return `
    <div class="ec-fold">
      ${title ? `<p class="ec-fold-title">${esc(title)}</p>` : ''}
      <p class="ec-transit">${esc(lead)}</p>
      ${rest ? `<details class="ec-more"><summary>More</summary><p class="ec-transit">${esc(rest)}</p></details>` : ''}
    </div>`;
}

function passportsBarHtml(passports) {
  return `
    <div class="ec-passports">
      <p class="ec-passports-label">Passports in your group</p>
      <ul class="ec-chips">
        ${passports.map(p => `<li class="ec-chip">${flag(p)}${esc(nationalityName(p))}<button type="button" class="ec-chip-x" data-remove-passport="${esc(p.toLowerCase())}" aria-label="Remove ${esc(nationalityName(p))} passport">&times;</button></li>`).join('')}
        <li>
          <label class="ec-add">
            <span class="ec-sr">Add a passport</span>
            <select data-add-passport>
              <option value="">Add a passport</option>
              ${NATIONALITIES.filter(([c]) => !passports.includes(c.toUpperCase())).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}
            </select>
          </label>
        </li>
      </ul>
    </div>`;
}

const DONE_KEY = (tripId) => `entry-done-${tripId}`;
function readDone(tripId) {
  try { return JSON.parse(localStorage.getItem(DONE_KEY(tripId)) || '{}') || {}; } catch { return {}; }
}

/**
 * Fills `slot` with the card body and returns { refresh }. `getPassports` /
 * `savePassports` read and write the group's passports (lowercase ISO2);
 * savePassports is expected to refresh every mounted card afterwards.
 * `homeFlag` is the profile's home country.
 */
export async function mountEntryCard(slot, { trip, homeFlag, getPassports, savePassports, onEmpty }) {
  if (!slot) return;
  const render = async () => {
    const passports = getPassports().map(p => p.toUpperCase());
    if (!passports.length) {
      slot.innerHTML = `
        <div class="ec">
          <p class="ec-ask">Which passport are you travelling on? Trippy will list the visas and arrival cards each country on this trip needs.</p>
          ${passportsBarHtml([])}
        </div>`;
      return;
    }
    slot.innerHTML = '<p class="ec-loading">Checking entry requirements</p>';
    const ground = groundJourney(trip.extras);
    let plan;
    try {
      plan = await entryPlan({
        wizardState: trip.wizard_state, extras: trip.extras, passports, homeFlag,
        groundMode: ground ? journeyMode(ground) : '', tripStart: trip.start_date || null, tripEnd: trip.end_date || null,
      });
    } catch (e) {
      logger.warn('data', 'Entry plan failed', { error: e?.message });
      slot.innerHTML = '<p class="ec-loading">Entry requirements could not be loaded. Check the official immigration sites for each country.</p>';
      return;
    }
    if (!plan.countries.length) {
      if (onEmpty && !passports.some(p => p !== String(homeFlag || '').toUpperCase())) { onEmpty(); return; }
    }
    const done = readDone(trip.id);
    const many = passports.length > 1;
    slot.innerHTML = `
      <div class="ec">
        ${passportsBarHtml(passports)}
        ${plan.countries.length
          ? plan.countries.map(c => countryHtml(c, { many, done, tripId: trip.id, groupSize: passports.length })).join('')
          : '<p class="ec-ask">Nothing to prepare for entry with these passports.</p>'}
        <p class="ec-disclaimer">${esc(VISA_DISCLAIMER)}</p>
      </div>`;
  };

  slot.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-entry-done]');
    if (box) {
      const all = readDone(trip.id);
      const next = { ...all, [box.dataset.entryDone]: box.checked };
      try { localStorage.setItem(DONE_KEY(trip.id), JSON.stringify(next)); } catch { /* private mode */ }
      box.closest('.ec-item')?.classList.toggle('is-done', box.checked);
      return;
    }
    const add = e.target.closest('[data-add-passport]');
    if (add?.value) await savePassports([...getPassports(), add.value]);
  });
  slot.addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove-passport]');
    if (!remove) return;
    await savePassports(getPassports().filter(p => p.toLowerCase() !== remove.dataset.removePassport));
  });

  await render();
  return { refresh: render };
}

export const ENTRY_ICON = PASSPORT_ICON;
