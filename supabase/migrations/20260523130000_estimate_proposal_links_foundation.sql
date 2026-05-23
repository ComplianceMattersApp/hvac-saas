-- Compliance Matters: Estimate Proposal Links Foundation (2J-A)
-- Purpose: Add secure internal-issued proposal links for future customer-facing
-- estimate access.
-- Scope: schema + RLS only. No public route, customer approval, email send,
-- SMS, portal, payment, or QBO behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.estimate_proposal_links (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id             uuid        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  account_owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash              text        NOT NULL,
  recipient_email_snapshot text       NULL,
  status                  text        NOT NULL DEFAULT 'active',
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at              timestamptz NOT NULL,
  revoked_at              timestamptz NULL,
  revoked_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_viewed_at          timestamptz NULL,
  last_viewed_ip_hash     text        NULL,
  last_user_agent_hash    text        NULL,
  sent_at                 timestamptz NULL,
  last_sent_at            timestamptz NULL,

  CONSTRAINT estimate_proposal_links_status_valid_chk
    CHECK (status IN ('active', 'revoked', 'expired')),

  CONSTRAINT estimate_proposal_links_token_hash_not_blank_chk
    CHECK (length(btrim(token_hash)) > 0),

  CONSTRAINT estimate_proposal_links_expiry_window_valid_chk
    CHECK (expires_at > created_at),

  CONSTRAINT estimate_proposal_links_revoked_status_requires_timestamp_chk
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),

  CONSTRAINT estimate_proposal_links_revoked_by_requires_timestamp_chk
    CHECK (revoked_by_user_id IS NULL OR revoked_at IS NOT NULL),

  CONSTRAINT estimate_proposal_links_recipient_email_snapshot_valid_chk
    CHECK (
      recipient_email_snapshot IS NULL
      OR (
        length(btrim(recipient_email_snapshot)) > 0
        AND recipient_email_snapshot = lower(btrim(recipient_email_snapshot))
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS estimate_proposal_links_token_hash_unique
  ON public.estimate_proposal_links (token_hash);

CREATE INDEX IF NOT EXISTS estimate_proposal_links_estimate_created_idx
  ON public.estimate_proposal_links (estimate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS estimate_proposal_links_account_owner_created_idx
  ON public.estimate_proposal_links (account_owner_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS estimate_proposal_links_one_active_per_estimate_idx
  ON public.estimate_proposal_links (estimate_id)
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS estimate_proposal_links_active_expiry_idx
  ON public.estimate_proposal_links (expires_at)
  WHERE status = 'active';

ALTER TABLE public.estimate_proposal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_proposal_links_select_account_scope ON public.estimate_proposal_links;
DROP POLICY IF EXISTS estimate_proposal_links_insert_account_scope ON public.estimate_proposal_links;
DROP POLICY IF EXISTS estimate_proposal_links_update_account_scope ON public.estimate_proposal_links;

CREATE POLICY estimate_proposal_links_select_account_scope
ON public.estimate_proposal_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.account_owner_user_id = estimate_proposal_links.account_owner_user_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_proposal_links_insert_account_scope
ON public.estimate_proposal_links
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.account_owner_user_id = estimate_proposal_links.account_owner_user_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_proposal_links_update_account_scope
ON public.estimate_proposal_links
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.account_owner_user_id = estimate_proposal_links.account_owner_user_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
)
WITH CHECK (
  (revoked_by_user_id IS NULL OR revoked_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.account_owner_user_id = estimate_proposal_links.account_owner_user_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

COMMIT;