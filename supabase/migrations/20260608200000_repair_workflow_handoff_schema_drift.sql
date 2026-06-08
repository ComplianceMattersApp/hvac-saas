-- Repair production drift for workflow/handoff schema family only.
-- Mirrors:
--   20260530180000_workflow_presets_slice_b_foundation.sql
--   20260531123000_authorized_handoff_recipients_foundation.sql
--   20260531194500_workflow_handoff_requests_foundation.sql
--   20260531213000_account_handoff_connections_foundation.sql
--   20260531223000_workflow_handoff_request_grants_foundation.sql
-- without seeding rows or mutating jobs, service cases, job events, invoices, payments, visits, or provider truth.

BEGIN;

-- ---------------------------------------------------------------------------
-- 20260530180000_workflow_presets_slice_b_foundation.sql
-- ---------------------------------------------------------------------------
-- Compliance Matters: workflow presets slice B schema foundation
-- Purpose: add additive workflow preset/instance/milestone/job-link schema for
-- guided operational planning without changing jobs/service_cases/job_events
-- source-of-truth authority.


CREATE TABLE IF NOT EXISTS public.workflow_preset_templates (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_name                   text        NOT NULL,
  template_description            text        NULL,
  lifecycle_status                text        NOT NULL DEFAULT 'active',
  milestone_definition_json       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT workflow_preset_templates_lifecycle_valid_chk
    CHECK (lifecycle_status IN ('active', 'archived')),

  CONSTRAINT workflow_preset_templates_template_name_not_blank_chk
    CHECK (length(btrim(template_name)) > 0),

  CONSTRAINT workflow_preset_templates_milestone_definition_array_chk
    CHECK (jsonb_typeof(milestone_definition_json) = 'array')
);

CREATE INDEX IF NOT EXISTS workflow_preset_templates_owner_lifecycle_name_idx
  ON public.workflow_preset_templates (account_owner_user_id, lifecycle_status, template_name);

DROP TRIGGER IF EXISTS workflow_preset_templates_set_updated_at
  ON public.workflow_preset_templates;

CREATE TRIGGER workflow_preset_templates_set_updated_at
BEFORE UPDATE ON public.workflow_preset_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  service_case_id                 uuid        NOT NULL REFERENCES public.service_cases(id) ON DELETE RESTRICT,
  workflow_preset_template_id     uuid        NULL REFERENCES public.workflow_preset_templates(id) ON DELETE SET NULL,
  workflow_name_snapshot          text        NOT NULL,
  workflow_status                 text        NOT NULL DEFAULT 'active',
  progress_percent                integer     NOT NULL DEFAULT 0,
  template_snapshot_json          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT workflow_instances_status_valid_chk
    CHECK (workflow_status IN ('active', 'paused', 'completed', 'cancelled', 'archived')),

  CONSTRAINT workflow_instances_progress_percent_range_chk
    CHECK (progress_percent BETWEEN 0 AND 100),

  CONSTRAINT workflow_instances_name_snapshot_not_blank_chk
    CHECK (length(btrim(workflow_name_snapshot)) > 0),

  CONSTRAINT workflow_instances_template_snapshot_object_chk
    CHECK (jsonb_typeof(template_snapshot_json) = 'object')
);

CREATE INDEX IF NOT EXISTS workflow_instances_owner_service_case_status_idx
  ON public.workflow_instances (account_owner_user_id, service_case_id, workflow_status);

CREATE INDEX IF NOT EXISTS workflow_instances_owner_created_desc_idx
  ON public.workflow_instances (account_owner_user_id, created_at DESC);

DROP TRIGGER IF EXISTS workflow_instances_set_updated_at
  ON public.workflow_instances;

CREATE TRIGGER workflow_instances_set_updated_at
BEFORE UPDATE ON public.workflow_instances
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_instance_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  service_case_row record;
  template_owner_id uuid;
BEGIN
  SELECT sc.id, sc.customer_id, sc.location_id
  INTO service_case_row
  FROM public.service_cases sc
  WHERE sc.id = NEW.service_case_id;

  IF service_case_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_instances service_case_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF NOT public.service_case_matches_account_owner(
    service_case_row.id,
    service_case_row.customer_id,
    service_case_row.location_id,
    NEW.account_owner_user_id
  ) THEN
    RAISE EXCEPTION 'workflow_instances service case/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.workflow_preset_template_id IS NOT NULL THEN
    SELECT t.account_owner_user_id
    INTO template_owner_id
    FROM public.workflow_preset_templates t
    WHERE t.id = NEW.workflow_preset_template_id;

    IF template_owner_id IS NULL THEN
      RAISE EXCEPTION 'workflow_instances template id not found'
        USING ERRCODE = '23503';
    END IF;

    IF template_owner_id IS DISTINCT FROM NEW.account_owner_user_id THEN
      RAISE EXCEPTION 'workflow_instances template/account mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_instances_assert_scope
  ON public.workflow_instances;

