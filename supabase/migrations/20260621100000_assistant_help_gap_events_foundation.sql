-- Compliance Matters: Help Gap Logging G2 additive schema foundation.
-- Dormant product/support intelligence storage for future Ask Compliance Matters help-gap persistence.
-- This migration does not add assistant persistence wiring, support-case creation, Support Console
-- behavior, provider calls, or runtime behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_help_gap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  internal_user_id uuid NULL REFERENCES public.internal_users(user_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  assistant_mode text NOT NULL,
  help_gap_category text NOT NULL,
  route_pathname text NOT NULL,
  page_family text NOT NULL,
  role_category text NOT NULL,
  role_label text NOT NULL,
  product_mode text NOT NULL DEFAULT 'unknown',
  can_view_financial_register boolean NOT NULL DEFAULT false,
  can_collect_field_payment boolean NOT NULL DEFAULT false,
  question_text_sanitized text NULL,
  question_summary text NULL,
  answer_key text NOT NULL,
  feedback_value text NULL,
  setup_step_key text NULL,
  training_mission_key text NULL,
  review_status text NOT NULL DEFAULT 'new',
  reviewed_at timestamptz NULL,
  reviewed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_support_case_id uuid NULL REFERENCES public.support_cases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_help_gap_events_event_type_chk CHECK (
    event_type IN ('unknown_answer', 'not_helpful', 'still_need_help')
  ),
  CONSTRAINT assistant_help_gap_events_assistant_mode_chk CHECK (
    assistant_mode IN ('help_chat', 'setup_coach')
  ),
  CONSTRAINT assistant_help_gap_events_help_gap_category_chk CHECK (
    help_gap_category IN (
      'guidance_training',
      'setup_data_issue',
      'ux_confusion',
      'possible_product_bug',
      'future_feature_request',
      'missing_help_article',
      'unknown'
    )
  ),
  CONSTRAINT assistant_help_gap_events_page_family_chk CHECK (
    page_family IN ('launch_room', 'training_room', 'operations', 'today', 'admin', 'other')
  ),
  CONSTRAINT assistant_help_gap_events_role_category_chk CHECK (
    role_category IN ('owner', 'admin', 'office', 'tech', 'billing', 'unknown')
  ),
  CONSTRAINT assistant_help_gap_events_product_mode_chk CHECK (
    product_mode IN ('hybrid', 'hvac_service', 'ecc_hers', 'cleaning_services', 'unknown')
  ),
  CONSTRAINT assistant_help_gap_events_review_status_chk CHECK (
    review_status IN (
      'new',
      'reviewed',
      'converted_to_help_article',
      'linked_to_support_case',
      'dismissed',
      'product_backlog',
      'bug_candidate'
    )
  ),
  CONSTRAINT assistant_help_gap_events_route_pathname_chk CHECK (
    length(btrim(route_pathname)) > 0
    AND route_pathname LIKE '/%'
    AND position('?' in route_pathname) = 0
    AND position('#' in route_pathname) = 0
    AND length(route_pathname) <= 160
  ),
  CONSTRAINT assistant_help_gap_events_question_text_len_chk CHECK (
    question_text_sanitized IS NULL OR length(question_text_sanitized) <= 240
  ),
  CONSTRAINT assistant_help_gap_events_question_summary_len_chk CHECK (
    question_summary IS NULL OR length(question_summary) <= 240
  ),
  CONSTRAINT assistant_help_gap_events_answer_key_chk CHECK (
    length(btrim(answer_key)) > 0 AND length(answer_key) <= 80
  ),
  CONSTRAINT assistant_help_gap_events_feedback_value_chk CHECK (
    feedback_value IS NULL OR feedback_value IN ('not_helpful', 'still_need_help')
  ),
  CONSTRAINT assistant_help_gap_events_setup_step_key_len_chk CHECK (
    setup_step_key IS NULL OR length(setup_step_key) <= 80
  ),
  CONSTRAINT assistant_help_gap_events_training_mission_key_len_chk CHECK (
    training_mission_key IS NULL OR length(training_mission_key) <= 80
  ),
  CONSTRAINT assistant_help_gap_events_review_actor_timestamp_chk CHECK (
    reviewed_by_user_id IS NULL OR reviewed_at IS NOT NULL
  ),
  CONSTRAINT assistant_help_gap_events_linked_support_case_status_chk CHECK (
    linked_support_case_id IS NULL OR review_status = 'linked_to_support_case'
  )
);

COMMENT ON TABLE public.assistant_help_gap_events IS
  'Dormant Ask Compliance Matters help-gap event foundation for future product/support review; no runtime persistence is wired by this migration.';
COMMENT ON COLUMN public.assistant_help_gap_events.account_owner_user_id IS
  'Owning tenant account for account-scoped review and future reporting.';
COMMENT ON COLUMN public.assistant_help_gap_events.internal_user_id IS
  'Internal user who generated the help-gap signal when available; must remain in the same account.';
COMMENT ON COLUMN public.assistant_help_gap_events.event_type IS
  'Help-gap signal type from the local Ask Compliance Matters event contract.';
COMMENT ON COLUMN public.assistant_help_gap_events.assistant_mode IS
  'Assistant surface mode: help chat or setup coach.';
