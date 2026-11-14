// Guided trip import: gather details, turn them into a Trippy file with an AI
// assistant, paste or choose the file, check a preview, then save. Nothing is
// saved before the preview. The pasted text is kept on the device (with an
// expiry) so it survives the PWA being reloaded while the user is in the AI app.
// Photos are looked up only after the user leaves the success screen with
// "Open trip" or by closing it, never after "Undo import".

import { escapeHtml } from '../data/day-builder.js';
import { navigate } from '../router.js';
import { logger } from '../lib/logger.js';
import { getUser } from '../lib/supabase.js';
import { showToast } from './toast.js';
import { getUserPrefs, setUserPref } from '../data/user-prefs.js';
import { formatNumber, formatWeekdayDate, getLocale } from '../lib/locale.js';
import { validateTripImport, symbolForCurrency, IMPORT_LIMITS, IMPORT_MESSAGES } from '../services/trip-import.js';
import {
  AI_PROMPT, TEMPLATE_JSON, GATHER_ITEMS, INCLUDE_CHIPS, GOOD_TO_KNOW, buildFixRequest, buildImportSummary,
} from '../services/trip-import-guide.js';

const DRAFT_KEY = 'trippy_import_draft';
const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // holds booking references, so don't keep it for long
const DRAFT_DEBOUNCE_MS = 300;
const VALIDATE_DEBOUNCE_MS = 400;
const LOOKUP_TIMEOUT_MS = 4000;
const COPIED_MS = 2000;
const MAX_ISSUES = 20;
const STEP_COUNT = 4;

let active = null;     // the open modal's controller
let importing = false; // a save is in flight; opening another import does nothing

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function joinList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '';
}

// ---- Draft (localStorage with an expiry) ---------------------------------------
// The draft belongs to the user who pasted it, so on a shared device the next
// person to sign in never sees someone else's bookings.

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    const userId = getUser()?.id;
    if (draft && userId && draft.userId === userId && typeof draft.text === 'string' && draft.text.trim()
      && Date.now() - draft.savedAt < DRAFT_TTL_MS) {
      return draft.text;
    }
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable: start empty */ }
  return '';
}

function saveDraft(text) {
  try {
    const userId = getUser()?.id;
    if (userId && text.trim() && text.length <= IMPORT_LIMITS.maxBytes) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, savedAt: Date.now(), userId }));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch (err) {
    logger.warn('data', 'Import draft not saved', { error: err?.message });
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing stored */ }
}

// ---- Markup --------------------------------------------------------------------

const CHECK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
const INFO_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

const btn = (cls, act, label, extra = '') =>
  `<button type="button" class="btn ${cls}" data-act="${act}" ${extra}>${escapeHtml(label)}</button>`;

function listHtml(items, icon) {
  return `<ul class="ti-list">${items.map(([lead, detail]) => `
    <li>${icon}<div><strong>${escapeHtml(lead)}</strong> <span>${escapeHtml(detail)}</span></div></li>`).join('')}
  </ul>`;
}

function stepHeading(text) {
  return `<h3 class="ti-step-title" tabindex="-1">${escapeHtml(text)}</h3>`;
}

function step1Html() {
  return `
    <section class="ti-step" data-step="1" hidden>
      ${stepHeading('Gather your trip details')}
      <p class="ti-intro">Already planned or booked your trip somewhere else? Bring it into Trippy in about five minutes. Collect your bookings and notes, let an AI assistant turn them into a Trippy file, then check everything before it is saved.</p>
      <h4 class="trip-edit-label">What to collect</h4>
      ${listHtml(GATHER_ITEMS, CHECK_ICON)}
      <h4 class="trip-edit-label">Make sure it includes</h4>
      <ul class="ti-chips">${INCLUDE_CHIPS.map(c => `<li class="chip">${escapeHtml(c)}</li>`).join('')}</ul>
      <p class="trip-edit-note">Before you paste anything into an AI assistant, remove passport numbers, card numbers and phone numbers. Trippy only needs booking references, and they are not shown on shared links.</p>
    </section>`;
}

