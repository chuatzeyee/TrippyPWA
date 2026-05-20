-- Trippy Phase 2: Roles, Sharing, and Admin Access
-- Run via Supabase SQL Editor

-- ===== 1. Add role column to profiles =====
alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- ===== 2. Create trip_shares table =====
create table if not exists public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  visibility text not null default 'link' check (visibility in ('link', 'public')),
  created_at timestamptz default now()
);

create index idx_trip_shares_token on public.trip_shares(share_token);
create index idx_trip_shares_trip_id on public.trip_shares(trip_id);

alter table public.trip_shares enable row level security;

-- Owner can manage their shares
create policy "Users can view own shares"
  on public.trip_shares for select
  using (created_by = auth.uid());

create policy "Users can create shares for own trips"
  on public.trip_shares for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_shares.trip_id
      and trips.user_id = auth.uid()
    )
  );

create policy "Users can delete own shares"
  on public.trip_shares for delete
  using (created_by = auth.uid());

-- Anyone can look up a share by token (for the public view)
create policy "Anyone can view shares by token"
  on public.trip_shares for select
  using (true);

-- ===== 3. Helper function: check if user is admin =====
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ===== 4. Helper function: check if trip is shared =====
create or replace function public.is_trip_shared(trip_uuid uuid)
returns boolean as $$
  select exists (
    select 1 from public.trip_shares
    where trip_id = trip_uuid
  );
$$ language sql security definer stable;

-- ===== 5. Update trips RLS: add admin read + shared trip read =====
drop policy if exists "Users can view own trips" on public.trips;
create policy "Users can view own or shared or admin trips"
  on public.trips for select
  using (
    auth.uid() = user_id
    or public.is_admin()
    or public.is_trip_shared(id)
  );

-- ===== 6. Update itinerary_days RLS: add admin + shared read =====
drop policy if exists "Users can view own itinerary days" on public.itinerary_days;
create policy "Users can view own or shared or admin days"
  on public.itinerary_days for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = itinerary_days.trip_id
      and (
        trips.user_id = auth.uid()
        or public.is_admin()
        or public.is_trip_shared(trips.id)
      )
    )
  );

-- ===== 7. Update activities RLS: add admin + shared read =====
drop policy if exists "Users can view own activities" on public.activities;
create policy "Users can view own or shared or admin activities"
  on public.activities for select
  using (
    exists (
      select 1 from public.itinerary_days
      join public.trips on trips.id = itinerary_days.trip_id
      where itinerary_days.id = activities.day_id
      and (
        trips.user_id = auth.uid()
        or public.is_admin()
        or public.is_trip_shared(trips.id)
      )
    )
  );

-- ===== 8. Admin can read all profiles =====
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile or admin can view all"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- ===== 9. Admin can update any profile role =====
create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- ===== 10. Update itinerary_days: allow update for own trips =====
create policy "Users can update own itinerary days"
  on public.itinerary_days for update
  using (exists (
    select 1 from public.trips
    where trips.id = itinerary_days.trip_id
    and trips.user_id = auth.uid()
  ));

-- ===== 11. Update activities: allow update for own activities =====
create policy "Users can update own activities"
  on public.activities for update
  using (exists (
    select 1 from public.itinerary_days
    join public.trips on trips.id = itinerary_days.trip_id
    where itinerary_days.id = activities.day_id
    and trips.user_id = auth.uid()
  ));
