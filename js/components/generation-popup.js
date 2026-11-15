// Shown right after a trip request is sent: confirms it, sets the time
// expectation, and follows the planning live. The route from the traveller's
// home to the destination has one segment per trip day; segments light up as
// the server finishes them. The popup can be closed at any time: planning
// carries on, and a toast (or a system notification when the tab is hidden)
// says when the trip is ready.
import { navigate } from '../router.js';
import { escapeHtml as esc } from '../data/day-builder.js';
import { fetchProfile } from '../data/profile-repository.js';
import { bindModalA11y } from '../lib/modal-a11y.js';
import { showToast } from './toast.js';
import { estimateGenerationMinutes } from '../lib/trip-extras.js';
import {
  onGenerationUpdate, getGenerationStatus, fetchGenerationProgress, requestCompletionNotifications,
} from '../services/generation-manager.js';

const POLL_MS = 8_000;
const MAX_SEGMENTS = 30; // a 60-day trip still reads as a route, not a barcode
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PLANE = '<svg class="gp-plane-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>';

let open = null; // one popup at a time

/** Days in a trip row: fixed dates win, else the wizard's rough duration. */
export function tripDays(trip) {
  const s = Date.parse(`${trip?.start_date}T00:00:00Z`);
  const e = Date.parse(`${trip?.end_date}T00:00:00Z`);
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) return Math.round((e - s) / 86_400_000) + 1;
  return Math.max(1, Number(trip?.wizard_state?.dates?.duration) || 7);
}

/** "13 to 25 Jan", "30 Jan to 3 Feb", or '' without fixed dates. */
export function dateSpan(trip) {
  const s = new Date(`${trip?.start_date}T00:00:00Z`);
  const e = new Date(`${trip?.end_date}T00:00:00Z`);
  if (isNaN(s) || isNaN(e)) return '';
  const day = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()
    ? `${s.getUTCDate()} to ${day(e)}`
    : `${day(s)} to ${day(e)}`;
}

/** Copy for each state. Exported for tests. */
export function popupCopy(state, { title, days, span, minutes }) {
  const daysText = `${days} day${days === 1 ? '' : 's'}`;
  if (state === 'done') {
    return {
      heading: `Your ${title} trip is ready`,
      lede: `All ${daysText} are planned. Open it to see your plan, day by day.`,
    };
  }
  if (state === 'failed') {
    return { heading: 'Planning stopped partway', lede: '' };
  }
  return {
    heading: `${title}, here you come`,
    lede: `Your trip request is in. Trippy is planning all ${daysText}${span ? `, ${span}` : ''}.`,
    eta: `This usually takes about ${minutes} minute${minutes === 1 ? '' : 's'}. You can close this, planning carries on.`,
  };
}

/** Status line under the route. Exported for tests. */
export function progressText(state, done, days) {
  if (state === 'done') return `All ${days} days planned`;
  if (done <= 0) return 'Planning day 1';
  return `${Math.min(done, days)} of ${days} days planned`;
}

/**
 * @param {{ id: string, title: string, start_date?: string, end_date?: string, wizard_state?: object }} trip
 */
