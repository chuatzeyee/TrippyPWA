import { describe, it, expect } from 'vitest';
import { listCover, heroCoverModel, coverChipText, commonsFilePage } from './cover-model.js';
import { conforms, CoverModel } from '../views/fixtures/shape.js';

// Everything here is invented: example hosts, and the public catalogue's Wikimedia thumbnail shape.
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const thumb = (width) => `${COMMONS}/3/3c/Kiyomizu.jpg/${width}px-Kiyomizu.jpg`;
const THUMB = thumb(250);
const FILE_PAGE = 'https://commons.wikimedia.org/wiki/File:Kiyomizu.jpg';
const LARGE = { url: 'https://photos.example.test/trip-photos/t1/cover-v2-2400.jpg', w: 2400, h: 1600 };
const SMALL = { url: 'https://photos.example.test/trip-photos/t1/cover-v2-1280.jpg', w: 1280, h: 853 };
const PEXELS = { via: 'Pexels', link: 'https://www.pexels.com/photo/example-1/', title: 'Lanterns', creator: 'Ana Lima', license: 'Pexels License', creatorUrl: 'https://www.pexels.com/@ana', licenseUrl: 'https://www.pexels.com/license/' };
const COMMONS_CREDIT = { via: 'Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Example.jpg', creator: 'J. Okoro', license: 'CC BY-SA 4.0' };
const NONE = { kind: 'none', src: '', srcset: '', fallbackSrc: '', focusY: 50, credit: null };
const single = (image) => ({ multiCity: false, destination: image === undefined ? null : { name: 'Kyoto', image }, destinations: [] });

const v2Row = (over = {}) => ({
  id: 't1', cover_image: LARGE.url, cover_small: SMALL, cover_large: LARGE, cover_focus: 35, cover_credit: PEXELS, cover_none: null,
  wizard_state: single(THUMB), ...over,
});
const v2Trip = (over = {}, cover = {}) => ({
  id: 't1', cover_image: LARGE.url, wizard_state: single(THUMB),
  extras: { cover: { v: 2, large: LARGE, small: SMALL, focusY: 35, credit: PEXELS, source: 'pexels', ...cover } }, ...over,
});

