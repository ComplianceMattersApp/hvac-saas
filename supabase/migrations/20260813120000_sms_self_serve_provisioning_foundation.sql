-- EveryStep FieldWorks: SMS tenant self-serve provisioning foundation (Slice 04)
-- Purpose: give the A2P 10DLC provisioning wizard a durable, resumable home —
-- the registration a tenant is working through, and the subaccount credential
-- needed to validate that subaccount's own webhook signatures. Additive only.
--
-- SECURITY POSTURE — the reason these two tables look different from every
-- other SMS table:
--
--   * sms_provisioning_registrations holds the tenant's EIN and authorized
--     representative's personal contact details. Those are collected once for
--     carrier registration and are never needed by any tenant-facing read, so
--     the table gets NO tenant SELECT policy at all. Every read and write goes
--     through service-role server actions gated on requireInternalRole('admin')
--     plus the self-serve allowlist.
--
--   * sms_provider_subaccount_credentials holds an encrypted Twilio subaccount
--     auth token. The SMS schema's standing rule is "never store credentials"
--     (see the column comments on sms_provider_configurations), and this is a
--     deliberate, documented amendment to it. The rule's intent — no
--     tenant-readable secrets, nothing in plaintext — is preserved: the token
--     is AES-256-GCM encrypted at the app layer under
--     SMS_CREDENTIALS_ENCRYPTION_KEY, and the table has NO tenant policy of any
--     kind. The amendment is unavoidable: Twilio signs status callbacks for a
--     subaccount's messages with THAT subaccount's token, so per-tenant webhook
--     signature validation is impossible without it. Storing it beats the
--     alternative of not validating subaccount webhooks.
--
-- Non-goals: no send-path behavior change, no activation change (provisioning
-- ends at ready_for_activation and never flips activation_status), no toll-free
-- path, no billing.

BEGIN;

-- ---------------------------------------------------------------------------
-- The registration a tenant is working through
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sms_provisioning_registrations (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_environment          text        NOT NULL DEFAULT 'production',
  registration_path             text        NOT NULL,

  -- Business identity, as it must appear to the carriers.
  legal_business_name           text        NULL,
  business_type                 text        NULL,
  ein                           text        NULL,
  business_registration_number  text        NULL,
  business_industry             text        NULL,
  website_url                   text        NULL,
  address_line1                 text        NULL,
  address_line2                 text        NULL,
  city                          text        NULL,
  region                        text        NULL,
  postal_code                   text        NULL,
  iso_country                   text        NOT NULL DEFAULT 'US',

  -- Authorized representative (Twilio requires a contactable human).
  rep_first_name                text        NULL,
  rep_last_name                 text        NULL,
  rep_email                     text        NULL,
  rep_phone                     text        NULL,
  rep_title                     text        NULL,
  rep_business_title            text        NULL,

  -- Twilio references, filled in as each step succeeds. Reference only.
  subaccount_sid                text        NULL,
  customer_profile_sid          text        NULL,
  trust_product_sid             text        NULL,
  address_sid                   text        NULL,
  supporting_document_sid       text        NULL,
  brand_registration_sid        text        NULL,
  messaging_service_sid         text        NULL,
  phone_number_sid              text        NULL,
  phone_e164                    text        NULL,
  campaign_sid                  text        NULL,

  -- Per-step status, mirroring Twilio's own enums so the poller can write
  -- provider truth through without inventing a vocabulary.
  subaccount_status             text        NOT NULL DEFAULT 'not_started',
  number_status                 text        NOT NULL DEFAULT 'not_started',
  messaging_service_status      text        NOT NULL DEFAULT 'not_started',
  customer_profile_status       text        NOT NULL DEFAULT 'not_started',
  trust_product_status          text        NOT NULL DEFAULT 'not_started',
  brand_status                  text        NOT NULL DEFAULT 'not_started',
  brand_identity_status         text        NULL,
  campaign_status               text        NOT NULL DEFAULT 'not_started',

  last_error                    jsonb       NULL,
  last_polled_at                timestamptz NULL,
  submitted_at                  timestamptz NULL,
  completed_at                  timestamptz NULL,

  created_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_provisioning_registrations_provider_environment_valid_chk
    CHECK (provider_environment IN ('sandbox', 'production')),

  -- Low-Volume Standard is the primary path; sole proprietor is the fallback
  -- for a tenant with no EIN. A registered LLC must never take the sole-prop
  -- path — Twilio rejects it with error 30915.
  CONSTRAINT sms_provisioning_registrations_registration_path_valid_chk
    CHECK (registration_path IN ('a2p_lvs', 'a2p_sole_prop')),

  CONSTRAINT sms_provisioning_registrations_sole_prop_has_no_ein_chk
    CHECK (registration_path <> 'a2p_sole_prop' OR ein IS NULL),

  CONSTRAINT sms_provisioning_registrations_step_status_valid_chk
    CHECK (
      subaccount_status IN ('not_started', 'in_progress', 'complete', 'failed')
      AND number_status IN ('not_started', 'in_progress', 'complete', 'failed')
      AND messaging_service_status IN ('not_started', 'in_progress', 'complete', 'failed')
      AND customer_profile_status IN ('not_started', 'in_progress', 'pending_review', 'twilio_approved', 'twilio_rejected', 'complete', 'failed')
      AND trust_product_status IN ('not_started', 'in_progress', 'pending_review', 'twilio_approved', 'twilio_rejected', 'complete', 'failed')
      AND brand_status IN ('not_started', 'in_progress', 'PENDING', 'APPROVED', 'FAILED', 'IN_REVIEW', 'DELETED', 'SUSPENDED', 'failed')
      AND campaign_status IN ('not_started', 'in_progress', 'PENDING', 'VERIFIED', 'FAILED', 'IN_PROGRESS', 'failed')
    )
);

