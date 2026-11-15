// "Already booked?" flight details in the wizard. Times and the route (with any
// connection) are what the AI must not guess: the server puts them on the trip
// exactly as entered and plans the first and last days around them.
import { escapeHtml as esc } from '../data/day-builder.js';

const LEGS = [
  { key: 'outbound', title: 'Flight there', departLabel: 'Departs', arriveLabel: 'Lands' },
  { key: 'inbound', title: 'Flight home', departLabel: 'Departs', arriveLabel: 'Lands' },
];

function legHtml(leg, data = {}) {
  const id = (f) => `bf-${leg.key}-${f}`;
  return `
    <fieldset class="booked-leg">
      <legend class="booked-leg-title">${leg.title}</legend>
      <div class="booked-leg-grid">
        <label class="settled-field" for="${id('flightNumber')}">
          <span class="settled-field-label">Flight number</span>
          <input id="${id('flightNumber')}" type="text" class="settled-input" data-leg="${leg.key}" data-field="flightNumber"
            placeholder="e.g. TR892" autocomplete="off" autocapitalize="characters" value="${esc(data.flightNumber || '')}">
        </label>
        <label class="settled-field" for="${id('route')}">
          <span class="settled-field-label">Route</span>
          <input id="${id('route')}" type="text" class="settled-input" data-leg="${leg.key}" data-field="route"
            placeholder="e.g. SIN > TPE > CTS" autocomplete="off" autocapitalize="characters" value="${esc(data.route || '')}"
            aria-describedby="bf-route-hint">
        </label>
        <label class="settled-field" for="${id('depart')}">
          <span class="settled-field-label">${leg.departLabel}</span>
          <input id="${id('depart')}" type="datetime-local" class="settled-input" data-leg="${leg.key}" data-field="depart" value="${esc(data.depart || '')}">
        </label>
        <label class="settled-field" for="${id('arrive')}">
          <span class="settled-field-label">${leg.arriveLabel}</span>
          <input id="${id('arrive')}" type="datetime-local" class="settled-input" data-leg="${leg.key}" data-field="arrive" value="${esc(data.arrive || '')}">
        </label>
      </div>
    </fieldset>`;
}

/** Form for the booked flights; `flights` is the wizard's flights state. */
export function bookedFlightsHtml(flights) {
  const booked = flights?.booked || {};
  // Older wizard states kept only a flight number: show it in the first leg.
  const outbound = booked.outbound || (flights?.flightNumber ? { flightNumber: flights.flightNumber } : {});
  return `
    <div class="settled-fields booked-flights">
      ${legHtml(LEGS[0], outbound)}
      ${legHtml(LEGS[1], booked.inbound || {})}
      <p class="settled-hint" id="bf-route-hint">Use local times at each airport. If your flight stops, put the stop in the route, like SIN &gt; TPE &gt; CTS. Leave out anything you don't have yet.</p>
    </div>`;
}

/**
 * Wires the inputs; `onChange(nextFlights)` receives a new flights object.
 * The legacy flightNumber / arrivalDate fields are kept in step for older
 * readers of the wizard state.
 */
export function bindBookedFlights(root, getFlights, onChange) {
  root.querySelectorAll('.booked-flights [data-leg]').forEach(input => {
    input.addEventListener('input', () => {
      const flights = getFlights();
      const booked = flights.booked || {};
      const leg = { ...(booked[input.dataset.leg] || {}), [input.dataset.field]: input.value.trim() };
      const nextBooked = { ...booked, [input.dataset.leg]: leg };
      const out = nextBooked.outbound || {};
      onChange({
        ...flights,
        booked: nextBooked,
        flightNumber: out.flightNumber || '',
        arrivalDate: (out.arrive || '').slice(0, 10),
      });
    });
  });
}
