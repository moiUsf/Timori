-- Add utilization_tiles JSONB column to users_profile
-- Stores user-configured utilization tile definitions (projects, tasks, booking items with budgets)

ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS utilization_tiles JSONB DEFAULT '[]'::jsonb;