CREATE TRIGGER workflow_instances_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_instances
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_instance_scope();

CREATE TABLE IF NOT EXISTS public.workflow_instance_milestones (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow_instance_id            uuid        NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  milestone_key                   text        NULL,
  milestone_title                 text        NOT NULL,
  milestone_description           text        NULL,
  sort_order                      integer     NOT NULL DEFAULT 0,
  milestone_status                text        NOT NULL DEFAULT 'planned',
  status_reason                   text        NULL,
  metadata_json                   jsonb       NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT workflow_instance_milestones_title_not_blank_chk
    CHECK (length(btrim(milestone_title)) > 0),

  CONSTRAINT workflow_instance_milestones_sort_order_nonnegative_chk
    CHECK (sort_order >= 0),

  CONSTRAINT workflow_instance_milestones_status_valid_chk
    CHECK (
      milestone_status IN (
        'planned',
        'ready',
        'in_progress',
        'completed',
        'skipped',
        'blocked',
        'waiting',
        'needs_attention',
        'superseded'
      )
    ),

  CONSTRAINT workflow_instance_milestones_metadata_json_object_chk
    CHECK (metadata_json IS NULL OR jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS workflow_instance_milestones_owner_instance_sort_idx
  ON public.workflow_instance_milestones (account_owner_user_id, workflow_instance_id, sort_order, created_at);

DROP TRIGGER IF EXISTS workflow_instance_milestones_set_updated_at
  ON public.workflow_instance_milestones;

CREATE TRIGGER workflow_instance_milestones_set_updated_at
BEFORE UPDATE ON public.workflow_instance_milestones
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_instance_milestone_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  instance_owner_id uuid;
BEGIN
  SELECT i.account_owner_user_id
  INTO instance_owner_id
  FROM public.workflow_instances i
  WHERE i.id = NEW.workflow_instance_id;

  IF instance_owner_id IS NULL THEN
    RAISE EXCEPTION 'workflow_instance_milestones workflow_instance_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM instance_owner_id THEN
    RAISE EXCEPTION 'workflow_instance_milestones instance/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_instance_milestones_assert_scope
  ON public.workflow_instance_milestones;

CREATE TRIGGER workflow_instance_milestones_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_instance_milestones
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_instance_milestone_scope();

CREATE TABLE IF NOT EXISTS public.workflow_instance_job_links (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow_instance_id            uuid        NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  workflow_instance_milestone_id  uuid        NULL REFERENCES public.workflow_instance_milestones(id) ON DELETE SET NULL,
  job_id                          uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  link_role                       text        NOT NULL DEFAULT 'supporting',
  is_primary                      boolean     NOT NULL DEFAULT false,
  notes                           text        NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  linked_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT workflow_instance_job_links_role_valid_chk
    CHECK (
      link_role IN (
        'primary',
        'supporting',
        'follow_up',
        'retest',
        'inspection',
        'closeout',
        'other'
      )
    ),

  CONSTRAINT workflow_instance_job_links_unique_link_chk
    UNIQUE (workflow_instance_id, workflow_instance_milestone_id, job_id)
);

CREATE INDEX IF NOT EXISTS workflow_instance_job_links_owner_instance_idx
  ON public.workflow_instance_job_links (account_owner_user_id, workflow_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_instance_job_links_owner_milestone_idx
  ON public.workflow_instance_job_links (account_owner_user_id, workflow_instance_milestone_id, created_at DESC)
  WHERE workflow_instance_milestone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_instance_job_links_owner_job_idx
  ON public.workflow_instance_job_links (account_owner_user_id, job_id, created_at DESC);

DROP TRIGGER IF EXISTS workflow_instance_job_links_set_updated_at
  ON public.workflow_instance_job_links;

CREATE TRIGGER workflow_instance_job_links_set_updated_at
BEFORE UPDATE ON public.workflow_instance_job_links
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_instance_job_link_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  instance_owner_id uuid;
  instance_service_case_id uuid;
  milestone_instance_id uuid;
  job_row record;
BEGIN
  SELECT i.account_owner_user_id, i.service_case_id
  INTO instance_owner_id, instance_service_case_id
  FROM public.workflow_instances i
  WHERE i.id = NEW.workflow_instance_id;

  IF instance_owner_id IS NULL THEN
    RAISE EXCEPTION 'workflow_instance_job_links workflow_instance_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM instance_owner_id THEN
    RAISE EXCEPTION 'workflow_instance_job_links instance/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.workflow_instance_milestone_id IS NOT NULL THEN
    SELECT m.workflow_instance_id
    INTO milestone_instance_id
    FROM public.workflow_instance_milestones m
    WHERE m.id = NEW.workflow_instance_milestone_id;

    IF milestone_instance_id IS NULL THEN
      RAISE EXCEPTION 'workflow_instance_job_links milestone id not found'
        USING ERRCODE = '23503';
    END IF;

    IF milestone_instance_id IS DISTINCT FROM NEW.workflow_instance_id THEN
      RAISE EXCEPTION 'workflow_instance_job_links milestone/instance mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT j.id, j.service_case_id, j.contractor_id, j.customer_id, j.location_id, j.deleted_at
  INTO job_row
  FROM public.jobs j
  WHERE j.id = NEW.job_id;

  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_instance_job_links job_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF job_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'workflow_instance_job_links cannot link deleted job'
      USING ERRCODE = '23514';
  END IF;

  IF job_row.service_case_id IS DISTINCT FROM instance_service_case_id THEN
    RAISE EXCEPTION 'workflow_instance_job_links job/service_case mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.job_matches_account_owner(
    job_row.contractor_id,
    job_row.customer_id,
    job_row.location_id,
    job_row.service_case_id,
    NEW.account_owner_user_id
  ) THEN
    RAISE EXCEPTION 'workflow_instance_job_links job/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_instance_job_links_assert_scope
  ON public.workflow_instance_job_links;

CREATE TRIGGER workflow_instance_job_links_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_instance_job_links
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_instance_job_link_scope();

ALTER TABLE public.workflow_preset_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_instance_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_instance_job_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_preset_templates_select_account_scope
  ON public.workflow_preset_templates;
DROP POLICY IF EXISTS workflow_preset_templates_insert_account_scope
  ON public.workflow_preset_templates;
DROP POLICY IF EXISTS workflow_preset_templates_update_account_scope
  ON public.workflow_preset_templates;

CREATE POLICY workflow_preset_templates_select_account_scope
ON public.workflow_preset_templates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_preset_templates.account_owner_user_id
  )
);

