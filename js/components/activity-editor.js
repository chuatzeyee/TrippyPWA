import { supabase } from '../lib/supabase.js';
import { updateActivityById } from '../data/trip-repository.js';
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

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
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

export function makeActivityEditable(cardEl, activity, tripLocation) {
  if (cardEl.classList.contains('td-activity-card--editing')) return;
  cardEl.classList.add('td-activity-card--editing');

  let selectedPlace = null;

  const editHtml = `
    <div class="ae-form">
      <div class="ae-field">
        <label class="ae-label">Venue</label>
        <div class="ae-autocomplete">
          <input type="text" class="ae-input" data-field="venue" value="${esc(activity.venue_name)}" placeholder="Search for a place..." autocomplete="off">
          <div class="ae-suggestions"></div>
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-label">Title</label>
        <input type="text" class="ae-input" data-field="title" value="${esc(activity.title)}">
      </div>
      <div class="ae-row">
        <div class="ae-field ae-field--half">
          <label class="ae-label">Time</label>
          <input type="time" class="ae-input" data-field="time" value="${esc(activity.start_time)}">
        </div>
        <div class="ae-field ae-field--half">
          <label class="ae-label">Duration (min)</label>
          <input type="number" class="ae-input" data-field="duration" value="${activity.duration_minutes || 60}" min="5" step="5">
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-label">Description</label>
        <textarea class="ae-input ae-textarea" data-field="desc" rows="2">${esc(activity.description)}</textarea>
      </div>
      <div class="ae-row">
        <div class="ae-field ae-field--half">
          <label class="ae-label">Cost</label>
          <input type="number" class="ae-input" data-field="cost" value="${activity.cost_amount || 0}" min="0">
        </div>
        <div class="ae-field ae-field--half">
          <label class="ae-label">Tips</label>
          <input type="text" class="ae-input" data-field="tips" value="${esc(activity.tips)}" placeholder="Optional tip...">
        </div>
      </div>
      <div class="ae-actions">
        <button class="btn btn--ghost btn--sm ae-cancel">Cancel</button>
        <button class="btn btn--primary btn--sm ae-save">Save</button>
      </div>
    </div>
  `;

  const existingContent = cardEl.innerHTML;
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
            <div class="ae-suggestion-name">${esc(r.name)}</div>
            <div class="ae-suggestion-addr">${esc(r.address)}</div>
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

  document.addEventListener('click', function closeSuggestions(e) {
    if (!form.contains(e.target)) {
      suggestionsEl.innerHTML = '';
      suggestionsEl.classList.remove('ae-suggestions--visible');
      document.removeEventListener('click', closeSuggestions);
    }
  });

  form.querySelector('.ae-cancel').addEventListener('click', () => {
    cardEl.classList.remove('td-activity-card--editing');
    cardEl.innerHTML = existingContent;
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

    const { error } = await updateActivityById(activity.id, updates);
    if (error) {
      showToast('Failed to save changes', 'error');
      logger.error('data', 'Activity update failed', { activityId: activity.id, error });
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

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

    showToast('Activity updated');
    cardEl.classList.remove('td-activity-card--editing');
    cardEl.dispatchEvent(new CustomEvent('activity-saved', { bubbles: true, detail: { activity, venueChanged: !!selectedPlace } }));
  });

  venueInput.focus();
}

export function enterEditMode(container, trip) {
  container.classList.add('td-edit-mode');

  const cards = container.querySelectorAll('.td-activity-card');
  cards.forEach(card => {
    card.style.position = 'relative';

    const editBtn = document.createElement('button');
    editBtn.className = 'ae-edit-btn';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    editBtn.title = 'Edit this activity';
    card.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'ae-delete-btn';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    delBtn.title = 'Delete this activity';
    card.appendChild(delBtn);
  });
}

export function exitEditMode(container) {
  container.classList.remove('td-edit-mode');
  container.querySelectorAll('.ae-edit-btn, .ae-delete-btn').forEach(b => b.remove());
  container.querySelectorAll('.td-activity-card--editing').forEach(card => {
    card.classList.remove('td-activity-card--editing');
  });
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
