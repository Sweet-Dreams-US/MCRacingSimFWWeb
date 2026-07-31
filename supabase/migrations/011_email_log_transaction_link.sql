-- Link transactional emails to the transaction they are about.
--
-- APPLIED to project mc-racing-sim-fw (gniqzosrrnlrczmeeryd) as
-- "011_email_log_transaction_link" on 2026-07-31.
--
-- Numbered 011 to continue the REMOTE migration sequence, which is ahead of
-- this folder and already contains its own 008/009/010. This directory is a
-- partial, differently-numbered subset of the applied history — check
-- `list_migrations` against the project before adding another file here.
--
-- Why: email_log previously referenced only a booking or a customer, so there
-- was no way to answer "was a receipt sent for THIS sale, and to what address?"
-- Both the admin transaction page and the on-reader POS need that answer — the
-- lack of it is why receipts could silently not arrive for weeks without anyone
-- noticing. A customer may have many transactions, so related_customer_id is
-- too coarse to identify a specific sale's receipt.
--
-- ON DELETE SET NULL: transactions are normally soft-deleted, but if a row is
-- ever hard-deleted we keep the email record (it is an audit trail of something
-- that really was sent) and simply drop the link.

ALTER TABLE email_log
    ADD COLUMN IF NOT EXISTS related_transaction_id UUID
        REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_transaction_id
    ON email_log(related_transaction_id)
    WHERE related_transaction_id IS NOT NULL;
