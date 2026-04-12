-- Compliance Matters: contractor intake proposal persistence seam
-- Purpose: persist contractor-submitted intake proposals without creating
-- canonical customer/location entities before internal finalization.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contractor_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  proposed_customer_first_name text NULL,
  proposed_customer_last_name text NULL,
  proposed_customer_phone text NULL,
  proposed_customer_email text NULL,

  proposed_address_line1 text NULL,
  proposed_city text NULL,
  proposed_zip text NULL,
  proposed_location_nickname text NULL,

  proposed_job_type text NULL,
  proposed_project_type text NULL,
  proposed_title text NULL,
  proposed_job_notes text NULL,

  review_status text NOT NULL DEFAULT 'pending',
  review_note text NULL,
  reviewed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,

  finalized_job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  finalized_customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  finalized_location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,

  CONSTRAINT contractor_intake_submissions_review_status_valid
    CHECK (review_status IN ('pending', 'finalized', 'rejected'))
);

CREATE INDEX IF NOT EXISTS contractor_intake_submissions_owner_status_idx
  ON public.contractor_intake_submissions (account_owner_user_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS contractor_intake_submissions_contractor_idx
  ON public.contractor_intake_submissions (contractor_id, created_at DESC);

ALTER TABLE public.contractor_intake_submissions ENABLE ROW LEVEL SECURITY;

COMMIT;
