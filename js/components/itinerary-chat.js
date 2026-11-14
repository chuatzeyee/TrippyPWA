// Trippy Concierge, the chat panel for itinerary edits: message ->
// itinerary-chat edge fn -> patch preview (diff chips) -> Apply writes via
// existing repositories -> the view refreshes in place (the panel and its
// conversation survive the refresh).
import { supabase } from '../lib/supabase.js';
import { updateActivityById, deleteActivityById, addActivityToDay } from '../data/trip-repository.js';
import { withLocalWrite } from '../data/collab-repository.js';
import { escapeHtml } from '../data/day-builder.js';
import { convert, canConvert } from '../data/currencies.js';
import { showToast } from './toast.js';
import {
  CONCIERGE_NAME, CONCIERGE_MARK, chatExamples, chatEmptyHtml, conciergeAvatar,
  typingHtml, chatErrorStatus, chatError,
} from './itinerary-chat-ui.js';
import { logger } from '../lib/logger.js';

function timeSlotFor(startTime) {
  const h = parseInt(String(startTime || '').split(':')[0], 10);
  if (!Number.isFinite(h)) return 'morning';
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function tripCurrency(trip) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  return String(dest?.currencyCode || trip.budget_currency || 'USD').toUpperCase();
}

// An activity's cost in the trip currency, which is what the chat model is told
// every cost is in. 0 when its own currency can't be converted.
function costInTrip(activity, code) {
  const amount = Number(activity?.cost_amount) || 0;
  const from = String(activity?.cost_currency || '').trim().toUpperCase();
  if (!amount || !/^[A-Z]{3}$/.test(from) || from === code) return Math.round(amount);
  return canConvert(from) && canConvert(code) ? convert(amount, from, code) : 0;
}

// The days as the model sees them: every cost in the trip currency.
function daysForChat(trip, code) {
  return (trip.itinerary_days || []).map(d => ({
    ...d,
    activities: (d.activities || []).map(a => ({ ...a, cost_amount: costInTrip(a, code) })),
  }));
}

// A modify edit's cost is priced in the trip currency. Write it (with that
// currency) only when it differs from the cost the model was shown, so an
// untouched cost keeps the activity's own amount and currency.
function costUpdate(trip, activityId, costAmount, code) {
  const cost = Number(costAmount);
  if (costAmount == null || !Number.isFinite(cost)) return {};
  const before = (trip.itinerary_days || []).flatMap(d => d.activities || []).find(x => x.id === activityId);
  if (before && Math.round(cost) === costInTrip(before, code)) return {};
  return { costAmount: cost, costCurrency: code };
}

async function applyEdits(trip, edits) {
  const dayByNumber = new Map((trip.itinerary_days || []).map(d => [d.day_number, d]));
  let applied = 0;
  // Every write is marked as our own so its realtime echo doesn't reload the
  // trip; the caller refreshes once when all edits are in.
  for (const e of edits) {
    if (e.op === 'remove' && e.activityId) {
      const { error } = await withLocalWrite([e.activityId], () => deleteActivityById(e.activityId));
      if (!error) applied++;
    } else if (e.op === 'modify' && e.activityId && e.activity) {
      const a = e.activity;
      const { error } = await withLocalWrite([e.activityId], () => updateActivityById(e.activityId, {
        title: a.title, venueName: a.venueName, description: a.description,
        category: a.category, startTime: a.startTime, durationMinutes: a.durationMinutes,
        ...costUpdate(trip, e.activityId, a.costAmount, tripCurrency(trip)),
        latitude: a.latitude, longitude: a.longitude, tips: a.tips,
      }));
      if (!error) applied++;
    } else if (e.op === 'add' && e.activity) {
      const day = dayByNumber.get(e.dayNumber);
      if (!day?.id) continue;
      const a = e.activity;
      // The new row's id isn't known before the insert, so mark its day.
      const { error } = await withLocalWrite([`day:${day.id}`], () => addActivityToDay(day.id, {
        title: a.title, venueName: a.venueName, description: a.description,
        category: a.category, startTime: a.startTime, durationMinutes: a.durationMinutes,
        costAmount: a.costAmount, costCurrency: tripCurrency(trip),
        latitude: a.latitude, longitude: a.longitude, tips: a.tips,
        timeSlot: timeSlotFor(a.startTime),
      }));
      if (!error) applied++;
    }
  }
  return applied;
}

