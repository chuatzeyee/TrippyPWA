// The eight sections of the Settings page (blueprint 6.1 to 6.7) as markup: each one in its normal,
// offline, error and loading state, then Look and layout, You, and Money and units in detail. The
// other sections and the page frame are in sections.page.test.js. Owner: F12.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SECTIONS, sectionHtml, exampleTexts,
  lookSectionHtml, youSectionHtml, moneySectionHtml, tripsSectionHtml, notificationsSectionHtml, dataSectionHtml,
  accountSectionHtml, aboutSectionHtml,
} from './sections.js';
import { saveStatusText } from './controls.js';
import { DEFAULT_PREFS } from '../lib/prefs.js';
import { setDisplayPrefs, setLocaleFromFlag } from '../lib/locale.js';
import { CURRENCY_LIST } from '../data/currency-list.js';
import { NATIONALITIES } from '../data/nationalities.js';
import { VIEW_CHOICES } from '../views/shared/view-picker.js';
import { BANNED, ERROR, KEYS, LOADING, OFFLINE, PROFILE, VARIANTS, byId, inside, state, textOf, walk } from './sections.test-kit.js';

beforeEach(() => {
  setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' });
  setLocaleFromFlag('sg');
});

describe('the eight sections', () => {
  it('are these, in this order', () => {
    expect(KEYS).toEqual(['look', 'you', 'money', 'trips', 'notifications', 'data', 'account', 'about']);
    expect(SECTIONS.map((section) => section.title)).toEqual(['Look and layout', 'You', 'Money and units', 'Trips', 'Notifications', 'Data', 'Account', 'About']);
  });
  it('each has its own builder, and sectionHtml() calls it', () => {
    const builders = { look: lookSectionHtml, you: youSectionHtml, money: moneySectionHtml, trips: tripsSectionHtml, notifications: notificationsSectionHtml, data: dataSectionHtml, account: accountSectionHtml, about: aboutSectionHtml };
    for (const key of KEYS) expect(sectionHtml(key, state())).toBe(builders[key](state()));
    expect(sectionHtml('nonsense', state())).toBe('');
  });
});

