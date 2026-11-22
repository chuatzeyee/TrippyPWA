// The controls of the comparison's first screen (trip-compare-start-html.js): the date range with the
// wizard's calendar, the travellers stepper, the budget field with its home currency hint and the
// budget levels. Each writes into a named field of the form, which is all the controller reads.
import { renderCalendar } from '../wizard/calendar.js';
import { datesLabel, budgetHint } from './trip-compare-start-html.js';

const MAX_TRAVELLERS = 20;
const digits = (value) => String(value ?? '').replace(/[^\d]/g, '');

function bindDates(form, signal) {
  const toggle = form.querySelector('[data-compare-dates]');
  const panel = form.querySelector('[data-compare-cal]');
  if (!toggle || !panel) return;
  const field = (name) => form.elements.namedItem(name);
  const close = ({ focus = false } = {}) => {
    panel.hidden = true;
    panel.replaceChildren();
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus();
  };
  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    renderCalendar(panel, {
      start: field('start').value, end: field('end').value,
      onSelect: (start, end) => {
        field('start').value = start;
        field('end').value = end;
        const label = datesLabel(start, end);
        form.querySelector('[data-compare-dates-text]').textContent = label.text;
        form.querySelector('[data-compare-dates-days]').textContent = label.days;
        const error = form.querySelector('[data-compare-error]');
        if (error) error.hidden = true;
        close({ focus: true });
      },
    });
  };
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()), { signal });
  form.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close({ focus: true }); } }, { signal });
}

function bindTravellers(form, signal) {
  const field = form.elements.namedItem('travelers');
  const shown = form.querySelector('[data-compare-travelers]');
  const steps = [...form.querySelectorAll('[data-compare-step]')];
  if (!field || !shown) return;
  form.addEventListener('click', (event) => {
    const step = event.target.closest('[data-compare-step]');
    if (!step || step.disabled) return;
    const next = Math.min(MAX_TRAVELLERS, Math.max(1, (Number(field.value) || 1) + Number(step.dataset.compareStep)));
    field.value = String(next);
    shown.textContent = String(next);
    steps.forEach((button) => { button.disabled = Number(button.dataset.compareStep) < 0 ? next <= 1 : next >= MAX_TRAVELLERS; });
    // A button that has just been disabled drops the focus: hand it to the other one.
    if (step.disabled) steps.find((button) => !button.disabled)?.focus();
  }, { signal });
}

function bindBudget(form, { signal, home, inputs }) {
  const field = form.querySelector('[data-compare-budget]');
  const hint = form.querySelector('[data-compare-home]');
  if (!field) return;
  const presets = [...form.querySelectorAll('[data-compare-preset]')];
  const show = () => {
    const amount = Number(digits(field.value)) || 0;
    const text = budgetHint(amount, inputs?.currencyCode, home);
    if (hint) { hint.textContent = text; hint.hidden = !text; }
    presets.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.comparePreset) === amount)));
  };
  field.addEventListener('input', () => {
    const clean = digits(field.value);
    if (clean !== field.value) field.value = clean;
    show();
  }, { signal });
  form.addEventListener('click', (event) => {
    const preset = event.target.closest('[data-compare-preset]');
    if (!preset || preset.disabled) return;
    field.value = preset.dataset.comparePreset;
    show();
  }, { signal });
}

/**
 * @param {Element} root  the page root; nothing happens when it has no start form
 * @param {{ signal: AbortSignal, home: { code: string, symbol?: string }|null, inputs: object }} opts
 */
export function bindStartControls(root, opts) {
  const form = root.querySelector('[data-compare-form]');
  if (!form) return;
  bindDates(form, opts.signal);
  bindTravellers(form, opts.signal);
  bindBudget(form, opts);
}
