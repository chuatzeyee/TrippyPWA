import { describe, it, expect } from 'vitest';
import { kmBetween, mx, my, project, arcPath, cleanPoints } from './geo.js';

const SINGAPORE = { lat: 1.3521, lng: 103.8198 };
const TOKYO = { lat: 35.6762, lng: 139.6503 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const LOS_ANGELES = { lat: 34.0522, lng: -118.2437 };

describe('kmBetween', () => {
  it('measures known distances along the great circle', () => {
    expect(kmBetween(LONDON, PARIS)).toBeGreaterThan(342);
    expect(kmBetween(LONDON, PARIS)).toBeLessThan(345);
    expect(kmBetween(SINGAPORE, TOKYO)).toBeGreaterThan(5300);
    expect(kmBetween(SINGAPORE, TOKYO)).toBeLessThan(5325);
    expect(kmBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
    expect(kmBetween({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(Math.PI * 6371, 3);
  });
  it('is zero for the same point and the same in both directions', () => {
    expect(kmBetween(TOKYO, TOKYO)).toBe(0);
    expect(kmBetween(SINGAPORE, TOKYO)).toBeCloseTo(kmBetween(TOKYO, SINGAPORE), 9);
  });
  it('takes the short way across the 180th meridian', () => {
    expect(kmBetween({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(111.19, 1);
  });
  it('reads a point as { lat, lng }, as [lat, lon] and as an activity row', () => {
    const km = kmBetween(LONDON, PARIS);
    expect(kmBetween([51.5074, -0.1278], [48.8566, 2.3522])).toBeCloseTo(km, 9);
    expect(kmBetween({ latitude: 51.5074, longitude: -0.1278 }, { lat: 48.8566, lon: 2.3522 })).toBeCloseTo(km, 9);
  });
  it('is NaN, never a number that sorts as near, when a point is missing or not numeric', () => {
    expect(kmBetween(null, PARIS)).toBeNaN();
    expect(kmBetween(LONDON, undefined)).toBeNaN();
    expect(kmBetween({ lat: null, lng: null }, PARIS)).toBeNaN();
    expect(kmBetween({ lat: '51.5', lng: '0' }, PARIS)).toBeNaN();
    expect(kmBetween({ lat: 91, lng: 0 }, PARIS)).toBeNaN();
    expect(kmBetween([1], PARIS)).toBeNaN();
    expect(kmBetween(LONDON, { lat: 10, lng: Infinity })).toBeNaN();
  });
});

describe('the Miller projection', () => {
  it('puts longitude on x in tenths of a degree', () => {
    expect(mx(0)).toBe(0);
    expect(mx(180)).toBe(1800);
    expect(mx(-180)).toBe(-1800);
    expect(mx(103.8)).toBeCloseTo(1038, 9);
  });
  it('puts latitude on y, north up (negative), the equator at zero', () => {
    expect(my(0)).toBeCloseTo(0, 9);
    expect(my(45)).toBeLessThan(0);
    expect(my(-45)).toBeGreaterThan(0);
    expect(my(-45)).toBeCloseTo(-my(45), 9);
    // Miller: y = 1.25 ln(tan(45 deg + 0.4 lat)). At 45 degrees north that is 1.25 ln(tan(63 deg)).
    expect(my(45)).toBeCloseTo(-(1.25 * Math.log(Math.tan((63 * Math.PI) / 180)) * 1800) / Math.PI, 6);
    expect(my(60)).toBeLessThan(my(45));
  });
  it('stays finite at the poles, where Mercator does not', () => {
    expect(Number.isFinite(my(90))).toBe(true);
    expect(Number.isFinite(my(-90))).toBe(true);
    expect(my(90)).toBeCloseTo(-1319.8, 0);
  });
  it('projects [lat, lon] to [x, y]', () => {
    expect(project([0, 0])[0]).toBe(0);
    expect(project([0, 0])[1]).toBeCloseTo(0, 9);
    expect(project([45, 90])).toEqual([mx(90), my(45)]);
    expect(project({ lat: 45, lng: 90 })).toEqual([mx(90), my(45)]);
  });
  it('gives no number for a point it cannot read', () => {
    expect(project(null)).toEqual([NaN, NaN]);
    expect(project([])).toEqual([NaN, NaN]);
    expect(project()).toEqual([NaN, NaN]);
  });
});

const pointsOf = (path) => path.split('M').filter(Boolean).map((sub) => sub.split('L').map((pair) => pair.trim().split(' ').map(Number)));

describe('arcPath', () => {
  it('starts at the first point and ends at the second, in world units', () => {
    const path = arcPath([SINGAPORE.lat, SINGAPORE.lng], [TOKYO.lat, TOKYO.lng]);
    expect(path).toMatch(/^M-?\d+ -?\d+(L-?\d+ -?\d+)+$/);
    const [points] = pointsOf(path);
    const round = ([x, y]) => [Math.round(x), Math.round(y)];
    expect(points[0]).toEqual(round(project([SINGAPORE.lat, SINGAPORE.lng])));
    expect(points[points.length - 1]).toEqual(round(project([TOKYO.lat, TOKYO.lng])));
    expect(points).toHaveLength(49);
  });
  it('bends towards the pole: the middle of London to Los Angeles is north of both ends', () => {
    const [points] = pointsOf(arcPath(LONDON, LOS_ANGELES));
    const middle = points[Math.floor(points.length / 2)];
    expect(middle[1]).toBeLessThan(points[0][1]);
    expect(middle[1]).toBeLessThan(points[points.length - 1][1]);
  });
  it('takes the number of steps asked for', () => {
    expect(pointsOf(arcPath(LONDON, PARIS, 8))[0]).toHaveLength(9);
  });
  it('draws nothing between two points that are almost the same place, or for a point it cannot read', () => {
    expect(arcPath(SINGAPORE, { lat: 1.4, lng: 103.9 })).toBe('');
    expect(arcPath(SINGAPORE, SINGAPORE)).toBe('');
    expect(arcPath(null, TOKYO)).toBe('');
    expect(arcPath(SINGAPORE, { lat: null, lng: null })).toBe('');
  });
  it('never jumps across the map: an arc over the 180th meridian is drawn as two pieces', () => {
    const path = arcPath(TOKYO, LOS_ANGELES);
    const pieces = pointsOf(path);
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      for (let i = 1; i < piece.length; i++) expect(Math.abs(piece[i][0] - piece[i - 1][0])).toBeLessThan(400);
    }
    // One piece starts in Tokyo and runs off the east edge; the other comes in from the west and ends in Los Angeles.
    expect(pieces[0][0][0]).toBe(Math.round(mx(TOKYO.lng)));
    expect(Math.max(...pieces[0].map(([x]) => x))).toBeGreaterThan(1800);
    expect(pieces[1][pieces[1].length - 1][0]).toBe(Math.round(mx(LOS_ANGELES.lng)));
    expect(Math.min(...pieces[1].map(([x]) => x))).toBeLessThan(-1800);
  });
  it('the same arc drawn the other way crosses westwards and is two pieces too', () => {
    const pieces = pointsOf(arcPath(LOS_ANGELES, TOKYO));
    expect(pieces).toHaveLength(2);
    expect(pieces[0][0][0]).toBe(Math.round(mx(LOS_ANGELES.lng)));
    expect(Math.min(...pieces[0].map(([x]) => x))).toBeLessThan(-1800);
    expect(pieces[1][pieces[1].length - 1][0]).toBe(Math.round(mx(TOKYO.lng)));
    expect(Math.max(...pieces[1].map(([x]) => x))).toBeGreaterThan(1800);
  });
  it('draws nothing between exact opposites, where every great circle is as short', () => {
    expect(arcPath({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBe('');
    expect(arcPath({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBe('');
  });
  it('falls back to 48 steps for a step count that is not a whole number above 0', () => {
    for (const steps of [0, -3, 2.5, NaN, '8', null]) expect(pointsOf(arcPath(LONDON, LOS_ANGELES, steps))[0]).toHaveLength(49);
  });
  it('holds no "-0" and no decimals', () => {
    expect(arcPath({ lat: 0.01, lng: -5 }, { lat: -0.01, lng: 5 })).not.toMatch(/-0(?!\d)|\./);
  });
});

describe('cleanPoints', () => {
  const near = { lat: 22.28, lng: 114.16, title: 'Central' };
  const alsoNear = { latitude: 22.3, longitude: 114.17, title: 'Kowloon' };
  const anchor = { lat: 22.3193, lng: 114.1694 };

  it('keeps the points that can be placed, as the same objects in the same order', () => {
    const out = cleanPoints([near, alsoNear], anchor);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(near);
    expect(out[1]).toBe(alsoNear);
  });
  it('drops a point with a missing, null or text coordinate', () => {
    expect(cleanPoints([{ lat: null, lng: null }, { lat: 22.3 }, { title: 'x' }, null, undefined, { lat: '22.3', lng: '114.1' }, near], anchor)).toEqual([near]);
    expect(cleanPoints([{ lat: NaN, lng: 114 }, { lat: 22, lng: Infinity }], anchor)).toEqual([]);
  });
  it('drops (0, 0), which is what a failed lookup stores', () => {
    expect(cleanPoints([{ lat: 0, lng: 0 }, near], anchor)).toEqual([near]);
    expect(cleanPoints([{ lat: 0, lng: 0 }])).toEqual([]);
  });
  it('keeps a real point on the equator or on the prime meridian', () => {
    const quito = { lat: 0, lng: -78.5 };
    const greenwich = { lat: 51.48, lng: 0 };
    expect(cleanPoints([quito, greenwich])).toEqual([quito, greenwich]);
  });
  it('drops a point outside the valid ranges', () => {
    expect(cleanPoints([{ lat: 91, lng: 10 }, { lat: -90.5, lng: 10 }, { lat: 10, lng: 181 }, { lat: 10, lng: -180.1 }, near], anchor)).toEqual([near]);
  });
  it('drops a point more than 300 km from the anchor', () => {
    const far = { lat: 35.68, lng: 139.69 };
    const edge = { lat: 23.13, lng: 113.26 };      // Guangzhou, about 130 km from Hong Kong
    expect(cleanPoints([near, far, edge], anchor)).toEqual([near, edge]);
  });
  it('takes several anchors: a point near any of them stays', () => {
    const oslo = { lat: 59.91, lng: 10.75 };
    const bergen = { lat: 60.39, lng: 5.32 };
    const inBergen = { lat: 60.4, lng: 5.33 };
    const inTromso = { lat: 69.65, lng: 18.96 };
    expect(cleanPoints([inBergen, inTromso], [oslo, bergen])).toEqual([inBergen]);
    expect(cleanPoints([inBergen], oslo)).toEqual([]);
  });
  it('takes another distance limit', () => {
    const far = { lat: 23.13, lng: 113.26 };
    expect(cleanPoints([near, far], anchor, 100)).toEqual([near]);
  });
  it('does not check distance when there is no usable anchor (a custom place has no coordinates)', () => {
    const far = { lat: 35.68, lng: 139.69 };
    expect(cleanPoints([near, far])).toEqual([near, far]);
    expect(cleanPoints([near, far], null)).toEqual([near, far]);
    expect(cleanPoints([near, far], { lat: null, lng: null })).toEqual([near, far]);
    expect(cleanPoints([near, far], [{ lat: null, lng: null }, { lat: 0, lng: 0 }])).toEqual([near, far]);
  });
  it('returns a new list and leaves the given one alone', () => {
    const input = Object.freeze([Object.freeze({ ...near }), Object.freeze({ lat: 0, lng: 0 })]);
    const out = cleanPoints(input, anchor);
    expect(out).not.toBe(input);
    expect(input).toHaveLength(2);
    expect(out).toHaveLength(1);
  });
  it('gives an empty list for no list', () => {
    expect(cleanPoints(null, anchor)).toEqual([]);
    expect(cleanPoints(undefined)).toEqual([]);
  });
});
