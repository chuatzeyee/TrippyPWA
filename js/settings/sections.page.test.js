// The Settings page as markup, second half (blueprint 6.4 to 6.7, 5.2): Trips, Notifications, Data,
// Account, About, the status line under the title and the page frame. Owner: F12.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SECTIONS, settingsPageHtml, syncStatusText, savedAtText, entryBuildId,
  tripsSectionHtml, notificationsSectionHtml, dataSectionHtml, accountSectionHtml, aboutSectionHtml,
} from './sections.js';
import { DEFAULT_PREFS } from '../lib/prefs.js';
import { setDisplayPrefs, setLocaleFromFlag } from '../lib/locale.js';
import { NOTIFY_STATES, notificationRow } from './notify.js';
import { BANNED, ERROR, KEYS, OFFLINE, VARIANTS, byId, byIdHtml, state, textOf, walk } from './sections.test-kit.js';

beforeEach(() => {
  setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' });
  setLocaleFromFlag('sg');
});

describe('trips', () => {
  it('has the three switches with their prefs, labels and helper lines', () => {
    const html = tripsSectionHtml(state({ prefs: { ...DEFAULT_PREFS, autoOpenNextDay: false } }));
    const els = walk(html);
    const boxes = els.filter((el) => el.tag === 'input' && el.attrs.type === 'checkbox');
    expect(boxes.map((el) => el.attrs['data-st-pref'])).toEqual(['openTodayFirst', 'autoOpenNextDay', 'showVenuePhotos']);
    expect(boxes.map((el) => el.attrs.checked === true)).toEqual([true, false, true]);
    const text = textOf(html);
    expect(text).toContain("Open today's plan first when a trip is live");
    expect(text).toContain('Whole trip links always open at the top.');
    expect(text).toContain('Open the next day as I scroll');
    expect(text).toContain('Show venue photos');
    expect(text).toContain('On the trip page: stops, day thumbnails and areas. Cover photos stay, and the PDF export always includes photos.');
  });
  it('a helper line describes its switch', () => {
    const els = walk(tripsSectionHtml(state()));
    const box = byId(els, 'st-open-today');
    expect(byId(els, box.attrs['aria-describedby']).text.trim()).toBe('Whole trip links always open at the top.');
  });
  it('works the same offline', () => {
    expect(tripsSectionHtml(OFFLINE())).toBe(tripsSectionHtml(state({ online: false })));
    expect(walk(tripsSectionHtml(OFFLINE())).filter((el) => el.attrs.disabled)).toEqual([]);
  });
});

describe('notifications', () => {
  it.each(NOTIFY_STATES)('state %s shows its sentence and its button, or none', (name) => {
    const html = notificationsSectionHtml(state({ notify: { state: name, message: '' } }));
    const row = notificationRow(name);
    expect(textOf(html)).toContain('Tell me when a trip is ready');
    expect(textOf(html)).toContain(row.text);
    const buttons = walk(html).filter((el) => el.tag === 'button');
    expect(buttons.map((el) => el.attrs['data-st-action'])).toEqual(row.action ? [row.action.key] : []);
    if (row.action) expect(buttons[0].text.trim()).toBe(row.action.label);
  });
  it('has a status line for the result of a test', () => {
    const els = walk(notificationsSectionHtml(state({ notify: { state: 'granted', message: 'Test notification sent.' } })));
    const status = byId(els, 'st-notify-status');
    expect(status.attrs.role).toBe('status');
    expect(status.children.map((el) => el.text.trim())).toEqual(['Test notification sent.']);
    // The live region is in the page before it has anything to say.
    const quiet = byId(walk(notificationsSectionHtml(state())), 'st-notify-status');
    expect(quiet.attrs.role).toBe('status');
    expect(quiet.children).toEqual([]);
  });
});

