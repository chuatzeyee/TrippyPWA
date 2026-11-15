// "Passports" in the wizard, under the traveller count. Asked here because this
// is where the group is defined, and only for trips abroad. The traveller's
// own passport comes from the profile; companions on a different passport are
// added here. Stored as wizardState.passports (lowercase ISO2, own first) and
// used by the trip's Entry requirements card.
import { escapeHtml as esc } from '../data/day-builder.js';
import { NATIONALITIES, nationalityName } from '../data/nationalities.js';

const flag = (c) => /^[a-z]{2}$/.test(c || '') ? `<img src="https://flagcdn.com/w40/${c}.png" width="20" height="15" alt="" class="pp-flag">` : '';

/** True when any destination is outside the traveller's home country. */
export function isTripAbroad(state, homeFlag) {
  const home = String(homeFlag || '').toLowerCase();
  const dests = state?.multiCity ? (state.destinations || []) : [state?.destination].filter(Boolean);
  if (!dests.length) return false;
  if (!home) return true;
  return dests.some(d => String(d?.flag || '').toLowerCase() !== home);
}

/** Group passports with the traveller's own first, deduplicated. */
export function groupPassports(statePassports, ownPassport) {
  const own = String(ownPassport || '').toLowerCase();
  const list = (statePassports || []).map(p => String(p).toLowerCase()).filter(p => /^[a-z]{2}$/.test(p));
  return [...new Set([own, ...list].filter(Boolean))];
}

function optionsHtml(exclude) {
  return NATIONALITIES.filter(([c]) => !exclude.includes(c)).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
}

/**
 * Renders into `el`. `own` is the profile nationality ('' if unknown);
 * `onChange(passports, ownChanged)` receives the new list.
 */
export function renderPassportPicker(el, { passports, own, travelers, onChange }) {
  const group = groupPassports(passports, own);
  const self = group[0] || '';
  const others = group.slice(1);
  el.innerHTML = `
    <div class="pp">
      <div class="wizard-section-label">Passports</div>
      <p class="pp-hint">So Trippy can list the visas and arrival cards each person needs.</p>
      <div class="pp-row">
        <span class="pp-who">Yours</span>
        ${self && own ? `<span class="pp-chip">${flag(self)}${esc(nationalityName(self))}</span>` : `
          <label class="pp-select"><span class="pp-sr">Your passport</span>
            <select data-pp-own>
              <option value="">Choose your passport</option>
              ${optionsHtml([])}
            </select>
          </label>`}
      </div>
      ${travelers > 1 ? `
        <div class="pp-row">
          <span class="pp-who">Others</span>
          <ul class="pp-chips">
            ${others.map(p => `<li class="pp-chip">${flag(p)}${esc(nationalityName(p))}<button type="button" class="pp-x" data-pp-remove="${p}" aria-label="Remove ${esc(nationalityName(p))}">&times;</button></li>`).join('')}
            <li><label class="pp-select"><span class="pp-sr">Add a different passport</span>
              <select data-pp-add>
                <option value="">${others.length ? 'Add another passport' : 'Same as yours, or add one'}</option>
                ${optionsHtml(group)}
              </select>
            </label></li>
          </ul>
        </div>` : ''}
    </div>`;

  el.querySelector('[data-pp-own]')?.addEventListener('change', (e) => {
    if (e.target.value) onChange(groupPassports(others, e.target.value), true);
  });
  el.querySelector('[data-pp-add]')?.addEventListener('change', (e) => {
    if (e.target.value) onChange([...group, e.target.value], false);
  });
  el.querySelectorAll('[data-pp-remove]').forEach(btn => btn.addEventListener('click', () => {
    onChange(group.filter(p => p !== btn.dataset.ppRemove), false);
  }));
}
