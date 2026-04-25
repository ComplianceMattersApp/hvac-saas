-- Compliance Matters: platform account entitlement foundation v1
-- Purpose: add the platform-level entitlement/usage foundation for the
-- Monthly usage / payment model milestone without enabling live subscription
-- billing or touching existing internal invoice or billing mode behavior.
--
-- Domain boundary:
--   1. Platform account entitlement truth → this table
--   2. Tenant billed truth → internal_invoices / internal_invoice_line_items (unchanged)
--   3. Collected payment truth → not yet implemented
--
-- Stripe placeholder columns are present as schema scaffolding only.
-- No application code reads or writes them in this slice.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_account_entitlements (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  account_owner_user_id   uuid        NOT NULL,
  plan_key                text        NOT NULL DEFAULT 'starter',
  entitlement_status      text        NOT NULL DEFAULT 'trial',
  seat_limit              integer     NULL,
  trial_ends_at           timestamptz NULL,
  entitlement_valid_from  timestamptz NOT NULL DEFAULT now(),
  entitlement_valid_until timestamptz NULL,

  -- Stripe placeholder fields: schema scaffolding only.
  -- These columns must not be read or written by any application code in this slice.
  stripe_customer_id      text        NULL,
  stripe_subscription_id  text        NULL,
  stripe_price_id         text        NULL,

  notes                   text        NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT platform_account_entitlements_pkey
    PRIMARY KEY (id),

  CONSTRAINT platform_account_entitlements_account_owner_unique
    UNIQUE (account_owner_user_id),

  CONSTRAINT platform_account_entitlements_account_owner_fk
    FOREIGN KEY (account_owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  CONSTRAINT platform_account_entitlements_plan_key_valid_chk
    CHECK (plan_key IN ('starter', 'professional', 'enterprise')),

  CONSTRAINT platform_account_entitlements_status_valid_chk
    CHECK (entitlement_status IN ('trial', 'active', 'grace', 'suspended', 'cancelled')),

  CONSTRAINT platform_account_entitlements_seat_limit_nonnegative_chk
    CHECK (seat_limit IS NULL OR seat_limit >= 0)
);

CREATE INDEX IF NOT EXISTS platform_account_entitlements_status_idx
  ON public.platform_account_entitlements (account_owner_user_id, entitlement_status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_account_entitlements ENABLE ROW LEVEL SECURITY;

-- Same-account internal users may read their own entitlement state.
-- Uses the existing current_internal_account_owner_id() helper, consistent
-- with internal_business_profiles, notifications, and other hardened tables.
-- No tenant INSERT / UPDATE / DELETE policies: service role is the write path.

DROP POLICY IF EXISTS platform_account_entitlements_select_account_scope
  ON public.platform_account_entitlements;

CREATE POLICY platform_account_entitlements_select_account_scope
ON public.platform_account_entitlements
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;
