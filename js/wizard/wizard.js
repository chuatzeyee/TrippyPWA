import { navigate } from '../router.js';
import { escapeHtml } from '../data/day-builder.js';
import { loadWizardState, saveWizardState, updateWizardField, clearWizardState, canAdvance } from './wizard-state.js';
import { searchDestinations, getPopularDestinations } from './destinations.js';
import { renderCalendar } from './calendar.js';
import { convert, formatCurrency } from '../data/currencies.js';
import { getHomeCurrency } from '../data/user-prefs.js';
import { formatNumber } from '../lib/locale.js';

const TOTAL_STEPS = 8;

const FLAG_COLORS = {
  jp: ['#BC002D', '#FFFFFF'],
  au: ['#00008B', '#FFFFFF', '#D4483B'],
  cn: ['#DE2910', '#FFDE00'],
  id: ['#FF0000', '#FFFFFF'],
  fi: ['#003580', '#FFFFFF'],
  gb: ['#012169', '#C8102E', '#FFFFFF'],
  kr: ['#003478', '#C60C30', '#FFFFFF'],
  ch: ['#D52B1E', '#FFFFFF'],
  my: ['#010066', '#CC0001', '#FFCC00'],
  th: ['#A51931', '#F4F5F8', '#2D2A4A'],
  vn: ['#DA251D', '#FFFF00'],
  es: ['#AA151B', '#F1BF00'],
  fr: ['#002395', '#FFFFFF', '#ED2939'],
  us: ['#3C3B6E', '#B22234', '#FFFFFF'],
  sg: ['#ED2939', '#FFFFFF'],
  it: ['#008C45', '#FFFFFF', '#CD212A'],
  pt: ['#006600', '#FF0000'],
  tr: ['#E30A17', '#FFFFFF'],
  nl: ['#21468B', '#FFFFFF', '#AE1C28'],
  ae: ['#00732F', '#FFFFFF', '#FF0000', '#000000'],
  tw: ['#000095', '#FE0000'],
  ph: ['#0038A8', '#CE1126', '#FCD116'],
  kh: ['#032EA1', '#E00025'],
  la: ['#CE1126', '#002868', '#FFFFFF'],
  se: ['#006AA7', '#FECC00'],
  no: ['#EF2B2D', '#002868', '#FFFFFF'],
  is: ['#003897', '#D72828', '#FFFFFF'],
  de: ['#000000', '#DD0000', '#FFCC00'],
  at: ['#ED2939', '#FFFFFF'],
  gr: ['#0D5EAF', '#FFFFFF'],
  hr: ['#FF0000', '#FFFFFF', '#171796'],
  cz: ['#11457E', '#D7141A', '#FFFFFF'],
  hk: ['#DE2910', '#FFFFFF'],
  nz: ['#00247D', '#CC142B', '#FFFFFF'],
  za: ['#007A4D', '#FFB612', '#000000', '#DE3831'],
  mx: ['#006847', '#FFFFFF', '#CE1126'],
  br: ['#009C3B', '#FFDF00', '#002776'],
  ar: ['#74ACDF', '#FFFFFF', '#F6B40E'],
  pe: ['#D91023', '#FFFFFF'],
  co: ['#FCD116', '#003893', '#CE1126'],
  ma: ['#C1272D', '#006233'],
  eg: ['#CE1126', '#FFFFFF', '#000000'],
  ke: ['#006600', '#BB0000', '#000000'],
};

function applyFlagBackground(flagCode) {
  const wizard = document.querySelector('.wizard');
  if (!wizard) return;

  let overlay = wizard.querySelector('.wizard-flag-bg');
  if (!flagCode || !FLAG_COLORS[flagCode]) {
    if (overlay) {
      overlay.classList.remove('wizard-flag-bg--in');
      setTimeout(() => overlay.remove(), 600);
    }
    return;
  }

  const colors = FLAG_COLORS[flagCode].filter(c => {
    const hex = c.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r + g + b) < 680;
  });
  if (colors.length === 0) { if (overlay) overlay.remove(); return; }
  const layouts = [
    [{ x: 30, y: 20, rx: 70, ry: 60 }, { x: 75, y: 75, rx: 65, ry: 55 }],
    [{ x: 15, y: 15, rx: 60, ry: 50 }, { x: 85, y: 80, rx: 60, ry: 50 }, { x: 50, y: 45, rx: 55, ry: 45 }],
    [{ x: 10, y: 10, rx: 55, ry: 45 }, { x: 90, y: 20, rx: 50, ry: 45 }, { x: 50, y: 85, rx: 55, ry: 50 }, { x: 30, y: 50, rx: 45, ry: 40 }],
  ];
  const posSet = layouts[Math.min(colors.length, 4) - 2] || layouts[1];

  const gradients = colors.map((c, i) => {
    const pos = posSet[i % posSet.length];
    return `radial-gradient(ellipse ${pos.rx}% ${pos.ry}% at ${pos.x}% ${pos.y}%, ${c} 0%, transparent 70%)`;
  }).join(', ');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'wizard-flag-bg';
    wizard.prepend(overlay);
  }

  overlay.style.backgroundImage = gradients;
  overlay.classList.remove('wizard-flag-bg--in');
  void overlay.offsetWidth;
  overlay.classList.add('wizard-flag-bg--in');
}

const INTERESTS = [
  'Museums', 'Markets', 'Nature', 'Temples', 'Beaches', 'Hiking',
  'Photography', 'Cooking Classes', 'Live Music', 'Sports',
  'Wellness', 'Architecture', 'Street Art', 'Local Workshops',
  'Coffee & Cafes', 'Wine & Bars', 'Vinyl Records'
];

const NEARBY_THRESHOLD_KM = 500;

const TRANSPORT_MODES = [
  { key: 'ferry', icon: '⛴️', title: 'Ferry', desc: 'By sea' },
  { key: 'bus', icon: '🚌', title: 'Bus', desc: 'Coach / express' },
  { key: 'train', icon: '🚂', title: 'Train', desc: 'Rail / high-speed' },
  { key: 'drive', icon: '🚗', title: 'Drive', desc: 'Self-drive / rental' },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let _homeCoords = null;
let _homeCoordsLoaded = false;

async function loadHomeCoords() {
  if (_homeCoordsLoaded) return _homeCoords;
  _homeCoordsLoaded = true;
  try {
    const { fetchProfile } = await import('../data/profile-repository.js');
    const { data: profile } = await fetchProfile();
    if (profile?.home_city) {
      const match = DESTINATIONS.find(d => d.name.toLowerCase() === profile.home_city.toLowerCase());
      if (match) _homeCoords = { lat: match.lat, lng: match.lng };
    }
  } catch { /* no profile = default to flights */ }
  return _homeCoords;
}

function computeNearby(dest) {
  if (!dest?.lat || !dest?.lng || !_homeCoords) return false;
  return haversineKm(_homeCoords.lat, _homeCoords.lng, dest.lat, dest.lng) < NEARBY_THRESHOLD_KM;
}

function isNearbyTrip() {
  if (!state) return false;
  const dest = state.multiCity ? state.destinations?.[0] : state.destination;
  return computeNearby(dest);
}

function isSameCityTrip() {
  if (!state) return false;
  const dest = state.multiCity ? state.destinations?.[0] : state.destination;
  if (!dest?.lat || !dest?.lng || !_homeCoords) return false;
  return haversineKm(_homeCoords.lat, _homeCoords.lng, dest.lat, dest.lng) < 10;
}

let state = null;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

const WEEKDAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderFreeDayChips(container, el) {
  const freeDays = state.dates.freeDays || [];
  const isFixed = state.dates.mode === 'fixed' && state.dates.start && state.dates.end;
  const dayCount = isFixed
    ? Math.round((new Date(state.dates.end) - new Date(state.dates.start)) / 86400000) + 1
    : (state.dates.duration || 7);

  if (dayCount <= 0) return;

  const chips = [];
  for (let i = 0; i < dayCount; i++) {
    let label, value;
    if (isFixed) {
      const d = new Date(new Date(state.dates.start + 'T00:00:00').getTime() + i * 86400000);
      label = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
      value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      label = `Day ${i + 1}`;
      value = String(i + 1);
    }
    const active = freeDays.includes(value);
    chips.push(`<button class="free-day-chip ${active ? 'free-day-chip--active' : ''}" data-free-day="${value}">${active ? '💼 ' : ''}${escapeHtml(label)}</button>`);
  }

  container.innerHTML = `
    <div class="wizard-section-label" style="margin-top: var(--sp-6);">Any free days?</div>
    <p class="text-small" style="color: var(--ink-ghost); margin-bottom: var(--sp-3);">Tap days reserved for work or conferences. We'll keep them light</p>
    <div class="free-day-chips">${chips.join('')}</div>
  `;

  container.querySelectorAll('[data-free-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.freeDay;
      const current = state.dates.freeDays || [];
      const next = current.includes(val) ? current.filter(d => d !== val) : [...current, val];
      state.dates = { ...state.dates, freeDays: next };
      state = updateWizardField(state, 'dates', state.dates);
      renderFreeDayChips(container, el);
    });
  });
}

