-- Compliance Matters: SMS Slice F6C-C3B sandbox send gate + test-recipient schema foundation
-- Purpose: add account-scoped server-only sandbox send gate metadata and
-- account-scoped sandbox test-recipient verification records.
-- Non-goals: no send behavior, no provider/Twilio calls, no webhook/send endpoint,
-- no live SMS activation, no UI wiring, no backfill.

BEGIN;

-- ---------------------------------------------------------------------------
-- Sandbox send gate fields on provider configuration (server-only control)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sms_provider_configurations
  ADD COLUMN IF NOT EXISTS sandbox_send_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_send_enabled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sandbox_send_enabled_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sandbox_send_disabled_reason text NULL;

COMMENT ON COLUMN public.sms_provider_configurations.sandbox_send_enabled
  IS 'Server-only/manual-sandbox gate. Controls sandbox test submission eligibility and must not imply live SMS enablement.';

COMMENT ON COLUMN public.sms_provider_configurations.sandbox_send_enabled_at
  IS 'Timestamp when sandbox send gate was enabled by an authorized internal actor.';

COMMENT ON COLUMN public.sms_provider_configurations.sandbox_send_enabled_by_user_id
  IS 'Internal actor who enabled sandbox send gate. Optional audit field.';

COMMENT ON COLUMN public.sms_provider_configurations.sandbox_send_disabled_reason
  IS 'Optional admin/server-only reason captured when sandbox send gate is disabled.';

-- ---------------------------------------------------------------------------
-- Account-scoped verified sandbox/test-recipient registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sms_sandbox_test_recipients (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  phone_e164             text        NOT NULL,
  phone_label            text        NULL,
  is_active              boolean     NOT NULL DEFAULT true,
  verified_at            timestamptz NULL,
  verified_by_user_id    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_sandbox_test_recipients_phone_e164_format_chk
    CHECK (phone_e164 ~ '^\+[0-9]{8,15}$'),

  CONSTRAINT sms_sandbox_test_recipients_phone_label_not_blank_chk
    CHECK (phone_label IS NULL OR length(btrim(phone_label)) > 0),

  CONSTRAINT sms_sandbox_test_recipients_verified_pair_chk
    CHECK (
      (verified_at IS NULL AND verified_by_user_id IS NULL)
      OR (verified_at IS NOT NULL AND verified_by_user_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.sms_sandbox_test_recipients
  IS 'Account-scoped sandbox test-recipient allowlist for manual sandbox-only SMS testing. Does not imply live-send approval.';

COMMENT ON COLUMN public.sms_sandbox_test_recipients.phone_e164
  IS 'Normalized E.164 phone used for sandbox test-recipient matching.';

COMMENT ON COLUMN public.sms_sandbox_test_recipients.phone_label
  IS 'Optional internal/admin label for sandbox test recipient display.';

COMMENT ON COLUMN public.sms_sandbox_test_recipients.is_active
  IS 'When false, recipient remains retained for audit but should fail sandbox recipient gate checks.';

CREATE UNIQUE INDEX IF NOT EXISTS sms_sandbox_test_recipients_account_phone_active_uidx
  ON public.sms_sandbox_test_recipients (account_owner_user_id, phone_e164)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS sms_sandbox_test_recipients_account_active_idx
  ON public.sms_sandbox_test_recipients (account_owner_user_id, is_active);

DROP TRIGGER IF EXISTS sms_sandbox_test_recipients_set_updated_at
  ON public.sms_sandbox_test_recipients;

CREATE TRIGGER sms_sandbox_test_recipients_set_updated_at
BEFORE UPDATE ON public.sms_sandbox_test_recipients
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_sandbox_test_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_sandbox_test_recipients_select_account_scope
  ON public.sms_sandbox_test_recipients;
DROP POLICY IF EXISTS sms_sandbox_test_recipients_insert_account_scope
  ON public.sms_sandbox_test_recipients;
DROP POLICY IF EXISTS sms_sandbox_test_recipients_update_account_scope
  ON public.sms_sandbox_test_recipients;
DROP POLICY IF EXISTS sms_sandbox_test_recipients_delete_account_scope
  ON public.sms_sandbox_test_recipients;

CREATE POLICY sms_sandbox_test_recipients_select_account_scope
ON public.sms_sandbox_test_recipients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_sandbox_test_recipients.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Writes are intentionally reserved for
-- trusted server-side/service-role paths after explicit admin action contracts.

COMMIT;
