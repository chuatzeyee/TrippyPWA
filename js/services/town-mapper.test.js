import { describe, it, expect } from 'vitest';
import { cellKey, localityFromProps, collectCells, nearestCity, haversineKm } from './town-mapper.js';

describe('cellKey', () => {
  it('merges nearby coordinates into one cell', () => {
    // Two venues ~300m apart in Shibuya
    expect(cellKey(35.6595, 139.7005)).toBe(cellKey(35.6610, 139.7020));
  });
  it('separates coordinates a few km apart', () => {
    expect(cellKey(35.6595, 139.7005)).not.toBe(cellKey(35.71, 139.77));
  });
});

describe('localityFromProps', () => {
  it('prefers district over city', () => {
    expect(localityFromProps({ district: 'Shibuya', city: 'Tokyo' })).toBe('Shibuya');
  });
  it('uses the place name for town/village features', () => {
    expect(localityFromProps({ name: 'Hallstatt', osm_value: 'village' })).toBe('Hallstatt');
  });
  it('does NOT use POI names for non-settlement features', () => {
    expect(localityFromProps({ name: 'front of Shibuya station', osm_value: 'yes', city: 'Tokyo' })).toBe('Tokyo');
  });
  it('falls back through suburb and county', () => {
    expect(localityFromProps({ suburb: 'Kallio' })).toBe('Kallio');
    expect(localityFromProps({ county: 'Lapland' })).toBe('Lapland');
  });
  it('returns null when nothing usable', () => {
    expect(localityFromProps(null)).toBeNull();
    expect(localityFromProps({ osm_value: 'yes', name: 'x' })).toBeNull();
  });
  it('skips generic noise localities like "Airport"', () => {
    expect(localityFromProps({ district: 'Airport', city: 'Helsinki' })).toBe('Helsinki');
    expect(localityFromProps({ suburb: 'Industrial Area', city: 'Doha' })).toBe('Doha');
  });
});

describe('collectCells', () => {
  it('dedupes activities per cell and keeps day hits', () => {
    const days = [
      { day_number: 1, _index: 0, activities: [
        { latitude: 35.6595, longitude: 139.7005, venue_name: 'Shibuya Crossing' },
        { latitude: 35.6610, longitude: 139.7020, venue_name: 'Hachiko' },
      ] },
      { day_number: 2, _index: 1, activities: [
        { latitude: 35.6595, longitude: 139.7005, venue_name: 'Shibuya Sky' },
        { latitude: 0, longitude: 0, venue_name: 'broken' },
        { latitude: null, longitude: null, venue_name: 'missing' },
      ] },
    ];
    const cells = collectCells(days);
    expect(cells.size).toBe(1);
    const cell = [...cells.values()][0];
    expect(cell.hits).toHaveLength(3);
    expect(new Set(cell.hits.map(h => h.dayNumber))).toEqual(new Set([1, 2]));
  });
});

describe('nearestCity', () => {
  const cities = [
    { name: 'Helsinki', lat: 60.17, lng: 24.94 },
    { name: 'Rovaniemi', lat: 66.50, lng: 25.73 },
  ];
  it('assigns coordinates to the closest trip city', () => {
    expect(nearestCity(60.2, 24.9, cities)).toBe('Helsinki');
    expect(nearestCity(66.54, 25.85, cities)).toBe('Rovaniemi');
  });
  it('returns the single city name for one-city trips', () => {
    expect(nearestCity(1, 1, [{ name: 'Tokyo', lat: 35.6, lng: 139.7 }])).toBe('Tokyo');
  });
});

describe('haversineKm', () => {
  it('computes plausible distances', () => {
    const km = haversineKm(60.17, 24.94, 66.50, 25.73);
    expect(km).toBeGreaterThan(690);
    expect(km).toBeLessThan(720);
  });
});