function flagImg(code, size = 20) {
  if (!code) return '';
  const w = size <= 20 ? 40 : 80;
  return `<img src="https://flagcdn.com/w${w}/${code}.png" width="${size}" height="${Math.round(size * 0.75)}" alt="" style="border-radius:2px; object-fit:cover; display:block;">`;
}

export async function clearAndStart(preselectedDest) {
  clearWizardState();
  state = loadWizardState();
  await loadHomeCoords();
  if (preselectedDest) {
    state.destination = preselectedDest;
    state.currentStep = 2;
    state.furthestStep = 2;
    saveWizardState(state);
  }
  renderShell();
}

export async function renderWizard(step) {
  state = loadWizardState();
  await loadHomeCoords();
  if (step && step >= 1 && step <= TOTAL_STEPS) {
    state.currentStep = step;
  }
  renderShell();
}

function renderFooterPills() {
  const pills = [];
  if (state.multiCity && state.destinations.length > 0) {
    const label = state.destinations.length <= 2
      ? state.destinations.map(d => d.name).join(', ')
      : state.destinations.slice(0, 2).map(d => d.name).join(', ') + ` +${state.destinations.length - 2}`;
    pills.push(`<span class="wizard-footer-pill">${flagImg(state.destinations[0].flag, 14)} <strong>${escapeHtml(label)}</strong></span>`);
  } else if (state.destination?.name) {
    pills.push(`<span class="wizard-footer-pill">${flagImg(state.destination.flag, 14)} <strong>${escapeHtml(state.destination.name)}</strong></span>`);
  }
  if (state.dates.start && state.dates.end) {
    pills.push(`<span class="wizard-footer-pill">📅 ${formatDateShort(state.dates.start)} &ndash; ${formatDateShort(state.dates.end)}</span>`);
  } else if (state.dates.duration && state.dates.season) {
    pills.push(`<span class="wizard-footer-pill">📅 ~${state.dates.duration}d, ${state.dates.season}</span>`);
  }
  if (state.budget.dailyAmount > 0) {
    const sym = state.destination?.currencySymbol || '$';
    pills.push(`<span class="wizard-footer-pill">💰 ${sym}${formatNumber(state.budget.dailyAmount)}/day</span>`);
  }
  if (state.accommodation.type) {
    const accom = ACCOM_TYPES.find(a => a.key === state.accommodation.type);
    if (accom) pills.push(`<span class="wizard-footer-pill">${accom.icon} ${accom.title}</span>`);
  }
  if (isNearbyTrip() && state.transport?.mode) {
    const tm = TRANSPORT_MODES.find(t => t.key === state.transport.mode);
    if (tm) pills.push(`<span class="wizard-footer-pill">${tm.icon} ${tm.title}</span>`);
  } else if (state.flights.fareClass && state.flights.fareClass !== 'economy') {
    pills.push(`<span class="wizard-footer-pill">✈️ ${state.flights.fareClass}</span>`);
  }
  if (state.style.activities.length > 0) {
    const label = state.style.activities.length <= 3
      ? state.style.activities.join(', ')
      : state.style.activities.slice(0, 2).join(', ') + ` +${state.style.activities.length - 2}`;
    pills.push(`<span class="wizard-footer-pill">🎯 ${escapeHtml(label)}</span>`);
  }
  if (state.travelers > 1) {
    pills.push(`<span class="wizard-footer-pill">👥 ${state.travelers}</span>`);
  }
  if (pills.length === 0) return '';
  return `<div class="wizard-footer"><div class="wizard-footer-pills">${pills.join('')}</div></div>`;
}

function renderShell() {
  const app = document.getElementById('app');
  const stepNum = state.currentStep;
  const totalVisible = TOTAL_STEPS - 1;
  const ctaLabel = stepNum === 7 ? 'Generate My Trip ✨' : 'Continue';

  app.innerHTML = `
    <div class="wizard">
      <div class="wizard-header">
        ${stepNum > 1
          ? '<button class="wizard-back btn btn--ghost btn--pill" data-wizard="back" aria-label="Go back">Back</button>'
          : '<div></div>'}
        <div class="wizard-header-center">
          <div class="wizard-progress">
            ${Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const step = i + 1;
              let cls = 'wizard-progress-seg';
              if (step < stepNum) cls += ' wizard-progress-seg--done';
              else if (step === stepNum) cls += ' wizard-progress-seg--active';
              return `<div class="${cls}"></div>`;
            }).join('')}
          </div>
        </div>
        <button class="wizard-close" data-wizard="close" aria-label="Close wizard">✕</button>
      </div>
      <div class="wizard-body">
        <div class="wizard-step" id="wizard-step-content"></div>
      </div>
      <div class="wizard-cta-bar">
        <button class="btn btn--primary btn--lg btn--pill wizard-cta-btn" data-wizard="next" ${canAdvance(state) ? '' : 'disabled'}>
          ${ctaLabel}
        </button>
      </div>
      ${renderFooterPills()}
    </div>
  `;

  renderStep();
  bindWizardEvents();
}

function bindWizardEvents() {
  const wizard = document.querySelector('.wizard');
  wizard.addEventListener('click', (e) => {
    const action = e.target.closest('[data-wizard]')?.dataset.wizard;
    if (!action) return;

    if (action === 'close') {
      clearWizardState();
      navigate('/');
    } else if (action === 'back' && state.currentStep > 1) {
      state.currentStep--;
      if (state.currentStep === 5 && isSameCityTrip()) state.currentStep--;
      saveWizardState(state);
      renderShell();
    } else if (action === 'next' && canAdvance(state)) {
      if (state.currentStep < TOTAL_STEPS) {
        state.currentStep++;
        if (state.currentStep === 5 && isSameCityTrip()) state.currentStep++;
        state.furthestStep = Math.max(state.furthestStep, state.currentStep);
        saveWizardState(state);
        if (state.currentStep === 8) {
          renderGeneration();
        } else {
          renderShell();
        }
      }
    }
  });
}

