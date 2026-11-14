import { describe, it, expect } from 'vitest';
import { heroCover, coverNeedsPick, coverCreditText, isAutoCoverV1, isOrphanCoverV2, listCoverCopies, HERO_SIZES } from './trip-cover.js';

const FORBIDDEN_GLYPHS = /[\u2014\u2013\u00B7\u2022]/;
const TRIP_ID = '4c11d050-abb4-43a5-8024-468bc14dd380';
const STORE = `https://x.supabase.co/storage/v1/object/public/trip-photos/${TRIP_ID}`;
const large = { url: `${STORE}/cover-v2-2400w.jpg`, w: 2400, h: 1600 };
const small = { url: `${STORE}/cover-v2-1280w.jpg`, w: 1280, h: 853 };
const pexelsCredit = {
  creator: 'hujason', creatorUrl: 'https://www.pexels.com/@hujason', license: 'Pexels License', via: 'Pexels',
  link: 'https://www.pexels.com/photo/aerial-view-of-sapporo-s-winter-cityscape-at-dusk-32970318/',
};
const v2Trip = (cover = {}) => ({
  id: TRIP_ID, cover_image: large.url,
  extras: { cover: { v: 2, source: 'pexels', large, small, focusY: 38, credit: pexelsCredit, ...cover } },
  wizard_state: { destination: { name: 'Sapporo', image: 'https://upload.wikimedia.org/x/thumb/a/ab/S.jpg/250px-S.jpg' } },
});

describe('heroCover', () => {
  it('offers the 1280px and large v2 copies with the stored crop and credit', () => {
    expect(heroCover(v2Trip())).toEqual({
      src: small.url,
      srcset: `${small.url} 1280w, ${large.url} 2400w`,
      sizes: HERO_SIZES,
      focusY: 38,
      credit: { text: 'Photo: hujason, Pexels', link: pexelsCredit.link },
      v2: true,
    });
    expect(HERO_SIZES).toBe('(min-width:1024px) 80vw, 100vw');
  });
  it('defaults the crop to 38% (50% for wide images) and works without a small copy', () => {
    expect(heroCover(v2Trip({ focusY: undefined })).focusY).toBe(38);
    const wide = { url: large.url, w: 3840, h: 1300 };
    const hero = heroCover({ ...v2Trip(), extras: { cover: { v: 2, large: wide, small: null } } });
    expect(hero).toMatchObject({ src: large.url, srcset: '', focusY: 50, credit: null });
  });
  it('treats a v2 record that no longer matches cover_image as the user\'s own cover', () => {
    const trip = { ...v2Trip(), cover_image: 'https://example.com/mine.jpg' };
    expect(heroCover(trip)).toMatchObject({ src: 'https://example.com/mine.jpg', srcset: '', v2: false });
  });
  it('shows the plain header (no 250px fallback) when the picker found nothing', () => {
    const trip = { ...v2Trip(), cover_image: '', extras: { cover: { v: 2, none: true, triedAt: '2026-11-14T00:00:00Z' } } };
    expect(heroCover(trip)).toBeNull();
  });
  it('keeps the legacy behaviour for older trips', () => {
    const trip = { ...v2Trip(), cover_image: '', extras: {} };
    expect(heroCover(trip)).toMatchObject({ src: 'https://upload.wikimedia.org/x/thumb/a/ab/S.jpg/1280px-S.jpg', srcset: '', focusY: 50, v2: false });
    expect(heroCover({ wizard_state: {} })).toBeNull();
    const multi = { wizard_state: { multiCity: true, destinations: [{ image: 'https://e.com/a.jpg' }] } };
    expect(heroCover(multi).src).toBe('https://e.com/a.jpg');
  });
  it('never links the credit to a non-http URL', () => {
    const hero = heroCover(v2Trip({ credit: { ...pexelsCredit, link: 'javascript:alert(1)' } }));
    expect(hero.credit).toEqual({ text: 'Photo: hujason, Pexels', link: '' });
  });
});

