import { getCurrentUser } from '../auth/auth.js';
import { fetchProfile, updateProfile } from '../data/profile-repository.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { navigate } from '../router.js';
import { setHomeCurrency } from '../data/user-prefs.js';
import { setLocaleFromFlag } from '../lib/locale.js';
import { logger } from '../lib/logger.js';
import { showToast } from '../components/toast.js';

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

function flagImg(code, size = 24) {
  if (!code) return '';
  const w = size <= 20 ? 40 : 80;
  return `<img src="https://flagcdn.com/w${w}/${code}.png" width="${size}" height="${Math.round(size * 0.75)}" alt="" style="border-radius:3px; object-fit:cover;">`;
}

const FLAG_TO_CURRENCY = {
  sg: 'SGD', my: 'MYR', us: 'USD', gb: 'GBP', au: 'AUD',
  nz: 'NZD', jp: 'JPY', kr: 'KRW', th: 'THB', id: 'IDR',
  ph: 'PHP', tw: 'TWD', hk: 'HKD', ca: 'CAD', ch: 'CHF',
  ae: 'AED', in: 'INR', cn: 'CNY', vn: 'VND',
  fr: 'EUR', de: 'EUR', it: 'EUR', es: 'EUR', nl: 'EUR',
  pt: 'EUR', at: 'EUR', fi: 'EUR', gr: 'EUR', ie: 'EUR',
  hr: 'EUR', cz: 'CZK', se: 'SEK', no: 'NOK', is: 'ISK',
  tr: 'TRY', za: 'ZAR', mx: 'MXN', br: 'BRL', ar: 'ARS',
  co: 'COP', pe: 'PEN', ma: 'MAD', eg: 'EGP', ke: 'KES',
  kh: 'KHR', la: 'LAK',
};

const CURRENCIES = [
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
];

function sortedCurrencies(flagCode) {
  const localCode = FLAG_TO_CURRENCY[flagCode];
  if (!localCode) return CURRENCIES;
  const local = CURRENCIES.find(c => c.code === localCode);
  if (!local) return CURRENCIES;
  return [local, ...CURRENCIES.filter(c => c.code !== localCode)];
}

function getUniqueCities() {
  const seen = new Set();
  return DESTINATIONS.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function searchCities(query) {
  const q = query.toLowerCase();
  return getUniqueCities().filter(d =>
    d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q)
  ).slice(0, 8);
}

