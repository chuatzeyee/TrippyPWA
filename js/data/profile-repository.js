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

// Columns a user may edit on their own profile. Never id or role: role changes
// go through the admin portal (and the DB rejects them from anyone else).
const EDITABLE_PROFILE_FIELDS = [
  'display_name', 'avatar_url', 'home_city', 'home_country', 'home_flag', 'is_nomad',
  'home_currency', 'home_currency_symbol', 'nationality', 'onboarding_complete',
];

export async function updateProfile(fields) {
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const editable = Object.fromEntries(
    Object.entries(fields || {}).filter(([key]) => EDITABLE_PROFILE_FIELDS.includes(key)),
  );
  const { error } = await supabase
    .from('profiles')
    .upsert({ ...editable, id: user.id });

  if (error) logger.error('profile', 'Profile update failed', { error: error.message });
  return { error: error?.message || null };
}

export async function needsProfileSetup() {
  const user = getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single();

  // A failed query must not send an onboarded user back to profile setup.
  if (error) return false;
  return !data?.onboarding_complete;
}
