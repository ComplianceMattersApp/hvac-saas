-- Compliance Matters: SMS Slice E2 message intent + provider delivery foundation
-- Purpose: add future SMS send-request audit and provider delivery truth tables only.
-- Non-goals: no send logic, no provider behavior, no webhook integration,
-- no live SMS activation, no backfill, no job timeline/provider summary behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sms_message_intents (
  id                         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id                     uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  service_case_id            uuid        NULL REFERENCES public.service_cases(id) ON DELETE SET NULL,
  job_event_id               uuid        NULL REFERENCES public.job_events(id) ON DELETE SET NULL,
  contact_recipient_id       uuid        NOT NULL REFERENCES public.contact_recipients(id) ON DELETE RESTRICT,
  message_class              text        NOT NULL,
  template_key               text        NOT NULL,
  template_version           text        NOT NULL,
  message_body_snapshot      text        NOT NULL,
  send_requested_by_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  send_requested_at          timestamptz NOT NULL DEFAULT now(),
  recipient_phone_snapshot   text        NOT NULL,
  recipient_role_snapshot    text        NOT NULL,
  consent_decision           text        NOT NULL,
  suppression_decision       text        NOT NULL,
  quiet_hours_decision       text        NOT NULL,
  decision_outcome           text        NOT NULL,
  blocked_reason_codes       text[]      NOT NULL DEFAULT '{}'::text[],
  decision_policy_version    text        NOT NULL,
  sender_identity_ref        text        NULL,
  idempotency_key            text        NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_message_intents_id_account_owner_unique
    UNIQUE (id, account_owner_user_id),

  CONSTRAINT sms_message_intents_message_class_valid_chk
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

  CONSTRAINT sms_message_intents_decision_outcome_valid_chk
    CHECK (
      decision_outcome IN (
        'blocked',
        'ready_for_provider',
        'submitted',
        'cancelled',
        'failed_before_submit'
      )
    ),

  CONSTRAINT sms_message_intents_consent_decision_valid_chk
    CHECK (consent_decision IN ('missing', 'unknown', 'opted_in', 'opted_out', 'revoked')),

  CONSTRAINT sms_message_intents_suppression_decision_valid_chk
    CHECK (
      suppression_decision IN (
        'not_checked',
        'none_active',
        'active_recipient',
        'active_phone',
        'active_both',
        'check_failed'
      )
    ),

  CONSTRAINT sms_message_intents_quiet_hours_decision_valid_chk
    CHECK (
      quiet_hours_decision IN (
        'not_checked',
        'allowed',
        'blocked_quiet_hours',
        'blocked_timezone_unknown',
        'check_failed'
      )
    ),

  CONSTRAINT sms_message_intents_on_the_way_requires_job_event_chk
    CHECK (message_class <> 'on_the_way' OR job_event_id IS NOT NULL),

  CONSTRAINT sms_message_intents_blocked_requires_reasons_chk
    CHECK (decision_outcome <> 'blocked' OR coalesce(array_length(blocked_reason_codes, 1), 0) > 0),

  CONSTRAINT sms_message_intents_message_body_not_blank_chk
    CHECK (length(btrim(message_body_snapshot)) > 0),

  CONSTRAINT sms_message_intents_recipient_phone_not_blank_chk
    CHECK (length(btrim(recipient_phone_snapshot)) > 0),

  CONSTRAINT sms_message_intents_template_key_not_blank_chk
    CHECK (length(btrim(template_key)) > 0),

  CONSTRAINT sms_message_intents_template_version_not_blank_chk
    CHECK (length(btrim(template_version)) > 0),

  CONSTRAINT sms_message_intents_recipient_role_not_blank_chk
    CHECK (length(btrim(recipient_role_snapshot)) > 0),

  CONSTRAINT sms_message_intents_decision_policy_version_not_blank_chk
    CHECK (length(btrim(decision_policy_version)) > 0),

  CONSTRAINT sms_message_intents_idempotency_key_not_blank_chk
    CHECK (length(btrim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_message_intents_account_idempotency_uidx
  ON public.sms_message_intents (account_owner_user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS sms_message_intents_account_recipient_created_desc_idx
  ON public.sms_message_intents (account_owner_user_id, contact_recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_message_intents_account_job_created_desc_idx
  ON public.sms_message_intents (account_owner_user_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_message_intents_account_job_event_idx
  ON public.sms_message_intents (account_owner_user_id, job_event_id);

CREATE INDEX IF NOT EXISTS sms_message_intents_account_class_outcome_idx
  ON public.sms_message_intents (account_owner_user_id, message_class, decision_outcome);

CREATE INDEX IF NOT EXISTS sms_message_intents_account_created_desc_idx
  ON public.sms_message_intents (account_owner_user_id, created_at DESC);

DROP TRIGGER IF EXISTS sms_message_intents_set_updated_at
  ON public.sms_message_intents;

CREATE TRIGGER sms_message_intents_set_updated_at
BEFORE UPDATE ON public.sms_message_intents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_message_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_message_intents_select_account_scope
  ON public.sms_message_intents;
DROP POLICY IF EXISTS sms_message_intents_insert_account_scope
  ON public.sms_message_intents;

CREATE POLICY sms_message_intents_select_account_scope
ON public.sms_message_intents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_message_intents.account_owner_user_id
  )
);

CREATE POLICY sms_message_intents_insert_account_scope
ON public.sms_message_intents
FOR INSERT
TO authenticated
WITH CHECK (
  (send_requested_by_user_id IS NULL OR send_requested_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_message_intents.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.contact_recipients recipient
    WHERE recipient.id = sms_message_intents.contact_recipient_id
      AND recipient.account_owner_user_id = sms_message_intents.account_owner_user_id
  )
  AND (
    sms_message_intents.job_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = sms_message_intents.job_id
        AND j.deleted_at IS NULL
        AND public.job_matches_account_owner(
          j.contractor_id,
          j.customer_id,
          j.location_id,
          j.service_case_id,
          sms_message_intents.account_owner_user_id
        )
    )
  )
  AND (
    sms_message_intents.service_case_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.service_cases sc
      WHERE sc.id = sms_message_intents.service_case_id
        AND public.service_case_matches_account_owner(
          sc.id,
          sc.customer_id,
          sc.location_id,
          sms_message_intents.account_owner_user_id
        )
    )
  )
  AND (
    sms_message_intents.job_event_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.job_events je
      JOIN public.jobs j ON j.id = je.job_id
      WHERE je.id = sms_message_intents.job_event_id
        AND j.deleted_at IS NULL
        AND public.job_matches_account_owner(
          j.contractor_id,
          j.customer_id,
          j.location_id,
          j.service_case_id,
          sms_message_intents.account_owner_user_id
        )
    )
  )
);

-- No DELETE or UPDATE policy in V1. Intent rows are audit-first and future writes
-- can use trusted server-side paths if they need to mutate state later.

CREATE TABLE IF NOT EXISTS public.sms_provider_deliveries (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sms_message_intent_id         uuid        NOT NULL REFERENCES public.sms_message_intents(id) ON DELETE CASCADE,
  provider_name                 text        NOT NULL,
  provider_message_id           text        NULL,
  provider_status               text        NOT NULL DEFAULT 'not_submitted',
  provider_raw_status           text        NULL,
  provider_error_code           text        NULL,
  provider_error_message        text        NULL,
  provider_callback_payload_snapshot jsonb  NULL,
  provider_last_event_at        timestamptz NULL,
  submitted_at                  timestamptz NULL,
  sent_at                       timestamptz NULL,
  delivered_at                  timestamptz NULL,
  failed_at                     timestamptz NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_provider_deliveries_intent_account_owner_unique
    UNIQUE (sms_message_intent_id, account_owner_user_id),

  CONSTRAINT sms_provider_deliveries_provider_status_valid_chk
    CHECK (
      provider_status IN (
        'not_submitted',
        'queued',
        'submitted',
        'sent',
        'delivered',
        'failed',
        'undelivered',
        'blocked',
        'unknown'
      )
    ),

  CONSTRAINT sms_provider_deliveries_delivered_requires_delivered_at_chk
    CHECK (provider_status <> 'delivered' OR delivered_at IS NOT NULL),

  CONSTRAINT sms_provider_deliveries_terminal_states_require_details_chk
    CHECK (
      provider_status NOT IN ('failed', 'undelivered', 'blocked')
      OR failed_at IS NOT NULL
      OR provider_error_code IS NOT NULL
      OR provider_raw_status IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS sms_provider_deliveries_account_intent_idx
  ON public.sms_provider_deliveries (account_owner_user_id, sms_message_intent_id);

CREATE UNIQUE INDEX IF NOT EXISTS sms_provider_deliveries_account_provider_message_uidx
  ON public.sms_provider_deliveries (account_owner_user_id, provider_name, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_provider_deliveries_account_status_updated_desc_idx
  ON public.sms_provider_deliveries (account_owner_user_id, provider_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sms_provider_deliveries_account_provider_message_idx
  ON public.sms_provider_deliveries (account_owner_user_id, provider_name, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_provider_deliveries_account_last_event_desc_idx
  ON public.sms_provider_deliveries (account_owner_user_id, provider_last_event_at DESC);

DROP TRIGGER IF EXISTS sms_provider_deliveries_set_updated_at
  ON public.sms_provider_deliveries;

CREATE TRIGGER sms_provider_deliveries_set_updated_at
BEFORE UPDATE ON public.sms_provider_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_provider_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_provider_deliveries_select_account_scope
  ON public.sms_provider_deliveries;

CREATE POLICY sms_provider_deliveries_select_account_scope
ON public.sms_provider_deliveries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_provider_deliveries.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Provider delivery writes are reserved
-- for future trusted server-side/service-role paths.

COMMIT;