describe('data', () => {
  it('lists the trips saved on this device with when each was saved, titles escaped', () => {
    const html = dataSectionHtml(state());
    const items = walk(html).filter((el) => el.tag === 'li');
    expect(items).toHaveLength(2);
    expect(html).toContain('Porto &amp; the Douro &lt;valley&gt;');
    expect(textOf(html)).toContain('Saved 19 Nov 2026, 10:10 AM');
    expect(textOf(html)).toContain('Saved 18 Nov 2026, 9:05 PM');
  });
  it('an empty list says how a trip gets saved, and "Clear offline copies" is off', () => {
    const html = dataSectionHtml(state({ offlineTrips: [] }));
    const els = walk(html);
    expect(els.filter((el) => el.tag === 'li')).toEqual([]);
    expect(els.filter((el) => el.tag === 'ul')).toEqual([]);
    expect(textOf(html)).toContain('No trips are saved on this device yet. Open a trip while online to keep a copy.');
    expect(els.find((el) => el.attrs['data-st-action'] === 'clear-offline').attrs.disabled).toBe(true);
  });
  it('with saved trips "Clear offline copies" is on, also offline', () => {
    for (const make of [state, OFFLINE]) {
      const clear = walk(dataSectionHtml(make())).find((el) => el.attrs['data-st-action'] === 'clear-offline');
      expect(clear.text.trim()).toBe('Clear offline copies');
      expect(clear.attrs.disabled).toBeUndefined();
    }
  });
  it('"Delete all my trips" is last, destructive, and disabled offline with the reason', () => {
    const online = walk(dataSectionHtml(state()));
    const buttons = online.filter((el) => el.tag === 'button');
    expect(buttons.at(-1).attrs['data-st-action']).toBe('delete-trips');
    expect(buttons.at(-1).text.trim()).toBe('Delete all my trips');
    expect(buttons.at(-1).attrs.disabled).toBeUndefined();
    expect(buttons.at(-1).attrs.class).toContain('st-btn--danger');
    const html = dataSectionHtml(OFFLINE());
    const offline = walk(html).find((el) => el.attrs['data-st-action'] === 'delete-trips');
    expect(offline.attrs.disabled).toBe(true);
    expect(textOf(byIdHtml(html, offline.attrs['aria-describedby']))).toContain('This needs a connection');
  });
  it('says what the delete keeps', () => {
    expect(textOf(dataSectionHtml(state()))).toContain('Trips shared with you stay, and so do your profile and settings.');
  });
  it('shows the result of an action in a status line', () => {
    const els = walk(dataSectionHtml(ERROR()));
    const status = byId(els, 'st-data-status');
    expect(status.attrs.role).toBe('status');
    expect(status.children.map((el) => el.text.trim())).toEqual(['Your trips could not be deleted. Try again.']);
    expect(byId(walk(dataSectionHtml(state())), 'st-data-status').children).toEqual([]);
  });
});

describe('savedAtText', () => {
  it('is the local date and clock time of the copy', () => {
    expect(savedAtText(new Date(2026, 10, 19, 10, 10).toISOString())).toBe('Saved 19 Nov 2026, 10:10 AM');
    setDisplayPrefs({ timeFormat: '24h' });
    expect(savedAtText(new Date(2026, 10, 19, 21, 5).toISOString())).toBe('Saved 19 Nov 2026, 21:05');
  });
  it('is empty when the time is missing or not a time', () => {
    expect(savedAtText(null)).toBe('');
    expect(savedAtText('yesterday')).toBe('');
  });
});

describe('account', () => {
  it('shows the sign-in email, escaped, and Sign out', () => {
    const html = accountSectionHtml(state({ account: { email: 'a<b>@example.com', admin: false } }));
    expect(html).toContain('a&lt;b&gt;@example.com');
    const els = walk(html);
    const out = els.find((el) => el.attrs['data-st-action'] === 'sign-out');
    expect(out.text.trim()).toBe('Sign out');
    expect(out.attrs.disabled).toBeUndefined();
    expect(els.filter((el) => el.tag === 'a')).toEqual([]);
  });
  it('shows the Admin link to an admin only', () => {
    const admin = walk(accountSectionHtml(state({ account: { email: 'avery@example.com', admin: true } }))).filter((el) => el.tag === 'a');
    expect(admin.map((el) => [el.attrs.href, el.text.trim()])).toEqual([['#/admin', 'Admin']]);
  });
  it('without a known email says the device is signed in', () => {
    expect(textOf(accountSectionHtml(state({ account: { email: null, admin: false } })))).toContain('You are signed in on this device.');
  });
  it('offline, Sign out is off and says why', () => {
    const html = accountSectionHtml(OFFLINE());
    const out = walk(html).find((el) => el.attrs['data-st-action'] === 'sign-out');
    expect(out.attrs.disabled).toBe(true);
    expect(textOf(html)).toContain('Signing out needs a connection.');
  });
});

