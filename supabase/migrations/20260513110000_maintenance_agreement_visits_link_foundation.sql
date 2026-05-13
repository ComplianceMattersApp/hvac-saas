-- Compliance Matters: maintenance agreement visits linkage foundation
-- Purpose: establish account-scoped agreement-to-job linkage records for
-- future visit-balance projection without changing job creation/runtime flow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_agreement_visits (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  agreement_id                  uuid        NOT NULL REFERENCES public.maintenance_agreements(id) ON DELETE RESTRICT,
  job_id                        uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  link_source                   text        NOT NULL DEFAULT 'manual',
  count_status                  text        NOT NULL DEFAULT 'linked',
  counts_toward_visit_balance   boolean     NOT NULL DEFAULT false,
  counted_at                    timestamptz NULL,
  counted_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at                   timestamptz NULL,
  reversed_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reversal_reason               text        NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT maintenance_agreement_visits_unique_agreement_job
    UNIQUE (agreement_id, job_id),

  CONSTRAINT maintenance_agreement_visits_link_source_valid_chk
    CHECK (link_source IN ('service_plan_prefill', 'manual', 'system_future')),

  CONSTRAINT maintenance_agreement_visits_count_status_valid_chk
    CHECK (count_status IN ('linked', 'eligible', 'counted', 'excluded', 'reversed')),

  CONSTRAINT maintenance_agreement_visits_reversal_reason_required_chk
    CHECK (
      reversed_at IS NULL
      OR length(btrim(coalesce(reversal_reason, ''))) > 0
    ),

  CONSTRAINT maintenance_agreement_visits_reversed_state_requires_reversed_at_chk
    CHECK (
      count_status <> 'reversed'
      OR reversed_at IS NOT NULL
    ),

  CONSTRAINT maintenance_agreement_visits_counted_requires_balance_flag_chk
    CHECK (
      count_status <> 'counted'
      OR counts_toward_visit_balance = true
    )
);

CREATE INDEX IF NOT EXISTS maintenance_agreement_visits_account_owner_idx
  ON public.maintenance_agreement_visits (account_owner_user_id);

CREATE INDEX IF NOT EXISTS maintenance_agreement_visits_agreement_idx
  ON public.maintenance_agreement_visits (agreement_id);

CREATE INDEX IF NOT EXISTS maintenance_agreement_visits_job_idx
  ON public.maintenance_agreement_visits (job_id);

CREATE INDEX IF NOT EXISTS maintenance_agreement_visits_count_status_idx
  ON public.maintenance_agreement_visits (count_status);

DROP TRIGGER IF EXISTS maintenance_agreement_visits_set_updated_at
  ON public.maintenance_agreement_visits;

CREATE TRIGGER maintenance_agreement_visits_set_updated_at
BEFORE UPDATE ON public.maintenance_agreement_visits
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.maintenance_agreement_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_agreement_visits_select_account_scope
  ON public.maintenance_agreement_visits;
DROP POLICY IF EXISTS maintenance_agreement_visits_insert_account_scope
  ON public.maintenance_agreement_visits;
DROP POLICY IF EXISTS maintenance_agreement_visits_update_account_scope
  ON public.maintenance_agreement_visits;

CREATE POLICY maintenance_agreement_visits_select_account_scope
ON public.maintenance_agreement_visits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_visits_insert_account_scope
ON public.maintenance_agreement_visits
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements agreement
    WHERE agreement.id = maintenance_agreement_visits.agreement_id
      AND agreement.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs job
    JOIN public.customers customer
      ON customer.id = job.customer_id
    WHERE job.id = maintenance_agreement_visits.job_id
      AND customer.owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND (
    counted_by_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users counted_actor
      WHERE counted_actor.user_id = maintenance_agreement_visits.counted_by_user_id
        AND counted_actor.is_active = true
        AND counted_actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
    )
  )
  AND (
    reversed_by_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users reversed_actor
      WHERE reversed_actor.user_id = maintenance_agreement_visits.reversed_by_user_id
        AND reversed_actor.is_active = true
        AND reversed_actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
    )
  )
);

CREATE POLICY maintenance_agreement_visits_update_account_scope
ON public.maintenance_agreement_visits
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements agreement
    WHERE agreement.id = maintenance_agreement_visits.agreement_id
      AND agreement.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs job
    JOIN public.customers customer
      ON customer.id = job.customer_id
    WHERE job.id = maintenance_agreement_visits.job_id
      AND customer.owner_user_id = maintenance_agreement_visits.account_owner_user_id
  )
  AND (
    counted_by_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users counted_actor
      WHERE counted_actor.user_id = maintenance_agreement_visits.counted_by_user_id
        AND counted_actor.is_active = true
        AND counted_actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
    )
  )
  AND (
    reversed_by_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users reversed_actor
      WHERE reversed_actor.user_id = maintenance_agreement_visits.reversed_by_user_id
        AND reversed_actor.is_active = true
        AND reversed_actor.account_owner_user_id = maintenance_agreement_visits.account_owner_user_id
    )
  )
);

-- No DELETE policy in this foundation slice.

COMMIT;
