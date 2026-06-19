-- Compliance Matters: Checklist Foundation V1B
-- Purpose: add dormant reusable checklist template and job checklist run/result
-- schema without changing Pricebook, Work Items, invoices, payments, recurring
-- agreements, job events, attachments, closeout, queues, or runtime behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_name text NOT NULL,
  template_description text NULL,
  product_mode text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,

  CONSTRAINT checklist_templates_name_not_blank_chk
    CHECK (length(btrim(template_name)) > 0),
  CONSTRAINT checklist_templates_product_mode_valid_chk
    CHECK (
      product_mode IS NULL
      OR product_mode IN ('hybrid', 'hvac_service', 'ecc_hers', 'cleaning_services')
    ),
  CONSTRAINT checklist_templates_sort_order_nonnegative_chk
    CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.checklist_templates IS
  'Account-owned reusable checklist definitions. Dormant V1B foundation; not Pricebook, invoice, payment, recurring-service, inspection, or job-event truth.';

CREATE TABLE IF NOT EXISTS public.checklist_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  section_label text NOT NULL,
  section_description text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,

  CONSTRAINT checklist_template_sections_label_not_blank_chk
    CHECK (length(btrim(section_label)) > 0),
  CONSTRAINT checklist_template_sections_sort_order_nonnegative_chk
    CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.checklist_template_sections IS
  'Optional grouping rows for checklist templates. Sections organize checklist display only and do not create billing, job work item, or recurring-visit truth.';

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  section_id uuid NULL REFERENCES public.checklist_template_sections(id) ON DELETE SET NULL,
  item_label text NOT NULL,
  help_text text NULL,
  response_type text NOT NULL DEFAULT 'checkbox',
  is_required boolean NOT NULL DEFAULT false,
  allow_not_applicable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,

  CONSTRAINT checklist_template_items_label_not_blank_chk
    CHECK (length(btrim(item_label)) > 0),
  CONSTRAINT checklist_template_items_response_type_valid_chk
    CHECK (
      response_type IN (
        'checkbox',
        'yes_no',
        'pass_fail',
        'note_required',
        'photo_required_placeholder'
      )
    ),
  CONSTRAINT checklist_template_items_sort_order_nonnegative_chk
    CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.checklist_template_items IS
  'Reusable checklist task/proof requirements. photo_required_placeholder is model-only in V1B and does not add storage or upload behavior.';

CREATE TABLE IF NOT EXISTS public.job_checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  template_id uuid NULL REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  template_name_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  started_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,

  CONSTRAINT job_checklist_runs_template_name_snapshot_not_blank_chk
    CHECK (length(btrim(template_name_snapshot)) > 0),
  CONSTRAINT job_checklist_runs_status_valid_chk
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'issue_found'))
);

COMMENT ON TABLE public.job_checklist_runs IS
  'Job-attached checklist instances. Runs preserve checklist meaning for one job and do not mutate billing, invoice, payment, recurring-service, or closeout truth.';

CREATE TABLE IF NOT EXISTS public.job_checklist_item_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES public.job_checklist_runs(id) ON DELETE CASCADE,
  template_item_id uuid NULL REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  item_label_snapshot text NOT NULL,
  section_label_snapshot text NULL,
  response_type_snapshot text NOT NULL,
  result_value text NULL,
  note text NULL,
  issue_found boolean NOT NULL DEFAULT false,
  not_applicable boolean NOT NULL DEFAULT false,
  completed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT job_checklist_item_results_label_snapshot_not_blank_chk
    CHECK (length(btrim(item_label_snapshot)) > 0),
  CONSTRAINT job_checklist_item_results_response_type_valid_chk
    CHECK (
      response_type_snapshot IN (
        'checkbox',
        'yes_no',
        'pass_fail',
        'note_required',
        'photo_required_placeholder'
      )
    ),
  CONSTRAINT job_checklist_item_results_result_value_valid_chk
    CHECK (
      result_value IS NULL
      OR result_value IN ('done', 'yes', 'no', 'pass', 'fail', 'issue')
    ),
  CONSTRAINT job_checklist_item_results_issue_not_applicable_exclusive_chk
    CHECK (NOT (issue_found AND not_applicable))
);

COMMENT ON TABLE public.job_checklist_item_results IS
  'Per-item completion evidence for a job checklist run. Results are checklist evidence only and do not own file/photo, invoice, payment, recurring-service, or timeline truth.';

