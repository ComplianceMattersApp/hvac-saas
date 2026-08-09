-- EveryStep FieldWorks: QBO invoice-void bookkeeping columns on internal_invoices
-- Purpose: track whether an app-side void reached QuickBooks. Additive only.
--
-- Why separate columns instead of new qbo_sync_status values: qbo_sync_status is
-- the record of the one-way PUSH (draft -> issued -> synced) and is read by the
-- eligibility engine, the attention center, and the invoice workspace badge.
-- Voiding is a distinct lifecycle that happens AFTER a successful push, so it
-- gets its own state and leaves the push history intact.
--
-- Non-goals: no change to invoice truth (totals, status, numbering) and no
-- change to any existing sync behavior.

BEGIN;

ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS qbo_void_status text NULL
    CHECK (qbo_void_status IN ('pending', 'voided', 'blocked', 'error')),
  ADD COLUMN IF NOT EXISTS qbo_voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qbo_void_error text NULL;

COMMENT ON COLUMN public.internal_invoices.qbo_void_status IS
  'Void-propagation state for an invoice already pushed to QBO. pending=void recorded in app, not yet confirmed in QBO (retryable); voided=QBO invoice is voided; blocked=QBO shows payments applied, needs a human (never auto-retried into a void); error=last attempt failed (retryable). NULL=nothing to propagate.';
COMMENT ON COLUMN public.internal_invoices.qbo_voided_at IS
  'When the QBO invoice was confirmed voided. Distinct from internal_invoices.voided_at, which is the app-side void.';
COMMENT ON COLUMN public.internal_invoices.qbo_void_error IS
  'Operator-facing reason the void has not reached QBO (last error, or the blocked-by-payments explanation).';

-- Sweep index: retryable voids for one account. NULL is included so invoices
-- voided before this lane existed are healed by the first bulk run.
CREATE INDEX IF NOT EXISTS internal_invoices_qbo_void_pending_idx
  ON public.internal_invoices (account_owner_user_id)
  WHERE status = 'void'
    AND qbo_invoice_id IS NOT NULL
    AND (qbo_void_status IS NULL OR qbo_void_status IN ('pending', 'error'));

COMMIT;
