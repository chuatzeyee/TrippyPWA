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

/**
 * Subscribe to remote activity changes for a trip's days. Fires `onChange`
 * (debounced by the caller) when anyone else saves. Returns unsubscribe.
 */
export function onRemoteActivityChanges(dayIds, onChange) {
  if (!dayIds?.length) return () => {};
  const name = `trip-activities-${dayIds[0]}`;
  // Re-rendering the same trip (collaborator edit, chat edit, photos arriving)
  // would get the already-subscribed channel back from supabase.channel(), and
  // adding .on() after subscribe() throws. Drop any previous one first.
  for (const ch of supabase.getChannels()) {
    if (ch.topic === `realtime:${name}`) supabase.removeChannel(ch);
  }
  const channel = supabase
    .channel(name)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'activities', filter: `day_id=in.(${dayIds.join(',')})` },
      onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
