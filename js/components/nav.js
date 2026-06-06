import { navigate } from '../router.js';

const DESTINATIONS = [
  'SINGAPORE', 'KUALA LUMPUR', 'JAKARTA', 'HELSINKI',
  'STOCKHOLM', 'COPENHAGEN', 'OSLO', 'SEOUL', 'TOKYO', 'MELBOURNE'
];
const HOME_TEXT = 'TRIPPY';

let _flapTimer = null;

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildCell(ch) {
  if (ch === ' ') return '<span class="flap-cell flap-cell--space"></span>';
  const d = escHtml(ch);
  return `<span class="flap-cell"><span class="flap-face">${d}</span><span class="flap-top"><span class="flap-top-text">${d}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${d}</span></span></span>`;
}

function flipTo(container, oldText, newText) {
  const maxLen = Math.max(oldText.length, newText.length);
  const padOld = oldText.padEnd(maxLen);
  const padNew = newText.padEnd(maxLen);
  container.innerHTML = '';

  for (let i = 0; i < maxLen; i++) {
    const oldCh = padOld[i];
    const newCh = padNew[i];
    if (newCh === ' ' && i >= newText.length) continue;

    const cell = document.createElement('span');
    cell.className = newCh === ' ' ? 'flap-cell flap-cell--space' : 'flap-cell';
    if (newCh === ' ') { container.appendChild(cell); continue; }

    const oldD = oldCh === ' ' ? '&nbsp;' : escHtml(oldCh);
    const newD = escHtml(newCh);

    cell.innerHTML = `<span class="flap-face">${oldD}</span><span class="flap-top"><span class="flap-top-text">${oldD}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${newD}</span></span>`;
    container.appendChild(cell);

    setTimeout(() => {
      const top = cell.querySelector('.flap-top');
      const bottom = cell.querySelector('.flap-bottom');
      const face = cell.querySelector('.flap-face');
      top.classList.add('flap-flip-out');
      setTimeout(() => {
        face.innerHTML = newD;
        top.querySelector('.flap-top-text').innerHTML = newD;
        top.classList.remove('flap-flip-out');
        bottom.classList.add('flap-flip-in');
        setTimeout(() => bottom.classList.remove('flap-flip-in'), 200);
      }, 150);
    }, i * 40);
  }
}

export function renderNav() {
  const nav = document.getElementById('app-nav');
  nav.className = 'app-nav';
  nav.innerHTML = `
    <a class="nav-logo" data-nav="home">
      <svg class="nav-logo-plane" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
      <span class="nav-logo-flaps">${HOME_TEXT.split('').map(buildCell).join('')}</span>
    </a>
    <div class="nav-actions">
      <button class="nav-theme-toggle" id="theme-toggle" aria-label="Toggle theme">
        <svg class="nav-theme-icon nav-theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        <svg class="nav-theme-icon nav-theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
      </button>
      <a class="nav-admin-link" id="nav-admin-link" style="display:none" data-nav="admin" aria-label="Admin" title="Admin">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
      </a>
      <div id="auth-slot"></div>
    </div>
  `;

  const flapsEl = nav.querySelector('.nav-logo-flaps');
  let current = HOME_TEXT;
  let destIndex = 0;
  let showingHome = true;

  // renderNav runs again on every auth-state change; clear the prior ticker so we
  // do not accumulate split-flap timers (and detached DOM closures).
  if (_flapTimer) clearInterval(_flapTimer);
  _flapTimer = setInterval(() => {
    if (showingHome) {
      const dest = DESTINATIONS[destIndex];
      destIndex = (destIndex + 1) % DESTINATIONS.length;
      flipTo(flapsEl, current, dest);
      current = dest;
      showingHome = false;
    } else {
      flipTo(flapsEl, current, HOME_TEXT);
      current = HOME_TEXT;
      showingHome = true;
    }
  }, 4000);

  nav.addEventListener('click', (e) => {
    const target = e.target.closest('[data-nav]');
    if (!target) return;

    if (target.dataset.nav === 'home') {
      navigate('/');
    } else if (target.dataset.nav === 'admin') {
      navigate('/admin');
    }
  });

  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('trippy-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#F5F1EA' : '#1B1A17';
  });

  import('../auth/auth-ui.js').then(({ renderAuthButton }) => {
    renderAuthButton(document.getElementById('auth-slot'));
  });

  import('../data/admin-repository.js').then(({ isAdmin }) => {
    isAdmin().then(admin => {
      const link = document.getElementById('nav-admin-link');
      if (link && admin) link.style.display = '';
    });
  });
}