function editChip(e) {
  const day = Number(e.dayNumber) || '';
  const label = e.op === 'remove' ? `Remove from Day ${day}`
    : e.op === 'add' ? `Add to Day ${day}: ${escapeHtml(e.activity?.title || '')}`
    : `Change on Day ${day}: ${escapeHtml(e.activity?.title || 'activity')}`;
  const op = ['remove', 'add', 'modify'].includes(e.op) ? e.op : 'modify';
  return `<div class="td-chat-edit td-chat-edit--${op}"><span>${label}</span><span class="td-chat-edit-reason">${escapeHtml(e.reason || '')}</span></div>`;
}

// One request to the itinerary-chat edge function: its answer, or the HTTP
// status it failed with (null when no answer came back at all).
async function askConcierge(trip, message) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const code = tripCurrency(trip);
  try {
    const res = await supabase.functions.invoke('itinerary-chat', {
      body: {
        message,
        days: daysForChat(trip, code),
        destination: dest?.name || trip.title || '',
        currency: code,
      },
    });
    if (!res.error && res.data && typeof res.data === 'object') return { data: res.data, status: null };
    return { data: null, status: chatErrorStatus(res) };
  } catch (err) {
    return { data: null, status: chatErrorStatus({ error: err }) };
  }
}

const RETRY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
const RETRY_ROW = `<div class="td-chat-apply-row"><button type="button" class="btn btn--sm btn--pill td-chat-retry">${RETRY_ICON}Retry</button></div>`;

let drawerSeq = 0;

const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

// The open button rings its bell once, the first time it appears in a
// session, so the concierge is noticed without nagging on every trip.
const HELLO_KEY = 'trippy-concierge-hello';
function sayHelloOnce(fab) {
  try {
    if (sessionStorage.getItem(HELLO_KEY)) return;
    sessionStorage.setItem(HELLO_KEY, '1');
  } catch { return; }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  fab.classList.add('td-chat-fab--hello');
  // The ring is the last of the hello animations to finish.
  fab.addEventListener('animationend', function done(e) {
    if (e.animationName !== 'td-concierge-ring') return;
    fab.classList.remove('td-chat-fab--hello');
    fab.removeEventListener('animationend', done);
  });
}

/**
 * Mount Trippy Concierge: a docked side panel on desktop, a bottom sheet on
 * smaller screens (layout lives in trip-detail.css). `onApplied` refreshes the
 * trip view after edits are written. Returns a controller so a refreshed view
 * can keep the same panel: { attach(container), setTrip(trip), destroy() }.
 */
