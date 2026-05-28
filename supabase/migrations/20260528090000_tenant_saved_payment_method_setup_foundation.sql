-- Compliance Matters: tenant saved payment method setup foundation (Phase 6E-A)
-- Purpose: additive schema foundation for saved payment method references,
-- setup workflow state, autopay consent state, payment attempt workflow,
-- and Stripe event receipts.
--
-- Boundaries:
-- - Card-first posture.
-- - ACH/bank behavior remains deferred (display-safe metadata only).
-- - No credential or secret storage.
-- - No payment truth mutation; internal_invoice_payments remains webhook-confirmed truth.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_stripe_customers (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id                     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  stripe_connected_account_id     text        NOT NULL,
  stripe_customer_id              text        NOT NULL,
  profile_status                  text        NOT NULL DEFAULT 'active',
  is_current                      boolean     NOT NULL DEFAULT true,
  stale_reason_code               text        NULL,
  stale_reason_detail             text        NULL,
  superseded_by_profile_id        uuid        NULL REFERENCES public.tenant_stripe_customers(id) ON DELETE SET NULL,
  last_verified_at                timestamptz NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT tenant_stripe_customers_profile_status_valid_chk
    CHECK (profile_status IN ('active', 'stale_or_invalid', 'disconnected', 'superseded')),

  CONSTRAINT tenant_stripe_customers_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_stripe_customers_customer_id_format_chk
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_stripe_customers_one_current_per_customer_idx
  ON public.tenant_stripe_customers (account_owner_user_id, customer_id, stripe_connected_account_id)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_stripe_customers_connected_customer_unique_idx
  ON public.tenant_stripe_customers (stripe_connected_account_id, stripe_customer_id);

CREATE INDEX IF NOT EXISTS tenant_stripe_customers_owner_customer_idx
  ON public.tenant_stripe_customers (account_owner_user_id, customer_id);

CREATE INDEX IF NOT EXISTS tenant_stripe_customers_owner_status_idx
  ON public.tenant_stripe_customers (account_owner_user_id, profile_status);

ALTER TABLE public.tenant_stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_stripe_customers_select_account_scope
  ON public.tenant_stripe_customers;
DROP POLICY IF EXISTS tenant_stripe_customers_insert_account_scope
  ON public.tenant_stripe_customers;
DROP POLICY IF EXISTS tenant_stripe_customers_update_account_scope
  ON public.tenant_stripe_customers;

CREATE POLICY tenant_stripe_customers_select_account_scope
ON public.tenant_stripe_customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
);

CREATE POLICY tenant_stripe_customers_insert_account_scope
ON public.tenant_stripe_customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    updated_by_user_id IS NULL
    OR updated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_stripe_customers.customer_id
      AND c.owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
);

CREATE POLICY tenant_stripe_customers_update_account_scope
ON public.tenant_stripe_customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    updated_by_user_id IS NULL
    OR updated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_stripe_customers.customer_id
      AND c.owner_user_id = tenant_stripe_customers.account_owner_user_id
  )
);

-- No DELETE policy in this foundation slice.