describe('listCover: a dashboard row', () => {
  it('v2: the small copy, both copies as a srcset, the picked crop and the stored credit', () => {
    expect(listCover(v2Row())).toEqual({
      kind: 'v2',
      src: SMALL.url,
      srcset: `${SMALL.url} 1280w, ${LARGE.url} 2400w`,
      fallbackSrc: '',
      focusY: 35,
      credit: { chip: 'Pexels', full: 'Photo: Ana Lima, Pexels', link: 'https://www.pexels.com/photo/example-1/' },
    });
  });
  it('v2 with one copy: that copy alone, still with its crop and credit', () => {
    expect(listCover(v2Row({ cover_small: null }))).toMatchObject({ kind: 'v2', src: LARGE.url, srcset: '', focusY: 35, credit: { chip: 'Pexels' } });
    expect(listCover(v2Row({ cover_small: { ...SMALL, w: 2400 } }))).toMatchObject({ kind: 'v2', src: LARGE.url, srcset: '' });
  });
  it('v2 without a stored crop: 38 for a normal photo, 50 for a panorama', () => {
    expect(listCover(v2Row({ cover_focus: null })).focusY).toBe(38);
    expect(listCover(v2Row({ cover_focus: undefined, cover_large: { ...LARGE, h: 1000 } })).focusY).toBe(50);
    expect(listCover(v2Row({ cover_focus: 140 })).focusY).toBe(100);
  });
  it('v2 without a credit has none', () => {
    expect(listCover(v2Row({ cover_credit: null })).credit).toBeNull();
    expect(listCover(v2Row({ cover_credit: {} })).credit).toBeNull();
  });
  it('a cover the traveller chose over the picked one is not described by the old record', () => {
    const own = 'https://photos.example.test/uploads/mine.jpg';
    expect(listCover(v2Row({ cover_image: own }))).toEqual({ kind: 'legacy', src: own, srcset: '', fallbackSrc: '', focusY: 50, credit: null });
  });
  it('legacy: a Wikimedia thumbnail is offered at three widths, with the original to fall back to', () => {
    expect(listCover({ id: 't2', cover_image: THUMB, wizard_state: single(undefined) })).toEqual({
      kind: 'legacy',
      src: thumb(500),
      srcset: `${thumb(500)} 500w, ${thumb(960)} 960w, ${thumb(1280)} 1280w`,
      fallbackSrc: THUMB,
      focusY: 50,
      credit: { chip: 'Wikimedia Commons', full: 'Photo: Wikimedia Commons', link: FILE_PAGE },
    });
  });
  it('legacy: any other address is used as it is, with no credit to show', () => {
    const v1 = 'https://storage.example.test/storage/v1/object/public/trip-photos/t3/cover.jpg';
    expect(listCover({ id: 't3', cover_image: v1, wizard_state: single(THUMB) })).toEqual({ kind: 'legacy', src: v1, srcset: '', fallbackSrc: '', focusY: 50, credit: null });
  });
  it('catalogue fallback: no cover of its own, so the first destination image', () => {
    expect(listCover({ id: 't4', cover_image: null, wizard_state: single(THUMB) })).toMatchObject({ kind: 'legacy', src: thumb(500), fallbackSrc: THUMB });
    const multi = { multiCity: true, destination: { image: 'https://photos.example.test/not-this.jpg' }, destinations: [{ name: 'Oslo', image: THUMB }, { name: 'Bergen', image: 'https://photos.example.test/nor-this.jpg' }] };
    expect(listCover({ id: 't5', cover_image: '', wizard_state: multi })).toMatchObject({ kind: 'legacy', src: thumb(500) });
  });
  it('none: nothing stored and no destination image', () => {
    expect(listCover({ id: 't6', cover_image: '', wizard_state: single(undefined) })).toEqual(NONE);
    expect(listCover({ id: 't6', cover_image: null, wizard_state: single('') })).toEqual(NONE);
    expect(listCover({ id: 't6' })).toEqual(NONE);
    expect(listCover(null)).toEqual(NONE);
    expect(listCover(undefined)).toEqual(NONE);
  });
  it('none: the picker found nothing good, so the 250 px destination thumbnail is not used either', () => {
    expect(listCover({ id: 't7', cover_image: '', cover_none: true, wizard_state: single(THUMB) })).toEqual(NONE);
  });
  it('a cover set after the picker said none still shows', () => {
    expect(listCover({ id: 't7', cover_image: THUMB, cover_none: true, wizard_state: single(undefined) }).kind).toBe('legacy');
  });
  it('unsafe addresses are dropped', () => {
    expect(listCover({ id: 't8', cover_image: 'javascript:alert(1)', wizard_state: single(THUMB) })).toMatchObject({ kind: 'legacy', src: thumb(500) });
    expect(listCover({ id: 't8', cover_image: 'javascript:alert(1)', wizard_state: single('data:image/png;base64,AAAA') })).toEqual(NONE);
    expect(listCover({ id: 't8', cover_image: 'javascript:alert(1)', cover_none: true, wizard_state: single(THUMB) })).toEqual(NONE);
    expect(listCover({ id: 't8', cover_image: '', wizard_state: single('//no-scheme.example.test/a.jpg') })).toEqual(NONE);
    expect(listCover(v2Row({ cover_credit: { ...PEXELS, link: 'javascript:alert(1)' } })).credit).toEqual({ chip: 'Pexels', full: 'Photo: Ana Lima, Pexels', link: '' });
  });
  it('an address cannot break out of an attribute or a srcset', () => {
    const odd = "https://photos.example.test/a b's (1).jpg";
    const cover = listCover({ id: 't9', cover_image: odd, wizard_state: single(undefined) });
    expect(cover.src).toBe('https://photos.example.test/a%20b%27s%20%281%29.jpg');
    const large = { ...LARGE, url: 'https://photos.example.test/big one.jpg' };
    const small = { ...SMALL, url: 'https://photos.example.test/small one.jpg' };
    expect(listCover(v2Row({ cover_image: large.url, cover_large: large, cover_small: small })).srcset)
      .toBe('https://photos.example.test/small%20one.jpg 1280w, https://photos.example.test/big%20one.jpg 2400w');
  });
  it('has exactly the fields of the contract, whatever the kind', () => {
    const covers = [listCover(v2Row()), listCover(v2Row({ cover_credit: null })), listCover({ id: 't2', cover_image: THUMB }), listCover(null), heroCoverModel(v2Trip())];
    for (const cover of covers) expect(conforms(cover, CoverModel)).toEqual([]);
  });
  it('does not change the row', () => {
    const row = Object.freeze(v2Row({ wizard_state: Object.freeze(single(THUMB)), cover_large: Object.freeze({ ...LARGE }) }));
    expect(() => listCover(row)).not.toThrow();
  });
});

