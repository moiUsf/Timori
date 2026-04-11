-- ============================================================
-- Migration 003: Add client_id + default_booking_item_id to tasks,
--                default_remote to clients,
--                monthly_booked_days to clients,
--                make project_id nullable in time_entries + active_timers
-- Run in Supabase SQL Editor
-- ============================================================

-- Tasks: direct client assignment (no project required)
alter table tasks
  add column if not exists client_id uuid references clients(id) on delete set null,
  add column if not exists default_booking_item_id uuid references booking_items(id) on delete set null;

create index if not exists tasks_client_id_idx on tasks (client_id);

-- Clients: remote default + capacity
alter table clients
  add column if not exists default_remote boolean not null default false,
  add column if not exists monthly_booked_days numeric(5,1) default 0;

-- Time entries: project no longer required
alter table time_entries
  alter column project_id drop not null;

-- Active timers: project no longer required
alter table active_timers
  alter column project_id drop not null;
