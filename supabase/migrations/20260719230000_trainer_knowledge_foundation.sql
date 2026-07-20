BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  source_label text NOT NULL,
  source_path text NOT NULL,
  audience_roles text[] NOT NULL DEFAULT ARRAY['all']::text[],
  product_modes text[] NOT NULL DEFAULT ARRAY['all']::text[],
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz NULL,
  approved_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  CONSTRAINT assistant_knowledge_articles_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT assistant_knowledge_articles_source_path_chk CHECK (
    source_path LIKE '/%' AND position('?' in source_path) = 0 AND position('#' in source_path) = 0
  ),
  CONSTRAINT assistant_knowledge_articles_published_approval_chk CHECK (
    status <> 'published' OR approved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS assistant_knowledge_articles_search_idx
  ON public.assistant_knowledge_articles USING gin (search_document);
CREATE INDEX IF NOT EXISTS assistant_knowledge_articles_status_idx
  ON public.assistant_knowledge_articles (status, updated_at DESC);

ALTER TABLE public.assistant_knowledge_articles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assistant_knowledge_articles FROM anon, authenticated;
GRANT ALL ON TABLE public.assistant_knowledge_articles TO service_role;

CREATE OR REPLACE FUNCTION public.search_assistant_knowledge(
  p_query text,
  p_role text,
  p_product_mode text,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  slug text,
  title text,
  body text,
  source_label text,
  source_path text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('english', left(coalesce(p_query, ''), 500)) AS value
  )
  SELECT a.slug, a.title, a.body, a.source_label, a.source_path,
    ts_rank_cd(a.search_document, query.value) AS rank
  FROM public.assistant_knowledge_articles a, query
  WHERE a.status = 'published'
    AND query.value <> ''::tsquery
    AND (a.audience_roles @> ARRAY['all']::text[] OR p_role = ANY(a.audience_roles))
    AND (a.product_modes @> ARRAY['all']::text[] OR p_product_mode = ANY(a.product_modes))
    AND a.search_document @@ query.value
  ORDER BY rank DESC, a.title ASC
  LIMIT least(greatest(coalesce(p_limit, 6), 1), 10);
$$;

REVOKE ALL ON FUNCTION public.search_assistant_knowledge(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_assistant_knowledge(text, text, text, integer) TO service_role;

ALTER TABLE public.assistant_help_gap_events
  ADD COLUMN IF NOT EXISTS knowledge_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_answer text NULL,
  ADD COLUMN IF NOT EXISTS draft_article_title text NULL,
  ADD COLUMN IF NOT EXISTS draft_article_body text NULL,
  ADD COLUMN IF NOT EXISTS provider_model text NULL;

ALTER TABLE public.assistant_help_gap_events
  DROP CONSTRAINT IF EXISTS assistant_help_gap_events_draft_answer_len_chk,
  ADD CONSTRAINT assistant_help_gap_events_draft_answer_len_chk CHECK (draft_answer IS NULL OR length(draft_answer) <= 3000),
  DROP CONSTRAINT IF EXISTS assistant_help_gap_events_draft_article_title_len_chk,
  ADD CONSTRAINT assistant_help_gap_events_draft_article_title_len_chk CHECK (draft_article_title IS NULL OR length(draft_article_title) <= 160),
  DROP CONSTRAINT IF EXISTS assistant_help_gap_events_draft_article_body_len_chk,
  ADD CONSTRAINT assistant_help_gap_events_draft_article_body_len_chk CHECK (draft_article_body IS NULL OR length(draft_article_body) <= 6000);

INSERT INTO public.assistant_knowledge_articles
  (slug, title, body, source_label, source_path, status, approved_at)
VALUES
  ('training-room', 'Using the Training Room', 'The Training Room provides role-specific workflow missions and a first-job path. It is guidance only and does not perform work, change settings, create jobs, send invoices, or record payments. Start with the track for your current role and open the linked app area to practice the workflow.', 'EveryStep app knowledge', '/training', 'published', now()),
  ('launch-room', 'Using the Launch Room', 'The Launch Room is the owner and admin startup area. Use it to review setup readiness and reach configuration tasks. The assistant may explain the setup path but cannot change company settings or permissions.', 'EveryStep app knowledge', '/ops/admin', 'published', now()),
  ('first-job-workflow', 'First job workflow', 'A safe first-job workflow is: confirm the customer and service location, create or schedule the job, document the visit and work performed, review commercial records, then use the authorized invoice and payment workflows for the user role. Proposed estimate lines are not completed Work Items or Invoice Charges.', 'EveryStep workflow knowledge', '/training', 'published', now()),
  ('roles-and-permissions', 'Roles and permissions', 'Owners and admins manage account setup and access. Office users coordinate customers, locations, scheduling, and operations. Technicians document field work within their permissions. Billing users handle authorized financial workflows. The assistant cannot grant access or bypass a role restriction; an owner or admin must review access.', 'EveryStep security knowledge', '/training', 'published', now()),
  ('estimate-workflow', 'Estimate workflow boundaries', 'Estimates are proposed commercial scope. Estimate lines and option packages remain the source of truth for a proposal. AI guidance is suggestion-only. Sending, approval, conversion to a job, conversion to an invoice draft, invoice issue, and payment collection always remain explicit authorized application actions.', 'EveryStep estimate knowledge', '/estimates', 'published', now()),
  ('assistant-boundaries', 'Trainer assistant boundaries', 'The trainer answers from published EveryStep knowledge supplied with the question. It cannot inspect arbitrary account data, modify records, change settings, create support cases, or take workflow actions. When published knowledge does not support an answer, it should say so and create a private knowledge-gap draft for review.', 'EveryStep assistant policy', '/training', 'published', now())
ON CONFLICT (slug) DO NOTHING;

COMMIT;
