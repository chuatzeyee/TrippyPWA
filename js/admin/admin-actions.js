// What the buttons of the admin console do: change a role, plan a trip again, delete a trip, delete
// old logs, copy a log line. Every destructive step goes through the app's confirm dialog, and every
// change is written into a new copy of the loaded data, never into the rows in place.
import { navigate } from '../router.js';
import { countAdmins, deleteOldLogs, deleteUserTrip, retryTripGeneration, updateUserRole } from '../data/admin-repository.js';
import { logger } from '../lib/logger.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../views/shared/confirm-dialog.js';
import { displayName, logJson } from './admin-format.js';
import { roleChange } from './admin-people.js';
import { deletePrompt, retryPrompt, tripTitle } from './admin-trips.js';
import { purgePrompt } from './admin-logs.js';

const COPIED_MS = 2000;

const withBusy = (page, id, on) => {
  const busy = new Set(page.busyTrips);
  if (on) busy.add(id); else busy.delete(id);
  page.busyTrips = busy;
};

/** Asks, then gives or removes the admin role. Removing your own role leaves the page. */
export async function changeRole(page, personId) {
  const person = page.data.people.find((row) => row.id === personId);
  if (!person) return;
  const adminCount = page.data.people.filter((row) => row.role === 'admin').length;
  const change = roleChange(person, { meId: page.meId, adminCount });
  if (!change.allowed) return;
  const yes = await confirmDialog({ title: change.title, body: change.body, confirmLabel: change.confirmLabel, danger: change.danger });
  if (!yes || !page.alive) return;
  if (change.next === 'user') {
    // The loaded list can be old: count the admins again before one is taken away, so the last one stays.
    const admins = await countAdmins();
    if (!page.alive) return;
    if (admins === null) { showToast('The admins could not be counted, so the role was not changed. Try again.', 'error'); return; }
    if (admins <= 1) { showToast('This is the only admin left. Make someone else an admin first.', 'error'); return; }
  }
  const { error } = await updateUserRole(personId, change.next);
  if (!page.alive) return;
  if (error) {
    logger.error('auth', 'Admin role update failed', { error });
    showToast('The role could not be changed. Try again.', 'error');
    return;
  }
  page.data = { ...page.data, people: page.data.people.map((row) => (row.id === personId ? { ...row, role: change.next } : row)) };
  const name = displayName(person);
  showToast(change.next === 'admin' ? `${name} is now an admin` : `${name} is no longer an admin`, 'success');
  if (change.next === 'user' && personId === page.meId) { navigate('/'); return; }
  page.redraw();
}

/** Starts planning a trip again. A plan that is not failed is replaced, so that asks first. */
export async function retryTrip(page, tripId) {
  const trip = page.data.trips.find((row) => row.id === tripId);
  if (!trip || trip.status === 'generating' || page.busyTrips.has(tripId)) return;
  const owner = page.data.people.find((row) => row.id === trip.user_id) ?? null;
  const prompt = retryPrompt(trip, owner);
  if (prompt && !(await confirmDialog(prompt))) return;
  if (!page.alive) return;
  withBusy(page, tripId, true);
  page.redraw();
  let error;
  try {
    ({ error } = await retryTripGeneration(tripId));
  } catch (err) {
    error = err?.message || 'Unknown error';
  }
  if (!page.alive) return;
  withBusy(page, tripId, false);
  if (error) {
    logger.error('generation', 'Admin retry failed', { error, tripId });
    showToast(`Planning could not be started again for ${tripTitle(trip)}.`, 'error');
  } else {
    page.data = { ...page.data, trips: page.data.trips.map((row) => (row.id === tripId ? { ...row, status: 'generating', updated_at: new Date().toISOString() } : row)) };
    showToast(`Planning ${tripTitle(trip)} again`, 'success');
  }
  page.redraw();
}

/** Asks, naming the trip and its owner, then deletes the trip. */
export async function deleteTrip(page, tripId) {
  const trip = page.data.trips.find((row) => row.id === tripId);
  if (!trip || page.busyTrips.has(tripId)) return;
  const owner = page.data.people.find((row) => row.id === trip.user_id) ?? null;
  if (!(await confirmDialog(deletePrompt(trip, owner))) || !page.alive) return;
  withBusy(page, tripId, true);
  page.redraw();
  const { error } = await deleteUserTrip(tripId);
  if (!page.alive) return;
  withBusy(page, tripId, false);
  if (error) {
    logger.error('data', 'Admin trip delete failed', { error, tripId });
    showToast(`${tripTitle(trip)} could not be deleted. Try again.`, 'error');
  } else {
    page.data = {
      ...page.data,
      trips: page.data.trips.filter((row) => row.id !== tripId),
      tripsTotal: Math.max(0, page.data.tripsTotal - 1),
    };
    showToast(`Deleted ${tripTitle(trip)}`, 'success');
  }
  page.redraw();
}

/** Asks, then deletes logs older than 90 days and loads the list again. */
export async function purgeLogs(page) {
  if (!(await confirmDialog(purgePrompt())) || !page.alive) return;
  const { error } = await deleteOldLogs();
  if (!page.alive) return;
  if (error) {
    logger.error('data', 'Admin log purge failed', { error });
    showToast('The old logs could not be deleted. Try again.', 'error');
    return;
  }
  showToast('Old logs deleted', 'success');
  page.reloadLogs();
}

/** Copies one log line as JSON and says so on the button for a moment. */
export async function copyLog(page, logId) {
  const log = page.activity.logs.find((row) => row.id === logId);
  if (!log) return;
  try {
    await navigator.clipboard.writeText(logJson(log));
  } catch {
    showToast('The line could not be copied. Your browser did not allow it.', 'error');
    return;
  }
  if (!page.alive) return;
  page.activity = { ...page.activity, copiedId: logId };
  page.patch(['logs-results']);
  clearTimeout(page.copiedTimer);
  page.copiedTimer = setTimeout(() => {
    if (!page.alive || page.activity.copiedId !== logId) return;
    page.activity = { ...page.activity, copiedId: null };
    page.patch(['logs-results']);
  }, COPIED_MS);
}
