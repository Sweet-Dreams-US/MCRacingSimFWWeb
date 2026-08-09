-- Sessions can now be booked in half-hour steps (1, 1.5, 2, 2.5, 3). A half
-- hour is priced at the exact midpoint of its neighbouring whole hours; see
-- matrixPrice() in src/lib/pricing.ts.
--
-- duration_hours was an integer, so 1.5 would have been silently rounded.
--
-- Applied to production 2026-08-08 (remote sequence: ...013 -> this).

alter table public.bookings
  drop constraint bookings_duration_hours_check;

alter table public.bookings
  alter column duration_hours type numeric(3,1) using duration_hours::numeric(3,1);

-- 1 to 3 hours, in half-hour steps (x2 must be a whole number).
alter table public.bookings
  add constraint bookings_duration_hours_check check (
    duration_hours >= 1
    and duration_hours <= 3
    and (duration_hours * 2) = trunc(duration_hours * 2)
  );

-- Discount hour caps count session length, so they must hold halves too —
-- otherwise a 1.5h redemption rounds to 2h against the code's allowance.
alter table public.discount_redemptions
  alter column hours type numeric(4,1) using hours::numeric(4,1);
alter table public.discount_codes
  alter column hours_redeemed type numeric(6,1) using hours_redeemed::numeric(6,1);
alter table public.discount_codes
  alter column max_total_hours type numeric(6,1) using max_total_hours::numeric(6,1);
alter table public.discount_codes
  alter column max_hours_per_booking type numeric(4,1) using max_hours_per_booking::numeric(4,1);
