import { supabase, getUser } from '../lib/supabase.js';

export async function fetchProfile() {
  const user = await getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { data, error: error?.message || null };
}

export async function updateProfile(fields) {
  const user = await getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', user.id);

  return { error: error?.message || null };
}

export async function needsProfileSetup() {
  const user = await getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single();

  return !data?.onboarding_complete;
}
