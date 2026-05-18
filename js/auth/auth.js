import { supabase, setCachedUser } from '../lib/supabase.js';

let currentUser = null;
const listeners = new Set();

export function getCurrentUser() {
  return currentUser;
}

export function isAuthenticated() {
  return !!currentUser;
}

export async function signInWithGoogle() {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` }
  });
  return { error: error?.message || null };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.hash = '#/';
  window.location.reload();
}

export function onAuthChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(event, session) {
  for (const cb of listeners) {
    try { cb(event, session); } catch (e) { console.error('Auth listener error:', e); }
  }
}

export async function initAuth() {
  if (!supabase) return;

  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  setCachedUser(currentUser);

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    setCachedUser(currentUser);
    notifyListeners(event, session);
  });
}
