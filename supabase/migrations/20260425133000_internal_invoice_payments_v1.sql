-- Compliance Matters: internal invoice payments v1
-- Purpose: add collected-payment ledger truth for issued internal invoices
-- using manual/off-platform recording only (no live processor execution).

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  payment_status text NOT NULL DEFAULT 'recorded',
  payment_method text NOT NULL,
  amount_cents integer NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_reference text NULL,
  notes text NULL,
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Inert placeholders for later processor/accounting seams.
  -- No Stripe/QBO execution is implemented in this slice.
  processor_name text NULL,
  processor_payment_reference text NULL,
  processor_charge_id text NULL,
  qbo_sync_status text NOT NULL DEFAULT 'not_synced',
  qbo_payment_id text NULL,
  qbo_last_synced_at timestamptz NULL,
  qbo_sync_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT internal_invoice_payments_amount_positive_chk
    CHECK (amount_cents > 0),
  CONSTRAINT internal_invoice_payments_status_valid_chk
    CHECK (payment_status IN ('recorded', 'pending', 'failed', 'reversed')),
  CONSTRAINT internal_invoice_payments_method_valid_chk
    CHECK (payment_method IN ('cash', 'check', 'ach_off_platform', 'card_off_platform', 'bank_transfer', 'other')),
  CONSTRAINT internal_invoice_payments_qbo_sync_status_valid_chk
    CHECK (qbo_sync_status IN ('not_synced', 'pending', 'synced', 'failed'))
);

CREATE INDEX IF NOT EXISTS internal_invoice_payments_owner_invoice_paid_idx
  ON public.internal_invoice_payments (account_owner_user_id, invoice_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS internal_invoice_payments_owner_job_paid_idx
  ON public.internal_invoice_payments (account_owner_user_id, job_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS internal_invoice_payments_owner_status_idx
  ON public.internal_invoice_payments (account_owner_user_id, payment_status);

ALTER TABLE public.internal_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_invoice_payments_select_account_scope ON public.internal_invoice_payments;
DROP POLICY IF EXISTS internal_invoice_payments_insert_account_scope ON public.internal_invoice_payments;

CREATE POLICY internal_invoice_payments_select_account_scope
ON public.internal_invoice_payments
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_invoice_payments_insert_account_scope
ON public.internal_invoice_payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND recorded_by_user_id = auth.uid()
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.jobs j
      ON j.id = invoice.job_id
    WHERE invoice.id = internal_invoice_payments.invoice_id
      AND invoice.job_id = internal_invoice_payments.job_id
      AND invoice.account_owner_user_id = internal_invoice_payments.account_owner_user_id
      AND invoice.status = 'issued'
      AND j.id = internal_invoice_payments.job_id
      AND j.deleted_at IS NULL
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        internal_invoice_payments.account_owner_user_id
      )
  )
);

COMMIT;
