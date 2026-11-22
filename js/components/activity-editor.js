import { supabase } from '../lib/supabase.js';
import { updateActivityById } from '../data/trip-repository.js';
import { withLocalWrite } from '../data/collab-repository.js';
import { saveActivityNote } from '../data/chat-repository.js';
import { escapeHtml } from '../data/day-builder.js';
import { fetchPlacePhotoByQuery } from '../services/generate.js';
import { showToast } from './toast.js';
import { logger } from '../lib/logger.js';

let searchTimer = null;

export async function fetchDirections(origin, destination) {
  try {
    const { data, error } = await supabase.functions.invoke('places-directions', {
      body: { origin, destination },
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function searchPlaces(query, location) {
  if (!query || query.length < 2) return [];
  try {
    const body = { query, maxResults: 5 };
    if (location?.lat && location?.lng) body.location = location;
    const { data, error } = await supabase.functions.invoke('places-search', { body });
    if (error || !data?.results) return [];
    return data.results;
  } catch {
    return [];
  }
}

function inferCategory(types, primaryType) {
  const t = primaryType || (types && types[0]) || '';
  if (/restaurant|food|meal|bakery/i.test(t)) return 'food';
  if (/cafe|coffee/i.test(t)) return 'cafe';
  if (/bar|night_club|pub/i.test(t)) return 'bar';
  if (/museum/i.test(t)) return 'museum';
  if (/park|garden/i.test(t)) return 'park';
  if (/shopping|store|mall|market/i.test(t)) return 'shopping';
  if (/spa|wellness|gym/i.test(t)) return 'spa';
  if (/hotel|lodging/i.test(t)) return 'hotel';
  if (/temple|church|mosque|shrine/i.test(t)) return 'culture';
  if (/beach/i.test(t)) return 'beach';
  if (/theater|cinema|entertainment|amusement/i.test(t)) return 'entertainment';
  return null;
}

let formSeq = 0;

export function makeActivityEditable(cardEl, activity, tripLocation) {
  if (cardEl.classList.contains('td-activity-card--editing')) return;
  cardEl.classList.add('td-activity-card--editing');

  let selectedPlace = null;
  // Unique ids so every label is tied to its field.
  const fid = (name) => `ae-${formSeq}-${name}`;
  formSeq++;

  const editHtml = `
    <div class="ae-form">
      <div class="ae-field">
        <label class="ae-label" for="${fid('venue')}">Venue</label>
        <div class="ae-autocomplete">
          <input type="text" class="ae-input" id="${fid('venue')}" data-field="venue" value="${escapeHtml(activity.venue_name)}" placeholder="Search for a place..." autocomplete="off">
          <div class="ae-suggestions"></div>
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-label" for="${fid('title')}">Title</label>
        <input type="text" class="ae-input" id="${fid('title')}" data-field="title" value="${escapeHtml(activity.title)}">
      </div>
      <div class="ae-row">
        <div class="ae-field ae-field--half">
          <label class="ae-label" for="${fid('time')}">Time</label>
          <input type="time" class="ae-input" id="${fid('time')}" data-field="time" value="${escapeHtml(activity.start_time)}">
        </div>
        <div class="ae-field ae-field--half">
          <label class="ae-label" for="${fid('duration')}">Duration (min)</label>
          <input type="number" class="ae-input" id="${fid('duration')}" data-field="duration" value="${Number(activity.duration_minutes) || 60}" min="5" step="5">
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-label" for="${fid('desc')}">Description</label>
        <textarea class="ae-input ae-textarea" id="${fid('desc')}" data-field="desc" rows="2">${escapeHtml(activity.description)}</textarea>
      </div>
      <div class="ae-row">
        <div class="ae-field ae-field--half">
          <label class="ae-label" for="${fid('cost')}">Cost</label>
          <input type="number" class="ae-input" id="${fid('cost')}" data-field="cost" value="${Number(activity.cost_amount) || 0}" min="0">
        </div>
        <div class="ae-field ae-field--half">
          <label class="ae-label" for="${fid('tips')}">Tips</label>
          <input type="text" class="ae-input" id="${fid('tips')}" data-field="tips" value="${escapeHtml(activity.tips)}" placeholder="Optional tip">
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-label" for="${fid('note')}">Your note</label>
        <textarea class="ae-input ae-textarea" id="${fid('note')}" data-field="note" rows="2" maxlength="300" placeholder="Only you and people you plan with see this">${escapeHtml(activity.notes || '')}</textarea>
      </div>
      <div class="ae-actions">
        <button type="button" class="btn btn--ghost btn--sm ae-cancel">Cancel</button>
        <button type="button" class="btn btn--primary btn--sm ae-save">Save</button>
      </div>
    </div>
  `;

  // Keep the card's markup so Cancel (or leaving edit mode with the form still
  // open) can put the card back exactly as it was.
  const existingContent = cardEl.innerHTML;
  cardEl._aeOriginal = existingContent;
  cardEl.innerHTML = editHtml;

  const form = cardEl.querySelector('.ae-form');
  const venueInput = form.querySelector('[data-field="venue"]');
  const suggestionsEl = form.querySelector('.ae-suggestions');

  venueInput.addEventListener('input', () => {
    const q = venueInput.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { suggestionsEl.innerHTML = ''; suggestionsEl.classList.remove('ae-suggestions--visible'); return; }
    searchTimer = setTimeout(async () => {
      const results = await searchPlaces(q, tripLocation);
      if (results.length === 0) {
        suggestionsEl.innerHTML = '<div class="ae-suggestion ae-suggestion--empty">No places found</div>';
      } else {
        suggestionsEl.innerHTML = results.map((r, i) => `
          <div class="ae-suggestion" data-idx="${i}">
            <div class="ae-suggestion-name">${escapeHtml(r.name)}</div>
            <div class="ae-suggestion-addr">${escapeHtml(r.address)}</div>
          </div>
        `).join('');
      }
      suggestionsEl.classList.add('ae-suggestions--visible');
      suggestionsEl._results = results;
    }, 300);
  });

  suggestionsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.ae-suggestion[data-idx]');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    const place = suggestionsEl._results?.[idx];
    if (!place) return;

    selectedPlace = place;
    venueInput.value = place.name;
    form.querySelector('[data-field="title"]').value = place.name;
    suggestionsEl.innerHTML = '';
    suggestionsEl.classList.remove('ae-suggestions--visible');
  });

  // Close the suggestion list on an outside click. Registered after the
  // current (opening) click has finished bubbling, otherwise that same click
  // would reach document and remove the listener straight away.
  const closeSuggestions = (e) => {
    if (!form.isConnected) { document.removeEventListener('click', closeSuggestions); return; }
    if (form.contains(e.target)) return;
    suggestionsEl.innerHTML = '';
    suggestionsEl.classList.remove('ae-suggestions--visible');
  };
  setTimeout(() => { if (form.isConnected) document.addEventListener('click', closeSuggestions); }, 0);
  const stopListening = () => document.removeEventListener('click', closeSuggestions);
  cardEl._aeStop = stopListening;

  form.querySelector('.ae-cancel').addEventListener('click', () => {
    stopListening();
    cardEl.classList.remove('td-activity-card--editing');
    cardEl.innerHTML = existingContent;
    cardEl._aeOriginal = null;
  });

  form.querySelector('.ae-save').addEventListener('click', async () => {
    const saveBtn = form.querySelector('.ae-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const updates = {
      title: form.querySelector('[data-field="title"]').value.trim(),
      venueName: venueInput.value.trim(),
      description: form.querySelector('[data-field="desc"]').value.trim(),
      startTime: form.querySelector('[data-field="time"]').value,
      durationMinutes: parseInt(form.querySelector('[data-field="duration"]').value, 10) || 60,
      costAmount: parseInt(form.querySelector('[data-field="cost"]').value, 10) || 0,
      tips: form.querySelector('[data-field="tips"]').value.trim(),
    };

    if (selectedPlace) {
      updates.venueAddress = selectedPlace.address;
      updates.placeId = selectedPlace.placeId;
      updates.latitude = selectedPlace.lat;
      updates.longitude = selectedPlace.lng;
      const cat = inferCategory(selectedPlace.types, selectedPlace.primaryType);
      if (cat) updates.category = cat;
    }

    // Marked as our own write so the realtime echo doesn't reload the trip.
    const { error, photoReset } = await withLocalWrite([activity.id], () => updateActivityById(activity.id, updates));
    if (error) {
      showToast('Failed to save changes', 'error');
      logger.error('data', 'Activity update failed', { activityId: activity.id, error });
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

    // The traveller's own note is its own column (migration 024) and its own
    // write, so a database without the column still saves everything else.
    const note = form.querySelector('[data-field="note"]').value.trim();
    if (note !== (activity.notes || '')) {
      const saved = await withLocalWrite([activity.id], () => saveActivityNote(activity.id, note));
      if (saved.error) showToast(saved.error === 'no_column' ? 'Notes on stops are not switched on yet, so your note was not saved' : 'Your note could not be saved', 'warn');
      else activity.notes = note;
    }

    const venueChanged = Boolean(selectedPlace) || updates.venueName !== (activity.venue_name || '');
    Object.assign(activity, {
      title: updates.title,
      venue_name: updates.venueName,
      description: updates.description,
      start_time: updates.startTime,
      duration_minutes: updates.durationMinutes,
      cost_amount: updates.costAmount,
      tips: updates.tips,
    });
    if (selectedPlace) {
      activity.venue_address = updates.venueAddress;
      activity.place_id = updates.placeId;
      activity.latitude = updates.latitude;
      activity.longitude = updates.longitude;
      if (updates.category) activity.category = updates.category;
    }
    // A stored photo belongs to the old venue (the database clears it on a
    // title change too); let the card look up the new one.
    if (venueChanged || photoReset) Object.assign(activity, { photo_url: '', photo_source: '' });

    stopListening();
    showToast('Activity updated');
    cardEl.classList.remove('td-activity-card--editing');
    cardEl._aeOriginal = null;
    cardEl.dispatchEvent(new CustomEvent('activity-saved', { bubbles: true, detail: { activity, venueChanged: !!selectedPlace } }));
  });

  venueInput.focus();
}

// Edit-mode controls on one activity card (also used when a card is re-rendered
// while edit mode is on).
export function addEditButtons(card) {
  if (!card || card.querySelector('.ae-edit-btn')) return;
  card.style.position = 'relative';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'ae-edit-btn';
  editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  editBtn.title = 'Edit this activity';
  editBtn.setAttribute('aria-label', 'Edit this activity');
  card.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'ae-delete-btn';
  delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
  delBtn.title = 'Delete this activity';
  delBtn.setAttribute('aria-label', 'Delete this activity');
  card.appendChild(delBtn);
}

export function enterEditMode(container, trip) {
  container.classList.add('td-edit-mode');
  container.querySelectorAll('.td-activity-card').forEach(addEditButtons);
}

export function exitEditMode(container) {
  container.classList.remove('td-edit-mode');
  // A form still open when editing ends is discarded: put the card back first,
  // then strip the edit controls (the saved markup still contains them).
  container.querySelectorAll('.td-activity-card--editing').forEach(card => {
    card._aeStop?.();
    if (card._aeOriginal != null) card.innerHTML = card._aeOriginal;
    card._aeOriginal = null;
    card.classList.remove('td-activity-card--editing');
  });
  container.querySelectorAll('.ae-edit-btn, .ae-delete-btn').forEach(b => b.remove());
}

export async function refreshActivityPhoto(cardEl, activity) {
  if (!activity.venue_name) return;
  const lat = Number(activity.latitude);
  const lng = Number(activity.longitude);
  const location = (!isNaN(lat) && lat !== 0) ? { lat, lng } : null;

  const photoEl = cardEl.querySelector('.td-activity-photo');
  if (!photoEl) return;

  photoEl.className = 'td-activity-photo';
  photoEl.innerHTML = '';
  photoEl.dataset.venue = activity.venue_name;
  if (lat) photoEl.dataset.lat = String(lat);
  if (lng) photoEl.dataset.lng = String(lng);

  try {
    const url = await fetchPlacePhotoByQuery(activity.venue_name, location, 600);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = activity.venue_name;
      img.className = 'td-activity-photo-img';
      img.loading = 'lazy';
      img.onload = () => photoEl.classList.add('td-activity-photo--loaded');
      img.onerror = () => photoEl.classList.add('td-activity-photo--failed');
      photoEl.appendChild(img);
    }
  } catch {
    photoEl.classList.add('td-activity-photo--failed');
  }
}
