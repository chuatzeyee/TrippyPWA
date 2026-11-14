// Chat drawer for itinerary edits: message -> itinerary-chat edge fn -> patch
// preview (diff chips) -> Apply writes via existing repositories -> the view
// refreshes in place (the drawer and its conversation survive the refresh).
import { supabase } from '../lib/supabase.js';
import { updateActivityById, deleteActivityById, addActivityToDay } from '../data/trip-repository.js';
import { withLocalWrite } from '../data/collab-repository.js';
import { escapeHtml } from '../data/day-builder.js';
import { convert, canConvert } from '../data/currencies.js';
import { showToast } from './toast.js';
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

let drawerSeq = 0;

/**
 * Mount the chat drawer. `onApplied` refreshes the trip view after edits are
 * written. Returns a controller so a refreshed view can keep the same drawer:
 * { attach(container), setTrip(trip), destroy() }.
 */
export function mountItineraryChat(container, trip, onApplied) {
  let currentTrip = trip;
  const titleId = `td-chat-title-${++drawerSeq}`;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'td-chat-fab';
  fab.setAttribute('aria-label', 'Edit with chat');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>';

  // Non-modal drawer: the trip stays usable behind it, so no focus trap, but it
  // is labelled, closes on Escape and hands focus back to the button.
  const drawer = document.createElement('div');
  drawer.className = 'td-chat-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'false');
  drawer.setAttribute('aria-labelledby', titleId);
  drawer.innerHTML = `
    <div class="td-chat-head">
      <span id="${titleId}">Edit with chat</span>
      <button type="button" class="td-chat-close" aria-label="Close">×</button>
    </div>
    <div class="td-chat-log" role="log" aria-live="polite"></div>
    <form class="td-chat-form">
      <input class="td-chat-input" type="text" maxlength="500" aria-label="Describe a change"
        placeholder="e.g. Make day 2 more relaxed, or swap dinner for vegetarian" autocomplete="off">
      <button class="td-chat-send btn btn--primary btn--pill" type="submit">Send</button>
    </form>
  `;
  drawer.id = `td-chat-drawer-${drawerSeq}`;
  fab.setAttribute('aria-controls', drawer.id);
  container.appendChild(fab);
  container.appendChild(drawer);

  const log = drawer.querySelector('.td-chat-log');
  const input = drawer.querySelector('.td-chat-input');
  const form = drawer.querySelector('.td-chat-form');

  const addMsg = (cls, html) => {
    const el = document.createElement('div');
    el.className = `td-chat-msg td-chat-msg--${cls}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  const setOpen = (open) => {
    drawer.classList.toggle('td-chat-drawer--open', open);
    fab.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else if (drawer.contains(document.activeElement) || document.activeElement === document.body) fab.focus();
  };
  fab.addEventListener('click', () => setOpen(!drawer.classList.contains('td-chat-drawer--open')));
  drawer.querySelector('.td-chat-close').addEventListener('click', () => setOpen(false));
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addMsg('user', escapeHtml(message));
    const pending = addMsg('bot', 'Thinking…');

    const trip = currentTrip;
    const ws = trip.wizard_state;
    const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
    let data = null;
    let notice = '';
    try {
      const res = await supabase.functions.invoke('itinerary-chat', {
        body: {
          message,
          days: daysForChat(trip, tripCurrency(trip)),
          destination: dest?.name || trip.title || '',
          currency: tripCurrency(trip),
        },
      });
      data = res.error ? null : res.data;
      // Past the daily limit the edge function answers 429 with a readable message.
      if (res.error?.context?.status === 429) {
        const body = await res.error.context.json().catch(() => null);
        if (typeof body?.error === 'string') notice = body.error;
      }
    } catch { /* handled below */ }

    if (!data) {
      pending.innerHTML = escapeHtml(notice || 'Sorry, that didn\'t work. Try again.');
      logger.warn('data', 'itinerary-chat failed', { tripId: trip.id });
      return;
    }

    if (!data.edits?.length) {
      pending.innerHTML = escapeHtml(data.reply || 'No changes needed.');
      return;
    }

    pending.innerHTML = `
      ${escapeHtml(data.reply || '')}
      <div class="td-chat-edits">${data.edits.map(editChip).join('')}</div>
      <div class="td-chat-apply-row">
        <button type="button" class="btn btn--primary btn--sm btn--pill td-chat-apply">Apply ${data.edits.length} change${data.edits.length > 1 ? 's' : ''}</button>
        <button type="button" class="btn btn--ghost btn--sm btn--pill td-chat-discard">Discard</button>
      </div>`;

    pending.querySelector('.td-chat-discard').addEventListener('click', () => {
      pending.querySelector('.td-chat-apply-row').remove();
      addMsg('bot', 'Discarded.');
    });
    pending.querySelector('.td-chat-apply').addEventListener('click', async (e2) => {
      const applyBtn = e2.currentTarget;
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying…';
      pending.querySelector('.td-chat-discard').disabled = true;
      const n = await applyEdits(currentTrip, data.edits);
      pending.querySelector('.td-chat-apply-row')?.remove();
      const failed = data.edits.length - n;
      addMsg('bot', failed > 0
        ? escapeHtml(`Applied ${n} of ${data.edits.length} changes. Some couldn't be saved.`)
        : escapeHtml(`Applied ${n} change${n === 1 ? '' : 's'}.`));
      showToast(`${n} change${n === 1 ? '' : 's'} applied`, failed > 0 ? 'warn' : 'success');
      if (n > 0) onApplied?.();
    });
  });

  return {
    // Move the FAB and drawer into a freshly rendered view root.
    attach(next) {
      if (!next) return;
      next.appendChild(fab);
      next.appendChild(drawer);
      // The refresh detached the drawer and dropped focus; give it back.
      const active = document.activeElement;
      if (drawer.classList.contains('td-chat-drawer--open') && (!active || active === document.body)) {
        input.focus({ preventScroll: true });
      }
    },
    setTrip(next) { if (next) currentTrip = next; },
    destroy() { fab.remove(); drawer.remove(); },
  };
}
