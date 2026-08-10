-- Sessions are no longer capped at 3 hours — a group can book the venue for as
-- long as it's open (noon to 2am = 14 hours). Hours past the 3-hour price
-- matrix bill at a flat per-sim-seat rate; see LONG_SESSION_RATE_PER_SEAT_HOUR
-- in src/lib/pricing.ts. Half-hour steps still apply.
--
-- Applied to production 2026-08-08 (remote sequence: ...014 -> this).

alter table public.bookings
  drop constraint bookings_duration_hours_check;

alter table public.bookings
  add constraint bookings_duration_hours_check check (
    duration_hours >= 1
    and duration_hours <= 14
    and (duration_hours * 2) = trunc(duration_hours * 2)
  );
