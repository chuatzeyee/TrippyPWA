// The controls of the Settings page as markup (blueprint 6): native radio buttons, checkboxes, selects
// and text fields, so arrow keys, Space and screen-reader announcements come from the platform. The
// stylesheet draws radios as segmented controls and checkboxes as switches. Pure: strings in, a string
// out, every value escaped. Owner: F12.
import { attr, attrs, button, cls, esc } from '../views/shared/html.js';

const SAVE_TEXT = Object.freeze({ saving: 'Saving', saved: 'Saved', error: 'Could not save. Try again.' });

/** What the status line next to a control says: 'saving', 'saved' or 'error'; anything else is ''. */
export function saveStatusText(kind) {
  return Object.hasOwn(SAVE_TEXT, kind) ? SAVE_TEXT[kind] : '';
}

/**
 * The polite status line of one control. It is always in the page, empty until there is something to
 * say, so a screen reader hears each change.
 * @param {string} key   the control: the line's id is st-<key>-status
 * @param {''|'saving'|'saved'|'error'|{ error: string }} [save] `{ error }` carries its own sentence
 */
export function statusLineHtml(key, save = '') {
  const own = save !== null && typeof save === 'object' ? String(save.error ?? '') : '';
  const kind = own ? 'error' : Object.hasOwn(SAVE_TEXT, save) ? save : '';
  return `<p class="st-status" id="st-${esc(key)}-status" role="status"${attr('data-st-status', key)}${attr('data-kind', kind || null)}>${esc(own || saveStatusText(kind))}</p>`;
}

const helpHtml = (id, help, tag = 'p') => (help ? `<${tag} class="st-help" id="${esc(id)}-help">${esc(help)}</${tag}>` : '');
const exampleHtml = (id, example) => (example ? `<p class="st-example" id="${esc(id)}-example">Example: ${esc(example)}</p>` : '');
const describedBy = (id, { help, example }) => [help ? `${id}-help` : '', example ? `${id}-example` : ''].filter(Boolean).join(' ') || null;

/**
 * A group of native radio buttons, drawn as a segmented control.
 * @param {Object} opts
 * @param {string} opts.id        the fieldset id; each radio is <id>-<value>
 * @param {string} opts.name      the radio group name
 * @param {string} opts.legend
 * @param {Array<{ value: string, label: string }>} opts.options
 * @param {string} opts.value     the checked value
 * @param {string} [opts.help]
 * @param {string} [opts.example] printed after "Example: "
 * @param {object} [opts.inputAttrs] attributes for every radio (the hook the page binds to)
 */
export function segmentedHtml({ id, name, legend, options, value, help = '', example = '', inputAttrs = {} }) {
  const described = describedBy(id, { help, example });
  const radios = options.map((option) => `<label class="st-seg-option">
        <input class="st-seg-input" type="radio"${attr('name', name)}${attr('id', `${id}-${option.value}`)}${attr('value', option.value)}${attr('checked', option.value === value)}${attrs(inputAttrs)}>
        <span class="st-seg-face">${esc(option.label)}</span>
      </label>`).join('');
  return `<fieldset class="st-row st-row--seg"${attr('id', id)}${attr('aria-describedby', described)}>
      <legend class="st-label">${esc(legend)}</legend>
      <div class="st-row-text">${helpHtml(id, help)}${exampleHtml(id, example)}</div>
      <div class="st-seg">${radios}</div>
    </fieldset>`;
}

/**
 * One native checkbox, drawn as a switch. The label is the whole row, so the row is the target.
 * @param {Object} opts
 * @param {string} opts.id
 * @param {string} opts.label
 * @param {boolean} opts.checked
 * @param {string} [opts.help]
 * @param {string} [opts.example]
 * @param {object} [opts.inputAttrs]
 * @param {string} [opts.status]  markup of a status line (statusLineHtml), for a control that writes to the server
 */
export function switchHtml({ id, label, checked, help = '', example = '', inputAttrs = {}, status = '' }) {
  return `<div class="st-row st-row--switch">
      <label class="st-switch"${attr('for', id)}>
        <span class="st-label">${esc(label)}</span>
        <input class="st-switch-input" type="checkbox" role="switch"${attr('id', id)}${attr('checked', checked === true)}${attr('aria-describedby', describedBy(id, { help, example }))}${attrs(inputAttrs)}>
        <span class="st-switch-track" aria-hidden="true"></span>
      </label>
      ${helpHtml(id, help)}${exampleHtml(id, example)}${status}
    </div>`;
}

/**
 * The label of a field: it wraps its control, so the words and the control are one target. The
 * control is named by the words alone (aria-labelledby) and described by the helper line.
 */
