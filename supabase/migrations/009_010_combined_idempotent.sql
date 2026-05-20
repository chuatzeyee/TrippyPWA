-- Trippy: Combined idempotent migration for roles, sharing, admin access, and admin delete
-- Safe to run multiple times — handles any partial application state

-- ===== 1. Add role column to profiles =====
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- Add check constraint if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

-- ===== 2. Create trip_shares table =====
CREATE TABLE IF NOT EXISTS public.trip_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'link' CHECK (visibility IN ('link', 'public')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_shares_token ON public.trip_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_id ON public.trip_shares(trip_id);

ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;

-- ===== 3. Helper functions =====
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_trip_shared(trip_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_shares
    WHERE trip_id = trip_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ===== 4. trip_shares policies =====
DROP POLICY IF EXISTS "Users can view own shares" ON public.trip_shares;
CREATE POLICY "Users can view own shares"
  ON public.trip_shares FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create shares for own trips" ON public.trip_shares;
CREATE POLICY "Users can create shares for own trips"
  ON public.trip_shares FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_shares.trip_id
      AND trips.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own shares" ON public.trip_shares;
CREATE POLICY "Users can delete own shares"
  ON public.trip_shares FOR DELETE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Anyone can view shares by token" ON public.trip_shares;
CREATE POLICY "Anyone can view shares by token"
  ON public.trip_shares FOR SELECT
  USING (true);

-- ===== 5. Trips SELECT policy: own + shared + admin =====
DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can view own or shared or admin trips" ON public.trips;
CREATE POLICY "Users can view own or shared or admin trips"
  ON public.trips FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin()
    OR public.is_trip_shared(id)
  );

-- ===== 6. Itinerary days SELECT policy: own + shared + admin =====
DROP POLICY IF EXISTS "Users can view own itinerary days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Users can view own or shared or admin days" ON public.itinerary_days;
CREATE POLICY "Users can view own or shared or admin days"
  ON public.itinerary_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = itinerary_days.trip_id
      AND (
        trips.user_id = auth.uid()
        OR public.is_admin()
        OR public.is_trip_shared(trips.id)
      )
    )
  );

-- ===== 7. Activities SELECT policy: own + shared + admin =====
DROP POLICY IF EXISTS "Users can view own activities" ON public.activities;
DROP POLICY IF EXISTS "Users can view own or shared or admin activities" ON public.activities;
CREATE POLICY "Users can view own or shared or admin activities"
  ON public.activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_days
      JOIN public.trips ON trips.id = itinerary_days.trip_id
      WHERE itinerary_days.id = activities.day_id
      AND (
        trips.user_id = auth.uid()
        OR public.is_admin()
        OR public.is_trip_shared(trips.id)
      )
    )
  );

-- ===== 8. Profiles SELECT policy: own + admin =====
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admin can view all"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- ===== 9. Profiles UPDATE policy: admin can update any =====
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- ===== 10. Itinerary days UPDATE policy: own trips =====
DROP POLICY IF EXISTS "Users can update own itinerary days" ON public.itinerary_days;
CREATE POLICY "Users can update own itinerary days"
  ON public.itinerary_days FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = itinerary_days.trip_id
    AND trips.user_id = auth.uid()
  ));

-- ===== 11. Activities UPDATE policy: own activities =====
DROP POLICY IF EXISTS "Users can update own activities" ON public.activities;
CREATE POLICY "Users can update own activities"
  ON public.activities FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.itinerary_days
    JOIN public.trips ON trips.id = itinerary_days.trip_id
    WHERE itinerary_days.id = activities.day_id
    AND trips.user_id = auth.uid()
  ));

-- ===== 12. Admin DELETE policies (from migration 010) =====
DROP POLICY IF EXISTS "Admins can delete any trip" ON public.trips;
CREATE POLICY "Admins can delete any trip"
  ON public.trips FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any itinerary days" ON public.itinerary_days;
CREATE POLICY "Admins can delete any itinerary days"
  ON public.itinerary_days FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any activities" ON public.activities;
CREATE POLICY "Admins can delete any activities"
  ON public.activities FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage shares" ON public.trip_shares;
CREATE POLICY "Admins can manage shares"
  ON public.trip_shares FOR DELETE
  USING (public.is_admin());

-- ===== 13. Set your account as admin =====
UPDATE public.profiles SET role = 'admin' WHERE id = '7f5012f3-19a4-4cb2-8645-5a53b3d9f70a';
