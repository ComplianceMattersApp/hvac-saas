-- Compliance Matters: notifications internal-awareness write contract
-- Purpose: let authenticated internal or contractor actors create
-- account-owner-scoped internal in-app notifications through one explicit,
-- validated DB path without generic service-role fallback.

BEGIN;

CREATE OR REPLACE FUNCTION public.insert_internal_notification(
  p_job_id uuid,
  p_submission_id uuid,
  p_account_owner_user_id uuid,
  p_actor_user_id uuid,
  p_notification_type text,
  p_subject text,
  p_body text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id uuid;
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for internal notifications'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_user_id IS NULL OR auth.uid() <> p_actor_user_id THEN
    RAISE EXCEPTION 'Actor must match authenticated user for internal notifications'
      USING ERRCODE = '42501';
  END IF;

  IF p_account_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing account owner for internal notification'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(BTRIM(p_notification_type), '') = '' THEN
    RAISE EXCEPTION 'Missing notification_type for internal notification'
      USING ERRCODE = '22023';
  END IF;

  IF (p_job_id IS NULL AND p_submission_id IS NULL)
     OR (p_job_id IS NOT NULL AND p_submission_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Internal notification requires exactly one scope reference'
      USING ERRCODE = '22023';
  END IF;

  IF p_job_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = p_job_id
        AND j.deleted_at IS NULL
        AND public.job_matches_account_owner(
          j.contractor_id,
          j.customer_id,
          j.location_id,
          j.service_case_id,
          p_account_owner_user_id
        )
        AND (
          EXISTS (
            SELECT 1
            FROM public.internal_users iu
            WHERE iu.user_id = p_actor_user_id
              AND iu.is_active = true
              AND iu.account_owner_user_id = p_account_owner_user_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.contractor_users cu
            WHERE cu.user_id = p_actor_user_id
              AND cu.contractor_id = j.contractor_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Not authorized to create internal job notification'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_submission_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.contractor_intake_submissions cis
      WHERE cis.id = p_submission_id
        AND cis.account_owner_user_id = p_account_owner_user_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.internal_users iu
            WHERE iu.user_id = p_actor_user_id
              AND iu.is_active = true
              AND iu.account_owner_user_id = p_account_owner_user_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.contractor_users cu
            WHERE cu.user_id = p_actor_user_id
              AND cu.contractor_id = cis.contractor_id
              AND cis.submitted_by_user_id = p_actor_user_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Not authorized to create internal proposal notification'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_payload := v_payload || jsonb_build_object('actor_user_id', p_actor_user_id);

  IF p_submission_id IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('contractor_intake_submission_id', p_submission_id);
  END IF;

  INSERT INTO public.notifications (
    job_id,
    account_owner_user_id,
    recipient_type,
    recipient_ref,
    channel,
    notification_type,
    subject,
    body,
    payload,
    status
  ) VALUES (
    p_job_id,
    p_account_owner_user_id,
    'internal',
    NULL,
    'in_app',
    BTRIM(p_notification_type),
    NULLIF(BTRIM(p_subject), ''),
    NULLIF(BTRIM(p_body), ''),
    v_payload,
    'queued'
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_internal_notification(uuid, uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_internal_notification(uuid, uuid, uuid, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_internal_notification(uuid, uuid, uuid, uuid, text, text, text, jsonb) TO service_role;

COMMIT;