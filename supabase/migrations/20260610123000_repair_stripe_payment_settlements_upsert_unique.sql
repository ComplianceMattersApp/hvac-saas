-- Compliance Matters: repair settlement upsert uniqueness target
-- Purpose: keep balance transaction identity uniqueness while exposing a
-- PostgREST-usable ON CONFLICT target for the settlement helper.
--
-- Postgres unique indexes allow multiple NULL values, so a full unique index
-- on (stripe_connected_account_id, stripe_balance_transaction_id) preserves
-- the prior "unique when balance transaction is present" behavior while
-- enabling conflict inference for upsert.

BEGIN;

DROP INDEX IF EXISTS public.stripe_payment_settlements_balance_txn_unique;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_payment_settlements_balance_txn_unique
  ON public.stripe_payment_settlements (stripe_connected_account_id, stripe_balance_transaction_id);

COMMIT;