CREATE POLICY workflow_preset_templates_insert_account_scope
ON public.workflow_preset_templates
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_preset_templates.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
);

CREATE POLICY workflow_preset_templates_update_account_scope
ON public.workflow_preset_templates
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_preset_templates.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_preset_templates.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
);

DROP POLICY IF EXISTS workflow_instances_select_account_scope
  ON public.workflow_instances;
DROP POLICY IF EXISTS workflow_instances_insert_account_scope
  ON public.workflow_instances;
DROP POLICY IF EXISTS workflow_instances_update_account_scope
  ON public.workflow_instances;

CREATE POLICY workflow_instances_select_account_scope
ON public.workflow_instances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instances.account_owner_user_id
  )
);

CREATE POLICY workflow_instances_insert_account_scope
ON public.workflow_instances
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instances.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.service_cases sc
    WHERE sc.id = workflow_instances.service_case_id
      AND public.service_case_matches_account_owner(
        sc.id,
        sc.customer_id,
        sc.location_id,
        workflow_instances.account_owner_user_id
      )
  )
  AND (
    workflow_instances.workflow_preset_template_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workflow_preset_templates t
      WHERE t.id = workflow_instances.workflow_preset_template_id
        AND t.account_owner_user_id = workflow_instances.account_owner_user_id
    )
  )
);

CREATE POLICY workflow_instances_update_account_scope
ON public.workflow_instances
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instances.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instances.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.service_cases sc
    WHERE sc.id = workflow_instances.service_case_id
      AND public.service_case_matches_account_owner(
        sc.id,
        sc.customer_id,
        sc.location_id,
        workflow_instances.account_owner_user_id
      )
  )
  AND (
    workflow_instances.workflow_preset_template_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workflow_preset_templates t
      WHERE t.id = workflow_instances.workflow_preset_template_id
        AND t.account_owner_user_id = workflow_instances.account_owner_user_id
    )
  )
);

DROP POLICY IF EXISTS workflow_instance_milestones_select_account_scope
  ON public.workflow_instance_milestones;
DROP POLICY IF EXISTS workflow_instance_milestones_insert_account_scope
  ON public.workflow_instance_milestones;
DROP POLICY IF EXISTS workflow_instance_milestones_update_account_scope
  ON public.workflow_instance_milestones;

