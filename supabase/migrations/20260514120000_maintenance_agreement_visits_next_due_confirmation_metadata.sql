-- Compliance Matters: maintenance_agreement_visits next-due confirmation metadata foundation
-- Purpose: add durable, nullable idempotency metadata columns for future
-- next-due confirmation flow without changing runtime behavior in this slice.

BEGIN;

ALTER TABLE public.maintenance_agreement_visits
  ADD COLUMN IF NOT EXISTS next_due_confirmed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS next_due_confirmed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_next_due_date date NULL,
  ADD COLUMN IF NOT EXISTS baseline_next_due_date date NULL;

COMMIT;
