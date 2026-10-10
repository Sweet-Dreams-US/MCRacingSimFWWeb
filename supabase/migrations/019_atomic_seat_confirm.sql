-- First card saved wins the seats.
--
-- On 2026-10-10 two online customers booked 2 racers each at 5pm (3 rigs). The
-- seat check only ran when a booking was CREATED and only counted CONFIRMED
-- bookings, and a booking only becomes confirmed once its card is saved. Both
-- customers started checkout while the other was still typing a card, so both
-- passed, and nothing re-checked when the cards went through.
--
-- This function is the final gate, called from the setup_intent.succeeded
-- webhook: it re-checks seats and flips pending -> confirmed in ONE transaction,
-- holding a per-date advisory lock so two cards saved in the same instant are
-- decided one after the other. Whoever gets here first is confirmed; the other
-- gets 'full' and the app cancels it and tells them.
--
-- The seat math mirrors src/lib/availability.ts (maxConcurrentRacers /
-- seatsUsedBy): times before noon belong to the late-night tail (+24h), a
-- booking holds min(racers, capacity) seats, half-open [start, end) windows,
-- and only confirmed/completed/partial_noshow bookings hold seats. Staff
-- (source <> 'online') bookings are never refused here; staff may overbook on
-- purpose, exactly as the create-time check already allows.

create or replace function public.mc_extended_minutes(t time)
returns integer
language sql
immutable
as $$
  select (extract(hour from t)::int * 60 + extract(minute from t)::int)
         + case when extract(hour from t) < 12 then 1440 else 0 end
$$;

create or replace function public.confirm_booking_if_seats_free(
  p_booking_id text,
  p_capacity integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  cand_start integer;
  cand_end integer;
  sample_at integer;
  occupied integer;
  peak integer := 0;
begin
  if p_capacity is null or p_capacity < 1 then
    raise exception 'capacity must be at least 1';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return 'not_found';
  end if;

  -- Serialize every confirmation for this session date. Held until commit, so
  -- the next caller's reads see this one's confirmed row.
  perform pg_advisory_xact_lock(hashtext('mc-seat-confirm:' || b.session_date::text));

  if b.status <> 'pending' then
    return 'not_pending';
  end if;

  if b.source = 'online' then
    cand_start := public.mc_extended_minutes(b.start_time);
    cand_end := cand_start + (b.duration_hours * 60)::integer;

    -- Occupancy only rises at a booking's start, so the peak is found by
    -- sampling at our start plus every other start inside our window.
    for sample_at in
      select cand_start
      union
      select public.mc_extended_minutes(o.start_time)
        from public.bookings o
       where o.session_date = b.session_date
         and o.id <> b.id
         and o.status in ('confirmed', 'completed', 'partial_noshow')
         and public.mc_extended_minutes(o.start_time) > cand_start
         and public.mc_extended_minutes(o.start_time) < cand_end
    loop
      select coalesce(sum(least(greatest(o.racer_count, 0), p_capacity)), 0)
        into occupied
        from public.bookings o
       where o.session_date = b.session_date
         and o.id <> b.id
         and o.status in ('confirmed', 'completed', 'partial_noshow')
         and public.mc_extended_minutes(o.start_time) <= sample_at
         and sample_at < public.mc_extended_minutes(o.start_time) + (o.duration_hours * 60)::integer;
      if occupied > peak then
        peak := occupied;
      end if;
    end loop;

    if peak + least(greatest(b.racer_count, 0), p_capacity) > p_capacity then
      return 'full';
    end if;
  end if;

  update public.bookings set status = 'confirmed' where id = b.id;
  return 'confirmed';
end;
$$;

-- Server-only. The browser must never be able to confirm a booking.
revoke all on function public.confirm_booking_if_seats_free(text, integer) from public, anon, authenticated;
grant execute on function public.confirm_booking_if_seats_free(text, integer) to service_role;