export function mountItineraryChat(container, trip, onApplied) {
  let currentTrip = trip;
  const titleId = `td-chat-title-${++drawerSeq}`;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'td-chat-fab';
  fab.title = CONCIERGE_NAME;
  fab.setAttribute('aria-label', CONCIERGE_NAME);
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = CONCIERGE_MARK;
  sayHelloOnce(fab);

  // Non-modal panel: the trip stays usable beside it, so no focus trap, but it
  // is labelled, closes on Escape and hands focus back to the button.
  const drawer = document.createElement('div');
  drawer.className = 'td-chat-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'false');
  drawer.setAttribute('aria-labelledby', titleId);
  drawer.innerHTML = `
    <div class="td-chat-head">
      <div class="td-chat-ident">
        ${conciergeAvatar('head')}
        <div class="td-chat-titles">
          <h2 class="td-chat-title" id="${titleId}">${CONCIERGE_NAME}</h2>
          <p class="td-chat-subtitle">At your service</p>
        </div>
      </div>
      <button type="button" class="td-chat-close" aria-label="Close ${CONCIERGE_NAME}">${CLOSE_ICON}</button>
    </div>
    <div class="td-chat-scroll">
      <div class="td-chat-empty"></div>
      <div class="td-chat-log" role="log" aria-live="polite"></div>
    </div>
    <form class="td-chat-form">
      <input class="td-chat-input" type="text" maxlength="500" aria-label="Describe a change"
        placeholder="Describe a change" autocomplete="off" enterkeyhint="send">
      <button class="td-chat-send btn btn--primary btn--pill" type="submit">Send</button>
    </form>
  `;
  drawer.id = `td-chat-drawer-${drawerSeq}`;
  fab.setAttribute('aria-controls', drawer.id);
  container.appendChild(fab);
  container.appendChild(drawer);

  const scroller = drawer.querySelector('.td-chat-scroll');
  const empty = drawer.querySelector('.td-chat-empty');
  const log = drawer.querySelector('.td-chat-log');
  const input = drawer.querySelector('.td-chat-input');
  const form = drawer.querySelector('.td-chat-form');

  // Greeting and example chips until the first message.
  let examplesKey = '';
  const renderEmpty = () => {
    empty.hidden = log.childElementCount > 0;
    if (empty.hidden) return;
    const examples = chatExamples(currentTrip?.itinerary_days?.length);
    const key = examples.join('|');
    if (key === examplesKey) return;
    examplesKey = key;
    empty.innerHTML = chatEmptyHtml(examples);
  };
  renderEmpty();
  empty.addEventListener('click', (e) => {
    const chip = e.target.closest('.td-chat-example');
    if (!chip) return;
    input.value = chip.textContent.trim();
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  });

  // Where the log is scrolled to. A view refresh detaches the panel, which
  // resets its scroll, so attach() puts it back from here.
  let atEnd = true;
  let savedTop = 0;
  const rememberScroll = () => {
    if (!drawer.isConnected) return;
    savedTop = scroller.scrollTop;
    atEnd = scroller.scrollHeight - scroller.clientHeight - savedTop < 2;
  };
  scroller.addEventListener('scroll', rememberScroll, { passive: true });
  // Stay on the newest message while the panel or its text changes size (the
  // soft keyboard opening, a re-rendered view settling). The empty state is
  // left alone so its greeting stays on top.
  const pin = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (atEnd && log.childElementCount && drawer.isConnected) scroller.scrollTop = scroller.scrollHeight;
    })
    : null;
  pin?.observe(scroller);
  pin?.observe(log);

  // Bring a new or updated message into view. Scrolling to its top lands on
  // the end of the log when it fits (the browser clamps scrollTop); when it is
  // taller than the log, its first lines show and the rest is a scroll away.
  const reveal = (el) => {
    const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = top - pad;
    rememberScroll();
  };

  // A message in the log. The concierge's sit beside its avatar. Returns the
  // bubble, whose contents later steps replace (typing, answer, error).
  const addMsg = (cls, html) => {
    const el = document.createElement('div');
    el.className = `td-chat-msg td-chat-msg--${cls}`;
    el.innerHTML = html;
    let item = el;
    if (cls === 'bot') {
      item = document.createElement('div');
      item.className = 'td-chat-row';
      item.innerHTML = conciergeAvatar('msg');
      item.appendChild(el);
    }
    log.appendChild(item);
    empty.hidden = true;
    reveal(item);
    return el;
  };

  const setBubble = (bubble, html, state = '') => {
    bubble.classList.toggle('td-chat-msg--typing', state === 'typing');
    bubble.classList.toggle('td-chat-msg--error', state === 'error');
    bubble.innerHTML = html;
    reveal(bubble);
  };

  const isOpen = () => drawer.classList.contains('td-chat-drawer--open');
  const setOpen = (open) => {
    drawer.classList.toggle('td-chat-drawer--open', open);
    fab.classList.remove('td-chat-fab--hello');
    fab.setAttribute('aria-expanded', String(open));
    if (open) input.focus({ preventScroll: true });
    else if (drawer.contains(document.activeElement) || document.activeElement === document.body) fab.focus({ preventScroll: true });
  };
  fab.addEventListener('click', () => setOpen(!isOpen()));
  drawer.querySelector('.td-chat-close').addEventListener('click', () => setOpen(false));
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  });

  // The suggested edits as diff chips, with Apply and Discard.
  const offerEdits = (bubble, reply, edits) => {
    setBubble(bubble, `
      ${escapeHtml(reply || '')}
      <div class="td-chat-edits">${edits.map(editChip).join('')}</div>
      <div class="td-chat-apply-row">
        <button type="button" class="btn btn--primary btn--sm btn--pill td-chat-apply">Apply ${edits.length} change${edits.length > 1 ? 's' : ''}</button>
        <button type="button" class="btn btn--ghost btn--sm btn--pill td-chat-discard">Discard</button>
      </div>`);

    bubble.querySelector('.td-chat-discard').addEventListener('click', () => {
      bubble.querySelector('.td-chat-apply-row').remove();
      addMsg('bot', 'Discarded.');
    });
    bubble.querySelector('.td-chat-apply').addEventListener('click', async (e) => {
      const applyBtn = e.currentTarget;
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying…';
      bubble.querySelector('.td-chat-discard').disabled = true;
      const n = await applyEdits(currentTrip, edits);
      bubble.querySelector('.td-chat-apply-row')?.remove();
      const failed = edits.length - n;
      addMsg('bot', failed > 0
        ? escapeHtml(`Applied ${n} of ${edits.length} changes. Some couldn't be saved.`)
        : escapeHtml(`Applied ${n} change${n === 1 ? '' : 's'}.`));
      showToast(`${n} change${n === 1 ? '' : 's'} applied`, failed > 0 ? 'warn' : 'success');
      if (n > 0) onApplied?.();
    });
  };

  // Ask the concierge and answer in `bubble`, which shows the typing dots
  // meanwhile. A failure a retry could fix offers one, asking again in place.
  const ask = async (message, bubble) => {
    setBubble(bubble, typingHtml(), 'typing');
    const trip = currentTrip;
    const { data, status } = await askConcierge(trip, message);
    if (!data) {
      const { text, retry } = chatError(status);
      setBubble(bubble, escapeHtml(text) + (retry ? RETRY_ROW : ''), 'error');
      bubble.querySelector('.td-chat-retry')?.addEventListener('click', (e) => {
        // The button is about to go; keep keyboard focus in the panel.
        if (e.currentTarget.matches(':focus-visible')) input.focus({ preventScroll: true });
        askIn(message, bubble);
      }, { once: true });
      logger.warn('data', 'itinerary-chat failed', { tripId: trip.id, status });
      return;
    }
    const edits = Array.isArray(data.edits) ? data.edits : [];
    if (!edits.length) {
      setBubble(bubble, escapeHtml(data.reply || 'No changes needed.'));
      return;
    }
    offerEdits(bubble, data.reply, edits);
  };
  const askIn = (message, bubble) => ask(message, bubble)
    .catch((err) => logger.warn('data', 'itinerary-chat ask failed', { error: err?.message }));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addMsg('user', escapeHtml(message));
    askIn(message, addMsg('bot', ''));
  });

  return {
    // Move the button and panel into a freshly rendered view root.
    attach(next) {
      if (!next) return;
      next.appendChild(fab);
      next.appendChild(drawer);
      // Detaching reset the log's scroll: back to the end, or where the
      // user had scrolled to.
      scroller.scrollTop = atEnd && log.childElementCount ? scroller.scrollHeight : savedTop;
      // The refresh detached the drawer and dropped focus; give it back.
      const active = document.activeElement;
      if (isOpen() && (!active || active === document.body)) {
        input.focus({ preventScroll: true });
      }
    },
    setTrip(next) {
      if (!next) return;
      currentTrip = next;
      renderEmpty();
    },
    destroy() { pin?.disconnect(); fab.remove(); drawer.remove(); },
  };
}
