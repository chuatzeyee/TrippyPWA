-- Trippy Phase 1: Initial Schema
-- Run via Supabase SQL Editor or supabase db push

-- ===== Profiles =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  home_currency text default 'USD',
  home_currency_symbol text default '$',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Trips =====
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  subtitle text default '',
  emoji text default '',
  status text default 'planning' check (status in ('planning', 'generated', 'active', 'completed')),
  cover_image text default '',
  wizard_state jsonb not null default '{}',
  travelers integer default 1,
  start_date date,
  end_date date,
  budget_daily integer default 0,
  budget_currency text default 'USD',
  budget_currency_symbol text default '$',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_trips_user_id on public.trips(user_id);

alter table public.trips enable row level security;

create policy "Users can view own trips"
  on public.trips for select
  using (auth.uid() = user_id);

create policy "Users can create own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

create policy "Users can update own trips"
  on public.trips for update
  using (auth.uid() = user_id);

create policy "Users can delete own trips"
  on public.trips for delete
  using (auth.uid() = user_id);

-- ===== Itinerary Days =====
create table if not exists public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number integer not null,
  date date,
  title text not null default '',
  theme text default '',
  weather jsonb default '{}',
  created_at timestamptz default now(),
  unique (trip_id, day_number)
);

create index idx_itinerary_days_trip_id on public.itinerary_days(trip_id);

alter table public.itinerary_days enable row level security;

create policy "Users can view own itinerary days"
  on public.itinerary_days for select
  using (exists (
    select 1 from public.trips
    where trips.id = itinerary_days.trip_id
    and trips.user_id = auth.uid()
  ));

create policy "Users can create own itinerary days"
  on public.itinerary_days for insert
  with check (exists (
    select 1 from public.trips
    where trips.id = itinerary_days.trip_id
    and trips.user_id = auth.uid()
  ));

create policy "Users can delete own itinerary days"
  on public.itinerary_days for delete
  using (exists (
    select 1 from public.trips
    where trips.id = itinerary_days.trip_id
    and trips.user_id = auth.uid()
  ));

-- ===== Activities =====
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  time_slot text not null check (time_slot in ('morning', 'afternoon', 'evening')),
  sort_order integer not null default 0,
  title text not null default '',
  description text default '',
  venue_name text default '',
  venue_address text default '',
  place_id text default '',
  category text default 'culture',
  duration_minutes integer default 60,
  cost_amount integer default 0,
  cost_currency text default 'USD',
  cost_note text default '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  booking_url text default '',
  tips text default '',
  created_at timestamptz default now()
);

create index idx_activities_day_id on public.activities(day_id);

alter table public.activities enable row level security;

create policy "Users can view own activities"
  on public.activities for select
  using (exists (
    select 1 from public.itinerary_days
    join public.trips on trips.id = itinerary_days.trip_id
    where itinerary_days.id = activities.day_id
    and trips.user_id = auth.uid()
  ));

create policy "Users can create own activities"
  on public.activities for insert
  with check (exists (
    select 1 from public.itinerary_days
    join public.trips on trips.id = itinerary_days.trip_id
    where itinerary_days.id = activities.day_id
    and trips.user_id = auth.uid()
  ));

create policy "Users can delete own activities"
  on public.activities for delete
  using (exists (
    select 1 from public.itinerary_days
    join public.trips on trips.id = itinerary_days.trip_id
    where itinerary_days.id = activities.day_id
    and trips.user_id = auth.uid()
  ));

-- ===== Updated-at trigger =====
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_trips_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();
