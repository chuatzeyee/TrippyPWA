const MAX_TOASTS = 3;
const DURATIONS = { error: 6000, warn: 4000, info: 3000, success: 3000 };

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function showToast(message, level = 'info') {
  const el = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${level}`;
  toast.innerHTML = `
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
