// Trippy Concierge, the chat panel on a trip: message -> itinerary-chat edge
// fn -> an answer, or a proposal (each change in plain words) -> Apply writes
// via the repositories -> the view refreshes in place (the panel and its
// conversation survive the refresh). Nothing is written before Apply.
import { supabase, getUser } from '../lib/supabase.js';
import { updateActivityById, deleteActivityById, addActivityToDay } from '../data/trip-repository.js';
import { withLocalWrite, fetchMyRole } from '../data/collab-repository.js';
import { changeTripExtras, saveActivityNote } from '../data/chat-repository.js';
import { escapeHtml } from '../data/day-builder.js';
import { prefersReducedMotion } from '../lib/motion.js';
import {
  CONCIERGE_NAME, CONCIERGE_MARK, CHAT_OFFLINE, chatExamples, chatEmptyHtml, conciergeAvatar,
  typingHtml, chatErrorStatus, chatError, replyHtml, choicesHtml, proposalHtml,
} from './itinerary-chat-ui.js';
import { buildChatRequest, planForChat, validateEdits, validateChoices, editWrite, proposalText, choiceText } from './itinerary-chat-plan.js';
import { logger } from '../lib/logger.js';

// Write one applied edit. Returns '' when it was saved, else why not:
// 'stale' (it no longer matches the trip), 'no_column' or 'failed'. Every
// activity write is marked as our own so its realtime echo doesn't reload the
// trip; the caller refreshes once when all edits are in.
async function applyEdit(trip, edit) {
  const w = editWrite(trip, edit);
  if (!w) return 'stale';
  let error;
  if (w.type === 'extras') ({ error } = await changeTripExtras(trip.id, w.change));
  else if (w.type === 'delete') ({ error } = await withLocalWrite([w.id], () => deleteActivityById(w.id)));
  else if (w.type === 'note') ({ error } = await withLocalWrite([w.id], () => saveActivityNote(w.id, w.note)));
  else if (w.type === 'update') ({ error } = await withLocalWrite([w.id], () => updateActivityById(w.id, w.updates)));
  // The new row's id isn't known before the insert, so mark its day.
  else ({ error } = await withLocalWrite([`day:${w.dayId}`], () => addActivityToDay(w.dayId, w.activity)));
  if (!error) return '';
  return error === 'stale' || error === 'no_column' ? error : 'failed';
}

// One request to the itinerary-chat edge function: its answer, or the HTTP
// status it failed with (null when no answer came back at all).
async function askConcierge(trip, message, history) {
  try {
    const res = await supabase.functions.invoke('itinerary-chat', { body: buildChatRequest(trip, message, history) });
    if (!res.error && res.data && typeof res.data === 'object') return { data: res.data, status: null };
    return { data: null, status: chatErrorStatus(res) };
  } catch (err) {
    return { data: null, status: chatErrorStatus({ error: err }) };
  }
}

// A stop to name in the note example: the first with a venue that is a place to visit.
const LOGISTICS = new Set(['departure', 'arrival', 'flight', 'check-in', 'landing', 'transfer', 'hotel']);
function exampleStop(trip) {
  const stop = (trip?.itinerary_days || []).flatMap(d => d.activities || [])
    .find(a => a?.venue_name && !LOGISTICS.has(String(a.category || '').toLowerCase()));
  return stop?.venue_name || '';
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
  if (prefersReducedMotion()) return;
  fab.classList.add('td-chat-fab--hello');
  // The ring is the last of the hello animations to finish.
  fab.addEventListener('animationend', function done(e) {
    if (e.animationName !== 'td-concierge-ring') return;
    fab.classList.remove('td-chat-fab--hello');
    fab.removeEventListener('animationend', done);
  });
}

