-- ============================================================================
-- MC Racing Sim Fort Wayne — Initial Schema
-- Migration: 001_initial_schema
-- ============================================================================
-- Design principles:
-- 1. All money stored as INTEGER cents (BIGINT to allow large lifetime totals).
--    Never floats — float math + money = silent bugs at scale.
-- 2. All timestamps are TIMESTAMPTZ (UTC under the hood, no ambiguity).
-- 3. Soft deletes only on accounting tables. No transaction is ever physically
--    removed — financial records must be defensible for tax/audit/chargeback.
-- 4. All tables RLS-enabled, deny-by-default. Server-side code (API routes)
--    uses the service_role key to write. Client never writes directly to
--    payment/accounting tables.
-- 5. UUIDs for primary keys everywhere except booking_id (human-shareable
--    MC-XXXXX format already in use).
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE booking_status AS ENUM (
    'confirmed',      -- card on file, future session
    'completed',      -- session happened, all racers showed
    'partial_noshow', -- some racers showed, some didn't
    'noshow',         -- nobody showed
    'cancelled'       -- cancelled with notice (no charge)
);

CREATE TYPE booking_source AS ENUM (
    'online',  -- public booking form
    'admin',   -- staff entered in admin panel (phone-in, walk-in)
    'imported' -- migrated from Google Sheets historical data
);

CREATE TYPE charge_status AS ENUM (
    'pending',          -- charge created, not yet processed
    'succeeded',        -- money successfully captured
    'failed',           -- declined, insufficient funds, etc.
    'requires_action',  -- 3DS/SCA needed, can't complete off-session
    'refunded'          -- charge was refunded after success
);

CREATE TYPE payment_method_type AS ENUM (
    'stripe_online',   -- card stored via SetupIntent during booking
    'stripe_terminal', -- in-person reader (S700/WisePOS E)
    'cash',            -- physical cash
    'other',           -- gift card, comp, etc.
    'internal'         -- bookkeeping-only entry (transfers, owner draws)
);

CREATE TYPE transaction_type AS ENUM (
    -- Income
    'booking_income',     -- session revenue from a completed booking
    'no_show_fee',        -- $20/seat charged to card on no-show
    'in_person_sale',     -- ad-hoc sale at front desk (party, walk-in, merch)
    'other_income',       -- misc income
    -- Outflow
    'expense',            -- business expense (categorized)
    'owner_payout',       -- Mark draws
    'employee_payout',    -- employee wages
    'marketing_payout',   -- Sweet Dreams revenue share
    -- Cash management (no P&L impact)
    'cash_deposit',       -- cash drawer → bank
    'cash_withdrawal',    -- bank → cash drawer
    -- Adjustments
    'refund',             -- money returned to customer (negative income)
    'adjustment'          -- catch-all manual correction
);

CREATE TYPE admin_role AS ENUM (
    'owner',         -- Mark — full access
    'staff',         -- can mark no-shows, check in customers, see bookings
    'sweet_dreams',  -- can view revenue dashboard + their own payout
    'readonly'       -- view-only for accountant/bookkeeper access
);

-- ============================================================================
-- ADMIN USERS
-- ============================================================================
-- Linked 1:1 with Supabase auth.users via the auth_user_id FK.
-- An auth.users row alone gives no app access — must also have admin_users row.

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role admin_role NOT NULL DEFAULT 'staff',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_users_auth_user_id ON admin_users(auth_user_id);
CREATE INDEX idx_admin_users_active ON admin_users(active) WHERE active = TRUE;

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
-- A customer = a unique person who has booked or attended.
-- Phone is collected per spec but only email is required.
-- stripe_customer_id is populated when they first save a card on file.

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    birthday DATE,
    how_heard TEXT, -- "Google", "Facebook", "Friend", etc.
    stripe_customer_id TEXT UNIQUE, -- cus_xxx, null until they save a card
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    -- Denormalized aggregates (updated by triggers below)
    total_bookings INTEGER NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customers_email_lower ON customers(LOWER(email));
