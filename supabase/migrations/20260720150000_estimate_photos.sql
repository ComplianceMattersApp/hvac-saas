-- Estimate photos: private storage metadata with explicit account scope.

BEGIN;

CREATE TABLE IF NOT EXISTS public.estimate_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bucket text NOT NULL DEFAULT 'attachments',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL,
  caption text NULL,
  customer_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT estimate_photos_file_name_not_blank_chk CHECK (length(btrim(file_name)) > 0),
  CONSTRAINT estimate_photos_storage_path_not_blank_chk CHECK (length(btrim(storage_path)) > 0),
  CONSTRAINT estimate_photos_image_type_chk CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  CONSTRAINT estimate_photos_file_size_chk CHECK (file_size > 0 AND file_size <= 12582912),
  CONSTRAINT estimate_photos_caption_length_chk CHECK (caption IS NULL OR length(caption) <= 160),
  CONSTRAINT estimate_photos_sort_order_positive_chk CHECK (sort_order > 0),
  CONSTRAINT estimate_photos_owner_path_unique UNIQUE (account_owner_user_id, storage_path)
);

CREATE INDEX IF NOT EXISTS estimate_photos_estimate_sort_idx
  ON public.estimate_photos (estimate_id, sort_order, created_at, id);

ALTER TABLE public.estimate_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_photos_select_account_scope ON public.estimate_photos;
CREATE POLICY estimate_photos_select_account_scope
ON public.estimate_photos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimate_photos.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1 FROM public.estimates estimate
    WHERE estimate.id = estimate_photos.estimate_id
      AND estimate.account_owner_user_id = estimate_photos.account_owner_user_id
  )
);

DROP POLICY IF EXISTS estimate_photos_insert_account_scope ON public.estimate_photos;
CREATE POLICY estimate_photos_insert_account_scope
ON public.estimate_photos FOR INSERT TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimate_photos.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1 FROM public.estimates estimate
    WHERE estimate.id = estimate_photos.estimate_id
      AND estimate.account_owner_user_id = estimate_photos.account_owner_user_id
  )
);

DROP POLICY IF EXISTS estimate_photos_update_account_scope ON public.estimate_photos;
CREATE POLICY estimate_photos_update_account_scope
ON public.estimate_photos FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimate_photos.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimate_photos.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1 FROM public.estimates estimate
    WHERE estimate.id = estimate_photos.estimate_id
      AND estimate.account_owner_user_id = estimate_photos.account_owner_user_id
  )
);

DROP POLICY IF EXISTS estimate_photos_delete_account_scope ON public.estimate_photos;
CREATE POLICY estimate_photos_delete_account_scope
ON public.estimate_photos FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimate_photos.account_owner_user_id
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_photos TO authenticated;
GRANT ALL ON public.estimate_photos TO service_role;

COMMIT;
