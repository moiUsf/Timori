-- ============================================================
-- Timori - Initial Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS PROFILE
-- ============================================================
create table users_profile (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text not null,
  personal_nr text,
  working_hours_per_day numeric(4,2) not null default 8,
  vacation_quota integer not null default 30,
  federal_state text not null default 'DE-NW',
  hourly_rate numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  client_nr text,
  country text not null default 'DE',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  project_nr text,
  sub_project text,
  category text,
  hourly_rate numeric(8,2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TIME ENTRIES
-- ============================================================
create table time_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  time_from time not null,
  time_to time not null,
  break_min integer not null default 0,
  client_id uuid references clients(id) not null,
  project_id uuid references projects(id) not null,
  code text not null check (code in ('BEV', 'BENV', 'RZV', 'RZNV')),
  description text not null default '',
  remote boolean not null default false,
  gross_h numeric(5,2) not null default 0,
  net_h numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ACTIVE TIMERS (live running timers)
-- ============================================================
create table active_timers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references clients(id) not null,
  project_id uuid references projects(id) not null,
  code text not null check (code in ('BEV', 'BENV', 'RZV', 'RZNV')),
  description text not null default '',
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  total_paused_ms bigint not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- VACATION ENTRIES
-- ============================================================
create table vacation_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('annual', 'special', 'training', 'illness')),
  date_from date not null,
  date_to date not null,
  days numeric(4,1) not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- OVERTIME RECORDS
-- ============================================================
create table overtime_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  year integer not null,
  month integer not null check (month between 1 and 12),
  buildup_h numeric(6,2) not null default 0,
  reduction_h numeric(6,2) not null default 0,
  carryover_h numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, year, month)
);

-- ============================================================
-- HOLIDAYS
-- ============================================================
create table holidays (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  year integer not null,
  state text not null,
  name text not null,
  date date not null,
  is_custom boolean not null default false
);

-- ============================================================
-- EXPENSE REPORTS
-- ============================================================
create table expense_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  month integer not null check (month between 1 and 12),
  year integer not null,
  travel_nr text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- EXPENSE ITEMS
-- ============================================================
create table expense_items (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid references expense_reports(id) on delete cascade not null,
  date date not null,
  category text not null,
  description text not null default '',
  amount numeric(10,2) not null default 0,
  km numeric(8,1),
  km_rate numeric(4,3),
  vma_type text check (vma_type in ('none', 'partial_8', 'partial_14', 'full_24')),
  receipt_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'lifetime')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  current_period_end timestamptz
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table users_profile enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table time_entries enable row level security;
alter table active_timers enable row level security;
alter table vacation_entries enable row level security;
alter table overtime_records enable row level security;
alter table holidays enable row level security;
alter table expense_reports enable row level security;
alter table expense_items enable row level security;
alter table subscriptions enable row level security;

-- users_profile
create policy "Users can manage own profile"
  on users_profile for all using (auth.uid() = user_id);

-- clients
create policy "Users can manage own clients"
  on clients for all using (auth.uid() = user_id);

-- projects
create policy "Users can manage own projects"
  on projects for all using (auth.uid() = user_id);

-- time_entries
create policy "Users can manage own time entries"
  on time_entries for all using (auth.uid() = user_id);

-- active_timers
create policy "Users can manage own active timers"
  on active_timers for all using (auth.uid() = user_id);

-- vacation_entries
create policy "Users can manage own vacation entries"
  on vacation_entries for all using (auth.uid() = user_id);

-- overtime_records
create policy "Users can manage own overtime records"
  on overtime_records for all using (auth.uid() = user_id);

-- holidays
create policy "Users can manage own holidays"
  on holidays for all using (auth.uid() = user_id);

-- expense_reports
create policy "Users can manage own expense reports"
  on expense_reports for all using (auth.uid() = user_id);

-- expense_items: access via report ownership
create policy "Users can manage own expense items"
  on expense_items for all using (
    exists (
      select 1 from expense_reports
      where expense_reports.id = expense_items.report_id
        and expense_reports.user_id = auth.uid()
    )
  );

-- subscriptions
create policy "Users can read own subscription"
  on subscriptions for select using (auth.uid() = user_id);
create policy "Service role can manage subscriptions"
  on subscriptions for all using (true);

-- ============================================================
-- INDEXES
-- ============================================================
create index on time_entries (user_id, date);
create index on time_entries (user_id, client_id);
create index on time_entries (user_id, project_id);
create index on active_timers (user_id);
create index on vacation_entries (user_id, date_from);
create index on overtime_records (user_id, year, month);
create index on holidays (user_id, year);
create index on expense_reports (user_id, year, month);

-- ============================================================
-- Auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_profile_updated_at
  before update on users_profile
  for each row execute function update_updated_at();
