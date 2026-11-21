// Generates the land outlines of the Atlas plates (blueprint 1.3, D6, section 10 row 27):
//
//   js/views/shared/world-land.js           LAND_WORLD                from land-110m.json
//   js/views/shared/world-land-regions.js   LAND_EUROPE, LAND_APAC    from land-50m.json
//
//   node scripts/build-world-land.mjs           writes both files
//   node scripts/build-world-land.mjs --check   writes nothing; exit 1 when a file on disk differs
//
// This script is the only way those two files are produced. It reads the Natural Earth outlines
// (public domain, as world-atlas TopoJSON) where the preview keeps them, previews/c-atlas/data; they
// are not copied into the app. Ported from previews/c-atlas/build/world.mjs (decode, clip, unwrap,
// simplify) with the boxes and tolerances of previews/c-atlas/build/atlas.mjs:89-91. The projection
// is the app's own: mx and my of js/lib/geo.js. A path is in world units (tenths of a degree), as one
// "M x y l dx dy ... z" piece per ring. Owner: F7.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mx, my } from '../js/lib/geo.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = resolve(ROOT, 'previews/c-atlas/data');
const OUT_DIR = 'js/views/shared';

/** What is generated: the file, its source, and for each export the box [west, south, east, north] and the tolerance. */
export const OUTLINES = Object.freeze([
  { file: `${OUT_DIR}/world-land.js`, source: 'land-110m.json', note: 'The world plate.', maxBytes: 25_000,
    paths: [{ name: 'LAND_WORLD', box: [-192, -58, 192, 84], tol: 5 }] },
  { file: `${OUT_DIR}/world-land-regions.js`, source: 'land-50m.json', note: 'The regional plates. Loaded with a dynamic import by the Atlas page only.', maxBytes: 50_000,
    paths: [{ name: 'LAND_EUROPE', box: [-48, 36, 60, 78], tol: 1.2 }, { name: 'LAND_APAC', box: [60, -56, 180, 62], tol: 2 }] },
]);

// The rings of a TopoJSON land object as lists of [lon, lat].
function decode(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const arcAt = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const land = topology.objects.land;
  const geometries = land.type === 'GeometryCollection' ? land.geometries : [land];
  return geometries.flatMap((geometry) => (geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs))
    .flatMap((polygon) => polygon.map((ring) => ring.reduce((points, i) => points.concat(arcAt(i).slice(points.length ? 1 : 0)), [])));
}

// Sutherland-Hodgman clip of a ring to a box.
function clipRing(ring, [west, south, east, north]) {
  const edges = [[0, west, 1], [0, east, -1], [1, south, 1], [1, north, -1]];
  return edges.reduce((points, [axis, value, sign]) => {
    if (!points.length) return points;
    const inside = (p) => sign * (p[axis] - value) >= 0;
    const cut = (a, b) => { const t = (value - a[axis]) / (b[axis] - a[axis]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    return points.reduce((out, p, k) => {
      const q = points[(k + points.length - 1) % points.length];
      if (inside(p)) return inside(q) ? [...out, p] : [...out, cut(q, p), p];
      return inside(q) ? [...out, cut(q, p)] : out;
    }, []);
  }, ring);
}

// A ring that crosses the 180th meridian jumps from +180 to -180: make it continuous and draw a copy on each side.
function unwrap(ring) {
  const out = ring.reduce((acc, p, k) => {
    const step = k ? p[0] - ring[k - 1][0] : 0;
    const offset = acc.offset + (step > 180 ? -360 : step < -180 ? 360 : 0);
    return { offset, points: [...acc.points, [p[0] + offset, p[1]]] };
  }, { offset: 0, points: [] }).points;
  const lons = out.map((p) => p[0]);
  if (Math.max(...lons) > 180) return [out, out.map(([x, y]) => [x - 360, y])];
  if (Math.min(...lons) < -180) return [out, out.map(([x, y]) => [x + 360, y])];
  return [out];
}

const signed = (value, first) => (value < 0 || first ? `${value}` : ` ${value}`);

// One ring as a path piece in whole world units, without the points closer than `tol` to the one before.
function ringPath(ring, tol) {
  const points = ring.map(([lon, lat]) => [Math.round(mx(lon)), Math.round(my(lat))]);
  const kept = points.reduce((out, p, k) => {
    const last = out[out.length - 1];
    return (!last || k === points.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= tol) ? [...out, p] : out;
  }, []);
  const xs = kept.map((p) => p[0]);
  const ys = kept.map((p) => p[1]);
  const tiny = Math.max(...xs) - Math.min(...xs) < tol * 1.5 && Math.max(...ys) - Math.min(...ys) < tol * 1.5;
  if (kept.length < 4 || tiny) return '';
  const steps = kept.slice(1).map((p, k) => [p[0] - kept[k][0], p[1] - kept[k][1]]).filter(([dx, dy]) => dx || dy);
  return `M${kept[0][0]}${signed(kept[0][1])}l${steps.map(([dx, dy], k) => `${signed(dx, k === 0)}${signed(dy)}`).join('')}z`;
}

/** One compact SVG path for the land inside `box`, simplified to `tol` world units. */
export function landPath(topology, { box, tol }) {
  return decode(topology).flatMap(unwrap).map((ring) => clipRing(ring, box)).filter((ring) => ring.length > 3)
    .map((ring) => ringPath(ring, tol)).join('');
}

function moduleText({ source, note, paths }, topology) {
  const header = `// Generated by scripts/build-world-land.mjs from previews/c-atlas/data/${source}\n`
    + '// (Natural Earth, public domain). Never edited by hand: run the script again instead.\n'
    + `// ${note} World units are those of js/lib/geo.js. Owner: F7.\n`;
  return `${header}${paths.map(({ name, box, tol }) => `\nexport const ${name} = '${landPath(topology, { box, tol })}';\n`).join('')}`;
}

/** @returns {Array<{ file: string, text: string, maxBytes: number }>} the generated modules, nothing written */
export function buildWorldLand(dataDir = DATA_DIR) {
  return OUTLINES.map((outline) => {
    const topology = JSON.parse(readFileSync(resolve(dataDir, outline.source), 'utf8'));
    return { file: outline.file, text: moduleText(outline, topology), maxBytes: outline.maxBytes };
  });
}

function main(argv) {
  const check = argv.includes('--check');
  let failed = false;
  for (const { file, text, maxBytes } of buildWorldLand()) {
    const bytes = Buffer.byteLength(text);
    const over = bytes > maxBytes;
    let state = 'written';
    if (check) {
      let onDisk = null;
      try { onDisk = readFileSync(resolve(ROOT, file), 'utf8'); } catch { /* reported as different */ }
      state = onDisk === text ? 'same' : 'DIFFERENT';
    } else if (!over) {
      writeFileSync(resolve(ROOT, file), text);
    } else {
      state = 'NOT WRITTEN';
    }
    failed = failed || over || state === 'DIFFERENT';
    console.error(`${file}: ${bytes} bytes (budget ${maxBytes})${over ? ' OVER BUDGET' : ''}, ${state}`);
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
