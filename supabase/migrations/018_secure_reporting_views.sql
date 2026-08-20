-- SECURITY FIX: stop the reporting views leaking booking + revenue data to the
-- public `anon` role.
--
-- What was wrong
-- --------------
-- `bookings` has RLS enabled with no policies, so a direct read by `anon`
-- correctly returns nothing. But a Postgres view defaults to
-- `security_invoker = false`, meaning it executes as the view's OWNER and
-- therefore BYPASSES the querying user's RLS. Supabase also grants the public
-- roles full privileges on new objects in `public` by default. Together those
-- two defaults turned every reporting view into a public read hole around RLS.
--
-- Verified against the live database before this migration:
--     SET LOCAL ROLE anon;
--     SELECT count(*) FROM bookings;                  -- 0     (RLS holds)
--     SELECT count(*) FROM mc_meta_schedule_reconciliation; -- 7  (bypassed)
--     SELECT sum(revenue) FROM mc_revenue_by_source;  -- 2187.00 (bypassed)
--
-- Because the anon key ships in client-side JavaScript, anyone could read these
-- through PostgREST. mc_revenue_by_source has been exposed since migration 007;
-- the two Meta views were introduced in 016/017 and are fixed here before they
-- ever reached production traffic.
--
-- The fix
-- -------
-- 1. security_invoker = on  -> the view runs as the CALLER, so `bookings` RLS
--    applies and anon gets nothing. The app is unaffected: every reader of
--    these views uses the service-role client, which bypasses RLS by design.
-- 2. REVOKE ALL from anon/authenticated -> defense in depth. These are
--    admin-only reporting views; the public roles have no business holding
--    SELECT on them, let alone the INSERT/UPDATE/DELETE/TRUNCATE that
--    Supabase's default grants handed out.
--
-- Both are required. (1) alone still leaves the grants in place for any future
-- view definition change; (2) alone still bypasses RLS for any role that keeps
-- a grant.

ALTER VIEW public.mc_meta_schedule_reconciliation SET (security_invoker = on);
ALTER VIEW public.mc_bookings_by_campaign         SET (security_invoker = on);
-- Pre-existing since 007. Same defect, same fix.
ALTER VIEW public.mc_revenue_by_source            SET (security_invoker = on);

REVOKE ALL ON public.mc_meta_schedule_reconciliation FROM anon, authenticated;
REVOKE ALL ON public.mc_bookings_by_campaign         FROM anon, authenticated;
REVOKE ALL ON public.mc_revenue_by_source            FROM anon, authenticated;
