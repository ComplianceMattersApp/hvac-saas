-- Compliance Matters: preserve ECC permit metadata across contractor intake proposals
-- Purpose: keep contractor-entered jurisdiction and permit date available until
-- internal finalization promotes the proposal into the canonical jobs table.

BEGIN;

ALTER TABLE public.contractor_intake_submissions
  ADD COLUMN IF NOT EXISTS proposed_jurisdiction text NULL,
  ADD COLUMN IF NOT EXISTS proposed_permit_date date NULL;

COMMIT;