-- Compliance Matters: add proposed_permit_number to contractor_intake_submissions
-- Purpose: persist the contractor-provided permit number in the proposal seam
-- so the internal review wizard can detect ECC permit collisions before
-- finalizing a duplicate job.

BEGIN;

ALTER TABLE public.contractor_intake_submissions
  ADD COLUMN IF NOT EXISTS proposed_permit_number text NULL;

COMMIT;