function renderStep() {
  const container = document.getElementById('wizard-step-content');
  if (state.currentStep === 1) {
    applyFlagBackground(state.destination?.flag);
  } else {
    applyFlagBackground(null);
  }
  switch (state.currentStep) {
    case 1: return renderStep1(container);
    case 2: return renderStep2(container);
    case 3: return renderStep3(container);
    case 4: return renderStepAccommodation(container);
    case 5: return isNearbyTrip() ? renderStepTransport(container) : renderStep4(container);
    case 6: return renderStep5(container);
    case 7: return renderStep6(container);
    case 8: return renderGeneration();
  }
}

function renderMultiCityList() {
  if (!state.multiCity || state.destinations.length === 0) return '';
  return `
    <div class="multi-city-list">
      ${state.destinations.map((d, i) => `
        <div class="multi-city-tag">
          ${flagImg(d.flag, 14)}
          <span>${escapeHtml(d.name)}</span>
          <button class="multi-city-remove" data-remove-idx="${i}" aria-label="Remove ${escapeHtml(d.name)}">✕</button>
        </div>
      `).join('')}
    </div>
  `;
}

function hiResImage(url) {
  if (!url) return '';
  return url.replace(/\/\d+px-/, '/500px-');
}

function renderCoverflow(popular, isSelected) {
  const cards = popular.map(d => {
    const bg = d.image
      ? `background-image: url('${escapeHtml(hiResImage(d.image))}'); background-color: var(--surface-inset);`
      : 'background: linear-gradient(135deg, var(--teal-light), var(--terracotta-light));';
    const sel = isSelected(d) ? ' coverflow-card--selected' : '';
    return `
      <div class="coverflow-card${sel}" data-dest='${JSON.stringify(d).replace(/'/g, "&#39;")}' style="${bg}">
        <span class="coverflow-flag">${flagImg(d.flag, 28)}</span>
        <div class="coverflow-label">
          <span class="coverflow-city">${escapeHtml(d.name)}</span>
          <span class="coverflow-country">${escapeHtml(d.country)}</span>
          <span class="coverflow-budget">From $${d.budgetRange.backpacker}/day</span>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="coverflow">
      <div class="coverflow-track">
        <div class="coverflow-inner" id="coverflow-inner">
          ${cards}${cards}
        </div>
      </div>
    </div>`;
}

function setupCoverflowClicks(container) {
  container.querySelectorAll('.coverflow-card').forEach(card => {
    card.addEventListener('click', () => {
      const dest = JSON.parse(card.dataset.dest);
      selectDestination(dest);
    });
  });
}

function renderStep1(el) {
  const popular = getPopularDestinations();
  const isSelected = (d) => state.multiCity
    ? state.destinations.some(s => s.name === d.name)
    : state.destination?.name === d.name;

  el.innerHTML = `
    <h2 class="wizard-step-title">Where to?</h2>
    <p class="wizard-step-subtitle">Search or pick from our favorites</p>
    ${renderCoverflow(popular, isSelected)}
    <div class="multi-city-toggle">
      <button class="chip ${!state.multiCity ? 'chip--active' : ''}" data-mode="single">One city</button>
      <button class="chip ${state.multiCity ? 'chip--active' : ''}" data-mode="multi">Multi-city</button>
    </div>
    ${renderMultiCityList()}
    <div class="dest-search-wrap">
      <span class="dest-search-icon">&#x1F50D;</span>
      <input class="input" type="text" placeholder="${state.multiCity ? 'Add a city...' : 'Search cities...'}" id="dest-search"
        value="${!state.multiCity ? escapeHtml(state.destination?.name || '') : ''}" autocomplete="off">
      <div class="dest-dropdown" id="dest-dropdown"></div>
    </div>
  `;

  setupCoverflowClicks(el);

  el.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const multi = btn.dataset.mode === 'multi';
      state.multiCity = multi;
      if (multi && state.destination && state.destinations.length === 0) {
        state.destinations = [state.destination];
      } else if (!multi && state.destinations.length > 0) {
        state.destination = state.destinations[0];
        state.destinations = [];
      }
      saveWizardState(state);
      renderStep1(el);
      updateNextButton();
    });
  });

  el.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.destinations = state.destinations.filter((_, i) => i !== parseInt(btn.dataset.removeIdx));
      state.destination = state.destinations[0] || null;
      state = updateWizardField(state, 'destinations', state.destinations);
      state = updateWizardField(state, 'destination', state.destination);
      renderStep1(el);
      updateNextButton();
    });
  });

  const searchInput = el.querySelector('#dest-search');
  const dropdown = el.querySelector('#dest-dropdown');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) {
      dropdown.classList.remove('dest-dropdown--open');
      dropdown.innerHTML = '';
      return;
    }
    const matches = searchDestinations(q);
    if (matches.length === 0) {
      dropdown.classList.remove('dest-dropdown--open');
      dropdown.innerHTML = '';
      return;
    }
    dropdown.innerHTML = matches.map(d => {
      const active = state.multiCity
        ? state.destinations.some(s => s.name === d.name)
        : state.destination?.name === d.name;
      return `
        <div class="dest-dropdown-item${active ? ' dest-dropdown-item--active' : ''}" data-dest='${JSON.stringify(d).replace(/'/g, "&#39;")}'>
          <span class="dest-dropdown-flag">${flagImg(d.flag, 24)}</span>
          <div>
            <span class="dest-dropdown-name">${escapeHtml(d.name)}</span>
            <span class="dest-dropdown-country">${escapeHtml(d.country)}</span>
          </div>
        </div>
      `;
    }).join('');
    dropdown.classList.add('dest-dropdown--open');
    bindDropdownClicks(dropdown, searchInput, dropdown);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) searchInput.dispatchEvent(new Event('input'));
  });

}

function selectDestination(dest) {
  if (state.multiCity) {
    const exists = state.destinations.some(d => d.name === dest.name);
    if (exists) {
      state.destinations = state.destinations.filter(d => d.name !== dest.name);
    } else {
      state.destinations = [...state.destinations, dest];
    }
    state.destination = state.destinations[0] || null;
    state = updateWizardField(state, 'destinations', state.destinations);
    state = updateWizardField(state, 'destination', state.destination);
    const searchInput = document.getElementById('dest-search');
    if (searchInput) searchInput.value = '';
    const dropdown = document.getElementById('dest-dropdown');
    if (dropdown) { dropdown.classList.remove('dest-dropdown--open'); dropdown.innerHTML = ''; }
    const stepEl = document.getElementById('wizard-step-content');
    if (stepEl) renderStep1(stepEl);
    applyFlagBackground(state.destination?.flag);
  } else {
    state = updateWizardField(state, 'destination', dest);
    const searchInput = document.getElementById('dest-search');
    if (searchInput) searchInput.value = dest.name;
    const dropdown = document.getElementById('dest-dropdown');
    if (dropdown) { dropdown.classList.remove('dest-dropdown--open'); dropdown.innerHTML = ''; }
    document.querySelectorAll('.destination-card').forEach(c =>
      c.classList.toggle('destination-card--selected', JSON.parse(c.dataset.dest).name === dest.name)
    );
    applyFlagBackground(dest.flag);
  }
  updateNextButton();
}

function bindDropdownClicks(container, searchInput, dropdown) {
  container.querySelectorAll('[data-dest]').forEach(item => {
    item.addEventListener('click', () => selectDestination(JSON.parse(item.dataset.dest)));
  });
}