function step2Html() {
  return `
    <section class="ti-step" data-step="2" hidden>
      ${stepHeading('Turn it into a Trippy file')}
      <p class="ti-intro">Copy this prompt into ChatGPT, Claude or Gemini. In the same message, paste or attach your emails, notes or documents. The assistant will reply with your trip as a Trippy file.</p>
      <textarea class="trip-edit-textarea ti-prompt" readonly rows="7" aria-label="AI prompt" data-ref="prompt">${escapeHtml(AI_PROMPT)}</textarea>
      <div class="ti-actions">${btn('btn--primary btn--sm btn--pill', 'copy-prompt', 'Copy prompt')}</div>
      <h4 class="trip-edit-label">Good to know</h4>
      ${listHtml(GOOD_TO_KNOW, INFO_ICON)}
      <div class="ti-actions">
        ${btn('btn--ghost btn--sm btn--pill', 'download-template', 'Download template')}
        ${btn('btn--ghost btn--sm btn--pill', 'copy-template', 'Copy template')}
      </div>
    </section>`;
}

function step3Html(canReadClipboard) {
  return `
    <section class="ti-step" data-step="3" hidden>
      ${stepHeading('Add your trip')}
      <p class="ti-intro">Paste the assistant's whole reply below. Trippy finds the trip data inside it, even with extra text around it.</p>
      <button type="button" class="ti-link" data-act="guide" data-ref="guide-link" hidden>How do I make a Trippy file?</button>
      <div class="ti-drop" data-ref="drop">
        <textarea class="trip-edit-textarea ti-paste" data-ref="paste" rows="10" spellcheck="false" autocapitalize="off"
          autocomplete="off" aria-label="Trip data" aria-describedby="ti-paste-help"
          placeholder="${escapeHtml('Paste here. The trip data starts with { "trippy": 1')}"></textarea>
        <div class="ti-drop-hint" aria-hidden="true">Drop your file to add it</div>
      </div>
      <div class="ti-actions">
        ${canReadClipboard ? btn('btn--secondary btn--sm btn--pill', 'paste', 'Paste from clipboard') : ''}
        ${btn('btn--ghost btn--sm btn--pill', 'choose-file', 'Choose a file')}
        ${btn('btn--ghost btn--sm btn--pill', 'clear', 'Clear', 'data-ref="clear" hidden')}
        <input type="file" accept=".json,.txt,application/json,text/plain" data-ref="file" hidden tabindex="-1">
      </div>
      <p class="ti-caption" id="ti-paste-help">Works with .json and .txt files up to 1 MB. You can also drop a file here.</p>
      <p class="ti-status" role="status" aria-live="polite" data-ref="status"></p>
      <div data-ref="issues"></div>
    </section>`;
}

function shellHtml(canReadClipboard) {
  return `
    <div class="trip-edit-modal ti-modal" role="dialog" aria-modal="true" aria-labelledby="ti-title">
      <div class="trip-edit-header">
        <h2 class="text-h2" id="ti-title">Import a trip</h2>
        <button type="button" class="trip-edit-close" data-act="close" aria-label="Close">${CLOSE_ICON}</button>
      </div>
      <div class="ti-progress" data-ref="progress">
        <span class="wizard-progress-count" data-ref="count"></span>
        <div class="wizard-progress" aria-hidden="true">${'<div class="wizard-progress-seg"></div>'.repeat(STEP_COUNT)}</div>
      </div>
      <div class="trip-edit-body" data-ref="body">
        ${step1Html()}${step2Html()}${step3Html(canReadClipboard)}
        <section class="ti-step" data-step="4" hidden></section>
        <section class="ti-step" data-step="state" hidden></section>
      </div>
      <div class="trip-edit-footer" data-ref="footer"></div>
    </div>`;
}

// Footer buttons per phase: [ghost on the left, primary on the right].
const FOOTERS = {
  1: [['I already have a file', 'goto-3'], ['Next', 'goto-2']],
  2: [['Back', 'goto-1'], ['Next: add your trip', 'goto-3']],
  3: [['Back', 'goto-2'], ['Check trip', 'check']],
  4: [['Back', 'goto-3'], ['Import trip', 'import']],
  saving: [null, ['Saving', 'none']],
  success: [['Undo import', 'undo'], ['Open trip', 'open']],
  failure: [['Back', 'goto-4'], ['Try again', 'import']],
};

