-- Compliance Matters: customer/location account-scope reconciliation
-- Purpose: align customer/location reads for internal teammates to the
-- same account-owner model already used by jobs and service_cases while
-- preserving contractor job-derived read visibility.

BEGIN;

DROP POLICY IF EXISTS customers_internal_all_account_scope ON public.customers;
DROP POLICY IF EXISTS customers_contractor_select_own_jobs_scope ON public.customers;
DROP POLICY IF EXISTS locations_internal_all_account_scope ON public.locations;

CREATE POLICY customers_internal_all_account_scope
ON public.customers
FOR ALL
TO authenticated
USING (
  owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY customers_contractor_select_own_jobs_scope
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.contractor_users cu
      ON cu.contractor_id = j.contractor_id
    WHERE cu.user_id = auth.uid()
      AND j.customer_id = customers.id
      AND j.deleted_at IS NULL
  )
);

CREATE POLICY locations_internal_all_account_scope
ON public.locations
FOR ALL
TO authenticated
USING (
  owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customers cust
    WHERE cust.id = locations.customer_id
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
)
WITH CHECK (
  owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customers cust
    WHERE cust.id = locations.customer_id
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
);

COMMIT;