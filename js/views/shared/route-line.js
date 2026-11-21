// The route line (blueprint 2.1): where a plan starts, how it travels and where it goes, for a
// flight, a ground or sea journey, a multi-city plan and a plan at home. Times are shown only when
// the model carries them; nothing is ever guessed here. Owner: F5.
import { attr, cls, esc } from './html.js';
import { icon } from './icons.js';

const MODE_WORDS = { plane: 'by plane', train: 'by train', bus: 'by bus', ferry: 'by ferry', car: 'by car', taxi: 'by taxi' };
const KINDS = ['flight', 'ground', 'multi', 'home', 'none'];

const text = (value) => String(value ?? '').trim();
const sentence = (value) => (/[.!?]$/.test(value) ? value : `${value}.`);

function endHtml(end, time, to) {
  const code = text(end.code);
  const note = text(end.note);
  return `<span class="${cls('ui-route-end', { 'ui-route-end--to': to })}">${code ? `<span class="ui-route-code">${esc(code)}</span>` : ''}<span class="${cls('ui-route-name', { 'ui-route-name--lead': !code })}">${esc(text(end.label))}</span>${note ? `<span class="ui-route-note">${esc(note)}</span>` : ''}${time ? `<span class="ui-route-time">${esc(time)}</span>` : ''}</span>`;
}

function spoken(end) {
  const code = text(end.code);
  const note = text(end.note);
  return `${text(end.label)}${code ? ` (${code})` : ''}${note ? `, ${note}` : ''}`;
}

/**
 * @param {import('../contract.js').RouteLine|null} route
 * @param {{ cls?: any }} [opts]
 * @returns {string} one image for assistive technology, with the whole route as its label; '' without both names
 */
export function routeLineHtml(route, { cls: extra } = {}) {
  if (!route || !text(route.to?.label) || !text(route.from?.label)) return '';
  const kind = KINDS.includes(route.kind) ? route.kind : 'none';
  const detail = text(route.detail);
  const detailHtml = detail ? `<span class="ui-route-detail">${esc(detail)}</span>` : '';
  if (kind === 'home') {
    const label = `At home in ${text(route.to.label)}.`;
    return `<div class="${cls('ui-route', extra)}" data-kind="home" role="img"${attr('aria-label', label)}><span class="ui-route-end">${icon('home', 18)}<span class="ui-route-name ui-route-name--lead">${esc(text(route.to.label))}</span></span>${detailHtml}</div>`;
  }
  const mode = kind !== 'none' && Object.hasOwn(MODE_WORDS, route.mode) ? route.mode : null;
  const depart = text(route.times?.depart);
  const arrive = text(route.times?.arrive);
  const parts = [`${spoken(route.from)} to ${spoken(route.to)}${mode ? ` ${MODE_WORDS[mode]}` : ''}.`];
  if (detail) parts.push(sentence(detail));
  if (depart && arrive) parts.push(`Departs ${depart}, arrives ${arrive}.`);
  if (route.booked) parts.push('Booked.');
  return `<div class="${cls('ui-route', extra)}" data-kind="${kind}"${attr('data-mode', mode)}${attr('data-booked', Boolean(route.booked))} role="img"${attr('aria-label', parts.join(' '))}>${endHtml(route.from, depart && arrive ? depart : '', false)}<span class="ui-route-mid"><span class="ui-route-track">${mode ? icon(mode, 18) : ''}</span>${detailHtml}</span>${endHtml(route.to, depart && arrive ? arrive : '', true)}</div>`;
}
