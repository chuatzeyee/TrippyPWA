// The Chinese (Simplified) pages against the English ones: the same sections, the same blocks in the
// same order with the same number of rows, items and links, the same facts, none of the characters
// the owner bans, the sentences a legal translation must keep, the owner's facts of 2026-11-22, and
// the house rules of this language (你, Chinese punctuation, 新加坡 for the country, a space between
// Chinese and a Latin word and none between Chinese and a figure).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import aboutEn from './about.en.js';
import aboutZh, { mount } from './about.zh-Hans.js';
import privacyEn from './privacy.en.js';
import privacyZh from './privacy.zh-Hans.js';
import termsEn from './terms.en.js';
import termsZh from './terms.zh-Hans.js';
import { validatePage, factPlaces } from '../content.js';
import { sitePageHtml } from '../site-page.js';
import { BANNED_GLYPHS, pageText, pageTexts, sectionIds, internalLinks, unknownPlaces, leftoverSyntax } from '../legal-test-kit.js';
import { tFor, languageReady, applyLanguage } from '../../lib/i18n.js';
import zhStrings from '../../lib/i18n/zh-Hans.js';

const PAIRS = [['about', aboutEn, aboutZh], ['privacy', privacyEn, privacyZh], ['terms', termsEn, termsZh]];
const INFO = { operatorName: '', contactEmail: '', dataProtectionEmail: '', country: 'Singapore', siteUrl: 'https://example.test/' };

