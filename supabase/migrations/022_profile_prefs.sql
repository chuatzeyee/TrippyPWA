-- supabase/migrations/022_profile_prefs.sql   (do not apply until the owner says so)
alter table public.profiles
  add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_prefs_shape;
alter table public.profiles add constraint profiles_prefs_shape
  check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) <= 4096);
-- No policy change. "Users can update own profile" (001_initial_schema.sql:21-23) covers the new column, and
-- guard_profile_role (020_security_hardening.sql:38-61) only looks at role.
-- Rollback: drop the constraint, then: alter table public.profiles drop column if exists prefs;
