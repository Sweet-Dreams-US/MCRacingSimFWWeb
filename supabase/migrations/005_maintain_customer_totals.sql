-- Keep customers.total_spent_cents + total_bookings live (they existed but were
-- never written, so every customer showed $0 spent / 0 bookings). Recompute the
-- affected customer's totals on any transaction/booking change, + backfill.
-- Applied to the live DB via Supabase MCP.

CREATE OR REPLACE FUNCTION public.recompute_customer_totals(p_customer_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_customer_id IS NULL THEN RETURN; END IF;
  UPDATE public.customers c SET
    total_spent_cents = COALESCE((
      SELECT SUM(t.amount_cents) FROM public.transactions t
      WHERE t.customer_id = p_customer_id
        AND t.soft_deleted_at IS NULL
        AND t.type NOT IN ('expense','owner_payout','employee_payout','marketing_payout','cash_deposit','cash_withdrawal')
    ), 0),
    total_bookings = COALESCE((
      SELECT COUNT(*) FROM public.bookings b
      WHERE b.customer_id = p_customer_id
        AND b.status IN ('confirmed','completed','partial_noshow','noshow')
    ), 0)
  WHERE c.id = p_customer_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_recompute_customer_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.recompute_customer_totals(OLD.customer_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.recompute_customer_totals(NEW.customer_id);
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS transactions_recompute_customer_totals ON public.transactions;
CREATE TRIGGER transactions_recompute_customer_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_customer_totals();

DROP TRIGGER IF EXISTS bookings_recompute_customer_totals ON public.bookings;
CREATE TRIGGER bookings_recompute_customer_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_customer_totals();

UPDATE public.customers c SET
  total_spent_cents = COALESCE((
    SELECT SUM(t.amount_cents) FROM public.transactions t
    WHERE t.customer_id = c.id AND t.soft_deleted_at IS NULL
      AND t.type NOT IN ('expense','owner_payout','employee_payout','marketing_payout','cash_deposit','cash_withdrawal')
  ), 0),
  total_bookings = COALESCE((
    SELECT COUNT(*) FROM public.bookings b
    WHERE b.customer_id = c.id AND b.status IN ('confirmed','completed','partial_noshow','noshow')
  ), 0);