function footerHtml(phase) {
  const [left, right] = FOOTERS[phase];
  return `${left ? btn('btn--ghost btn--pill', left[1], left[0]) : ''}
    ${btn('btn--primary btn--pill', right[1], right[0], phase === 'saving' ? 'disabled' : '')}`;
}

function groupedHtml(items) {
  const groups = [];
  for (const { where, message } of items.slice(0, MAX_ISSUES)) {
    const group = groups.find(g => g.where === where);
    if (group) group.messages.push(message);
    else groups.push({ where, messages: [message] });
  }
  const more = items.length > MAX_ISSUES ? `<p class="ti-more">and ${items.length - MAX_ISSUES} more</p>` : '';
  return groups.map(g => `
    ${g.where ? `<p class="ti-issue-group">${escapeHtml(g.where)}</p>` : ''}
    <ul class="ti-issue-list">${g.messages.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`).join('') + more;
}

function issuesHtml(errors, announce) {
  // A syntax error or a missing field is worth sending back to the assistant;
  // "cut off", "too large" and similar need a different action.
  const fixable = errors.every(e => !e.code || e.code === 'syntax');
  return `
    <div class="ti-issues" ${announce ? 'role="alert"' : ''}>
      <h3>We found ${plural(errors.length, 'thing')} to fix</h3>
      ${groupedHtml(errors)}
      ${fixable ? `
        <p class="ti-fix-hint">Easiest fix: send this to the assistant, then paste its new reply here.</p>
        ${btn('btn--secondary btn--sm btn--pill', 'copy-fix', 'Copy fix request')}
        <textarea class="trip-edit-textarea ti-fix-text" readonly rows="5" aria-label="Fix request" data-ref="fix-text" hidden></textarea>` : ''}
    </div>`;
}

// ---- Preview (step 4) ----------------------------------------------------------

function fmtDate(iso, opts) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(getLocale(), opts).format(new Date(`${iso}T00:00:00`));
  } catch {
    return iso;
  }
}

const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });
const longDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

function flightText(leg) {
  const flight = [leg.airline, leg.flightNumber].filter(Boolean).join(' ');
  const booking = leg.booked ? `booked${leg.bookingRef ? ` (${leg.bookingRef})` : ''}` : 'not booked yet';
  return [leg.route, flight, booking].filter(Boolean).join(', ');
}

function stayText(stay) {
  const dates = stay.nights ? `${shortDate(stay.checkIn)} to ${shortDate(stay.checkOut)} (${plural(stay.nights, 'night')})` : '';
  return [stay.name, dates, stay.booked ? 'booked' : ''].filter(Boolean).join(', ');
}

function deadlineText({ count, earliest, overdue }) {
  if (overdue && overdue === count) return overdue === 1 ? '1 deadline has passed' : `${overdue} deadlines have passed`;
  if (overdue) return `${plural(count, 'deadline')}, ${overdue} ${overdue === 1 ? 'has' : 'have'} passed`;
  return `${plural(count, 'deadline')}, earliest ${longDate(earliest)}`;
}

