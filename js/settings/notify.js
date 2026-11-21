// Notifications on this device (blueprint 6.5): which of the five states applies, what the Settings
// row says in each, and the test notification. The real notification is raised by the page when a
// plan finishes while the page is hidden (js/services/generation-manager.js); there is no push
// message, so a phone that freezes a backgrounded app cannot deliver it, and the row says so. Owner: F12.

/** The five rows of blueprint 6.5. */
export const NOTIFY_STATES = Object.freeze(['ios-installed', 'unsupported', 'default', 'granted', 'denied']);

const ROWS = Object.freeze({
  'ios-installed': {
    text: 'iPhone pauses Trippy when you leave it, so it cannot notify you yet. The plan will be waiting when you come back.',
    action: null,
  },
  unsupported: { text: 'This browser cannot show notifications.', action: null },
  default: {
    text: 'Trippy can tell you when a plan finishes while it stays open in another tab or in the background.',
    action: { key: 'notify-enable', label: 'Turn on notifications' },
  },
  granted: {
    text: 'On for this device, while Trippy stays open in another tab or in the background. To stop, turn notifications off for this site in your browser settings.',
    action: { key: 'notify-test', label: 'Send a test notification' },
  },
  denied: { text: 'Blocked in your browser settings for this site.', action: null },
});

const TEST_BODY = 'This is a test. A finished plan will be announced like this.';
const ICON_PATH = 'icons/icon-192.png';

/**
 * Pure. An iPhone, an iPod touch or an iPad. An iPad asks for desktop pages by default and then
 * names itself a Mac; a Mac has no touch points.
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number }} [facts]
 */
export function isAppleMobile({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/\b(iPhone|iPad|iPod)\b/.test(String(userAgent)) || /^(iPhone|iPad|iPod)/.test(String(platform))) return true;
  return String(platform) === 'MacIntel' && Number(maxTouchPoints) > 1;
}

/**
 * Pure. Which row of blueprint 6.5 applies.
 * @param {{ supported?: boolean, permission?: string, appleMobile?: boolean, standalone?: boolean }|null} [env]
 *   supported    the Notification API exists
 *   permission   Notification.permission
 *   appleMobile  isAppleMobile()
 *   standalone   Trippy runs as an installed app
 * @returns {'ios-installed'|'unsupported'|'default'|'granted'|'denied'}
 */
export function notificationState(env) {
  const { supported = false, permission = 'default', appleMobile = false, standalone = false } = env ?? {};
  // Installed to the Home Screen the API exists, but iOS freezes the page as soon as it is left, and
  // the page is what raises the notification. Checked first, whatever the permission says.
  if (appleMobile && standalone) return 'ios-installed';
  if (!supported) return 'unsupported';
  return permission === 'granted' || permission === 'denied' ? permission : 'default';
}

/**
 * Pure. What the row shows in a state: its sentence and its one button, if it has one.
 * @param {string} state a value of notificationState(); anything else reads as 'unsupported'
 * @returns {{ state: string, text: string, action: { key: 'notify-enable'|'notify-test', label: string }|null }}
 */
export function notificationRow(state) {
  const known = Object.hasOwn(ROWS, state) ? state : 'unsupported';
  const { text, action } = ROWS[known];
  return { state: known, text, action: action ? { ...action } : null };
}

const browserWindow = () => (typeof window === 'undefined' ? null : window);

/**
 * The facts notificationState() needs, read from the browser. Never throws.
 * @param {object|null} [win] the window; tests pass their own
 */
export function readNotificationEnv(win = browserWindow()) {
  const nav = win?.navigator ?? {};
  let standalone = nav.standalone === true;
  try {
    standalone = standalone || win?.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch { /* no media queries here: only navigator.standalone counts */ }
  let permission = 'default';
  try { permission = String(win?.Notification?.permission ?? 'default'); } catch { /* a blocked getter */ }
  return {
    supported: Boolean(win?.Notification),
    permission,
    appleMobile: isAppleMobile({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints }),
    standalone,
  };
}

/**
 * Shows one notification now, the way the real one is shown: through the service worker registration
 * when a worker controls the page, else from the page itself. A click on it opens Settings.
 * @param {{ win?: object|null, baseUrl?: string }} [opts] baseUrl is the app's base path, '/' by default
 * @returns {Promise<boolean>} true when the browser took it; false without permission, without the API,
 *   or when the browser refused
 */
export async function sendTestNotification({ win = browserWindow(), baseUrl = '/' } = {}) {
  const Notification = win?.Notification;
  if (!Notification || Notification.permission !== 'granted') return false;
  const base = typeof baseUrl === 'string' && baseUrl.startsWith('/') ? (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : '/';
  const icon = `${base}${ICON_PATH}`;
  try {
    const workers = win.navigator?.serviceWorker;
    if (workers?.controller) {
      const registration = await workers.ready;
      await registration.showNotification('Trippy', { body: TEST_BODY, icon, badge: icon, tag: 'trippy-test', renotify: true, data: { url: '#/settings' } });
    } else {
      new Notification('Trippy', { body: TEST_BODY, icon, tag: 'trippy-test' });
    }
    return true;
  } catch {
    return false;
  }
}