function renderTravelerStepper(el) {
  const count = state.travelers || 2;
  el.innerHTML = `
    <div class="wizard-section-label">Travelers</div>
    <div class="traveler-stepper">
      <button class="budget-stepper-btn" data-traveler-step="-1" ${count <= 1 ? 'disabled' : ''} aria-label="Fewer travelers">−</button>
      <div class="traveler-stepper-value">
        <span class="traveler-stepper-count">${count}</span>
        <span class="traveler-stepper-label">traveler${count !== 1 ? 's' : ''}</span>
      </div>
      <button class="budget-stepper-btn" data-traveler-step="1" ${count >= 20 ? 'disabled' : ''} aria-label="More travelers">+</button>
    </div>
  `;

  el.querySelectorAll('[data-traveler-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Math.max(1, Math.min(20, count + parseInt(btn.dataset.travelerStep)));
      state = updateWizardField(state, 'travelers', next);
      renderTravelerStepper(el);
    });
  });
}

function renderStep2(el) {
  el.innerHTML = `
    <h2 class="wizard-step-title">When's the adventure?</h2>
    <p class="wizard-step-subtitle">Lock in your dates or let fate decide</p>

    <div id="traveler-section"></div>

    <div class="date-mode-cards" style="margin-top: var(--sp-6);">
      <div class="date-mode-card ${state.dates.mode === 'fixed' ? 'date-mode-card--active' : ''}" data-date-mode="fixed">
        <span class="date-mode-card-icon">📅</span>
        <span class="date-mode-card-title">I know my dates</span>
        <span class="date-mode-card-desc">Pick exact start & end</span>
      </div>
      <div class="date-mode-card ${state.dates.mode === 'flexible' ? 'date-mode-card--active' : ''}" data-date-mode="flexible">
        <span class="date-mode-card-icon">🎲</span>
        <span class="date-mode-card-title">Surprise me</span>
        <span class="date-mode-card-desc">Choose duration & vibe</span>
      </div>
    </div>
    <div id="date-content"></div>
  `;

  renderTravelerStepper(el.querySelector('#traveler-section'));

  el.querySelectorAll('[data-date-mode]').forEach(card => {
    card.addEventListener('click', () => {
      state.dates = { ...state.dates, mode: card.dataset.dateMode };
      state = updateWizardField(state, 'dates', state.dates);
      renderStep2(el);
    });
  });

  const dateContent = el.querySelector('#date-content');
  if (state.dates.mode === 'fixed') {
    const dayCount = state.dates.start && state.dates.end
      ? Math.round((new Date(state.dates.end) - new Date(state.dates.start)) / 86400000) + 1
      : 0;
    dateContent.innerHTML = `
      <p class="text-small" style="color: var(--ink-secondary); margin-bottom: var(--sp-3); text-align: center;">
        ${state.dates.start && state.dates.end
          ? `${state.dates.start} → ${state.dates.end}`
          : 'Tap your departure date, then your return date'}
      </p>
      <div id="cal-container"></div>
      ${dayCount > 0 ? `
        <div class="date-preview">
          <span class="date-preview-days">${dayCount}</span>
          <span class="date-preview-label">day${dayCount !== 1 ? 's' : ''} of adventure</span>
        </div>
        <div id="free-day-section"></div>
      ` : ''}
    `;
    if (dayCount > 0) {
      renderFreeDayChips(dateContent.querySelector('#free-day-section'), el);
    }
    renderCalendar(dateContent.querySelector('#cal-container'), {
      start: state.dates.start,
      end: state.dates.end,
      onSelect: (start, end) => {
        state.dates = { ...state.dates, start, end };
        state = updateWizardField(state, 'dates', state.dates);
        renderStep2(el);
        updateNextButton();
      }
    });
  } else if (state.dates.mode === 'flexible') {
    const durations = [
      { label: 'Getaway', days: 3 },
      { label: 'Quick trip', days: 5 },
      { label: 'Full week', days: 7 },
      { label: 'Deep dive', days: 10 },
      { label: 'Epic', days: 14 }
    ];
    const seasons = [
      { icon: '💰', value: 'off-peak', title: 'Off-peak', desc: 'Fewer crowds, lower prices' },
      { icon: '☀️', value: 'peak', title: 'Peak season', desc: 'Best weather, buzzing energy' },
      { icon: '🍃', value: 'sweet-spot', title: 'Sweet spot', desc: 'Best of both worlds' }
    ];
    dateContent.innerHTML = `
      <div class="wizard-section-label">Duration</div>
      <div class="duration-pills">
        ${durations.map(d => `
          <div class="duration-pill ${state.dates.duration === d.days ? 'duration-pill--active' : ''}" data-duration="${d.days}">
            <span class="duration-pill-days">${d.days}</span>
            <span class="duration-pill-label">${d.label}</span>
          </div>
        `).join('')}
      </div>

      <div class="wizard-section-label">Season</div>
      <div class="season-cards">
        ${seasons.map(s => `
          <div class="season-card ${state.dates.season === s.value ? 'season-card--active' : ''}" data-season="${s.value}">
            <span class="season-card-icon">${s.icon}</span>
            <span class="season-card-title">${s.title}</span>
            <span class="season-card-desc">${s.desc}</span>
          </div>
        `).join('')}
      </div>

      ${state.dates.duration ? `
        <div class="date-preview">
          <span class="date-preview-days">${state.dates.duration}</span>
          <span class="date-preview-label">day${state.dates.duration !== 1 ? 's' : ''}${state.dates.season ? ` · ${seasons.find(s => s.value === state.dates.season)?.title || ''}` : ''}</span>
        </div>
        <div id="free-day-section"></div>
      ` : ''}
    `;
    if (state.dates.duration) {
      renderFreeDayChips(dateContent.querySelector('#free-day-section'), el);
    }
    dateContent.querySelectorAll('[data-duration]').forEach(pill => {
      pill.addEventListener('click', () => {
        state.dates = { ...state.dates, duration: parseInt(pill.dataset.duration) };
        state = updateWizardField(state, 'dates', state.dates);
        renderStep2(el);
        updateNextButton();
      });
    });
    dateContent.querySelectorAll('[data-season]').forEach(card => {
      card.addEventListener('click', () => {
        state.dates = { ...state.dates, season: card.dataset.season };
        state = updateWizardField(state, 'dates', state.dates);
        renderStep2(el);
        updateNextButton();
      });
    });
  }
}

function budgetStepSize(destCode) {
  const raw = convert(5, 'USD', destCode);
  if (raw >= 50000) return 50000;
  if (raw >= 5000) return 5000;
  if (raw >= 500) return 500;
  if (raw >= 50) return 50;
  return 5;
}

