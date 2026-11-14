import { supabase } from '../lib/supabase.js';
import { startGeneration } from '../services/generation-manager.js';
import { navigate, onRouteLeave } from '../router.js';
import { escapeHtml } from '../data/day-builder.js';
import { logger } from '../lib/logger.js';
import { showToast } from './toast.js';
import { bindModalA11y } from './trip-detail.js';

// Longest trip we regenerate in one go (the worker plans it in chunks).
const MAX_TRIP_DAYS = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Inline check before anything is written: a typo here would otherwise replace
// a full itinerary with an empty one. Returns an error message or ''.
// No dates at all is fine (flexible-date trips plan by duration).
export function validateTripDates(start, end) {
  if (!start && !end) return '';
  if (!ISO_DATE.test(start || '') || !ISO_DATE.test(end || '')) return 'Choose a start date and an end date.';
  const days = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
  if (!Number.isFinite(days)) return 'Choose a start date and an end date.';
  if (days < 1) return "The end date can't be before the start date.";
  if (days > MAX_TRIP_DAYS) return `Trips can be up to ${MAX_TRIP_DAYS} days long.`;
  return '';
}

const PACE_LABELS = ['', 'Chill', 'Easy', 'Balanced', 'Active', 'Packed'];
const BUDGET_PRESETS = ['backpacker', 'comfortable', 'luxury'];
const INTEREST_OPTIONS = [
  'Temples & Shrines', 'Museums & Galleries', 'Street Food', 'Fine Dining',
  'Nightlife & Bars', 'Nature & Hiking', 'Beach & Water', 'Shopping & Markets',
  'Photography', 'Architecture', 'Local Culture', 'Wellness & Spa',
  'Adventure Sports', 'Historical Sites', 'Live Music', 'Coffee & Cafes',
];

