-- Compliance Matters: internal invoice payments Stripe foundation v1a
-- Purpose: add Stripe webhook fields and idempotency support for tenant customer
-- online invoice payments (V1A-1 foundation, no live Checkout UI yet).

BEGIN;

-- Add Stripe-specific fields to internal_invoice_payments
ALTER TABLE IF EXISTS public.internal_invoice_payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_event_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_charged_at TIMESTAMPTZ NULL;

-- Create UNIQUE index for stripe_event_id, allowing NULLs
-- PostgreSQL UNIQUE constraint includes NULLs by default,
-- but we use an index for clarity and consistency with platform billing pattern.
CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_stripe_event_id_unique
  ON public.internal_invoice_payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- Add lookup index for session queries (for idempotency checks)
CREATE INDEX IF NOT EXISTS internal_invoice_payments_stripe_session_id_idx
  ON public.internal_invoice_payments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Add lookup index for payment_intent queries (for debugging, optional)
CREATE INDEX IF NOT EXISTS internal_invoice_payments_stripe_payment_intent_id_idx
  ON public.internal_invoice_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Add new payment method constraint: allow 'card_stripe_online' alongside existing methods
ALTER TABLE public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_method_valid_chk;

ALTER TABLE public.internal_invoice_payments
  ADD CONSTRAINT internal_invoice_payments_method_valid_chk
    CHECK (payment_method IN (
      'cash',
      'check',
      'ach_off_platform',
      'card_off_platform',
      'bank_transfer',
      'other',
      'card_stripe_online'
    ));

COMMIT;
