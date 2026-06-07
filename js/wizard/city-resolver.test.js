import { describe, it, expect } from 'vitest';
import {
  cleanCityName,
  scorePhotonFeature,
  pickBestCity,
  destFromPhotonFeature,
  wikiThumbToWide,
} from './city-resolver.js';

// A minimal Photon feature factory matching the real API response shape.
function feat({ name, country = '', cc = '', value = 'city', extent, coords = [0, 0] }) {
  const props = { name, country, countrycode: cc, osm_value: value };
  if (extent) props.extent = extent;
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords } };
}

describe('cleanCityName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanCityName('  Ulan   Bataar ')).toBe('Ulan Bataar');
  });
  it('handles nullish input', () => {
    expect(cleanCityName(undefined)).toBe('');
    expect(cleanCityName(null)).toBe('');
  });
});

describe('scorePhotonFeature', () => {
  it('ranks a city above a village', () => {
    const city = scorePhotonFeature(feat({ name: 'A', value: 'city' }), 0);
    const village = scorePhotonFeature(feat({ name: 'B', value: 'village' }), 0);
    expect(city).toBeLessThan(village);
  });
  it('rewards a bounding box (extent)', () => {
    const withExt = scorePhotonFeature(feat({ name: 'A', value: 'city', extent: [1, 2, 3, 4] }), 0);
    const without = scorePhotonFeature(feat({ name: 'A', value: 'city' }), 0);
    expect(withExt).toBeLessThan(without);
  });
});

describe('pickBestCity', () => {
  it('returns null for empty input', () => {
    expect(pickBestCity([])).toBeNull();
    expect(pickBestCity(undefined)).toBeNull();
  });

  it('prefers the real city over similarly-named villages (Hanio -> Hanoi)', () => {
    // Mirrors the live Photon ordering for the misspelling "Hanio": a village
    // appears first by raw relevance, but the actual city should win.
    const features = [
      feat({ name: 'Hanion', cc: 'CI', value: 'village' }),
      feat({ name: 'Hanoi', country: 'Vietnam', cc: 'VN', value: 'city', extent: [1, 2, 3, 4] }),
      feat({ name: 'Hanko', cc: 'FI', value: 'town' }),
    ];
    expect(pickBestCity(features).properties.name).toBe('Hanoi');
  });

  it('skips features with no name', () => {
    const features = [
      { properties: {}, geometry: { coordinates: [0, 0] } },
      feat({ name: 'Ulaanbaatar', cc: 'MN', value: 'city', extent: [1, 2, 3, 4] }),
    ];
    expect(pickBestCity(features).properties.name).toBe('Ulaanbaatar');
  });
});

describe('destFromPhotonFeature', () => {
  it('extracts name, flag, currency and coordinates', () => {
    const d = destFromPhotonFeature(
      feat({ name: 'Ulaanbaatar', country: 'Mongolia', cc: 'MN', value: 'city', coords: [106.88, 47.91] })
    );
    expect(d.name).toBe('Ulaanbaatar');
    expect(d.country).toBe('Mongolia');
    expect(d.flag).toBe('mn');
    expect(d.currencyCode).toBe('MNT');
    expect(d.currencySymbol).toBeTruthy();
    expect(d.lat).toBeCloseTo(47.91);
    expect(d.lng).toBeCloseTo(106.88);
  });

  it('falls back to USD when the country is unknown', () => {
    const d = destFromPhotonFeature(feat({ name: 'Nowhere', value: 'city' }));
    expect(d.currencyCode).toBe('USD');
    expect(d.flag).toBe('');
  });
});

describe('wikiThumbToWide', () => {
  it('upsizes the thumbnail width segment', () => {
    expect(wikiThumbToWide('https://upload.wikimedia.org/.../thumb/c/c2/UB.jpg/330px-UB.jpg'))
      .toBe('https://upload.wikimedia.org/.../thumb/c/c2/UB.jpg/500px-UB.jpg');
  });
  it('returns empty for empty input', () => {
    expect(wikiThumbToWide('')).toBe('');
  });
});
