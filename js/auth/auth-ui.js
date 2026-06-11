import { getCurrentUser, signInWithGoogle, signOut, onAuthChange } from './auth.js';
import { escapeHtml } from '../data/day-builder.js';

export function showAuthGate() {
  const existing = document.querySelector('.modal-backdrop[data-auth-gate]');
  if (existing) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.dataset.authGate = '';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Sign in to continue</span>
      <button class="modal-close" data-dismiss>&times;</button>
    </div>
    <div class="modal-body" style="text-align: center; padding: var(--sp-6) var(--sp-4);">
      <div style="font-size: 2.5rem; margin-bottom: var(--sp-3);">&#9992;&#65039;</div>
      <p style="color: var(--ink-secondary); margin-bottom: var(--sp-6); font-size: 0.9rem;">
        Sign in to plan trips, save itineraries, and track your adventures.
      </p>
      <button class="btn btn--primary btn--lg btn--pill w-full" id="gate-signin" style="gap: 8px; justify-content: center;">
        <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.34 2.44 10.5l8.09-5.91z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Sign in with Google
      </button>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  const dismiss = () => {
    // Mirror the entry animation on the way out, then remove. A timeout
    // backstop guarantees removal if animationend never fires (reduced motion).
    backdrop.classList.add('modal-backdrop--closing');
    modal.classList.add('modal--closing');
    const remove = () => { clearTimeout(timer); backdrop.remove(); modal.remove(); };
    const timer = setTimeout(remove, 250);
    modal.addEventListener('animationend', remove, { once: true });
  };

  backdrop.addEventListener('click', dismiss);
  modal.querySelector('[data-dismiss]').addEventListener('click', dismiss);
  modal.querySelector('#gate-signin').addEventListener('click', async () => {
    const { error } = await signInWithGoogle();
    if (!error) dismiss();
  });
}

export function renderAuthButton(container) {
  if (!container) return;
  render(container);
  onAuthChange(() => render(container));
}

function render(container) {
  const user = getCurrentUser();

  if (!user) {
    container.innerHTML = `
      <button class="auth-btn" id="auth-sign-in">
        <svg class="auth-google-icon" viewBox="0 0 24 24" width="16" height="16">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in
      </button>
    `;
    container.querySelector('#auth-sign-in').addEventListener('click', () => signInWithGoogle());
    return;
  }

  const name = escapeHtml(user.user_metadata?.full_name || user.email || '');
  const avatar = user.user_metadata?.avatar_url || '';
  const initials = name.charAt(0).toUpperCase();

  container.innerHTML = `
    <div class="auth-user" id="auth-user">
      ${avatar
        ? `<img class="auth-avatar" src="${escapeHtml(avatar)}" alt="${name}" referrerpolicy="no-referrer">`
        : `<span class="auth-avatar auth-avatar--initials">${initials}</span>`
      }
      <div class="auth-dropdown" id="auth-dropdown">
        <div class="auth-dropdown-name">${name}</div>
        <button class="auth-dropdown-item" id="auth-sign-out">Sign out</button>
      </div>
    </div>
  `;

  const userEl = container.querySelector('#auth-user');
  const dropdown = container.querySelector('#auth-dropdown');

  userEl.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('auth-dropdown--open');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('auth-dropdown--open');
  }, { once: true });

  container.querySelector('#auth-sign-out').addEventListener('click', (e) => {
    e.stopPropagation();
    signOut();
  });
}