describe('about', () => {
  it('shows the build, the photo sources and the two map credits', () => {
    const html = aboutSectionHtml(state({ buildId: 'a1b2c3d4e5f6' }));
    const text = textOf(html);
    expect(text).toContain('Version a1b2c3d4e5f6');
    expect(text).toContain('Photos via Wikimedia Commons');
    expect(text).toContain('Map data © OpenStreetMap contributors');
    expect(text).toContain('World outline: Natural Earth, public domain');
    for (const link of walk(html).filter((el) => el.tag === 'a')) {
      expect(link.attrs.href).toMatch(/^https:\/\//);
      expect(link.attrs.rel).toBe('noopener noreferrer');
    }
  });
  it('escapes the build id and says when it is not known', () => {
    expect(aboutSectionHtml(state({ buildId: '<x>' }))).toContain('&lt;x&gt;');
    expect(textOf(aboutSectionHtml(state({ buildId: '' })))).toContain('Version not known');
  });
});

describe('entryBuildId', () => {
  it('is the hash in the entry file name', () => {
    expect(entryBuildId('/assets/index-BxK3f_9a.js')).toBe('BxK3f_9a');
    expect(entryBuildId('https://example.com/TrippyPWA/assets/index-D4c-Zq1x.js?v=1')).toBe('D4c-Zq1x');
  });
  it('is empty when there is none', () => {
    expect(entryBuildId('/js/main.js')).toBe('');
    expect(entryBuildId(null)).toBe('');
  });
});

describe('syncStatusText', () => {
  it('before the migration: the device only', () => {
    expect(syncStatusText({ remote: 'unavailable', pending: [], online: true })).toBe('Saved on this device');
    expect(syncStatusText({ remote: 'unavailable', pending: ['theme'], online: false })).toBe('Saved on this device');
  });
  it('with the column and nothing pending: the device and the account', () => {
    expect(syncStatusText({ remote: 'available', pending: [], online: true })).toBe('Saved on this device and to your account');
  });
  it('anything else while offline waits for the connection', () => {
    expect(syncStatusText({ remote: 'available', pending: ['theme'], online: false })).toBe('Saved on this device. Syncing when you are back online');
    expect(syncStatusText({ remote: 'unknown', pending: [], online: false })).toBe('Saved on this device. Syncing when you are back online');
  });
  it('anything else while online is on its way', () => {
    expect(syncStatusText({ remote: 'available', pending: ['theme'], online: true })).toBe('Saved on this device. Syncing to your account');
    expect(syncStatusText({ remote: 'unknown', pending: [], online: true })).toBe('Saved on this device. Syncing to your account');
  });
  it('reads missing facts as the cautious line', () => {
    expect(syncStatusText()).toBe('Saved on this device. Syncing to your account');
  });
});

describe('settingsPageHtml', () => {
  it('is the page root with one h1, the Done link, the status line and the eight sections', () => {
    const html = settingsPageHtml(state());
    const els = walk(html);
    const [root] = els;
    expect(root.attrs.class.split(' ')).toContain('st-page');
    expect(root.attrs['data-view']).toBe('settings');
    expect(els.filter((el) => el.tag === 'h1').map((el) => el.text.trim())).toEqual(['Settings']);
    const done = els.find((el) => el.attrs['data-st-done'] !== undefined);
    expect(done.tag).toBe('a');
    expect(done.attrs.href).toBe('#/');
    expect(done.text.trim()).toBe('Done');
    const sync = els.find((el) => el.attrs['data-st-part'] === 'sync');
    expect(sync.attrs.role).toBe('status');
    expect(textOf(html)).toContain('Saved on this device');
    expect(els.filter((el) => el.tag === 'section').map((el) => el.attrs['data-st-section'])).toEqual(KEYS);
    const ids = els.map((el) => el.attrs.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('has an "On this page" row with one chip per section, in order', () => {
    const els = walk(settingsPageHtml(state()));
    const nav = els.find((el) => el.tag === 'nav');
    expect(byId(els, nav.attrs['aria-labelledby']).text.trim()).toBe('On this page');
    const chips = els.filter((el) => el.attrs['data-st-jump']);
    expect(chips.map((el) => el.attrs['data-st-jump'])).toEqual(KEYS);
    expect(chips.map((el) => el.text.trim())).toEqual(SECTIONS.map((section) => section.title));
    for (const chip of chips) {
      expect(chip.tag).toBe('button');
      expect(chip.attrs['aria-controls'] ?? `st-${chip.attrs['data-st-jump']}`).toBe(`st-${chip.attrs['data-st-jump']}`);
    }
  });
  it('fades the chip row at the edge where it is cut, and starts with the first section marked', () => {
    const els = walk(settingsPageHtml(state()));
    const list = els.find((el) => String(el.attrs.class ?? '').split(' ').includes('st-toc-list'));
    expect(list.attrs['data-st-cut']).toBe('none'); // js/settings/toc.js writes which edge is cut; the sheet fades it
    expect(list.attrs.class.split(' ')).not.toContain('ui-scroll-fade'); // one source for the mask, not two
    const chips = els.filter((el) => el.attrs['data-st-jump']);
    expect(chips.filter((el) => el.attrs['aria-current']).map((el) => [el.attrs['data-st-jump'], el.attrs['aria-current']])).toEqual([[KEYS[0], 'true']]);
  });
  it.each(Object.keys(VARIANTS))('keeps the copy rules, %s state', (variant) => {
    const html = settingsPageHtml(VARIANTS[variant]());
    expect(html).not.toMatch(BANNED);
    expect(html).not.toContain('undefined');
  });
});
