// The notification row of Settings (blueprint 6.5): which of the five states applies on this device,
// what each state says, and the test notification. Owner: F12.
import { describe, it, expect, vi } from 'vitest';
import {
  NOTIFY_STATES, isAppleMobile, notificationState, notificationRow, readNotificationEnv, sendTestNotification,
} from './notify.js';

const BANNED = /[\u2014\u2013\u00b7\u2022\u2027\u2219\u2026]/; // em dash, en dash, middle dot, bullets, ellipsis
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

describe('isAppleMobile', () => {
  it.each([
    ['an iPhone', { userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 }, true],
    ['an iPad that names itself', { userAgent: IPHONE_UA.replace('iPhone;', 'iPad;'), platform: 'iPad', maxTouchPoints: 5 }, true],
    ['an iPad that says it is a Mac', { userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 }, true],
    ['a Mac', { userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 }, false],
    ['desktop Chrome', { userAgent: CHROME_UA, platform: 'Linux x86_64', maxTouchPoints: 0 }, false],
    ['an Android phone', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36', platform: 'Linux armv81', maxTouchPoints: 5 }, false],
    ['nothing at all', undefined, false],
  ])('%s', (_name, facts, expected) => {
    expect(isAppleMobile(facts)).toBe(expected);
  });
});

describe('notificationState: the five states of blueprint 6.5', () => {
  it('an iPhone or iPad with Trippy on the Home Screen cannot be notified, whatever the permission says', () => {
    for (const permission of ['default', 'granted', 'denied']) {
      expect(notificationState({ supported: true, permission, appleMobile: true, standalone: true })).toBe('ios-installed');
    }
    expect(notificationState({ supported: false, permission: 'default', appleMobile: true, standalone: true })).toBe('ios-installed');
  });
  it('an iPhone in the browser has no notifications at all', () => {
    expect(notificationState({ supported: false, permission: 'default', appleMobile: true, standalone: false })).toBe('unsupported');
  });
  it('a browser without the Notification API is not supported', () => {
    expect(notificationState({ supported: false, permission: 'granted', appleMobile: false, standalone: false })).toBe('unsupported');
  });
  it.each(['default', 'granted', 'denied'])('permission %s is its own state', (permission) => {
    expect(notificationState({ supported: true, permission, appleMobile: false, standalone: false })).toBe(permission);
    // An installed app on another platform (Android, desktop) keeps running in the background.
    expect(notificationState({ supported: true, permission, appleMobile: false, standalone: true })).toBe(permission);
  });
  it('an unknown permission reads as not asked yet, and no facts as not supported', () => {
    expect(notificationState({ supported: true, permission: 'prompt', appleMobile: false, standalone: false })).toBe('default');
    expect(notificationState()).toBe('unsupported');
    expect(notificationState(null)).toBe('unsupported');
  });
  it('names exactly five states', () => {
    expect([...NOTIFY_STATES].sort()).toEqual(['default', 'denied', 'granted', 'ios-installed', 'unsupported']);
  });
});

describe('notificationRow: what each state shows', () => {
  it('the installed iPhone says why and offers no button', () => {
    const row = notificationRow('ios-installed');
    expect(row.text).toBe('iPhone pauses Trippy when you leave it, so it cannot notify you yet. The plan will be waiting when you come back.');
    expect(row.action).toBeNull();
  });
  it('not supported offers no button', () => {
    expect(notificationRow('unsupported')).toEqual({ state: 'unsupported', text: 'This browser cannot show notifications.', action: null });
  });
  it('not asked yet offers to turn them on', () => {
    const row = notificationRow('default');
    expect(row.text).toBe('Trippy can tell you when a plan finishes while it stays open in another tab or in the background.');
    expect(row.action).toEqual({ key: 'notify-enable', label: 'Turn on notifications' });
  });
  it('granted says how to stop and offers a test', () => {
    const row = notificationRow('granted');
    expect(row.text).toBe('On for this device, while Trippy stays open in another tab or in the background. To stop, turn notifications off for this site in your browser settings.');
    expect(row.action).toEqual({ key: 'notify-test', label: 'Send a test notification' });
  });
  it('denied offers no button, because a page cannot ask again', () => {
    expect(notificationRow('denied')).toEqual({ state: 'denied', text: 'Blocked in your browser settings for this site.', action: null });
  });
  it('an unknown state reads as not supported', () => {
    expect(notificationRow('later').state).toBe('unsupported');
  });
  it('keeps the copy rules in every state', () => {
    for (const state of NOTIFY_STATES) {
      const row = notificationRow(state);
      expect(row.text).not.toMatch(BANNED);
      if (row.action) expect(row.action.label).not.toMatch(BANNED);
    }
  });
});

describe('readNotificationEnv', () => {
  it('reads the facts from the window it is given', () => {
    const win = {
      Notification: { permission: 'granted' },
      navigator: { userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5, standalone: true },
      matchMedia: () => ({ matches: false }),
    };
    expect(readNotificationEnv(win)).toEqual({ supported: true, permission: 'granted', appleMobile: true, standalone: true });
  });
  it('reads an installed app from the display mode', () => {
    const win = { Notification: { permission: 'default' }, navigator: { userAgent: CHROME_UA, platform: 'Linux x86_64', maxTouchPoints: 0 }, matchMedia: (query) => ({ matches: query.includes('standalone') }) };
    expect(readNotificationEnv(win)).toEqual({ supported: true, permission: 'default', appleMobile: false, standalone: true });
  });
  it('survives a window with nothing on it, and no window', () => {
    expect(readNotificationEnv({})).toEqual({ supported: false, permission: 'default', appleMobile: false, standalone: false });
    expect(readNotificationEnv(null)).toEqual({ supported: false, permission: 'default', appleMobile: false, standalone: false });
  });
});

describe('sendTestNotification', () => {
  const granted = () => {
    const made = [];
    function Notification(title, options) { made.push({ title, options }); }
    Notification.permission = 'granted';
    return { Notification, made };
  };

  it('goes through the service worker registration when a worker controls the page, as the real one does', async () => {
    const { Notification, made } = granted();
    const showNotification = vi.fn(async () => {});
    const win = { Notification, navigator: { serviceWorker: { controller: {}, ready: Promise.resolve({ showNotification }) } } };
    expect(await sendTestNotification({ win, baseUrl: '/TrippyPWA/' })).toBe(true);
    expect(made).toEqual([]);
    expect(showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = showNotification.mock.calls[0];
    expect(title).toBe('Trippy');
    expect(options.body).toBe('This is a test. A finished plan will be announced like this.');
    expect(options.icon).toBe('/TrippyPWA/icons/icon-192.png');
    expect(options.data).toEqual({ url: '#/settings' });
    expect(options.body).not.toMatch(BANNED);
  });
  it('shows it from the page when no worker controls it', async () => {
    const { Notification, made } = granted();
    expect(await sendTestNotification({ win: { Notification, navigator: {} }, baseUrl: '/' })).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0].title).toBe('Trippy');
    expect(made[0].options.icon).toBe('/icons/icon-192.png');
  });
  it('is false, and shows nothing, without permission or without the API', async () => {
    const { Notification, made } = granted();
    Notification.permission = 'default';
    expect(await sendTestNotification({ win: { Notification, navigator: {} } })).toBe(false);
    expect(await sendTestNotification({ win: { navigator: {} } })).toBe(false);
    expect(await sendTestNotification({ win: null })).toBe(false);
    expect(made).toEqual([]);
  });
  it('is false when the browser refuses to show it', async () => {
    const { Notification } = granted();
    const showNotification = vi.fn(async () => { throw new Error('refused'); });
    const win = { Notification, navigator: { serviceWorker: { controller: {}, ready: Promise.resolve({ showNotification }) } } };
    expect(await sendTestNotification({ win })).toBe(false);
    function Throws() { throw new TypeError('Illegal constructor'); }
    Throws.permission = 'granted';
    expect(await sendTestNotification({ win: { Notification: Throws, navigator: {} } })).toBe(false);
  });
});
