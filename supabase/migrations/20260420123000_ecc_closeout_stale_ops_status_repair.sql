-- Compliance Matters: repair stale fully complete ECC jobs stranded at paperwork_required.
-- Scope: one-time data repair only. Do not broaden beyond exact confirmed stale closeout rows.

BEGIN;

WITH repaired_jobs AS (
  UPDATE public.jobs AS j
  SET ops_status = 'closed'
  WHERE j.deleted_at IS NULL
    AND lower(coalesce(j.job_type, '')) = 'ecc'
    AND coalesce(j.field_complete, false) = true
    AND coalesce(j.certs_complete, false) = true
    AND coalesce(j.invoice_complete, false) = true
    AND lower(coalesce(j.ops_status, '')) = 'paperwork_required'
    AND lower(coalesce(j.status, '')) <> 'cancelled'
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.ecc_test_runs AS r
        WHERE r.job_id = j.id
          AND coalesce(r.is_completed, false) = true
          AND (
            r.override_pass = false
            OR (r.override_pass IS NULL AND r.computed_pass = false)
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.job_events AS e
        WHERE e.job_id = j.id
          AND e.event_type = 'failure_resolved_by_correction_review'
      )
    )
  RETURNING j.id
)
INSERT INTO public.job_events (
  job_id,
  event_type,
  message,
  meta,
  user_id
)
SELECT
  r.id,
  'ops_update',
  'ECC closeout stale ops_status repaired',
  jsonb_build_object(
    'source', 'supabase_migration_20260420123000_ecc_closeout_stale_ops_status_repair',
    'repair_kind', 'ecc_closeout_stale_ops_status',
    'changes', jsonb_build_array(
      jsonb_build_object(
        'field', 'ops_status',
        'from', 'paperwork_required',
        'to', 'closed'
      )
    )
  ),
  NULL
FROM repaired_jobs AS r;

COMMIT;