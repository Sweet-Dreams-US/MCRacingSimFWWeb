-- 002_admin_panel_columns.sql
--
-- Captures live-DB columns that the admin-panel + booking code depends on but
-- which were applied to the remote DB via Supabase MCP migrations (so they live
-- in the remote migration history, not in 001_initial_schema.sql). This keeps a
-- from-scratch `supabase db reset` reproducible for the code in this repo.
--
-- NOTE: the authoritative migration history is the remote Supabase project; this
-- file backfills the local folder for the columns the committed code reads/writes.
-- All statements are idempotent (IF NOT EXISTS) so re-applying is safe.

-- Customers: source tag (e.g. 'booking', 'admin', 'imported') used by the
-- find-or-create paths in src/lib/booking.ts and the invite flow.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT;

-- Bookings: day-before email reminder idempotency stamp (cron:
-- src/app/api/cron/send-booking-reminders).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ;
