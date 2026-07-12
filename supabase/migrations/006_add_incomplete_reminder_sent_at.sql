-- Track the "finish your booking" nudge for still-pending (no card) online
-- bookings, so the reminder cron sends exactly one. Applied via Supabase MCP.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS incomplete_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.bookings.incomplete_reminder_sent_at IS
  'When we emailed a "finish your booking" reminder for a still-pending (no card) online booking. Null = not yet reminded.';
