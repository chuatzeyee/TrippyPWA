-- Add location and onboarding fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_country text DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_flag text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_nomad boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