CREATE TABLE IF NOT EXISTS public.tenant_customer_payment_methods (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tenant_stripe_customer_id       uuid        NOT NULL REFERENCES public.tenant_stripe_customers(id) ON DELETE RESTRICT,
  customer_id                     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  stripe_connected_account_id     text        NOT NULL,
  stripe_customer_id              text        NOT NULL,
  stripe_payment_method_id        text        NOT NULL,
  payment_method_type             text        NOT NULL DEFAULT 'card',
  payment_method_status           text        NOT NULL DEFAULT 'active',
  is_default                      boolean     NOT NULL DEFAULT false,
  display_brand                   text        NULL,
  display_last4                   text        NULL,
  display_exp_month               integer     NULL,
  display_exp_year                integer     NULL,
  display_funding                 text        NULL,
  display_wallet_type             text        NULL,
  bank_name_display               text        NULL,
  bank_last4_display              text        NULL,
  attached_at                     timestamptz NULL,
  detached_at                     timestamptz NULL,
  invalidated_at                  timestamptz NULL,
  last_verified_at                timestamptz NULL,
  stale_reason_code               text        NULL,
  stale_reason_detail             text        NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT tenant_customer_payment_methods_type_valid_chk
    CHECK (payment_method_type IN ('card', 'us_bank_account', 'unknown')),

  CONSTRAINT tenant_customer_payment_methods_status_valid_chk
    CHECK (payment_method_status IN ('active', 'inactive', 'expired_display_only', 'detached', 'invalid', 'stale_or_invalid')),

  CONSTRAINT tenant_customer_payment_methods_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_customer_payment_methods_customer_id_format_chk
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_customer_payment_methods_payment_method_id_format_chk
    CHECK (stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_customer_payment_methods_display_last4_format_chk
    CHECK (display_last4 IS NULL OR display_last4 ~ '^[0-9]{4}$'),

  CONSTRAINT tenant_customer_payment_methods_bank_last4_display_format_chk
    CHECK (bank_last4_display IS NULL OR bank_last4_display ~ '^[0-9]{4}$'),

  CONSTRAINT tenant_customer_payment_methods_display_exp_month_valid_chk
    CHECK (display_exp_month IS NULL OR (display_exp_month BETWEEN 1 AND 12)),

  CONSTRAINT tenant_customer_payment_methods_display_exp_year_valid_chk
    CHECK (display_exp_year IS NULL OR display_exp_year >= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_customer_payment_methods_connected_pm_unique_idx
  ON public.tenant_customer_payment_methods (stripe_connected_account_id, stripe_payment_method_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_customer_payment_methods_active_default_per_customer_idx
  ON public.tenant_customer_payment_methods (tenant_stripe_customer_id)
  WHERE is_default = true
    AND payment_method_status = 'active';

CREATE INDEX IF NOT EXISTS tenant_customer_payment_methods_owner_customer_status_idx
  ON public.tenant_customer_payment_methods (account_owner_user_id, customer_id, payment_method_status);

ALTER TABLE public.tenant_customer_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_customer_payment_methods_select_account_scope
  ON public.tenant_customer_payment_methods;
DROP POLICY IF EXISTS tenant_customer_payment_methods_insert_account_scope
  ON public.tenant_customer_payment_methods;
DROP POLICY IF EXISTS tenant_customer_payment_methods_update_account_scope
  ON public.tenant_customer_payment_methods;

CREATE POLICY tenant_customer_payment_methods_select_account_scope
ON public.tenant_customer_payment_methods
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
);

CREATE POLICY tenant_customer_payment_methods_insert_account_scope
ON public.tenant_customer_payment_methods
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    updated_by_user_id IS NULL
    OR updated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_customer_payment_methods.customer_id
      AND c.owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_stripe_customers tsc
    WHERE tsc.id = tenant_customer_payment_methods.tenant_stripe_customer_id
      AND tsc.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
      AND tsc.customer_id = tenant_customer_payment_methods.customer_id
      AND tsc.stripe_connected_account_id = tenant_customer_payment_methods.stripe_connected_account_id
      AND tsc.stripe_customer_id = tenant_customer_payment_methods.stripe_customer_id
  )
);

CREATE POLICY tenant_customer_payment_methods_update_account_scope
ON public.tenant_customer_payment_methods
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    updated_by_user_id IS NULL
    OR updated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_customer_payment_methods.customer_id
      AND c.owner_user_id = tenant_customer_payment_methods.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_stripe_customers tsc
    WHERE tsc.id = tenant_customer_payment_methods.tenant_stripe_customer_id
      AND tsc.account_owner_user_id = tenant_customer_payment_methods.account_owner_user_id
      AND tsc.customer_id = tenant_customer_payment_methods.customer_id
      AND tsc.stripe_connected_account_id = tenant_customer_payment_methods.stripe_connected_account_id
      AND tsc.stripe_customer_id = tenant_customer_payment_methods.stripe_customer_id
  )
);

-- No DELETE policy in this foundation slice.

