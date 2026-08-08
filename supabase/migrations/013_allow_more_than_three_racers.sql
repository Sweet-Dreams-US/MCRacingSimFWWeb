-- Groups larger than the 3 sims can now book one session: racers past the 3rd
-- take turns on the same rigs and are billed a flat add-on per hour instead of
-- a full seat price (see EXTRA_RACER_RATE_PER_HOUR in src/lib/pricing.ts).
--
-- Availability still treats such a booking as holding only SIM_COUNT seats
-- (seatsUsedBy in src/lib/availability.ts), so it takes the whole venue.
--
-- Applied to production 2026-08-02 (remote sequence: ...012 -> this).

alter table public.bookings
  drop constraint bookings_racer_count_check;
alter table public.bookings
  add constraint bookings_racer_count_check check (racer_count >= 1);

-- One booking_racers row per racer, so slots must climb past 3 as well.
alter table public.booking_racers
  drop constraint booking_racers_slot_check;
alter table public.booking_racers
  add constraint booking_racers_slot_check check (slot >= 1);
