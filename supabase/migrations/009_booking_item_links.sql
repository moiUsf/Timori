-- ============================================================
-- Migration 009: Kunden-Buchungsposten ↔ Vermittler-Buchungsposten
-- Run in Supabase SQL Editor
-- ============================================================

create table booking_item_links (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  customer_booking_item_id uuid not null,
  vermittler_booking_item_id uuid not null,
  created_at timestamptz not null default now(),
  constraint booking_item_links_customer_fk
    foreign key (customer_booking_item_id) references booking_items(id) on delete cascade,
  constraint booking_item_links_vermittler_fk
    foreign key (vermittler_booking_item_id) references booking_items(id) on delete cascade,
  constraint booking_item_links_distinct
    check (customer_booking_item_id <> vermittler_booking_item_id),
  constraint booking_item_links_vermittler_unique
    unique (vermittler_booking_item_id),
  constraint booking_item_links_pair_unique
    unique (customer_booking_item_id, vermittler_booking_item_id)
);

alter table booking_item_links enable row level security;
create policy "Users can manage own booking item links"
  on booking_item_links for all using (auth.uid() = user_id);

create index booking_item_links_user_id_idx on booking_item_links (user_id);
create index booking_item_links_customer_idx on booking_item_links (customer_booking_item_id);

create or replace function prevent_booking_item_link_chains()
returns trigger
language plpgsql
as $$
declare
  customer_client uuid;
  vermittler_client uuid;
begin
  if exists (
    select 1 from booking_item_links
    where customer_booking_item_id = new.vermittler_booking_item_id
  ) then
    raise exception 'Vermittler-Buchungsposten darf nicht selbst Kunden-Posten einer Verknüpfung sein';
  end if;

  if exists (
    select 1 from booking_item_links
    where vermittler_booking_item_id = new.customer_booking_item_id
  ) then
    raise exception 'Kunden-Buchungsposten darf nicht selbst Vermittler-Posten einer Verknüpfung sein';
  end if;

  select client_id into customer_client from booking_items where id = new.customer_booking_item_id;
  select client_id into vermittler_client from booking_items where id = new.vermittler_booking_item_id;

  if customer_client is not null
     and vermittler_client is not null
     and customer_client = vermittler_client then
    raise exception 'Vermittler-Buchungsposten muss zu einem anderen Kunden gehören';
  end if;

  return new;
end;
$$;

create trigger booking_item_links_no_chains
  before insert or update on booking_item_links
  for each row execute function prevent_booking_item_link_chains();
