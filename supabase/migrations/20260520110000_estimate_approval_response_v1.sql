-- Compliance Matters: Estimate Approval Response V1
-- Purpose: Add selected-option and approval response projection columns to estimates.
--   selected_option_id          — durable FK to the option the operator recorded as approved
--   selected_option_label_snapshot  — frozen label at approval time
--   selected_option_total_cents     — frozen option total at approval time (approval amount)
--   response_note               — optional internal note recorded with the response
-- Scope: estimates table only. No new tables. No UI, conversion, payment, portal, QBO, SMS behavior.
-- Non-goals: customer approval flow, e-signature, public links, job/invoice conversion.

BEGIN;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS selected_option_id           uuid    NULL REFERENCES public.estimate_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_option_label_snapshot  text    NULL,
  ADD COLUMN IF NOT EXISTS selected_option_total_cents     integer NULL,
  ADD COLUMN IF NOT EXISTS response_note                text    NULL;

-- If an option is recorded, both label and total snapshots must be present.
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_selected_option_snapshots_consistent_chk
    CHECK (
      selected_option_id IS NULL
      OR (
        selected_option_label_snapshot IS NOT NULL
        AND selected_option_total_cents IS NOT NULL
      )
    );

-- Total snapshot must be non-negative when present.
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_selected_option_total_nonnegative_chk
    CHECK (
      selected_option_total_cents IS NULL
      OR selected_option_total_cents >= 0
    );

-- Optional index for future queries: look up approved estimates by selected option.
CREATE INDEX IF NOT EXISTS estimates_selected_option_idx
  ON public.estimates (selected_option_id)
  WHERE selected_option_id IS NOT NULL;

COMMIT;