COMMENT ON COLUMN public.assistant_help_gap_events.help_gap_category IS
  'Review category used for product/support triage, not automatic model training.';
COMMENT ON COLUMN public.assistant_help_gap_events.route_pathname IS
  'Sanitized route pathname only; query strings and hashes are intentionally disallowed.';
COMMENT ON COLUMN public.assistant_help_gap_events.can_view_financial_register IS
  'Snapshot of financial visibility capability at event creation time.';
COMMENT ON COLUMN public.assistant_help_gap_events.can_collect_field_payment IS
  'Snapshot of field-payment collection capability at event creation time.';
COMMENT ON COLUMN public.assistant_help_gap_events.question_text_sanitized IS
  'Optional sanitized user question text, capped to short support-review context.';
COMMENT ON COLUMN public.assistant_help_gap_events.question_summary IS
  'Optional short summary for future review workflows.';
COMMENT ON COLUMN public.assistant_help_gap_events.answer_key IS
  'Stable local answer or fallback key; stores category, not answer body.';
COMMENT ON COLUMN public.assistant_help_gap_events.linked_support_case_id IS
  'Optional future link to Support Case V1; this migration does not create or mutate support cases.';
COMMENT ON COLUMN public.assistant_help_gap_events.review_status IS
  'Future review workflow status; rows default to new.';

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_review_status_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_category_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, help_gap_category, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_event_type_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_page_family_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, page_family, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_setup_step_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, setup_step_key, created_at DESC)
  WHERE setup_step_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_help_gap_events_account_training_mission_created_idx
  ON public.assistant_help_gap_events (account_owner_user_id, training_mission_key, created_at DESC)
  WHERE training_mission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_assistant_help_gap_event_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_account_owner_user_id uuid;
BEGIN
  IF NEW.internal_user_id IS NOT NULL THEN
    SELECT iu.account_owner_user_id
      INTO target_account_owner_user_id
    FROM public.internal_users iu
    WHERE iu.user_id = NEW.internal_user_id
      AND iu.is_active = true;

    IF target_account_owner_user_id IS NULL THEN
      RAISE EXCEPTION 'internal_user_id does not reference an active internal account membership';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM target_account_owner_user_id THEN
      RAISE EXCEPTION 'assistant_help_gap_events internal user/account scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assistant_help_gap_events_assert_scope
  ON public.assistant_help_gap_events;
CREATE TRIGGER assistant_help_gap_events_assert_scope
  BEFORE INSERT OR UPDATE ON public.assistant_help_gap_events
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_assistant_help_gap_event_scope();

DROP TRIGGER IF EXISTS assistant_help_gap_events_set_updated_at
  ON public.assistant_help_gap_events;
CREATE TRIGGER assistant_help_gap_events_set_updated_at
  BEFORE UPDATE ON public.assistant_help_gap_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assistant_help_gap_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_help_gap_events_select_account_scope
  ON public.assistant_help_gap_events;
CREATE POLICY assistant_help_gap_events_select_account_scope
  ON public.assistant_help_gap_events
  FOR SELECT
  TO authenticated
  USING (
    public.current_internal_account_owner_id() IS NOT NULL
    AND account_owner_user_id = public.current_internal_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.internal_users actor
      WHERE actor.user_id = auth.uid()
        AND actor.is_active = true
        AND actor.account_owner_user_id = assistant_help_gap_events.account_owner_user_id
    )
  );

DROP POLICY IF EXISTS assistant_help_gap_events_insert_account_scope
  ON public.assistant_help_gap_events;
CREATE POLICY assistant_help_gap_events_insert_account_scope
  ON public.assistant_help_gap_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_internal_account_owner_id() IS NOT NULL
    AND account_owner_user_id = public.current_internal_account_owner_id()
    AND (internal_user_id IS NULL OR internal_user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.internal_users actor
      WHERE actor.user_id = auth.uid()
        AND actor.is_active = true
        AND actor.account_owner_user_id = assistant_help_gap_events.account_owner_user_id
    )
  );

DROP POLICY IF EXISTS assistant_help_gap_events_update_admin_owner_review
  ON public.assistant_help_gap_events;
CREATE POLICY assistant_help_gap_events_update_admin_owner_review
  ON public.assistant_help_gap_events
  FOR UPDATE
  TO authenticated
  USING (
    public.current_internal_account_owner_id() IS NOT NULL
    AND account_owner_user_id = public.current_internal_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.internal_users actor
      WHERE actor.user_id = auth.uid()
        AND actor.is_active = true
        AND actor.account_owner_user_id = assistant_help_gap_events.account_owner_user_id
        AND (actor.role = 'admin' OR actor.user_id = assistant_help_gap_events.account_owner_user_id)
    )
  )
  WITH CHECK (
    public.current_internal_account_owner_id() IS NOT NULL
    AND account_owner_user_id = public.current_internal_account_owner_id()
    AND EXISTS (
      SELECT 1
      FROM public.internal_users actor
      WHERE actor.user_id = auth.uid()
        AND actor.is_active = true
        AND actor.account_owner_user_id = assistant_help_gap_events.account_owner_user_id
        AND (actor.role = 'admin' OR actor.user_id = assistant_help_gap_events.account_owner_user_id)
    )
  );

COMMIT;
