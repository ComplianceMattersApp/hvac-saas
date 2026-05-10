-- Compliance Matters: account settings product mode foundation v1
-- Purpose: add account-level product_mode storage for Product Mode V2 resolver
-- precedence without changing billing, entitlements, or workflow restrictions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_settings (
  account_owner_user_id         uuid        NOT NULL,
  product_mode                  text        NULL,
  product_mode_updated_at       timestamptz NULL,
  product_mode_updated_by_user_id uuid      NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT account_settings_pkey
    PRIMARY KEY (account_owner_user_id),

  CONSTRAINT account_settings_account_owner_fk
    FOREIGN KEY (account_owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  CONSTRAINT account_settings_product_mode_updated_by_fk
    FOREIGN KEY (product_mode_updated_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT account_settings_product_mode_valid_chk
    CHECK (
      product_mode IS NULL
      OR product_mode IN ('hybrid', 'hvac_service', 'ecc_hers')
    )
);

DROP TRIGGER IF EXISTS account_settings_set_updated_at ON public.account_settings;
CREATE TRIGGER account_settings_set_updated_at
BEFORE UPDATE ON public.account_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_settings_select_account_scope
  ON public.account_settings;

CREATE POLICY account_settings_select_account_scope
ON public.account_settings
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;
