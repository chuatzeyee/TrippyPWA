-- Add timezone column to trips (IANA timezone, e.g. 'Asia/Tokyo')
alter table public.trips add column if not exists timezone text;
