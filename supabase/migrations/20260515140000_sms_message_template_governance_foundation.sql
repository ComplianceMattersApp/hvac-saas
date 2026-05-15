-- Compliance Matters: SMS Slice F4B message template governance foundation
-- Purpose: add account-scoped On-The-Way template governance schema only.
-- Non-goals: no send logic, no provider behavior, no webhook, no activation toggle,
-- no UI behavior, no backfill, no seed data, no E2 alteration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sms_message_templates (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_key           text        NOT NULL DEFAULT 'on_the_way',
  message_class          text        NOT NULL DEFAULT 'on_the_way',
  display_name           text        NOT NULL,
  lifecycle_status       text        NOT NULL DEFAULT 'draft',
  current_version_id     uuid        NULL,
  sandbox_version_id     uuid        NULL,
  created_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_message_templates_id_account_owner_unique
    UNIQUE (id, account_owner_user_id),

  CONSTRAINT sms_message_templates_account_template_key_unique
    UNIQUE (account_owner_user_id, template_key),

  CONSTRAINT sms_message_templates_template_key_valid_chk
    CHECK (template_key IN ('on_the_way')),

  CONSTRAINT sms_message_templates_message_class_valid_chk
    CHECK (message_class IN ('on_the_way')),

  CONSTRAINT sms_message_templates_lifecycle_status_valid_chk
    CHECK (lifecycle_status IN ('draft', 'active', 'paused', 'archived')),

  CONSTRAINT sms_message_templates_display_name_not_blank_chk
    CHECK (length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.sms_message_templates
  IS 'Account-scoped template container/current pointer for governed SMS templates. No send/provider behavior.';

COMMENT ON COLUMN public.sms_message_templates.current_version_id
  IS 'Current approved/active version pointer. Intentionally nullable and no FK in F4B to avoid circular migration complexity.';

COMMENT ON COLUMN public.sms_message_templates.sandbox_version_id
  IS 'Sandbox candidate version pointer. Intentionally nullable and no FK in F4B to avoid circular migration complexity.';

CREATE INDEX IF NOT EXISTS sms_message_templates_account_lifecycle_status_idx
  ON public.sms_message_templates (account_owner_user_id, lifecycle_status);

CREATE INDEX IF NOT EXISTS sms_message_templates_account_message_class_idx
  ON public.sms_message_templates (account_owner_user_id, message_class);

CREATE INDEX IF NOT EXISTS sms_message_templates_account_updated_at_desc_idx
  ON public.sms_message_templates (account_owner_user_id, updated_at DESC);

DROP TRIGGER IF EXISTS sms_message_templates_set_updated_at
  ON public.sms_message_templates;

CREATE TRIGGER sms_message_templates_set_updated_at
BEFORE UPDATE ON public.sms_message_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_message_templates_select_account_scope
  ON public.sms_message_templates;
DROP POLICY IF EXISTS sms_message_templates_insert_account_scope
  ON public.sms_message_templates;
DROP POLICY IF EXISTS sms_message_templates_update_account_scope
  ON public.sms_message_templates;
DROP POLICY IF EXISTS sms_message_templates_delete_account_scope
  ON public.sms_message_templates;

CREATE POLICY sms_message_templates_select_account_scope
ON public.sms_message_templates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_message_templates.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Writes are intentionally deferred until
-- explicit admin/owner mutation contract is implemented.

CREATE TABLE IF NOT EXISTS public.sms_message_template_versions (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sms_message_template_id uuid        NOT NULL,
  template_key            text        NOT NULL DEFAULT 'on_the_way',
  message_class           text        NOT NULL DEFAULT 'on_the_way',
  version_number          integer     NOT NULL,
  version_label           text        NULL,
  body_template           text        NOT NULL,
  body_hash               text        NOT NULL,
  detected_tokens         text[]      NOT NULL DEFAULT '{}'::text[],
  unknown_tokens          text[]      NOT NULL DEFAULT '{}'::text[],
  token_policy_version    text        NOT NULL DEFAULT 'v1',
  content_classification  text        NOT NULL DEFAULT 'operational',
  version_status          text        NOT NULL DEFAULT 'draft',
  internal_review_status  text        NOT NULL DEFAULT 'not_requested',
  legal_review_status     text        NOT NULL DEFAULT 'not_requested',
  provider_review_status  text        NOT NULL DEFAULT 'not_requested',
  approved_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at             timestamptz NULL,
  rejected_by_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at             timestamptz NULL,
  rejected_reason         text        NULL,
  created_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sms_message_template_versions_template_account_fk
    FOREIGN KEY (sms_message_template_id, account_owner_user_id)
    REFERENCES public.sms_message_templates (id, account_owner_user_id)
    ON DELETE RESTRICT,

  CONSTRAINT sms_message_template_versions_id_account_owner_unique
    UNIQUE (id, account_owner_user_id),

  CONSTRAINT sms_message_template_versions_account_template_version_unique
    UNIQUE (account_owner_user_id, sms_message_template_id, version_number),

  CONSTRAINT sms_message_template_versions_template_key_valid_chk
    CHECK (template_key IN ('on_the_way')),

  CONSTRAINT sms_message_template_versions_message_class_valid_chk
    CHECK (message_class IN ('on_the_way')),

  CONSTRAINT sms_message_template_versions_version_number_positive_chk
    CHECK (version_number > 0),

  CONSTRAINT sms_message_template_versions_body_template_not_blank_chk
    CHECK (length(btrim(body_template)) > 0),

  CONSTRAINT sms_message_template_versions_body_hash_not_blank_chk
    CHECK (length(btrim(body_hash)) > 0),

  CONSTRAINT sms_message_template_versions_token_policy_version_valid_chk
    CHECK (token_policy_version IN ('v1')),

  CONSTRAINT sms_message_template_versions_content_classification_valid_chk
    CHECK (content_classification IN ('operational')),

  CONSTRAINT sms_message_template_versions_version_status_valid_chk
    CHECK (
      version_status IN (
        'draft',
        'pending_review',
        'approved_for_sandbox',
        'approved_for_activation',
        'active',
        'rejected',
        'superseded',
        'retired'
      )
    ),

  CONSTRAINT sms_message_template_versions_internal_review_status_valid_chk
    CHECK (internal_review_status IN ('not_requested', 'pending', 'approved', 'rejected')),

  CONSTRAINT sms_message_template_versions_legal_review_status_valid_chk
    CHECK (legal_review_status IN ('not_requested', 'pending', 'approved', 'rejected')),

  CONSTRAINT sms_message_template_versions_provider_review_status_valid_chk
    CHECK (provider_review_status IN ('not_requested', 'pending', 'approved', 'rejected')),

  CONSTRAINT sms_template_versions_approved_unknown_tokens_empty_chk
    CHECK (
      version_status NOT IN ('approved_for_sandbox', 'approved_for_activation', 'active')
      OR coalesce(array_length(unknown_tokens, 1), 0) = 0
    ),

  CONSTRAINT sms_template_versions_approved_requires_fields_chk
    CHECK (
      version_status NOT IN ('approved_for_sandbox', 'approved_for_activation', 'active')
      OR (
        approved_by_user_id IS NOT NULL
        AND approved_at IS NOT NULL
      )
    ),

  CONSTRAINT sms_template_versions_rejected_requires_fields_chk
    CHECK (
      version_status <> 'rejected'
      OR (
        rejected_by_user_id IS NOT NULL
        AND rejected_at IS NOT NULL
        AND length(btrim(coalesce(rejected_reason, ''))) > 0
      )
    )
);

COMMENT ON TABLE public.sms_message_template_versions
  IS 'Durable version/audit records for governed SMS template wording. No send/provider behavior.';

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_template_version_desc_idx
  ON public.sms_message_template_versions (account_owner_user_id, sms_message_template_id, version_number DESC);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_template_key_status_idx
  ON public.sms_message_template_versions (account_owner_user_id, template_key, version_status);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_message_class_status_idx
  ON public.sms_message_template_versions (account_owner_user_id, message_class, version_status);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_internal_review_idx
  ON public.sms_message_template_versions (account_owner_user_id, internal_review_status);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_legal_review_idx
  ON public.sms_message_template_versions (account_owner_user_id, legal_review_status);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_provider_review_idx
  ON public.sms_message_template_versions (account_owner_user_id, provider_review_status);

CREATE INDEX IF NOT EXISTS sms_message_template_versions_account_updated_at_desc_idx
  ON public.sms_message_template_versions (account_owner_user_id, updated_at DESC);

DROP TRIGGER IF EXISTS sms_message_template_versions_set_updated_at
  ON public.sms_message_template_versions;

CREATE TRIGGER sms_message_template_versions_set_updated_at
BEFORE UPDATE ON public.sms_message_template_versions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_message_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_message_template_versions_select_account_scope
  ON public.sms_message_template_versions;
DROP POLICY IF EXISTS sms_message_template_versions_insert_account_scope
  ON public.sms_message_template_versions;
DROP POLICY IF EXISTS sms_message_template_versions_update_account_scope
  ON public.sms_message_template_versions;
DROP POLICY IF EXISTS sms_message_template_versions_delete_account_scope
  ON public.sms_message_template_versions;

CREATE POLICY sms_message_template_versions_select_account_scope
ON public.sms_message_template_versions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = sms_message_template_versions.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE policy in V1. Writes are intentionally deferred until
-- explicit admin/owner mutation contract is implemented.

COMMIT;
