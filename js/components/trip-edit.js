import { supabase } from '../lib/supabase.js';
import { startGeneration } from '../services/generation-manager.js';
import { navigate } from '../router.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
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
  const existing = document.querySelector('.trip-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'trip-edit-overlay';

  const dates = ws.dates || {};
  const budget = ws.budget || {};
  const style = ws.style || {};
  const summary = ws.summary || {};
  const interests = style.activities || [];

  overlay.innerHTML = `
    <div class="trip-edit-modal">
      <div class="trip-edit-header">
        <h2 class="text-h2">Edit & Regenerate</h2>
        <button class="trip-edit-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <div class="trip-edit-body">
        <p class="trip-edit-note">Adjust your preferences below and regenerate. Your current itinerary will be replaced with a fresh one.</p>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Dates</label>
          <div class="trip-edit-row">
            <input type="date" class="trip-edit-input" id="te-start" value="${dates.start || ''}">
            <span style="color:var(--ink-ghost)">to</span>
            <input type="date" class="trip-edit-input" id="te-end" value="${dates.end || ''}">
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Travelers</label>
          <div class="trip-edit-stepper">
            <button class="trip-edit-step-btn" data-dir="-1">-</button>
            <span class="trip-edit-step-val" id="te-travelers">${ws.travelers || 1}</span>
            <button class="trip-edit-step-btn" data-dir="1">+</button>
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Budget Level</label>
          <div class="trip-edit-chips" id="te-budget-chips">
            ${BUDGET_PRESETS.map(p => `
              <button class="chip ${budget.preset === p ? 'chip--active' : ''}" data-val="${p}">${p[0].toUpperCase() + p.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Daily Budget (${esc(ws.destination?.currencyCode || 'USD')})</label>
          <input type="number" class="trip-edit-input" id="te-daily-budget" value="${budget.dailyAmount || 0}" min="0" step="10">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Pace <span class="trip-edit-pace-label" id="te-pace-label">${PACE_LABELS[style.pace || 3]}</span></label>
          <input type="range" class="trip-edit-slider" id="te-pace" min="1" max="5" value="${style.pace || 3}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Food Focus</label>
          <input type="range" class="trip-edit-slider" id="te-food" min="1" max="5" value="${style.food || 3}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Nightlife</label>
          <input type="range" class="trip-edit-slider" id="te-nightlife" min="1" max="5" value="${style.nightlife || 1}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Exploration</label>
          <input type="range" class="trip-edit-slider" id="te-exploration" min="1" max="5" value="${style.exploration || 3}">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Interests</label>
          <div class="trip-edit-chips trip-edit-interests" id="te-interests">
            ${INTEREST_OPTIONS.map(i => `
              <button class="chip ${interests.includes(i) ? 'chip--active' : ''}" data-interest="${esc(i)}">${esc(i)}</button>
            `).join('')}
          </div>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Must-do activities</label>
          <textarea class="trip-edit-textarea" id="te-must-do" rows="2" placeholder="e.g. Visit the Grand Bazaar, see the Blue Mosque at sunset">${esc(summary.mustDo || '')}</textarea>
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Dietary needs</label>
          <input type="text" class="trip-edit-input" id="te-dietary" value="${esc(summary.dietary || '')}" placeholder="e.g. Vegetarian, no shellfish">
        </div>

        <div class="trip-edit-section">
          <label class="trip-edit-label">Things to avoid</label>
          <input type="text" class="trip-edit-input" id="te-avoid" value="${esc(summary.avoid || '')}" placeholder="e.g. Touristy restaurants, long bus rides">
        </div>
      </div>

      <div class="trip-edit-footer">
        <button class="btn btn--ghost btn--pill" id="te-cancel">Cancel</button>
        <button class="btn btn--primary btn--pill" id="te-regenerate">Regenerate Itinerary</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('trip-edit-overlay--visible'));

  const close = () => {
    overlay.classList.remove('trip-edit-overlay--visible');
    setTimeout(() => overlay.remove(), 200);
  };

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
    budgetChips.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
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
  });

  overlay.querySelector('#te-regenerate').addEventListener('click', async () => {
    const regenBtn = overlay.querySelector('#te-regenerate');
    regenBtn.disabled = true;
    regenBtn.textContent = 'Regenerating...';

    const selectedBudget = budgetChips.querySelector('.chip--active')?.dataset.val || budget.preset;
    const selectedInterests = [...interestsEl.querySelectorAll('.chip--active')].map(c => c.dataset.interest);

    const updatedState = {
      ...ws,
      dates: {
        ...dates,
        start: overlay.querySelector('#te-start').value || dates.start,
        end: overlay.querySelector('#te-end').value || dates.end,
      },
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

    await supabase.from('trips').update({
      wizard_state: updatedState,
      status: 'generating',
      travelers: updatedState.travelers,
      start_date: updatedState.dates.start || null,
      end_date: updatedState.dates.end || null,
      budget_daily: updatedState.budget.dailyAmount || 0,
    }).eq('id', trip.id);

    const { data: existingDays } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('trip_id', trip.id);

    if (existingDays?.length) {
      for (const d of existingDays) {
        await supabase.from('activities').delete().eq('day_id', d.id);
      }
      await supabase.from('itinerary_days').delete().eq('trip_id', trip.id);
    }

    close();
    navigate('/');

    startGeneration(trip.id, updatedState);
  });
}