describe('heroCoverModel: a full trip', () => {
  it('v2: as the trip page hero picks it', () => {
    expect(heroCoverModel(v2Trip())).toEqual({
      kind: 'v2',
      src: SMALL.url,
      srcset: `${SMALL.url} 1280w, ${LARGE.url} 2400w`,
      fallbackSrc: '',
      focusY: 35,
      credit: { chip: 'Pexels', full: 'Photo: Ana Lima, Pexels', link: 'https://www.pexels.com/photo/example-1/' },
    });
  });
  it('v2 with a Commons credit: the chip is the short source, the full line keeps the licence', () => {
    expect(heroCoverModel(v2Trip({}, { credit: COMMONS_CREDIT })).credit).toEqual({
      chip: 'Wikimedia Commons', full: 'Photo: J. Okoro, CC BY-SA 4.0, Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    });
  });
  it('gives the same description as the list row of the same plan', () => {
    expect(heroCoverModel(v2Trip())).toEqual(listCover(v2Row()));
  });
  it('legacy: one wider render, with the original to fall back to', () => {
    expect(heroCoverModel({ id: 't2', cover_image: THUMB, wizard_state: single(undefined), extras: {} })).toEqual({
      kind: 'legacy', src: thumb(1280), srcset: '', fallbackSrc: THUMB, focusY: 50,
      credit: { chip: 'Wikimedia Commons', full: 'Photo: Wikimedia Commons', link: FILE_PAGE },
    });
  });
  it('legacy: a 1280 px thumbnail needs no fallback', () => {
    expect(heroCoverModel({ id: 't2', cover_image: thumb(1280), wizard_state: single(undefined) })).toMatchObject({ src: thumb(1280), fallbackSrc: '' });
  });
  it('catalogue fallback, and none', () => {
    expect(heroCoverModel({ id: 't4', cover_image: '', wizard_state: single(THUMB) })).toMatchObject({ kind: 'legacy', src: thumb(1280) });
    expect(heroCoverModel({ id: 't6', cover_image: '', wizard_state: single(undefined) })).toEqual(NONE);
    expect(heroCoverModel({ id: 't7', cover_image: '', wizard_state: single(THUMB), extras: { cover: { v: 2, none: true } } })).toEqual(NONE);
    expect(heroCoverModel(null)).toEqual(NONE);
  });
  it('a record that no longer matches the cover is not used', () => {
    const own = 'https://photos.example.test/uploads/mine.jpg';
    expect(heroCoverModel(v2Trip({ cover_image: own }))).toEqual({ kind: 'legacy', src: own, srcset: '', fallbackSrc: '', focusY: 50, credit: null });
  });
  it('unsafe addresses are dropped', () => {
    expect(heroCoverModel({ id: 't8', cover_image: 'javascript:alert(1)', wizard_state: single(undefined) })).toEqual(NONE);
    const bad = { ...LARGE, url: 'javascript:alert(1)' };
    expect(heroCoverModel(v2Trip({ cover_image: bad.url }, { large: bad }))).toMatchObject({ kind: 'legacy', src: thumb(1280) });
  });
});

describe('coverChipText', () => {
  it('is the short source only', () => {
    expect(coverChipText(PEXELS)).toBe('Pexels');
    expect(coverChipText(COMMONS_CREDIT)).toBe('Wikimedia Commons');
    expect(coverChipText({ via: '  Unsplash ' })).toBe('Unsplash');
  });
  it('reads the source from the link when the credit does not name one', () => {
    expect(coverChipText({ creator: 'A', link: 'https://commons.wikimedia.org/wiki/File:X.jpg' })).toBe('Wikimedia Commons');
    expect(coverChipText({ creator: 'A', link: 'https://en.wikipedia.org/wiki/File:X.jpg' })).toBe('Wikipedia');
    expect(coverChipText({ creator: 'A', link: 'https://www.pexels.com/photo/1/' })).toBe('Pexels');
  });
  it('says "Photo credit" when all it has is a name or a licence', () => {
    expect(coverChipText({ creator: 'Ana Lima' })).toBe('Photo credit');
    expect(coverChipText({ license: 'CC BY 4.0', link: 'https://photos.example.test/1' })).toBe('Photo credit');
  });
  it('is empty for no credit', () => {
    expect(coverChipText(null)).toBe('');
    expect(coverChipText(undefined)).toBe('');
    expect(coverChipText({})).toBe('');
    expect(coverChipText('Pexels')).toBe('');
  });
  it('holds no dash, dot or bullet glyph', () => {
    expect(coverChipText({ via: 'Wikimedia \u2013 Commons \u00b7 Images' })).toBe('Wikimedia, Commons, Images');
  });
});

describe('commonsFilePage', () => {
  it('finds the file page behind a thumbnail address', () => {
    expect(commonsFilePage(THUMB)).toBe(FILE_PAGE);
    expect(commonsFilePage(thumb(1280))).toBe(FILE_PAGE);
    expect(commonsFilePage(`${COMMONS}/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/250px-Lisboa_-_Portugal_%2852597836992%29.jpg`))
      .toBe('https://commons.wikimedia.org/wiki/File:Lisboa_-_Portugal_%2852597836992%29.jpg');
  });
  it('uses the file name, not the name of the render (an SVG is rendered as PNG)', () => {
    expect(commonsFilePage(`${COMMONS}/a/a1/Map.svg/250px-Map.svg.png`)).toBe('https://commons.wikimedia.org/wiki/File:Map.svg');
  });
  it('finds the file page behind a full-size address', () => {
    expect(commonsFilePage('https://upload.wikimedia.org/wikipedia/commons/3/3c/Kiyomizu.jpg')).toBe(FILE_PAGE);
  });
  it('a file kept on one Wikipedia links to that Wikipedia', () => {
    expect(commonsFilePage('https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/250px-Burj_Khalifa_2021.jpg'))
      .toBe('https://en.wikipedia.org/wiki/File:Burj_Khalifa_2021.jpg');
    const cover = listCover({ id: 't', cover_image: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/250px-Burj_Khalifa_2021.jpg' });
    expect(cover.credit).toEqual({ chip: 'Wikipedia', full: 'Photo: Wikipedia', link: 'https://en.wikipedia.org/wiki/File:Burj_Khalifa_2021.jpg' });
  });
  it('is empty for anything else', () => {
    expect(commonsFilePage('')).toBe('');
    expect(commonsFilePage(null)).toBe('');
    expect(commonsFilePage(undefined)).toBe('');
    expect(commonsFilePage('https://photos.example.test/250px-a.jpg')).toBe('');
    expect(commonsFilePage('https://upload.wikimedia.org/')).toBe('');
    expect(commonsFilePage('https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/')).toBe('');
    expect(commonsFilePage('https://upload.wikimedia.org.evil.example.test/wikipedia/commons/3/3c/Kiyomizu.jpg')).toBe('');
    expect(commonsFilePage('javascript:alert(1)')).toBe('');
    expect(commonsFilePage('not an address')).toBe('');
  });
});
