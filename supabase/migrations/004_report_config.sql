-- Add report_config JSONB column to users_profile
-- Stores Tätigkeitsbericht field composition: which fields to include and in what order

ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS report_config JSONB
  DEFAULT '{"taetigkeit_fields": ["booking_item", "task", "description", "project"]}';
