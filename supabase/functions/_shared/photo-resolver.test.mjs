import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeName, nameMatches, isOpenLicense, extractOgImage, imageDims, isHeroShaped, isOfficialSite, splitVenueName, snapWidth, looksLikePhoto, isDistinctiveName, blockedUrlReason, readCapped,
  resolvesToBlockedIp, canCheckDns,
  // trip cover (cover-rank.mjs / cover-judge.mjs, re-exported)
  tripMonth, tripSeason, photoMonth, coverContext, coverLandmarks, pexelsQueries, commonsQueries, parsePexelsSearch, pexelsSlug,
  pexelsRelevant, foreignPlaceNames, rankCoverCandidates, parseCommonsFiles, commonsRelevant, parseCommonsSearch, commonsCandidate,
  parseWikidataCity, parseLeadImage, wikidataCandidates, fileTitle, coverGateReason, scoreCover, coverSizes, wikiThumbUrl,
  coverFocusY, coverRecord, noCoverRecord, isAutoCoverV1, isAutoCoverV2, isOrphanCoverV2, coverNeedsPick, coverCopyPath,
  mergeCoverExtras, judgeSet, judgeThumbUrl,
  parseJudgeReply, applyJudge, judgePrompt, isCoverHost, readPexelsQuota, pexelsAllowed,
} from './photo-resolver.mjs';

describe('normalizeName / nameMatches', () => {
  it('normalises case, accents, punctuation and full-width characters', () => {
    expect(normalizeName('  Café  Tirol! ')).toBe('cafe tirol');
    expect(normalizeName('ＭＯＲＩＨＩＫＯ')).toBe('morihiko');
  });
  it('matches when a name variant appears in the title', () => {
    expect(nameMatches('Sushi Nemuro Hanamaru Tokei Dai (184517525).jpeg', ['Nemuro Hanamaru'])).toBe(true);
    expect(nameMatches('定山渓鶴雅リゾートスパ 森の謌', ['Mori no Uta', '森の謌'])).toBe(true);
  });
  it('rejects unrelated titles and too-short names', () => {
    expect(nameMatches('Cafe DxM.', ['Morihiko'])).toBe(false);
    expect(nameMatches('To what extent do human-altered landscapes retain', ['Bar Yamazaki'])).toBe(false);
    expect(nameMatches('Bar', ['Bar'])).toBe(false); // too generic to trust
  });
});

describe('isOpenLicense', () => {
  it('allows only licences usable without non-commercial or no-derivatives limits', () => {
    for (const l of ['cc0', 'pdm', 'by', 'by-sa', 'CC BY-SA 4.0', 'CC BY 2.0', 'Public domain', 'CC0']) expect(isOpenLicense(l)).toBe(true);
    for (const l of ['by-nc', 'by-nc-nd', 'by-nd', 'CC BY-NC-SA 2.0', '', undefined]) expect(isOpenLicense(l)).toBe(false);
  });
});

describe('extractOgImage', () => {
  it('reads og:image in either attribute order and resolves relative URLs', () => {
    expect(extractOgImage('<meta property="og:image" content="/img/hero.jpg">', 'https://x.jp/en/')).toBe('https://x.jp/img/hero.jpg');
    expect(extractOgImage("<meta content='https://cdn.x.jp/a.jpg' property='og:image' />", 'https://x.jp')).toBe('https://cdn.x.jp/a.jpg');
  });
  it('falls back to twitter:image and returns null when absent', () => {
    expect(extractOgImage('<meta name="twitter:image" content="https://x.jp/t.jpg">', 'https://x.jp')).toBe('https://x.jp/t.jpg');
    expect(extractOgImage('<html></html>', 'https://x.jp')).toBeNull();
  });
});

