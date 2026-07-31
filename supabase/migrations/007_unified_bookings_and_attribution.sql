-- Unified all-channels booking ledger for reporting (Claude Cowork), plus
-- structured marketing attribution. Purely ADDITIVE. Applied to the remote
-- Supabase project via the MCP; this file backfills the local folder.
-- Amounts here are DOLLARS (numeric); the operational `bookings` table stays cents.

CREATE TABLE public.mc_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_datetime timestamptz,
  business text NOT NULL DEFAULT 'MC Racing',
  channel text NOT NULL CHECK (channel IN ('online','phone','in_person')),
  racers integer,
  duration_hours numeric,
  amount numeric(10,2),
  deposit_paid numeric(10,2),
  is_membership boolean NOT NULL DEFAULT false,
  customer_ref text,
  attributed_source text CHECK (attributed_source IS NULL OR attributed_source IN
    ('Facebook or Instagram','Google','Walk-by','Referral','Repeat customer','Event','Other')),
  notes text
);
CREATE INDEX mc_bookings_datetime_idx ON public.mc_bookings (booking_datetime);
CREATE INDEX mc_bookings_source_idx ON public.mc_bookings (attributed_source);
ALTER TABLE public.mc_bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS attributed_source text
  CHECK (attributed_source IS NULL OR attributed_source IN
    ('Facebook or Instagram','Google','Walk-by','Referral','Repeat customer','Event','Other'));

CREATE VIEW public.mc_revenue_by_source AS
SELECT
  COALESCE(attributed_source, 'Unknown')          AS attributed_source,
  date_trunc('month', booking_datetime)::date     AS month,
  count(*)                                          AS bookings,
  COALESCE(sum(amount), 0)                          AS revenue,
  COALESCE(sum(deposit_paid), 0)                    AS deposits_collected
FROM public.mc_bookings
GROUP BY 1, 2;
