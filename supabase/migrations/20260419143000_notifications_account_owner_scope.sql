-- Compliance Matters: notifications account-owner scope hardening
-- Purpose: replace broad internal notifications access with positive
-- account-owner-scoped access while preserving current notification behavior.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS account_owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS notifications_account_owner_created_at_idx
  ON public.notifications (account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_internal_account_owner_unread_idx
  ON public.notifications (account_owner_user_id, created_at DESC)
  WHERE recipient_type = 'internal' AND read_at IS NULL;

UPDATE public.notifications
SET account_owner_user_id = (payload ->> 'account_owner_user_id')::uuid
WHERE account_owner_user_id IS NULL
  AND jsonb_typeof(payload) = 'object'
  AND payload ? 'account_owner_user_id'
  AND COALESCE(payload ->> 'account_owner_user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.notifications n
SET account_owner_user_id = cis.account_owner_user_id
FROM public.contractor_intake_submissions cis
WHERE n.account_owner_user_id IS NULL
  AND jsonb_typeof(n.payload) = 'object'
  AND n.payload ? 'contractor_intake_submission_id'
  AND COALESCE(n.payload ->> 'contractor_intake_submission_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND cis.id = (n.payload ->> 'contractor_intake_submission_id')::uuid;

UPDATE public.notifications n
SET account_owner_user_id = owner_map.account_owner_user_id
FROM (
  SELECT
    j.id AS job_id,
    COALESCE(ctr.owner_user_id, cust.owner_user_id, loc.owner_user_id) AS account_owner_user_id
  FROM public.jobs j
  LEFT JOIN public.contractors ctr
    ON ctr.id = j.contractor_id
  LEFT JOIN public.customers cust
    ON cust.id = j.customer_id
  LEFT JOIN public.locations loc
    ON loc.id = j.location_id
) AS owner_map
WHERE n.account_owner_user_id IS NULL
  AND n.job_id = owner_map.job_id
  AND owner_map.account_owner_user_id IS NOT NULL;

DROP POLICY IF EXISTS notifications_internal_full_access ON public.notifications;

CREATE POLICY notifications_internal_account_scope
ON public.notifications
FOR ALL
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;