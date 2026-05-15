-- Compliance Matters: SMS Slice F2B provider configuration + sender identity foundation
-- Purpose: add account-scoped provider configuration and sender identity metadata tables.
-- Non-goals: no provider setup, no webhook/send behavior, no live SMS activation,
-- no secrets in DB, no backfill, no E2 table alteration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sms_provider_configurations (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_name                text        NOT NULL,
  provider_environment         text        NOT NULL,
  provider_account_ref         text        NULL,
  default_messaging_service_ref text       NULL,
  readiness_status             text        NOT NULL DEFAULT 'draft',
  activation_status            text        NOT NULL DEFAULT 'disabled',
  callback_status_readiness    text        NOT NULL DEFAULT 'not_configured',
  inbound_webhook_readiness    text        NOT NULL DEFAULT 'not_configured',
  status_callback_readiness    text        NOT NULL DEFAULT 'not_configured',
  advanced_opt_out_readiness   text        NOT NULL DEFAULT 'not_configured',
  created_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_provider_configurations_id_account_owner_unique
    UNIQUE (id, account_owner_user_id),

  CONSTRAINT sms_provider_configurations_provider_name_valid_chk
    CHECK (provider_name IN ('twilio', 'provider_other')),

  CONSTRAINT sms_provider_configurations_provider_environment_valid_chk
    CHECK (provider_environment IN ('sandbox', 'production')),

  CONSTRAINT sms_provider_configurations_readiness_status_valid_chk
    CHECK (
      readiness_status IN (
        'draft',
        'sandbox_only',
        'registration_required',
        'registration_pending',
        'provider_review_required',
        'ready_for_sandbox',
        'ready_for_activation',
        'active',
        'paused',
        'rejected'
      )
    ),

  CONSTRAINT sms_provider_configurations_activation_status_valid_chk
    CHECK (activation_status IN ('disabled', 'pending_activation', 'active', 'paused')),

  CONSTRAINT sms_provider_configurations_callback_status_readiness_valid_chk
    CHECK (
      callback_status_readiness IN ('not_configured', 'pending', 'ready', 'failed', 'not_applicable')
    ),

  CONSTRAINT sms_provider_configurations_inbound_webhook_readiness_valid_chk
    CHECK (
      inbound_webhook_readiness IN ('not_configured', 'pending', 'ready', 'failed', 'not_applicable')
    ),

  CONSTRAINT sms_provider_configurations_status_callback_readiness_valid_chk
    CHECK (
      status_callback_readiness IN ('not_configured', 'pending', 'ready', 'failed', 'not_applicable')
    ),

  CONSTRAINT sms_provider_configurations_advanced_opt_out_readiness_valid_chk
    CHECK (
      advanced_opt_out_readiness IN ('not_configured', 'pending', 'ready', 'failed', 'not_applicable')
    ),

  CONSTRAINT sms_provider_configurations_active_requires_ready_chk
    CHECK (
      activation_status <> 'active'
      OR readiness_status IN ('active', 'ready_for_activation')
    )
);

COMMENT ON COLUMN public.sms_provider_configurations.provider_account_ref
  IS 'External provider account/subaccount reference only. Never store credentials.';

COMMENT ON COLUMN public.sms_provider_configurations.default_messaging_service_ref
  IS 'External provider messaging service reference only. Never store credentials.';

CREATE UNIQUE INDEX IF NOT EXISTS sms_provider_configurations_account_provider_env_uidx
  ON public.sms_provider_configurations (account_owner_user_id, provider_name, provider_environment);

CREATE INDEX IF NOT EXISTS sms_provider_configurations_account_readiness_idx
  ON public.sms_provider_configurations (account_owner_user_id, readiness_status);

CREATE INDEX IF NOT EXISTS sms_provider_configurations_account_activation_idx
  ON public.sms_provider_configurations (account_owner_user_id, activation_status);

DROP TRIGGER IF EXISTS sms_provider_configurations_set_updated_at
  ON public.sms_provider_configurations;

CREATE TRIGGER sms_provider_configurations_set_updated_at
BEFORE UPDATE ON public.sms_provider_configurations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_provider_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_provider_configurations_select_account_scope
  ON public.sms_provider_configurations;
DROP POLICY IF EXISTS sms_provider_configurations_insert_account_scope
  ON public.sms_provider_configurations;
DROP POLICY IF EXISTS sms_provider_configurations_update_account_scope
  ON public.sms_provider_configurations;
DROP POLICY IF EXISTS sms_provider_configurations_delete_account_scope
  ON public.sms_provider_configurations;

CREATE POLICY sms_provider_configurations_select_account_scope
ON public.sms_provider_configurations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_provider_configurations.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Writes are intentionally deferred until
-- explicit admin/owner mutation contract is implemented.

