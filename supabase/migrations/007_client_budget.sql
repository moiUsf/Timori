-- Migration 007: Add budget fields to clients (matches UtilizationTile logic)
-- Replaces monthly_booked_days with a flexible budget system:
--   budget_h / budget_unit / budget_period (total|monthly|range)
--   budget_carry_over (monthly only), budget_date_from/to (range only)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS budget_h numeric(10,2),
  ADD COLUMN IF NOT EXISTS budget_unit text CHECK (budget_unit IN ('h', 'MT')),
  ADD COLUMN IF NOT EXISTS budget_period text CHECK (budget_period IN ('total', 'monthly', 'range')),
  ADD COLUMN IF NOT EXISTS budget_carry_over boolean,
  ADD COLUMN IF NOT EXISTS budget_date_from date,
  ADD COLUMN IF NOT EXISTS budget_date_to date;

-- Backfill from monthly_booked_days:
--   MT → hours using user's working_hours_per_day, fallback 8h.
UPDATE clients c
SET budget_h = c.monthly_booked_days * COALESCE(up.working_hours_per_day, 8),
    budget_unit = 'MT',
    budget_period = 'monthly',
    budget_carry_over = false
FROM users_profile up
WHERE up.user_id = c.user_id
  AND c.monthly_booked_days IS NOT NULL
  AND c.monthly_booked_days > 0;

ALTER TABLE clients DROP COLUMN IF EXISTS monthly_booked_days;
