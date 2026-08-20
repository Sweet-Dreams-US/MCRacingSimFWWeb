-- First-party campaign attribution, readable without Meta.
--
-- Depends on the utm_* columns added in 016. Purely additive (a view).
--
-- utm_content carries the AD NAME, so this is what names a winning creative
-- when Meta's own reporting disagrees or under-reports (blocked pixel, iOS/AEM
-- drops, attribution-window differences). The admin UI renders the same data at
-- /admin/ads -> "Bookings by ad"; this view is for ad-hoc SQL.
--
-- Ad names in Ads Manager must match the utm_content value in that ad's
-- destination URL EXACTLY, or one creative fragments across several rows.

CREATE OR REPLACE VIEW public.mc_bookings_by_campaign AS
SELECT
  COALESCE(utm_campaign, '(no campaign)')                       AS campaign,
  COALESCE(utm_content, '(no ad name)')                         AS ad_name,
  COALESCE(utm_source, '(untagged)')                            AS utm_source,
  COALESCE(utm_medium, '(untagged)')                            AS utm_medium,
  date_trunc('week', created_at)::date                          AS week,
  count(*)                                                      AS bookings,
  -- Net committed total, pre-tax: session price minus any discount. Cents in
  -- the operational table, dollars here to match the other reporting views.
  COALESCE(sum(GREATEST(0, session_price_cents - COALESCE(discount_amount_cents, 0))), 0) / 100.0
                                                                AS revenue,
  count(*) FILTER (WHERE fbc IS NOT NULL OR fbclid IS NOT NULL) AS with_click_id
FROM public.bookings
WHERE source = 'online'
  -- Everything past the card step. Cast to text so this view never depends on
  -- booking_status enum membership.
  AND status::text <> 'pending'
GROUP BY 1, 2, 3, 4, 5;

COMMENT ON VIEW public.mc_bookings_by_campaign IS
  'First-party ad attribution from the utm_* params captured at landing. ad_name = utm_content. Independent of Meta reporting by design.';