CREATE POLICY workflow_instance_milestones_select_account_scope
ON public.workflow_instance_milestones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
);

CREATE POLICY workflow_instance_milestones_insert_account_scope
ON public.workflow_instance_milestones
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.workflow_instances i
    WHERE i.id = workflow_instance_milestones.workflow_instance_id
      AND i.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
);

CREATE POLICY workflow_instance_milestones_update_account_scope
ON public.workflow_instance_milestones
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
  AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.workflow_instances i
    WHERE i.id = workflow_instance_milestones.workflow_instance_id
      AND i.account_owner_user_id = workflow_instance_milestones.account_owner_user_id
  )
);

DROP POLICY IF EXISTS workflow_instance_job_links_select_account_scope
  ON public.workflow_instance_job_links;
DROP POLICY IF EXISTS workflow_instance_job_links_insert_account_scope
  ON public.workflow_instance_job_links;
DROP POLICY IF EXISTS workflow_instance_job_links_update_account_scope
  ON public.workflow_instance_job_links;

CREATE POLICY workflow_instance_job_links_select_account_scope
ON public.workflow_instance_job_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
);

CREATE POLICY workflow_instance_job_links_insert_account_scope
ON public.workflow_instance_job_links
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
  AND (linked_by_user_id IS NULL OR linked_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.workflow_instances i
    WHERE i.id = workflow_instance_job_links.workflow_instance_id
      AND i.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
  AND (
    workflow_instance_job_links.workflow_instance_milestone_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workflow_instance_milestones m
      WHERE m.id = workflow_instance_job_links.workflow_instance_milestone_id
        AND m.workflow_instance_id = workflow_instance_job_links.workflow_instance_id
        AND m.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.workflow_instances i ON i.id = workflow_instance_job_links.workflow_instance_id
    WHERE j.id = workflow_instance_job_links.job_id
      AND j.deleted_at IS NULL
      AND j.service_case_id = i.service_case_id
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        workflow_instance_job_links.account_owner_user_id
      )
  )
);

CREATE POLICY workflow_instance_job_links_update_account_scope
ON public.workflow_instance_job_links
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
  AND (linked_by_user_id IS NULL OR linked_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.workflow_instances i
    WHERE i.id = workflow_instance_job_links.workflow_instance_id
      AND i.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
  )
  AND (
    workflow_instance_job_links.workflow_instance_milestone_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workflow_instance_milestones m
      WHERE m.id = workflow_instance_job_links.workflow_instance_milestone_id
        AND m.workflow_instance_id = workflow_instance_job_links.workflow_instance_id
        AND m.account_owner_user_id = workflow_instance_job_links.account_owner_user_id
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.workflow_instances i ON i.id = workflow_instance_job_links.workflow_instance_id
    WHERE j.id = workflow_instance_job_links.job_id
      AND j.deleted_at IS NULL
      AND j.service_case_id = i.service_case_id
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        workflow_instance_job_links.account_owner_user_id
      )
  )
);

-- No DELETE policy in Slice B.


-- ---------------------------------------------------------------------------
-- 20260531123000_authorized_handoff_recipients_foundation.sql
-- ---------------------------------------------------------------------------
-- Compliance Matters: Authorized handoff recipient foundation (V1)
-- Purpose: account-scoped, admin-managed recipient registry for ECC handoff.
-- Non-goals: no cross-account handoff execution, no job/service_case/job_event writes.


