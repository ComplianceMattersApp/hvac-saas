-- 9A-17A: maintenance_agreement_template_checklist_items
-- Purpose: add ordered checklist item definitions to service plan templates
-- (and directly to maintenance agreements for non-template plans).
-- No existing tables altered. Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_agreement_template_checklist_items (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  template_id               uuid        NULL REFERENCES public.maintenance_agreement_templates(id) ON DELETE CASCADE,
  agreement_id              uuid        NULL REFERENCES public.maintenance_agreements(id) ON DELETE CASCADE,

  item_label                text        NOT NULL,
  default_guidance          text        NULL,
  sort_order                integer     NOT NULL DEFAULT 0,

  created_by_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_agreement_template_checklist_items_label_not_blank_chk
    CHECK (length(btrim(item_label)) > 0),

  CONSTRAINT maintenance_agreement_template_checklist_items_one_parent_chk
    CHECK (
      (template_id IS NOT NULL AND agreement_id IS NULL)
      OR
      (template_id IS NULL AND agreement_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS maintenance_agreement_template_checklist_items_template_idx
  ON public.maintenance_agreement_template_checklist_items (template_id, sort_order)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_agreement_template_checklist_items_agreement_idx
  ON public.maintenance_agreement_template_checklist_items (agreement_id, sort_order)
  WHERE agreement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_agreement_template_checklist_items_owner_idx
  ON public.maintenance_agreement_template_checklist_items (account_owner_user_id, created_at);

ALTER TABLE public.maintenance_agreement_template_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_agreement_template_checklist_items_select_account_scope
  ON public.maintenance_agreement_template_checklist_items;
DROP POLICY IF EXISTS maintenance_agreement_template_checklist_items_insert_account_scope
  ON public.maintenance_agreement_template_checklist_items;
DROP POLICY IF EXISTS maintenance_agreement_template_checklist_items_update_account_scope
  ON public.maintenance_agreement_template_checklist_items;

CREATE POLICY maintenance_agreement_template_checklist_items_select_account_scope
ON public.maintenance_agreement_template_checklist_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_template_checklist_items.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_template_checklist_items_insert_account_scope
ON public.maintenance_agreement_template_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_template_checklist_items.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_template_checklist_items_update_account_scope
ON public.maintenance_agreement_template_checklist_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_template_checklist_items.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_template_checklist_items.account_owner_user_id
  )
);

-- No DELETE policy in V1 (consistent with maintenance_agreement_templates posture).
-- Template edit uses delete-and-reinsert via admin client which bypasses RLS.

COMMIT;