export function showGenerationPopup(trip) {
  if (!trip?.id) return;
  open?.close();

  const days = tripDays(trip);
  const title = trip.title || 'Your trip';
  const ctx = { title, days, span: dateSpan(trip), minutes: estimateGenerationMinutes(days) };
  const segments = Math.min(days, MAX_SEGMENTS);
  const copy = popupCopy('generating', ctx);

  const backdrop = document.createElement('div');
  backdrop.className = 'gp-backdrop';
  const root = document.createElement('div');
  root.className = 'gp-wrap';
  root.innerHTML = `
    <section class="gp" role="dialog" aria-modal="true" aria-labelledby="gp-heading" aria-describedby="gp-lede" data-state="generating">
      <div class="gp-top">
        <button type="button" class="gp-close" aria-label="Close">${CLOSE}</button>
        <h2 class="gp-heading" id="gp-heading">${esc(copy.heading)}</h2>
        <p class="gp-lede" id="gp-lede">${esc(copy.lede)}</p>
      </div>
      <div class="gp-stub">
        <div class="gp-route" role="progressbar" aria-label="Days planned" aria-valuemin="0" aria-valuemax="${days}" aria-valuenow="0">
          <div class="gp-ends">
            <span class="gp-from" data-from></span>
            <span class="gp-to">${esc(title)}</span>
          </div>
          <div class="gp-track" style="--gp-progress: 0">
            ${Array.from({ length: segments }, () => '<span class="gp-seg"></span>').join('')}
            <span class="gp-plane">${PLANE}</span>
          </div>
        </div>
        <p class="gp-status" aria-live="polite" data-status>${progressText('generating', 0, days)}</p>
        <p class="gp-eta" data-eta>${esc(copy.eta)}</p>
        <div class="gp-actions">
          <button type="button" class="gp-notify" data-notify hidden>${BELL}<span>Notify me when it's ready</span></button>
          <p class="gp-notify-on" data-notify-on hidden>${BELL}<span>We'll send a notification when it's ready</span></p>
          <button type="button" class="btn btn--primary btn--pill gp-primary" data-primary>Got it</button>
        </div>
      </div>
    </section>`;
  document.body.append(backdrop, root);

  const dialog = root.querySelector('.gp');
  const track = root.querySelector('.gp-track');
  const route = root.querySelector('.gp-route');
  const statusEl = root.querySelector('[data-status]');
  const primary = root.querySelector('[data-primary]');
  let state = 'generating';
  let done = 0;
  let closed = false;
  let pollTimer = null;

  const render = () => {
    const shown = state === 'done' ? days : Math.min(done, days);
    const lit = Math.round((shown / days) * segments);
    track.style.setProperty('--gp-progress', String(lit / segments));
    track.querySelectorAll('.gp-seg').forEach((seg, i) => {
      seg.classList.toggle('is-done', i < lit);
      seg.classList.toggle('is-next', state === 'generating' && i === lit);
    });
    route.setAttribute('aria-valuenow', String(shown));
    route.setAttribute('aria-valuetext', progressText(state, shown, days));
    statusEl.textContent = progressText(state, shown, days);
  };

  const setState = (next, error) => {
    state = next;
    dialog.dataset.state = next;
    const c = popupCopy(next, ctx);
    root.querySelector('#gp-heading').textContent = c.heading;
    root.querySelector('#gp-lede').textContent = next === 'failed' ? (error || 'Use Retry on your trip card to pick up where it stopped.') : c.lede;
    root.querySelector('[data-eta]').hidden = next !== 'generating';
    root.querySelector('[data-notify]').hidden = true;
    root.querySelector('[data-notify-on]').hidden = true;
    primary.textContent = next === 'done' ? 'Open my trip' : 'Close';
    render();
  };

  const poll = async () => {
    if (closed || state !== 'generating') return;
    const n = await fetchGenerationProgress(trip.id).catch(() => null);
    if (n !== null && n > done) { done = n; render(); }
    pollTimer = setTimeout(poll, POLL_MS);
  };

  const off = onGenerationUpdate((id, status) => {
    if (id !== trip.id || !status) return;
    if (status.status === 'done') {
      if (closed) showToast(`Your ${title} trip is ready.`, 'success');
      else setState('done');
      off();
    } else if (status.status === 'failed') {
      if (!closed) setState('failed', status.error);
      off();
    }
  });

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(pollTimer);
    release();
    if (state !== 'generating') off(); // nothing left to announce
    backdrop.classList.add('gp-backdrop--out');
    root.classList.add('gp-wrap--out');
    const remove = () => { backdrop.remove(); root.remove(); };
    root.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400); // reduced motion: no animationend
    if (open?.root === root) open = null;
  };

  const release = bindModalA11y(dialog, { onClose: close, initialFocus: primary });
  root.querySelector('.gp-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  primary.addEventListener('click', () => {
    const go = state === 'done';
    close();
    if (go) navigate(`/trip/${trip.id}`);
  });

  // Notifications: offer the button only when the browser could still ask.
  const notifyBtn = root.querySelector('[data-notify]');
  const notifyOn = root.querySelector('[data-notify-on]');
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  if (permission === 'default') notifyBtn.hidden = false;
  else if (permission === 'granted') notifyOn.hidden = false;
  notifyBtn.addEventListener('click', async () => {
    const result = await requestCompletionNotifications();
    if (state !== 'generating') return;
    notifyBtn.hidden = true;
    notifyOn.hidden = result !== 'granted';
  });

  // The traveller's home city as the route's start (best effort).
  fetchProfile().then(({ data }) => {
    const home = data?.home_city;
    if (home && !closed) root.querySelector('[data-from]').textContent = home;
  }).catch(() => {});

  // Planning may already be further along (or finished) by the time this opens.
  const current = getGenerationStatus(trip.id);
  if (current?.status === 'done') setState('done');
  else if (current?.status === 'failed') setState('failed', current.error);
  else { render(); poll(); }

  open = { root, close };
}
