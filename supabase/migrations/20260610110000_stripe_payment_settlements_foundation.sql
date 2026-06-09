-- Compliance Matters: Stripe payment settlements foundation (Financial Trust Lane Phase B)
-- Purpose: add dormant, additive settlement reconciliation truth for Stripe
-- fee/net/payout reporting without changing gross payment truth, allocation
-- truth, invoice paid/balance projection, checkout, webhook, QBO, refund, or
-- dispute behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  internal_invoice_payment_id uuid NULL REFERENCES public.internal_invoice_payments(id) ON DELETE SET NULL,
  stripe_connected_account_id text NOT NULL,
  stripe_charge_id text NULL,
  stripe_payment_intent_id text NULL,
  stripe_checkout_session_id text NULL,
  stripe_balance_transaction_id text NULL,
  stripe_payout_id text NULL,
  settlement_kind text NOT NULL,
  source_object_type text NOT NULL,
  gross_amount_cents integer NOT NULL DEFAULT 0,
  stripe_fee_cents integer NOT NULL DEFAULT 0,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  net_amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  available_on timestamptz NULL,
  payout_arrival_date timestamptz NULL,
  payout_status text NULL,
  reporting_category text NULL,
  fee_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_status text NOT NULL DEFAULT 'pending',
  sync_error text NULL,
  synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stripe_payment_settlements_kind_valid_chk
    CHECK (settlement_kind IN (
      'payment',
      'refund',
      'dispute',
      'adjustment',
      'application_fee',
      'payout_adjustment',
      'unmatched'
    )),

  CONSTRAINT stripe_payment_settlements_sync_status_valid_chk
    CHECK (sync_status IN (
      'pending',
      'synced',
      'skipped',
      'unmatched',
      'failed'
    )),

  CONSTRAINT stripe_payment_settlements_currency_valid_chk
    CHECK (currency = lower(currency) AND currency ~ '^[a-z]{3}$'),

  CONSTRAINT stripe_payment_settlements_connected_account_present_chk
    CHECK (length(btrim(stripe_connected_account_id)) > 0),

  CONSTRAINT stripe_payment_settlements_source_object_type_present_chk
    CHECK (length(btrim(source_object_type)) > 0),

  CONSTRAINT stripe_payment_settlements_fee_details_array_chk
    CHECK (jsonb_typeof(fee_details) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_payment_settlements_balance_txn_unique
  ON public.stripe_payment_settlements (stripe_connected_account_id, stripe_balance_transaction_id)
  WHERE stripe_balance_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_owner_payout_idx
  ON public.stripe_payment_settlements (account_owner_user_id, stripe_payout_id);

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_owner_available_on_idx
  ON public.stripe_payment_settlements (account_owner_user_id, available_on);

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_owner_payout_arrival_idx
  ON public.stripe_payment_settlements (account_owner_user_id, payout_arrival_date);

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_owner_sync_status_idx
  ON public.stripe_payment_settlements (account_owner_user_id, sync_status);

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_owner_kind_idx
  ON public.stripe_payment_settlements (account_owner_user_id, settlement_kind);

CREATE INDEX IF NOT EXISTS stripe_payment_settlements_internal_payment_idx
  ON public.stripe_payment_settlements (internal_invoice_payment_id)
  WHERE internal_invoice_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS stripe_payment_settlements_set_updated_at
  ON public.stripe_payment_settlements;

CREATE TRIGGER stripe_payment_settlements_set_updated_at
BEFORE UPDATE ON public.stripe_payment_settlements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stripe_payment_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_payment_settlements_select_account_scope
  ON public.stripe_payment_settlements;

CREATE POLICY stripe_payment_settlements_select_account_scope
ON public.stripe_payment_settlements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = stripe_payment_settlements.account_owner_user_id
  )
);

-- No INSERT/UPDATE/DELETE application policies in Phase B.
-- Settlement sync writes are reserved for future server-side service/admin
-- paths with explicit account scope. This table is dormant and does not
-- backfill, create, or mutate payment, allocation, invoice, report, webhook,
-- checkout, refund, dispute, or QBO behavior.

COMMIT;
