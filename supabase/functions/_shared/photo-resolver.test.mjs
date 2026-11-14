import { describe, it, expect } from 'vitest';
import {
  normalizeName, nameMatches, isOpenLicense, extractOgImage, imageDims, isHeroShaped, isOfficialSite, splitVenueName, snapWidth, looksLikePhoto, isDistinctiveName, blockedUrlReason, readCapped,
  resolvesToBlockedIp, canCheckDns,
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
