// The confirm dialog (blueprint 6.6): built on css/components/modal.css and bindModalA11y, mounted on
// <body>, so it looks and works the same from a view, from Settings and from a classic page. With
// `typed`, the confirm button stays off until the word is typed (case does not matter). Owner: F5.
import { attr, cls, esc } from './html.js';
import { bindModalA11y } from '../../lib/modal-a11y.js';

let serial = 0;
const CLOSE_MS = 250;

/** True when `value` is the word asked for, without regard to case or outer spaces; true when no word is asked for. */
export function typedMatches(value, typed) {
  if (!typed) return true;
  return String(value ?? '').trim().toLowerCase() === String(typed).trim().toLowerCase();
}

/**
 * The markup: a backdrop and the dialog panel, as two siblings for <body>.
 * @param {{ title: string, body?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, typed?: string|null, id?: string }} opts
 *   body   plain text; each line becomes a paragraph
 *   typed  the word the user must type, for example "DELETE"
 *   id     makes the element ids unique; confirmDialog() supplies one
 */
export function confirmDialogHtml({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, typed = null, id = 'confirm' } = {}) {
  const key = String(id).replace(/[^\w-]+/g, '-');
  const lines = String(body ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const text = lines.length ? `<div class="modal-text" id="${key}-text">${lines.map((line) => `<p>${esc(line)}</p>`).join('')}</div>` : '';
  const field = typed ? `<label class="modal-field"><span class="modal-field-label">Type ${esc(typed)} to confirm</span>
        <input class="modal-input" type="text" data-confirm-typed autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></label>` : '';
  return `<div class="modal-backdrop" data-confirm-backdrop></div>
    <div class="modal modal--confirm" role="${danger ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${key}-title"${attr('aria-describedby', lines.length ? `${key}-text` : null)} data-confirm>
      <div class="modal-header"><h2 class="modal-title" id="${key}-title">${esc(title)}</h2></div>
      <div class="modal-body">${text}${field}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn--ghost modal-btn" data-confirm-cancel>${esc(cancelLabel)}</button>
        <button type="button" class="${cls('btn modal-btn', danger ? 'modal-btn--danger' : 'btn--primary')}" data-confirm-ok${attr('disabled', Boolean(typed))}>${esc(confirmLabel)}</button>
      </div>
    </div>`;
}

/**
 * Asks the user to confirm. Focus moves into the dialog and stays there, Escape, the backdrop and a
 * change of route cancel, and focus returns to where it was.
 * @param {{ title: string, body?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, typed?: string|null }} opts
 * @returns {Promise<boolean>} true when the user confirmed
 */
export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    serial += 1;
    const holder = document.createElement('div');
    holder.innerHTML = confirmDialogHtml({ ...opts, id: `confirm-${serial}` });
    const backdrop = holder.querySelector('[data-confirm-backdrop]');
    const modal = holder.querySelector('[data-confirm]');
    const input = modal.querySelector('[data-confirm-typed]');
    const ok = modal.querySelector('[data-confirm-ok]');
    const cancel = modal.querySelector('[data-confirm-cancel]');
    document.body.append(backdrop, modal);

    let done = false;
    let release = () => {};
    // The route changing under an open dialog (browser or Android Back) is a "no": the page the
    // question was about is gone, so the dialog must not stay up or act on it.
    const onRoute = () => finish(false);
    const finish = (answer) => {
      if (done) return;
      done = true;
      window.removeEventListener('hashchange', onRoute);
      release();
      backdrop.classList.add('modal-backdrop--closing');
      modal.classList.add('modal--closing');
      const remove = () => { clearTimeout(timer); backdrop.remove(); modal.remove(); };
      const timer = setTimeout(remove, CLOSE_MS);
      modal.addEventListener('animationend', remove, { once: true });
      resolve(answer);
    };
    const confirm = () => { if (typedMatches(input?.value, opts.typed)) finish(true); };

    // A destructive dialog opens on Cancel (or on the word field), never on the confirm button.
    release = bindModalA11y(modal, { onClose: () => finish(false), initialFocus: input ?? (opts.danger ? cancel : ok) });
    window.addEventListener('hashchange', onRoute);
    backdrop.addEventListener('click', () => finish(false));
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', confirm);
    input?.addEventListener('input', () => { ok.disabled = !typedMatches(input.value, opts.typed); });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); confirm(); }
    });
  });
}
