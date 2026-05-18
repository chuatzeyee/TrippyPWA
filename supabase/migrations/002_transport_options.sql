-- Add columns that were created via dashboard but missing from migrations
alter table public.activities add column if not exists start_time text default '';
alter table public.activities add column if not exists getting_there text default '';
alter table public.activities add column if not exists transport_mode text default '';
alter table public.activities add column if not exists transport_duration text default '';
alter table public.activities add column if not exists transport_cost text default '';

-- New: structured transport options (walk / public / private hire)
alter table public.activities add column if not exists transport_options jsonb default '[]'::jsonb;