/** The outline of a block: its type and how many parts it has, whatever the words. */
function shape(block) {
  const count = (value) => (Array.isArray(value) ? value.length : 1);
  switch (block.type) {
    case 'list': return ['list', Boolean(block.ordered), block.items.map((item) => (typeof item === 'string' ? 0 : count(item.items ?? [])))];
    case 'defs': return ['defs', block.rows.map((row) => count(row.text))];
    case 'table': return ['table', block.head.length, block.rows.map((row) => row.length)];
    case 'note': return ['note', Boolean(block.title), count(block.text)];
    case 'cards': return ['cards', block.items.length];
    case 'faq': return ['faq', block.items.map((item) => count(item.a))];
    case 'custom': return ['custom', (block.html.match(/<(li|details|figure|fieldset|img|button|a) /g) ?? []).length];
    default: return [block.type];
  }
}
const targets = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]).sort();
// The country is the one fact the Chinese pages write out (新加坡), so it is compared on its own below.
const facts = (text) => [...text.matchAll(/\{(operator|contactEmail|dpoEmail|siteUrl)\}/g)].map((match) => match[1]).sort();
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
/** A line without its markup: link targets, emphasis marks and tags go, the words stay. */
const words = (line) => line.replace(/\]\([^)\s]+\)/g, ']').replace(/\*\*|[[\]]/g, '').replace(/\s*<[^>]+>\s*/g, '\n').replace(/\{\w+\}/g, 'x');
const strongs = (text) => (text.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
const blockText = (block) => (block.type === 'custom' ? block.html : pageText(block));

describe.each(PAIRS)('%s in Chinese (Simplified)', (pageId, english, chinese) => {
  it('can be drawn in full and keeps the English sections', () => {
    expect(validatePage(chinese)).toEqual([]);
    expect(sectionIds(chinese)).toEqual(sectionIds(english));
    expect([].concat(chinese.intro ?? []).length).toBe([].concat(english.intro ?? []).length);
  });

  it('has the English blocks, one for one, with the same links, facts and emphasis', () => {
    english.sections.forEach((section, index) => {
      const mine = chinese.sections[index];
      expect(mine.blocks.map(shape), section.id).toEqual(section.blocks.map(shape));
      section.blocks.forEach((block, at) => {
        const [theirs, ours] = [blockText(block), blockText(mine.blocks[at])];
        if (block.type !== 'custom') {
          expect(targets(ours), `${section.id} block ${at}`).toEqual(targets(theirs));
          expect(strongs(ours), `${section.id} block ${at}`).toBe(strongs(theirs));
        } else {
          expect((ours.match(/<a /g) ?? []).length, `${section.id} block ${at}`).toBe((theirs.match(/<a /g) ?? []).length);
          expect((ours.match(/<strong>/g) ?? []).length, `${section.id} block ${at}`).toBe((theirs.match(/<strong>/g) ?? []).length);
        }
        expect(facts(ours), `${section.id} block ${at}`).toEqual(facts(theirs));
      });
    });
    expect(facts([].concat(chinese.intro ?? []).join('\n'))).toEqual(facts([].concat(english.intro ?? []).join('\n')));
  });

  it('writes the country as 新加坡 wherever the English page prints it', () => {
    expect(pageText(chinese)).not.toContain('{country}');
    const lines = (page) => [[].concat(page.intro ?? []).join('\n'), ...page.sections.flatMap((section) => section.blocks.map(blockText))];
    const [theirs, ours] = [lines(english), lines(chinese)];
    let seen = 0;
    theirs.forEach((line, index) => {
      if (!line.includes('{country}')) return;
      seen += 1;
      expect(ours[index], line).toContain('新加坡');
    });
    expect(seen).toBeGreaterThan(0);
    expect(pageText(chinese)).not.toMatch(/Singapore(?! region)/); // only inside nothing: the word is always 新加坡
  });

  it('holds no banned character, no unknown place and no markup left unconverted', () => {
    for (const line of pageTexts(chinese)) expect(line, line).not.toMatch(BANNED_GLYPHS);
    expect(unknownPlaces({ ...chinese, sections: chinese.sections.map((section) => ({ ...section, blocks: section.blocks.filter((block) => block.type !== 'custom') })) })).toEqual([]);
    expect(leftoverSyntax(chinese)).toEqual([]);
  });

  it('is written in Chinese with Chinese punctuation', () => {
    for (const line of pageTexts(chinese)) {
      if (/^</.test(line.trim()) || !/[一-鿿]/.test(line)) continue;
      expect(line, line).not.toMatch(/[一-鿿][,;:?!]|[一-鿿]\.(?![\w/])|[,;?!][一-鿿]/); // half-width punctuation beside a Chinese character
      expect(line, line).not.toMatch(/您/); // the string table says 你
      expect(line, line).not.toMatch(/[一-鿿]\((?!#|http|mailto)|(?<!\]\([^)]*)\)[一-鿿]/); // half-width brackets around Chinese
    }
  });

  it('spaces a Latin word from Chinese, and sets a figure against it', () => {
    for (const line of pageTexts(chinese)) {
      if (!/[一-鿿]/.test(line)) continue;
      const text = words(line);
      expect(text, line).not.toMatch(/[一-鿿][A-Za-z]|[A-Za-z][一-鿿]/); // Trippy 是, never Trippy是
      expect(text, line).not.toMatch(/[一-鿿] \d|\d [一-鿿]/); // 7天 and 第1天, never 7 天
      expect(text, line).not.toMatch(/ [，。；：、？！）》”]|[（《“] /); // no space against Chinese punctuation
    }
  });

  it('links only to sections that exist, and prints no fact as a bare place when a contact is missing', async () => {
    const pages = { about: sectionIds(aboutZh), privacy: sectionIds(privacyZh), terms: sectionIds(termsZh), settings: [] };
    for (const link of internalLinks(chinese)) {
      expect(Object.keys(pages), JSON.stringify(link)).toContain(link.page);
      if (link.section) expect(pages[link.page], JSON.stringify(link)).toContain(link.section);
    }
    applyLanguage('zh-Hans', { browserLanguages: [] });
    await languageReady();
    const html = sitePageHtml({ pageId, page: chinese, language: 'zh-Hans', info: INFO, t: tFor('zh-Hans') });
    expect(html).not.toMatch(/\{(operator|contactEmail|dpoEmail|country|siteUrl)\}/);
    expect(html).not.toMatch(BANNED_GLYPHS);
    // A pending contact stands at the end of its sentence or alone, never in the middle of one.
    const after = [...html.matchAll(/<span class="site-pending">[^<]*<\/span>(.{0,6})/g)].map((match) => match[1]);
    expect(after.length).toBeGreaterThan(0);
    for (const tail of after) expect(tail).toMatch(/^(。|<\/)/);
    applyLanguage('en', { browserLanguages: [] });
    await languageReady();
  });
});

describe('the legal texts in Chinese (Simplified)', () => {
  const section = (page, id) => pageText(page.sections.find((entry) => entry.id === id));
  it('name the statutes with their official English names', () => {
    expect(pageText(privacyZh)).toContain('《个人资料保护法令》（Personal Data Protection Act 2012）');
    // The official English name stands in brackets on first mention only.
    expect(pageText(privacyZh).split('Personal Data Protection Act 2012').length).toBe(2);
    expect(pageText(privacyZh).split('Personal Data Protection Commission').length).toBe(2);
    expect(pageText(privacyZh)).toContain('个人资料保护委员会');
    expect(pageText(privacyZh)).toContain('资料保护联络人');
    for (const name of ['Personal Data Protection Act 2012', 'Consumer Protection (Fair Trading) Act 2003', 'Unfair Contract Terms Act 1977', 'Contracts (Rights of Third Parties) Act 2001']) {
      expect(pageText(termsZh), name).toContain(name);
    }
  });
  it('say that the English text governs', () => {
    expect(section(privacyZh, 'changes')).toContain('以英文文本为准');
    expect(section(termsZh, 'general')).toContain('以英文文本为准');
  });
  it('keep the consent and withdrawal clauses and the figures of the English policy', () => {
    expect(section(privacyZh, 'consent')).toContain('视为同意');
    expect(pageText(privacyZh)).toContain('撤回同意');
    expect(section(privacyZh, 'withdrawal')).toContain('10个工作日');
    expect(section(privacyZh, 'access-and-correction')).toContain('30天内');
    expect(section(privacyZh, 'breach')).toContain('3个日历日');
    expect(section(privacyZh, 'breach')).toContain('500人');
    expect(section(privacyZh, 'complaints')).toContain('https://www.pdpc.gov.sg/');
    expect(section(termsZh, 'liability')).toContain('100新元');
    expect(section(termsZh, 'changes')).toContain('14天');
  });
  it('name every third party the English policy names', () => {
    for (const name of [
      'Supabase', 'Google', 'Gemini', 'Mistral', 'Serper', 'Tavily', 'Wikimedia', 'Wikipedia', 'Wikidata', 'Openverse',
      'Pexels', 'Mapillary', 'Overpass', 'OpenStreetMap', 'Photon', 'Komoot', 'Open-Meteo', 'OSRM', 'Google Fonts',
      'flagcdn.com', 'Aviasales', 'Booking.com', 'Trip.com', 'Skyscanner', 'Google Search', 'Google Maps', 'Rome2Rio', 'GitHub Pages',
    ]) expect(section(privacyZh, 'service-providers'), name).toContain(name);
  });
});

describe('the Chinese (Simplified) pages against the owner\'s facts of 2026-11-22', () => {
  const section = (page, id) => pageText(page.sections.find((entry) => entry.id === id));
  const prose = (page) => pageTexts({ ...page, sections: page.sections.map((entry) => ({ ...entry, blocks: entry.blocks.filter((block) => block.type !== 'custom') })) });

  it('the account is deleted by its owner in Settings, and the policy says what that removes and what it cannot', () => {
    const retention = section(privacyZh, 'retention');
    expect(retention).toContain('打开设置，进入 Account（账户）部分，按 Delete my account（删除我的账户）');
    expect(retention).toContain('你不必写信给任何人');
    expect(retention).toContain('你拥有的每个行程，连同其中的各天安排、站点、分享链接和协作者');
    expect(retention).toContain('托管供应商备份里的副本');
    expect(retention).not.toContain('{dpoEmail}');
    expect(section(privacyZh, 'at-a-glance')).toContain('Delete my account');
    expect(section(privacyZh, 'withdrawal')).toContain('Delete my account');
    expect(section(termsZh, 'suspension')).toContain('到设置的 Account（账户）部分，按 Delete my account（删除我的账户）');
    expect(section(termsZh, 'suspension')).toContain('本条款对你即告终止');
    expect(pageText(aboutZh)).toContain('怎样在设置里自行删除账户');
  });
  it('the AI runs on Google\'s free tier, human reviewers may read what is sent, and free text is to hold nothing sensitive', () => {
    const ai = section(privacyZh, 'ai-models');
    expect(ai).toContain('Google 服务的免费层级');
    expect(ai).toContain('人工审核员也可能读到');
    expect(ai).toContain('请不要在自由填写栏里写敏感的个人资料');
    for (const id of ['at-a-glance', 'what-we-collect', 'service-providers']) expect(section(privacyZh, id), id).toContain('Google 服务的免费层级');
    expect(section(termsZh, 'third-parties')).toContain('Google 服务的免费层级');
    expect(section(aboutZh, 'your-data')).toContain('Google 服务的免费层级');
  });
  it('diagnostic logs are kept for up to one year and a share link ends after 7 days', () => {
    expect(section(privacyZh, 'retention')).toContain('超过一年的条目会自动删除');
    expect(section(privacyZh, 'what-we-collect')).toContain('最长一年');
    for (const text of [section(privacyZh, 'retention'), section(privacyZh, 'shared-links'), section(termsZh, 'sharing')]) expect(text).toContain('在建立7天后失效');
    expect(section(aboutZh, 'questions')).toContain('链接7天后失效');
  });
  it('the database is in Singapore, and the transfer section is about the other services', () => {
    expect(section(privacyZh, 'transfer')).toContain('都托管在新加坡，由 Supabase 通过 Amazon Web Services 的新加坡区域提供');
    expect(section(privacyZh, 'transfer')).toContain('Mistral');
    expect(section(privacyZh, 'at-a-glance')).toContain('你的账户存放在新加坡');
  });
  it('Trippy is free and experimental, sells and books nothing, and names commission only to deny it', () => {
    expect(pageText({ intro: termsZh.intro })).toContain('免费的实验性服务，由个人在新加坡营运');
    expect(pageText({ intro: privacyZh.intro })).toContain('也不从任何一方赚取佣金');
    expect(pageText({ intro: aboutZh.intro })).toContain('不赚取佣金');
    expect(section(termsZh, 'third-parties')).toContain('通往其他网站的普通链接');
    let seen = 0;
    for (const page of [privacyZh, termsZh, aboutZh]) {
      for (const line of [...prose(page), ...page.sections.flatMap((entry) => entry.blocks.filter((block) => block.type === 'custom').map((block) => block.html.replace(/<[^>]+>/g, '\n')))]) {
        for (const sentence of line.split(/(?<=[。？！；\n])/)) {
          if (!/佣金|推广代码|联盟/.test(sentence)) continue;
          seen += 1;
          expect(sentence, sentence).toMatch(/不|没有/);
        }
      }
    }
    expect(seen).toBeGreaterThan(8);
  });
  it('no source file of the Chinese pages or strings holds a banned character', () => {
    for (const file of ['./about.zh-Hans.js', './privacy.zh-Hans.js', './terms.zh-Hans.js', '../../lib/i18n/zh-Hans.js']) {
      expect(read(file).match(BANNED_GLYPHS), file).toBeNull();
      // The Chinese dash, the Chinese ellipsis and the two interpuncts, wherever they stand.
      expect(read(file).match(/\u2014|\u2026|\u00b7|\u30fb|\u2027/), file).toBeNull();
    }
  });
});

describe('the About page in Chinese (Simplified)', () => {
  it('translates the sample plan and exports a mount', () => {
    const html = aboutZh.sections.find((entry) => entry.id === 'what-it-is').blocks.find((block) => block.type === 'custom').html;
    expect(html).toContain('京都');
    expect(html).toContain('清水寺');
    expect(html).toContain('典型天气');
    expect(html).not.toContain('Kiyomizu');
    expect(html).not.toContain('Typical weather');
    expect(typeof mount).toBe('function');
  });
});

describe('the Chinese (Simplified) string table', () => {
  it('uses Chinese punctuation and the footer names the pages use', () => {
    for (const [key, value] of Object.entries(zhStrings)) expect(value, key).not.toMatch(/[一-鿿][,;:?!.]/);
    expect(pageText(termsZh)).toContain(zhStrings['footer.link.credits']);
    expect(aboutZh.sections.map((entry) => entry.blocks.map(blockText).join('\n')).join('\n')).toContain(zhStrings['footer.link.credits']);
    expect(privacyZh.title).toBe(zhStrings['footer.link.privacy']);
    expect(termsZh.title).toBe(zhStrings['footer.link.terms']);
    expect(aboutZh.title).toBe(zhStrings['footer.link.about']);
  });
  it('is translated in full, the sign-in line included', () => {
    for (const [key, value] of Object.entries(zhStrings)) {
      if (['footer.group.trippy', 'footer.link.atlas'].includes(key)) continue; // product names stay as they are
      expect(value, key).toMatch(/[一-鿿]/);
      expect(value, key).not.toMatch(/[一-鿿][A-Za-z]|[A-Za-z][一-鿿]|[一-鿿] \d|\d [一-鿿]|您/);
    }
    expect(zhStrings['signIn.consent']).toBe('登录即表示你同意[使用条款](#/terms)，并已阅读[隐私政策](#/privacy)。');
  });
});