export function showEditModal(trip) {
  const ws = trip.wizard_state || {};
  document.querySelector('.trip-edit-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'trip-edit-overlay';

  const dates = ws.dates || {};
  const budget = ws.budget || {};
  const style = ws.style || {};
  const summary = ws.summary || {};
  const interests = style.activities || [];

  const travelers = Math.min(Math.max(parseInt(ws.travelers, 10) || 1, 1), 20);
  const level = (v, fallback) => Math.min(Math.max(parseInt(v, 10) || fallback, 1), 5);
  const isoOrEmpty = (v) => (ISO_DATE.test(v || '') ? v : '');

  overlay.innerHTML = `
    <div class="trip-edit-modal" role="dialog" aria-modal="true" aria-labelledby="te-title">
      <div class="trip-edit-header">
        <h2 class="text-h2" id="te-title">Edit & Regenerate</h2>
        <button type="button" class="trip-edit-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <div class="trip-edit-body">
        <p class="trip-edit-note">Adjust your preferences below and regenerate. Your current itinerary will be replaced with a fresh one.</p>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-start">Dates</label>
          <div class="trip-edit-row">
            <input type="date" class="trip-edit-input" id="te-start" value="${isoOrEmpty(dates.start)}" aria-label="Start date">
            <span style="color:var(--ink-ghost)">to</span>
            <input type="date" class="trip-edit-input" id="te-end" value="${isoOrEmpty(dates.end)}" min="${isoOrEmpty(dates.start)}" aria-label="End date">
          </div>
          <p class="trip-edit-error" id="te-date-error" role="alert" hidden></p>
        </div>

        <div class="trip-edit-section">
          <span class="trip-edit-label" id="te-travelers-label">Travelers</span>
          <div class="trip-edit-stepper" role="group" aria-labelledby="te-travelers-label">
            <button type="button" class="trip-edit-step-btn" data-dir="-1" aria-label="Fewer travelers">-</button>
            <span class="trip-edit-step-val" id="te-travelers" aria-live="polite">${travelers}</span>
            <button type="button" class="trip-edit-step-btn" data-dir="1" aria-label="More travelers">+</button>
          </div>
        </div>

        <div class="trip-edit-section">
          <span class="trip-edit-label" id="te-budget-label">Budget Level</span>
          <div class="trip-edit-chips" id="te-budget-chips" role="group" aria-labelledby="te-budget-label">
            ${BUDGET_PRESETS.map(p => `
              <button type="button" class="chip ${budget.preset === p ? 'chip--active' : ''}" data-val="${p}" aria-pressed="${budget.preset === p}">${p[0].toUpperCase() + p.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-daily-budget">Daily Budget (${escapeHtml(ws.destination?.currencyCode || 'USD')})</label>
          <input type="number" class="trip-edit-input" id="te-daily-budget" value="${Number(budget.dailyAmount) || 0}" min="0" step="10">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-pace">Pace <span class="trip-edit-pace-label" id="te-pace-label">${PACE_LABELS[level(style.pace, 3)]}</span></label>
          <input type="range" class="trip-edit-slider" id="te-pace" min="1" max="5" value="${level(style.pace, 3)}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-food">Food Focus</label>
          <input type="range" class="trip-edit-slider" id="te-food" min="1" max="5" value="${level(style.food, 3)}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-nightlife">Nightlife</label>
          <input type="range" class="trip-edit-slider" id="te-nightlife" min="1" max="5" value="${level(style.nightlife, 1)}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-exploration">Exploration</label>
          <input type="range" class="trip-edit-slider" id="te-exploration" min="1" max="5" value="${level(style.exploration, 3)}">
        </div>

        <div class="trip-edit-section">
          <span class="trip-edit-label" id="te-interests-label">Interests</span>
          <div class="trip-edit-chips trip-edit-interests" id="te-interests" role="group" aria-labelledby="te-interests-label">
            ${INTEREST_OPTIONS.map(i => `
              <button type="button" class="chip ${interests.includes(i) ? 'chip--active' : ''}" data-interest="${escapeHtml(i)}" aria-pressed="${interests.includes(i)}">${escapeHtml(i)}</button>
            `).join('')}
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-must-do">Must-do activities</label>
          <textarea class="trip-edit-textarea" id="te-must-do" rows="2" placeholder="e.g. Visit the Grand Bazaar, see the Blue Mosque at sunset">${escapeHtml(summary.mustDo || '')}</textarea>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-dietary">Dietary needs</label>
          <input type="text" class="trip-edit-input" id="te-dietary" value="${escapeHtml(summary.dietary || '')}" placeholder="e.g. Vegetarian, no shellfish">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label" for="te-avoid">Things to avoid</label>
          <input type="text" class="trip-edit-input" id="te-avoid" value="${escapeHtml(summary.avoid || '')}" placeholder="e.g. Touristy restaurants, long bus rides">
        </div>
      </div>

      <div class="trip-edit-footer">
        <button type="button" class="btn btn--ghost btn--pill" id="te-cancel">Cancel</button>
        <button type="button" class="btn btn--primary btn--pill" id="te-regenerate">Regenerate Itinerary</button>
      </div>
    </div>`;

  const opener = document.activeElement;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('trip-edit-overlay--visible'));

  let releaseDialog = () => {};
  let unregisterLeave = () => {};
  const close = () => {
    releaseDialog();
    releaseDialog = () => {};
    unregisterLeave();
    overlay.classList.remove('trip-edit-overlay--visible');
    setTimeout(() => overlay.remove(), 200);
  };
  releaseDialog = bindModalA11y(overlay.querySelector('.trip-edit-modal'), { onClose: close, returnFocus: opener });
  // Leaving the page (Back) closes the sheet instead of leaving it over the next page.
  unregisterLeave = onRouteLeave(close);

  overlay.querySelector('.trip-edit-close').addEventListener('click', close);
  overlay.querySelector('#te-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const travelersEl = overlay.querySelector('#te-travelers');
  overlay.querySelectorAll('.trip-edit-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let v = parseInt(travelersEl.textContent, 10) + parseInt(btn.dataset.dir, 10);
      v = Math.max(1, Math.min(20, v));
      travelersEl.textContent = v;
    });
  });

  const budgetChips = overlay.querySelector('#te-budget-chips');
  budgetChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    budgetChips.querySelectorAll('.chip').forEach(c => { c.classList.remove('chip--active'); c.setAttribute('aria-pressed', 'false'); });
    chip.classList.add('chip--active');
    chip.setAttribute('aria-pressed', 'true');
  });

  const paceSlider = overlay.querySelector('#te-pace');
  const paceLabel = overlay.querySelector('#te-pace-label');
  paceSlider.addEventListener('input', () => { paceLabel.textContent = PACE_LABELS[paceSlider.value]; });

  const interestsEl = overlay.querySelector('#te-interests');
  interestsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const active = interestsEl.querySelectorAll('.chip--active');
    if (!chip.classList.contains('chip--active') && active.length >= 8) return;
    chip.classList.toggle('chip--active');
    chip.setAttribute('aria-pressed', String(chip.classList.contains('chip--active')));
  });

  const startInput = overlay.querySelector('#te-start');
  const endInput = overlay.querySelector('#te-end');
  const dateError = overlay.querySelector('#te-date-error');
  const showDateError = (msg) => {
    dateError.textContent = msg;
    dateError.hidden = !msg;
    startInput.setAttribute('aria-invalid', String(Boolean(msg)));
    endInput.setAttribute('aria-invalid', String(Boolean(msg)));
  };
  startInput.addEventListener('change', () => {
    endInput.min = startInput.value || '';
    if (!dateError.hidden) showDateError(validateTripDates(startInput.value, endInput.value));
  });
  endInput.addEventListener('change', () => {
    if (!dateError.hidden) showDateError(validateTripDates(startInput.value, endInput.value));
  });

  overlay.querySelector('#te-regenerate').addEventListener('click', async () => {
    const regenBtn = overlay.querySelector('#te-regenerate');
    const start = startInput.value || dates.start || '';
    const end = endInput.value || dates.end || '';
    const dateMsg = validateTripDates(start, end);
    if (dateMsg) {
      showDateError(dateMsg);
      (startInput.value ? endInput : startInput).focus();
      return;
    }
    showDateError('');
    regenBtn.disabled = true;
    regenBtn.textContent = 'Regenerating...';

    const selectedBudget = budgetChips.querySelector('.chip--active')?.dataset.val || budget.preset;
    const selectedInterests = [...interestsEl.querySelectorAll('.chip--active')].map(c => c.dataset.interest);

    const updatedState = {
      ...ws,
      dates: { ...dates, start, end },
      travelers: parseInt(travelersEl.textContent, 10),
      budget: {
        preset: selectedBudget,
        dailyAmount: parseInt(overlay.querySelector('#te-daily-budget').value, 10) || budget.dailyAmount,
      },
      style: {
        pace: parseInt(paceSlider.value, 10),
        food: parseInt(overlay.querySelector('#te-food').value, 10),
        nightlife: parseInt(overlay.querySelector('#te-nightlife').value, 10),
        exploration: parseInt(overlay.querySelector('#te-exploration').value, 10),
        activities: selectedInterests,
      },
      summary: {
        ...summary,
        mustDo: overlay.querySelector('#te-must-do').value,
        dietary: overlay.querySelector('#te-dietary').value,
        avoid: overlay.querySelector('#te-avoid').value,
      },
    };

    // Do NOT delete the existing itinerary here. The async worker regenerates
    // into a fresh set and swaps atomically via replace_itinerary, so a failed
    // regeneration leaves the user's current itinerary intact.
    const { error } = await supabase.from('trips').update({
      wizard_state: updatedState,
      status: 'generating',
      travelers: updatedState.travelers,
      start_date: updatedState.dates.start || null,
      end_date: updatedState.dates.end || null,
      budget_daily: updatedState.budget.dailyAmount || 0,
    }).eq('id', trip.id);
    if (error) {
      logger.error('data', 'Trip update before regenerate failed', { tripId: trip.id, error: error.message });
      showToast("We couldn't save your changes. Check your connection and try again.", 'error');
      regenBtn.disabled = false;
      regenBtn.textContent = 'Regenerate Itinerary';
      return;
    }

    startGeneration(trip.id, updatedState);
    close();
    navigate('/');
  });
}