// Passport countries for the nationality selector (ISO2 lowercase, matching
// the app's flag-code convention). Names mirror common passport designations.
const NATIONALITIES = [
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

function searchNationalities(query) {
  const q = query.toLowerCase();
  return NATIONALITIES.filter(([, name]) => name.toLowerCase().includes(q)).slice(0, 8);
}

let profileState = {
  displayName: '',
  homeCity: '',
  homeCountry: '',
  homeFlag: '',
  isNomad: false,
  currency: null,
  nationality: '',
};

export async function renderProfileWizard() {
  const app = document.getElementById('app');
  const user = getCurrentUser();

  const { data: profile } = await fetchProfile();

  profileState = {
    displayName: profile?.display_name || user?.user_metadata?.full_name || '',
    homeCity: profile?.home_city || '',
    homeCountry: profile?.home_country || '',
    homeFlag: profile?.home_flag || '',
    isNomad: profile?.is_nomad || false,
    currency: profile?.home_currency
      ? { code: profile.home_currency, symbol: profile.home_currency_symbol || '$' }
      : null,
    nationality: profile?.nationality || '',
  };
  if (profileState.currency) {
    setHomeCurrency(profileState.currency.code, profileState.currency.symbol);
  }
  if (profile?.home_flag) setLocaleFromFlag(profile.home_flag);

  renderForm(app);
}

function renderForm(app) {
  const avatar = getCurrentUser()?.user_metadata?.avatar_url || '';
  const firstName = profileState.displayName.split(' ')[0] || '';
  const currencies = sortedCurrencies(profileState.homeFlag);
  const canSave = profileState.displayName.trim()
    && (profileState.isNomad || profileState.homeCity)
    && profileState.currency;

  app.innerHTML = `
    <div class="profile-wizard">
      <div class="profile-wizard-inner">
        ${avatar ? `<img class="profile-wizard-avatar" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : ''}
        <h1 class="profile-wizard-greeting">Hi${firstName ? `, ${esc(firstName)}` : ''}!</h1>
        <p class="profile-wizard-subtitle">Let's set up your profile so we can plan trips just for you.</p>

        <div class="profile-field">
          <label class="profile-label" for="pf-name">What should we call you?</label>
          <input class="input" type="text" id="pf-name" value="${esc(profileState.displayName)}" placeholder="Your name" autocomplete="name" maxlength="100">
        </div>

        <div class="profile-field">
          <label class="profile-label">Where are you based?</label>
          <div class="profile-nomad-toggle">
            <button class="chip ${!profileState.isNomad ? 'chip--active' : ''}" data-nomad="false">A home city</button>
            <button class="chip ${profileState.isNomad ? 'chip--active' : ''}" data-nomad="true">🌍 All around the world</button>
          </div>
          ${!profileState.isNomad ? `
            <div class="profile-city-search">
              <input class="input" type="text" id="pf-city" placeholder="Search your city..."
                value="${profileState.homeCity ? `${esc(profileState.homeCity)}, ${esc(profileState.homeCountry)}` : ''}" autocomplete="off">
              <div class="profile-city-dropdown" id="pf-city-dropdown"></div>
            </div>
          ` : `
            <p class="profile-nomad-note">We'll ask where you're departing from when you plan each trip.</p>
          `}
        </div>

        <div class="profile-field">
          <label class="profile-label">Passport nationality <span class="profile-label-hint">for visa guidance</span></label>
          ${profileState.nationality ? `
            <div class="profile-currency-selected" id="pf-nat-selected">
              ${flagImg(profileState.nationality, 20)}
              <span class="profile-currency-name">${esc(NATIONALITIES.find(([c]) => c === profileState.nationality)?.[1] || profileState.nationality.toUpperCase())}</span>
              <button class="profile-currency-change" id="pf-nat-change">Change</button>
            </div>
          ` : `
            <div class="profile-city-search">
              <input class="input" type="text" id="pf-nationality" placeholder="Search your passport country..." autocomplete="off">
              <div class="profile-city-dropdown" id="pf-nat-dropdown"></div>
            </div>
            <p class="profile-nomad-note">Optional — lets Trippy remind you about visas and entry requirements.</p>
          `}
        </div>

        <div class="profile-field">
          <label class="profile-label">Your home currency</label>
          ${profileState.currency
            ? `<div class="profile-currency-selected" id="pf-currency-selected">
                <span class="profile-currency-symbol">${esc(profileState.currency.symbol)}</span>
                <span class="profile-currency-code">${esc(profileState.currency.code)}</span>
                <span class="profile-currency-name">${esc(currencies.find(c => c.code === profileState.currency.code)?.name || '')}</span>
                <button class="profile-currency-change" id="pf-currency-change">Change</button>
              </div>`
            : ''
          }
          <div class="profile-currency-grid ${profileState.currency ? 'profile-currency-grid--hidden' : ''}" id="pf-currency-grid">
            ${currencies.map((c, i) => `
              <button class="profile-currency-option ${profileState.currency?.code === c.code ? 'profile-currency-option--active' : ''}"
                data-cur-code="${c.code}" data-cur-symbol="${esc(c.symbol)}">
                <span class="profile-currency-option-symbol">${esc(c.symbol)}</span>
                <span class="profile-currency-option-code">${c.code}</span>
                ${i === 0 && FLAG_TO_CURRENCY[profileState.homeFlag] === c.code ? '<span class="profile-currency-option-hint">Suggested</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <button class="btn btn--primary btn--lg btn--pill w-full profile-save-btn" id="pf-save" ${canSave ? '' : 'disabled'}>
          Let's go
        </button>
      </div>
    </div>
  `;

  bindProfileEvents(app);
}

function bindProfileEvents(app) {
  const nameInput = app.querySelector('#pf-name');
  nameInput?.addEventListener('input', () => {
    profileState = { ...profileState, displayName: nameInput.value };
    updateSaveButton();
  });

  app.querySelectorAll('[data-nomad]').forEach(btn => {
    btn.addEventListener('click', () => {
      profileState = {
        ...profileState,
        isNomad: btn.dataset.nomad === 'true',
        homeCity: btn.dataset.nomad === 'true' ? '' : profileState.homeCity,
        homeCountry: btn.dataset.nomad === 'true' ? '' : profileState.homeCountry,
        homeFlag: btn.dataset.nomad === 'true' ? '' : profileState.homeFlag,
      };
      renderForm(app);
    });
  });

  const cityInput = app.querySelector('#pf-city');
  const cityDropdown = app.querySelector('#pf-city-dropdown');
  if (cityInput && cityDropdown) {
    cityInput.addEventListener('input', () => {
      const q = cityInput.value.trim();
      if (!q || q.length < 2) {
        cityDropdown.classList.remove('profile-city-dropdown--open');
        cityDropdown.innerHTML = '';
        return;
      }
      const matches = searchCities(q);
      if (matches.length === 0) {
        cityDropdown.classList.remove('profile-city-dropdown--open');
        cityDropdown.innerHTML = '';
        return;
      }
      cityDropdown.innerHTML = matches.map(d => `
        <div class="profile-city-item" data-city='${JSON.stringify({ name: d.name, country: d.country, flag: d.flag }).replace(/'/g, "&#39;")}'>
          ${flagImg(d.flag, 20)}
          <span>${esc(d.name)}, ${esc(d.country)}</span>
        </div>
      `).join('');
      cityDropdown.classList.add('profile-city-dropdown--open');

      cityDropdown.querySelectorAll('.profile-city-item').forEach(item => {
        item.addEventListener('click', () => {
          const city = JSON.parse(item.dataset.city);
          const hadCurrency = profileState.currency;
          profileState = {
            ...profileState,
            homeCity: city.name,
            homeCountry: city.country,
            homeFlag: city.flag,
          };
          setLocaleFromFlag(city.flag);
          if (!hadCurrency) {
            const localCode = FLAG_TO_CURRENCY[city.flag];
            const localCur = CURRENCIES.find(c => c.code === localCode);
            if (localCur) {
              profileState = { ...profileState, currency: { code: localCur.code, symbol: localCur.symbol } };
            }
          }
          renderForm(app);
        });
      });
    });

    cityInput.addEventListener('focus', () => {
      if (cityInput.value.trim().length >= 2) cityInput.dispatchEvent(new Event('input'));
    });
  }

  const natInput = app.querySelector('#pf-nationality');
  const natDropdown = app.querySelector('#pf-nat-dropdown');
  if (natInput && natDropdown) {
    natInput.addEventListener('input', () => {
      const q = natInput.value.trim();
      if (!q || q.length < 2) {
        natDropdown.classList.remove('profile-city-dropdown--open');
        natDropdown.innerHTML = '';
        return;
      }
      const matches = searchNationalities(q);
      if (matches.length === 0) {
        natDropdown.classList.remove('profile-city-dropdown--open');
        natDropdown.innerHTML = '';
        return;
      }
      natDropdown.innerHTML = matches.map(([code, name]) => `
        <div class="profile-city-item" data-nat="${code}">
          ${flagImg(code, 20)}
          <span>${esc(name)}</span>
        </div>
      `).join('');
      natDropdown.classList.add('profile-city-dropdown--open');
      natDropdown.querySelectorAll('[data-nat]').forEach(item => {
        item.addEventListener('click', () => {
          profileState = { ...profileState, nationality: item.dataset.nat };
          renderForm(app);
        });
      });
    });
    natInput.addEventListener('focus', () => {
      if (natInput.value.trim().length >= 2) natInput.dispatchEvent(new Event('input'));
    });
  }

  app.querySelector('#pf-nat-change')?.addEventListener('click', () => {
    profileState = { ...profileState, nationality: '' };
    renderForm(app);
  });

  app.querySelectorAll('[data-cur-code]').forEach(btn => {
    btn.addEventListener('click', () => {
      profileState = {
        ...profileState,
        currency: { code: btn.dataset.curCode, symbol: btn.dataset.curSymbol },
      };
      renderForm(app);
    });
  });

  app.querySelector('#pf-currency-change')?.addEventListener('click', () => {
    const grid = app.querySelector('#pf-currency-grid');
    const selected = app.querySelector('#pf-currency-selected');
    if (grid) grid.classList.remove('profile-currency-grid--hidden');
    if (selected) selected.style.display = 'none';
  });

  app.querySelector('#pf-save')?.addEventListener('click', saveProfile);
}

function updateSaveButton() {
  const btn = document.querySelector('#pf-save');
  if (!btn) return;
  const canSave = profileState.displayName.trim()
    && (profileState.isNomad || profileState.homeCity)
    && profileState.currency;
  btn.disabled = !canSave;
}

async function saveProfile() {
  const btn = document.querySelector('#pf-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  const fields = {
    display_name: profileState.displayName.trim(),
    home_city: profileState.homeCity,
    home_country: profileState.homeCountry,
    home_flag: profileState.homeFlag,
    is_nomad: profileState.isNomad,
    home_currency: profileState.currency.code,
    home_currency_symbol: profileState.currency.symbol,
    nationality: profileState.nationality,
    onboarding_complete: true,
  };

  const { error } = await updateProfile(fields);

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Let\'s go'; }
    showToast('Failed to save profile', 'error'); logger.error('profile', 'Profile save failed from wizard', { error });
    return;
  }

  setHomeCurrency(profileState.currency.code, profileState.currency.symbol);
  renderSuccess(document.getElementById('app'));
}

