-- EveryStep FieldWorks: QBO sync bookkeeping columns on internal_invoices (Lane 6 V1)
-- Purpose: track one-way EveryStep -> QBO invoice sync state per invoice. Additive only.
-- Non-goals: no change to invoice truth (totals, status, numbering) or any operational workflow.

BEGIN;

ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text NULL,
  ADD COLUMN IF NOT EXISTS qbo_customer_id text NULL,
  ADD COLUMN IF NOT EXISTS qbo_sync_token text NULL,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text NULL
    CHECK (qbo_sync_status IN ('pending', 'synced', 'error', 'skipped')),
  ADD COLUMN IF NOT EXISTS qbo_last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qbo_sync_error text NULL;

COMMENT ON COLUMN public.internal_invoices.qbo_invoice_id IS
  'QBO Invoice.Id after first sync. Used for idempotent updates.';
COMMENT ON COLUMN public.internal_invoices.qbo_customer_id IS
  'QBO Customer.Id the invoice was synced against.';
COMMENT ON COLUMN public.internal_invoices.qbo_sync_token IS
  'QBO SyncToken — required for any QBO invoice update operation.';

COMMIT;