CREATE TABLE IF NOT EXISTS public.tenant_saved_payment_method_setups (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id                     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  maintenance_agreement_id        uuid        NULL REFERENCES public.maintenance_agreements(id) ON DELETE SET NULL,
  tenant_stripe_customer_id       uuid        NULL REFERENCES public.tenant_stripe_customers(id) ON DELETE SET NULL,
  tenant_customer_payment_method_id uuid      NULL REFERENCES public.tenant_customer_payment_methods(id) ON DELETE SET NULL,
  stripe_connected_account_id     text        NOT NULL,
  stripe_customer_id              text        NULL,
  setup_flow_kind                 text        NOT NULL,
  setup_status                    text        NOT NULL,
  stripe_setup_intent_id          text        NULL,
  stripe_checkout_session_id      text        NULL,
  stripe_payment_method_id        text        NULL,
  stripe_last_event_id            text        NULL,
  initiated_by_source             text        NOT NULL,
  initiated_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  return_url_path                 text        NULL,
  metadata_snapshot_json          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  failure_code                    text        NULL,
  failure_message                 text        NULL,
  requires_action_type            text        NULL,
  abandoned_at                    timestamptz NULL,
  canceled_at                     timestamptz NULL,
  succeeded_at                    timestamptz NULL,
  failed_at                       timestamptz NULL,
  last_event_received_at          timestamptz NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_saved_payment_method_setups_flow_kind_valid_chk
    CHECK (setup_flow_kind IN ('setup_intent_direct', 'checkout_setup_mode')),

  CONSTRAINT tenant_saved_payment_method_setups_status_valid_chk
    CHECK (setup_status IN ('initiated', 'pending_customer_action', 'processing', 'succeeded', 'failed', 'canceled', 'abandoned', 'expired', 'stale_or_invalid')),

  CONSTRAINT tenant_saved_payment_method_setups_initiated_by_source_valid_chk
    CHECK (initiated_by_source IN ('customer_self_service', 'internal_staff', 'system_recovery')),

  CONSTRAINT tenant_saved_payment_method_setups_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_payment_method_setups_customer_id_format_chk
    CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_payment_method_setups_setup_intent_id_format_chk
    CHECK (stripe_setup_intent_id IS NULL OR stripe_setup_intent_id ~ '^seti_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_payment_method_setups_checkout_session_id_format_chk
    CHECK (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id ~ '^cs_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_payment_method_setups_payment_method_id_format_chk
    CHECK (stripe_payment_method_id IS NULL OR stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_payment_method_setups_event_id_format_chk
    CHECK (stripe_last_event_id IS NULL OR stripe_last_event_id ~ '^evt_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_saved_payment_method_setups_setup_intent_unique_idx
  ON public.tenant_saved_payment_method_setups (stripe_setup_intent_id)
  WHERE stripe_setup_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_saved_payment_method_setups_checkout_session_unique_idx
  ON public.tenant_saved_payment_method_setups (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_saved_payment_method_setups_owner_status_idx
  ON public.tenant_saved_payment_method_setups (account_owner_user_id, setup_status, created_at DESC);

ALTER TABLE public.tenant_saved_payment_method_setups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_saved_payment_method_setups_select_account_scope
  ON public.tenant_saved_payment_method_setups;
DROP POLICY IF EXISTS tenant_saved_payment_method_setups_insert_account_scope
  ON public.tenant_saved_payment_method_setups;
DROP POLICY IF EXISTS tenant_saved_payment_method_setups_update_account_scope
  ON public.tenant_saved_payment_method_setups;

CREATE POLICY tenant_saved_payment_method_setups_select_account_scope
ON public.tenant_saved_payment_method_setups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
);

CREATE POLICY tenant_saved_payment_method_setups_insert_account_scope
ON public.tenant_saved_payment_method_setups
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
  AND (
    initiated_by_user_id IS NULL
    OR initiated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_saved_payment_method_setups.customer_id
      AND c.owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
  AND (
    maintenance_agreement_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.maintenance_agreements ma
      WHERE ma.id = tenant_saved_payment_method_setups.maintenance_agreement_id
        AND ma.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
        AND ma.customer_id = tenant_saved_payment_method_setups.customer_id
    )
  )
);

CREATE POLICY tenant_saved_payment_method_setups_update_account_scope
ON public.tenant_saved_payment_method_setups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
  AND (
    initiated_by_user_id IS NULL
    OR initiated_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_saved_payment_method_setups.customer_id
      AND c.owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
  )
  AND (
    maintenance_agreement_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.maintenance_agreements ma
      WHERE ma.id = tenant_saved_payment_method_setups.maintenance_agreement_id
        AND ma.account_owner_user_id = tenant_saved_payment_method_setups.account_owner_user_id
        AND ma.customer_id = tenant_saved_payment_method_setups.customer_id
    )
  )
);

-- No DELETE policy in this foundation slice.

CREATE TABLE IF NOT EXISTS public.tenant_customer_autopay_consents (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id                     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  maintenance_agreement_id        uuid        NOT NULL REFERENCES public.maintenance_agreements(id) ON DELETE RESTRICT,
  tenant_stripe_customer_id       uuid        NOT NULL REFERENCES public.tenant_stripe_customers(id) ON DELETE RESTRICT,
  tenant_customer_payment_method_id uuid      NOT NULL REFERENCES public.tenant_customer_payment_methods(id) ON DELETE RESTRICT,
  stripe_connected_account_id     text        NOT NULL,
  consent_status                  text        NOT NULL DEFAULT 'disabled',
  is_current                      boolean     NOT NULL DEFAULT true,
  consent_version                 text        NOT NULL,
  consent_text_snapshot           text        NOT NULL,
  consent_text_hash               text        NOT NULL,
  consent_channel                 text        NOT NULL,
  consent_source                  text        NOT NULL,
  consented_by_actor_type         text        NOT NULL,
  consented_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  consented_by_contact_name       text        NULL,
  consented_by_contact_email      text        NULL,
  consented_by_contact_phone      text        NULL,
  consented_at                    timestamptz NULL,
  consent_ip_address              inet        NULL,
  consent_user_agent              text        NULL,
  max_amount_cents                integer     NULL,
  pause_reason_code               text        NULL,
  revoked_reason_code             text        NULL,
  stale_reason_code               text        NULL,
  disabled_at                     timestamptz NULL,
  disabled_by_user_id             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  paused_at                       timestamptz NULL,
  paused_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at                      timestamptz NULL,
  revoked_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_validated_at               timestamptz NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_customer_autopay_consents_status_valid_chk
    CHECK (consent_status IN ('disabled', 'enabled', 'paused', 'revoked', 'stale_or_invalid')),

  CONSTRAINT tenant_customer_autopay_consents_channel_valid_chk
    CHECK (consent_channel IN ('hosted_setup', 'hosted_checkout_setup', 'internal_recorded', 'imported_legacy')),

  CONSTRAINT tenant_customer_autopay_consents_source_valid_chk
    CHECK (consent_source IN ('customer_approved', 'internal_staff_recorded', 'system_migrated')),

  CONSTRAINT tenant_customer_autopay_consents_actor_type_valid_chk
    CHECK (consented_by_actor_type IN ('customer_contact', 'internal_user', 'system')),

  CONSTRAINT tenant_customer_autopay_consents_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_customer_autopay_consents_max_amount_positive_chk
    CHECK (max_amount_cents IS NULL OR max_amount_cents > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_customer_autopay_consents_one_current_per_agreement_idx
  ON public.tenant_customer_autopay_consents (maintenance_agreement_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS tenant_customer_autopay_consents_owner_status_idx
  ON public.tenant_customer_autopay_consents (account_owner_user_id, consent_status, updated_at DESC);

ALTER TABLE public.tenant_customer_autopay_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_customer_autopay_consents_select_account_scope
  ON public.tenant_customer_autopay_consents;
DROP POLICY IF EXISTS tenant_customer_autopay_consents_insert_account_scope
  ON public.tenant_customer_autopay_consents;
DROP POLICY IF EXISTS tenant_customer_autopay_consents_update_account_scope
  ON public.tenant_customer_autopay_consents;

CREATE POLICY tenant_customer_autopay_consents_select_account_scope
ON public.tenant_customer_autopay_consents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
);

CREATE POLICY tenant_customer_autopay_consents_insert_account_scope
ON public.tenant_customer_autopay_consents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
  AND (
    consented_by_user_id IS NULL
    OR consented_by_user_id = auth.uid()
  )
  AND (
    disabled_by_user_id IS NULL
    OR disabled_by_user_id = auth.uid()
  )
  AND (
    paused_by_user_id IS NULL
    OR paused_by_user_id = auth.uid()
  )
  AND (
    revoked_by_user_id IS NULL
    OR revoked_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_customer_autopay_consents.customer_id
      AND c.owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements ma
    WHERE ma.id = tenant_customer_autopay_consents.maintenance_agreement_id
      AND ma.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND ma.customer_id = tenant_customer_autopay_consents.customer_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_stripe_customers tsc
    WHERE tsc.id = tenant_customer_autopay_consents.tenant_stripe_customer_id
      AND tsc.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND tsc.customer_id = tenant_customer_autopay_consents.customer_id
      AND tsc.stripe_connected_account_id = tenant_customer_autopay_consents.stripe_connected_account_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_customer_payment_methods pm
    WHERE pm.id = tenant_customer_autopay_consents.tenant_customer_payment_method_id
      AND pm.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND pm.customer_id = tenant_customer_autopay_consents.customer_id
      AND pm.stripe_connected_account_id = tenant_customer_autopay_consents.stripe_connected_account_id
  )
);

CREATE POLICY tenant_customer_autopay_consents_update_account_scope
ON public.tenant_customer_autopay_consents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
  AND (
    consented_by_user_id IS NULL
    OR consented_by_user_id = auth.uid()
  )
  AND (
    disabled_by_user_id IS NULL
    OR disabled_by_user_id = auth.uid()
  )
  AND (
    paused_by_user_id IS NULL
    OR paused_by_user_id = auth.uid()
  )
  AND (
    revoked_by_user_id IS NULL
    OR revoked_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_customer_autopay_consents.customer_id
      AND c.owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements ma
    WHERE ma.id = tenant_customer_autopay_consents.maintenance_agreement_id
      AND ma.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND ma.customer_id = tenant_customer_autopay_consents.customer_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_stripe_customers tsc
    WHERE tsc.id = tenant_customer_autopay_consents.tenant_stripe_customer_id
      AND tsc.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND tsc.customer_id = tenant_customer_autopay_consents.customer_id
      AND tsc.stripe_connected_account_id = tenant_customer_autopay_consents.stripe_connected_account_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_customer_payment_methods pm
    WHERE pm.id = tenant_customer_autopay_consents.tenant_customer_payment_method_id
      AND pm.account_owner_user_id = tenant_customer_autopay_consents.account_owner_user_id
      AND pm.customer_id = tenant_customer_autopay_consents.customer_id
      AND pm.stripe_connected_account_id = tenant_customer_autopay_consents.stripe_connected_account_id
  )
);

-- No DELETE policy in this foundation slice.

CREATE TABLE IF NOT EXISTS public.tenant_saved_method_payment_attempts (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id                     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id                      uuid        NOT NULL REFERENCES public.internal_invoices(id) ON DELETE RESTRICT,
  billing_period_id               uuid        NULL REFERENCES public.maintenance_agreement_billing_periods(id) ON DELETE SET NULL,
  maintenance_agreement_id        uuid        NULL REFERENCES public.maintenance_agreements(id) ON DELETE SET NULL,
  tenant_stripe_customer_id       uuid        NULL REFERENCES public.tenant_stripe_customers(id) ON DELETE SET NULL,
  tenant_customer_payment_method_id uuid      NULL REFERENCES public.tenant_customer_payment_methods(id) ON DELETE SET NULL,
  tenant_customer_autopay_consent_id uuid     NULL REFERENCES public.tenant_customer_autopay_consents(id) ON DELETE SET NULL,
  stripe_connected_account_id     text        NOT NULL,
  stripe_customer_id_snapshot     text        NULL,
  stripe_payment_method_id_snapshot text      NULL,
  attempt_kind                    text        NOT NULL,
  attempt_status                  text        NOT NULL,
  amount_cents_snapshot           integer     NOT NULL,
  currency_code_snapshot          text        NOT NULL DEFAULT 'usd',
  invoice_balance_due_cents_snapshot integer  NOT NULL,
  invoice_status_snapshot         text        NOT NULL,
  billing_period_status_snapshot  text        NULL,
  consent_status_snapshot         text        NULL,
  payment_method_status_snapshot  text        NULL,
  stripe_payment_intent_id        text        NULL,
  stripe_charge_id                text        NULL,
  stripe_last_event_id            text        NULL,
  stripe_idempotency_key          text        NOT NULL,
  blocked_reason_code             text        NULL,
  failure_code                    text        NULL,
  failure_message                 text        NULL,
  requires_action_type            text        NULL,
  retry_count                     integer     NOT NULL DEFAULT 0,
  next_retry_at                   timestamptz NULL,
  triggered_by                    text        NOT NULL,
  triggered_by_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at                    timestamptz NULL,
  resolved_at                     timestamptz NULL,
  resolved_internal_invoice_payment_id uuid   NULL REFERENCES public.internal_invoice_payments(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_saved_method_payment_attempts_kind_valid_chk
    CHECK (attempt_kind IN ('manual_saved_method', 'scheduled_autopay')),

  CONSTRAINT tenant_saved_method_payment_attempts_status_valid_chk
    CHECK (attempt_status IN ('pending', 'submitted', 'succeeded', 'failed_declined', 'failed_requires_action', 'blocked_precondition', 'retry_scheduled', 'abandoned')),

  CONSTRAINT tenant_saved_method_payment_attempts_triggered_by_valid_chk
    CHECK (triggered_by IN ('internal_user', 'scheduler', 'recovery_worker')),

  CONSTRAINT tenant_saved_method_payment_attempts_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_customer_id_format_chk
    CHECK (stripe_customer_id_snapshot IS NULL OR stripe_customer_id_snapshot ~ '^cus_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_payment_method_id_format_chk
    CHECK (stripe_payment_method_id_snapshot IS NULL OR stripe_payment_method_id_snapshot ~ '^pm_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_payment_intent_id_format_chk
    CHECK (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_charge_id_format_chk
    CHECK (stripe_charge_id IS NULL OR stripe_charge_id ~ '^ch_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_event_id_format_chk
    CHECK (stripe_last_event_id IS NULL OR stripe_last_event_id ~ '^evt_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_saved_method_payment_attempts_positive_amount_chk
    CHECK (amount_cents_snapshot > 0),

  CONSTRAINT tenant_saved_method_payment_attempts_invoice_balance_snapshot_nonnegative_chk
    CHECK (invoice_balance_due_cents_snapshot >= 0),

  CONSTRAINT tenant_saved_method_payment_attempts_currency_lowercase_iso_chk
    CHECK (currency_code_snapshot ~ '^[a-z]{3}$'),

  CONSTRAINT tenant_saved_method_payment_attempts_retry_count_nonnegative_chk
    CHECK (retry_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_saved_method_payment_attempts_idempotency_key_unique_idx
  ON public.tenant_saved_method_payment_attempts (stripe_idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_saved_method_payment_attempts_one_inflight_per_invoice_kind_idx
  ON public.tenant_saved_method_payment_attempts (invoice_id, attempt_kind)
  WHERE attempt_status IN ('pending', 'submitted', 'retry_scheduled');

CREATE UNIQUE INDEX IF NOT EXISTS tenant_saved_method_payment_attempts_resolved_payment_unique_idx
  ON public.tenant_saved_method_payment_attempts (resolved_internal_invoice_payment_id)
  WHERE resolved_internal_invoice_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_saved_method_payment_attempts_owner_status_idx
  ON public.tenant_saved_method_payment_attempts (account_owner_user_id, attempt_status, created_at DESC);

ALTER TABLE public.tenant_saved_method_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_saved_method_payment_attempts_select_account_scope
  ON public.tenant_saved_method_payment_attempts;
DROP POLICY IF EXISTS tenant_saved_method_payment_attempts_insert_account_scope
  ON public.tenant_saved_method_payment_attempts;
DROP POLICY IF EXISTS tenant_saved_method_payment_attempts_update_account_scope
  ON public.tenant_saved_method_payment_attempts;

CREATE POLICY tenant_saved_method_payment_attempts_select_account_scope
ON public.tenant_saved_method_payment_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
);

CREATE POLICY tenant_saved_method_payment_attempts_insert_account_scope
ON public.tenant_saved_method_payment_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
  AND (
    triggered_by_user_id IS NULL
    OR triggered_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_saved_method_payment_attempts.customer_id
      AND c.owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    WHERE invoice.id = tenant_saved_method_payment_attempts.invoice_id
      AND invoice.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
      AND invoice.customer_id = tenant_saved_method_payment_attempts.customer_id
  )
);

CREATE POLICY tenant_saved_method_payment_attempts_update_account_scope
ON public.tenant_saved_method_payment_attempts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
  AND (
    triggered_by_user_id IS NULL
    OR triggered_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = tenant_saved_method_payment_attempts.customer_id
      AND c.owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    WHERE invoice.id = tenant_saved_method_payment_attempts.invoice_id
      AND invoice.account_owner_user_id = tenant_saved_method_payment_attempts.account_owner_user_id
      AND invoice.customer_id = tenant_saved_method_payment_attempts.customer_id
  )
);

-- No DELETE policy in this foundation slice.

CREATE TABLE IF NOT EXISTS public.tenant_stripe_event_receipts (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id                     uuid        NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  stripe_connected_account_id     text        NOT NULL,
  stripe_event_id                 text        NOT NULL,
  stripe_event_type               text        NOT NULL,
  stripe_object_id                text        NULL,
  processing_scope                text        NOT NULL,
  receipt_status                  text        NOT NULL,
  related_table_name              text        NULL,
  related_row_id                  uuid        NULL,
  payload_hash                    text        NULL,
  livemode                        boolean     NOT NULL DEFAULT false,
  api_version                     text        NULL,
  first_received_at               timestamptz NOT NULL DEFAULT now(),
  processed_at                    timestamptz NULL,
  failure_message                 text        NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_stripe_event_receipts_scope_valid_chk
    CHECK (processing_scope IN ('setup', 'payment_method', 'saved_method_attempt')),

  CONSTRAINT tenant_stripe_event_receipts_status_valid_chk
    CHECK (receipt_status IN ('received', 'processed', 'ignored', 'failed')),

  CONSTRAINT tenant_stripe_event_receipts_connected_account_format_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),

  CONSTRAINT tenant_stripe_event_receipts_event_id_format_chk
    CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_stripe_event_receipts_connected_event_unique_idx
  ON public.tenant_stripe_event_receipts (stripe_connected_account_id, stripe_event_id);

CREATE INDEX IF NOT EXISTS tenant_stripe_event_receipts_owner_scope_status_idx
  ON public.tenant_stripe_event_receipts (account_owner_user_id, processing_scope, receipt_status, created_at DESC);

ALTER TABLE public.tenant_stripe_event_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_stripe_event_receipts_select_account_scope
  ON public.tenant_stripe_event_receipts;
DROP POLICY IF EXISTS tenant_stripe_event_receipts_insert_account_scope
  ON public.tenant_stripe_event_receipts;
DROP POLICY IF EXISTS tenant_stripe_event_receipts_update_account_scope
  ON public.tenant_stripe_event_receipts;

CREATE POLICY tenant_stripe_event_receipts_select_account_scope
ON public.tenant_stripe_event_receipts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
  )
);

CREATE POLICY tenant_stripe_event_receipts_insert_account_scope
ON public.tenant_stripe_event_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
  )
  AND (
    customer_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = tenant_stripe_event_receipts.customer_id
        AND c.owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
    )
  )
);

CREATE POLICY tenant_stripe_event_receipts_update_account_scope
ON public.tenant_stripe_event_receipts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
  )
  AND (
    customer_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = tenant_stripe_event_receipts.customer_id
        AND c.owner_user_id = tenant_stripe_event_receipts.account_owner_user_id
    )
  )
);

-- No DELETE policy in this foundation slice.

COMMIT;
