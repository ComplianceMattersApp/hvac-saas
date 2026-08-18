BEGIN;

-- The `attachments` bucket has been managed out-of-band (Supabase dashboard),
-- so its invariants were untracked and would not survive an environment
-- rebuild. Pin them here.
--
-- Uploads are performed with service-role signed upload URLs, which bypass
-- storage RLS by design. That makes `file_size_limit` the only server-side
-- ceiling on upload size that the client cannot talk its way past, so it is a
-- backstop for the application-level policy in
-- lib/attachments/attachment-upload-policy.ts (25 MiB per job attachment).
--
-- No `allowed_mime_types` is set: this single bucket also carries business
-- logos (SVG), permit PDFs, and estimate photos, so a bucket-wide allowlist
-- would be the union of every surface's needs and would not usefully constrain
-- any one of them. Type policy stays per-surface in application code.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 26214400;

-- Both storage RLS policies on the attachments bucket resolve an object by
-- `public.attachments.storage_path = storage.objects.name`. There was no index
-- on that column, so every policy evaluation seq-scanned `attachments` — once
-- per object touched.
CREATE INDEX IF NOT EXISTS attachments_storage_path_idx
  ON public.attachments (storage_path);

COMMIT;
