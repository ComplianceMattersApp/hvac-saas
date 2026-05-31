-- Compliance Matters: workflow presets slice B schema foundation
-- Purpose: add additive workflow preset/instance/milestone/job-link schema for
-- guided operational planning without changing jobs/service_cases/job_events
-- source-of-truth authority.

BEGIN;

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

COMMIT;