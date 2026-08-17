BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Provenance
-- ---------------------------------------------------------------------------
-- `public.attachments` recorded no uploader. For job photos used as compliance
-- evidence (equipment labels, refrigerant charge readings, duct leakage), "who
-- produced this?" was only recoverable by scanning `job_events.meta` for an
-- `attachment_ids` array that happened to contain the id -- and only when a
-- finalize event was written at all. Direct inserts (permit intake, business
-- profile) left no actor trail whatsoever.
--
-- Nullable with no backfill: existing rows genuinely have no recoverable
-- uploader, and inventing one would be worse than recording the gap honestly.
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attachments.created_by_user_id IS
  'Auth user that uploaded this attachment. NULL for rows created before provenance tracking, and for system-generated attachments.';

-- ---------------------------------------------------------------------------
-- 2. Upload staging
-- ---------------------------------------------------------------------------
-- The job attachment upload is a three-step dance: insert the row, hand the
-- browser a signed upload URL, then finalize. A browser that closes between
-- steps two and three leaves a row describing an object that never arrived,
-- which renders in the attachment library as a permanently broken tile.
--
-- `finalized_at` separates "row exists" from "upload completed". It DEFAULTS to
-- now() so that every other insert path (permit request intake, business
-- profile logo, job actions) stays finalized-on-insert without modification --
-- only the staged job-attachment upload sets it to NULL explicitly.
--
-- That default is the safety property: a read path that does not yet filter on
-- this column behaves exactly as it does today, so an unconverted caller can
-- never hide a legitimate attachment.
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.attachments.finalized_at IS
  'Set when the uploaded object has been verified present in storage. NULL means the row is staged for an in-flight upload and must be hidden from read surfaces.';

-- Existing rows predate staging and are by definition complete.
UPDATE public.attachments
SET finalized_at = created_at
WHERE finalized_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- The attachment library reads are all (entity_type, entity_id) ordered by
-- created_at DESC. Without this the job attachment page sorts the whole table
-- slice on every render.
CREATE INDEX IF NOT EXISTS attachments_entity_created_at_idx
  ON public.attachments (entity_type, entity_id, created_at DESC);

-- Partial index supporting the abandoned-upload sweep. Stays tiny: rows leave
-- it as soon as they finalize.
CREATE INDEX IF NOT EXISTS attachments_staged_idx
  ON public.attachments (created_at)
  WHERE finalized_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Abandoned upload sweep
-- ---------------------------------------------------------------------------
-- Returns the storage objects belonging to staged rows that never completed, and
-- deletes those rows. The caller removes the returned objects from storage --
-- SQL cannot reach the storage API, and deleting the row first would orphan the
-- object beyond recovery.
--
-- The grace period keeps a slow upload on a bad LTE connection from being swept
-- out from under a technician who is still uploading.
CREATE OR REPLACE FUNCTION public.sweep_abandoned_attachment_uploads(
  p_older_than interval DEFAULT interval '24 hours',
  p_limit integer DEFAULT 500
)
RETURNS TABLE (id uuid, bucket text, storage_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH doomed AS (
    SELECT a.id
    FROM public.attachments a
    WHERE a.finalized_at IS NULL
      AND a.created_at < now() - p_older_than
    ORDER BY a.created_at
    LIMIT p_limit
  )
  DELETE FROM public.attachments a
  USING doomed d
  WHERE a.id = d.id
  RETURNING a.id, a.bucket, a.storage_path;
$$;

REVOKE ALL ON FUNCTION public.sweep_abandoned_attachment_uploads(interval, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_abandoned_attachment_uploads(interval, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.sweep_abandoned_attachment_uploads(interval, integer) FROM anon;

COMMENT ON FUNCTION public.sweep_abandoned_attachment_uploads(interval, integer) IS
  'Deletes attachment rows staged for uploads that never completed and returns their storage objects for removal by the caller. Service-role only.';

COMMIT;
