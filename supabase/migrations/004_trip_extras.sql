-- Add extras JSONB column to trips for flights, accommodation, and booking checklist
ALTER TABLE trips ADD COLUMN IF NOT EXISTS extras jsonb DEFAULT NULL;
