// What a change or a click on the Settings page does (blueprint 6.1 to 6.7). One delegated listener
// per event type on the page root, so a redrawn part needs no rebinding. `page` is the mounted page
// of js/settings/settings-page.js: its state fields, refresh() and reloadProfile(). Owner: F12.
import { getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { scrollBehavior } from '../lib/motion.js';
import { setLocaleFromFlag } from '../lib/locale.js';
import { setSquareOverride } from '../lib/square-mode.js';
import { setPref } from '../data/prefs-store.js';
import { setHomeCurrency } from '../data/user-prefs.js';
import { saveProfileSummary } from '../data/profile-cache.js';
import { updateProfile } from '../data/profile-repository.js';
import { clearAllUserData, clearOfflineTripCache, fetchAllTrips } from '../data/trip-repository.js';
import { clearTicksFor } from '../data/tick-store.js';
import { deleteMyAccount, signOutThisDevice } from '../data/account-repository.js';
import { clearDeviceData } from '../data/device-data.js';
import { confirmDialog } from '../views/shared/confirm-dialog.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { saveStatusText } from './controls.js';
import { sendTestNotification } from './notify.js';
import { cityLabel, mergeProfile, profilePatch } from './profile-fields.js';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const alive = (page) => page.root.isConnected;

// ---- Profile-backed controls: save on change, say "Saved" or the error, go back on failure ----

/** Writes the status line of one control in place (a part with a focused text field is not redrawn) and remembers it. */
function setSave(page, field, save) {
  page.saves = { ...page.saves, [field]: save };
  const line = page.root.querySelector(`[data-st-status="${field}"]`);
  if (!line) return;
  const own = save !== null && typeof save === 'object' ? String(save.error ?? '') : '';
  line.textContent = own || saveStatusText(save);
  const kind = own ? 'error' : saveStatusText(save) ? save : '';
  if (kind) line.setAttribute('data-kind', kind);
  else line.removeAttribute('data-kind');
}

function setValue(page, selector, value) {
  const control = page.root.querySelector(selector);
  if (control) control.value = value;
}

/** The values a patch would replace, to go back to when the save fails. */
const valuesBefore = (row, patch) => Object.fromEntries(Object.keys(patch).map((key) => [key, row?.[key] ?? null]));
/** Nothing to write: every value is the stored one already (no value and '' are the same thing here). */
const unchanged = (row, patch) => Object.entries(patch).every(([key, value]) => (row?.[key] ?? '') === (value ?? ''));

/** Runs one write to this device. It may fail (storage full or blocked): the profile is saved all the same. */
function deviceWrite(what, write) {
  try {
    write();
  } catch (e) {
    logger.warn('ui', 'A saved profile setting could not be copied to this device', { what, error: e?.message });
  }
}

function afterProfileSave(page, patch) {
  const row = page.profile.data;
  if ('home_currency' in patch && row.home_currency) {
    deviceWrite('home currency', () => setHomeCurrency(row.home_currency, row.home_currency_symbol || row.home_currency));
  }
  if (patch.home_flag) deviceWrite('locale', () => setLocaleFromFlag(patch.home_flag));
  const userId = getUser()?.id;
  if (userId) deviceWrite('profile summary', () => saveProfileSummary(userId, row));
}

/**
 * Saves one profile-backed control.
 * @param {object} page   the mounted page
 * @param {'name'|'city'|'nationality'|'nomad'|'currency'} field
 * @param {*} input       what profilePatch() takes for the field
 */
export async function saveProfileField(page, field, input) {
  const before = page.profile.data;
  const result = profilePatch(field, input, before);
  if (!result.ok) {
    setSave(page, field, { error: result.error });
    page.root.querySelector(`[data-st-field="${field}"]`)?.setAttribute('aria-invalid', 'true');
    return;
  }
  const { patch } = result;
  // A text field saves as the focus leaves it. The redraw waits a tick, until the focus has landed,
  // so the control it lands on is not replaced under it.
  if (unchanged(before, patch)) {
    if (page.saves[field] && page.saves[field] !== 'saved') setSave(page, field, '');
    page.refreshSoon();
    return;
  }
  const undo = valuesBefore(before, patch);
  page.edits += 1;
  page.profile = { status: 'ready', data: mergeProfile(before, patch) };
  setSave(page, field, 'saving');
  page.refreshSoon();
  let error = null;
  try {
    ({ error } = await updateProfile(patch));
  } catch (e) {
    error = e?.message || 'failed';
  }
  if (!alive(page)) return;
  if (error) {
    logger.warn('ui', 'A profile setting could not be saved', { field, error });
    page.edits += 1;
    page.profile = { ...page.profile, data: mergeProfile(page.profile.data, undo) };
    setSave(page, field, 'error');
    // A text field with the focus in it is not redrawn, so its last saved value is put back by hand.
    if (field === 'name') setValue(page, '#st-name', page.profile.data?.display_name ?? '');
    if (field === 'city') setValue(page, '#st-city', cityLabel(page.profile.data));
    page.refresh();
    return;
  }
  afterProfileSave(page, patch);
  setSave(page, field, 'saved');
  page.refresh();
}

function onProfileChange(page, control) {
  const field = control.getAttribute('data-st-field');
  control.removeAttribute('aria-invalid');
  const input = field === 'nomad' ? control.checked : control.value;
  saveProfileField(page, field, input).then(() => {
    // A name is stored trimmed: show what was stored, unless the user is typing again.
    if (field === 'name' && alive(page) && page.saves.name === 'saved' && document.activeElement !== control) control.value = page.profile.data?.display_name ?? '';
  });
}

// ---- Device preferences ----

function onPrefChange(page, control) {
  const key = control.getAttribute('data-st-pref');
  const value = control.type === 'checkbox' ? control.checked : control.value;
  const result = setPref(key, value);
  if (!result.ok) logger.warn('ui', 'A preference was refused', { key, errors: result.errors });
  page.refresh(); // also when the value did not change: the control shows the stored value again
}

// ---- Data ----

function sayData(page, message) {
  page.dataMessage = message;
  page.refresh();
}

async function clearOffline(page) {
  const yes = await confirmDialog({
    title: 'Clear offline copies?',
    body: 'This removes the trips, the trip list and the briefings kept on this device.\nYour trips stay in your account.',
    confirmLabel: 'Clear copies',
  });
  if (!yes || !alive(page)) return;
  clearOfflineTripCache();
  sayData(page, 'Offline copies cleared.');
}

/** The key the Discover tab keeps a trip's town groups under (CACHE_PREFIX in js/services/town-mapper.js, which does not export it). */
const TOWN_GROUPS_PREFIX = 'towns-v1-';

/** Removes the town groups kept on this device for each given trip. Keys are matched whole, so every other trip keeps its own. */
function clearTownGroupsFor(tripIds) {
  let store = null;
  try { store = globalThis.localStorage || null; } catch { /* storage is closed: nothing is kept there */ }
  if (!store) return;
  for (const id of tripIds) {
    try { store.removeItem(TOWN_GROUPS_PREFIX + id); } catch { /* nothing to remove, or storage is closed */ }
  }
}

async function deleteTrips(page) {
  if (!isOnline()) { page.refresh(); return; }
  const yes = await confirmDialog({
    title: 'Delete all my trips?',
    body: 'This deletes every trip you own, for good.\nTrips shared with you stay, and so do your profile and settings.',
    confirmLabel: 'Delete all my trips',
    danger: true,
    typed: 'DELETE',
  });
  if (!yes || !alive(page)) return;
  sayData(page, 'Deleting your trips');
  // The ids of the user's own trips, taken before the delete: their ticks go, the ticks of shared plans stay.
  const list = await fetchAllTrips().catch((e) => ({ data: [], error: e?.message || 'failed' }));
  if (list.error) {
    if (alive(page)) sayData(page, 'Your trips could not be read, so nothing was deleted. Try again.');
    return;
  }
  const ownIds = (list.data ?? []).filter((row) => row && row.shared !== true).map((row) => row.id).filter(Boolean);
  const { error } = await clearAllUserData({ keepProfile: true }).catch((e) => ({ error: e?.message || 'failed' }));
  if (error) {
    logger.error('ui', 'Delete all my trips failed', { error });
    if (alive(page)) sayData(page, 'Your trips could not be deleted. Try again.');
    return;
  }
  clearTicksFor(ownIds);
  clearTownGroupsFor(ownIds);
  showToast('All your trips were deleted.', 'success');
  navigate('/');
}

// ---- Notifications ----

async function enableNotifications(page) {
  let result = 'unsupported';
  try {
    const { requestCompletionNotifications } = await import('../services/generation-manager.js');
    result = await requestCompletionNotifications();
  } catch (e) {
    logger.warn('ui', 'Notifications could not be turned on', { error: e?.message });
    result = 'failed';
  }
  if (!alive(page)) return;
  const said = { granted: 'Notifications are on.', default: 'Nothing changed. You can turn them on at any time.', failed: 'That did not work. Check your connection and try again.' };
  page.notifyMessage = said[result] ?? '';
  page.refresh();
}

async function testNotification(page) {
  const sent = await sendTestNotification({ baseUrl: import.meta.env.BASE_URL });
  if (!alive(page)) return;
  page.notifyMessage = sent ? 'Test notification sent.' : 'The browser did not show the test notification.';
  page.refresh();
}

// ---- Account ----

async function signOutNow(page) {
  if (!isOnline()) { page.refresh(); return; }
  try {
    const { signOut } = await import('../auth/auth.js');
    await signOut(); // ends with a page load
  } catch (e) {
    logger.error('ui', 'Sign out failed from Settings', { error: e?.message });
    showToast('Could not sign out. Try again.', 'error');
  }
}

function sayAccount(page, message) {
  page.accountMessage = message;
  page.refresh();
}

const ACCOUNT_NOT_DELETED = Object.freeze({
  'last-admin': 'Your account was not deleted, because you are the only admin. Make another account an admin first, then delete this one.',
  failed: 'Your account was not deleted. It is still here and you are still signed in. Try again.',
});

/**
 * The user deletes their own account (migration 023): the server removes everything in one step, then
 * this device is signed out and cleared of every Trippy key. When the server says no, nothing on the
 * device is touched and the page says the account is still there.
 */
async function deleteAccount(page) {
  if (!isOnline()) { page.refresh(); return; }
  const yes = await confirmDialog({
    title: 'Delete your account?',
    body: 'This deletes your account and everything in it, for good: your profile, your settings and every trip you own.\nA trip you own is deleted for the people you shared it with too.\nThis cannot be undone.',
    confirmLabel: 'Delete my account',
    danger: true,
    typed: 'DELETE',
  });
  if (!yes || !alive(page)) return;
  sayAccount(page, 'Deleting your account');
  const { error } = await deleteMyAccount().catch((e) => ({ error: e?.message || 'failed' }));
  if (error) {
    if (alive(page)) sayAccount(page, ACCOUNT_NOT_DELETED[error] ?? ACCOUNT_NOT_DELETED.failed);
    return;
  }
  // The account is gone whatever happens next, so nothing below may stop the device from being cleared.
  const signedOut = await signOutThisDevice(); // main.js hears the sign-out and redraws the page as signed out
  if (!signedOut) logger.warn('auth', 'The session of a deleted account could not be removed from this device');
  clearDeviceData();
  navigate('/');
  showToast('Your account and everything in it were deleted.', 'success');
}

// ---- Moving around: the chips and Done ----

function jumpTo(page, key) {
  const section = page.root.querySelector(`[data-st-section="${key}"]`);
  if (!section) return;
  section.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  section.querySelector('h2[tabindex]')?.focus({ preventScroll: true });
}

/**
 * Whether Back would stay inside Trippy: the entry before this one is known to be the same document.
 * Only the Navigation API can say so. Without it (older Safari, Firefox and WebViews) the entry
 * before may be another site, so the answer is no and Done goes to the dashboard.
 */
function cameFromInside() {
  try {
    const nav = window.navigation;
    if (!nav?.currentEntry || typeof nav.entries !== 'function') return false;
    const previous = nav.entries()[nav.currentEntry.index - 1];
    if (!previous?.url) return false;
    const url = new URL(previous.url);
    return url.origin === location.origin && url.pathname === location.pathname;
  } catch {
    return false; // the entries could not be read: do not guess
  }
}

/** Done returns to where the user came from (the trip they were on), or to the dashboard when that is not known to be a page of Trippy. */
function done() {
  if (cameFromInside()) window.history.back();
  else navigate('/');
}

const ACTIONS = {
  'retry-profile': (page) => page.reloadProfile(),
  'clear-offline': clearOffline,
  'delete-trips': deleteTrips,
  'notify-enable': enableNotifications,
  'notify-test': testNotification,
  'sign-out': signOutNow,
  'delete-account': deleteAccount,
};

/** Binds the page root once. */
export function bindActions(page) {
  const { root } = page;
  root.addEventListener('change', (event) => {
    const control = event.target;
    if (!(control instanceof HTMLElement)) return;
    if (control.hasAttribute('data-st-pref')) onPrefChange(page, control);
    else if (control.hasAttribute('data-st-square')) { setSquareOverride(control.value); page.refresh(); }
    else if (control.hasAttribute('data-st-field')) onProfileChange(page, control);
  });
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const jump = target?.closest('[data-st-jump]');
    if (jump) { jumpTo(page, jump.getAttribute('data-st-jump')); return; }
    if (target?.closest('[data-st-done]')) { event.preventDefault(); done(); return; }
    const action = target?.closest('[data-st-action]');
    const run = action && !action.disabled ? ACTIONS[action.getAttribute('data-st-action')] : null;
    if (run) Promise.resolve(run(page)).catch((e) => logger.error('ui', 'A Settings action failed', { error: e?.message }));
  });
  // The chips are one sideways row on a phone: a chip that takes the focus half out of sight is brought in whole.
  root.addEventListener('focusin', (event) => {
    const chip = event.target instanceof Element ? event.target.closest('[data-st-jump]') : null;
    chip?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  // Turning notifications on must happen inside the tap, so the code it needs is fetched ahead.
  if (root.querySelector('[data-st-action="notify-enable"]')) import('../services/generation-manager.js').catch(() => {});
}
