-- Compliance Matters: provisional intake contact candidate foundation (Step 3D-G)
-- Purpose: store intake/review role-contact candidates before any durable promotion.
-- Non-goals: no contact_recipients writes, no contractor/portal direct table access,
-- no messaging/provider/payment behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contractor_intake_contact_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_intake_submission_id uuid NOT NULL REFERENCES public.contractor_intake_submissions(id) ON DELETE CASCADE,

  proposed_role text NOT NULL,
  display_name text NOT NULL,
  phone text NULL,
  email text NULL,
  preferred_contact_method text NOT NULL DEFAULT 'none',

  proposed_link_target text NOT NULL DEFAULT 'undecided',
  source_role text NOT NULL,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  notes text NULL,

  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contractor_intake_contact_candidates_display_name_nonempty
    CHECK (length(btrim(display_name)) > 0),

  CONSTRAINT contractor_intake_contact_candidates_role_valid
    CHECK (
      proposed_role IN (
        'homeowner',
        'tenant_or_occupant',
        'responsible_party',
        'billing_contact',
        'third_party_oversight',
        'site_access_contact'
      )
    ),

  CONSTRAINT contractor_intake_contact_candidates_source_role_valid
    CHECK (source_role IN ('contractor', 'internal')),

  CONSTRAINT contractor_intake_contact_candidates_source_type_valid
    CHECK (source_type IN ('intake_submission', 'internal_review')),

  CONSTRAINT contractor_intake_contact_candidates_status_valid
    CHECK (status IN ('proposed', 'approved_for_promotion', 'skipped')),

  CONSTRAINT contractor_intake_contact_candidates_preferred_contact_method_valid
    CHECK (preferred_contact_method IN ('sms', 'phone', 'email', 'none')),

  CONSTRAINT contractor_intake_contact_candidates_link_target_valid
    CHECK (proposed_link_target IN ('customer', 'job', 'undecided')),

  CONSTRAINT contractor_intake_contact_candidates_link_target_role_alignment
    CHECK (
      (
        proposed_role IN (
          'homeowner',
          'tenant_or_occupant',
          'responsible_party',
          'billing_contact',
          'third_party_oversight'
        )
        AND proposed_link_target IN ('customer', 'undecided')
      )
      OR (
        proposed_role = 'site_access_contact'
        AND proposed_link_target IN ('job', 'undecided')
      )
    ),

  CONSTRAINT contractor_intake_contact_candidates_contact_method_requirements
    CHECK (
      (preferred_contact_method <> 'sms' AND preferred_contact_method <> 'phone')
      OR phone IS NOT NULL
    ),

  CONSTRAINT contractor_intake_contact_candidates_email_required_when_preferred
    CHECK (preferred_contact_method <> 'email' OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS contractor_intake_contact_candidates_owner_submission_idx
  ON public.contractor_intake_contact_candidates (account_owner_user_id, contractor_intake_submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contractor_intake_contact_candidates_owner_status_idx
  ON public.contractor_intake_contact_candidates (account_owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS contractor_intake_contact_candidates_owner_role_idx
  ON public.contractor_intake_contact_candidates (account_owner_user_id, proposed_role, created_at DESC);

DROP TRIGGER IF EXISTS contractor_intake_contact_candidates_set_updated_at
ON public.contractor_intake_contact_candidates;

CREATE TRIGGER contractor_intake_contact_candidates_set_updated_at
BEFORE UPDATE ON public.contractor_intake_contact_candidates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contractor_intake_contact_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_intake_contact_candidates_select_account_scope
ON public.contractor_intake_contact_candidates;
DROP POLICY IF EXISTS contractor_intake_contact_candidates_insert_account_scope
ON public.contractor_intake_contact_candidates;
DROP POLICY IF EXISTS contractor_intake_contact_candidates_update_account_scope
ON public.contractor_intake_contact_candidates;

-- Step 3D-G posture: internal-only table access.
CREATE POLICY contractor_intake_contact_candidates_select_account_scope
ON public.contractor_intake_contact_candidates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contractor_intake_contact_candidates.account_owner_user_id
  )
);

CREATE POLICY contractor_intake_contact_candidates_insert_account_scope
ON public.contractor_intake_contact_candidates
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contractor_intake_contact_candidates.account_owner_user_id
  )
);

CREATE POLICY contractor_intake_contact_candidates_update_account_scope
ON public.contractor_intake_contact_candidates
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contractor_intake_contact_candidates.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contractor_intake_contact_candidates.account_owner_user_id
  )
);

-- No DELETE policy by design; status updates preferred over hard delete.

COMMIT;
