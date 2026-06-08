-- Repair production drift for maintenance agreement template/provenance/locking schema only.
-- Mirrors:
--   20260530150000_maintenance_agreement_templates_slice_a_foundation.sql
--   20260530160000_maintenance_agreement_template_provenance_slice_e.sql
--   20260530173000_maintenance_agreement_template_locking_slice_l1.sql
-- without seeding rows or mutating billing, invoice, payment, visit, or provider truth.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_agreement_templates (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  template_name                text        NOT NULL,
  agreement_type               text        NOT NULL,
  frequency                    text        NOT NULL,
  default_visit_scope_summary  text        NULL,
  default_visit_scope_items    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  internal_notes_default       text        NULL,
  lifecycle_status             text        NOT NULL DEFAULT 'active',

  created_by_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_agreement_templates_name_not_blank_chk
    CHECK (length(btrim(template_name)) > 0),

  CONSTRAINT maintenance_agreement_templates_type_valid_chk
    CHECK (agreement_type IN ('maintenance', 'service_plan', 'inspection', 'other')),

  CONSTRAINT maintenance_agreement_templates_frequency_valid_chk
    CHECK (frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'custom')),

  CONSTRAINT maintenance_agreement_templates_lifecycle_status_valid_chk
    CHECK (lifecycle_status IN ('active', 'archived')),

  CONSTRAINT maintenance_agreement_templates_visit_scope_items_array_chk
    CHECK (jsonb_typeof(default_visit_scope_items) = 'array')
);

ALTER TABLE public.maintenance_agreement_templates
  ADD COLUMN IF NOT EXISTS locked_field_keys jsonb NOT NULL DEFAULT '["agreement_name","agreement_type","frequency","default_visit_scope_summary","default_visit_scope_items"]'::jsonb,
  ADD COLUMN IF NOT EXISTS lock_policy_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.maintenance_agreement_templates
  DROP CONSTRAINT IF EXISTS maintenance_agreement_templates_locked_field_keys_array_chk,
  ADD CONSTRAINT maintenance_agreement_templates_locked_field_keys_array_chk
    CHECK (jsonb_typeof(locked_field_keys) = 'array'),
  DROP CONSTRAINT IF EXISTS maintenance_agreement_templates_lock_policy_version_positive_chk,
  ADD CONSTRAINT maintenance_agreement_templates_lock_policy_version_positive_chk
    CHECK (lock_policy_version > 0);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_agreement_templates_owner_name_unique_idx
  ON public.maintenance_agreement_templates (account_owner_user_id, lower(btrim(template_name)));

CREATE INDEX IF NOT EXISTS maintenance_agreement_templates_owner_status_idx
  ON public.maintenance_agreement_templates (account_owner_user_id, lifecycle_status, created_at);

DROP TRIGGER IF EXISTS maintenance_agreement_templates_set_updated_at
  ON public.maintenance_agreement_templates;

CREATE TRIGGER maintenance_agreement_templates_set_updated_at
BEFORE UPDATE ON public.maintenance_agreement_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.maintenance_agreement_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_agreement_templates_select_account_scope
  ON public.maintenance_agreement_templates;
DROP POLICY IF EXISTS maintenance_agreement_templates_insert_account_scope
  ON public.maintenance_agreement_templates;
DROP POLICY IF EXISTS maintenance_agreement_templates_update_account_scope
  ON public.maintenance_agreement_templates;
DROP POLICY IF EXISTS maintenance_agreement_templates_delete_account_scope
  ON public.maintenance_agreement_templates;

CREATE POLICY maintenance_agreement_templates_select_account_scope
ON public.maintenance_agreement_templates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_templates.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_templates_insert_account_scope
ON public.maintenance_agreement_templates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_templates.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_templates_update_account_scope
ON public.maintenance_agreement_templates
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_templates.account_owner_user_id
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_templates.account_owner_user_id
  )
);

ALTER TABLE public.maintenance_agreements
  ADD COLUMN IF NOT EXISTS source_template_id uuid
    NULL REFERENCES public.maintenance_agreement_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_template_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS source_template_lifecycle_status_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS source_template_applied_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS source_template_snapshot jsonb NULL;

ALTER TABLE public.maintenance_agreements
  DROP CONSTRAINT IF EXISTS maintenance_agreements_source_template_name_snapshot_not_blank_chk,
  ADD CONSTRAINT maintenance_agreements_source_template_name_snapshot_not_blank_chk
    CHECK (
      source_template_name_snapshot IS NULL
      OR length(btrim(source_template_name_snapshot)) > 0
    ),
  DROP CONSTRAINT IF EXISTS maintenance_agreements_source_template_lifecycle_status_snapshot_valid_chk,
  ADD CONSTRAINT maintenance_agreements_source_template_lifecycle_status_snapshot_valid_chk
    CHECK (
      source_template_lifecycle_status_snapshot IS NULL
      OR source_template_lifecycle_status_snapshot IN ('active', 'archived')
    ),
  DROP CONSTRAINT IF EXISTS maintenance_agreements_source_template_snapshot_object_chk,
  ADD CONSTRAINT maintenance_agreements_source_template_snapshot_object_chk
    CHECK (
      source_template_snapshot IS NULL
      OR jsonb_typeof(source_template_snapshot) = 'object'
    );

CREATE INDEX IF NOT EXISTS maintenance_agreements_source_template_idx
  ON public.maintenance_agreements (account_owner_user_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

ALTER TABLE public.maintenance_agreements
  ADD COLUMN IF NOT EXISTS template_locked_field_keys jsonb NULL,
  ADD COLUMN IF NOT EXISTS template_lock_policy_version integer NULL,
  ADD COLUMN IF NOT EXISTS template_lock_snapshot_applied_at timestamptz NULL;

ALTER TABLE public.maintenance_agreements
  DROP CONSTRAINT IF EXISTS maintenance_agreements_template_locked_field_keys_array_chk,
  ADD CONSTRAINT maintenance_agreements_template_locked_field_keys_array_chk
    CHECK (
      template_locked_field_keys IS NULL
      OR jsonb_typeof(template_locked_field_keys) = 'array'
    ),
  DROP CONSTRAINT IF EXISTS maintenance_agreements_template_lock_policy_version_positive_chk,
  ADD CONSTRAINT maintenance_agreements_template_lock_policy_version_positive_chk
    CHECK (
      template_lock_policy_version IS NULL
      OR template_lock_policy_version > 0
    );

COMMIT;