CREATE TABLE IF NOT EXISTS public.authorized_handoff_recipients (
  id                                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  recipient_type                    text        NOT NULL,
  handoff_kind                      text        NOT NULL DEFAULT 'ecc',
  display_name                      text        NOT NULL,

  internal_user_id                  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  external_company_name             text        NULL,
  external_contact_name             text        NULL,
  external_email                    text        NULL,
  external_phone                    text        NULL,
  connected_account_owner_user_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  is_default                        boolean     NOT NULL DEFAULT false,
  is_active                         boolean     NOT NULL DEFAULT true,
  notes                             text        NULL,

  created_by_user_id                uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id                uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  archived_at                       timestamptz NULL,

  CONSTRAINT authorized_handoff_recipients_type_valid_chk
    CHECK (recipient_type IN ('internal_user', 'external_manual', 'connected_account_future')),

  CONSTRAINT authorized_handoff_recipients_kind_valid_chk
    CHECK (handoff_kind IN ('ecc', 'general_future')),

  CONSTRAINT authorized_handoff_recipients_display_name_not_blank_chk
    CHECK (length(btrim(display_name)) > 0),

  CONSTRAINT authorized_handoff_recipients_external_email_format_chk
    CHECK (
      external_email IS NULL
      OR external_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    ),

  CONSTRAINT authorized_handoff_recipients_external_phone_len_chk
    CHECK (
      external_phone IS NULL
      OR length(regexp_replace(external_phone, '[^0-9]', '', 'g')) >= 7
    ),

  CONSTRAINT authorized_handoff_recipients_active_default_consistency_chk
    CHECK (is_default = false OR is_active = true),

  CONSTRAINT authorized_handoff_recipients_active_archive_consistency_chk
    CHECK (archived_at IS NULL OR is_active = false),

  CONSTRAINT authorized_handoff_recipients_internal_type_fields_chk
    CHECK (
      recipient_type <> 'internal_user'
      OR internal_user_id IS NOT NULL
    ),

  CONSTRAINT authorized_handoff_recipients_connected_type_fields_chk
    CHECK (
      recipient_type <> 'connected_account_future'
      OR connected_account_owner_user_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS authorized_handoff_recipients_account_kind_active_idx
  ON public.authorized_handoff_recipients (account_owner_user_id, handoff_kind, is_active)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS authorized_handoff_recipients_account_type_idx
  ON public.authorized_handoff_recipients (account_owner_user_id, recipient_type)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS authorized_handoff_recipients_one_default_per_kind_uidx
  ON public.authorized_handoff_recipients (account_owner_user_id, handoff_kind)
  WHERE is_default = true
    AND is_active = true
    AND archived_at IS NULL;

DROP TRIGGER IF EXISTS authorized_handoff_recipients_set_updated_at ON public.authorized_handoff_recipients;

CREATE TRIGGER authorized_handoff_recipients_set_updated_at
BEFORE UPDATE ON public.authorized_handoff_recipients
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.authorized_handoff_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authorized_handoff_recipients_select_account_scope ON public.authorized_handoff_recipients;
DROP POLICY IF EXISTS authorized_handoff_recipients_insert_admin_only ON public.authorized_handoff_recipients;
DROP POLICY IF EXISTS authorized_handoff_recipients_update_admin_only ON public.authorized_handoff_recipients;

CREATE POLICY authorized_handoff_recipients_select_account_scope
ON public.authorized_handoff_recipients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);

CREATE POLICY authorized_handoff_recipients_insert_admin_only
ON public.authorized_handoff_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);

