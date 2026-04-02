-- Compliance Matters: contractor portal attachment upload RLS repair
-- Purpose: allow authenticated contractors to create/read storage.objects rows
-- only for attachments they own via public.attachments -> jobs -> contractor_users.

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_contractor_insert_own_job_attachments ON storage.objects;
CREATE POLICY storage_contractor_insert_own_job_attachments
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1
    FROM public.attachments a
    JOIN public.jobs j
      ON j.id = a.entity_id
    JOIN public.contractor_users cu
      ON cu.contractor_id = j.contractor_id
    WHERE cu.user_id = auth.uid()
      AND a.entity_type = 'job'
      AND a.storage_path = storage.objects.name
  )
);

DROP POLICY IF EXISTS storage_contractor_read_own_job_attachments ON storage.objects;
CREATE POLICY storage_contractor_read_own_job_attachments
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1
    FROM public.attachments a
    JOIN public.jobs j
      ON j.id = a.entity_id
    JOIN public.contractor_users cu
      ON cu.contractor_id = j.contractor_id
    WHERE cu.user_id = auth.uid()
      AND a.entity_type = 'job'
      AND a.storage_path = storage.objects.name
  )
);
