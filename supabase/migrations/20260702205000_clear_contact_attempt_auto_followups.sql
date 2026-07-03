-- Clear legacy contact-attempt cadence reminders.
--
-- Follow Ups should represent user-authored reminders from ops details, not
-- automatic dates created when logging a call/text attempt. This only clears
-- rows that match the old auto-rule shape:
--   - no reminder note
--   - owner was auto-set to customer
--   - follow_up_date matches latest customer_attempt date + cadence
--     (first 3 attempts: +1 day, then +3 days)

BEGIN;

WITH contact_attempt_rollup AS (
  SELECT
    job_id,
    count(*)::integer AS attempt_count,
    max(created_at) AS latest_attempt_at
  FROM public.job_events
  WHERE event_type = 'customer_attempt'
  GROUP BY job_id
),
legacy_auto_followups AS (
  SELECT j.id
  FROM public.jobs j
  JOIN contact_attempt_rollup attempts
    ON attempts.job_id = j.id
  WHERE j.follow_up_date IS NOT NULL
    AND nullif(btrim(coalesce(j.next_action_note, '')), '') IS NULL
    AND lower(btrim(coalesce(j.action_required_by, ''))) = 'customer'
    AND j.follow_up_date = (
      ((attempts.latest_attempt_at AT TIME ZONE 'America/Los_Angeles')::date)
      + CASE WHEN attempts.attempt_count <= 3 THEN 1 ELSE 3 END
    )
)
UPDATE public.jobs j
SET
  follow_up_date = NULL,
  action_required_by = NULL
FROM legacy_auto_followups legacy
WHERE j.id = legacy.id;

COMMIT;
