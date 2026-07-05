// Chat drawer for itinerary edits: message -> itinerary-chat edge fn -> patch
// preview (diff chips) -> Apply writes via existing repositories -> view reloads.
import { supabase } from '../lib/supabase.js';
import { updateActivityById, deleteActivityById, addActivityToDay } from '../data/trip-repository.js';
import { showToast } from './toast.js';
import { logger } from '../lib/logger.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function timeSlotFor(startTime) {
  const h = parseInt(String(startTime || '').split(':')[0], 10);
  if (!Number.isFinite(h)) return 'morning';
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

async function applyEdits(trip, edits) {
  const dayByNumber = new Map((trip.itinerary_days || []).map(d => [d.day_number, d]));
  let applied = 0;
  for (const e of edits) {
    if (e.op === 'remove' && e.activityId) {
      const { error } = await deleteActivityById(e.activityId);
      if (!error) applied++;
    } else if (e.op === 'modify' && e.activityId && e.activity) {
      const a = e.activity;
      const { error } = await updateActivityById(e.activityId, {
        title: a.title, venueName: a.venueName, description: a.description,
        category: a.category, startTime: a.startTime, durationMinutes: a.durationMinutes,
        costAmount: a.costAmount, latitude: a.latitude, longitude: a.longitude, tips: a.tips,
      });
      if (!error) applied++;
    } else if (e.op === 'add' && e.activity) {
      const day = dayByNumber.get(e.dayNumber);
      if (!day?.id) continue;
      const a = e.activity;
      const { error } = await addActivityToDay(day.id, {
        title: a.title, venueName: a.venueName, description: a.description,
        category: a.category, startTime: a.startTime, durationMinutes: a.durationMinutes,
        costAmount: a.costAmount, latitude: a.latitude, longitude: a.longitude, tips: a.tips,
        timeSlot: timeSlotFor(a.startTime),
      });
      if (!error) applied++;
    }
  }
  return applied;
}

function editChip(e) {
  const label = e.op === 'remove' ? `− Day ${e.dayNumber}: remove activity`
    : e.op === 'add' ? `+ Day ${e.dayNumber}: ${esc(e.activity?.title || '')}`
    : `± Day ${e.dayNumber}: ${esc(e.activity?.title || 'modify')}`;
  return `<div class="td-chat-edit td-chat-edit--${e.op}"><span>${label}</span><span class="td-chat-edit-reason">${esc(e.reason || '')}</span></div>`;
}

/**
 * Mount the chat drawer. `onApplied` reloads the trip view.
 */
export function mountItineraryChat(container, trip, onApplied) {
  const fab = document.createElement('button');
  fab.className = 'td-chat-fab';
  fab.setAttribute('aria-label', 'Edit with chat');
  fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>';

  const drawer = document.createElement('div');
  drawer.className = 'td-chat-drawer';
  drawer.innerHTML = `
    <div class="td-chat-head">
      <span>Edit with chat</span>
      <button class="td-chat-close" aria-label="Close">×</button>
    </div>
    <div class="td-chat-log"></div>
    <form class="td-chat-form">
      <input class="td-chat-input" type="text" maxlength="500"
        placeholder="e.g. Make day 2 more relaxed, or swap dinner for vegetarian" autocomplete="off">
      <button class="td-chat-send btn btn--primary btn--pill" type="submit">Send</button>
    </form>
  `;
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

  fab.addEventListener('click', () => { drawer.classList.toggle('td-chat-drawer--open'); input.focus(); });
  drawer.querySelector('.td-chat-close').addEventListener('click', () => drawer.classList.remove('td-chat-drawer--open'));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addMsg('user', esc(message));
    const pending = addMsg('bot', 'Thinking…');

    const ws = trip.wizard_state;
    const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
    let data = null;
    try {
      const res = await supabase.functions.invoke('itinerary-chat', {
        body: {
          message,
          days: trip.itinerary_days,
          destination: dest?.name || trip.title || '',
          currency: dest?.currencyCode || trip.budget_currency || 'USD',
        },
      });
      data = res.error ? null : res.data;
    } catch { /* handled below */ }

    if (!data) {
      pending.innerHTML = 'Sorry — that didn\'t work. Try again.';
      logger.warn('data', 'itinerary-chat failed', { tripId: trip.id });
      return;
    }

    if (!data.edits?.length) {
      pending.innerHTML = esc(data.reply || 'No changes needed.');
      return;
    }

    pending.innerHTML = `
      ${esc(data.reply || '')}
      <div class="td-chat-edits">${data.edits.map(editChip).join('')}</div>
      <div class="td-chat-apply-row">
        <button class="btn btn--primary btn--sm btn--pill td-chat-apply">Apply ${data.edits.length} change${data.edits.length > 1 ? 's' : ''}</button>
        <button class="btn btn--ghost btn--sm btn--pill td-chat-discard">Discard</button>
      </div>`;

    pending.querySelector('.td-chat-discard').addEventListener('click', () => {
      pending.querySelector('.td-chat-apply-row').remove();
      addMsg('bot', 'Discarded.');
    });
    pending.querySelector('.td-chat-apply').addEventListener('click', async (e2) => {
      e2.target.disabled = true;
      e2.target.textContent = 'Applying…';
      const n = await applyEdits(trip, data.edits);
      showToast(`${n} change${n === 1 ? '' : 's'} applied`);
      onApplied?.();
    });
  });
}
