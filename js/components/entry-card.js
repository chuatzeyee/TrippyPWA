// "Entry requirements" card: what each passport in the group needs for every
// country on the trip, in the order the traveller meets them. Sits right after
// the Flights / Transport card. Items can be ticked off (kept on this device).
import { escapeHtml as esc } from '../data/day-builder.js';
import { NATIONALITIES, nationalityName } from '../data/nationalities.js';
import { TICKS_EVENT } from '../data/tick-store.js';
import { safeUrl } from '../lib/trip-extras.js';
import { logger } from '../lib/logger.js';
import { groundJourney, journeyMode } from '../lib/journey.js';
import { visaLine, timingLine, mergeRows, entryDoneKey, entryHaveKey, needsHaveTick } from '../lib/entry-rules.js';
import { entryPlan } from '../services/entry-advisor.js';
import { VISA_DISCLAIMER } from '../services/visa-advisor.js';

// These three live in js/lib/entry-rules.js now; they are still exported from
// here for the modules that import them from this path.
export { visaLine, timingLine, mergeRows };

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

function passportsLabel(list) {
  const names = list.map(nationalityName);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${joined} passport${names.length > 1 ? 's' : ''}`;
}

// "I have this": the tick for a visa line that asks for something the row
// has no required item for (a visa from an embassy, an authorisation with no
// item). Kept with the item ticks, under entryHaveKey.
function haveTickHtml(key, done, about) {
  return `
        <label class="ec-check ec-have">
          <input type="checkbox" data-entry-done="${esc(key)}" ${done ? 'checked' : ''}>
          <span class="ec-item-name">I have this<span class="ec-sr"> for ${esc(about)}</span></span>
        </label>`;
}

function countryHtml(country, { many, done, tripId, groupSize, haveTick }) {
  const sub = country.role === 'transit' ? 'Connection only'
    : country.role === 'home' ? 'Coming home' : '';
  const merged = mergeRows(country.rows);
  // Name the passports whenever a row does not cover the whole group.
  const label = many && (merged.length > 1 || merged[0]?.passports.length < groupSize);
  const rows = merged.map(row => {
    const tone = VISA_TONE[row.visa?.code] || 'ok';
    const line = country.role === 'transit' ? '' : visaLine(row.visa);
    const haveKey = haveTick && line && needsHaveTick(row) ? entryHaveKey(tripId, country.iso2, row.passports) : '';
    const have = haveKey
      ? haveTickHtml(haveKey, !!done[haveKey], `${countryName(country.iso2)}${label ? `, ${passportsLabel(row.passports)}` : ''}`)
      : '';
    return `
      <div class="ec-row">
        ${label ? `<p class="ec-passport">${row.passports.map(flag).join('')}${esc(passportsLabel(row.passports))}</p>` : ''}
        ${line ? `<p class="ec-visa ec-visa--${tone}"><span class="ec-dot" aria-hidden="true"></span>${esc(line)}</p>${have}` : ''}
        ${row.items.length ? `<ul class="ec-items">${row.items.map(item => {
          const key = entryDoneKey(tripId, country.iso2, row.passports, item.id);
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
 *
 * Optional, and without them the card is as it always was:
 * - `onPlan(plan, reason)` is called once at the end of every render: with
 *   (plan, null) when the card drew the plan, and also just before `onEmpty`
 *   hides the card; with (null, 'no-passport') when it asks for a passport;
 *   with (null, 'failed') when the plan could not be worked out. `plan` is
 *   what entryPlan returned, `checked` included.
 * - `haveTick: true` adds an "I have this" checkbox under a visa line that
 *   needs action and has no required item to tick.
 * Every tick, with or without these, also dispatches a bubbling `trippy:ticks`
 * event from `slot` once it is stored.
 */
export async function mountEntryCard(slot, { trip, homeFlag, getPassports, savePassports, onEmpty, onPlan, haveTick = false }) {
  if (!slot) return;
  const report = (plan, reason) => {
    if (!onPlan) return;
    try { onPlan(plan, reason); } catch (e) {
      logger.warn('data', 'Entry plan listener failed', { error: e?.message });
    }
  };
  const render = async () => {
    const passports = getPassports().map(p => p.toUpperCase());
    if (!passports.length) {
      slot.innerHTML = `
        <div class="ec">
          <p class="ec-ask">Which passport are you travelling on? Trippy will list the visas and arrival cards each country on this trip needs.</p>
          ${passportsBarHtml([])}
        </div>`;
      report(null, 'no-passport');
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
      report(null, 'failed');
      return;
    }
    if (!plan.countries.length) {
      if (onEmpty && !passports.some(p => p !== String(homeFlag || '').toUpperCase())) {
        report(plan, null);
        onEmpty();
        return;
      }
    }
    const done = readDone(trip.id);
    const many = passports.length > 1;
    slot.innerHTML = `
      <div class="ec">
        ${passportsBarHtml(passports)}
        ${plan.countries.length
          ? plan.countries.map(c => countryHtml(c, { many, done, tripId: trip.id, groupSize: passports.length, haveTick })).join('')
          : '<p class="ec-ask">Nothing to prepare for entry with these passports.</p>'}
        <p class="ec-disclaimer">${esc(VISA_DISCLAIMER)}</p>
      </div>`;
    report(plan, null);
  };

  slot.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-entry-done]');
    if (box) {
      const key = box.dataset.entryDone;
      const all = readDone(trip.id);
      const next = { ...all, [key]: box.checked };
      try { localStorage.setItem(DONE_KEY(trip.id), JSON.stringify(next)); } catch { /* private mode */ }
      box.closest('.ec-item')?.classList.toggle('is-done', box.checked);
      slot.dispatchEvent(new CustomEvent(TICKS_EVENT, {
        bubbles: true, detail: { tripId: trip.id, store: 'entry-done', key, checked: box.checked },
      }));
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
