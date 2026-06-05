-- Compliance Matters: field payment collection reports foundation (B7-F)
-- Purpose: add durable field-reported non-card collection and reconciliation
-- storage without mutating invoice totals, payment truth, or card flows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.field_payment_collection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  internal_invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id) ON DELETE RESTRICT,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,

  reported_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reported_at timestamptz NOT NULL DEFAULT now(),

  payment_method text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  reference text NULL,
  note text NULL,

  status text NOT NULL DEFAULT 'reported',
  verified_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NULL,
  verification_note text NULL,
  rejected_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz NULL,
  rejection_reason text NULL,
  voided_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz NULL,
  void_reason text NULL,

  corrected_from_report_id uuid NULL REFERENCES public.field_payment_collection_reports(id) ON DELETE SET NULL,
  final_internal_invoice_payment_id uuid NULL REFERENCES public.internal_invoice_payments(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_payment_collection_reports_method_valid_chk
    CHECK (payment_method IN ('check', 'cash', 'other')),
  CONSTRAINT field_payment_collection_reports_status_valid_chk
    CHECK (status IN ('reported', 'under_review', 'needs_correction', 'verified', 'rejected', 'voided', 'corrected')),
  CONSTRAINT field_payment_collection_reports_amount_positive_chk
    CHECK (amount_cents > 0),
  CONSTRAINT field_payment_collection_reports_currency_valid_chk
    CHECK (currency = lower(currency) AND length(currency) = 3),
  CONSTRAINT field_payment_collection_reports_reported_state_chk
    CHECK (status <> 'reported' OR reported_at IS NOT NULL),
  CONSTRAINT field_payment_collection_reports_verified_state_chk
    CHECK (
      status <> 'verified'
      OR (
        verified_by_user_id IS NOT NULL
        AND verified_at IS NOT NULL
      )
    ),
  CONSTRAINT field_payment_collection_reports_rejected_state_chk
    CHECK (
      status <> 'rejected'
      OR (
        rejected_by_user_id IS NOT NULL
        AND rejected_at IS NOT NULL
        AND rejection_reason IS NOT NULL
      )
    ),
  CONSTRAINT field_payment_collection_reports_voided_state_chk
    CHECK (
      status <> 'voided'
      OR (
        voided_by_user_id IS NOT NULL
        AND voided_at IS NOT NULL
        AND void_reason IS NOT NULL
      )
    ),
  CONSTRAINT field_payment_collection_reports_corrected_state_chk
    CHECK (status <> 'corrected' OR corrected_from_report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_owner_status_idx
  ON public.field_payment_collection_reports (account_owner_user_id, status, reported_at DESC);

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_owner_invoice_status_idx
  ON public.field_payment_collection_reports (account_owner_user_id, internal_invoice_id, status, reported_at DESC);

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_owner_job_status_idx
  ON public.field_payment_collection_reports (account_owner_user_id, job_id, status, reported_at DESC);

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_owner_reporter_idx
  ON public.field_payment_collection_reports (account_owner_user_id, reported_by_user_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_final_payment_idx
  ON public.field_payment_collection_reports (final_internal_invoice_payment_id)
  WHERE final_internal_invoice_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_payment_collection_reports_corrected_from_idx
  ON public.field_payment_collection_reports (corrected_from_report_id)
  WHERE corrected_from_report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_field_payment_collection_report_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job_owner_id uuid;
  job_customer_id uuid;
  invoice_owner_id uuid;
  invoice_job_id uuid;
  invoice_customer_id uuid;
  source_owner_id uuid;
  source_job_id uuid;
  source_invoice_id uuid;
  source_customer_id uuid;
  payment_owner_id uuid;
  payment_job_id uuid;
  payment_invoice_id uuid;
BEGIN
  SELECT job.account_owner_user_id, job.customer_id
  INTO job_owner_id, job_customer_id
  FROM public.jobs job
  WHERE job.id = NEW.job_id;

  IF job_owner_id IS NULL OR job_customer_id IS NULL THEN
    RAISE EXCEPTION 'field_payment_collection_reports job not found or missing customer/account scope'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM job_owner_id THEN
    RAISE EXCEPTION 'field_payment_collection_reports account_owner_user_id must match jobs.account_owner_user_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT invoice.account_owner_user_id, invoice.job_id, invoice.customer_id
  INTO invoice_owner_id, invoice_job_id, invoice_customer_id
  FROM public.internal_invoices invoice
  WHERE invoice.id = NEW.internal_invoice_id;

  IF invoice_owner_id IS NULL OR invoice_job_id IS NULL THEN
    RAISE EXCEPTION 'field_payment_collection_reports internal invoice not found or missing account/job scope'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM invoice_owner_id THEN
    RAISE EXCEPTION 'field_payment_collection_reports internal invoice/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.job_id IS DISTINCT FROM invoice_job_id THEN
    RAISE EXCEPTION 'field_payment_collection_reports internal invoice/job mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    IF NEW.customer_id IS DISTINCT FROM job_customer_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports customer/job mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF invoice_customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM invoice_customer_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports customer/invoice mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.corrected_from_report_id IS NOT NULL THEN
    SELECT source_report.account_owner_user_id,
           source_report.job_id,
           source_report.internal_invoice_id,
           source_report.customer_id
    INTO source_owner_id, source_job_id, source_invoice_id, source_customer_id
    FROM public.field_payment_collection_reports source_report
    WHERE source_report.id = NEW.corrected_from_report_id;

    IF source_owner_id IS NULL OR source_job_id IS NULL OR source_invoice_id IS NULL THEN
      RAISE EXCEPTION 'field_payment_collection_reports corrected source not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM source_owner_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports corrected source/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.job_id IS DISTINCT FROM source_job_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports corrected source/job mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.internal_invoice_id IS DISTINCT FROM source_invoice_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports corrected source/invoice mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.customer_id IS NOT NULL AND source_customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM source_customer_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports corrected source/customer mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.final_internal_invoice_payment_id IS NOT NULL THEN
    SELECT payment.account_owner_user_id, payment.job_id, payment.invoice_id
    INTO payment_owner_id, payment_job_id, payment_invoice_id
    FROM public.internal_invoice_payments payment
    WHERE payment.id = NEW.final_internal_invoice_payment_id;

    IF payment_owner_id IS NULL OR payment_job_id IS NULL OR payment_invoice_id IS NULL THEN
      RAISE EXCEPTION 'field_payment_collection_reports final payment not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM payment_owner_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports final payment/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.job_id IS DISTINCT FROM payment_job_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports final payment/job mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.internal_invoice_id IS DISTINCT FROM payment_invoice_id THEN
      RAISE EXCEPTION 'field_payment_collection_reports final payment/invoice mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_payment_collection_reports_assert_scope
  ON public.field_payment_collection_reports;

CREATE TRIGGER field_payment_collection_reports_assert_scope
BEFORE INSERT OR UPDATE ON public.field_payment_collection_reports
FOR EACH ROW
EXECUTE FUNCTION public.assert_field_payment_collection_report_scope();

ALTER TABLE public.field_payment_collection_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_payment_collection_reports_select_account_scope
  ON public.field_payment_collection_reports;

CREATE POLICY field_payment_collection_reports_select_account_scope
ON public.field_payment_collection_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = field_payment_collection_reports.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE application policies in B7-F.
-- Durable storage exists for future server-side report actions with explicit
-- capability checks and separate verification authority.

COMMIT;