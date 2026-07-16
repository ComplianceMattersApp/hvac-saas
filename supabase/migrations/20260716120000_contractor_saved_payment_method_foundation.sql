-- Contractor-owned saved-card foundation.
-- A contractor card must never be attached to the homeowner/customer row on a
-- contractor-billed invoice. Stripe secrets/card data remain in Stripe; these
-- tables store only processor references and display-safe metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_contractor_stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  stripe_connected_account_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  profile_status text NOT NULL DEFAULT 'active',
  is_current boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_contractor_stripe_customers_status_chk
    CHECK (profile_status IN ('active', 'stale_or_invalid', 'disconnected', 'superseded')),
  CONSTRAINT tenant_contractor_stripe_customers_account_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_stripe_customers_customer_chk
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_stripe_customers_current_idx
  ON public.tenant_contractor_stripe_customers
  (account_owner_user_id, contractor_id, stripe_connected_account_id)
  WHERE is_current = true;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_stripe_customers_processor_idx
  ON public.tenant_contractor_stripe_customers
  (stripe_connected_account_id, stripe_customer_id);

CREATE TABLE IF NOT EXISTS public.tenant_contractor_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  tenant_contractor_stripe_customer_id uuid NOT NULL
    REFERENCES public.tenant_contractor_stripe_customers(id) ON DELETE RESTRICT,
  stripe_connected_account_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  payment_method_status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  display_brand text NULL,
  display_last4 text NULL,
  display_exp_month integer NULL,
  display_exp_year integer NULL,
  display_funding text NULL,
  display_wallet_type text NULL,
  attached_at timestamptz NULL,
  detached_at timestamptz NULL,
  last_verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_contractor_payment_methods_status_chk
    CHECK (payment_method_status IN ('active', 'inactive', 'expired_display_only', 'detached', 'invalid', 'stale_or_invalid')),
  CONSTRAINT tenant_contractor_payment_methods_account_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_payment_methods_customer_chk
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_payment_methods_method_chk
    CHECK (stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_payment_methods_last4_chk
    CHECK (display_last4 IS NULL OR display_last4 ~ '^[0-9]{4}$'),
  CONSTRAINT tenant_contractor_payment_methods_month_chk
    CHECK (display_exp_month IS NULL OR display_exp_month BETWEEN 1 AND 12),
  CONSTRAINT tenant_contractor_payment_methods_year_chk
    CHECK (display_exp_year IS NULL OR display_exp_year >= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_payment_methods_processor_idx
  ON public.tenant_contractor_payment_methods
  (stripe_connected_account_id, stripe_payment_method_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_payment_methods_default_idx
  ON public.tenant_contractor_payment_methods (tenant_contractor_stripe_customer_id)
  WHERE is_default = true AND payment_method_status = 'active';

CREATE TABLE IF NOT EXISTS public.tenant_contractor_saved_payment_method_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  tenant_contractor_stripe_customer_id uuid NULL
    REFERENCES public.tenant_contractor_stripe_customers(id) ON DELETE SET NULL,
  tenant_contractor_payment_method_id uuid NULL
    REFERENCES public.tenant_contractor_payment_methods(id) ON DELETE SET NULL,
  stripe_connected_account_id text NOT NULL,
  stripe_customer_id text NULL,
  setup_status text NOT NULL DEFAULT 'initiated',
  stripe_setup_intent_id text NULL,
  stripe_checkout_session_id text NULL,
  stripe_payment_method_id text NULL,
  stripe_last_event_id text NULL,
  initiated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  return_url_path text NOT NULL DEFAULT '/portal/invoices',
  failure_code text NULL,
  failure_message text NULL,
  canceled_at timestamptz NULL,
  succeeded_at timestamptz NULL,
  failed_at timestamptz NULL,
  last_event_received_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_contractor_saved_method_setups_status_chk
    CHECK (setup_status IN ('initiated', 'pending_customer_action', 'processing', 'succeeded', 'failed', 'canceled', 'expired', 'stale_or_invalid')),
  CONSTRAINT tenant_contractor_saved_method_setups_account_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_saved_method_setups_customer_chk
    CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_saved_method_setups_intent_chk
    CHECK (stripe_setup_intent_id IS NULL OR stripe_setup_intent_id ~ '^seti_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_saved_method_setups_session_chk
    CHECK (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_saved_method_setups_method_chk
    CHECK (stripe_payment_method_id IS NULL OR stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_saved_method_setups_event_chk
    CHECK (stripe_last_event_id IS NULL OR stripe_last_event_id ~ '^evt_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_saved_method_setups_session_idx
  ON public.tenant_contractor_saved_payment_method_setups (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_saved_method_setups_intent_idx
  ON public.tenant_contractor_saved_payment_method_setups (stripe_setup_intent_id)
  WHERE stripe_setup_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_contractor_stripe_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  stripe_connected_account_id text NOT NULL,
  stripe_event_id text NOT NULL,
  stripe_event_type text NOT NULL,
  stripe_object_id text NULL,
  receipt_status text NOT NULL DEFAULT 'received',
  failure_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  CONSTRAINT tenant_contractor_stripe_event_receipts_account_chk
    CHECK (stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_stripe_event_receipts_event_chk
    CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  CONSTRAINT tenant_contractor_stripe_event_receipts_status_chk
    CHECK (receipt_status IN ('received', 'processed', 'failed', 'ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_contractor_stripe_event_receipts_event_idx
  ON public.tenant_contractor_stripe_event_receipts
  (stripe_connected_account_id, stripe_event_id);

-- Reads are available to same-account active internal users and to members of
-- the owning contractor. All writes remain service-role only.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_contractor_stripe_customers',
    'tenant_contractor_payment_methods',
    'tenant_contractor_saved_payment_method_setups',
    'tenant_contractor_stripe_event_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_scoped_select', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.internal_users actor
          WHERE actor.user_id = auth.uid() AND actor.is_active = true
            AND actor.account_owner_user_id = %I.account_owner_user_id)
        OR public.current_user_has_contractor_membership(%I.contractor_id)
      )',
      table_name || '_scoped_select', table_name, table_name, table_name
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.tenant_contractor_payment_methods IS
  'Contractor-owned Stripe payment method references and display-safe card metadata; never homeowner/customer ownership.';
COMMENT ON TABLE public.tenant_contractor_saved_payment_method_setups IS
  'Contractor portal saved-card setup workflow. Setup never charges money or marks an invoice paid.';

COMMIT;