function renderStep3(el) {
  const dest = state.destination;
  const budgetsUSD = dest?.budgetRange || { backpacker: 50, comfortable: 120, luxury: 300 };
  const destCode = dest?.currencyCode || 'USD';
  const destSym = dest?.currencySymbol || '$';

  const budgets = {
    backpacker: convert(budgetsUSD.backpacker, 'USD', destCode),
    comfortable: convert(budgetsUSD.comfortable, 'USD', destCode),
    luxury: convert(budgetsUSD.luxury, 'USD', destCode),
  };

  const home = getHomeCurrency();
  const homeCode = home?.code || 'SGD';
  const homeSym = home?.symbol || 'S$';
  const showHome = homeCode !== destCode;

  const currentAmount = state.budget.dailyAmount || budgets.comfortable;
  const homeEquiv = showHome ? convert(currentAmount, destCode, homeCode) : 0;
  const stepSize = budgetStepSize(destCode);

  const days = state.dates.duration || (state.dates.start && state.dates.end
    ? Math.round((new Date(state.dates.end) - new Date(state.dates.start)) / 86400000) + 1
    : 7);
  const travelers = state.travelers || 1;
  const totalDest = currentAmount * days * travelers;
  const totalHome = showHome ? convert(totalDest, destCode, homeCode) : 0;

  el.innerHTML = `
    <h2 class="wizard-step-title">What's your comfort level?</h2>
    <p class="wizard-step-subtitle">Daily budget per person in ${escapeHtml(dest?.name || 'your destination')}</p>
    <div class="budget-presets">
      ${[
        { key: 'backpacker', icon: '🎒', label: 'Backpacker', amount: budgets.backpacker },
        { key: 'comfortable', icon: '🧳', label: 'Comfortable', amount: budgets.comfortable },
        { key: 'luxury', icon: '👑', label: 'Luxury', amount: budgets.luxury }
      ].map(p => `
        <div class="budget-preset ${state.budget.preset === p.key ? 'budget-preset--selected' : ''}" data-preset="${p.key}" data-amount="${p.amount}">
          <div class="budget-preset-icon">${p.icon}</div>
          <div class="budget-preset-label">${p.label}</div>
          <div class="budget-preset-range">~${destSym}${formatNumber(p.amount)}/day</div>
        </div>
      `).join('')}
    </div>

    <div class="wizard-section-label">Fine-tune</div>
    <div class="budget-stepper">
      <button class="budget-stepper-btn" data-budget-step="-${stepSize}" aria-label="Decrease budget">−</button>
      <div class="budget-stepper-value">
        <div class="budget-stepper-amount">${destSym}${formatNumber(currentAmount)}</div>
        <div class="budget-stepper-currency">per day · ${escapeHtml(destCode)}</div>
        ${showHome ? `<div class="budget-stepper-home">${homeSym}${formatNumber(homeEquiv)} ${homeCode}</div>` : ''}
      </div>
      <button class="budget-stepper-btn" data-budget-step="${stepSize}" aria-label="Increase budget">+</button>
    </div>
    <p class="budget-stepper-label">
      ${days} days x ${travelers} traveler${travelers > 1 ? 's' : ''} = <strong>${destSym}${formatNumber(totalDest)}</strong>${showHome ? ` (${homeSym}${formatNumber(totalHome)})` : ''} total
    </p>
  `;

  el.querySelectorAll('[data-preset]').forEach(card => {
    card.addEventListener('click', () => {
      const amount = parseInt(card.dataset.amount);
      state.budget = { ...state.budget, preset: card.dataset.preset, dailyAmount: amount };
      state = updateWizardField(state, 'budget', state.budget);
      renderStep3(el);
      updateNextButton();
    });
  });

  el.querySelectorAll('[data-budget-step]').forEach(btn => {
    let holdInterval = null;
    const step = parseInt(btn.dataset.budgetStep);

    const doStep = () => {
      const next = Math.max(stepSize, (state.budget.dailyAmount || budgets.comfortable) + step);
      state.budget = { ...state.budget, preset: null, dailyAmount: next };
      state = updateWizardField(state, 'budget', state.budget);
      renderStep3(el);
      updateNextButton();
    };

    btn.addEventListener('click', doStep);
    btn.addEventListener('pointerdown', () => {
      holdInterval = setInterval(doStep, 120);
    });
    btn.addEventListener('pointerup', () => clearInterval(holdInterval));
    btn.addEventListener('pointerleave', () => clearInterval(holdInterval));
  });
}

const ACCOM_TYPES = [
  { key: 'hostel', icon: '🛏️', title: 'Hostel', desc: 'Social & budget-friendly', vibe: 'Meet fellow travelers' },
  { key: 'hotel', icon: '🏨', title: 'Hotel', desc: 'Reliable & comfortable', vibe: 'Concierge, room service' },
  { key: 'boutique', icon: '🏛️', title: 'Boutique', desc: 'Unique & curated', vibe: 'Design-forward, local charm' },
  { key: 'apartment', icon: '🏠', title: 'Apartment', desc: 'Live like a local', vibe: 'Kitchen, space, privacy' },
  { key: 'resort', icon: '🌴', title: 'Resort', desc: 'All-inclusive luxury', vibe: 'Pool, spa, dining' },
  { key: 'ryokan', icon: '🏯', title: 'Traditional', desc: 'Riads, ryokans, villas', vibe: 'Cultural immersion' },
];

const ACCOM_PRIORITIES = [
  'Central location', 'Walkability', 'Pool or gym', 'Free breakfast',
  'Kitchen access', 'Workspace', 'Quiet neighborhood', 'Near nightlife',
  'Sea or lake view', 'Pet-friendly', 'Late check-out', 'Contactless check-in',
  'In-unit washer & dryer',
];

function renderStepAccommodation(el) {
  const settled = !!state.accommodation.settled;
  const showStars = state.accommodation.type === 'hotel';
  const currentStars = state.accommodation.stars || 0;

  el.innerHTML = `
    <h2 class="wizard-step-title">Where will you stay?</h2>
    <p class="wizard-step-subtitle">${settled ? 'Already booked. Share details if you like' : 'Pick your style, then what matters most'}</p>

    <button class="settled-toggle ${settled ? 'settled-toggle--active' : ''}" data-settled-accom>
      <span class="settled-toggle-icon">${settled ? '✓' : '✈️'}</span>
      ${settled ? 'Already Settled' : 'Already booked?'}
    </button>

    ${settled ? `
      <div class="settled-fields">
        <label class="settled-field">
          <span class="settled-field-label">Hotel / accommodation address</span>
          <input type="text" class="settled-input" data-settled-field="hotelAddress"
            placeholder="e.g. 123 Main St, Tokyo" value="${escapeHtml(state.accommodation.hotelAddress || '')}">
        </label>
        <label class="settled-field">
          <span class="settled-field-label">Check-in date</span>
          <input type="date" class="settled-input" data-settled-field="checkInDate"
            value="${state.accommodation.checkInDate || ''}">
        </label>
        <p class="settled-hint">Both fields are optional</p>
      </div>
    ` : `
      <div class="accom-grid">
        ${ACCOM_TYPES.map(a => `
          <div class="accom-card ${state.accommodation.type === a.key ? 'accom-card--active' : ''}" data-accom="${a.key}">
            <span class="accom-card-icon">${a.icon}</span>
            <span class="accom-card-title">${a.title}</span>
            <span class="accom-card-desc">${a.desc}</span>
            <span class="accom-card-vibe">${a.vibe}</span>
          </div>
        `).join('')}
      </div>

      ${showStars ? `
        <div class="wizard-section-label">Hotel class</div>
        <div class="accom-stars">
          ${[3, 4, 5].map(s => `
            <button class="accom-star-btn ${currentStars === s ? 'accom-star-btn--active' : ''}" data-stars="${s}">
              <span class="accom-star-icons">${'★'.repeat(s)}</span>
              <span class="accom-star-label">${s}-star</span>
            </button>
          `).join('')}
        </div>
      ` : ''}

      <div class="wizard-section-label">What matters most</div>
      <div class="accom-priorities">
        ${ACCOM_PRIORITIES.map(p => `
          <button class="chip ${state.accommodation.priorities.includes(p) ? 'chip--active' : ''}" data-priority="${escapeHtml(p)}">${escapeHtml(p)}</button>
        `).join('')}
      </div>
    `}
  `;

  el.querySelector('[data-settled-accom]').addEventListener('click', () => {
    state.accommodation = { ...state.accommodation, settled: !settled };
    state = updateWizardField(state, 'accommodation', state.accommodation);
    renderStepAccommodation(el);
    updateNextButton();
  });

  if (settled) {
    el.querySelectorAll('[data-settled-field]').forEach(input => {
      input.addEventListener('input', () => {
        state.accommodation = { ...state.accommodation, [input.dataset.settledField]: input.value };
        state = updateWizardField(state, 'accommodation', state.accommodation);
      });
    });
    return;
  }

  el.querySelectorAll('[data-accom]').forEach(card => {
    card.addEventListener('click', () => {
      const isHotel = card.dataset.accom === 'hotel';
      const wasHotel = state.accommodation.type === 'hotel';
      state.accommodation = {
        ...state.accommodation,
        type: card.dataset.accom,
        stars: isHotel ? (state.accommodation.stars || 0) : 0,
      };
      state = updateWizardField(state, 'accommodation', state.accommodation);
      if (isHotel !== wasHotel) {
        renderStepAccommodation(el);
      } else {
        el.querySelectorAll('.accom-card').forEach(c =>
          c.classList.toggle('accom-card--active', c.dataset.accom === card.dataset.accom)
        );
      }
      updateNextButton();
    });
  });

  el.querySelectorAll('[data-stars]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stars = parseInt(btn.dataset.stars);
      state.accommodation = { ...state.accommodation, stars };
      state = updateWizardField(state, 'accommodation', state.accommodation);
      el.querySelectorAll('.accom-star-btn').forEach(b =>
        b.classList.toggle('accom-star-btn--active', parseInt(b.dataset.stars) === stars)
      );
    });
  });

  el.querySelectorAll('[data-priority]').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.priority;
      const priors = state.accommodation.priorities.includes(p)
        ? state.accommodation.priorities.filter(x => x !== p)
        : state.accommodation.priorities.length < 4
          ? [...state.accommodation.priorities, p]
          : state.accommodation.priorities;
      state.accommodation = { ...state.accommodation, priorities: priors };
      state = updateWizardField(state, 'accommodation', state.accommodation);
      chip.classList.toggle('chip--active', priors.includes(p));
    });
  });
}

