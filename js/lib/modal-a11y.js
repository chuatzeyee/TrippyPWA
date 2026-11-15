// Shared modal behaviour (trip page dialogs, trip edit, generation popup).
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog behaviour for an overlay panel: focus moves inside, Tab stays
 * inside, Escape closes, and focus goes back to the opener afterwards.
 * Returns a release function to call when the dialog closes.
 * @param {HTMLElement} dialog
 * @param {{ onClose?: () => void, returnFocus?: Element | null, initialFocus?: HTMLElement | null }} [options]
 */
export function bindModalA11y(dialog, { onClose, returnFocus = document.activeElement, initialFocus = null } = {}) {
  const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => (initialFocus || focusables()[0])?.focus());
  return () => {
    document.removeEventListener('keydown', onKey);
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  };
}
