-- Compliance Matters: contractor intake proposal addendum comments
-- Purpose: allow contractors to append follow-up comments to pending
-- intake proposals without mutating original submitted note fields.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contractor_intake_submission_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.contractor_intake_submissions(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  author_role text NOT NULL,
  comment_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contractor_intake_submission_comments_role_valid
    CHECK (author_role IN ('contractor', 'internal')),
  CONSTRAINT contractor_intake_submission_comments_text_nonempty
    CHECK (length(btrim(comment_text)) > 0)
);

CREATE INDEX IF NOT EXISTS contractor_intake_submission_comments_submission_idx
  ON public.contractor_intake_submission_comments (submission_id, created_at);

ALTER TABLE public.contractor_intake_submission_comments ENABLE ROW LEVEL SECURITY;

COMMIT;