function renderStep4(el) {
  const settled = !!state.flights.settled;
  const fares = [
    { key: 'economy', seat: '💺', title: 'Economy', desc: 'Get me there' },
    { key: 'premium', seat: '🛋️', title: 'Premium', desc: 'Extra legroom' },
    { key: 'business', seat: '🥂', title: 'Business', desc: 'Flat-bed vibes' }
  ];
  const times = [
    { icon: '🌅', value: 'morning', label: 'Morning', range: '6am–12pm' },
    { icon: '☀️', value: 'afternoon', label: 'Afternoon', range: '12–5pm' },
    { icon: '🌆', value: 'evening', label: 'Evening', range: '5–10pm' },
    { icon: '🌙', value: 'redeye', label: 'Red-eye', range: '10pm–6am' },
    { icon: '🤷', value: 'any', label: 'Any', range: 'Whatever\'s cheapest' }
  ];
  const connections = [
    { key: 'direct', icon: '✈️→', label: 'Direct' },
    { key: '1 stop', icon: '✈️·✈️', label: '1 Stop' },
    { key: 'any', icon: '🔀', label: 'Any Route' }
  ];

  el.innerHTML = `
    <h2 class="wizard-step-title">How do you fly?</h2>
    <p class="wizard-step-subtitle">${settled ? 'Already booked. Share details if you like' : 'All optional. We\'ll find the best fit'}</p>

    <button class="settled-toggle ${settled ? 'settled-toggle--active' : ''}" data-settled-flights>
      <span class="settled-toggle-icon">${settled ? '✓' : '✈️'}</span>
      ${settled ? 'Already Settled' : 'Already booked?'}
    </button>

    ${settled ? `
      <div class="settled-fields">
        <label class="settled-field">
          <span class="settled-field-label">Flight number</span>
          <input type="text" class="settled-input" data-settled-field="flightNumber"
            placeholder="e.g. SQ 321" value="${escapeHtml(state.flights.flightNumber || '')}">
        </label>
        <label class="settled-field">
          <span class="settled-field-label">Arrival date at destination</span>
          <input type="date" class="settled-input" data-settled-field="arrivalDate"
            value="${state.flights.arrivalDate || ''}">
        </label>
        <p class="settled-hint">Both fields are optional</p>
      </div>
    ` : `
      <div class="wizard-section-label">Cabin class</div>
      <div class="fare-cards">
        ${fares.map(f => `
          <div class="fare-card ${state.flights.fareClass === f.key ? 'fare-card--active' : ''}" data-fare="${f.key}">
            <span class="fare-card-seat">${f.seat}</span>
            <span class="fare-card-title">${f.title}</span>
            <span class="fare-card-desc">${f.desc}</span>
          </div>
        `).join('')}
      </div>

      <div class="wizard-section-label">Departure time</div>
      <div class="departure-time-grid" style="margin-bottom: var(--sp-8);">
        ${times.map(t => {
          const isAny = t.value === 'any';
          const active = isAny
            ? state.flights.departureTimePref.length === 0
            : state.flights.departureTimePref.includes(t.value);
          return `
            <div class="departure-time-card ${active ? 'departure-time-card--active' : ''}" data-time="${t.value}">
              <span class="departure-time-icon">${t.icon}</span>
              <span class="departure-time-label">${t.label}</span>
              <span class="departure-time-range">${t.range}</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="wizard-section-label">Connections</div>
      <div class="connection-cards">
        ${connections.map(c => `
          <div class="connection-card ${state.flights.connectionPref === c.key ? 'connection-card--active' : ''}" data-conn="${c.key}">
            <span class="connection-card-icon">${c.icon}</span>
            <span class="connection-card-label">${c.label}</span>
          </div>
        `).join('')}
      </div>
    `}
  `;

  el.querySelector('[data-settled-flights]').addEventListener('click', () => {
    state.flights = { ...state.flights, settled: !settled };
    state = updateWizardField(state, 'flights', state.flights);
    renderStep4(el);
    updateNextButton();
  });

  if (settled) {
    el.querySelectorAll('[data-settled-field]').forEach(input => {
      input.addEventListener('input', () => {
        state.flights = { ...state.flights, [input.dataset.settledField]: input.value };
        state = updateWizardField(state, 'flights', state.flights);
      });
    });
    return;
  }

  el.querySelectorAll('[data-fare]').forEach(card => {
    card.addEventListener('click', () => {
      state.flights = { ...state.flights, fareClass: card.dataset.fare };
      state = updateWizardField(state, 'flights', state.flights);
      renderStep4(el);
    });
  });

  el.querySelectorAll('[data-time]').forEach(card => {
    card.addEventListener('click', () => {
      const val = card.dataset.time;
      if (val === 'any') {
        state.flights = { ...state.flights, departureTimePref: [] };
      } else {
        const prefs = state.flights.departureTimePref.includes(val)
          ? state.flights.departureTimePref.filter(v => v !== val)
          : [...state.flights.departureTimePref, val];
        state.flights = { ...state.flights, departureTimePref: prefs };
      }
      state = updateWizardField(state, 'flights', state.flights);
      renderStep4(el);
    });
  });

  el.querySelectorAll('[data-conn]').forEach(card => {
    card.addEventListener('click', () => {
      state.flights = { ...state.flights, connectionPref: card.dataset.conn };
      state = updateWizardField(state, 'flights', state.flights);
      renderStep4(el);
    });
  });
}

function renderStepTransport(el) {
  const dest = state.multiCity ? state.destinations?.[0] : state.destination;
  const destName = dest?.name || 'your destination';
  const selected = state.transport?.mode || null;

  el.innerHTML = `
    <h2 class="wizard-step-title">How do you get there?</h2>
    <p class="wizard-step-subtitle">${escapeHtml(destName)} is close by, no flights needed</p>

    <div class="wizard-section-label">Transport mode</div>
    <div class="fare-cards">
      ${TRANSPORT_MODES.map(t => `
        <div class="fare-card ${selected === t.key ? 'fare-card--active' : ''}" data-transport="${t.key}">
          <span class="fare-card-seat">${t.icon}</span>
          <span class="fare-card-title">${t.title}</span>
          <span class="fare-card-desc">${t.desc}</span>
        </div>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('[data-transport]').forEach(card => {
    card.addEventListener('click', () => {
      state.transport = { ...state.transport, mode: card.dataset.transport };
      state = updateWizardField(state, 'transport', state.transport);
      renderStepTransport(el);
      const btn = document.querySelector('[data-wizard="next"]');
      if (btn) btn.disabled = false;
    });
  });
}

function renderStep5(el) {
  const sliders = [
    { key: 'nightlife', left: '🐓 Early bird', right: '🦉 Night owl' },
    { key: 'pace', left: '🦥 Slow & relaxed', right: '🚀 Every hour planned' },
    { key: 'food', left: '🍜 Street food', right: '🍽️ Fine dining' },
    { key: 'exploration', left: '📸 Tourist classics', right: '🧭 Hidden gems' }
  ];

  el.innerHTML = `
    <h2 class="wizard-step-title">How do you travel?</h2>
    <p class="wizard-step-subtitle">Slide to match your style</p>

    ${sliders.map(s => `
      <div class="style-slider">
        <div class="style-slider-header">
          <span class="style-slider-label">${s.left}</span>
          <span class="style-slider-label">${s.right}</span>
        </div>
        <input type="range" min="1" max="5" value="${state.style[s.key]}" data-slider="${s.key}">
      </div>
    `).join('')}

    <p class="text-small" style="margin-bottom: var(--sp-2); margin-top: var(--sp-4);">
      Pick your interests (at least 1)
    </p>
    <div class="interest-grid">
      ${INTERESTS.map(interest => `
        <button class="chip ${state.style.activities.includes(interest) ? 'chip--active' : ''}" data-interest="${escapeHtml(interest)}">
          ${escapeHtml(interest)}
        </button>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('[data-slider]').forEach(slider => {
    slider.addEventListener('input', () => {
      state.style = { ...state.style, [slider.dataset.slider]: parseInt(slider.value) };
      state = updateWizardField(state, 'style', state.style);
    });
  });

  el.querySelectorAll('[data-interest]').forEach(chip => {
    chip.addEventListener('click', () => {
      const interest = chip.dataset.interest;
      const activities = state.style.activities.includes(interest)
        ? state.style.activities.filter(a => a !== interest)
        : state.style.activities.length < 8
          ? [...state.style.activities, interest]
          : state.style.activities;
      state.style = { ...state.style, activities };
      state = updateWizardField(state, 'style', state.style);
      chip.classList.toggle('chip--active', activities.includes(interest));
      updateNextButton();
    });
  });
}

function renderStep6(el) {
  const dest = state.destination;
  const destName = state.multiCity && state.destinations.length > 0
    ? state.destinations.map(d => d.name).join(' → ')
    : dest?.name || 'Not set';

  const dateLabel = state.dates.start
    ? `${formatDateShort(state.dates.start)} → ${formatDateShort(state.dates.end)}`
    : `~${state.dates.duration} days, ${state.dates.season || 'flexible'}`;
  const dateYear = state.dates.start ? new Date(state.dates.start + 'T00:00:00').getFullYear() : '';

  const days = state.dates.duration || (state.dates.start && state.dates.end
    ? Math.round((new Date(state.dates.end) - new Date(state.dates.start)) / 86400000) + 1
    : 7);
  const travelers = state.travelers || 1;
  const sym = dest?.currencySymbol || '$';
  const totalBudget = (state.budget.dailyAmount || 0) * days * travelers;

  const accomType = ACCOM_TYPES.find(a => a.key === state.accommodation.type);
  const starLabel = state.accommodation.stars ? `${state.accommodation.stars}-star ` : '';

  const extras = [
    { key: 'mustDo', label: 'Must-do activities', icon: '📌', placeholder: 'e.g. Visit Sagrada Familia' },
    { key: 'dietary', label: 'Dietary needs', icon: '🥗', placeholder: 'e.g. Vegetarian, nut allergy' },
    { key: 'avoid', label: 'Things to avoid', icon: '🚫', placeholder: 'e.g. Touristy restaurants, long bus rides' },
  ];

  el.innerHTML = `
    <h2 class="wizard-step-title">Your trip at a glance</h2>
    <p class="wizard-step-subtitle">Review everything, then tell us what we missed</p>

    <div class="summary-grid">
      <div class="summary-tile summary-tile--wide">
        <span class="summary-tile-icon">${flagImg(dest?.flag, 20)}</span>
        <span class="summary-tile-label">Destination</span>
        <span class="summary-tile-value">${escapeHtml(destName)}</span>
      </div>
      <div class="summary-tile">
        <span class="summary-tile-icon">📅</span>
        <span class="summary-tile-label">Dates</span>
        <span class="summary-tile-value">${dateLabel}</span>
        ${dateYear ? `<span class="summary-tile-sub">${dateYear}</span>` : ''}
      </div>
      <div class="summary-tile">
        <span class="summary-tile-icon">👥</span>
        <span class="summary-tile-label">Travelers</span>
        <span class="summary-tile-value">${travelers}</span>
      </div>
      <div class="summary-tile">
        <span class="summary-tile-icon">💰</span>
        <span class="summary-tile-label">Daily budget</span>
        <span class="summary-tile-value">${sym}${formatNumber(state.budget.dailyAmount || 0)}</span>
        <span class="summary-tile-sub">${sym}${formatNumber(totalBudget)} total</span>
      </div>
      <div class="summary-tile">
        <span class="summary-tile-icon">${accomType?.icon || '🏨'}</span>
        <span class="summary-tile-label">Stay</span>
        <span class="summary-tile-value">${starLabel}${accomType?.title || 'Not set'}</span>
      </div>
      ${isNearbyTrip() ? `
      <div class="summary-tile">
        <span class="summary-tile-icon">${(TRANSPORT_MODES.find(t => t.key === state.transport?.mode) || {}).icon || '🚌'}</span>
        <span class="summary-tile-label">Transport</span>
        <span class="summary-tile-value">${(TRANSPORT_MODES.find(t => t.key === state.transport?.mode) || {}).title || 'Not set'}</span>
      </div>` : `
      <div class="summary-tile">
        <span class="summary-tile-icon">✈️</span>
        <span class="summary-tile-label">Flight</span>
        <span class="summary-tile-value">${state.flights.fareClass}${state.flights.connectionPref !== 'any' ? ', ' + state.flights.connectionPref : ''}</span>
      </div>`}
      <div class="summary-tile">
        <span class="summary-tile-icon">📐</span>
        <span class="summary-tile-label">Pace</span>
        <span class="summary-tile-value">${['Chill', 'Easy', 'Balanced', 'Active', 'Packed'][state.style.pace - 1] || 'Balanced'}</span>
      </div>
      <div class="summary-tile summary-tile--wide">
        <span class="summary-tile-icon">🎯</span>
        <span class="summary-tile-label">Interests</span>
        <span class="summary-tile-value">${escapeHtml(state.style.activities.join(', ') || 'None selected')}</span>
      </div>
      ${(state.dates.freeDays?.length > 0) ? `
      <div class="summary-tile summary-tile--wide">
        <span class="summary-tile-icon">💼</span>
        <span class="summary-tile-label">Free / Work Days</span>
        <span class="summary-tile-value">${escapeHtml(state.dates.freeDays.join(', '))}</span>
        <span class="summary-tile-sub">Lighter itinerary on these days</span>
      </div>` : ''}
    </div>

    <div class="wizard-section-label">Anything else?</div>
    <textarea class="input" id="summary-text" rows="3" maxlength="500"
      placeholder="e.g. Restful trip with great food, some culture, and plenty of cafe hopping..."
      style="resize: vertical; margin-bottom: var(--sp-3);">${escapeHtml(state.summary.freeText)}</textarea>

    <div class="summary-extras" id="summary-extras">
      ${extras.map(e => {
        const val = state.summary[e.key] || '';
        const isOpen = !!val;
        return `
          <div class="summary-extra ${isOpen ? 'summary-extra--open' : ''}" data-extra-key="${e.key}">
            <button class="summary-extra-toggle" data-toggle-extra="${e.key}">
              <span>${e.icon} ${e.label}</span>
              <span class="summary-extra-plus">${isOpen ? '−' : '+'}</span>
            </button>
            <div class="summary-extra-field" ${isOpen ? '' : 'style="display:none"'}>
              <input class="input" type="text" id="summary-${e.key}" placeholder="${e.placeholder}" value="${escapeHtml(val)}">
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const saveText = debounce(() => {
    state.summary = {
      ...state.summary,
      freeText: el.querySelector('#summary-text')?.value || '',
      mustDo: el.querySelector('#summary-mustDo')?.value || '',
      dietary: el.querySelector('#summary-dietary')?.value || '',
      avoid: el.querySelector('#summary-avoid')?.value || ''
    };
    state = updateWizardField(state, 'summary', state.summary);
  }, 300);

  el.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', saveText);
  });

  el.querySelectorAll('[data-toggle-extra]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggleExtra;
      const extra = btn.closest('.summary-extra');
      const field = extra.querySelector('.summary-extra-field');
      const plus = extra.querySelector('.summary-extra-plus');
      const isOpen = field.style.display !== 'none';
      field.style.display = isOpen ? 'none' : 'block';
      plus.textContent = isOpen ? '+' : '−';
      if (!isOpen) {
        field.querySelector('input')?.focus();
      }
    });
  });
}

async function renderGeneration() {
  const app = document.getElementById('app');
  const { isAuthenticated, signInWithGoogle } = await import('../auth/auth.js');

  if (!isAuthenticated()) {
    app.innerHTML = `
      <div class="wizard" style="align-items: center; justify-content: center;">
        <div class="wizard-gen">
          <div class="wizard-gen-icon">&#128274;</div>
          <h2 class="wizard-step-title" style="margin-bottom: var(--sp-3); font-size: 1.5rem;">Sign in to generate</h2>
          <p style="color: var(--ink-ghost); margin-bottom: var(--sp-6); font-size: 0.9rem;">
            We need your account to save and track your trip
          </p>
          <button class="btn btn--primary btn--lg btn--pill" id="gen-signin" style="gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.34 2.44 10.5l8.09-5.91z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign in with Google
          </button>
          <button class="btn btn--ghost btn--pill" style="margin-top: var(--sp-3); font-size: 0.8rem;" data-wizard-gen="back">
            Back to Summary
          </button>
        </div>
      </div>
    `;
    app.querySelector('#gen-signin')?.addEventListener('click', async () => {
      const { error } = await signInWithGoogle();
      if (error) {
        app.querySelector('#gen-signin').textContent = 'Sign-in failed. Try again.';
      }
    });
    app.querySelector('[data-wizard-gen="back"]')?.addEventListener('click', () => {
      state.currentStep = 7;
      saveWizardState(state);
      renderShell();
    });
    return;
  }

  app.innerHTML = `
    <div class="wizard" style="align-items: center; justify-content: center;">
      <div class="wizard-gen">
        <div class="wizard-gen-icon" style="animation: float 3s ease-in-out infinite;">&#9992;&#65039;</div>
        <h2 class="wizard-step-title" style="margin-bottom: var(--sp-3); font-size: 1.5rem;">Setting up your trip...</h2>
      </div>
    </div>
    <style>@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }</style>
  `;

  try {
    const { createTrip } = await import('../data/trip-repository.js');
    const { startGeneration } = await import('../services/generation-manager.js');

    const { data: trip, error } = await createTrip(state, 'generating');
    if (error || !trip) {
      app.innerHTML = `
        <div class="wizard" style="align-items: center; justify-content: center;">
          <div class="wizard-gen">
            <div class="wizard-gen-icon">&#9888;&#65039;</div>
            <h2 class="wizard-step-title" style="margin-bottom: var(--sp-3); font-size: 1.5rem;">Something went wrong</h2>
            <p style="color: var(--error); margin-bottom: var(--sp-6); font-size: 0.85rem;">${escapeHtml(error || 'Could not create trip')}</p>
            <button class="btn btn--primary btn--pill" id="gen-retry">Try Again</button>
            <button class="btn btn--ghost btn--pill" style="margin-top: var(--sp-3); font-size: 0.8rem;" data-wizard-gen="back">Back to Summary</button>
          </div>
        </div>
      `;
      app.querySelector('#gen-retry')?.addEventListener('click', () => renderGeneration());
      app.querySelector('[data-wizard-gen="back"]')?.addEventListener('click', () => {
        state.currentStep = 7;
        saveWizardState(state);
        renderShell();
      });
      return;
    }

    startGeneration(trip.id, state);
    clearWizardState();
    navigate('/');
  } catch (err) {
    app.innerHTML = `
      <div class="wizard" style="align-items: center; justify-content: center;">
        <div class="wizard-gen">
          <div class="wizard-gen-icon">&#9888;&#65039;</div>
          <h2 class="wizard-step-title" style="margin-bottom: var(--sp-3); font-size: 1.5rem;">Something went wrong</h2>
          <p style="color: var(--error); margin-bottom: var(--sp-6); font-size: 0.85rem;">${escapeHtml(err.message || 'Unexpected error')}</p>
          <button class="btn btn--primary btn--pill" id="gen-retry">Try Again</button>
          <button class="btn btn--ghost btn--pill" style="margin-top: var(--sp-3); font-size: 0.8rem;" data-wizard-gen="back">Back to Summary</button>
        </div>
      </div>
    `;
    app.querySelector('#gen-retry')?.addEventListener('click', () => renderGeneration());
    app.querySelector('[data-wizard-gen="back"]')?.addEventListener('click', () => {
      state.currentStep = 7;
      saveWizardState(state);
      renderShell();
    });
  }
}

function updateNextButton() {
  const btn = document.querySelector('[data-wizard="next"]');
  if (btn) btn.disabled = !canAdvance(state);
}
