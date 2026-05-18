import { navigate } from '../router.js';

const DESTINATIONS = [
  'SINGAPORE', 'KUALA LUMPUR', 'JAKARTA', 'HELSINKI',
  'STOCKHOLM', 'COPENHAGEN', 'OSLO', 'SEOUL', 'TOKYO', 'MELBOURNE'
];
const HOME_TEXT = 'TRIPPY';

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
      <div id="auth-slot"></div>
    </div>
  `;

  const flapsEl = nav.querySelector('.nav-logo-flaps');
  let current = HOME_TEXT;
  let destIndex = 0;
  let showingHome = true;

  setInterval(() => {
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
    }
  });

  import('../auth/auth-ui.js').then(({ renderAuthButton }) => {
    renderAuthButton(document.getElementById('auth-slot'));
  });
}
