// Deleting the signed-in user's own account (migration 023). Two steps, in this order:
//   1. the stored photos of the user's trips are removed through the Storage API (rows of
//      storage.objects must not be deleted with SQL: the files would stay behind);
//   2. delete_my_account() removes everything else in one transaction, the sign-in included. It
//      checks step 1 itself and deletes nothing when a photo is still stored.
// A failure in either step leaves the account as it is. A failure in step 1 can leave some of the
// trip photos removed: they are public venue photos and the trip itself is untouched.
import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const PHOTO_BUCKET = 'trip-photos'; // BUCKET in supabase/functions/resolve-trip-photos/index.ts
const LIST_PAGE = 100;
const REMOVE_BATCH = 100;

/**
 * Why a delete did not happen, as the app says it:
 *   'not-signed-in'  there is no session
 *   'last-admin'     the user is the only admin (the function refuses, so the app is never left without one)
 *   'failed'         anything else: a lost connection, a photo that could not be removed, a database error
 * @typedef {'not-signed-in'|'last-admin'|'failed'} DeleteAccountError
 */

/** The paths of every stored photo of one trip: trip-photos/<trip id>/<file>, one flat folder per trip. */
async function photoPathsOf(tripId) {
  const paths = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(tripId, { limit: LIST_PAGE, offset });
    if (error) throw new Error(error.message || 'list failed');
    const files = (data ?? []).filter((file) => file?.name && file.id !== null); // id null is a folder
    paths.push(...files.map((file) => `${tripId}/${file.name}`));
    if ((data ?? []).length < LIST_PAGE) return paths;
  }
}

async function removeTripPhotos(userId) {
  const { data: trips, error } = await supabase.from('trips').select('id').eq('user_id', userId);
  if (error) throw new Error(error.message || 'trips could not be read');
  for (const { id } of trips ?? []) {
    const paths = await photoPathsOf(id);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + REMOVE_BATCH));
      if (removeError) throw new Error(removeError.message || 'remove failed');
    }
  }
}

/**
 * Deletes the signed-in user's account and everything in it, on the server. The caller then signs
 * out on this device and clears it (signOutThisDevice, js/data/device-data.js).
 * @returns {Promise<{ error: DeleteAccountError|null }>}
 */
export async function deleteMyAccount() {
  const user = getUser();
  if (!supabase || !user) return { error: 'not-signed-in' };
  try {
    await removeTripPhotos(user.id);
  } catch (e) {
    logger.error('profile', 'Account deletion stopped: the trip photos could not be removed', { error: e?.message });
    return { error: 'failed' };
  }
  let error = null;
  try {
    ({ error } = await supabase.rpc('delete_my_account'));
  } catch (e) {
    error = { message: e?.message || 'failed' };
  }
  if (!error) return { error: null };
  if (/LAST_ADMIN/.test(error.message || '')) return { error: 'last-admin' };
  // The account still exists, so this log row can still be written.
  logger.error('profile', 'Account deletion failed', { error: error.message, code: error.code });
  return { error: 'failed' };
}

/**
 * Ends the session on this device without asking the server (the account is gone, so its token would
 * be refused). The app's own sign-out listener then redraws the page as signed out.
 * @returns {Promise<boolean>} false when the session could not be removed
 */
export async function signOutThisDevice() {
  if (!supabase) return true;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return !error;
  } catch {
    return false;
  }
}
