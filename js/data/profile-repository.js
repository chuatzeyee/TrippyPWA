import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export async function fetchProfile() {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) logger.warn('profile', 'Profile fetch failed', { error: error.message });
  return { data, error: error?.message || null };
}

export async function updateProfile(fields) {
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, ...fields });

  if (error) logger.error('profile', 'Profile update failed', { error: error.message });
  return { error: error?.message || null };
}

export async function needsProfileSetup() {
  const user = getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single();

  return !data?.onboarding_complete;
}
