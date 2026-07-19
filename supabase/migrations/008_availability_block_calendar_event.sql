-- Availability blocks (staff "personal appointments" / closures) are now
-- mirrored to Google Calendar as a "🚫 Blocked" event. We store the created
-- event id so the event can be removed when the block is deleted.
--
-- This column was first applied to the live database out-of-band; this file
-- brings the committed migration history in sync so fresh / CI-provisioned
-- databases also get it. Idempotent so re-applying over the live DB is safe.
ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

COMMENT ON COLUMN public.availability_blocks.google_calendar_event_id IS
  'Google Calendar event id for the mirrored "Blocked" event; null if the calendar sync was skipped or failed (best-effort).';