function fieldLabelHtml({ id, label, help, control }) {
  return `<label class="st-field"${attr('for', id)}>
        <span class="st-label"${attr('id', `${id}-label`)}>${esc(label)}</span>
        ${helpHtml(id, help, 'span')}
        ${control}
      </label>`;
}
const fieldNames = (id, help) => `${attr('id', id)}${attr('aria-labelledby', `${id}-label`)}${attr('aria-describedby', describedBy(id, { help }))}`;

/**
 * A native select with its label.
 * @param {Object} opts
 * @param {string} opts.id
 * @param {string} opts.label
 * @param {Array<{ value: string, label: string }>} opts.options
 * @param {string} opts.value   the selected value; it must be one of the options
 * @param {string} [opts.help]
 * @param {object} [opts.inputAttrs]
 * @param {string} [opts.status]
 */
export function selectHtml({ id, label, options, value, help = '', inputAttrs = {}, status = '' }) {
  const items = options.map((option) => `<option${attr('value', option.value)}${attr('selected', option.value === value)}>${esc(option.label)}</option>`).join('');
  const control = `<span class="st-select-wrap"><select class="st-select"${fieldNames(id, help)}${attrs(inputAttrs)}>${items}</select></span>`;
  return `<div class="st-row st-row--field">
      ${fieldLabelHtml({ id, label, help, control })}
      ${status}
    </div>`;
}

/**
 * A text field with its label.
 * @param {Object} opts
 * @param {string} opts.id
 * @param {string} opts.label
 * @param {string} opts.value
 * @param {string} [opts.help]
 * @param {object} [opts.inputAttrs] maxlength, autocomplete and the page's hook
 * @param {string} [opts.status]
 */
export function textFieldHtml({ id, label, value, help = '', inputAttrs = {}, status = '' }) {
  const control = `<input class="st-input" type="text"${fieldNames(id, help)}${attr('value', value ?? '')}${attrs(inputAttrs)}>`;
  return `<div class="st-row st-row--field">
      ${fieldLabelHtml({ id, label, help, control })}
      ${status}
    </div>`;
}

/**
 * A search field with a result list, to the combobox pattern: the input is role="combobox" and
 * controls a role="listbox" that js/settings/city-combobox.js fills.
 * @param {Object} opts
 * @param {string} opts.id      the input id; the listbox is <id>-list
 * @param {string} opts.label
 * @param {string} opts.value   the saved text
 * @param {string} [opts.help]
 * @param {string} [opts.placeholder]
 * @param {string} [opts.status]
 */
export function comboboxHtml({ id, label, value, help = '', placeholder = '', status = '' }) {
  const listId = `${id}-list`;
  const control = `<input class="st-input st-combo-input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="search"${fieldNames(id, help)}${attr('aria-controls', listId)}${attr('value', value ?? '')}${attr('placeholder', placeholder || null)}>`;
  return `<div class="st-row st-row--field">
      <div class="st-combo">
        ${fieldLabelHtml({ id, label, help, control })}
        <ul class="st-combo-list" role="listbox"${attr('id', listId)}${attr('aria-labelledby', `${id}-label`)} hidden></ul>
      </div>
      <p class="st-combo-note ui-vh" role="status" data-st-city-note></p>
      ${status}
    </div>`;
}

/**
 * What stands in for controls that are backed by the profile row while it cannot be read (blueprint 6):
 * the reason and a way to try again, never dead controls.
 * @param {'loading'|'offline'|'error'} status  error: the device is online and the read failed
 * @param {string} key  'you' or 'money': which controls are missing; it also makes the button's focus key unique on the page
 */
export function connectionNoticeHtml(status, key) {
  if (status === 'loading') return '<p class="st-notice st-notice--loading" role="status">Loading your details</p>';
  // Online and the read failed: a connection is not what is missing, so the notice does not ask for one.
  const failed = key === 'money' ? 'Your home currency could not be loaded.' : 'Your details could not be loaded.';
  return `<div class="st-notice">
      <p class="st-notice-text">${status === 'error' ? failed : 'This needs a connection.'}</p>
      ${button('Try again', { cls: 'ui-btn ui-btn--small', focusKey: `retry-${key}`, attrs: { 'data-st-action': 'retry-profile', id: `st-retry-${key}` } })}
    </div>`;
}

/**
 * A button of the page.
 * @param {string} label
 * @param {{ action: string, danger?: boolean, primary?: boolean, disabled?: boolean, describedBy?: string }} opts
 */
export function actionButtonHtml(label, { action, danger = false, primary = false, disabled = false, describedBy: described = null }) {
  return button(label, {
    cls: cls('ui-btn', { 'st-btn--danger': danger, 'ui-btn--primary': primary }),
    focusKey: action,
    disabled,
    attrs: { 'data-st-action': action, id: `st-${action}`, 'aria-describedby': described },
  });
}
