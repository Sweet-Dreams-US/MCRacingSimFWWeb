-- Add 'Radio' to the canonical attribution sources (customers.attributed_source
-- and mc_bookings.attributed_source CHECK constraints). Mirrors
-- ATTRIBUTION_SOURCES in src/lib/attribution.ts — keep the two in sync.
--
-- Applied to production 2026-07-31 as remote version 20260731...
-- (remote sequence: ...011_email_log_transaction_link → this).

alter table public.customers
  drop constraint customers_attributed_source_check;
alter table public.customers
  add constraint customers_attributed_source_check
  check (
    attributed_source is null
    or attributed_source = any (array[
      'Facebook or Instagram', 'Google', 'Radio', 'Walk-by',
      'Referral', 'Repeat customer', 'Event', 'Other'
    ])
  );

alter table public.mc_bookings
  drop constraint mc_bookings_attributed_source_check;
alter table public.mc_bookings
  add constraint mc_bookings_attributed_source_check
  check (
    attributed_source is null
    or attributed_source = any (array[
      'Facebook or Instagram', 'Google', 'Radio', 'Walk-by',
      'Referral', 'Repeat customer', 'Event', 'Other'
    ])
  );
