-- Add Vermittler booking item text to time entries and active timers
alter table time_entries
  add column if not exists vermittler_booking_item_text text not null default '';

alter table active_timers
  add column if not exists vermittler_booking_item_text text not null default '';