function previewHtml(result) {
  const s = buildImportSummary(result.data);
  const dest = result.data.wizardState.destination;
  const money = (c) => `${c.currency === dest.currencyCode ? dest.currencySymbol : symbolForCurrency(c.currency)}${formatNumber(c.amount)}`;
  const endText = fmtDate(s.end, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const rows = [
    ...s.flights.legs.map(leg => [leg.label, escapeHtml(flightText(leg))]),
    s.stays.list.length ? ['Stays', s.stays.list.map(st => escapeHtml(stayText(st))).join('<br>')] : null,
    s.deadlines.count
      ? ['Book ahead', `<span class="${s.deadlines.overdue ? 'ti-overdue' : ''}">${escapeHtml(deadlineText(s.deadlines))}</span>`]
      : null,
    s.costs.length ? ['Activity costs', escapeHtml(joinList(s.costs.map(money)))] : null,
  ].filter(Boolean);

  const stat = (value, label) => `<div class="ti-stat"><strong>${escapeHtml(String(value))}</strong>${escapeHtml(label)}</div>`;
  const legCount = s.flights.legs.length;
  const dayLine = (d) => {
    const when = d.date ? `, ${formatWeekdayDate(d.date)}` : '';
    return `<li>Day ${d.dayNumber}${escapeHtml(when)}: ${escapeHtml(d.title)} (${plural(d.activities, 'activity', 'activities')})</li>`;
  };

  return `
    ${stepHeading('Check your trip')}
    <p class="ti-intro">Here is what will be added. You can edit any activity after importing.</p>
    <div class="ti-preview">
      <div>
        <p class="ti-preview-title">${escapeHtml([s.emoji, s.title].filter(Boolean).join(' '))}</p>
        <p class="ti-preview-line">${escapeHtml([s.destination, s.country].filter(Boolean).join(', '))}</p>
        <p class="ti-preview-line">${escapeHtml(`${formatWeekdayDate(s.start)} to ${endText} (${plural(s.tripDays, 'day')}), ${plural(s.travelers, 'traveler')}`)}</p>
      </div>
      <div class="ti-stats">
        ${stat(s.dayCount, s.dayCount === 1 ? 'day' : 'days')}
        ${stat(s.activityCount, s.activityCount === 1 ? 'activity' : 'activities')}
        ${legCount ? stat(`${s.flights.booked} of ${legCount}`, 'flights booked') : stat('No', 'flights')}
        ${s.stays.list.length ? stat(s.stays.list.length, `${s.stays.list.length === 1 ? 'stay' : 'stays'}, ${s.stays.booked} booked`) : stat('No', 'stays')}
      </div>
      ${rows.length ? `<dl class="ti-rows">${rows.map(([k, v]) => `<div class="ti-row"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
      <ul class="ti-days">
        ${s.firstDays.map(dayLine).join('')}
        ${s.moreDays ? `<li class="ti-more">and ${plural(s.moreDays, 'more day', 'more days')}</li>` : ''}
      </ul>
    </div>
    ${result.warnings.length ? `
      <div class="ti-warnings">
        <h3>Imported with small changes</h3>
        ${groupedHtml(result.warnings)}
      </div>` : ''}`;
}

function stateHtml(phase, title) {
  if (phase === 'saving') {
    return `
      <div class="ti-state">
        <span class="trip-card-gen-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        ${stepHeading('Saving your trip')}
        <p>This usually takes a few seconds. Keep this screen open.</p>
        <p class="ti-caption" data-ref="save-progress" role="status" aria-live="polite"></p>
      </div>`;
  }
  if (phase === 'success') {
    return `
      <div class="ti-state">
        ${stepHeading('Your trip is ready')}
        <p><strong>${escapeHtml(title)}</strong> is saved to your trips. When you open it, we'll find photos of your places in the background. That can take a few minutes, and your trip works without them.</p>
      </div>`;
  }
  return `
    <div class="ti-state">
      ${stepHeading("We couldn't save your trip")}
      <p>Nothing was saved. Check your connection and try again.</p>
    </div>`;
}

// ---- Browser helpers -------------------------------------------------------------

async function writeClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Fallback for browsers without the async clipboard: copy a field's selection.
function copyFromField(field) {
  field.hidden = false;
  field.focus();
  field.select();
  try { return document.execCommand('copy'); } catch { return false; }
}

function flashCopied(button) {
  const label = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => { if (button.isConnected) button.textContent = label; }, COPIED_MS);
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_JSON], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trippy-template.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Windows Notepad "Unicode" files are UTF-16; everything else is read as UTF-8.
async function readFileText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf-16le'
    : bytes[0] === 0xFE && bytes[1] === 0xFF ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })])
    .finally(() => clearTimeout(timer));
}

// A destination outside the curated list may still be in the 2,000-city
// catalogue, which knows its currency, timezone and coordinates.
async function withCatalogueDestination(result, text) {
  if (!result.ok || result.summary.destinationKnown) return result;
  const dest = result.data.wizardState.destination;
  try {
    const catalogue = await import('../wizard/city-catalogue.js');
    const index = (await withTimeout(catalogue.loadCatalogue(), LOOKUP_TIMEOUT_MS)) || [];
    const name = dest.name.toLowerCase();
    const country = dest.country.toLowerCase();
    const matches = index.filter(c => c.name.toLowerCase() === name);
    const entry = matches.find(c => dest.flag && c.flag === dest.flag)
      || matches.find(c => country && c.country.toLowerCase() === country)
      || (dest.flag || country ? null : matches[0]);
    if (!entry) return result;
    const record = await withTimeout(catalogue.hydrateCity(entry), LOOKUP_TIMEOUT_MS);
    if (!record) return result;
    const next = validateTripImport(text, { destination: record });
    return next.ok ? next : result;
  } catch (err) {
    logger.warn('data', 'Import destination lookup failed', { error: err?.message });
    return result;
  }
}

