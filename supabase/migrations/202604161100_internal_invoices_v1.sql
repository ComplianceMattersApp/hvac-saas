-- Compliance Matters: internal invoice v1 foundation
-- Purpose: add the smallest real job-linked internal invoice record for
-- internal-invoicing companies without expanding into payment execution.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  service_case_id uuid NULL REFERENCES public.service_cases(id) ON DELETE SET NULL,

  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  issued_at timestamptz NULL,
  issued_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz NULL,
  voided_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason text NULL,

  source_type text NOT NULL DEFAULT 'job',
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  notes text NULL,

  billing_name text NULL,
  billing_email text NULL,
  billing_phone text NULL,
  billing_address_line1 text NULL,
  billing_address_line2 text NULL,
  billing_city text NULL,
  billing_state text NULL,
  billing_zip text NULL,

  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT internal_invoices_status_valid_chk
    CHECK (status IN ('draft', 'issued', 'void')),
  CONSTRAINT internal_invoices_source_type_valid_chk
    CHECK (source_type IN ('job', 'manual', 'estimate')),
  CONSTRAINT internal_invoices_invoice_number_not_blank_chk
    CHECK (length(btrim(invoice_number)) > 0),
  CONSTRAINT internal_invoices_subtotal_nonnegative_chk
    CHECK (subtotal_cents >= 0),
  CONSTRAINT internal_invoices_total_nonnegative_chk
    CHECK (total_cents >= 0),
  CONSTRAINT internal_invoices_total_gte_subtotal_chk
    CHECK (total_cents >= subtotal_cents),
  CONSTRAINT internal_invoices_issued_requires_timestamp_chk
    CHECK (status <> 'issued' OR issued_at IS NOT NULL),
  CONSTRAINT internal_invoices_void_requires_timestamp_chk
    CHECK (status <> 'void' OR voided_at IS NOT NULL),
  CONSTRAINT internal_invoices_draft_state_chk
    CHECK (
      status <> 'draft'
      OR (
        issued_at IS NULL
        AND issued_by_user_id IS NULL
        AND voided_at IS NULL
        AND voided_by_user_id IS NULL
        AND void_reason IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_job_unique_idx
  ON public.internal_invoices (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_owner_number_unique_idx
  ON public.internal_invoices (account_owner_user_id, invoice_number);

CREATE INDEX IF NOT EXISTS internal_invoices_owner_status_created_idx
  ON public.internal_invoices (account_owner_user_id, status, created_at DESC);

ALTER TABLE public.internal_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_invoices_select_account_scope ON public.internal_invoices;
DROP POLICY IF EXISTS internal_invoices_insert_account_scope ON public.internal_invoices;
DROP POLICY IF EXISTS internal_invoices_update_account_scope ON public.internal_invoices;

CREATE POLICY internal_invoices_select_account_scope
ON public.internal_invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoices.account_owner_user_id
  )
);

CREATE POLICY internal_invoices_insert_account_scope
ON public.internal_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoices.account_owner_user_id
  )
);

CREATE POLICY internal_invoices_update_account_scope
ON public.internal_invoices
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoices.account_owner_user_id
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoices.account_owner_user_id
  )
);

COMMIT;