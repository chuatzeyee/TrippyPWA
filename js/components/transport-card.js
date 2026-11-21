// Ground and sea journeys to and from the destination (bus, train, ferry, car,
// taxi). Never shows a plane: the "Transport" card replaces the flight card
// for these trips. Each leg reads top to bottom like the trip itself: where to
// board (embark, for a ferry), any change on the way, where to get off
// (disembark), then time, frequency, fare and the border crossing.
import { escapeHtml as esc } from '../data/day-builder.js';
import { to12h } from '../lib/locale.js';

// The journey helpers live in js/lib/journey.js now; they are still exported
// from here for the modules that import them from this path.
export { modeFrom, looksLikeGroundLeg, normalizeLeg, groundJourney, journeyMode } from '../lib/journey.js';

const MODE_LABELS = { bus: 'Bus', train: 'Train', ferry: 'Ferry', car: 'Car', taxi: 'Taxi', mrt: 'MRT', walk: 'Walk' };
const ENDPOINT_LABELS = {
  ferry: ['Embark at', 'Disembark at'],
  bus: ['Board at', 'Get off at'],
  train: ['Board at', 'Get off at'],
  car: ['From', 'To'],
  taxi: ['Pick up at', 'Drop off at'],
};

// Material icon paths (24px grid).
const PATHS = {
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  ferry: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  taxi: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5H15V3H9v2H6.5c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  mrt: 'M17.8 2.8C16 2.09 13.86 2 12 2c-1.86 0-4 .09-5.8.8C3.53 3.84 2 6.05 2 8.86V22h20V8.86c0-2.81-1.53-5.02-4.2-6.06zm.2 13.08c0 1.45-1.18 2.62-2.63 2.62l1.13 1.12V20H15l-1.5-1.5h-2.83L9.17 20H7.5v-.38l1.12-1.12C7.18 18.5 6 17.32 6 15.88V9c0-2.63 3-3 6-3 3.32 0 6 .38 6 3v6.88z',
  walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  passport: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 3c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm4 13H8v-2h8v2zm-4-7c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z',
  info: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  open: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
};

export function transportIcon(mode, size = 18) {
  const d = PATHS[mode] || PATHS.bus;
  return `<svg class="tl-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

function directionsUrl(from, to, mode) {
  const travelmode = mode === 'car' || mode === 'taxi' ? 'driving' : 'transit';
  const q = new URLSearchParams({ api: '1', origin: from, destination: to, travelmode });
  return `https://www.google.com/maps/dir/?${q}`;
}

// Free text that can hold a clock time (how often it runs, terminal and border
// notes, tips, steps) is shown as every other time in the app is. Durations,
// fares and names are not: "1:10" there is not a time of day.
function legHtml(leg, label) {
  if (!leg) return '';
  const [boardLabel, alightLabel] = ENDPOINT_LABELS[leg.mode] || ENDPOINT_LABELS.bus;
  const modeLabel = MODE_LABELS[leg.mode] || 'Transport';
  const facts = [
    leg.duration && ['Door to door', leg.duration],
    leg.frequency && ['Runs', to12h(leg.frequency)],
    leg.price && ['Fare', leg.price],
    !leg.border && leg.terminal && ['Terminal', to12h(leg.terminal)],
  ].filter(Boolean);
  const links = leg.from && leg.to ? `
    <div class="tl-links">
      <a class="td-flight-book" href="${esc(directionsUrl(leg.from, leg.to, leg.mode))}" target="_blank" rel="noopener noreferrer">Directions on Google Maps</a>
      <a class="td-flight-book" href="https://www.rome2rio.com/s/${encodeURIComponent(leg.from)}/${encodeURIComponent(leg.to)}" target="_blank" rel="noopener noreferrer">Compare on Rome2Rio</a>
    </div>` : '';

  return `
    <article class="tl-leg tl-leg--${esc(leg.mode)}">
      <header class="tl-head">
        <span class="tl-dir">${esc(label)}</span>
        <span class="tl-mode">${transportIcon(leg.mode, 16)}${esc(modeLabel)}</span>
      </header>
      <div class="tl-body">
        ${leg.operator || leg.service ? `<p class="tl-operator">${esc(leg.operator)}${leg.service ? `<span class="tl-service">${esc(leg.service)}</span>` : ''}</p>` : ''}
        <ol class="tl-route">
          ${leg.from ? `<li class="tl-stop"><span class="tl-stop-kind">${boardLabel}</span><span class="tl-stop-name">${esc(leg.from)}</span></li>` : ''}
          ${leg.steps.length > 1 ? leg.steps.map((s, i) => `
            <li class="tl-step">
              <span class="tl-step-num">${i + 1}</span>
              <span class="tl-step-text">${s.mode ? transportIcon(s.mode, 14) : ''}${esc(to12h(s.text))}${s.duration ? `<span class="tl-step-time">${esc(s.duration)}</span>` : ''}</span>
            </li>`).join('') : ''}
          ${leg.to ? `<li class="tl-stop tl-stop--end"><span class="tl-stop-kind">${alightLabel}</span><span class="tl-stop-name">${esc(leg.to)}</span></li>` : ''}
        </ol>
        ${leg.steps.length > 1 ? `<p class="tl-change">${leg.steps.length - 1 === 1 ? 'One change on the way' : `${leg.steps.length - 1} changes on the way`}</p>` : ''}
        ${facts.length ? `<dl class="tl-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${leg.border ? `<p class="tl-border">${transportIcon('passport', 16)}<span>${esc(to12h(leg.border))}</span></p>` : ''}
        ${leg.tips ? `<p class="tl-tip">${transportIcon('info', 14)}<span>${esc(to12h(leg.tips))}</span></p>` : ''}
        ${links}
      </div>
    </article>`;
}

/** Both legs; Outbound first. */
export function transportJourneyHtml(journey) {
  if (!journey) return '';
  return `<div class="tl-legs">${legHtml(journey.outbound, 'Outbound')}${legHtml(journey.inbound, 'Return')}</div>`;
}
