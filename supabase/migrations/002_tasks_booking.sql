-- ============================================================
-- Migration 002: Tasks + Buchungsposten + time_entry edits
-- Run in Supabase SQL Editor
-- ============================================================

-- TASKS (Aufgaben) — project_id optional
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,  -- nullable
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;
create policy "Users can manage own tasks"
  on tasks for all using (auth.uid() = user_id);
create index on tasks (user_id);
create index on tasks (project_id);

-- BUCHUNGSPOSTEN — client_id optional
create table booking_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade,  -- nullable
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table booking_items enable row level security;
create policy "Users can manage own booking items"
  on booking_items for all using (auth.uid() = user_id);
create index on booking_items (user_id);
create index on booking_items (client_id);

-- Extend time_entries
alter table time_entries
  add column if not exists task_id uuid references tasks(id) on delete set null,
  add column if not exists booking_item_text text not null default '';

-- Extend active_timers
alter table active_timers
  add column if not exists task_id uuid references tasks(id) on delete set null,
  add column if not exists booking_item_text text not null default '';
