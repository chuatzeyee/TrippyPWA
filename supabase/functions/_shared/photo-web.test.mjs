import { describe, it, expect } from 'vitest';
import { upsizeGoogleThumb, pickSerperPlace, tavilyCandidates, looseNameMatch } from './photo-web.mjs';

describe('Serper place photo', () => {
  const at = { lat: 43.0553, lng: 141.3530 };
  const places = [
    { title: 'Daruma Honten', latitude: 43.0554, longitude: 141.3531, thumbnailUrl: 'https://lh3.googleusercontent.com/p/abc=w80-h106-k-no', cid: '1' },
    { title: 'Daruma 6.4', latitude: 43.0600, longitude: 141.3600, thumbnailUrl: 'https://lh3.googleusercontent.com/p/def=w80-h80-k-no', cid: '2' },
    { title: 'Some Other Bar', latitude: 43.0700, longitude: 141.3700, thumbnailUrl: 'https://lh3.googleusercontent.com/p/x', cid: '3' },
  ];
  it('takes the named place nearest the venue and ignores far, unnamed ones', () => {
    expect(pickSerperPlace(places, { names: ['Daruma Honten'], ...at }).cid).toBe('1');
    expect(pickSerperPlace([places[2]], { names: ['Daruma Honten'], ...at })).toBeNull();
  });
  it('accepts an unnamed place only when it sits on the coordinates', () => {
    const onTop = { title: 'だるま 本店', latitude: 43.0553, longitude: 141.3531, thumbnailUrl: 'https://lh3.googleusercontent.com/p/j' };
    expect(pickSerperPlace([onTop], { names: ['Daruma Honten'], ...at })).toBe(onTop);
  });
  it('asks Google for a usable size', () => {
    expect(upsizeGoogleThumb('https://lh3.googleusercontent.com/p/abc=w80-h106-k-no')).toBe('https://lh3.googleusercontent.com/p/abc=w960-h720-k-no');
    expect(upsizeGoogleThumb('https://lh3.googleusercontent.com/p/abc')).toBe('https://lh3.googleusercontent.com/p/abc=w960-h720-k-no');
    expect(upsizeGoogleThumb('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});

describe('Tavily candidates', () => {
  it('keeps images only from pages that name the venue, and drops logos', () => {
    const json = { results: [
      { title: 'Daruma Honten: Sapporo Genghis Khan - Tabelog', url: 'https://tabelog.com/en/hokkaido/A0101/1', images: [{ url: 'https://tblg.k-img.com/a.jpg', description: 'lamb grill' }, 'https://tabelog.com/logo.png'] },
      { title: 'Top 10 things to do in Sapporo', url: 'https://example.com/top10', images: ['https://example.com/x.jpg'] },
    ] };
    const c = tavilyCandidates(json, { names: ['Daruma Honten'] });
    expect(c.map(x => x.url)).toEqual(['https://tblg.k-img.com/a.jpg']);
    expect(c[0].credit).toEqual({ via: 'tabelog.com', link: 'https://tabelog.com/en/hokkaido/A0101/1' });
  });
  it('matches names loosely on a distinctive word', () => {
    expect(looseNameMatch('Baristart Coffee Sapporo', 'BARISTART COFFEE')).toBe(true);
    expect(looseNameMatch('Starbucks Reserve', 'Baristart Coffee')).toBe(false);
  });
});