-- One active registration per account. A completed one is kept for history, so
-- the uniqueness only binds the in-flight row.
CREATE UNIQUE INDEX IF NOT EXISTS sms_provisioning_registrations_active_account_uidx
  ON public.sms_provisioning_registrations (account_owner_user_id)
  WHERE completed_at IS NULL;

-- Poller ordering: oldest-polled in-flight rows first.
CREATE INDEX IF NOT EXISTS sms_provisioning_registrations_in_flight_idx
  ON public.sms_provisioning_registrations (last_polled_at NULLS FIRST)
  WHERE completed_at IS NULL AND submitted_at IS NOT NULL;

COMMENT ON TABLE public.sms_provisioning_registrations IS
  'A2P 10DLC self-serve provisioning state per account. Holds EIN and authorized-representative contact details, so it has NO tenant SELECT policy — service-role server actions only.';
COMMENT ON COLUMN public.sms_provisioning_registrations.ein IS
  'Employer Identification Number, carrier registration input. NULL on the sole-proprietor path. Never exposed to a tenant read.';
COMMENT ON COLUMN public.sms_provisioning_registrations.legal_business_name IS
  'Must match the IRS CP 575 / 147c letter exactly — an EIN/name mismatch is the number one Twilio brand rejection (error 30795).';
COMMENT ON COLUMN public.sms_provisioning_registrations.last_error IS
  'Sanitized provider error for the most recent failed step: code, message, and which step failed. Never contains credentials.';

ALTER TABLE public.sms_provisioning_registrations ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies. RLS is enabled with none defined, which denies every
-- authenticated read and write; the service role bypasses RLS and is the only
-- path in. See the security note at the top of this file.

DROP TRIGGER IF EXISTS sms_provisioning_registrations_set_updated_at
  ON public.sms_provisioning_registrations;
CREATE TRIGGER sms_provisioning_registrations_set_updated_at
BEFORE UPDATE ON public.sms_provisioning_registrations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Subaccount credentials (encrypted, service-role only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sms_provider_subaccount_credentials (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id  uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  subaccount_sid         text        NOT NULL,
  auth_token_encrypted   text        NOT NULL,
  created_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_provider_subaccount_credentials_sid_not_blank_chk
    CHECK (length(btrim(subaccount_sid)) > 0),
  CONSTRAINT sms_provider_subaccount_credentials_token_not_blank_chk
    CHECK (length(btrim(auth_token_encrypted)) > 0)
);

COMMENT ON TABLE public.sms_provider_subaccount_credentials IS
  'AES-256-GCM encrypted Twilio subaccount auth tokens. Documented amendment to the SMS "never store credentials" rule: subaccount status callbacks are signed with the subaccount token, so per-tenant webhook validation requires it. NO tenant policy of any kind — service-role only.';
COMMENT ON COLUMN public.sms_provider_subaccount_credentials.auth_token_encrypted IS
  'Format iv:tag:ciphertext (hex), encrypted under SMS_CREDENTIALS_ENCRYPTION_KEY. Never store plaintext.';

ALTER TABLE public.sms_provider_subaccount_credentials ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies — see above.

DROP TRIGGER IF EXISTS sms_provider_subaccount_credentials_set_updated_at
  ON public.sms_provider_subaccount_credentials;
CREATE TRIGGER sms_provider_subaccount_credentials_set_updated_at
BEFORE UPDATE ON public.sms_provider_subaccount_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Persist the live-activation attestations
-- ---------------------------------------------------------------------------
-- These three are already checked in the activation form and then thrown away.
-- Live SMS is the one action in this app with real-world legal exposure, so the
-- record that a human attested to each precondition has to survive the request.

ALTER TABLE public.sms_provider_configurations
  ADD COLUMN IF NOT EXISTS activation_attested_campaign_approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activation_attested_wording_reviewed_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activation_attested_stop_tested_at       timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activation_attested_by_user_id           uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sms_provider_configurations.activation_attested_campaign_approved_at IS
  'When an admin attested the A2P campaign was approved. Recorded at live activation.';
COMMENT ON COLUMN public.sms_provider_configurations.activation_attested_wording_reviewed_at IS
  'When an admin attested the message wording was reviewed for compliance.';
COMMENT ON COLUMN public.sms_provider_configurations.activation_attested_stop_tested_at IS
  'When an admin attested STOP handling was tested end to end.';

COMMIT;
