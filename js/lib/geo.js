// Distances, the Miller projection and great-circle arcs for the map plates and the trip map.
// Pure: no DOM, no network, no storage.
//
// A point is read in any of the shapes the app stores one in: { lat, lng } (destinations, map
// points), { lat, lon }, { latitude, longitude } (activity rows) or [lat, lon]. World units are
// tenths of a degree: x = lon * 10, y = -miller(lat) * 10, so north is up as in an SVG.

const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
/** How far a stop may be from its trip's destinations before its coordinates are taken as wrong. */
const NEAR_KM = 300;
/** Two ends closer than this (in radians, about 64 km) get no arc: it would be a dot. */
const MIN_ARC = 0.01;
const ARC_STEPS = 48;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** @returns {[number, number]|null} [lat, lon] in degrees, null when the point cannot be read or is out of range */
function latLon(point) {
  if (!point || typeof point !== 'object') return null;
  const [lat, lon] = Array.isArray(point)
    ? point
    : [point.lat ?? point.latitude, point.lng ?? point.lon ?? point.longitude];
  if (!isNumber(lat) || !isNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

/** The same, but (0, 0) does not count: it is what a failed lookup stores, and it is open sea. */
function placeable(point) {
  const at = latLon(point);
  return at && !(at[0] === 0 && at[1] === 0) ? at : null;
}

// The angle between two [lat, lon] points, in radians (haversine: steady for short distances).
function angleBetween([lat1, lon1], [lat2, lon2]) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Kilometres between two points along the great circle.
 * @returns {number} NaN when either point cannot be read, so an unknown place never sorts as near
 */
export function kmBetween(a, b) {
  const from = latLon(a);
  const to = latLon(b);
  return from && to ? angleBetween(from, to) * EARTH_RADIUS_KM : NaN;
}

/** @returns {number} the world x of a longitude */
export function mx(lon) {
  return lon * 10;
}

/** @returns {number} the world y of a latitude (Miller cylindrical; north is negative, the poles stay finite) */
export function my(lat) {
  const clamped = Math.min(90, Math.max(-90, lat));
  return -(1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * clamped * RAD)) / RAD) * 10;
}

/** @returns {[number, number]} the world [x, y] of a point; [NaN, NaN] when it cannot be read */
export function project(point) {
  const at = latLon(point);
  return at ? [mx(at[1]), my(at[0])] : [NaN, NaN];
}

// The great circle from one [lat, lon] to another as steps + 1 points, both ends exact.
function greatCircle(from, to, angle, steps) {
  const [lat1, lon1] = [from[0] * RAD, from[1] * RAD];
  const [lat2, lon2] = [to[0] * RAD, to[1] * RAD];
  return Array.from({ length: steps + 1 }, (_, i) => {
    if (i === 0) return from;
    if (i === steps) return to;
    const f = i / steps;
    const A = Math.sin((1 - f) * angle) / Math.sin(angle);
    const B = Math.sin(f * angle) / Math.sin(angle);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    return [Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD, Math.atan2(y, x) / RAD];
  });
}

// Longitudes made continuous: a step from 179 to -179 becomes 179 to 181.
function unwrap(points) {
  return points.reduce((out, [lat, lon]) => {
    const prev = out.length ? out[out.length - 1][1] : lon;
    const turns = Math.round((prev - lon) / 360);
    return [...out, [lat, lon + turns * 360]];
  }, []);
}

const subPath = (points, shift = 0) => `M${points
  .map(([lat, lon]) => `${Math.round(mx(lon + shift)) || 0} ${Math.round(my(lat)) || 0}`).join('L')}`;

/**
 * The great-circle arc from a to b as an SVG path in world units. An arc that crosses the 180th
 * meridian is two pieces, one running off each side of the map, so it never draws a line across it.
 * @returns {string} '' when a point cannot be read, and when the two are too close (or exactly
 *   opposite) for an arc
 */
export function arcPath(a, b, steps = ARC_STEPS) {
  const from = latLon(a);
  const to = latLon(b);
  if (!from || !to) return '';
  const angle = angleBetween(from, to);
  if (angle < MIN_ARC || Math.PI - angle < 1e-6) return '';
  const count = Number.isInteger(steps) && steps >= 1 ? steps : ARC_STEPS;
  const points = unwrap(greatCircle(from, to, angle, count));
  const lons = points.map(([, lon]) => lon);
  if (Math.max(...lons) > 180) return subPath(points) + subPath(points, -360);
  if (Math.min(...lons) < -180) return subPath(points) + subPath(points, 360);
  return subPath(points);
}

/**
 * The points that can be placed on a map: both coordinates are finite numbers inside the valid
 * ranges, the point is not (0, 0), and it lies within `maxKm` of the anchor. `anchor` is one point
 * or a list (a plan's destinations: near any of them is near). With no usable anchor, distance is
 * not checked. The result is a new list holding the same objects in the same order.
 * @returns {Array<object>}
 */
export function cleanPoints(points, anchor, maxKm = NEAR_KM) {
  if (!Array.isArray(points)) return [];
  const anchors = (Array.isArray(anchor) && !isNumber(anchor[0]) ? anchor : [anchor]).map(placeable).filter(Boolean);
  return points.filter((point) => {
    const at = placeable(point);
    if (!at) return false;
    return anchors.length === 0 || anchors.some((near) => angleBetween(at, near) * EARTH_RADIUS_KM <= maxKm);
  });
}
