-- Add weather JSONB column to itinerary_days
-- Stores per-day weather forecast: {"condition":"sunny","highC":22,"lowC":14}
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS weather jsonb DEFAULT NULL;
