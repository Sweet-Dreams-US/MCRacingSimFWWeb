-- Meta ad-click attribution on the booking row + a Schedule delivery receipt.
-- Purely ADDITIVE: every column is nullable with no default, so existing rows
-- and every current INSERT keep working untouched.
--
-- WHY: the server-side Schedule event fires from the Stripe webhook, minutes
-- after the customer's browser is gone. Without the click id (_fbc) captured at
-- landing, Meta receives a conversion it cannot credit to any campaign — which
-- is how 13 real bookings showed up as 8 in Ads Manager. We now persist the
-- click/campaign context at booking time and read it back in the webhook.

ALTER TABLE public.bookings
  -- Meta browser id + click id, in Meta's own cookie format.
  ADD COLUMN IF NOT EXISTS fbp           text,
  ADD COLUMN IF NOT EXISTS fbc           text,
  -- Raw fbclid kept alongside fbc so the click id can be rebuilt if needed.
  ADD COLUMN IF NOT EXISTS fbclid        text,
  ADD COLUMN IF NOT EXISTS utm_source    text,
  ADD COLUMN IF NOT EXISTS utm_medium    text,
  ADD COLUMN IF NOT EXISTS utm_campaign  text,
  ADD COLUMN IF NOT EXISTS utm_content   text,
  ADD COLUMN IF NOT EXISTS utm_term      text,
  ADD COLUMN IF NOT EXISTS landing_url   text,
  -- Delivery receipt for the server-side Schedule event. Lets us reconcile
  -- "bookings that exist" against "conversions Meta was actually told about"
  -- without leaving the database, and makes a re-send safe to detect.
  ADD COLUMN IF NOT EXISTS meta_schedule_sent_at timestamptz;

-- Reconciliation query support: find confirmed online bookings whose Schedule
-- never reached Meta. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_bookings_meta_schedule_missing
  ON public.bookings (created_at)
  WHERE meta_schedule_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_utm_campaign
  ON public.bookings (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN public.bookings.fbc IS
  'Meta click id (fb.1.<clickTs>.<fbclid>) captured at landing. Forwarded to the Conversions API so a server-side Schedule can be attributed to the ad click.';
COMMENT ON COLUMN public.bookings.meta_schedule_sent_at IS
  'When the server-side Meta Schedule event was accepted for this booking. NULL = Meta was never told about this conversion.';

-- ---------------------------------------------------------------------------
-- Weekly reconciliation view: pixel-eligible bookings vs Schedule deliveries.
-- Compare `bookings` against Events Manager for the same week; they should match.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.mc_meta_schedule_reconciliation AS
SELECT
  date_trunc('week', created_at)::date                              AS week,
  count(*)                                                          AS online_bookings,
  count(*) FILTER (WHERE meta_schedule_sent_at IS NOT NULL)         AS schedule_events_sent,
  count(*) FILTER (WHERE meta_schedule_sent_at IS NULL)             AS schedule_events_missing,
  count(*) FILTER (WHERE fbc IS NOT NULL)                           AS with_click_id,
  count(*) FILTER (WHERE utm_source IS NOT NULL)                    AS with_utm
FROM public.bookings
WHERE source = 'online'
  -- Everything past the card step. A booking later cancelled or no-showed was
  -- still a genuine Schedule at the moment we reported it, so it belongs in the
  -- comparison. Cast to text so this view never depends on enum membership.
  AND status::text <> 'pending'
GROUP BY 1
ORDER BY 1 DESC;