// The open button sits in the trip bar, after "More", where a view draws one (the three views);
// on the classic page, which has no such bar, it floats in the corner.
const fabWatchers = new WeakMap();
function placeFab(root, fab) {
  const place = () => {
    const bar = root.querySelector('.tv-bar-actions');
    if (fab.parentElement === (bar || root)) return;
    fab.classList.toggle('td-chat-fab--bar', !!bar);
    (bar || root).appendChild(fab);
  };
  place();
  // A view redraws its bar (and so drops the button) when the trip changes: put it back.
  fabWatchers.get(fab)?.disconnect();
  const watcher = new MutationObserver(() => { if (root.isConnected) place(); else watcher.disconnect(); });
  watcher.observe(root, { childList: true, subtree: true });
  fabWatchers.set(fab, watcher);
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
  // Owner and editors only: on someone else's plan the button waits for the role.
  const me = getUser()?.id;
  if (me && trip.user_id && trip.user_id !== me) {
    fab.hidden = true;
    fetchMyRole(trip.id).then(({ data }) => { fab.hidden = data !== 'editor'; }).catch(() => {});
  }

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
      <input class="td-chat-input" type="text" maxlength="500" aria-label="Ask or describe a change"
        placeholder="Ask or describe a change" autocomplete="off" enterkeyhint="send">
      <button class="td-chat-send btn btn--primary btn--pill" type="submit">Send</button>
    </form>
  `;
  drawer.id = `td-chat-drawer-${drawerSeq}`;
  fab.setAttribute('aria-controls', drawer.id);
  placeFab(container, fab);
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
    const examples = chatExamples(currentTrip?.itinerary_days?.length, exampleStop(currentTrip));
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

  // iPhone Safari lays the keyboard over the page instead of shortening it, so a sheet pinned to the
  // bottom sits under the keyboard. While open, the sheet follows the visible part of the page.
  const viewport = window.visualViewport;
  const fitKeyboard = () => {
    if (!drawer.isConnected) { followKeyboard(false); return; } // the page went with the sheet open
    const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    drawer.style.setProperty('--td-chat-kb', `${covered}px`);
    drawer.style.setProperty('--td-chat-room', `${Math.round(viewport.height)}px`);
    drawer.classList.toggle('td-chat-drawer--kb', covered > 0);
  };
  const followKeyboard = (on) => {
    if (!viewport) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    viewport[method]('resize', fitKeyboard);
    viewport[method]('scroll', fitKeyboard);
    if (on) fitKeyboard();
    else { drawer.style.removeProperty('--td-chat-kb'); drawer.style.removeProperty('--td-chat-room'); drawer.classList.remove('td-chat-drawer--kb'); }
  };

  const isOpen = () => drawer.classList.contains('td-chat-drawer--open');
  const setOpen = (open) => {
    drawer.classList.toggle('td-chat-drawer--open', open);
    followKeyboard(open);
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

  // The conversation of this visit, sent back as short history so "the second
  // one" and "make it 8 PM instead" have something to refer to.
  const turns = [];

  // The proposed changes in plain words, with Apply and Dismiss. Nothing is
  // written before Apply; afterwards each change says whether it was saved,
  // and one that was not keeps the buttons.
  const offerEdits = (bubble, reply, edits) => {
    const items = edits.map(edit => ({ edit, text: proposalText(edit, currentTrip), reason: edit.reason, state: 'pending' }));
    let phase = 'open';
    const draw = () => setBubble(bubble, proposalHtml(reply, items, phase));
    draw();
    bubble.addEventListener('click', async (e) => {
      if (phase !== 'open') return;
      if (e.target.closest('.td-chat-discard')) { phase = 'dismissed'; draw(); return; }
      if (!e.target.closest('.td-chat-apply')) return;
      phase = 'saving';
      draw();
      let saved = 0;
      for (const item of items.filter(it => it.state !== 'saved')) {
        item.error = await applyEdit(currentTrip, item.edit)
          .catch((err) => { logger.warn('data', 'Chat edit failed', { error: err?.message }); return 'failed'; });
        item.state = item.error ? 'failed' : 'saved';
        if (!item.error) saved++;
      }
      phase = items.every(it => it.state === 'saved') ? 'done' : 'open';
      draw();
      if (saved > 0) onApplied?.();
    });
    return items.map(it => it.text);
  };

  // Ask the concierge and answer in `bubble`, which shows the typing dots
  // meanwhile. A failure a retry could fix offers one, asking again in place.
  const ask = async (message, bubble, history) => {
    const fail = (text, retry, status) => {
      setBubble(bubble, escapeHtml(text) + (retry ? RETRY_ROW : ''), 'error');
      bubble.querySelector('.td-chat-retry')?.addEventListener('click', (e) => {
        // The button is about to go; keep keyboard focus in the panel.
        if (e.currentTarget.matches(':focus-visible')) input.focus({ preventScroll: true });
        askIn(message, bubble, history);
      }, { once: true });
      logger.warn('data', 'itinerary-chat failed', { tripId: currentTrip?.id, status });
    };
    if (navigator.onLine === false) { fail(CHAT_OFFLINE, true, 'offline'); return; }
    setBubble(bubble, typingHtml(), 'typing');
    const trip = currentTrip;
    const { data, status } = await askConcierge(trip, message, history);
    if (!data) {
      const { text, retry } = navigator.onLine === false ? { text: CHAT_OFFLINE, retry: true } : chatError(status);
      fail(text, retry, status);
      return;
    }
    // Checked again here against the trip as it is now: only what names real
    // stops, days and stays is shown, and so can be applied.
    const plan = planForChat(currentTrip);
    const { edits, dropped } = validateEdits(data.edits, plan);
    const left = dropped > 0 ? ` I left out ${dropped} change${dropped === 1 ? '' : 's'} that did not match your plan.` : '';
    const reply = `${String(data.reply || '').slice(0, 1400)}${left}`.trim();
    if (edits.length) {
      const lines = offerEdits(bubble, reply, edits);
      turns.push({ role: 'bot', text: `${reply} Proposed: ${lines.join('; ')}` });
      return;
    }
    const labels = validateChoices(data.choices, plan).map(c => choiceText(c, currentTrip)).filter(Boolean);
    const said = reply || 'I have no answer for that.';
    setBubble(bubble, labels.length ? choicesHtml(said, labels) : replyHtml(said));
    turns.push({ role: 'bot', text: labels.length ? `${said} Choices: ${labels.map((l, i) => `${i + 1}. ${l}`).join('; ')}` : said });
  };
  const askIn = (message, bubble, history) => ask(message, bubble, history)
    .catch((err) => logger.warn('data', 'itinerary-chat ask failed', { error: err?.message }));

  const send = (message) => {
    const history = turns.slice();
    turns.push({ role: 'user', text: message });
    addMsg('user', escapeHtml(message));
    askIn(message, addMsg('bot', ''), history);
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    send(message);
  });
  // A choice the concierge offered is sent as the traveller's answer.
  log.addEventListener('click', (e) => {
    const choice = e.target.closest('.td-chat-choice');
    if (choice && !choice.disabled) {
      choice.parentElement.querySelectorAll('.td-chat-choice').forEach((b) => { b.disabled = true; });
      send(choice.textContent.trim());
    }
  });

  return {
    // Move the button and panel into a freshly rendered view root.
    attach(next) {
      if (!next) return;
      placeFab(next, fab);
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
