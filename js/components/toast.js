const MAX_TOASTS = 3;
const DURATIONS = { error: 6000, warn: 4000, info: 3000, success: 3000 };

// Leading status glyph so the level is conveyed by shape, not color alone.
const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  error: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
};

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  // Announce new toasts to assistive tech without stealing focus.
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);
  return container;
}

export function showToast(message, level = 'info') {
  const el = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${level}`;
  // Errors/warnings interrupt; success/info are polite status updates.
  toast.setAttribute('role', level === 'error' || level === 'warn' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[level] || TOAST_ICONS.info}</span>
    <span class="toast-msg">${esc(message)}</span>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  const dismiss = () => {
    toast.classList.add('toast--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast-close').onclick = dismiss;
  el.appendChild(toast);

  const existing = el.querySelectorAll('.toast:not(.toast--out)');
  if (existing.length > MAX_TOASTS) {
    existing[0].classList.add('toast--out');
    existing[0].addEventListener('animationend', () => existing[0].remove(), { once: true });
  }

  setTimeout(dismiss, DURATIONS[level] || 4000);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