describe.each(Object.keys(VARIANTS))('every section, %s state', (variant) => {
  const make = VARIANTS[variant];

  it.each(KEYS)('%s: a section named by its h2, which can take the focus', (key) => {
    const els = walk(sectionHtml(key, make()));
    const [section] = els;
    expect(section.tag).toBe('section');
    expect(section.attrs.id).toBe(`st-${key}`);
    expect(section.attrs['data-st-section']).toBe(key);
    const heading = byId(els, section.attrs['aria-labelledby']);
    expect(heading.tag).toBe('h2');
    expect(heading.attrs.tabindex).toBe('-1');
    expect(heading.text.trim()).toBe(SECTIONS.find((entry) => entry.key === key).title);
    expect(els.filter((el) => el.tag === 'h1')).toEqual([]);
  });

  it.each(KEYS)('%s: every input, select and textarea has a label', (key) => {
    const els = walk(sectionHtml(key, make()));
    const labelsFor = new Set(els.filter((el) => el.tag === 'label' && el.attrs.for).map((el) => el.attrs.for));
    for (const control of els.filter((el) => ['input', 'select', 'textarea'].includes(el.tag))) {
      const named = inside(control, 'label') || labelsFor.has(control.attrs.id) || Boolean(control.attrs['aria-label']) || Boolean(byId(els, control.attrs['aria-labelledby']));
      expect(named, `${control.tag}#${control.attrs.id} in ${key} has no label`).toBe(true);
    }
  });

  it.each(KEYS)('%s: groups are fieldsets that start with a legend, and every radio sits in one', (key) => {
    const els = walk(sectionHtml(key, make()));
    for (const fieldset of els.filter((el) => el.tag === 'fieldset')) {
      expect(fieldset.children[0]?.tag, `a fieldset in ${key} does not start with a legend`).toBe('legend');
      expect(fieldset.children[0].text.trim()).not.toBe('');
    }
    for (const radio of els.filter((el) => el.tag === 'input' && el.attrs.type === 'radio')) {
      expect(inside(radio, 'fieldset'), `radio ${radio.attrs.id} in ${key} is outside a fieldset`).toBe(true);
      expect(radio.attrs.name).toBeTruthy();
    }
  });

  it.each(KEYS)('%s: ids are unique, buttons are real buttons, and no glyph is banned', (key) => {
    const html = sectionHtml(key, make());
    const els = walk(html);
    const ids = els.map((el) => el.attrs.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    for (const button of els.filter((el) => el.tag === 'button')) expect(button.attrs.type).toBe('button');
    expect(html).not.toMatch(BANNED);
    expect(html).not.toMatch(/\.\.\./);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('[object');
  });

  it.each(KEYS)('%s: every part is named once, so it can be patched alone', (key) => {
    const parts = walk(sectionHtml(key, make())).filter((el) => el.attrs['data-st-part']).map((el) => el.attrs['data-st-part']);
    expect(parts.length).toBeGreaterThan(0);
    expect(new Set(parts).size).toBe(parts.length);
    // The same parts exist in every state, or a patch would have nowhere to go.
    const normal = walk(sectionHtml(key, state())).filter((el) => el.attrs['data-st-part']).map((el) => el.attrs['data-st-part']);
    expect(parts).toEqual(normal);
  });
});

describe('look and layout', () => {
  it('holds the view picker at full size with the stored view checked', () => {
    const html = lookSectionHtml(state({ prefs: { ...DEFAULT_PREFS, view: 'concierge' } }));
    const els = walk(html);
    expect(html).toContain('ui-picker--full');
    const radios = els.filter((el) => el.tag === 'input' && el.attrs.name === 'view');
    expect(radios.map((el) => el.attrs.value)).toEqual(['departures', 'concierge', 'atlas']);
    expect(radios.filter((el) => el.attrs.checked).map((el) => el.attrs.value)).toEqual(['concierge']);
    expect(textOf(html)).toContain('Your own departures board. Precise and data-forward.');
    // The status line under the cards starts with what is on now.
    expect(els.find((el) => el.attrs['data-picker-status'] !== undefined).text.trim()).toBe('Concierge is on.');
  });
  it('draws the placeholder alone until the preview images exist, and the right set when they do', () => {
    expect(lookSectionHtml(state())).not.toContain('<img');
    const light = lookSectionHtml(state({ picker: { theme: 'light', baseUrl: '/TrippyPWA/', images: true, views: VIEW_CHOICES } }));
    expect(light).toContain('src="/TrippyPWA/img/views/atlas-light.webp"');
    expect(light).not.toContain('-dark.webp');
  });
  it('theme, square layout and motion are radio groups with the stored value checked', () => {
    const els = walk(lookSectionHtml(state({ prefs: { ...DEFAULT_PREFS, theme: 'light', motion: 'reduce' }, square: { override: 'off', active: false } })));
    const checked = (name) => els.filter((el) => el.attrs.name === name && el.attrs.checked).map((el) => el.attrs.value);
    const values = (name) => els.filter((el) => el.attrs.name === name).map((el) => el.attrs.value);
    expect(values('theme')).toEqual(['dark', 'light', 'system']);
    expect(checked('theme')).toEqual(['light']);
    expect(values('square')).toEqual(['auto', 'on', 'off']);
    expect(checked('square')).toEqual(['off']);
    expect(values('motion')).toEqual(['system', 'reduce']);
    expect(checked('motion')).toEqual(['reduce']);
    for (const radio of els.filter((el) => el.attrs.name === 'theme' || el.attrs.name === 'motion')) expect(radio.attrs['data-st-pref']).toBe(radio.attrs.name);
    for (const radio of els.filter((el) => el.attrs.name === 'square')) expect(radio.attrs['data-st-square']).toBe(true);
  });
  it('says what the legends say', () => {
    const legends = walk(lookSectionHtml(state())).filter((el) => el.tag === 'legend').map((el) => el.text.trim());
    expect(legends).toEqual(['View', 'Theme', 'Square layout', 'Motion']);
    expect(walk(youSectionHtml(state())).filter((el) => el.tag === 'legend').map((el) => el.text.trim())).toEqual(['Where you are based']);
    expect(walk(moneySectionHtml(state())).filter((el) => el.tag === 'legend').map((el) => el.text.trim())).toEqual(['Currency', 'Temperature', 'Time']);
    expect(walk(tripsSectionHtml(state())).filter((el) => el.tag === 'legend').map((el) => el.text.trim())).toEqual(['On the trip page']);
    const text = textOf(lookSectionHtml(state()));
    expect(text).toContain('Match device');
    expect(text).toContain('Card paging for square screens. Saved on this device.');
  });
  it('shows the square note only while square layout is active', () => {
    const NOTE = 'Square layout uses the standard look. Your view applies on other screens.';
    expect(textOf(lookSectionHtml(state()))).not.toContain(NOTE);
    expect(textOf(lookSectionHtml(state({ square: { override: 'on', active: true } })))).toContain(NOTE);
  });
});

describe('you', () => {
  it('the name field holds the stored name, escaped, and takes 100 characters', () => {
    const els = walk(youSectionHtml(state({ profile: { status: 'ready', data: { ...PROFILE, display_name: 'Avery "Ace" <b>' } } })));
    const name = byId(els, 'st-name');
    expect(name.attrs.value).toBe('Avery &quot;Ace&quot; &lt;b&gt;');
    expect(name.attrs.maxlength).toBe('100');
    expect(name.attrs['data-st-field']).toBe('name');
    expect(name.attrs.autocomplete).toBe('name');
  });
  it('the city field carries the combobox attributes and controls a listbox', () => {
    const els = walk(youSectionHtml(state()));
    const city = byId(els, 'st-city');
    expect(city.tag).toBe('input');
    expect(city.attrs.role).toBe('combobox');
    expect(city.attrs['aria-expanded']).toBe('false');
    expect(city.attrs['aria-autocomplete']).toBe('list');
    expect(city.attrs.autocomplete).toBe('off');
    expect(city.attrs.value).toBe('Lisbon, Portugal');
    expect(byId(els, city.attrs['aria-labelledby']).text.trim()).toBe('Home city and country');
    expect(byId(els, city.attrs['aria-describedby']).tag).toBe('span');
    const list = byId(els, city.attrs['aria-controls']);
    expect(list.attrs.role).toBe('listbox');
    expect(list.attrs.hidden).toBe(true);
    expect(byId(els, list.attrs['aria-labelledby'])?.tag ?? (list.attrs['aria-label'] ? 'label' : '')).toBeTruthy();
    const note = els.find((el) => el.attrs['data-st-city-note'] !== undefined);
    expect(note.attrs.role).toBe('status');
  });
  it('the passport select holds every passport in lower case and selects the stored one', () => {
    const els = walk(youSectionHtml(state()));
    const select = byId(els, 'st-nationality');
    expect(select.tag).toBe('select');
    expect(select.attrs['data-st-field']).toBe('nationality');
    expect(select.children).toHaveLength(NATIONALITIES.length + 1);
    expect(select.children.filter((option) => option.attrs.selected).map((option) => option.attrs.value)).toEqual(['pt']);
  });
  it('a stored passport the list does not know is still the selected option', () => {
    const select = byId(walk(youSectionHtml(state({ profile: { status: 'ready', data: { ...PROFILE, nationality: 'zz' } } }))), 'st-nationality');
    expect(select.children.filter((option) => option.attrs.selected).map((option) => option.attrs.value)).toEqual(['zz']);
  });
  it('full-time traveller is a checkbox, and when on the home city is optional', () => {
    const off = walk(youSectionHtml(state()));
    expect(byId(off, 'st-nomad').attrs.type).toBe('checkbox');
    expect(byId(off, 'st-nomad').attrs.checked).toBeUndefined();
    const on = youSectionHtml(state({ profile: { status: 'ready', data: { ...PROFILE, is_nomad: true } } }));
    expect(byId(walk(on), 'st-nomad').attrs.checked).toBe(true);
    expect(textOf(on)).toContain('Home city (optional)');
    expect(textOf(youSectionHtml(state()))).not.toContain('(optional)');
  });
  it('each profile control has a status line that says "Saved" or the error', () => {
    const els = walk(youSectionHtml(state({ saves: { name: 'saved', city: 'error', nationality: 'saving', nomad: { error: 'Choose a city from the list.' } } })));
    const status = (key) => byId(els, `st-${key}-status`);
    for (const key of ['name', 'city', 'nationality', 'nomad']) expect(status(key).attrs.role).toBe('status');
    expect(status('name').text.trim()).toBe('Saved');
    expect(status('name').attrs['data-kind']).toBe('saved');
    expect(status('city').text.trim()).toBe('Could not save. Try again.');
    expect(status('city').attrs['data-kind']).toBe('error');
    expect(status('nationality').text.trim()).toBe('Saving');
    expect(status('nomad').text.trim()).toBe('Choose a city from the list.');
    expect(status('nomad').attrs['data-kind']).toBe('error');
    expect(saveStatusText('saved')).toBe('Saved');
    expect(saveStatusText('error')).toBe('Could not save. Try again.');
    expect(saveStatusText('')).toBe('');
  });
  it.each([
    ['offline', OFFLINE, 'This needs a connection.'],
    // Online, and the read failed: a connection is not what is missing, so the notice does not ask for one.
    ['error', ERROR, 'Your details could not be loaded.'],
  ])('%s: says why and offers Try again instead of dead controls', (_name, make, sentence) => {
    const html = youSectionHtml(make());
    const els = walk(html);
    expect(els.find((el) => el.attrs.class === 'st-notice-text').text.trim()).toBe(sentence);
    const retry = els.find((el) => el.attrs['data-st-action'] === 'retry-profile');
    expect(retry.tag).toBe('button');
    expect(retry.text.trim()).toBe('Try again');
    expect(els.filter((el) => ['input', 'select'].includes(el.tag))).toEqual([]);
  });
  it('loading: says so, with no controls and no Try again yet', () => {
    const html = youSectionHtml(LOADING());
    expect(textOf(html)).toContain('Loading your details');
    expect(walk(html).filter((el) => ['input', 'select', 'button'].includes(el.tag))).toEqual([]);
  });
});

describe('money and units', () => {
  const codes = (els) => byId(els, 'st-currency').children.map((option) => option.attrs.value);
  it('the currency select offers the list of home currencies and selects the stored one', () => {
    const els = walk(moneySectionHtml(state()));
    expect(codes(els)).toEqual(CURRENCY_LIST.map((entry) => entry.code));
    expect(byId(els, 'st-currency').children.filter((option) => option.attrs.selected).map((option) => option.attrs.value)).toEqual(['EUR']);
    expect(byId(els, 'st-currency').attrs['data-st-field']).toBe('currency');
  });
  it('the currency select always contains the stored value, also one outside the list', () => {
    const els = walk(moneySectionHtml(state({ profile: { status: 'ready', data: { ...PROFILE, home_currency: 'ISK', home_currency_symbol: 'kr' } }, home: { code: 'ISK', symbol: 'kr' } })));
    expect(codes(els)).toEqual([...CURRENCY_LIST.map((entry) => entry.code), 'ISK']);
    expect(byId(els, 'st-currency').children.filter((option) => option.attrs.selected).map((option) => option.attrs.value)).toEqual(['ISK']);
  });
  it('with no stored currency nothing false is selected: a "Choose" option leads', () => {
    const els = walk(moneySectionHtml(state({ profile: { status: 'ready', data: { ...PROFILE, home_currency: null, home_currency_symbol: null } }, home: null })));
    const [first] = byId(els, 'st-currency').children;
    expect(first.attrs.value).toBe('');
    expect(first.attrs.selected).toBe(true);
    expect(first.text.trim()).toBe('Choose a currency');
  });
  it('the three device controls carry their pref and its stored value', () => {
    const els = walk(moneySectionHtml(state({ prefs: { ...DEFAULT_PREFS, homeCurrencyFirst: false, temperatureUnit: 'F', timeFormat: '24h' } })));
    expect(byId(els, 'st-home-first').attrs['data-st-pref']).toBe('homeCurrencyFirst');
    expect(byId(els, 'st-home-first').attrs.checked).toBeUndefined();
    const checked = (name) => els.filter((el) => el.attrs.name === name && el.attrs.checked).map((el) => el.attrs.value);
    expect(checked('temperatureUnit')).toEqual(['F']);
    expect(checked('timeFormat')).toEqual(['24h']);
  });
  it('shows a live example under each', () => {
    const text = textOf(moneySectionHtml(state({ home: { code: 'SGD', symbol: 'S$' } })));
    expect(text).toContain('Example: about S$1,099, then HK$6,347');
    expect(text).toContain('Example: 16 to 23°C');
    expect(text).toContain('Example: 2:30 PM');
  });
  it.each([
    ['offline', OFFLINE, 'This needs a connection.'],
    ['error', ERROR, 'Your home currency could not be loaded.'],
  ])('%s: the currency row says why it is not there, the device controls still work', (_name, make, sentence) => {
    const html = moneySectionHtml(make());
    const els = walk(html);
    expect(byId(els, 'st-currency')).toBeUndefined();
    expect(els.find((el) => el.attrs.class === 'st-notice-text').text.trim()).toBe(sentence);
    expect(els.find((el) => el.attrs['data-st-action'] === 'retry-profile').tag).toBe('button');
    expect(byId(els, 'st-home-first').attrs.disabled).toBeUndefined();
    expect(els.filter((el) => el.attrs.name === 'timeFormat')).toHaveLength(2);
  });
  it('a failed currency save shows the error line', () => {
    const els = walk(moneySectionHtml(state({ saves: { currency: 'error' } })));
    expect(byId(els, 'st-currency-status').text.trim()).toBe('Could not save. Try again.');
  });
});

describe('exampleTexts', () => {
  it('money follows the home currency and which one leads', () => {
    expect(exampleTexts({ homeCurrencyFirst: true, home: { code: 'SGD', symbol: 'S$' } }).money).toBe('about S$1,099, then HK$6,347');
    expect(exampleTexts({ homeCurrencyFirst: false, home: { code: 'SGD', symbol: 'S$' } }).money).toBe('HK$6,347, then about S$1,099');
  });
  it('a converted amount always carries "about"', () => {
    for (const { code, symbol } of CURRENCY_LIST) {
      for (const homeCurrencyFirst of [true, false]) {
        const { money } = exampleTexts({ homeCurrencyFirst, home: { code, symbol } });
        expect(money, code).toMatch(/about /);
        expect(money, code).toMatch(/, then /);
      }
    }
  });
  it('uses another trip currency when home is the example currency', () => {
    const { money } = exampleTexts({ homeCurrencyFirst: true, home: { code: 'HKD', symbol: 'HK$' } });
    expect(money).toMatch(/^about HK\$[\d,]+, then ¥120,000$/);
  });
  it('says so when the home currency cannot be converted, or is not set', () => {
    expect(exampleTexts({ homeCurrencyFirst: true, home: { code: 'QQQ', symbol: 'Q' } }).money).toBe('HK$6,347. Your home currency has no exchange rate in Trippy, so amounts stay in the trip currency.');
    expect(exampleTexts({ homeCurrencyFirst: true, home: null }).money).toBe('HK$6,347. Set a home currency to see converted amounts.');
  });
  it('temperature and time follow the display prefs', () => {
    expect(exampleTexts({ homeCurrencyFirst: true, home: null })).toMatchObject({ temperature: '16 to 23°C', time: '2:30 PM' });
    setDisplayPrefs({ timeFormat: '24h', temperatureUnit: 'F' });
    expect(exampleTexts({ homeCurrencyFirst: true, home: null })).toMatchObject({ temperature: '61 to 73°F', time: '14:30' });
  });
});
