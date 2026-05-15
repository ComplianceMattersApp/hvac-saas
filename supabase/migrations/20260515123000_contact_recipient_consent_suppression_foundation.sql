-- Compliance Matters: SMS Slice B1 consent + suppression foundation
-- Purpose: add account-scoped consent and suppression state tables only.
-- Non-goals: no send logic, no provider webhook integration, no intent/delivery
-- tables, no backfill, no live SMS activation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_recipient_consents (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contact_recipient_id         uuid        NOT NULL REFERENCES public.contact_recipients(id) ON DELETE CASCADE,
  message_class                text        NOT NULL,
  consent_status               text        NOT NULL DEFAULT 'unknown',
  consent_source               text        NULL,
  consent_text_version         text        NULL,
  consent_captured_at          timestamptz NULL,
  consent_captured_by_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at                   timestamptz NULL,
  revoked_source               text        NULL,
  notes                        text        NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT contact_recipient_consents_unique_current
    UNIQUE (account_owner_user_id, contact_recipient_id, message_class),

  CONSTRAINT contact_recipient_consents_message_class_valid_chk
    CHECK (
      message_class IN (
        'scheduling',
        'on_the_way',
        'appointment_reminder',
        'access_coordination',
        'follow_up_no_answer',
        'completion_notice',
        'invoice_ready_notice',
        'marketing_promotional'
      )
    ),

  CONSTRAINT contact_recipient_consents_status_valid_chk
    CHECK (consent_status IN ('unknown', 'opted_in', 'opted_out', 'revoked')),

  CONSTRAINT contact_recipient_consents_revoked_requires_fields_chk
    CHECK (
      consent_status <> 'revoked'
      OR (
        revoked_at IS NOT NULL
        AND length(btrim(coalesce(revoked_source, ''))) > 0
      )
    )
);

CREATE INDEX IF NOT EXISTS contact_recipient_consents_account_recipient_class_idx
  ON public.contact_recipient_consents (account_owner_user_id, contact_recipient_id, message_class);

CREATE INDEX IF NOT EXISTS contact_recipient_consents_account_class_status_idx
  ON public.contact_recipient_consents (account_owner_user_id, message_class, consent_status);

CREATE INDEX IF NOT EXISTS contact_recipient_consents_account_updated_at_desc_idx
  ON public.contact_recipient_consents (account_owner_user_id, updated_at DESC);

DROP TRIGGER IF EXISTS contact_recipient_consents_set_updated_at
  ON public.contact_recipient_consents;

CREATE TRIGGER contact_recipient_consents_set_updated_at
BEFORE UPDATE ON public.contact_recipient_consents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_recipient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_recipient_consents_select_account_scope
  ON public.contact_recipient_consents;
DROP POLICY IF EXISTS contact_recipient_consents_insert_account_scope
  ON public.contact_recipient_consents;
DROP POLICY IF EXISTS contact_recipient_consents_update_account_scope
  ON public.contact_recipient_consents;

CREATE POLICY contact_recipient_consents_select_account_scope
ON public.contact_recipient_consents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
);

CREATE POLICY contact_recipient_consents_insert_account_scope
ON public.contact_recipient_consents
FOR INSERT
TO authenticated
WITH CHECK (
  (consent_captured_by_user_id IS NULL OR consent_captured_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.contact_recipients recipient
    WHERE recipient.id = contact_recipient_consents.contact_recipient_id
      AND recipient.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
);

CREATE POLICY contact_recipient_consents_update_account_scope
ON public.contact_recipient_consents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
)
WITH CHECK (
  (consent_captured_by_user_id IS NULL OR consent_captured_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.contact_recipients recipient
    WHERE recipient.id = contact_recipient_consents.contact_recipient_id
      AND recipient.account_owner_user_id = contact_recipient_consents.account_owner_user_id
  )
);

-- No DELETE policy in V1.