describe('coverCreditText', () => {
  it('leaves the licence out for Pexels and keeps it for Commons', () => {
    expect(coverCreditText(pexelsCredit)).toBe('Photo: hujason, Pexels');
    expect(coverCreditText({ creator: 'Christopher Crouzet', license: 'CC BY-SA 4.0', via: 'Wikimedia Commons' }))
      .toBe('Photo: Christopher Crouzet, CC BY-SA 4.0, Wikimedia Commons');
    expect(coverCreditText(null)).toBe('');
  });
  it('turns dashes, middle dots and bullets into commas', () => {
    const text = coverCreditText({ creator: 'Ann Lee \u2014 Studio \u00b7 Hanoi \u2022 2015', license: 'CC BY 2.0', via: 'Wikimedia Commons' });
    expect(text).toBe('Photo: Ann Lee, Studio, Hanoi, 2015, CC BY 2.0, Wikimedia Commons');
    expect(text).not.toMatch(FORBIDDEN_GLYPHS);
  });
});

describe('coverNeedsPick', () => {
  it('asks only for an empty cover or the old automatic pick, never a chosen or v2 cover', () => {
    expect(isAutoCoverV1(`${STORE}/cover.jpg`, TRIP_ID)).toBe(true);
    expect(coverNeedsPick({ id: TRIP_ID, cover_image: '' })).toBe(true);
    expect(coverNeedsPick({ id: TRIP_ID, cover_image: `${STORE}/cover.jpg`, extras: {} })).toBe(true);
    expect(coverNeedsPick({ id: TRIP_ID, cover_image: 'https://example.com/mine.jpg' })).toBe(false);
    expect(coverNeedsPick(v2Trip())).toBe(false);
    expect(coverNeedsPick({ id: TRIP_ID, cover_image: '', extras: { cover: { v: 2, none: true } } })).toBe(false);
  });
  it('asks again for a v2 copy whose record was lost (Regenerate Itinerary replaces extras)', () => {
    const orphan = { id: TRIP_ID, cover_image: large.url, extras: { towns: [] } };
    expect(isOrphanCoverV2(orphan)).toBe(true);
    expect(coverNeedsPick(orphan)).toBe(true);
    // Until the new pick arrives the header shows the stored copy as a plain cover.
    expect(heroCover({ ...orphan, wizard_state: {} })).toMatchObject({ src: large.url, srcset: '', v2: false });
    // A record for a different copy does not describe it either.
    expect(coverNeedsPick({ ...v2Trip(), extras: { cover: { ...v2Trip().extras.cover, large: { ...large, url: `${STORE}/cover-v2-2400w-other.jpg` } } } })).toBe(true);
    expect(isOrphanCoverV2(v2Trip())).toBe(false);
    // Another trip's copy counts as chosen.
    expect(coverNeedsPick({ ...orphan, id: 'another-trip' })).toBe(false);
  });
});

describe('listCoverCopies', () => {
  it('returns the v2 copies for a dashboard row whose cover is the v2 large copy', () => {
    expect(listCoverCopies({ cover_image: large.url, cover_small: small, cover_large: large, cover_focus: 30 }))
      .toEqual({ small: { url: small.url, w: 1280 }, large: { url: large.url, w: 2400 }, focusY: 30 });
  });
  it('crops at the picked height, clamped, with the trip page defaults when it is missing', () => {
    const row = { cover_image: large.url, cover_small: small, cover_large: large };
    expect(listCoverCopies(row).focusY).toBe(38);
    expect(listCoverCopies({ ...row, cover_focus: '20' }).focusY).toBe(38);
    expect(listCoverCopies({ ...row, cover_focus: 140 }).focusY).toBe(100);
    const wide = { url: large.url, w: 3840, h: 1300 };
    expect(listCoverCopies({ ...row, cover_large: wide }).focusY).toBe(50);
  });
  it('falls back (null) for older rows, a replaced cover or a missing small copy', () => {
    expect(listCoverCopies({ cover_image: large.url })).toBeNull();
    expect(listCoverCopies({ cover_image: 'https://example.com/mine.jpg', cover_small: small, cover_large: large })).toBeNull();
    expect(listCoverCopies({ cover_image: large.url, cover_small: null, cover_large: large })).toBeNull();
  });
});
