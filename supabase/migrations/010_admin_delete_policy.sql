-- Allow admins to delete any trip
CREATE POLICY "Admins can delete any trip"
  ON public.trips FOR DELETE
  USING (public.is_admin());

-- Allow admins to delete any itinerary days
CREATE POLICY "Admins can delete any itinerary days"
  ON public.itinerary_days FOR DELETE
  USING (public.is_admin());

-- Allow admins to delete any activities
CREATE POLICY "Admins can delete any activities"
  ON public.activities FOR DELETE
  USING (public.is_admin());

-- Allow admins to manage trip shares
CREATE POLICY "Admins can manage shares"
  ON public.trip_shares FOR DELETE
  USING (public.is_admin());
