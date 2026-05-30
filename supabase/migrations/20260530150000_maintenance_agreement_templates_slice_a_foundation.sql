-- Compliance Matters: maintenance agreement templates Slice A schema foundation
-- Purpose: add account-scoped reusable service plan templates without changing
-- agreement lifecycle, billing periods, invoice/payment behavior, visits,
-- scheduling automation, portal, SMS, or QBO flows.

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

-- No DELETE policy in Slice A.

COMMIT;