function startPhotoLookup(id, title) {
  import('../services/trip-photos.js')
    .then(m => m.resolveTripPhotos(id, { title }))
    .then(r => { if (r && !r.ok) logger.warn('data', 'Photo lookup for imported trip failed', { tripId: id, error: r.error }); })
    .catch(err => logger.warn('data', 'Photo lookup for imported trip failed', { tripId: id, error: err?.message }));
}

// ---- Controller ----------------------------------------------------------------

function createController(overlay, { returnFocus, onChange, draft, guideSeen }) {
  const ref = (name) => overlay.querySelector(`[data-ref="${name}"]`);
  const paste = ref('paste');
  let phase = 1;        // 1 to 4, or 'saving' | 'success' | 'failure'
  let result = null;    // latest validation of the pasted text
  let saved = null;     // { id, title } once the trip is saved
  let closed = false;
  let busy = false;     // checking the pasted trip
  let undoing = false;  // deleting the saved trip; the modal can't close meanwhile
  let validateTimer = 0;
  let draftTimer = 0;

  const focusHeading = () => overlay.querySelector('.ti-step:not([hidden]) .ti-step-title')?.focus();
  const primaryButton = () => ref('footer').querySelector('.btn--primary');

  function setStatus(text, isError = false) {
    const status = ref('status');
    status.textContent = text;
    status.classList.toggle('ti-status--error', isError);
  }

  function show(next) {
    phase = next;
    const numbered = typeof next === 'number';
    const key = numbered ? String(next) : 'state';
    overlay.querySelectorAll('.ti-step').forEach(s => { s.hidden = s.dataset.step !== key; });
    ref('progress').hidden = !numbered;
    if (numbered) {
      ref('count').textContent = `Step ${next} of ${STEP_COUNT}`;
      overlay.querySelectorAll('.wizard-progress-seg').forEach((seg, i) => {
        seg.classList.toggle('wizard-progress-seg--done', i + 1 < next);
        seg.classList.toggle('wizard-progress-seg--active', i + 1 === next);
      });
    }
    overlay.querySelector('[data-act="close"]').disabled = next === 'saving';
    ref('footer').innerHTML = footerHtml(next);
    if (next === 3) syncPasteControls();
    ref('body').scrollTop = 0;
    focusHeading();
  }

  function showState(next) {
    overlay.querySelector('[data-step="state"]').innerHTML = stateHtml(next, saved?.title || '');
    show(next);
  }

  function syncPasteControls() {
    const hasText = Boolean(paste.value.trim());
    ref('clear').hidden = !paste.value;
    if (phase === 3 && !busy) primaryButton().disabled = !hasText;
  }

  function renderIssues(errors, announce = false) {
    ref('issues').innerHTML = errors?.length ? issuesHtml(errors, announce) : '';
  }

  function validate(announce = false) {
    clearTimeout(validateTimer);
    if (!paste.value.trim()) {
      result = null;
      setStatus('');
      renderIssues(null);
      return null;
    }
    result = validateTripImport(paste.value);
    if (result.ok) {
      const { days, activities } = result.summary;
      setStatus(`Looks good. Found ${plural(days, 'day')} and ${plural(activities, 'activity', 'activities')}.`);
      renderIssues(null);
    } else {
      setStatus(`${plural(result.errors.length, 'thing')} to fix before importing.`, true);
      renderIssues(result.errors, announce);
    }
    return result;
  }

  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(paste.value), DRAFT_DEBOUNCE_MS);
  }

  function setPasteText(text) {
    paste.value = text;
    clearTimeout(draftTimer);
    saveDraft(text);
    syncPasteControls();
    validate();
  }

  // A continuation of a cut-off reply is added to the end; anything else (a
  // fresh or corrected reply) replaces what was there.
  function combine(existing, added) {
    if (!existing.trim()) return added;
    const current = validateTripImport(existing);
    if (current.ok || current.errors[0]?.code !== 'cutOff') return added;
    const separator = /```/.test(existing) || /^\s*```/.test(added) ? '\n' : '';
    return existing + separator + added;
  }

  async function pasteFromClipboard() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showToast('Long press in the box and choose Paste.', 'info');
      paste.focus();
      return;
    }
    if (!text) {
      showToast("Your clipboard is empty. Copy the assistant's reply first.", 'info');
      return;
    }
    setPasteText(combine(paste.value, text));
  }

  async function loadFile(file) {
    if (file.size > IMPORT_LIMITS.maxBytes) {
      renderIssues(null);
      setStatus(IMPORT_MESSAGES.tooLarge, true);
      return;
    }
    try {
      setPasteText(await readFileText(file));
    } catch (err) {
      logger.warn('data', 'Import file could not be read', { error: err?.message });
      renderIssues(null);
      setStatus("We couldn't read that file. Open it, copy the text and paste it here.", true);
    }
  }

  async function check() {
    const checked = validate(true);
    if (!checked?.ok) return;
    busy = true;
    const button = primaryButton();
    button.disabled = true;
    button.textContent = 'Checking';
    const text = paste.value;
    const final = await withCatalogueDestination(checked, text);
    busy = false;
    if (closed || phase !== 3 || paste.value !== text) {
      if (!closed && phase === 3) show(3);
      return;
    }
    result = final;
    overlay.querySelector('[data-step="4"]').innerHTML = previewHtml(final);
    show(4);
  }

  async function save() {
    if (importing || !result?.ok) return;
    importing = true;
    showState('saving');
    const progress = ref('save-progress');
    const onProgress = ({ step, total, label } = {}) => {
      if (!progress.isConnected) return;
      progress.textContent = typeof label === 'string' && label ? label : step && total ? `Step ${step} of ${total}` : '';
    };
    try {
      const { saveTripWithItinerary } = await import('../data/trip-repository.js');
      const { wizardState, itinerary } = result.data;
      const { data, error } = await saveTripWithItinerary(wizardState, itinerary, { onProgress });
      if (error || !data?.id) throw new Error(error || 'No trip returned');
      saved = { id: data.id, title: data.title || itinerary.tripTitle };
      clearTimeout(draftTimer);
      clearDraft();
      paste.value = '';
      setUserPref('importGuideSeen', true);
      showState('success');
    } catch (err) {
      // The user sees fixed copy only; the detail goes to the log.
      logger.error('data', 'Trip import save failed', { error: err?.message });
      showState('failure');
    } finally {
      importing = false;
    }
  }

  // Closing is blocked while the delete runs: closing would start the photo
  // lookup and refresh the dashboard for a trip that is being removed.
  function setUndoing(on) {
    undoing = on;
    overlay.querySelector('[data-act="close"]').disabled = on;
    ref('footer').querySelectorAll('button').forEach(b => { b.disabled = on; });
    const undoButton = ref('footer').querySelector('[data-act="undo"]');
    if (undoButton) undoButton.textContent = on ? 'Undoing' : FOOTERS.success[0][0];
  }

  async function undo() {
    if (!saved || undoing) return;
    setUndoing(true);
    let error = null;
    try {
      const { deleteTrip } = await import('../data/trip-repository.js');
      ({ error } = await deleteTrip(saved.id));
    } catch (err) {
      error = err?.message || 'Delete failed';
    }
    setUndoing(false);
    if (error) {
      logger.error('data', 'Undo import failed', { tripId: saved.id, error });
      showToast("We couldn't undo the import. Check your connection and try again.", 'error');
      return;
    }
    saved = null;
    close('undo');
    showToast('Import undone. Nothing was kept.', 'info');
  }

  function restoreFocus() {
    const target = returnFocus?.isConnected ? returnFocus : document.querySelector('#app [data-action="import-trip"]');
    target?.focus();
  }

  // reason: 'cancel' | 'done' (closed from the success screen) | 'open' | 'undo' | 'away' (route changed)
  function close(reason = 'cancel') {
    if (closed || phase === 'saving' || undoing) return;
    closed = true;
    active = null;
    clearTimeout(validateTimer);
    if (draftTimer && !saved) {
      clearTimeout(draftTimer);
      saveDraft(paste.value);
    }
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('keydown', onKeydown);
    overlay.classList.remove('trip-edit-overlay--visible');
    setTimeout(() => overlay.remove(), 200);

    if (reason === 'open') navigate(`/trip/${saved.id}`);
    if (saved) startPhotoLookup(saved.id, saved.title);
    if (reason === 'open' || reason === 'away') return;
    if (saved || reason === 'undo') Promise.resolve(onChange()).catch(() => {}).then(restoreFocus);
    else restoreFocus();
  }

  function onHashChange() {
    close('away');
  }

  function goTo(step) {
    if (step === 4 && !result?.ok) return;
    show(step);
  }

  const actions = {
    close: () => close(phase === 'success' ? 'done' : 'cancel'),
    'goto-1': () => goTo(1),
    'goto-2': () => goTo(2),
    'goto-3': () => goTo(3),
    'goto-4': () => goTo(4),
    guide: () => goTo(1),
    check,
    import: save,
    undo,
    open: () => close('open'),
    paste: pasteFromClipboard,
    'choose-file': () => ref('file').click(),
    clear: () => {
      setPasteText('');
      clearDraft();
      paste.focus();
    },
    'copy-prompt': async (button) => {
      if ((await writeClipboard(AI_PROMPT)) || copyFromField(ref('prompt'))) {
        flashCopied(button);
        return;
      }
      ref('prompt').select();
      showToast('Select the prompt and copy it.', 'warn');
    },
    'copy-template': async (button) => {
      if (await writeClipboard(TEMPLATE_JSON)) flashCopied(button);
      else showToast("We couldn't copy the template. Use Download template instead.", 'warn');
    },
    'download-template': downloadTemplate,
    'copy-fix': async (button) => {
      const text = buildFixRequest(result?.errors || []);
      const field = ref('fix-text');
      field.value = text;
      if ((await writeClipboard(text)) || copyFromField(field)) {
        flashCopied(button);
        return;
      }
      field.hidden = false;
      field.select();
      showToast('Select the text and copy it.', 'warn');
    },
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      actions.close();
      return;
    }
    const button = e.target.closest('[data-act]');
    if (!button || button.disabled) return;
    actions[button.dataset.act]?.(button);
  });

  // On the document, so Escape and the Tab trap also work if focus has left
  // the dialog (for example after dismissing a toast).
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      actions.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (!overlay.contains(current)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && current === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('keydown', onKeydown);

  paste.addEventListener('input', () => {
    syncPasteControls();
    scheduleDraft();
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => validate(), VALIDATE_DEBOUNCE_MS);
  });

  const fileInput = ref('file');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) loadFile(file);
  });

  const drop = ref('drop');
  drop.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    drop.classList.add('ti-drop--active');
  });
  drop.addEventListener('dragleave', (e) => {
    if (!drop.contains(e.relatedTarget)) drop.classList.remove('ti-drop--active');
  });
  drop.addEventListener('drop', (e) => {
    drop.classList.remove('ti-drop--active');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    loadFile(file);
  });

  window.addEventListener('hashchange', onHashChange);

  if (draft || guideSeen) ref('guide-link').hidden = false;
  // Always open on step 1. A saved draft waits in step 3 ("I already have a
  // file" jumps straight to it).
  if (draft) {
    paste.value = draft;
    setStatus('We kept the trip you pasted earlier.');
  }
  show(1);

  return { focusHeading };
}

/**
 * Open the guided import. Does nothing while a save is in flight, and focuses
 * the open modal instead of opening a second one.
 * @param {{ returnFocus?: HTMLElement | null, onChange?: () => unknown }} [opts]
 *   onChange runs after a trip was imported (and the success screen closed) or
 *   undone, so the caller can refresh its list.
 */
export function showImportModal({ returnFocus = null, onChange = () => {} } = {}) {
  if (importing) return;
  if (active) {
    active.focusHeading();
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'trip-edit-overlay ti-overlay';
  overlay.innerHTML = shellHtml(Boolean(navigator.clipboard?.readText));
  document.body.appendChild(overlay);
  active = createController(overlay, {
    returnFocus,
    onChange,
    draft: loadDraft(),
    guideSeen: Boolean(getUserPrefs().importGuideSeen),
  });
  requestAnimationFrame(() => overlay.classList.add('trip-edit-overlay--visible'));
}