function renderSuccess(app) {
  const firstName = profileState.displayName.split(' ')[0] || 'traveler';
  const avatar = getCurrentUser()?.user_metadata?.avatar_url || '';

  const pills = [];
  if (profileState.homeCity && !profileState.isNomad) {
    pills.push(`${flagImg(profileState.homeFlag, 18)} ${esc(profileState.homeCity)}`);
  } else if (profileState.isNomad) {
    pills.push('🌍 Digital Nomad');
  }
  if (profileState.currency) {
    pills.push(`${esc(profileState.currency.symbol)} ${esc(profileState.currency.code)}`);
  }

  app.innerHTML = `
    <div class="profile-success">
      <div class="profile-success-glow profile-success-glow--1"></div>
      <div class="profile-success-glow profile-success-glow--2"></div>
      <div class="profile-success-sparkles" id="pf-sparkles"></div>

      <div class="profile-success-inner">
        <div class="profile-success-check">
          <svg viewBox="0 0 52 52" class="profile-success-check-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="profile-success-circle"/>
            <path d="M14.1 27.2l7.1 7.2 16.7-16.8" fill="none" class="profile-success-tick"/>
          </svg>
        </div>

        ${avatar ? `<img class="profile-success-avatar" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : ''}

        <h1 class="profile-success-title">Welcome to Trippy, ${esc(firstName)}!</h1>
        <p class="profile-success-subtitle">Your travel profile is ready. Time to explore the world.</p>

        <div class="profile-success-pills">
          ${pills.map(p => `<span class="profile-success-pill">${p}</span>`).join('')}
        </div>

        <div class="profile-success-features">
          <div class="profile-success-feature">
            <span class="profile-success-feature-icon">✈️</span>
            <span class="profile-success-feature-text">AI-powered trip planning</span>
          </div>
          <div class="profile-success-feature">
            <span class="profile-success-feature-icon">💰</span>
            <span class="profile-success-feature-text">Smart budget breakdowns</span>
          </div>
          <div class="profile-success-feature">
            <span class="profile-success-feature-icon">📋</span>
            <span class="profile-success-feature-text">Day-by-day itineraries</span>
          </div>
        </div>

        <button class="btn btn--primary btn--lg btn--pill profile-success-cta" id="pf-success-go">
          Start Planning
        </button>
      </div>
    </div>
  `;

  const sparkleBox = app.querySelector('#pf-sparkles');
  if (sparkleBox) {
    for (let i = 0; i < 16; i++) {
      const dot = document.createElement('span');
      dot.className = 'profile-success-sparkle';
      dot.style.left = `${10 + Math.random() * 80}%`;
      dot.style.bottom = `${Math.random() * 40}%`;
      dot.style.animationDelay = `${0.8 + Math.random() * 2}s`;
      dot.style.background = Math.random() > 0.5 ? 'var(--terracotta)' : 'var(--teal)';
      sparkleBox.appendChild(dot);
    }
  }

  app.querySelector('#pf-success-go')?.addEventListener('click', () => navigate('/wizard'));
}
