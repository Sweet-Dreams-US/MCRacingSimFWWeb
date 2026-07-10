-- Sales tax tracking on transactions.
-- tax_cents is the sales-tax portion already INCLUDED in amount_cents; broken
-- out so "sales tax collected" is a clean SUM for remittance. Applied to POS +
-- cash sales (reader + web POS). Applied to the live DB via Supabase MCP.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transactions.tax_cents IS
  'Sales tax portion of amount_cents (already included in amount_cents). Tracked separately for remittance. 0 for non-taxable / legacy rows.';
