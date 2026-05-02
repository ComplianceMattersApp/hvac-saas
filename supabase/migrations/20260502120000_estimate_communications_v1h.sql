-- Compliance Matters: Estimates V1H — estimate_communications send-attempt truth
-- Purpose: Record every send attempt for an estimate (internal only, V1H).
-- Non-goals: Customer approval flow, public token, PDF storage, delivery tracking,
--            customer read access, contractor write access.
--
-- attempt_status meanings:
--   blocked   = feature flag ENABLE_ESTIMATE_EMAIL_SEND is off; no email was attempted
--   attempted = email provider call was made (unexpected state; transition resolves to accepted/failed)
--   accepted  = provider accepted the message (NOT the same as delivered or read)
--   failed    = provider returned an error
--
-- Note: sandbox-only until estimates go to production.

BEGIN;

-- ---------------------------------------------------------------------------
-- estimate_communications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_communications (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id              uuid        NOT NULL REFERENCES public.estimates(id) ON DELETE RESTRICT,
  account_owner_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  initiated_by_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Snapshot the recipient address at send time (not linked to a customer record)
  recipient_email_snapshot text        NOT NULL,

  -- Snapshot the subject that was sent
  subject_snapshot         text        NOT NULL,

  -- Key identifying the template / version used to generate the body
  body_template_key        text        NOT NULL,

  -- Provider info (null when blocked; 'resend' when attempted via Resend API)
  provider_name            text        NULL,
  provider_message_id      text        NULL,

  -- Outcome
  attempt_status           text        NOT NULL,
  attempt_error            text        NULL,

  attempted_at             timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT estimate_communications_attempt_status_valid_chk
    CHECK (attempt_status IN ('blocked', 'attempted', 'accepted', 'failed')),

  CONSTRAINT estimate_communications_recipient_not_blank_chk
    CHECK (length(btrim(recipient_email_snapshot)) > 0),

  CONSTRAINT estimate_communications_subject_not_blank_chk
    CHECK (length(btrim(subject_snapshot)) > 0),

  CONSTRAINT estimate_communications_body_template_key_not_blank_chk
    CHECK (length(btrim(body_template_key)) > 0)
);

-- Lookup by estimate (fetch communications for a given estimate detail view)
CREATE INDEX IF NOT EXISTS estimate_communications_estimate_id_idx
  ON public.estimate_communications (estimate_id);

-- Account scope index (supports RLS predicate)
CREATE INDEX IF NOT EXISTS estimate_communications_account_owner_idx
  ON public.estimate_communications (account_owner_user_id);

-- ---------------------------------------------------------------------------
-- RLS: internal users only, account-owner scoped
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimate_communications ENABLE ROW LEVEL SECURITY;

-- Internal users in the same account can read communication records
CREATE POLICY "estimate_communications_select_internal"
  ON public.estimate_communications
  FOR SELECT
  TO authenticated
  USING (
    account_owner_user_id IN (
      SELECT account_owner_user_id
      FROM public.internal_users
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- Internal users in the same account can insert communication records
CREATE POLICY "estimate_communications_insert_internal"
  ON public.estimate_communications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_owner_user_id IN (
      SELECT account_owner_user_id
      FROM public.internal_users
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

COMMIT;