CREATE POLICY authorized_handoff_recipients_update_admin_only
ON public.authorized_handoff_recipients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
)
WITH CHECK (
  (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);


-- ---------------------------------------------------------------------------
-- 20260531194500_workflow_handoff_requests_foundation.sql
-- ---------------------------------------------------------------------------
-- Compliance Matters: workflow handoff request foundation
-- Purpose: durable installer-side handoff request/response truth for ECC workflow return flow.
-- Non-goals: no rater UI, no cross-account execution, no job/service_case/job_event mutation.


CREATE TABLE IF NOT EXISTS public.workflow_handoff_requests (
  id                                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installer_account_owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow_instance_id              uuid        NOT NULL REFERENCES public.workflow_instances(id) ON DELETE RESTRICT,
  workflow_instance_milestone_id    uuid        NOT NULL REFERENCES public.workflow_instance_milestones(id) ON DELETE RESTRICT,
  service_case_id                   uuid        NOT NULL REFERENCES public.service_cases(id) ON DELETE RESTRICT,
  source_job_id                     uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  authorized_handoff_recipient_id   uuid        NOT NULL REFERENCES public.authorized_handoff_recipients(id) ON DELETE RESTRICT,
  recipient_type_snapshot           text        NOT NULL,
  recipient_display_name_snapshot   text        NOT NULL,
  handoff_kind                      text        NOT NULL DEFAULT 'ecc',
  handoff_status                    text        NOT NULL DEFAULT 'sent',
  sent_by_user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at                           timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at                      timestamptz NULL,
  response_note                     text        NULL,
  evidence_reference                text        NULL,
  created_at                        timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                        timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT workflow_handoff_requests_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc', 'general_future')),

  CONSTRAINT workflow_handoff_requests_handoff_status_valid_chk
    CHECK (handoff_status IN ('sent', 'accepted', 'completed', 'rejected', 'cancelled')),

  CONSTRAINT workflow_handoff_requests_recipient_type_snapshot_not_blank_chk
    CHECK (length(btrim(recipient_type_snapshot)) > 0),

  CONSTRAINT workflow_handoff_requests_recipient_display_name_snapshot_not_blank_chk
    CHECK (length(btrim(recipient_display_name_snapshot)) > 0),

  CONSTRAINT workflow_handoff_requests_response_required_for_non_sent_chk
    CHECK (
      handoff_status = 'sent'
      OR (responded_by_user_id IS NOT NULL AND responded_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_installer_status_idx
  ON public.workflow_handoff_requests (installer_account_owner_user_id, handoff_status, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_installer_sent_at_idx
  ON public.workflow_handoff_requests (installer_account_owner_user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_workflow_instance_idx
  ON public.workflow_handoff_requests (workflow_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_milestone_idx
  ON public.workflow_handoff_requests (workflow_instance_milestone_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_service_case_idx
  ON public.workflow_handoff_requests (service_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_recipient_idx
  ON public.workflow_handoff_requests (authorized_handoff_recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_kind_status_idx
  ON public.workflow_handoff_requests (handoff_kind, handoff_status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_handoff_requests_open_recipient_uidx
  ON public.workflow_handoff_requests (workflow_instance_milestone_id, authorized_handoff_recipient_id)
  WHERE handoff_status IN ('sent', 'accepted');

DROP TRIGGER IF EXISTS workflow_handoff_requests_set_updated_at
  ON public.workflow_handoff_requests;

CREATE TRIGGER workflow_handoff_requests_set_updated_at
BEFORE UPDATE ON public.workflow_handoff_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workflow_instance_row record;
  milestone_row record;
  recipient_row record;
  source_job_row record;
BEGIN
  SELECT wi.id, wi.account_owner_user_id, wi.service_case_id
  INTO workflow_instance_row
  FROM public.workflow_instances wi
  WHERE wi.id = NEW.workflow_instance_id;

  IF workflow_instance_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF workflow_instance_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.service_case_id IS DISTINCT FROM workflow_instance_row.service_case_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests service_case/workflow mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT wm.id, wm.account_owner_user_id, wm.workflow_instance_id
  INTO milestone_row
  FROM public.workflow_instance_milestones wm
  WHERE wm.id = NEW.workflow_instance_milestone_id;

  IF milestone_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance_milestone_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF milestone_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests milestone/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF milestone_row.workflow_instance_id IS DISTINCT FROM NEW.workflow_instance_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests milestone/workflow mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT r.id, r.account_owner_user_id, r.handoff_kind, r.recipient_type
  INTO recipient_row
  FROM public.authorized_handoff_recipients r
  WHERE r.id = NEW.authorized_handoff_recipient_id;

  IF recipient_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests authorized_handoff_recipient_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF recipient_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests recipient/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF recipient_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_requests recipient/handoff_kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source_job_id IS NOT NULL THEN
    SELECT j.id, c.owner_user_id, j.service_case_id
    INTO source_job_row
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.id = NEW.source_job_id;

    IF source_job_row.id IS NULL THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job_id not found'
        USING ERRCODE = '23503';
    END IF;

    IF source_job_row.owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF source_job_row.service_case_id IS DISTINCT FROM NEW.service_case_id THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job/service_case mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_handoff_requests_assert_scope
  ON public.workflow_handoff_requests;

CREATE TRIGGER workflow_handoff_requests_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_handoff_requests
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_handoff_request_scope();

ALTER TABLE public.workflow_handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_handoff_requests_select_account_scope ON public.workflow_handoff_requests;
DROP POLICY IF EXISTS workflow_handoff_requests_insert_account_scope ON public.workflow_handoff_requests;

CREATE POLICY workflow_handoff_requests_select_account_scope
ON public.workflow_handoff_requests
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_requests_insert_account_scope
ON public.workflow_handoff_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND sent_by_user_id = auth.uid()
);


-- ---------------------------------------------------------------------------
-- 20260531213000_account_handoff_connections_foundation.sql
-- ---------------------------------------------------------------------------
-- Compliance Matters: account handoff connections foundation
-- Purpose: explicit account-to-account trust/consent layer for future workflow handoffs.
-- Non-goals: no recipient queue, no request visibility, no job/service_case/job_event mutation.


CREATE TABLE IF NOT EXISTS public.account_handoff_connections (
  id                               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requesting_account_owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  connection_status                text        NOT NULL,
  handoff_kind                     text        NOT NULL DEFAULT 'ecc',
  requested_by_user_id             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  declined_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at                     timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_at                      timestamptz NULL,
  declined_at                      timestamptz NULL,
  revoked_at                       timestamptz NULL,
  connection_note                  text        NULL,
  created_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT account_handoff_connections_account_pair_distinct_chk
    CHECK (requesting_account_owner_user_id <> recipient_account_owner_user_id),

  CONSTRAINT account_handoff_connections_status_valid_chk
    CHECK (connection_status IN ('pending', 'active', 'declined', 'revoked')),

  CONSTRAINT account_handoff_connections_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc')),

  CONSTRAINT account_handoff_connections_approved_state_chk
    CHECK (
      (connection_status <> 'active' OR approved_at IS NOT NULL)
      AND (connection_status = 'active' OR approved_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_declined_state_chk
    CHECK (
      (connection_status <> 'declined' OR declined_at IS NOT NULL)
      AND (connection_status = 'declined' OR declined_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_revoked_state_chk
    CHECK (
      (connection_status <> 'revoked' OR revoked_at IS NOT NULL)
      AND (connection_status = 'revoked' OR revoked_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_approved_actor_consistency_chk
    CHECK (approved_by_user_id IS NULL OR approved_at IS NOT NULL),

  CONSTRAINT account_handoff_connections_declined_actor_consistency_chk
    CHECK (declined_by_user_id IS NULL OR declined_at IS NOT NULL),

  CONSTRAINT account_handoff_connections_revoked_actor_consistency_chk
    CHECK (revoked_by_user_id IS NULL OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS account_handoff_connections_requesting_account_idx
  ON public.account_handoff_connections (requesting_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_recipient_account_idx
  ON public.account_handoff_connections (recipient_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_status_idx
  ON public.account_handoff_connections (connection_status, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_handoff_kind_idx
  ON public.account_handoff_connections (handoff_kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_handoff_connections_live_pair_uidx
  ON public.account_handoff_connections (
    LEAST(requesting_account_owner_user_id, recipient_account_owner_user_id),
    GREATEST(requesting_account_owner_user_id, recipient_account_owner_user_id),
    handoff_kind
  )
  WHERE connection_status IN ('pending', 'active');

DROP TRIGGER IF EXISTS account_handoff_connections_set_updated_at
  ON public.account_handoff_connections;

CREATE TRIGGER account_handoff_connections_set_updated_at
BEFORE UPDATE ON public.account_handoff_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_handoff_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_handoff_connections_select_account_scope ON public.account_handoff_connections;
DROP POLICY IF EXISTS account_handoff_connections_insert_requesting_admin_owner_scope ON public.account_handoff_connections;
DROP POLICY IF EXISTS account_handoff_connections_update_relevant_admin_owner_scope ON public.account_handoff_connections;

CREATE POLICY account_handoff_connections_select_account_scope
ON public.account_handoff_connections
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
);

CREATE POLICY account_handoff_connections_insert_requesting_admin_owner_scope
ON public.account_handoff_connections
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND requesting_account_owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_handoff_connections.requesting_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_handoff_connections.requesting_account_owner_user_id
      )
  )
);

CREATE POLICY account_handoff_connections_update_relevant_admin_owner_scope
ON public.account_handoff_connections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = public.current_internal_account_owner_id()
      AND (
        actor.role = 'admin'
        OR actor.user_id = public.current_internal_account_owner_id()
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = public.current_internal_account_owner_id()
      AND (
        actor.role = 'admin'
        OR actor.user_id = public.current_internal_account_owner_id()
      )
  )
);


-- ---------------------------------------------------------------------------
-- 20260531223000_workflow_handoff_request_grants_foundation.sql
-- ---------------------------------------------------------------------------
-- Compliance Matters: workflow handoff request grants foundation
-- Purpose: request-scoped recipient account access grants for future connected handoff response lanes.
-- Non-goals: no recipient queue, no send enablement, no jobs/service_case/job_event exposure.


CREATE TABLE IF NOT EXISTS public.workflow_handoff_request_grants (
  id                               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installer_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_handoff_connection_id    uuid        NOT NULL REFERENCES public.account_handoff_connections(id) ON DELETE RESTRICT,
  workflow_handoff_request_id      uuid        NOT NULL REFERENCES public.workflow_handoff_requests(id) ON DELETE CASCADE,
  authorized_handoff_recipient_id  uuid        NULL REFERENCES public.authorized_handoff_recipients(id) ON DELETE SET NULL,
  handoff_kind                     text        NOT NULL DEFAULT 'ecc',
  grant_status                     text        NOT NULL DEFAULT 'active',
  shared_scope                     text        NOT NULL DEFAULT 'handoff_request_only',
  granted_by_user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  revoked_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at                       timestamptz NULL,
  revoke_reason                    text        NULL,
  created_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT workflow_handoff_request_grants_account_pair_distinct_chk
    CHECK (installer_account_owner_user_id <> recipient_account_owner_user_id),

  CONSTRAINT workflow_handoff_request_grants_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc')),

  CONSTRAINT workflow_handoff_request_grants_status_valid_chk
    CHECK (grant_status IN ('active', 'revoked')),

  CONSTRAINT workflow_handoff_request_grants_shared_scope_valid_chk
    CHECK (shared_scope IN ('handoff_request_only')),

  CONSTRAINT workflow_handoff_request_grants_revoked_state_chk
    CHECK (
      (grant_status <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL))
      AND (grant_status = 'revoked' OR (revoked_at IS NULL AND revoked_by_user_id IS NULL))
    )
);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_installer_account_idx
  ON public.workflow_handoff_request_grants (installer_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_recipient_account_idx
  ON public.workflow_handoff_request_grants (recipient_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_request_idx
  ON public.workflow_handoff_request_grants (workflow_handoff_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_connection_idx
  ON public.workflow_handoff_request_grants (account_handoff_connection_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_handoff_request_grants_active_request_recipient_uidx
  ON public.workflow_handoff_request_grants (workflow_handoff_request_id, recipient_account_owner_user_id)
  WHERE grant_status = 'active';

DROP TRIGGER IF EXISTS workflow_handoff_request_grants_set_updated_at
  ON public.workflow_handoff_request_grants;

CREATE TRIGGER workflow_handoff_request_grants_set_updated_at
BEFORE UPDATE ON public.workflow_handoff_request_grants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_grant_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  handoff_request_row record;
  connection_row record;
  authorized_recipient_row record;
BEGIN
  SELECT
    request.id,
    request.installer_account_owner_user_id,
    request.authorized_handoff_recipient_id,
    request.handoff_kind
  INTO handoff_request_row
  FROM public.workflow_handoff_requests request
  WHERE request.id = NEW.workflow_handoff_request_id;

  IF handoff_request_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants workflow_handoff_request_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF handoff_request_row.installer_account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants handoff request installer/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF handoff_request_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants handoff request kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    connection.id,
    connection.requesting_account_owner_user_id,
    connection.recipient_account_owner_user_id,
    connection.handoff_kind,
    connection.connection_status
  INTO connection_row
  FROM public.account_handoff_connections connection
  WHERE connection.id = NEW.account_handoff_connection_id;

  IF connection_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants account_handoff_connection_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF connection_row.requesting_account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants installer account mismatch for account_handoff_connection_id'
      USING ERRCODE = '23514';
  END IF;

  IF connection_row.recipient_account_owner_user_id IS DISTINCT FROM NEW.recipient_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants recipient account mismatch for account_handoff_connection_id'
      USING ERRCODE = '23514';
  END IF;

  IF connection_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants connection handoff kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.grant_status = 'active' AND connection_row.connection_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants active grant requires active account_handoff_connection'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.authorized_handoff_recipient_id IS NOT NULL THEN
    SELECT
      recipient.id,
      recipient.account_owner_user_id,
      recipient.handoff_kind
    INTO authorized_recipient_row
    FROM public.authorized_handoff_recipients recipient
    WHERE recipient.id = NEW.authorized_handoff_recipient_id;

    IF authorized_recipient_row.id IS NULL THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized_handoff_recipient_id not found'
        USING ERRCODE = '23503';
    END IF;

    IF authorized_recipient_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF authorized_recipient_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient handoff kind mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF handoff_request_row.authorized_handoff_recipient_id IS DISTINCT FROM NEW.authorized_handoff_recipient_id THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient must match handoff request snapshot'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_handoff_request_grants_assert_scope
  ON public.workflow_handoff_request_grants;

CREATE TRIGGER workflow_handoff_request_grants_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_handoff_request_grants
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_handoff_request_grant_scope();

ALTER TABLE public.workflow_handoff_request_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_handoff_request_grants_select_installer_account_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_select_recipient_account_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_insert_installer_admin_owner_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope ON public.workflow_handoff_request_grants;

CREATE POLICY workflow_handoff_request_grants_select_installer_account_scope
ON public.workflow_handoff_request_grants
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_request_grants_select_recipient_account_scope
ON public.workflow_handoff_request_grants
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND recipient_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_request_grants_insert_installer_admin_owner_scope
ON public.workflow_handoff_request_grants
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND granted_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
);

CREATE POLICY workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope
ON public.workflow_handoff_request_grants
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND grant_status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND grant_status = 'revoked'
  AND revoked_by_user_id = auth.uid()
  AND revoked_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
);


COMMIT;
