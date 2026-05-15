-- Compliance Matters: SMS Slice A recipient registry foundation
-- Purpose: add first-class, account-scoped contact recipients table only.
-- Non-goals: no consent/suppression/provider intent/delivery tables, no backfill,
-- no live SMS behavior, no provider integration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_recipients (
  id                         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  linked_entity_type         text        NOT NULL,
  linked_entity_id           uuid        NULL,

  display_name               text        NOT NULL,
  phone_e164                 text        NULL,
  phone_last10               text        NULL,
  email                      text        NULL,

  recipient_role             text        NOT NULL,
  status                     text        NOT NULL DEFAULT 'inactive',
  preferred_contact_method   text        NOT NULL DEFAULT 'sms',
  recipient_timezone         text        NULL,

  source_type                text        NOT NULL DEFAULT 'manual',
  source_ref                 text        NULL,
  notes                      text        NULL,

  created_by_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  deactivated_at             timestamptz NULL,
  deactivated_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_recipients_display_name_not_blank_chk
    CHECK (length(btrim(display_name)) > 0),

  CONSTRAINT contact_recipients_contact_channel_required_chk
    CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL),

  CONSTRAINT contact_recipients_preferred_sms_requires_phone_chk
    CHECK (preferred_contact_method <> 'sms' OR phone_e164 IS NOT NULL),

  CONSTRAINT contact_recipients_preferred_phone_requires_phone_chk
    CHECK (preferred_contact_method <> 'phone' OR phone_e164 IS NOT NULL),

  CONSTRAINT contact_recipients_preferred_email_requires_email_chk
    CHECK (preferred_contact_method <> 'email' OR email IS NOT NULL),

  CONSTRAINT contact_recipients_phone_e164_format_chk
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[0-9]{8,15}$'),

  CONSTRAINT contact_recipients_phone_last10_format_chk
    CHECK (phone_last10 IS NULL OR phone_last10 ~ '^[0-9]{10}$'),

  CONSTRAINT contact_recipients_recipient_role_valid_chk
    CHECK (
      recipient_role IN (
        'customer_primary',
        'customer_alt',
        'homeowner',
        'tenant_or_occupant',
        'responsible_party',
        'site_access_contact',
        'billing_contact',
        'contractor_contact',
        'third_party_oversight',
        'internal_user',
        'account_owner',
        'future_marketplace_participant'
      )
    ),

  CONSTRAINT contact_recipients_status_valid_chk
    CHECK (status IN ('inactive', 'active', 'archived')),

  CONSTRAINT contact_recipients_preferred_contact_method_valid_chk
    CHECK (preferred_contact_method IN ('sms', 'phone', 'email', 'none')),

  CONSTRAINT contact_recipients_linked_entity_type_valid_chk
    CHECK (
      linked_entity_type IN (
        'customer',
        'location',
        'job',
        'contractor',
        'internal_user',
        'account_owner',
        'other'
      )
    ),

  CONSTRAINT contact_recipients_source_type_valid_chk
    CHECK (
      source_type IN (
        'manual',
        'import',
        'seeded_from_customer',
        'seeded_from_contractor',
        'system_future'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_recipients_active_identity_phone_uidx
  ON public.contact_recipients (
    account_owner_user_id,
    linked_entity_type,
    coalesce(linked_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    recipient_role,
    phone_e164
  )
  WHERE status = 'active' AND phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_recipients_account_status_idx
  ON public.contact_recipients (account_owner_user_id, status);

CREATE INDEX IF NOT EXISTS contact_recipients_account_linked_entity_idx
  ON public.contact_recipients (account_owner_user_id, linked_entity_type, linked_entity_id);

CREATE INDEX IF NOT EXISTS contact_recipients_account_role_status_idx
  ON public.contact_recipients (account_owner_user_id, recipient_role, status);

CREATE INDEX IF NOT EXISTS contact_recipients_account_phone_e164_idx
  ON public.contact_recipients (account_owner_user_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_recipients_account_phone_last10_idx
  ON public.contact_recipients (account_owner_user_id, phone_last10)
  WHERE phone_last10 IS NOT NULL;

DROP TRIGGER IF EXISTS contact_recipients_set_updated_at ON public.contact_recipients;

CREATE TRIGGER contact_recipients_set_updated_at
BEFORE UPDATE ON public.contact_recipients
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_recipients_select_account_scope ON public.contact_recipients;
DROP POLICY IF EXISTS contact_recipients_insert_account_scope ON public.contact_recipients;
DROP POLICY IF EXISTS contact_recipients_update_account_scope ON public.contact_recipients;

CREATE POLICY contact_recipients_select_account_scope
ON public.contact_recipients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipients.account_owner_user_id
  )
);

CREATE POLICY contact_recipients_insert_account_scope
ON public.contact_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND (deactivated_by_user_id IS NULL OR deactivated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipients.account_owner_user_id
  )
);

CREATE POLICY contact_recipients_update_account_scope
ON public.contact_recipients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipients.account_owner_user_id
  )
)
WITH CHECK (
  (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND (deactivated_by_user_id IS NULL OR deactivated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = contact_recipients.account_owner_user_id
  )
);

-- No DELETE policy in V1. Archive/deactivate preferred over hard delete.

COMMIT;
