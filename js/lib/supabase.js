import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  if (import.meta.env.DEV) console.warn('Backend not configured — check .env.local');
}

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

let _cachedUser = null;

export function setCachedUser(user) {
  _cachedUser = user;
}

export function getUser() {
  return _cachedUser;
}

export function hasLocalSession() {
  try {
    const key = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : '';
    return key ? !!localStorage.getItem(key) : false;
  } catch { return false; }
}
