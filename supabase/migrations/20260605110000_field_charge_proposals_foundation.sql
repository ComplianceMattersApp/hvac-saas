-- Compliance Matters: field charge proposals foundation (B6-F)
-- Purpose: add durable proposed-charge workflow truth without mutating
-- internal invoice line items, invoice totals, payment readiness, or payment truth.

BEGIN;

CREATE TABLE IF NOT EXISTS public.field_charge_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  internal_invoice_id uuid NULL REFERENCES public.internal_invoices(id) ON DELETE SET NULL,

  source_kind text NOT NULL,
  source_pricebook_item_id uuid NULL REFERENCES public.pricebook_items(id) ON DELETE SET NULL,
  source_visit_scope_item_id uuid NULL,

  proposed_name text NOT NULL,
  proposed_description text NULL,
  proposed_item_type text NOT NULL DEFAULT 'service',
  proposed_quantity numeric(12,2) NOT NULL DEFAULT 1.00,
  proposed_unit_price_cents integer NULL,
  proposed_subtotal_cents integer NULL,
  proposed_currency text NOT NULL DEFAULT 'usd',

  status text NOT NULL DEFAULT 'draft',
  proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NULL,
  reviewed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_note text NULL,
  converted_internal_invoice_line_item_id uuid NULL REFERENCES public.internal_invoice_line_items(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_charge_proposals_source_kind_valid_chk
    CHECK (source_kind IN ('pricebook', 'visit_scope', 'manual')),
  CONSTRAINT field_charge_proposals_status_valid_chk
    CHECK (status IN ('draft', 'submitted_for_review', 'approved', 'rejected', 'voided')),
  CONSTRAINT field_charge_proposals_name_not_blank_chk
    CHECK (length(btrim(proposed_name)) > 0),
  CONSTRAINT field_charge_proposals_item_type_valid_chk
    CHECK (proposed_item_type IN ('service', 'material', 'diagnostic', 'adjustment', 'other')),
  CONSTRAINT field_charge_proposals_quantity_positive_chk
    CHECK (proposed_quantity > 0),
  CONSTRAINT field_charge_proposals_unit_price_nonnegative_chk
    CHECK (proposed_unit_price_cents IS NULL OR proposed_unit_price_cents >= 0),
  CONSTRAINT field_charge_proposals_subtotal_nonnegative_chk
    CHECK (proposed_subtotal_cents IS NULL OR proposed_subtotal_cents >= 0),
  CONSTRAINT field_charge_proposals_price_pair_chk
    CHECK (
      (proposed_unit_price_cents IS NULL AND proposed_subtotal_cents IS NULL)
      OR (proposed_unit_price_cents IS NOT NULL AND proposed_subtotal_cents IS NOT NULL)
    ),
  CONSTRAINT field_charge_proposals_currency_valid_chk
    CHECK (proposed_currency = lower(proposed_currency) AND length(proposed_currency) = 3),
  CONSTRAINT field_charge_proposals_pricebook_source_chk
    CHECK (source_kind <> 'pricebook' OR source_pricebook_item_id IS NOT NULL),
  CONSTRAINT field_charge_proposals_visit_scope_source_chk
    CHECK (source_kind <> 'visit_scope' OR source_visit_scope_item_id IS NOT NULL),
  CONSTRAINT field_charge_proposals_manual_source_chk
    CHECK (
      source_kind <> 'manual'
      OR (
        source_pricebook_item_id IS NULL
        AND source_visit_scope_item_id IS NULL
      )
    ),
  CONSTRAINT field_charge_proposals_submitted_state_chk
    CHECK (status <> 'submitted_for_review' OR submitted_at IS NOT NULL),
  CONSTRAINT field_charge_proposals_reviewed_state_chk
    CHECK (
      status NOT IN ('approved', 'rejected')
      OR (
        reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    ),
  CONSTRAINT field_charge_proposals_converted_only_approved_chk
    CHECK (converted_internal_invoice_line_item_id IS NULL OR status = 'approved')
);

CREATE INDEX IF NOT EXISTS field_charge_proposals_owner_job_status_idx
  ON public.field_charge_proposals (account_owner_user_id, job_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS field_charge_proposals_owner_invoice_status_idx
  ON public.field_charge_proposals (account_owner_user_id, internal_invoice_id, status)
  WHERE internal_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_charge_proposals_source_pricebook_idx
  ON public.field_charge_proposals (source_pricebook_item_id)
  WHERE source_pricebook_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_charge_proposals_converted_line_item_idx
  ON public.field_charge_proposals (converted_internal_invoice_line_item_id)
  WHERE converted_internal_invoice_line_item_id IS NOT NULL;

-- Enforce account consistency for optional source/conversion references.
-- Visit Scope item ids are JSON item ids on jobs.visit_scope_items, so they are
-- intentionally stored as provenance without a foreign key.
CREATE OR REPLACE FUNCTION public.assert_field_charge_proposal_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_owner_id uuid;
  v_invoice_owner_id uuid;
  v_invoice_job_id uuid;
  v_pricebook_owner_id uuid;
  v_converted_owner_id uuid;
  v_converted_job_id uuid;
BEGIN
  SELECT job.account_owner_user_id
  INTO v_job_owner_id
  FROM public.jobs job
  WHERE job.id = NEW.job_id;

  IF v_job_owner_id IS NULL THEN
    RAISE EXCEPTION 'field_charge_proposals job not found or missing account owner'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM v_job_owner_id THEN
    RAISE EXCEPTION 'field_charge_proposals account_owner_user_id must match jobs.account_owner_user_id'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.internal_invoice_id IS NOT NULL THEN
    SELECT invoice.account_owner_user_id, invoice.job_id
    INTO v_invoice_owner_id, v_invoice_job_id
    FROM public.internal_invoices invoice
    WHERE invoice.id = NEW.internal_invoice_id;

    IF v_invoice_owner_id IS NULL THEN
      RAISE EXCEPTION 'field_charge_proposals internal invoice not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM v_invoice_owner_id THEN
      RAISE EXCEPTION 'field_charge_proposals internal invoice/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.job_id IS DISTINCT FROM v_invoice_job_id THEN
      RAISE EXCEPTION 'field_charge_proposals internal invoice/job mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.source_pricebook_item_id IS NOT NULL THEN
    SELECT pricebook.account_owner_user_id
    INTO v_pricebook_owner_id
    FROM public.pricebook_items pricebook
    WHERE pricebook.id = NEW.source_pricebook_item_id;

    IF v_pricebook_owner_id IS NULL THEN
      RAISE EXCEPTION 'field_charge_proposals pricebook item not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM v_pricebook_owner_id THEN
      RAISE EXCEPTION 'field_charge_proposals pricebook item/account mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.converted_internal_invoice_line_item_id IS NOT NULL THEN
    SELECT invoice.account_owner_user_id, invoice.job_id
    INTO v_converted_owner_id, v_converted_job_id
    FROM public.internal_invoice_line_items line_item
    JOIN public.internal_invoices invoice
      ON invoice.id = line_item.invoice_id
    WHERE line_item.id = NEW.converted_internal_invoice_line_item_id;

    IF v_converted_owner_id IS NULL THEN
      RAISE EXCEPTION 'field_charge_proposals converted invoice line item not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM v_converted_owner_id THEN
      RAISE EXCEPTION 'field_charge_proposals converted line item/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.job_id IS DISTINCT FROM v_converted_job_id THEN
      RAISE EXCEPTION 'field_charge_proposals converted line item/job mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_charge_proposals_assert_scope
  ON public.field_charge_proposals;

CREATE TRIGGER field_charge_proposals_assert_scope
BEFORE INSERT OR UPDATE ON public.field_charge_proposals
FOR EACH ROW
EXECUTE FUNCTION public.assert_field_charge_proposal_scope();

ALTER TABLE public.field_charge_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_charge_proposals_select_account_scope
  ON public.field_charge_proposals;
DROP POLICY IF EXISTS field_charge_proposals_insert_account_scope
  ON public.field_charge_proposals;
DROP POLICY IF EXISTS field_charge_proposals_update_account_scope
  ON public.field_charge_proposals;
DROP POLICY IF EXISTS field_charge_proposals_delete_account_scope
  ON public.field_charge_proposals;

CREATE POLICY field_charge_proposals_select_account_scope
ON public.field_charge_proposals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = field_charge_proposals.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE application policies in B6-F. Proposal mutations are
-- reserved for later server-side wrapper actions with explicit field billing
-- capability checks.

COMMIT;
