// The two writes the trip chat and the activity editor make that no other
// repository has: a change to trips.extras (stays, flights) and the
// traveller's own note on an activity.
import { supabase } from '../lib/supabase.js';
import { updateRowVersioned } from '../../supabase/functions/_shared/trip-row.mjs';

// Postgres undefined_column, and PostgREST's "column not in the schema cache":
// migration 024 (activities.notes) is not applied yet.
const COLUMN_MISSING = new Set(['42703', 'PGRST204']);

/**
 * Change a trip's extras from a fresh read, so nothing another writer stored
 * since the page loaded (photo credits, the cover) is overwritten.
 * @param {string} tripId
 * @param {(extras: object) => object|null} change  returns the new extras, or null when the change no longer fits
 * @returns {Promise<{ error: string|null }>} error 'stale' when `change` declined, 'failed' when the write did not land
 */
export async function changeTripExtras(tripId, change) {
  try {
    let declined = false;
    const { written } = await updateRowVersioned(supabase, {
      table: 'trips', id: tripId, columns: 'extras',
      change: (fresh) => {
        const extras = change(fresh.extras || {});
        declined = !extras;
        return extras ? { extras } : null;
      },
    });
    return { error: written ? null : declined ? 'stale' : 'failed' };
  } catch {
    return { error: 'failed' };
  }
}

/**
 * Save (or with '' remove) the traveller's note on an activity.
 * @returns {Promise<{ error: string|null }>} error 'no_column' until migration 024 is applied
 */
export async function saveActivityNote(activityId, note) {
  const { data, error } = await supabase.from('activities')
    .update({ notes: String(note ?? '').trim().slice(0, 300) || null })
    .eq('id', activityId)
    .select('id');
  if (error) return { error: COLUMN_MISSING.has(error.code) ? 'no_column' : error.message || 'failed' };
  return { error: data?.length ? null : 'failed' };
}
