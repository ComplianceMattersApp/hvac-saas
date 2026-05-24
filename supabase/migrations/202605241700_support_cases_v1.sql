-- Support Case / Call Log V1
-- Owner/platform-internal support records only.
-- These tables intentionally do not mutate tenant operational truth.

CREATE TABLE IF NOT EXISTS public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  source text NOT NULL DEFAULT 'phone' CHECK (source IN ('phone', 'text', 'email', 'in_app', 'internal')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  issue_summary text NOT NULL CHECK (length(trim(issue_summary)) BETWEEN 1 AND 4000),
  resolution_summary text NULL CHECK (resolution_summary IS NULL OR length(resolution_summary) <= 4000),
  related_customer_id uuid NULL,
  related_job_id uuid NULL,
  related_invoice_id uuid NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_case_id uuid NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  note_type text NOT NULL DEFAULT 'internal_note' CHECK (note_type IN ('internal_note', 'customer_update_summary', 'resolution_note')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_cases_account_owner_status_idx
  ON public.support_cases (account_owner_user_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS support_cases_account_owner_recent_idx
  ON public.support_cases (account_owner_user_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS support_cases_related_customer_idx
  ON public.support_cases (related_customer_id)
  WHERE related_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_cases_related_job_idx
  ON public.support_cases (related_job_id)
  WHERE related_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_cases_related_invoice_idx
  ON public.support_cases (related_invoice_id)
  WHERE related_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_case_notes_case_recent_idx
  ON public.support_case_notes (support_case_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_support_cases_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_cases_set_updated_at ON public.support_cases;
CREATE TRIGGER support_cases_set_updated_at
BEFORE UPDATE ON public.support_cases
FOR EACH ROW
EXECUTE FUNCTION public.set_support_cases_updated_at();

CREATE OR REPLACE FUNCTION public.touch_support_case_last_activity_from_note()
RETURNS trigger AS $$
BEGIN
  UPDATE public.support_cases
  SET last_activity_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.support_case_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_case_notes_touch_case ON public.support_case_notes;
CREATE TRIGGER support_case_notes_touch_case
AFTER INSERT ON public.support_case_notes
FOR EACH ROW
EXECUTE FUNCTION public.touch_support_case_last_activity_from_note();

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_case_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.support_cases IS 'Platform-owner/support internal support cases. Not tenant-operational truth.';
COMMENT ON TABLE public.support_case_notes IS 'Platform-owner/support internal notes for support cases. Not tenant-visible in V1.';