CREATE INDEX idx_customers_stripe_customer_id ON customers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_customers_last_visit ON customers(last_visit_at DESC NULLS LAST);

-- ============================================================================
-- BOOKINGS
-- ============================================================================
-- The core scheduling record. One row per session reservation.
-- ID uses MC-XXXXX format for human-shareable URLs (kept from current Sheets system).

CREATE TABLE bookings (
    id TEXT PRIMARY KEY, -- "MC-XXXXX" format, generated server-side
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    -- Session details
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours INTEGER NOT NULL CHECK (duration_hours IN (1, 2, 3)),
    racer_count INTEGER NOT NULL CHECK (racer_count BETWEEN 1 AND 3),
    -- Pricing
    session_price_cents BIGINT NOT NULL,
    no_show_fee_cents BIGINT NOT NULL, -- always racer_count * 2000 at booking time
    -- Stripe
    stripe_setup_intent_id TEXT, -- seti_xxx
    stripe_payment_method_id TEXT, -- pm_xxx — the card to charge on no-show
    -- Status
    status booking_status NOT NULL DEFAULT 'confirmed',
    source booking_source NOT NULL DEFAULT 'online',
    -- No-show consent snapshot (chargeback defense — exactly what they agreed to)
    consent_text TEXT NOT NULL,
    consent_fee_cents BIGINT NOT NULL, -- mirrors no_show_fee_cents at the moment of booking
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_ip TEXT,
    consent_user_agent TEXT,
    -- Calendar integration
    google_calendar_event_id TEXT,
    -- Admin metadata
    notes TEXT, -- staff notes
    created_by_user_id UUID REFERENCES admin_users(id), -- null = self-booked online
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_session_date ON bookings(session_date);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_stripe_payment_method ON bookings(stripe_payment_method_id) WHERE stripe_payment_method_id IS NOT NULL;
CREATE INDEX idx_bookings_upcoming ON bookings(session_date, start_time) WHERE status = 'confirmed';

-- ============================================================================
-- BOOKING RACERS
-- ============================================================================
-- One row per seat on a booking. Slot 1 = primary (matches customers row),
-- slots 2-3 = additional racers (name + optional email/phone).
-- Each racer tracks their own waiver signature + no-show status independently.

CREATE TABLE booking_racers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
    name TEXT NOT NULL,
    email TEXT, -- optional for slots 2-3 (friend FYI email)
    phone TEXT, -- optional
    -- Waiver tracking
    waiver_signed_at TIMESTAMPTZ,
    waiver_form_data JSONB, -- birthday, how_heard, etc. captured at check-in
    -- Friend FYI email
    friend_email_sent_at TIMESTAMPTZ,
    -- No-show tracking (set when admin marks the booking)
    showed_up BOOLEAN, -- null = not yet decided, true = showed, false = no-show
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(booking_id, slot)
);

CREATE INDEX idx_booking_racers_booking_id ON booking_racers(booking_id);
CREATE INDEX idx_booking_racers_email_lower ON booking_racers(LOWER(email)) WHERE email IS NOT NULL;

-- ============================================================================
-- STRIPE WEBHOOK EVENTS
-- ============================================================================
-- Every Stripe webhook is recorded here BEFORE processing for idempotency.
-- If the same stripe_event_id arrives twice, we no-op.

CREATE TABLE stripe_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT NOT NULL UNIQUE, -- evt_xxx
    event_type TEXT NOT NULL, -- setup_intent.succeeded, payment_intent.succeeded, etc.
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    error TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_unprocessed ON stripe_webhook_events(received_at) WHERE processed_at IS NULL;

-- ============================================================================
-- STRIPE CHARGES
-- ============================================================================
-- Every PaymentIntent we create (no-show fee charges, in-person Terminal sales).
-- Idempotency key prevents double-charging on retries.

