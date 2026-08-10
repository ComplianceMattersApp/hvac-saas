-- EveryStep FieldWorks: three-way reconciliation findings (EveryStep / QBO / Stripe)
--
-- Purpose: a place for an INDEPENDENT observer to record disagreements between
-- EveryStep and the systems it pushes to. Every existing control is driven by
-- EveryStep's own state, so none of them can see a QBO invoice edited by hand or
-- a Stripe charge this app never learned about. This table holds what a periodic
-- comparison finds.
--
-- Report-only by design. Nothing here mutates money; rows are evidence for a
-- human, and the reconciler never writes to invoices or payments.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reconciliation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL,

  -- What disagrees. Stable slug so a repeat run updates rather than duplicates.
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'critical'
    CHECK (severity IN ('critical', 'warning')),

  -- What it is about. subject_id is an EveryStep id where one exists; for money
  -- that only the external system knows about it is null and external_id carries
  -- the Stripe/QBO identifier.
  subject_kind text NOT NULL CHECK (subject_kind IN ('invoice', 'payment')),
  subject_id uuid NULL,
  external_system text NOT NULL CHECK (external_system IN ('quickbooks', 'stripe')),
  external_id text NULL,

  -- Operator-facing copy, written by the reconciler so the attention center does
  -- not have to re-derive meaning from codes.
  title text NOT NULL,
  detail text NOT NULL,
  truth text NOT NULL,

  -- The two sides, for evidence. Free-form so each finding type can say what fits.
  everystep_value text NULL,
  external_value text NULL,

  amount_cents integer NULL,
  job_id uuid NULL,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Set when a later run no longer observes the disagreement. Findings resolve
  -- themselves; nobody has to remember to clear them.
  resolved_at timestamptz NULL,
  resolved_reason text NULL
);

-- One live finding per (account, type, subject). A repeat run touches
-- last_seen_at instead of stacking duplicates every night.
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_findings_unique_open_idx
  ON public.reconciliation_findings (
    account_owner_user_id,
    finding_type,
    COALESCE(subject_id::text, ''),
    COALESCE(external_id, '')
  )
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS reconciliation_findings_open_by_account_idx
  ON public.reconciliation_findings (account_owner_user_id, last_seen_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.reconciliation_findings ENABLE ROW LEVEL SECURITY;

-- Read-only to the account's internal users, using the same helper as
-- qbo_connections. No insert/update/delete policy on purpose: findings are
-- written only by the scheduled reconciler through the service role, so there is
-- no authenticated path that can forge or silence one.
DROP POLICY IF EXISTS reconciliation_findings_select_own ON public.reconciliation_findings;
CREATE POLICY reconciliation_findings_select_own
  ON public.reconciliation_findings
  FOR SELECT
  TO authenticated
  USING (
    public.current_internal_account_owner_id() IS NOT NULL
    AND account_owner_user_id = public.current_internal_account_owner_id()
  );

COMMENT ON TABLE public.reconciliation_findings IS
  'Disagreements found by the three-way reconciler (EveryStep vs QuickBooks vs Stripe). Report-only evidence for a human; the reconciler never corrects money.';

COMMIT;