CREATE TABLE IF NOT EXISTS public.sms_sender_identities (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_configuration_id    uuid        NOT NULL,
  sender_type                  text        NOT NULL,
  sender_display_label         text        NOT NULL,
  phone_e164                   text        NULL,
  phone_last4                  text        NULL,
  provider_sender_ref          text        NULL,
  messaging_service_ref        text        NULL,
  registration_type            text        NOT NULL DEFAULT 'none',
  provider_brand_ref           text        NULL,
  provider_campaign_ref        text        NULL,
  provider_registration_ref    text        NULL,
  verification_status          text        NOT NULL DEFAULT 'draft',
  activation_status            text        NOT NULL DEFAULT 'disabled',
  created_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_sender_identities_provider_configuration_account_fk
    FOREIGN KEY (provider_configuration_id, account_owner_user_id)
    REFERENCES public.sms_provider_configurations (id, account_owner_user_id)
    ON DELETE RESTRICT,

  CONSTRAINT sms_sender_identities_sender_type_valid_chk
    CHECK (
      sender_type IN (
        'messaging_service',
        'long_code',
        'toll_free',
        'short_code',
        'alphanumeric',
        'sandbox'
      )
    ),

  CONSTRAINT sms_sender_identities_registration_type_valid_chk
    CHECK (
      registration_type IN (
        'a2p_10dlc',
        'toll_free_verification',
        'short_code',
        'none',
        'provider_other'
      )
    ),

  CONSTRAINT sms_sender_identities_verification_status_valid_chk
    CHECK (
      verification_status IN (
        'draft',
        'pending_verification',
        'verified',
        'rejected',
        'active',
        'paused'
      )
    ),

  CONSTRAINT sms_sender_identities_activation_status_valid_chk
    CHECK (activation_status IN ('disabled', 'pending_activation', 'active', 'paused')),

  CONSTRAINT sms_sender_identities_sender_display_label_not_blank_chk
    CHECK (length(btrim(sender_display_label)) > 0),

  CONSTRAINT sms_sender_identities_phone_e164_format_chk
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[0-9]{8,15}$'),

  CONSTRAINT sms_sender_identities_phone_last4_format_chk
    CHECK (phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$'),

  CONSTRAINT sms_sender_identities_phone_requires_last4_chk
    CHECK (phone_e164 IS NULL OR phone_last4 IS NOT NULL),

  CONSTRAINT sms_sender_identities_last4_requires_phone_chk
    CHECK (phone_last4 IS NULL OR phone_e164 IS NOT NULL),

  CONSTRAINT sms_sender_identities_active_requires_verified_chk
    CHECK (
      activation_status <> 'active'
      OR verification_status IN ('verified', 'active')
    )
);

COMMENT ON COLUMN public.sms_sender_identities.provider_sender_ref
  IS 'External provider sender reference only (for example provider phone SID). Never store credentials.';

COMMENT ON COLUMN public.sms_sender_identities.messaging_service_ref
  IS 'External provider messaging service reference only. Never store credentials.';

COMMENT ON COLUMN public.sms_sender_identities.provider_campaign_ref
  IS 'Provider/A2P campaign reference only; not product campaign semantics.';

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_provider_config_idx
  ON public.sms_sender_identities (account_owner_user_id, provider_configuration_id);

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_sender_type_activation_idx
  ON public.sms_sender_identities (account_owner_user_id, sender_type, activation_status);

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_verification_idx
  ON public.sms_sender_identities (account_owner_user_id, verification_status);

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_phone_e164_idx
  ON public.sms_sender_identities (account_owner_user_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_provider_sender_ref_idx
  ON public.sms_sender_identities (account_owner_user_id, provider_sender_ref)
  WHERE provider_sender_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_sender_identities_account_messaging_service_ref_idx
  ON public.sms_sender_identities (account_owner_user_id, messaging_service_ref)
  WHERE messaging_service_ref IS NOT NULL;

-- One-active-production-sender constraint is intentionally parked in F2B because
-- enforcing across parent provider_environment would require denormalization or
-- trigger logic not approved in this slice.

DROP TRIGGER IF EXISTS sms_sender_identities_set_updated_at
  ON public.sms_sender_identities;

CREATE TRIGGER sms_sender_identities_set_updated_at
BEFORE UPDATE ON public.sms_sender_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_sender_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_sender_identities_select_account_scope
  ON public.sms_sender_identities;
DROP POLICY IF EXISTS sms_sender_identities_insert_account_scope
  ON public.sms_sender_identities;
DROP POLICY IF EXISTS sms_sender_identities_update_account_scope
  ON public.sms_sender_identities;
DROP POLICY IF EXISTS sms_sender_identities_delete_account_scope
  ON public.sms_sender_identities;

CREATE POLICY sms_sender_identities_select_account_scope
ON public.sms_sender_identities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_sender_identities.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Writes are intentionally deferred until
-- explicit admin/owner mutation contract is implemented.

COMMIT;