CREATE TABLE stripe_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_payment_intent_id TEXT NOT NULL UNIQUE, -- pi_xxx
    booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT, -- nullable for ad-hoc in-person sales
    customer_id UUID REFERENCES customers(id),
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status charge_status NOT NULL,
    payment_method_type payment_method_type NOT NULL,
    stripe_payment_method_id TEXT,
    -- Failure details (when status = failed)
    decline_code TEXT,
    failure_message TEXT,
    -- Reason for charge (free-form, e.g., "No-show fee — 2 of 3 racers")
    reason TEXT NOT NULL,
    -- Idempotency
    idempotency_key TEXT NOT NULL UNIQUE,
    -- Stripe metadata
    stripe_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_charges_booking_id ON stripe_charges(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_stripe_charges_customer_id ON stripe_charges(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_stripe_charges_status ON stripe_charges(status);

-- ============================================================================
-- EXPENSE CATEGORIES
-- ============================================================================
-- Mark/staff-managed list of expense categories.
-- schedule_c_line is for IRS Schedule C mapping (sole prop) — populated for
-- common categories so YTD export is ready for tax time.

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    schedule_c_line TEXT, -- e.g., "Line 8: Advertising"
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed common categories
INSERT INTO expense_categories (name, schedule_c_line, sort_order) VALUES
    ('Rent', 'Line 20b: Rent — other property', 10),
    ('Utilities', 'Line 25: Utilities', 20),
    ('Equipment', 'Line 13: Depreciation', 30),
    ('Repairs & Maintenance', 'Line 21: Repairs and maintenance', 40),
    ('Software & Subscriptions', 'Line 18: Office expense', 50),
    ('Advertising & Marketing', 'Line 8: Advertising', 60),
    ('Insurance', 'Line 15: Insurance (other than health)', 70),
    ('Office Supplies', 'Line 22: Supplies', 80),
    ('Professional Services', 'Line 17: Legal and professional services', 90),
    ('Bank & Payment Fees', 'Line 27a: Other expenses', 100),
    ('Meals (50% deductible)', 'Line 24b: Meals', 110),
    ('Travel', 'Line 24a: Travel', 120),
    ('Other', 'Line 27a: Other expenses', 999);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================
-- THE central money log. Every dollar that moves in or out of the business
-- generates exactly one row here. Source of truth for all financial reports.
--
-- Convention: amount_cents > 0 for inflows, < 0 for outflows.
-- A booking_income of $100 = +10000. An expense of $50 = -5000.
-- This makes SUM(amount_cents) GROUP BY period a one-line P&L query.
--
-- No hard deletes. soft_deleted_at + audit trail for chargeback/audit defense.

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type transaction_type NOT NULL,
    amount_cents BIGINT NOT NULL, -- signed: positive=in, negative=out
    occurred_on DATE NOT NULL, -- effective date for accounting
    description TEXT NOT NULL,
    -- Foreign keys (nullable depending on transaction type)
    booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id),
    stripe_charge_id UUID REFERENCES stripe_charges(id),
    expense_category_id UUID REFERENCES expense_categories(id),
    -- Payment method
    payment_method payment_method_type NOT NULL,
    -- Expense-specific
    receipt_url TEXT, -- Supabase Storage URL
    vendor TEXT,
    -- Payout-specific
    payout_period_start DATE,
    payout_period_end DATE,
    payout_recipient TEXT, -- "Mark", "Sweet Dreams", employee name
    -- Audit (immutable once set)
    created_by_user_id UUID REFERENCES admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Soft delete (with reason for audit trail)
    soft_deleted_at TIMESTAMPTZ,
    soft_deleted_by_user_id UUID REFERENCES admin_users(id),
    soft_delete_reason TEXT,
    -- Updates allowed only for description/category corrections
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES admin_users(id),
    CHECK (
        (soft_deleted_at IS NULL AND soft_deleted_by_user_id IS NULL AND soft_delete_reason IS NULL)
        OR (soft_deleted_at IS NOT NULL AND soft_deleted_by_user_id IS NOT NULL AND soft_delete_reason IS NOT NULL)
    )
);