CREATE INDEX IF NOT EXISTS checklist_templates_owner_active_sort_idx
  ON public.checklist_templates (account_owner_user_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS checklist_template_sections_template_sort_idx
  ON public.checklist_template_sections (template_id, sort_order);

CREATE INDEX IF NOT EXISTS checklist_template_items_template_section_sort_idx
  ON public.checklist_template_items (template_id, section_id, sort_order);

CREATE INDEX IF NOT EXISTS job_checklist_runs_owner_job_idx
  ON public.job_checklist_runs (account_owner_user_id, job_id);

CREATE UNIQUE INDEX IF NOT EXISTS job_checklist_runs_one_active_per_job_idx
  ON public.job_checklist_runs (account_owner_user_id, job_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS job_checklist_runs_owner_status_idx
  ON public.job_checklist_runs (account_owner_user_id, status);

CREATE INDEX IF NOT EXISTS job_checklist_item_results_run_idx
  ON public.job_checklist_item_results (run_id);

CREATE INDEX IF NOT EXISTS job_checklist_item_results_owner_issue_idx
  ON public.job_checklist_item_results (account_owner_user_id, issue_found);

CREATE UNIQUE INDEX IF NOT EXISTS job_checklist_item_results_one_template_item_per_run_idx
  ON public.job_checklist_item_results (run_id, template_item_id)
  WHERE template_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS checklist_templates_set_updated_at ON public.checklist_templates;
CREATE TRIGGER checklist_templates_set_updated_at
BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS checklist_template_sections_set_updated_at ON public.checklist_template_sections;
CREATE TRIGGER checklist_template_sections_set_updated_at
BEFORE UPDATE ON public.checklist_template_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS checklist_template_items_set_updated_at ON public.checklist_template_items;
CREATE TRIGGER checklist_template_items_set_updated_at
BEFORE UPDATE ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS job_checklist_runs_set_updated_at ON public.job_checklist_runs;
CREATE TRIGGER job_checklist_runs_set_updated_at
BEFORE UPDATE ON public.job_checklist_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS job_checklist_item_results_set_updated_at ON public.job_checklist_item_results;
CREATE TRIGGER job_checklist_item_results_set_updated_at
BEFORE UPDATE ON public.job_checklist_item_results
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_checklist_template_section_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template_owner_id uuid;
BEGIN
  SELECT template.account_owner_user_id
    INTO v_template_owner_id
  FROM public.checklist_templates template
  WHERE template.id = NEW.template_id;

  IF v_template_owner_id IS NULL THEN
    RAISE EXCEPTION 'checklist template section template not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM v_template_owner_id THEN
    RAISE EXCEPTION 'checklist template section account scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_checklist_template_item_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template_owner_id uuid;
  v_section record;
BEGIN
  SELECT template.account_owner_user_id
    INTO v_template_owner_id
  FROM public.checklist_templates template
  WHERE template.id = NEW.template_id;

  IF v_template_owner_id IS NULL THEN
    RAISE EXCEPTION 'checklist template item template not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM v_template_owner_id THEN
    RAISE EXCEPTION 'checklist template item account scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.section_id IS NOT NULL THEN
    SELECT section.account_owner_user_id, section.template_id
      INTO v_section
    FROM public.checklist_template_sections section
    WHERE section.id = NEW.section_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'checklist template item section not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_section.account_owner_user_id IS DISTINCT FROM NEW.account_owner_user_id
      OR v_section.template_id IS DISTINCT FROM NEW.template_id THEN
      RAISE EXCEPTION 'checklist template item section account/template scope mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_job_checklist_run_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_owner_id uuid;
  v_template_owner_id uuid;
BEGIN
  SELECT job.account_owner_user_id
    INTO v_job_owner_id
  FROM public.jobs job
  WHERE job.id = NEW.job_id;

  IF v_job_owner_id IS NULL THEN
    RAISE EXCEPTION 'job checklist run job not found or missing account owner'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM v_job_owner_id THEN
    RAISE EXCEPTION 'job checklist run account_owner_user_id must match jobs.account_owner_user_id'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.template_id IS NOT NULL THEN
    SELECT template.account_owner_user_id
      INTO v_template_owner_id
    FROM public.checklist_templates template
    WHERE template.id = NEW.template_id;

    IF v_template_owner_id IS NULL THEN
      RAISE EXCEPTION 'job checklist run template not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM v_template_owner_id THEN
      RAISE EXCEPTION 'job checklist run template account scope mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_job_checklist_item_result_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run record;
  v_template_item_owner_id uuid;
BEGIN
  SELECT run.account_owner_user_id
    INTO v_run
  FROM public.job_checklist_runs run
  WHERE run.id = NEW.run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job checklist item result run not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM v_run.account_owner_user_id THEN
    RAISE EXCEPTION 'job checklist item result account scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.template_item_id IS NOT NULL THEN
    SELECT item.account_owner_user_id
      INTO v_template_item_owner_id
    FROM public.checklist_template_items item
    WHERE item.id = NEW.template_item_id;

    IF v_template_item_owner_id IS NULL THEN
      RAISE EXCEPTION 'job checklist item result template item not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM v_template_item_owner_id THEN
      RAISE EXCEPTION 'job checklist item result template item account scope mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checklist_template_section_account_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_checklist_template_item_account_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_job_checklist_run_account_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_job_checklist_item_result_account_scope() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_checklist_template_section_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_checklist_template_item_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_job_checklist_run_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_job_checklist_item_result_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_checklist_template_section_account_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_checklist_template_item_account_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_job_checklist_run_account_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_job_checklist_item_result_account_scope() TO service_role;

DROP TRIGGER IF EXISTS checklist_template_sections_assert_account_scope ON public.checklist_template_sections;
CREATE TRIGGER checklist_template_sections_assert_account_scope
BEFORE INSERT OR UPDATE ON public.checklist_template_sections
FOR EACH ROW
EXECUTE FUNCTION public.assert_checklist_template_section_account_scope();

DROP TRIGGER IF EXISTS checklist_template_items_assert_account_scope ON public.checklist_template_items;
CREATE TRIGGER checklist_template_items_assert_account_scope
BEFORE INSERT OR UPDATE ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.assert_checklist_template_item_account_scope();

DROP TRIGGER IF EXISTS job_checklist_runs_assert_account_scope ON public.job_checklist_runs;
CREATE TRIGGER job_checklist_runs_assert_account_scope
BEFORE INSERT OR UPDATE ON public.job_checklist_runs
FOR EACH ROW
EXECUTE FUNCTION public.assert_job_checklist_run_account_scope();

DROP TRIGGER IF EXISTS job_checklist_item_results_assert_account_scope ON public.job_checklist_item_results;
CREATE TRIGGER job_checklist_item_results_assert_account_scope
BEFORE INSERT OR UPDATE ON public.job_checklist_item_results
FOR EACH ROW
EXECUTE FUNCTION public.assert_job_checklist_item_result_account_scope();

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checklist_item_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_select_account_scope ON public.checklist_templates;
DROP POLICY IF EXISTS checklist_templates_insert_account_scope ON public.checklist_templates;
DROP POLICY IF EXISTS checklist_templates_update_account_scope ON public.checklist_templates;
CREATE POLICY checklist_templates_select_account_scope
ON public.checklist_templates
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_templates_insert_account_scope
ON public.checklist_templates
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_templates_update_account_scope
ON public.checklist_templates
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS checklist_template_sections_select_account_scope ON public.checklist_template_sections;
DROP POLICY IF EXISTS checklist_template_sections_insert_account_scope ON public.checklist_template_sections;
DROP POLICY IF EXISTS checklist_template_sections_update_account_scope ON public.checklist_template_sections;
CREATE POLICY checklist_template_sections_select_account_scope
ON public.checklist_template_sections
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_template_sections_insert_account_scope
ON public.checklist_template_sections
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_template_sections_update_account_scope
ON public.checklist_template_sections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS checklist_template_items_select_account_scope ON public.checklist_template_items;
DROP POLICY IF EXISTS checklist_template_items_insert_account_scope ON public.checklist_template_items;
DROP POLICY IF EXISTS checklist_template_items_update_account_scope ON public.checklist_template_items;
CREATE POLICY checklist_template_items_select_account_scope
ON public.checklist_template_items
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_template_items_insert_account_scope
ON public.checklist_template_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY checklist_template_items_update_account_scope
ON public.checklist_template_items
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS job_checklist_runs_select_account_scope ON public.job_checklist_runs;
DROP POLICY IF EXISTS job_checklist_runs_insert_account_scope ON public.job_checklist_runs;
DROP POLICY IF EXISTS job_checklist_runs_update_account_scope ON public.job_checklist_runs;
CREATE POLICY job_checklist_runs_select_account_scope
ON public.job_checklist_runs
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY job_checklist_runs_insert_account_scope
ON public.job_checklist_runs
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY job_checklist_runs_update_account_scope
ON public.job_checklist_runs
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS job_checklist_item_results_select_account_scope ON public.job_checklist_item_results;
DROP POLICY IF EXISTS job_checklist_item_results_insert_account_scope ON public.job_checklist_item_results;
DROP POLICY IF EXISTS job_checklist_item_results_update_account_scope ON public.job_checklist_item_results;
CREATE POLICY job_checklist_item_results_select_account_scope
ON public.job_checklist_item_results
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY job_checklist_item_results_insert_account_scope
ON public.job_checklist_item_results
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);
CREATE POLICY job_checklist_item_results_update_account_scope
ON public.job_checklist_item_results
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;
