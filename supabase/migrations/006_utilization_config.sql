-- Add utilization_config JSONB column to users_profile
-- Stores user-configured default values for the Add Tile dialog (type, unit, carry_over)

ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS utilization_config JSONB DEFAULT '{}'::jsonb;
