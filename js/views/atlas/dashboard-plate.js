// The atlas plate of the dashboard (task table row 3): a large plate beside "Happening now" on wide
// screens and a band on phones. Each is one link to #/atlas and its pins are decoration (blueprint
// section 10, row 23). Both are in the markup; the skin shows one. Each frame carries what its plate
// is drawn from, so plate-mount.js can draw it again for the width it really has. Owner: VC.
import { attr, button, cls } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { packData, plateSvg, worldWindow } from './plates.js';
import { flagRowHtml, passportLine } from './passport.js';
import { enterClass, legendHtml, statsHtml, statsLine } from './parts.js';

/** The shape and latitudes of each dashboard plate, and the size it is drawn for until it is measured. */
const SHAPES = Object.freeze({
  plate: Object.freeze({ width: 700, height: 441, north: 79, south: -50, clearLeft: 0.27, scale: 1 }),
  band: Object.freeze({ width: 390, height: 172, north: 78, south: -50, clearLeft: 0, scale: 0.8, maxLabels: 2 }),
  empty: Object.freeze({ width: 520, height: 220, north: 62, south: -48, clearLeft: 0, scale: 1 }),
});
const MAP_LABEL = 'World map with a pin for each place in your plans';
// How wide the stats laid over the left of the wide plate are, in CSS px: no label goes under them.
const STATS_PX = 128;
export const PASSPORT_HREF = '#/atlas?open=passport';

/**
 * One dashboard plate as SVG, for a frame of the given size in CSS px (the measured frame, or the
 * shape's own size for the first paint).
 * @param {'plate'|'band'|'empty'} kind
 * @param {{ pins: object[], arcs: object[], labels: object[] }} data  what plateData() or unpackPlate() returned
 * @param {{ width?: number, height?: number, clearLeft?: number }} [size] clearLeft: the share of the
 *   width the stats are laid over on the left (the skin says so through --atl-clear-left)
 */
export function dashboardPlateSvg(kind, data, { width, height, clearLeft } = {}) {
  const shape = SHAPES[kind] ?? SHAPES.plate;
  const w = width > 0 ? width : shape.width;
  const h = height > 0 ? height : shape.height;
  const clear = Number.isFinite(clearLeft) ? clearLeft : shape.clearLeft;
  const view = worldWindow(data?.pins, w / h, { north: shape.north, south: shape.south, clearLeft: clear });
  return plateSvg({ ...data, view, cssW: w, label: MAP_LABEL, scale: shape.scale, maxLabels: shape.maxLabels, clearLeft: clear > 0 ? Math.min(clear, STATS_PX / w) : 0 });
}

const frameHtml = (kind, data, carry) => `<span class="atl-plate-frame atl-plate-frame--${kind}" data-atl-plate="${kind}"${carry ? attr('data-atl-pins', packData(data)) : ''}>${dashboardPlateSvg(kind, data)}</span>`;

/**
 * The wide plate: the stats down its left edge, the legend and "Open atlas" under it.
 * @param {object} data  plateData(model): this frame carries it for both plates
 */
export function plateBlockHtml(model, ctx, data) {
  const name = `Open atlas: ${statsLine(model.stats)}`;
  return `<div class="${cls('atl-plate', enterClass(ctx))}">
    <div class="atl-plate-stage">
      <div class="atl-plate-map" data-region="plate"><a class="atl-plate-link" href="#/atlas" data-focus-key="plate"${attr('aria-label', name)}>${frameHtml('plate', data, true)}</a></div>
      <span class="atl-plate-fade" aria-hidden="true"></span>
      ${statsHtml(model.stats, { region: true, cls: 'atl-stats--plate' })}
    </div>
    <div class="atl-plate-foot">${legendHtml()}${button('Open atlas', { action: 'open-atlas', cls: 'ui-btn atl-open', html: `${icon('expand', 18)}<span>Open atlas</span>` })}</div>
  </div>`;
}

/** The phone band: the plate, the three stats and the flags of the passport. Two links, nothing else. */
export function bandHtml(model, ctx, data, rows) {
  const flags = flagRowHtml(rows);
  const foot = flags
    ? `<a class="atl-band-foot" href="${PASSPORT_HREF}" data-focus-key="band-passport"${attr('aria-label', `Open passport: ${passportLine(rows)}`)}>${flags}<span class="atl-band-more">Open passport</span></a>` : '';
  return `<div class="${cls('atl-band', enterClass(ctx))}" data-region="band">
    <a class="atl-band-map" href="#/atlas" data-focus-key="band"${attr('aria-label', `Open atlas: ${statsLine(model.stats)}`)}>${frameHtml('band', data, false)}<span class="atl-band-cue">${icon('expand', 16)}Open atlas</span>${statsHtml(model.stats, { inline: true, cls: 'atl-stats--band' })}</a>
    ${foot}
  </div>`;
}

/** The plate of the empty dashboard: the home pin alone, when the home city is known. */
export function emptyPlateHtml(model) {
  const home = (Array.isArray(model?.pins) ? model.pins : []).find((pin) => pin?.kind === 'home');
  const spot = home ? { at: home.at, kind: 'live', place: String(home.place ?? '') } : null;
  const data = spot ? { pins: [spot], arcs: [], labels: [{ ...spot, text: `Home, ${home.place}` }] } : { pins: [], arcs: [], labels: [] };
  return `<div class="atl-empty-map">${frameHtml('empty', data, true)}</div>`;
}
