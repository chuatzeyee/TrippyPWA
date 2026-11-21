import { describe, it, expect, vi, afterEach } from 'vitest';
import { DESTINATIONS } from '../wizard/destinations.js';
import { searchCities } from './city-search.js';

const names = (query) => searchCities(query).map(d => d.name);

describe('searchCities', () => {
  it('matches part of a city name, sorted by name, eight at most', () => {
    expect(names('to')).toEqual(['Cape Town', 'Kyoto', 'Porto', 'Queenstown', 'Santorini', 'Stockholm', 'Tokyo', 'Toronto']);
    expect(names('kyo')).toEqual(['Kyoto', 'Tokyo']);
    expect(names('sing')).toEqual(['Singapore']);
    expect(names('reyk')).toEqual(['Reykjavik']);
    expect(names('Ho Chi')).toEqual(['Ho Chi Minh']);
  });
  it('matches the country as well', () => {
    expect(names('norway')).toEqual(['Bergen', 'Oslo', 'Tromso']);
    expect(names('new')).toEqual(['Auckland', 'Christchurch', 'New York', 'Queenstown', 'Wellington']);
    expect(names('ja')).toEqual(['Fukuoka', 'Hiroshima', 'Jakarta', 'Kyoto', 'Nagoya', 'Osaka', 'Reykjavik', 'Sapporo']);
  });
  it('ignores the case of the query', () => {
    expect(names('JAPAN')).toEqual(['Fukuoka', 'Hiroshima', 'Kyoto', 'Nagoya', 'Osaka', 'Sapporo', 'Tokyo']);
    expect(names('OS')).toEqual(names('os'));
    expect(names('os')).toEqual(['Buenos Aires', 'Hiroshima', 'Los Angeles', 'Luang Prabang', 'Osaka', 'Oslo']);
  });
  it('finds nothing for an unknown place', () => {
    expect(names('zz')).toEqual([]);
    expect(names('united')).toEqual([]);
  });
  it('gives the first eight cities for an empty query', () => {
    expect(names('')).toEqual(['Abu Dhabi', 'Adelaide', 'Akureyri', 'Amman', 'Amsterdam', 'Athens', 'Auckland', 'Bali']);
  });
  it('treats a missing query as an empty one', () => {
    expect(names(undefined)).toEqual(names(''));
    expect(names(null)).toEqual(names(''));
  });
  it('does not reorder or change the catalogue', () => {
    const before = DESTINATIONS.map(d => d.name);
    searchCities('a');
    searchCities('to');
    expect(DESTINATIONS.map(d => d.name)).toEqual(before);
  });
  it('returns the catalogue entries themselves, so name, country and flag always agree', () => {
    const [city] = searchCities('sing');
    expect(city).toMatchObject({ name: 'Singapore', country: 'Singapore', flag: 'sg' });
    expect(city).toBe(DESTINATIONS.find(d => d.name === 'Singapore'));
    expect(searchCities('norway').map(d => [d.country, d.flag])).toEqual([['Norway', 'no'], ['Norway', 'no'], ['Norway', 'no']]);
  });
});

describe('searchCities over any catalogue', () => {
  afterEach(() => { vi.doUnmock('../wizard/destinations.js'); vi.resetModules(); });

  it('lists a city name once (the first entry wins), sorted, and stops at eight', async () => {
    vi.resetModules();
    const catalogue = [
      { name: 'Springfield', country: 'Oregon', flag: 'us' },
      { name: 'Aberdeen', country: 'Scotland', flag: 'gb' },
      { name: 'Springfield', country: 'Queensland', flag: 'au' },
      ...['Kilo', 'Juliet', 'India', 'Hotel', 'Golf', 'Foxtrot', 'Echo', 'Delta', 'Charlie', 'Bravo'].map(name => ({ name, country: 'Testland', flag: 'tl' })),
    ];
    vi.doMock('../wizard/destinations.js', () => ({ DESTINATIONS: catalogue }));
    const { searchCities: search } = await import('./city-search.js');
    expect(search('springfield')).toEqual([{ name: 'Springfield', country: 'Oregon', flag: 'us' }]);
    expect(search('queensland')).toEqual([]);
    expect(search('').map(d => d.name)).toEqual(['Aberdeen', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
    expect(search('testland')).toHaveLength(8);
    expect(catalogue.map(d => d.name).slice(0, 4)).toEqual(['Springfield', 'Aberdeen', 'Springfield', 'Kilo']);
  });
});
