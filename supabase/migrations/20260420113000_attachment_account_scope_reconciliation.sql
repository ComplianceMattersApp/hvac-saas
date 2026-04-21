BEGIN;

DROP POLICY IF EXISTS attachments_internal_full_access ON public.attachments;

CREATE POLICY attachments_internal_all_account_scope
ON public.attachments
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND (
    entity_type <> 'job'
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = attachments.entity_id
        AND j.deleted_at IS NULL
        AND public.job_matches_account_owner(
          j.contractor_id,
          j.customer_id,
          j.location_id,
          j.service_case_id,
          public.current_internal_account_owner_id()
        )
    )
  )
)
WITH CHECK (
  NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND (
    entity_type <> 'job'
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = attachments.entity_id
        AND j.deleted_at IS NULL
        AND public.job_matches_account_owner(
          j.contractor_id,
          j.customer_id,
          j.location_id,
          j.service_case_id,
          public.current_internal_account_owner_id()
        )
    )
  )
);

DROP POLICY IF EXISTS storage_internal_full_access ON storage.objects;

CREATE POLICY storage_internal_attachment_account_scope
ON storage.objects
TO authenticated
USING (
  bucket_id = 'attachments'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.attachments a
    LEFT JOIN public.jobs j
      ON a.entity_type = 'job'
     AND j.id = a.entity_id
    WHERE a.storage_path = objects.name
      AND (
        a.entity_type <> 'job'
        OR (
          j.deleted_at IS NULL
          AND public.job_matches_account_owner(
            j.contractor_id,
            j.customer_id,
            j.location_id,
            j.service_case_id,
            public.current_internal_account_owner_id()
          )
        )
      )
  )
)
WITH CHECK (
  bucket_id = 'attachments'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.attachments a
    LEFT JOIN public.jobs j
      ON a.entity_type = 'job'
     AND j.id = a.entity_id
    WHERE a.storage_path = objects.name
      AND (
        a.entity_type <> 'job'
        OR (
          j.deleted_at IS NULL
          AND public.job_matches_account_owner(
            j.contractor_id,
            j.customer_id,
            j.location_id,
            j.service_case_id,
            public.current_internal_account_owner_id()
          )
        )
      )
  )
);

COMMIT;