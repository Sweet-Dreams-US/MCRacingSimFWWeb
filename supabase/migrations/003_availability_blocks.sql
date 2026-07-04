-- 003_availability_blocks.sql
--
-- Admin-managed availability blocks: date + optional time window during which
-- ONLINE bookings are refused (admin invites deliberately bypass blocks so the
-- owner can still hand-place a booking inside one, e.g. a private event).
--
-- Semantics:
--   * start_time / end_time both NULL  -> the whole day is blocked.
--   * Otherwise both are set. Times are venue wall-clock (Eastern) and follow
--     the same convention as bookings: hours before noon belong to the SAME
--     session date's late-night tail (venue runs noon -> 2am), so a block of
--     23:00 -> 01:00 covers 11pm through 1am of that date's session.

CREATE TABLE IF NOT EXISTS availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_by_user_id UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Whole-day blocks have neither time; partial blocks have both.
  CONSTRAINT availability_blocks_times_paired
    CHECK ((start_time IS NULL) = (end_time IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_date
  ON availability_blocks (block_date);

-- Deny-by-default like every other table; all access goes through the
-- service-role client in API routes (the trust boundary).
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