describe('imageDims', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0, 0, 0x04, 0xb0], 16); // width 1200
    png.set([0, 0, 0x02, 0x76], 20); // height 630
    expect(imageDims(png)).toEqual({ width: 1200, height: 630 });
  });
  it('reads JPEG dimensions from the SOF marker', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0]);
    expect(imageDims(jpg)).toEqual({ width: 1200, height: 630 });
  });
  it('returns null for unknown data', () => {
    expect(imageDims(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('isHeroShaped', () => {
  it('accepts large landscape photos and rejects logos, squares and tiny images', () => {
    expect(isHeroShaped({ width: 1200, height: 630 }, 'https://x.jp/og.jpg')).toBe(true);
    expect(isHeroShaped({ width: 1200, height: 630 }, 'https://x.jp/assets/logo-ogp.png')).toBe(false);
    expect(isHeroShaped({ width: 800, height: 800 }, 'https://x.jp/a.jpg')).toBe(false);
    expect(isHeroShaped({ width: 400, height: 210 }, 'https://x.jp/a.jpg')).toBe(false);
    expect(isHeroShaped(null, 'https://x.jp/a.jpg')).toBe(false);
  });
});

describe('isOfficialSite', () => {
  it('rejects booking platforms and review sites, accepts venue domains', () => {
    expect(isOfficialSite('https://www.morino-uta.com/en/')).toBe(true);
    for (const u of ['https://www.booking.com/x', 'https://www.agoda.com/x', 'https://tabelog.com/x', 'https://www.klook.com/x',
      'https://travel.rakuten.co.jp/x', 'https://www.flyscoot.com/en', 'https://www.google.com/maps', 'javascript:alert(1)', '']) {
      expect(isOfficialSite(u)).toBe(false);
    }
  });
});

describe('splitVenueName', () => {
  it('pulls the actual place name out of "name, location" style venues', () => {
    expect(splitVenueName('Nemuro Hanamaru, Stellar Place')).toEqual({ primary: 'Nemuro Hanamaru', variants: ['Nemuro Hanamaru, Stellar Place', 'Nemuro Hanamaru'] });
    expect(splitVenueName('Suage+ or Garaku').primary).toBe('Suage+');
    expect(splitVenueName('Fresh Air · Beat Records').primary).toBe('Fresh Air');
    expect(splitVenueName('Hokkaido Museum (SIAF)').primary).toBe('Hokkaido Museum');
  });
  it('leaves simple names alone', () => {
    expect(splitVenueName('Moerenuma Park')).toEqual({ primary: 'Moerenuma Park', variants: ['Moerenuma Park'] });
  });
});

describe('snapWidth', () => {
  it('snaps to Wikimedia standard thumbnail widths', () => {
    expect(snapWidth(1024)).toBe(960);
    expect(snapWidth(600)).toBe(500);
    expect(snapWidth(1280)).toBe(1280);
    expect(snapWidth(2000)).toBe(1920);
    expect(snapWidth(100)).toBe(330);
  });
});

describe('looksLikePhoto', () => {
  // Calibrated on real resolver output: photos 0.15-0.45 B/px (JPEG); banners/flags far lower.
  it('accepts real photos', () => {
    expect(looksLikePhoto({ width: 960, height: 540 }, 158 * 1024, 'image/jpeg')).toBe(true);
    expect(looksLikePhoto({ width: 1024, height: 576 }, 90 * 1024, 'image/jpeg')).toBe(true); // dark interior
    expect(looksLikePhoto({ width: 1200, height: 630 }, 452 * 1024, 'image/png')).toBe(true);  // aerial photo as PNG
  });
  it('rejects flat graphics, tiny files and small images', () => {
    expect(looksLikePhoto({ width: 1200, height: 630 }, 76 * 1024, 'image/png')).toBe(false);  // festival banner
    expect(looksLikePhoto({ width: 960, height: 480 }, 2 * 1024, 'image/png')).toBe(false);    // flag
    expect(looksLikePhoto({ width: 500, height: 375 }, 23 * 1024, 'image/jpeg')).toBe(false);  // small thumb
    expect(looksLikePhoto(null, 200 * 1024, 'image/jpeg')).toBe(false);
  });
});

describe('isDistinctiveName', () => {
  it('treats multi-word and long CJK names as distinctive, single common words not', () => {
    expect(isDistinctiveName('Kitaichi Hall')).toBe(true);
    expect(isDistinctiveName('OMO7 Asahikawa')).toBe(true);
    expect(isDistinctiveName('森の謌')).toBe(true);
    expect(isDistinctiveName('Daruma')).toBe(false);
    expect(isDistinctiveName('Jamaica')).toBe(false);
    expect(isDistinctiveName('Bossa')).toBe(false);
  });
});

describe('blockedUrlReason (SSRF guard)', () => {
  it('blocks internal, loopback, link-local, private and metadata targets', () => {
    for (const u of [
      'http://127.0.0.1/', 'http://localhost/x', 'http://foo.localhost/', 'http://10.1.2.3/', 'http://172.16.5.4/', 'http://192.168.0.1/',
      'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://2130706433/', 'http://0x7f000001/',
      'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://metadata.google.internal/', 'http://intranet/',
      'http://kong:8000/', 'https://example.com:8443/', 'file:///etc/passwd', 'ftp://example.com/', 'not a url',
    ]) expect(blockedUrlReason(u), u).not.toBeNull();
  });
  it('allows ordinary public websites on standard ports', () => {
    for (const u of ['https://www.morino-uta.com/en/', 'http://example.jp/a.jpg', 'https://upload.wikimedia.org/x.jpg', 'https://8.8.8.8/'])
      expect(blockedUrlReason(u), u).toBeNull();
  });
});

describe('resolvesToBlockedIp (SSRF guard, DNS)', () => {
  // Fake Deno.resolveDns: answers per record type; missing type = lookup error.
  const dns = (table) => async (host, type) => {
    const rec = table[host]?.[type];
    if (!rec) throw new Error(`no ${type} record`);
    return rec;
  };
  const resolver = dns({
    'public.example': { A: ['93.184.216.34'], AAAA: ['2606:2800:220:1:248:1893:25c8:1946'] },
    'v4only.example': { A: ['151.101.1.69'] },
    'v6only.example': { AAAA: ['2a02:ec80:600:ed1a::2:b'] },
    'rebind.example': { A: ['8.8.8.8', '169.254.169.254'] },
    'loop6.example': { A: ['8.8.8.8'], AAAA: ['::1'] },
    'ula.example': { AAAA: ['fd12:3456::1'] },
    'mapped.example': { AAAA: ['::ffff:10.0.0.1'] },
    'nat64.example': { AAAA: ['64:ff9b::a9fe:a9fe'] },
    'sixtofour.example': { AAAA: ['2002:a9fe:a9fe::1'] },
    'linklocal.example': { AAAA: ['fe80::1'] },
  });

  it('fails closed when no resolver is available', async () => {
    expect(canCheckDns(undefined)).toBe(false);
    expect(await resolvesToBlockedIp('public.example', undefined)).toBe(true);
  });
  it('fails closed when the name does not resolve or the resolver throws', async () => {
    expect(await resolvesToBlockedIp('nxdomain.example', resolver)).toBe(true);
    expect(await resolvesToBlockedIp('public.example', () => { throw new Error('boom'); })).toBe(true);
  });
  it('allows public dual-stack, IPv4-only and IPv6-only hosts', async () => {
    expect(canCheckDns(resolver)).toBe(true);
    for (const host of ['public.example', 'v4only.example', 'v6only.example']) {
      expect(await resolvesToBlockedIp(host, resolver), host).toBe(false);
    }
  });
  it('blocks when any answer is internal, including IPv6 forms of internal space', async () => {
    for (const host of ['rebind.example', 'loop6.example', 'ula.example', 'mapped.example', 'nat64.example', 'sixtofour.example', 'linklocal.example']) {
      expect(await resolvesToBlockedIp(host, resolver), host).toBe(true);
    }
  });
  it('checks IPv4 literals directly', async () => {
    expect(await resolvesToBlockedIp('8.8.8.8', undefined)).toBe(false);
    expect(await resolvesToBlockedIp('10.0.0.1', undefined)).toBe(true);
  });
});

describe('readCapped', () => {
  it('returns the bytes when under the cap and null when over', async () => {
    const res = (n) => new Response(new Uint8Array(n));
    expect((await readCapped(res(100), 1000)).byteLength).toBe(100);
    expect(await readCapped(res(5000), 1000)).toBeNull();
  });
});

// ================================================================ trip cover
// Fixtures in ./fixtures/cover are real API responses (trimmed): Commons search
// and file details, Wikidata wbgetentities, page lead images. The Pexels ones
// are /v1/search-shaped, built from Pexels' own search data for the same queries.

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/cover/${name}.json`, import.meta.url), 'utf8'));
const SAPPORO = { name: 'Sapporo', lat: 43.0618, lng: 141.3545, country: 'Japan', flag: 'jp' };
const HANOI = { name: 'Hanoi', lat: 21.0278, lng: 105.8342, country: 'Vietnam', flag: 'vn' };
const MELBOURNE = { name: 'Melbourne', lat: -37.8136, lng: 144.9631, country: 'Australia', flag: 'au' };
const CAMBRIDGE = { name: 'Cambridge', lat: 52.2053, lng: 0.1218, country: 'United Kingdom', flag: 'gb' };
const sapporoJan = () => coverContext({ dest: SAPPORO, startDate: '2027-01-13', endDate: '2027-01-26' });
const hanoiDec = () => coverContext({ dest: HANOI, startDate: '2026-12-01', endDate: '2026-12-08' });
const melbourneMay = () => coverContext({ dest: MELBOURNE, startDate: '2026-05-25', endDate: '2026-06-03' });

function pexelsPool(ctx, ...files) {
  return files.flatMap(([file, query]) => parsePexelsSearch(fixture(file), { query })).filter((c) => pexelsRelevant(c, ctx));
}

describe('tripMonth / tripSeason / photoMonth', () => {
  it('takes the month of the middle of the trip', () => {
    expect(tripMonth('2027-01-13', '2027-01-26')).toBe(1);
    expect(tripMonth('2027-01-25', '2027-02-10')).toBe(2);
    expect(tripMonth('2026-05-25', '')).toBe(5);
    expect(tripMonth('', '')).toBeNull();
  });
  it('flips seasons south of the equator and has none in the tropics', () => {
    expect(tripSeason(1, 43.06)).toBe('winter');
    expect(tripSeason(7, 43.59)).toBe('summer');
    expect(tripSeason(5, -37.81)).toBe('autumn');
    expect(tripSeason(12, 21.03)).toBe('none');
    expect(tripSeason(null, 43)).toBe('none');
    expect(sapporoJan().season).toBe('winter');
    expect(melbourneMay().season).toBe('autumn');
    expect(hanoiDec().season).toBe('none');
  });
  it('reads the month from Commons DateTimeOriginal in its several forms', () => {
    expect(photoMonth('2013-07-11 20:12:02')).toBe(7);
    expect(photoMonth('2009-01-12')).toBe(1);
    expect(photoMonth('Taken on 12 June 2012')).toBe(6);
    expect(photoMonth('12 October 2009 (according to Exif data)')).toBe(10);
    expect(photoMonth('')).toBeNull();
  });
});

describe('cover queries and landmarks', () => {
  it('searches Pexels for the name, then the season (or skyline/landscape in the tropics)', () => {
    expect(pexelsQueries(sapporoJan())).toEqual(['Sapporo', 'Sapporo winter']);
    expect(pexelsQueries({ ...hanoiDec(), population: 8_000_000 })).toEqual(['Hanoi', 'Hanoi skyline']);
    expect(pexelsQueries({ ...hanoiDec(), name: 'Ninh Binh', population: 100_000 })).toEqual(['Ninh Binh', 'Ninh Binh landscape']);
  });
  it('builds Commons searches with the name quoted and quotes stripped from it', () => {
    const q = commonsQueries({ name: 'Ninh "Binh"', landmarks: ['Tam Coc'] });
    expect(q.assessed).toBe('"Ninh Binh" filew:>1919 filemime:image/jpeg incategory:Featured_pictures_on_Wikimedia_Commons|Quality_images|Valued_images_sorted_by_promotion_date');
    expect(q.scenic).toMatch(/^"Ninh Binh" panorama OR skyline OR cityscape OR view filew:>1919/);
    expect(q.landmarks).toEqual(['"Tam Coc" filew:>1919 filemime:image/jpeg']);
  });
  it('takes the first two sightseeing or nature venues in the destination', () => {
    const acts = [
      { venue_name: 'Sapporo Clock Tower', category: 'sightseeing', latitude: 43.0625, longitude: 141.3536 },
      { venue_name: 'Ramen Alley', category: 'food', latitude: 43.055, longitude: 141.353 },
      { venue_name: 'Otaru Canal', category: 'sightseeing', latitude: 43.199, longitude: 140.994 }, // 32 km away
      { venue_name: 'Moerenuma Park', category: 'park', venue_address: 'Higashi Ward, Sapporo' },
      { venue_name: 'Mt. Moiwa', category: 'nature', latitude: 43.022, longitude: 141.322 },
    ];
    expect(coverLandmarks(acts, SAPPORO)).toEqual(['Sapporo Clock Tower', 'Moerenuma Park']);
  });
});

describe('Pexels candidates and relevance', () => {
  it('parses /v1/search into candidates with credit, colour and the slug', () => {
    const [first] = parsePexelsSearch(fixture('pexels-sapporo'), { query: 'Sapporo' });
    expect(first).toMatchObject({
      key: 'pexels:32970318', source: 'pexels', sourceId: '32970318', base: 40, rank: 0, w: 5616, h: 3744,
      mime: 'image/jpeg', license: 'Pexels License', rgb: [99, 125, 152],
      slug: 'aerial-view-of-sapporo-s-winter-cityscape-at-dusk',
      original: 'https://images.pexels.com/photos/32970318/pexels-photo-32970318.jpeg',
    });
    expect(first.credit).toMatchObject({ creator: 'hujason', via: 'Pexels', link: 'https://www.pexels.com/photo/aerial-view-of-sapporo-s-winter-cityscape-at-dusk-32970318/' });
    expect(pexelsSlug('https://www.pexels.com/photo/city-on-sea-coast-17091319/')).toBe('city-on-sea-coast');
  });
  it('rejects a Hakodate photo that Pexels returns for "Sapporo" (the caption never names Sapporo)', () => {
    const ctx = sapporoJan();
    const all = parsePexelsSearch(fixture('pexels-sapporo'), { query: 'Sapporo' });
    const hakodate = all.find((c) => c.sourceId === '17091319');
    expect(hakodate.alt).toMatch(/snow-covered coastal city/);
    expect(pexelsRelevant(hakodate, ctx)).toBe(false);
    expect(pexelsRelevant(all.find((c) => c.sourceId === '32970318'), ctx)).toBe(true);
    // An Otaru warehouse that Pexels also tags Sapporo
    expect(pexelsRelevant(all.find((c) => c.sourceId === '40846163'), ctx)).toBe(false);
  });
  it('rejects "near/from <city>" captions and captions naming another country', () => {
    const ctx = melbourneMay();
    expect(pexelsRelevant({ alt: 'Beach huts on a day trip from Melbourne', slug: 'beach-huts' }, ctx)).toBe(false);
    expect(pexelsRelevant({ alt: 'Vineyards near Melbourne', slug: 'vineyards' }, ctx)).toBe(false);
    expect(pexelsRelevant({ alt: 'Sunset over the river in Melbourne, Florida', slug: 'sunset-river' }, ctx)).toBe(false);
    expect(pexelsRelevant({ alt: 'Melbourne skyline from Southbank, Victoria, Australia', slug: 'melbourne-skyline' }, ctx)).toBe(true);
  });
  it('folds accents and needs the country beside very short names', () => {
    expect(pexelsRelevant({ alt: 'Boats in Ninh Bình, Vietnam', slug: 'boats' }, { names: ['Ninh Binh'], country: 'Vietnam' })).toBe(true);
    expect(pexelsRelevant({ alt: 'Ninh Binh karst', slug: 'scenic-view-of-limestone-mountains-in-ninh-binh' }, { names: ['Ninh Binh'], country: '' })).toBe(true);
    expect(pexelsRelevant({ alt: 'A warm hue over the hills', slug: 'hills' }, { names: ['Hue'], country: 'Vietnam' })).toBe(false);
    expect(pexelsRelevant({ alt: 'Citadel walls in Hue, Vietnam', slug: 'citadel' }, { names: ['Hue'], country: 'Vietnam' })).toBe(true);
  });
  it('only treats other countries as foreign when the trip country is known', () => {
    expect(foreignPlaceNames('', ['Sapporo'])).toEqual([]);
    expect(foreignPlaceNames('Australia', ['Melbourne'])).toContain('florida');
    expect(foreignPlaceNames('Australia', ['Melbourne'])).not.toContain('australia');
    expect(foreignPlaceNames('Viet Nam', ['Hanoi'])).not.toContain('vietnam');
  });
});

describe('rankCoverCandidates on Pexels results', () => {
  it('picks the aerial winter dusk view for Sapporo in January (score 77)', () => {
    const ctx = sapporoJan();
    const ranked = rankCoverCandidates(pexelsPool(ctx, ['pexels-sapporo', 'Sapporo'], ['pexels-sapporo-winter', 'Sapporo winter']), ctx);
    expect(ranked[0].sourceId).toBe('32970318');
    expect(ranked[0].score).toBe(77);
    expect(ranked[0].why).toBe('base 40, scenic +25, width +6, season +6');
    expect(ranked[1].score).toBeLessThan(55);
    expect(new Set(ranked.map((c) => c.key)).size).toBe(ranked.length); // the photo in both queries counts once
  });
  it('prefers the Hanoi sunset to the washed-out skyline through branches', () => {
    const ctx = hanoiDec();
    const ranked = rankCoverCandidates(pexelsPool(ctx, ['pexels-hanoi', 'Hanoi'], ['pexels-hanoi-winter', 'Hanoi winter']), ctx);
    expect(ranked[0].sourceId).toBe('18836392');
    const hazy = ranked.find((c) => c.sourceId === '20498719');
    expect(hazy.why).toContain('washed-out -10');
    expect(ranked.indexOf(hazy)).toBeGreaterThan(0);
  });
  it('does not let the season query push Melbourne to the autumn-gardens shot', () => {
    const ctx = melbourneMay();
    const ranked = rankCoverCandidates(pexelsPool(ctx, ['pexels-melbourne', 'Melbourne'], ['pexels-melbourne-autumn', 'Melbourne autumn']), ctx);
    expect(ranked[0].sourceId).toBe('8436835');
    expect(ranked.findIndex((c) => c.sourceId === '26362393')).toBeGreaterThan(2);
  });
});

describe('Commons Featured/Quality/Valued search', () => {
  it('rejects false hits: a ship named MAERSK HANOI in Slovenia, a moth in Toulouse, a scroll painting', () => {
    const ctx = { ...hanoiDec(), names: ['Hanoi', 'Hà Nội'] };
    const files = parseCommonsFiles(fixture('commons-hanoi-assessed'));
    const byTitle = (t) => files.find((f) => f.title.startsWith(t));
    const maersk = byTitle('File:MAERSK HANOI');
    expect(maersk.coord).toEqual({ lat: 45.552036, lon: 13.734505 });
    expect(commonsRelevant(maersk, ctx)).toBe(false);
    expect(commonsRelevant(byTitle('File:Macroglossum'), ctx)).toBe(false);
    expect(commonsRelevant(byTitle('File:The Mahasattva'), ctx)).toBe(false);
    expect(commonsRelevant(byTitle('File:Noibai T2 gates'), ctx)).toBe(false); // near, but never says Hanoi
    expect(commonsRelevant(byTitle('File:Sunset over Hanoi'), ctx)).toBe(true);
  });
  it('scores the Featured sunset panorama first for Hanoi', () => {
    const ctx = hanoiDec();
    const cands = parseCommonsSearch(fixture('commons-hanoi-assessed'), ctx);
    expect(cands.some((c) => /MAERSK/.test(c.title))).toBe(false);
    const ranked = rankCoverCandidates(cands, ctx);
    expect(ranked[0]).toMatchObject({ title: 'Sunset over Hanoi After the Rain', role: 'featured', base: 45, score: 71 });
    expect(ranked[0].credit).toMatchObject({ creator: 'Christopher Crouzet', license: 'CC BY-SA 4.0', via: 'Wikimedia Commons' });
    expect(ranked.some((c) => /Shrine-at/.test(c.title))).toBe(false); // portrait, fails the shape gate
  });
  it('needs a geotag near the city when no Wikidata item confirmed it', () => {
    const ctx = hanoiDec();
    const cands = parseCommonsSearch(fixture('commons-hanoi-assessed'), ctx, { requireGeotag: true });
    expect(cands.map((c) => c.title)).toEqual(['Sunset over Hanoi After the Rain']);
  });
  it('rejects a city-named file geotagged in another city of the same name (Cambridge, Massachusetts)', () => {
    const ctx = coverContext({ dest: CAMBRIDGE, startDate: '2027-04-10', endDate: '2027-04-14' });
    const json = fixture('commons-cambridge-assessed');
    // A colimit=max response: every geotag of the batch came back.
    expect(json.continue).not.toHaveProperty('cocontinue');
    const files = parseCommonsFiles(json);
    const skyline = files.find((f) => f.title === 'File:Cambridge skyline November 2016 panorama.jpg');
    expect(skyline.coord).toEqual({ lat: 42.352361, lon: -71.09002 });
    expect(commonsRelevant(skyline, ctx)).toBe(false);
    // Only the geotag rejects it: with the geotag cut off it passes on its title.
    expect(commonsRelevant({ ...skyline, coord: null }, ctx)).toBe(true);
    const ranked = rankCoverCandidates(parseCommonsSearch(json, ctx), ctx);
    expect(ranked.some((c) => /skyline/.test(c.title))).toBe(false);
    expect(ranked[0].title).toBe('Corpus Christi College New Court, Cambridge, UK - Diliff');
    // Without the geotags the two Massachusetts skylines would top the ranking.
    const noGeotags = { ...json, query: { pages: json.query.pages.map(({ coordinates, ...p }) => p) } };
    expect(rankCoverCandidates(parseCommonsSearch(noGeotags, ctx), ctx)[0].title).toMatch(/skyline/);
  });
  it('drops the Munich town hall and the untitled lily, and penalises the concert-hall foyer', () => {
    const ctx = sapporoJan();
    const cands = parseCommonsSearch(fixture('commons-sapporo-assessed'), ctx);
    expect(cands.some((c) => /Munich|Nymphaea/.test(c.title))).toBe(false);
    const ranked = rankCoverCandidates(cands, ctx);
    expect(ranked[0].title).toBe('Sapporo Mt.Moiwa view-20091012-RM-123338');
    // "Foyer of the Sapporo Concert Hall", in "Featured pictures of building interiors"
    expect(ranked.find((c) => /Kitara/.test(c.title)).why).toContain('unscenic -45');
  });
});

describe('Wikidata item and linked images', () => {
  const files = () => fixture('commons-files-sapporo');
  it('reads the city item when it is within 50 km of the destination', () => {
    const item = parseWikidataCity(fixture('wikidata-sapporo'), { lat: SAPPORO.lat, lng: SAPPORO.lng, localLang: 'ja' });
    expect(item).toMatchObject({
      qid: 'Q37951', banner: 'Sapporo banner Susukino district.jpg', image: '札幌タワー電波塔展望台から札幌駅方面 - panoramio.jpg',
      labelEn: 'Sapporo', localLabel: '札幌市', sitelinks: { enwiki: 'Sapporo', enwikivoyage: 'Sapporo', localwikivoyage: '札幌市' },
    });
    expect(item.population).toBeGreaterThan(1_900_000);
    expect(coverContext({ dest: SAPPORO, item }).names).toEqual(expect.arrayContaining(['Sapporo', '札幌市', '札幌']));
  });
  it('keeps only aliases that spell the city name, not historic or regional ones', () => {
    const item = { labelEn: 'Hanoi', aliases: ['Hà Nội', 'Thang Long', 'Dong Do', 'Tonkin', 'Ha Noi', 'Hanoi City'] };
    expect(coverContext({ dest: HANOI, item }).names).toEqual(['Hanoi', 'Hà Nội', 'Ha Noi', 'Hanoi City']);
    expect(pexelsRelevant({ alt: 'Limestone islands in the Gulf of Tonkin', slug: 'ha-long-bay' }, coverContext({ dest: HANOI, item }))).toBe(false);
  });
  it('refuses an item far from the destination, or when the destination has no coordinates', () => {
    expect(parseWikidataCity(fixture('wikidata-sapporo'), { lat: 41.77, lng: 140.73 })).toBeNull(); // Hakodate
    expect(parseWikidataCity(fixture('wikidata-sapporo'), {})).toBeNull();
  });
  it('reads page lead images as File: titles', () => {
    expect(parseLeadImage(fixture('lead-sapporo-envoy'))).toBe('File:Skyline Sapporo Hokkaido Japan.jpg');
    expect(parseLeadImage(fixture('lead-sapporo-javoy'))).toBe('File:Former Hokkaido Government Office Building 20090112-03.jpg');
    expect(parseLeadImage({ query: { pages: [{ title: 'X' }] } })).toBeNull();
  });
  it('turns the banner, P18 and leads into candidates; small files fail the size gate', () => {
    const roles = [
      { file: fileTitle('Sapporo banner Susukino district.jpg'), role: 'banner' },
      { file: fileTitle('札幌タワー電波塔展望台から札幌駅方面 - panoramio.jpg'), role: 'image' },
      { file: parseLeadImage(fixture('lead-sapporo-envoy')), role: 'voyageLead' },
      { file: parseLeadImage(fixture('lead-sapporo-javoy')), role: 'voyageLead' },
      { file: parseLeadImage(fixture('lead-sapporo-enwiki')), role: 'wikiLead' },
    ];
    const cands = wikidataCandidates(files(), roles);
    expect(cands).toHaveLength(5);
    expect(cands.find((c) => c.role === 'banner')).toMatchObject({ base: 15, w: 2800, h: 400, source: 'wikidata' });
    const ranked = rankCoverCandidates(cands, sapporoJan());
    expect(ranked.map((c) => [c.title, c.score])).toEqual([
      ['Sapporo banner Susukino district', 28],
      ['Former Hokkaido Government Office Building 20090112-03', 19],
      ['札幌タワー電波塔展望台から札幌駅方面 - panoramio', 11],
    ]);
    expect(ranked[1].credit.creator).toMatch(/MiNe/);
  });
  it('relaxes the width floor to 1280 for Wikidata-linked files only when nothing else passes', () => {
    const base = { mime: 'image/jpeg', license: 'CC BY 2.0', w: 1600, h: 1000, text: 'view', base: 10 };
    const linked = { ...base, key: 'commons:a', source: 'wikidata', title: 'Lead' };
    const searched = { ...base, key: 'commons:b', source: 'commons', title: 'Search hit' };
    expect(rankCoverCandidates([linked, searched], sapporoJan()).map((c) => c.key)).toEqual(['commons:a']);
    const wide = { ...searched, key: 'commons:c', w: 2400, h: 1600 };
    expect(rankCoverCandidates([linked, wide], sapporoJan()).map((c) => c.key)).toEqual(['commons:c']);
  });
});

describe('coverGateReason', () => {
  const ok = { license: 'CC BY-SA 4.0', mime: 'image/jpeg', w: 4000, h: 2000, title: 'Hanoi skyline' };
  it('passes a wide open-licence JPEG and Pexels photos', () => {
    expect(coverGateReason(ok)).toBeNull();
    expect(coverGateReason({ ...ok, license: 'Pexels License', mime: 'image/webp' })).toBeNull();
  });
  it('rejects bad licences, types, sizes, shapes and graphics', () => {
    expect(coverGateReason({ ...ok, license: 'CC BY-NC 2.0' })).toBe('license');
    expect(coverGateReason({ ...ok, mime: 'image/png' })).toBe('type');
    expect(coverGateReason({ ...ok, w: 1800, h: 900 })).toBe('size');
    expect(coverGateReason({ ...ok, w: 4000, h: 300 })).toBe('size');
    expect(coverGateReason({ ...ok, w: 3000, h: 3000 })).toBe('shape');
    expect(coverGateReason({ ...ok, w: 13000, h: 1000 })).toBe('shape');
    expect(coverGateReason({ ...ok, title: 'Otaru Montage' })).toBe('not-a-photo');
    expect(coverGateReason({ ...ok, title: 'Wikivoyage_Melbourne_district_map' })).toBe('not-a-photo');
    expect(coverGateReason({ ...ok, title: 'Hanoi locator collage' })).toBe('not-a-photo');
  });
});

describe('scoreCover signals', () => {
  const c = (over) => ({ base: 40, text: 'Hanoi', w: 3000, h: 2000, ...over });
  const ctx = (season, lat = 43) => ({ season, lat });
  it('applies scenic caps, unscenic, black and white and night', () => {
    expect(scoreCover(c({ text: 'skyline panorama sunset aerial river' }), ctx('none', 21)).why).toContain('scenic +25');
    expect(scoreCover(c({ text: 'street vendor at the market' }), ctx('none', 21)).why).toContain('unscenic -30');
    expect(scoreCover(c({ text: 'Black and white street' }), ctx('none', 21)).why).toContain('black and white -20');
    expect(scoreCover(c({ text: 'City at night' }), ctx('none', 21)).why).toContain('night -6');
    expect(scoreCover(c({ categories: 'Personality rights warning|Hanoi' }), ctx('none', 21)).why).toContain('unscenic -15');
  });
  it('rewards wide and big images and penalises narrow ones', () => {
    expect(scoreCover(c({ w: 5000, h: 1800 }), ctx('none', 21)).why).toContain('panorama +10, width +6');
    expect(scoreCover(c({ w: 2000, h: 1100 }), ctx('none', 21)).why).toContain('wide +5, narrow -8');
  });
  it('matches, and penalises, seasons', () => {
    expect(scoreCover(c({ text: 'snowy streets' }), ctx('winter')).why).toContain('season +6');
    expect(scoreCover(c({ month: 1 }), ctx('winter')).why).toContain('season +6');
    expect(scoreCover(c({ text: 'snowy streets' }), ctx('summer')).why).toContain('winter -25');
    expect(scoreCover(c({ text: 'cherry blossoms' }), ctx('winter')).why).toContain('spring -10');
    expect(scoreCover(c({ text: 'snow on the lake' }), ctx('none', 21)).why).toContain('-25');
  });
  it('uses the Pexels average colour and result position', () => {
    expect(scoreCover(c({ rgb: [200, 205, 210] }), ctx('none', 21)).why).toContain('washed-out -10');
    expect(scoreCover(c({ rgb: [30, 35, 50] }), ctx('none', 21)).why).toContain('dark -6');
    expect(scoreCover(c({ rank: 30 }), ctx('none', 21)).why).toContain('position -12');
  });
});

describe('coverSizes', () => {
  const px = parsePexelsSearch(fixture('pexels-sapporo'))[0];
  it('asks Pexels for at most 2400px plus a 1280px copy', () => {
    expect(coverSizes(px)).toEqual({
      large: [{ url: 'https://images.pexels.com/photos/32970318/pexels-photo-32970318.jpeg?auto=compress&cs=tinysrgb&w=2400', w: 2400, h: 1600 }],
      small: { url: 'https://images.pexels.com/photos/32970318/pexels-photo-32970318.jpeg?auto=compress&cs=tinysrgb&w=1280', w: 1280, h: 853 },
    });
    expect(coverSizes({ ...px, w: 2100, h: 1400 }).large[0]).toMatchObject({ w: 2100 });
    expect(coverSizes({ ...px, w: 6000, h: 2000 }).small).toBeNull(); // 3:1 would be too soft at 1280
  });
  it('uses Wikimedia standard widths and never more than the original', () => {
    const files = parseCommonsFiles(fixture('commons-hanoi-assessed'));
    const sunset = commonsCandidate(files.find((f) => /Sunset over Hanoi/.test(f.title)));
    const s = coverSizes(sunset);
    expect(s.large.map((x) => x.w)).toEqual([3840, 1920]);
    expect(s.large[0].url).toMatch(/\/thumb\/.+\/3840px-Sunset_over_Hanoi_After_the_Rain\.jpg$/);
    expect(s.large[0].url).not.toContain('?');
    expect(s.small.w).toBe(1920); // 2.94:1 panorama: the 1920 copy is the small one
    const mid = { ...sunset, w: 3000, h: 2000 };
    expect(coverSizes(mid).large.map((x) => x.url === mid.original ? 'original' : x.w)).toEqual(['original', 1920]);
    expect(coverSizes(mid).small.w).toBe(1280);
    expect(coverSizes({ ...sunset, w: 2100, h: 1400 }).large.map((x) => x.w)).toEqual([1920]);
    expect(coverSizes({ ...sunset, w: 1600, h: 1000 }).large.map((x) => x.w)).toEqual([1600, 1280]);
  });
  it('builds thumbnail URLs from the original when no thumbnail URL came back', () => {
    const c = { original: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Sapporo_banner_Susukino_district.jpg', thumburl: '', w: 2800, h: 400 };
    expect(wikiThumbUrl(c, 1920)).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Sapporo_banner_Susukino_district.jpg/1920px-Sapporo_banner_Susukino_district.jpg');
    expect(wikiThumbUrl(c, 3840)).toBe(c.original);
  });
});

describe('cover record, credit and crop', () => {
  it('chooses the crop height: 38% for 3:2, 50% for banners and panoramas, the vision pick clamped', () => {
    expect(coverFocusY({ w: 3000, h: 2000 })).toBe(38);
    expect(coverFocusY({ w: 2800, h: 400 })).toBe(50);
    expect(coverFocusY({ w: 3000, h: 2000, role: 'banner' })).toBe(50);
    expect(coverFocusY({ w: 3000, h: 2000, judgeFocusY: 5 })).toBe(15);
    expect(coverFocusY({ w: 3000, h: 2000, judgeFocusY: 90 })).toBe(65);
  });
  it('credits Commons with Attribution first, plain separators, and records v2', () => {
    const [file] = parseCommonsFiles({ query: { pages: [{
      title: 'File:X.jpg', imageinfo: [{ width: 4000, height: 2000, mime: 'image/jpeg', url: 'https://upload.wikimedia.org/a/X.jpg?utm_source=x', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ann">Ann</a>' }, Attribution: { value: 'Ann Lee \u2014 Studio \u00b7 Hanoi' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }],
    }] } });
    expect(file.url).toBe('https://upload.wikimedia.org/a/X.jpg');
    const c = { ...commonsCandidate(file, { source: 'commons', role: 'quality', base: 25 }), score: 50 };
    expect(c.credit).toMatchObject({ creator: 'Ann Lee, Studio, Hanoi', creatorUrl: 'https://commons.wikimedia.org/wiki/User:Ann', license: 'CC BY-SA 4.0' });
    const large = { url: 'https://s/large.jpg', w: 3840, h: 1920 };
    const rec = coverRecord(c, { large, small: null, ctx: { qid: 'Q1858', season: 'none', month: 12 }, now: Date.parse('2026-11-14T00:00:00Z') });
    expect(rec).toMatchObject({ v: 2, source: 'commons', role: 'quality', qid: 'Q1858', large, small: null, focusY: 38, season: 'none', month: 12, score: 50, pickedAt: '2026-11-14T00:00:00.000Z' });
    expect(noCoverRecord(Date.parse('2026-11-14T00:00:00Z'))).toEqual({ v: 2, none: true, triedAt: '2026-11-14T00:00:00.000Z' });
  });
});

describe('cover replacement rules', () => {
  const TRIP = '4c11d050-abb4-43a5-8024-468bc14dd380';
  const v1 = `https://x.supabase.co/storage/v1/object/public/trip-photos/${TRIP}/cover.jpg`;
  const now = Date.parse('2026-11-14T00:00:00Z');
  it('picks for an empty cover or the old automatic one, never over a chosen or v2 cover', () => {
    expect(isAutoCoverV1(v1, TRIP)).toBe(true);
    expect(coverNeedsPick({ cover_image: '' }, TRIP, now)).toBe(true);
    expect(coverNeedsPick({ cover_image: null, extras: null }, TRIP, now)).toBe(true);
    expect(coverNeedsPick({ cover_image: v1, extras: {} }, TRIP, now)).toBe(true);
    expect(coverNeedsPick({ cover_image: 'https://example.com/my-photo.jpg' }, TRIP, now)).toBe(false);
    expect(coverNeedsPick({ cover_image: `https://x/trip-photos/other-trip/cover.jpg` }, TRIP, now)).toBe(false);
    expect(coverNeedsPick({ cover_image: 'https://s/cover-v2-2400w.jpg', extras: { cover: { v: 2 } } }, TRIP, now)).toBe(false);
    // A v1-looking URL that already carries a v2 record (curated) stays.
    expect(coverNeedsPick({ cover_image: v1, extras: { cover: { v: 2, large: { url: v1 } } } }, TRIP, now)).toBe(false);
  });
  it('repairs a v2 copy whose record was lost (Regenerate Itinerary replaces extras)', () => {
    const large = { url: `https://x.supabase.co/storage/v1/object/public/trip-photos/${TRIP}/cover-v2-2400w-a1b2c3d4.jpg`, w: 2400, h: 1600 };
    expect(isAutoCoverV2(large.url, TRIP)).toBe(true);
    expect(isAutoCoverV2(large.url.replace(TRIP, 'other-trip'), TRIP)).toBe(false);
    const orphan = { cover_image: large.url, extras: { towns: [] } };
    expect(isOrphanCoverV2(orphan, TRIP)).toBe(true);
    expect(coverNeedsPick(orphan, TRIP, now)).toBe(true);
    // A record for another copy (a second picker saved after this image) or a "none" verdict does not describe it either.
    expect(coverNeedsPick({ cover_image: large.url, extras: { cover: { v: 2, large: { ...large, url: `${large.url}x` } } } }, TRIP, now)).toBe(true);
    expect(coverNeedsPick({ cover_image: large.url, extras: { cover: { v: 2, none: true, triedAt: new Date(now).toISOString() } } }, TRIP, now)).toBe(true);
    // The matching record: nothing to do.
    const kept = { cover_image: large.url, extras: { cover: { v: 2, large } } };
    expect(isOrphanCoverV2(kept, TRIP)).toBe(false);
    expect(coverNeedsPick(kept, TRIP, now)).toBe(false);
    // Another trip's copy (a duplicated trip) counts as chosen, as before.
    expect(coverNeedsPick({ cover_image: large.url.replace(TRIP, 'other-trip') }, TRIP, now)).toBe(false);
  });
  it('names every pick\'s copies uniquely so two pickers never overwrite each other', () => {
    expect(coverCopyPath(TRIP, { width: 2400, contentType: 'image/jpeg' }, 'a1b2c3d4')).toBe(`${TRIP}/cover-v2-2400w-a1b2c3d4.jpg`);
    expect(coverCopyPath(TRIP, { width: 1280, contentType: 'image/webp' }, 'a1b2c3d4')).toBe(`${TRIP}/cover-v2-1280w-a1b2c3d4.webp`);
    expect(coverCopyPath(TRIP, { width: 2400 }, 'a1b2c3d4')).not.toMatch(/\/\d+px-/);
    expect(coverCopyPath(TRIP, { width: 2400 }, '../x')).toBeNull();
    expect(coverCopyPath(TRIP, { width: 2400 }, '')).toBeNull();
    expect(coverCopyPath(TRIP, { width: 0 }, 'a1b2c3d4')).toBeNull();
    expect(coverCopyPath('', { width: 2400 }, 'a1b2c3d4')).toBeNull();
    // Every copy name is still recognised as our own automatic cover.
    expect(isAutoCoverV2(`https://s/trip-photos/${coverCopyPath(TRIP, { width: 2400 }, 'a1b2c3d4')}`, TRIP)).toBe(true);
  });
  it('retries a "nothing found" verdict after 30 days, unless a cover was set since', () => {
    const none = (days) => ({ v: 2, none: true, triedAt: new Date(now - days * 86_400_000).toISOString() });
    expect(coverNeedsPick({ cover_image: '', extras: { cover: none(3) } }, TRIP, now)).toBe(false);
    expect(coverNeedsPick({ cover_image: '', extras: { cover: none(31) } }, TRIP, now)).toBe(true);
    expect(coverNeedsPick({ cover_image: 'https://example.com/mine.jpg', extras: { cover: none(31) } }, TRIP, now)).toBe(false);
  });
  it('merges the cover into fresh extras without dropping other keys', () => {
    const fresh = { photoCredits: { a: { via: 'Wikipedia' } }, towns: [{ city: 'Sapporo' }], cover: { old: true } };
    const merged = mergeCoverExtras(fresh, { v: 2 });
    expect(merged).toEqual({ photoCredits: fresh.photoCredits, towns: fresh.towns, cover: { v: 2 } });
    expect(fresh.cover).toEqual({ old: true }); // not mutated
    expect(mergeCoverExtras(null, { v: 2 })).toEqual({ cover: { v: 2 } });
  });
});

describe('vision check helpers', () => {
  const cand = (key, source, score) => ({ key, source, score, original: `https://images.pexels.com/photos/${key}/p.jpeg`, w: 4000, h: 2000 });
  const ranked = [cand('a', 'pexels', 90), cand('b', 'pexels', 80), cand('c', 'pexels', 70), cand('d', 'pexels', 60),
    cand('e', 'pexels', 55), cand('f', 'commons', 50), cand('g', 'wikidata', 40), cand('h', 'commons', 30)];
  it('sends at most six, at most four from one source', () => {
    expect(judgeSet(ranked).map((c) => c.key)).toEqual(['a', 'b', 'c', 'd', 'f', 'g']);
    expect(judgeThumbUrl(ranked[0])).toBe('https://images.pexels.com/photos/a/p.jpeg?auto=compress&cs=tinysrgb&w=500');
  });
  it('validates the reply', () => {
    const reply = JSON.stringify({ images: [
      { index: 0, showsDestination: 'yes', beauty: 6, focusY: 40 }, { index: 9, showsDestination: 'yes', beauty: 9, focusY: 10 },
      { index: 1, showsDestination: 'maybe', beauty: 9, focusY: 10 }, { index: 2, showsDestination: 'no', beauty: 12, focusY: 300 },
    ] });
    const v = parseJudgeReply(reply, 3);
    expect([...v.keys()]).toEqual([0, 2]);
    expect(v.get(2)).toEqual({ showsDestination: 'no', beauty: 10, focusY: 100 });
    expect(parseJudgeReply('not json', 3)).toBeNull();
    expect(parseJudgeReply('{"images": []}', 3)).toBeNull();
  });
  it('can only remove or reorder candidates', () => {
    const sent = judgeSet(ranked);
    const verdicts = new Map([
      [0, { showsDestination: 'yes', beauty: 5, focusY: 40 }], // a: 50 + 27 = 77
      [1, { showsDestination: 'no', beauty: 9, focusY: 40 }],  // b: removed
      [2, { showsDestination: 'unsure', beauty: 4, focusY: 40 }], // c: removed (ugly)
      [4, { showsDestination: 'yes', beauty: 8, focusY: 20 }], // f: 80 + 15 = 95
    ]);
    const out = applyJudge(ranked, sent, verdicts);
    expect(out.map((c) => c.key)).toEqual(['f', 'a', 'd', 'e', 'g', 'h']);
    expect(out[0]).toMatchObject({ judge: { beauty: 8, showsDestination: 'yes' }, judgeFocusY: 20 });
    expect(coverFocusY(out[0])).toBe(20);
    expect(applyJudge(ranked, sent, null)).toBe(ranked);
    expect(judgePrompt({ name: 'Sapporo', country: 'Japan', month: 1, season: 'winter' }, 4)).toMatch(/Sapporo, Japan, travelling in January \(winter\)/);
  });
});

describe('cover hosts and Pexels quota', () => {
  it('downloads covers only from the Pexels and Wikimedia image CDNs', () => {
    for (const u of ['https://images.pexels.com/photos/1/a.jpeg?w=2400', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1920px-X.jpg'])
      expect(isCoverHost(u), u).toBe(true);
    for (const u of ['http://images.pexels.com/a.jpg', 'https://images.pexels.com:8443/a.jpg', 'https://evil.example/upload.wikimedia.org/x.jpg', 'not a url'])
      expect(isCoverHost(u), u).toBe(false);
  });
  it('skips Pexels while fewer than 10 requests remain in the window', () => {
    const h = (rem, reset) => new Headers({ 'x-ratelimit-remaining': String(rem), 'x-ratelimit-reset': String(reset) });
    const now = Date.parse('2026-11-14T00:00:00Z');
    expect(readPexelsQuota(new Headers())).toBeNull();
    const low = readPexelsQuota(h(9, now / 1000 + 600));
    expect(low).toEqual({ remaining: 9, resetAt: now + 600_000 });
    expect(pexelsAllowed(low, now)).toBe(false);
    expect(pexelsAllowed(low, now + 601_000)).toBe(true);
    expect(pexelsAllowed(readPexelsQuota(h(150, now / 1000 + 600)), now)).toBe(true);
    expect(pexelsAllowed(null, now)).toBe(true);
  });
});
