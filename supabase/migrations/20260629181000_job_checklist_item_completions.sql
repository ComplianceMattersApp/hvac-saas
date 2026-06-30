-- 9A-17A: job_checklist_item_completions
-- Purpose: per-visit snapshot of checklist items, copied at job creation time
-- from maintenance_agreement_template_checklist_items. No existing tables altered.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_checklist_item_completions (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  job_id                    uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  source_item_id            uuid        NULL REFERENCES public.maintenance_agreement_template_checklist_items(id) ON DELETE SET NULL,

  item_label                text        NOT NULL,
  sort_order                integer     NOT NULL DEFAULT 0,

  is_completed              boolean     NOT NULL DEFAULT false,
  notes                     text        NULL,

  completed_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at              timestamptz NULL,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT job_checklist_item_completions_label_not_blank_chk
    CHECK (length(btrim(item_label)) > 0),

  CONSTRAINT job_checklist_item_completions_completion_consistent_chk
    CHECK (
      (is_completed = false AND completed_by_user_id IS NULL AND completed_at IS NULL)
      OR
      (is_completed = true AND completed_by_user_id IS NOT NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS job_checklist_item_completions_job_idx
  ON public.job_checklist_item_completions (job_id, sort_order);

CREATE INDEX IF NOT EXISTS job_checklist_item_completions_owner_idx
  ON public.job_checklist_item_completions (account_owner_user_id, created_at);

DROP TRIGGER IF EXISTS job_checklist_item_completions_set_updated_at
  ON public.job_checklist_item_completions;

CREATE TRIGGER job_checklist_item_completions_set_updated_at
BEFORE UPDATE ON public.job_checklist_item_completions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.job_checklist_item_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_checklist_item_completions_select_account_scope
  ON public.job_checklist_item_completions;
DROP POLICY IF EXISTS job_checklist_item_completions_insert_account_scope
  ON public.job_checklist_item_completions;
DROP POLICY IF EXISTS job_checklist_item_completions_update_account_scope
  ON public.job_checklist_item_completions;

CREATE POLICY job_checklist_item_completions_select_account_scope
ON public.job_checklist_item_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = job_checklist_item_completions.account_owner_user_id
  )
);

CREATE POLICY job_checklist_item_completions_insert_account_scope
ON public.job_checklist_item_completions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = job_checklist_item_completions.account_owner_user_id
  )
);

CREATE POLICY job_checklist_item_completions_update_account_scope
ON public.job_checklist_item_completions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = job_checklist_item_completions.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = job_checklist_item_completions.account_owner_user_id
  )
);

COMMIT;