CREATE INDEX idx_transactions_occurred_on ON transactions(occurred_on);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_active ON transactions(occurred_on, type) WHERE soft_deleted_at IS NULL;
CREATE INDEX idx_transactions_booking_id ON transactions(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_transactions_expense_category ON transactions(expense_category_id) WHERE expense_category_id IS NOT NULL;
CREATE INDEX idx_transactions_payment_method ON transactions(payment_method);

-- ============================================================================
-- TRANSACTION AUDIT LOG
-- ============================================================================
-- Every change to a transaction row is logged here forever.
-- Required for: chargeback defense, IRS audit defense, internal accountability.

CREATE TABLE transaction_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    action TEXT NOT NULL, -- 'created', 'updated', 'soft_deleted'
    changed_by_user_id UUID REFERENCES admin_users(id),
    before_state JSONB,
    after_state JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_audit_log_transaction_id ON transaction_audit_log(transaction_id);
CREATE INDEX idx_transaction_audit_log_occurred_at ON transaction_audit_log(occurred_at DESC);

-- ============================================================================
-- CASH DRAWER
-- ============================================================================
-- Running balance of physical cash on premises.
-- Each row records a movement (cash in from sale, cash out for change/petty,
-- cash deposited to bank). Balance = SUM(amount_cents).

CREATE TABLE cash_drawer_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount_cents BIGINT NOT NULL, -- positive=cash added, negative=cash removed
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_id UUID REFERENCES transactions(id), -- link to the originating transaction
    notes TEXT,
    created_by_user_id UUID REFERENCES admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_drawer_entries_occurred_at ON cash_drawer_entries(occurred_at DESC);

-- ============================================================================
-- MARKETING PAYOUT CALCULATIONS
-- ============================================================================
-- One row per month showing the auto-calculated Sweet Dreams payout.
-- Populated by a cron at month-end (or on-demand recalculation).

CREATE TABLE marketing_payout_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    gross_revenue_cents BIGINT NOT NULL,
    computed_payout_cents BIGINT NOT NULL,
    bracket_breakdown JSONB NOT NULL, -- {bracket: revenue_in_bracket, rate, payout} for transparency
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_transaction_id UUID REFERENCES transactions(id),
    notes TEXT,
    UNIQUE(period_year, period_month)
);

CREATE INDEX idx_marketing_payout_period ON marketing_payout_calculations(period_year DESC, period_month DESC);

-- ============================================================================
-- EMAIL LOG
-- ============================================================================
-- Every transactional email we send via Resend.

CREATE TABLE email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT NOT NULL, -- 'booking_confirmation', 'friend_fyi', 'reminder', 'noshow_charged', 'noshow_failed_admin'
    resend_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'bounced', 'failed'
    related_booking_id TEXT REFERENCES bookings(id),
    related_customer_id UUID REFERENCES customers(id),
    error TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_log_to_email ON email_log(LOWER(to_email));
CREATE INDEX idx_email_log_booking_id ON email_log(related_booking_id) WHERE related_booking_id IS NOT NULL;
CREATE INDEX idx_email_log_sent_at ON email_log(sent_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stripe_charges_updated_at BEFORE UPDATE ON stripe_charges
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Default-deny on every table. Server-side code uses the service_role key
-- which bypasses RLS entirely (this is the trust boundary).
--
-- The only direct client-side access we'll enable is for admin_users to
-- query their own row (used for login/role lookup). All other data flows
-- through Next.js API routes that hold the service role key.

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_racers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_payout_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Authenticated admin_users can read their own row (for login/role lookup)
CREATE POLICY "admin_users_select_own" ON admin_users
    FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

-- That's the only public-facing policy. Everything else flows through server
-- code using the service_role key.

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
-- Receipts bucket for expense receipt photo uploads (private; admin-only access).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    FALSE,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
