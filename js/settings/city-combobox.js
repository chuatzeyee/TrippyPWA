// The home city field of Settings (blueprint 6.2): a search field with a result list, built to the
// combobox pattern (role="combobox", aria-expanded, aria-controls, aria-activedescendant, a listbox of
// options; arrow keys, Enter, Escape). A city is always chosen from the results, so its name, country
// and flag agree. The key rules and the option markup are pure; mountCityCombobox() binds them. Owner: F12.
import { attr, cls, esc, flagChip } from '../views/shared/html.js';

/** The state of the result list: closed, no results, nothing active. */
export function comboStart() {
  return { open: false, count: 0, active: -1 };
}

const same = (state) => ({ state, effect: null });
const closed = (effect = null) => ({ state: comboStart(), effect });

function keyStep(state, key) {
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (!state.open) return { state, effect: { type: 'search' } };
    const step = key === 'ArrowDown' ? 1 : -1;
    const from = state.active < 0 && step < 0 ? 0 : state.active;
    return same({ ...state, active: (from + step + state.count) % state.count });
  }
  if (key === 'Enter') {
    if (!state.open) return { state, effect: { type: 'commit' } };
    const index = state.active >= 0 ? state.active : state.count === 1 ? 0 : -1;
    return index >= 0 ? closed({ type: 'choose', index }) : same(state);
  }
  if (key === 'Escape') return state.open ? closed() : { state, effect: { type: 'revert' } };
  return same(state);
}

/**
 * Pure. The next state of the result list and what the field must do.
 * @param {{ open: boolean, count: number, active: number }} state
 * @param {{ type: 'results', count: number } | { type: 'key', key: string } | { type: 'close' }} event
 * @returns {{ state: object, effect: null | { type: 'search' } | { type: 'choose', index: number } | { type: 'commit' } | { type: 'revert' } }}
 *   search  an arrow key on a closed list: look for results
 *   choose  take the result at `index`
 *   commit  Enter on a closed list: settle what is typed
 *   revert  Escape on a closed list: put the saved city back
 */
export function comboReduce(state, event) {
  if (event?.type === 'results') {
    const count = Math.max(0, Math.floor(Number(event.count) || 0));
    return same(count > 0 ? { open: true, count, active: -1 } : comboStart());
  }
  if (event?.type === 'close') return closed();
  if (event?.type === 'key') return keyStep(state, event.key);
  return same(state);
}

/** The id of the option at `index`, which aria-activedescendant names. */
export function optionId(listId, index) {
  return `${listId}-opt-${index}`;
}

/**
 * Pure. The options of the listbox.
 * @param {Array<{ name: string, country: string, flag: string }>|null} results searchCities() results
 * @param {number} active index of the active option, -1 for none
 * @param {string} listId the id of the listbox
 */
export function cityOptionsHtml(results, active, listId) {
  return (Array.isArray(results) ? results : []).map((city, index) => {
    const on = index === active;
    return `<li class="${cls('st-combo-option', { 'is-active': on })}" role="option"${attr('id', optionId(listId, index))}${attr('data-index', index)} aria-selected="${on}">
      <span class="st-combo-flag">${flagChip(city?.flag, { size: 20, label: '' })}</span>
      <span class="st-combo-city">${esc(city?.name)}</span>
      <span class="st-combo-country">${esc(city?.country)}</span>
    </li>`;
  }).join('');
}

const countText = (count) => (count === 1 ? '1 city. Press Enter to choose it.' : `${count} cities. Use the arrow keys to choose one.`);

/**
 * Binds one city field.
 * @param {Object} parts
 * @param {HTMLInputElement} parts.input   the role="combobox" input
 * @param {HTMLElement} parts.list         the role="listbox" element it controls
 * @param {HTMLElement|null} [parts.note]  a role="status" line for the result count and "no match"
 * @param {(query: string) => Promise<Array<object>>} parts.search  rejects when the search cannot load
 * @param {() => string} parts.saved       the text of the saved city, which the field returns to
 * @param {() => boolean} [parts.canClear] whether an empty field may be saved (a full-time traveller)
 * @param {(city: object) => void} parts.onChoose
 * @param {() => void} [parts.onClear]
 * @param {AbortSignal} [parts.signal]
 */
export function mountCityCombobox({ input, list, note = null, search, saved, canClear = () => false, onChoose, onClear = () => {}, signal }) {
  let state = comboStart();
  let results = [];
  let serial = 0;

  const say = (message, { quiet = false } = {}) => {
    if (!note) return;
    note.classList.toggle('ui-vh', quiet);
    note.textContent = message;
  };
  const draw = () => {
    list.innerHTML = state.open ? cityOptionsHtml(results, state.active, list.id) : '';
    list.hidden = !state.open;
    input.setAttribute('aria-expanded', String(state.open));
    if (state.open && state.active >= 0) {
      input.setAttribute('aria-activedescendant', optionId(list.id, state.active));
      list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };
  const close = () => {
    serial += 1; // a search that is still out is dropped
    results = [];
    state = comboStart();
    draw();
  };
  const run = async (query) => {
    const mine = ++serial;
    let found;
    try {
      found = await search(query);
    } catch {
      if (mine === serial) { close(); say('City search could not load. Check your connection and try again.'); }
      return;
    }
    if (mine !== serial) return; // the text changed while the search was out
    results = Array.isArray(found) ? found : [];
    state = comboReduce(state, { type: 'results', count: results.length }).state;
    draw();
    say(results.length ? countText(results.length) : 'No city matches. Try another spelling.', { quiet: results.length > 0 });
  };
  const choose = (index) => {
    const city = results[index];
    close();
    say('');
    if (city) onChoose(city);
  };
  /** Leaving the field, or Enter on a closed list: an empty field clears the city where that is allowed; any other unchosen text goes back. */
  const settle = () => {
    const typed = input.value.trim();
    const before = saved();
    close();
    say('');
    if (typed === '' && before !== '' && canClear()) { onClear(); return; }
    if (input.value !== before) input.value = before;
  };

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (!query) { close(); say(''); return; }
    run(query);
  }, { signal });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const step = comboReduce(state, { type: 'key', key: event.key });
    if (step.state === state && !step.effect) return;
    const wasOpen = state.open;
    if (event.key !== 'Escape' || wasOpen) event.preventDefault();
    state = step.state;
    if (step.effect?.type === 'choose') { choose(step.effect.index); return; }
    if (step.effect?.type === 'search') { run(input.value === saved() ? '' : input.value.trim()); return; }
    if (step.effect?.type === 'commit') { settle(); return; }
    if (step.effect?.type === 'revert') { input.value = saved(); say(''); return; }
    if (!state.open) results = [];
    draw();
  }, { signal });
  input.addEventListener('blur', settle, { signal });
  // A press on an option must not take the focus out of the field, or blur would close the list first.
  list.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  list.addEventListener('click', (event) => {
    const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (option) choose(Number(option.getAttribute('data-index')));
  }, { signal });
  draw();
}
