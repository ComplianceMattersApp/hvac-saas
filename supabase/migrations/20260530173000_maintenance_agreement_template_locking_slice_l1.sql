-- Compliance Matters: maintenance agreement template locking prep Slice L1
-- Purpose: add lock-policy metadata for templates and agreement-side lock snapshots
-- without enforcing behavior changes yet.

BEGIN;

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
