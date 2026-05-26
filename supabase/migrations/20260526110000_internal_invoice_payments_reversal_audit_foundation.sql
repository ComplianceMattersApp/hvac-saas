-- Compliance Matters: internal invoice payments reversal audit foundation (Phase 3)
-- Purpose: add additive, non-destructive audit metadata for manual/off-platform reversal actions.

BEGIN;

ALTER TABLE public.internal_invoice_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text NULL;

CREATE INDEX IF NOT EXISTS internal_invoice_payments_owner_reversed_at_idx
  ON public.internal_invoice_payments (account_owner_user_id, reversed_at DESC)
  WHERE reversed_at IS NOT NULL;

COMMIT;
