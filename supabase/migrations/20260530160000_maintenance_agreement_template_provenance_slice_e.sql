-- Compliance Matters: maintenance agreement template provenance Slice E
-- Purpose: preserve read-only template provenance for customer service plans
-- created from templates without introducing automation side effects.

BEGIN;

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

COMMIT;
