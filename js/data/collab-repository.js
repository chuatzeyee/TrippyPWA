// Trip collaborators: owner invites by email (viewer/editor); invitee gets
// access via RLS matched on their login email. LWW editing, no CRDT.
import { supabase } from '../lib/supabase.js';

export async function listCollaborators(tripId) {
  const { data, error } = await supabase
    .from('trip_collaborators')
    .select('id, invited_email, role, user_id, created_at')
    .eq('trip_id', tripId)
    .order('created_at');
  return { data: data || [], error: error?.message || null };
}

export async function inviteCollaborator(tripId, email, role = 'editor') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };
  const { error } = await supabase.from('trip_collaborators').insert({
    trip_id: tripId,
    invited_email: String(email).trim().toLowerCase(),
    role,
    created_by: user.id,
  });
  return { error: error?.message || null };
}

export async function removeCollaborator(id) {
  const { error } = await supabase.from('trip_collaborators').delete().eq('id', id);
  return { error: error?.message || null };
}

// Link the invitation row to the invitee's user id the first time they open
// the trip (matched by email until then).
export async function claimInvitations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return;
  await supabase.from('trip_collaborators')
    .update({ user_id: user.id })
    .eq('invited_email', user.email.toLowerCase())
    .is('user_id', null);
}

// ---- Local-write echo suppression ------------------------------------------
// Realtime echoes every activities write back to the writer too. The trip page
// must not reload for the user's own saves, so writers mark the rows they touch
// (activity ids, or `day:<id>` for inserts whose id is not known yet) and the
// realtime handler drops events for marked keys until the mark expires.
const LOCAL_WRITE_TTL_MS = 8000;
const localWrites = new Map(); // key -> expiry timestamp

function pruneLocalWrites(now) {
  for (const [key, until] of localWrites) if (until <= now) localWrites.delete(key);
}

export function markLocalWrite(keys) {
  const until = Date.now() + LOCAL_WRITE_TTL_MS;
  for (const key of [].concat(keys || [])) if (key) localWrites.set(String(key), until);
}

export function isLocalWrite(keys) {
  const now = Date.now();
  pruneLocalWrites(now);
  return [].concat(keys || []).some(key => key && (localWrites.get(String(key)) || 0) > now);
}

// Run a write with its keys marked before it starts and again when it settles,
// so the echo is ignored whether it arrives before or after the HTTP response.
export async function withLocalWrite(keys, write) {
  markLocalWrite(keys);
  try {
    return await write();
  } finally {
    markLocalWrite(keys);
  }
}

let subSeq = 0; // makes every realtime topic unique, see onRemoteActivityChanges

/**
 * Subscribe to activity changes for a trip's days. Calls `onChange(payload)`
 * with the realtime payload ({ eventType, new, old }) for every insert, update
 * and delete, including the user's own writes (filter those with isLocalWrite).
 * Returns an unsubscribe function.
 */
export function onRemoteActivityChanges(dayIds, onChange) {
  if (!dayIds?.length) return () => {};
  // Every subscription gets its own topic. Re-rendering the same trip tears the
  // old channel down, but removeChannel() only leaves it once the server
  // confirms, and until then supabase.channel() with the same topic would hand
  // back that leaving channel, which never subscribes again.
  const name = `trip-activities-${dayIds[0]}-${++subSeq}`;
  const channel = supabase
    .channel(name)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'activities', filter: `day_id=in.(${dayIds.join(',')})` },
      (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