CREATE TABLE IF NOT EXISTS public.contact_recipient_suppressions (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contact_recipient_id   uuid        NULL REFERENCES public.contact_recipients(id) ON DELETE CASCADE,
  phone_e164             text        NULL,
  suppression_type       text        NOT NULL,
  suppression_reason     text        NULL,
  source                 text        NOT NULL,
  is_active              boolean     NOT NULL DEFAULT true,
  suppressed_at          timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  lifted_at              timestamptz NULL,
  lifted_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  lift_reason            text        NULL,
  created_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_name          text        NULL,
  provider_message_id    text        NULL,
  received_keyword       text        NULL,

  CONSTRAINT contact_recipient_suppressions_target_required_chk
    CHECK (contact_recipient_id IS NOT NULL OR phone_e164 IS NOT NULL),

  CONSTRAINT contact_recipient_suppressions_phone_e164_format_chk
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[0-9]{8,15}$'),

  CONSTRAINT contact_recipient_suppressions_type_valid_chk
    CHECK (
      suppression_type IN (
        'do_not_text',
        'stop_keyword',
        'manual_suppression',
        'provider_block',
        'compliance_hold'
      )
    ),

  CONSTRAINT contact_recipient_suppressions_source_valid_chk
    CHECK (
      source IN (
        'manual',
        'inbound_stop',
        'provider_callback',
        'compliance_review',
        'system_future'
      )
    ),

  CONSTRAINT contact_recipient_suppressions_inactive_requires_lifted_at_chk
    CHECK (is_active = true OR lifted_at IS NOT NULL),

  CONSTRAINT contact_recipient_suppressions_lifted_requires_lifted_by_chk
    CHECK (lifted_at IS NULL OR lifted_by_user_id IS NOT NULL),

  CONSTRAINT contact_recipient_suppressions_inbound_stop_requires_keyword_chk
    CHECK (
      source <> 'inbound_stop'
      OR length(btrim(coalesce(received_keyword, ''))) > 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_recipient_suppressions_active_recipient_type_uidx
  ON public.contact_recipient_suppressions (
    account_owner_user_id,
    contact_recipient_id,
    suppression_type
  )
  WHERE is_active = true AND contact_recipient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_recipient_suppressions_active_phone_type_uidx
  ON public.contact_recipient_suppressions (
    account_owner_user_id,
    phone_e164,
    suppression_type
  )
  WHERE is_active = true AND phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_recipient_suppressions_account_active_recipient_idx
  ON public.contact_recipient_suppressions (account_owner_user_id, is_active, contact_recipient_id);

CREATE INDEX IF NOT EXISTS contact_recipient_suppressions_account_active_phone_idx
  ON public.contact_recipient_suppressions (account_owner_user_id, is_active, phone_e164);

CREATE INDEX IF NOT EXISTS contact_recipient_suppressions_account_type_active_idx
  ON public.contact_recipient_suppressions (account_owner_user_id, suppression_type, is_active);

CREATE INDEX IF NOT EXISTS contact_recipient_suppressions_account_suppressed_at_desc_idx
  ON public.contact_recipient_suppressions (account_owner_user_id, suppressed_at DESC);

DROP TRIGGER IF EXISTS contact_recipient_suppressions_set_updated_at
  ON public.contact_recipient_suppressions;

CREATE TRIGGER contact_recipient_suppressions_set_updated_at
BEFORE UPDATE ON public.contact_recipient_suppressions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_recipient_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_recipient_suppressions_select_account_scope
  ON public.contact_recipient_suppressions;
DROP POLICY IF EXISTS contact_recipient_suppressions_insert_account_scope
  ON public.contact_recipient_suppressions;
DROP POLICY IF EXISTS contact_recipient_suppressions_update_account_scope
  ON public.contact_recipient_suppressions;

CREATE POLICY contact_recipient_suppressions_select_account_scope
ON public.contact_recipient_suppressions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
  )
);

CREATE POLICY contact_recipient_suppressions_insert_account_scope
ON public.contact_recipient_suppressions
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND (lifted_by_user_id IS NULL OR lifted_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
  )
  AND (
    contact_recipient_suppressions.contact_recipient_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.contact_recipients recipient
      WHERE recipient.id = contact_recipient_suppressions.contact_recipient_id
        AND recipient.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
    )
  )
);

CREATE POLICY contact_recipient_suppressions_update_account_scope
ON public.contact_recipient_suppressions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
  )
)
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND (lifted_by_user_id IS NULL OR lifted_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
  )
  AND (
    contact_recipient_suppressions.contact_recipient_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.contact_recipients recipient
      WHERE recipient.id = contact_recipient_suppressions.contact_recipient_id
        AND recipient.account_owner_user_id = contact_recipient_suppressions.account_owner_user_id
    )
  )
);

-- No DELETE policy in V1.

COMMIT;
