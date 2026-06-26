BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_location_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  system_type text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  archived_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS customer_location_systems_owner_user_id_idx
  ON public.customer_location_systems(owner_user_id);

CREATE INDEX IF NOT EXISTS customer_location_systems_customer_id_idx
  ON public.customer_location_systems(customer_id);

CREATE INDEX IF NOT EXISTS customer_location_systems_location_id_idx
  ON public.customer_location_systems(location_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_location_systems_active_location_name_unique
  ON public.customer_location_systems(location_id, lower(name))
  WHERE archived_at IS NULL;

CREATE OR REPLACE TRIGGER set_customer_location_systems_updated_at
BEFORE UPDATE ON public.customer_location_systems
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_location_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_location_systems_internal_all_account_scope
  ON public.customer_location_systems;

CREATE POLICY customer_location_systems_internal_all_account_scope
ON public.customer_location_systems
FOR ALL
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customers cust
    JOIN public.locations loc
      ON loc.id = customer_location_systems.location_id
     AND loc.customer_id = cust.id
    WHERE cust.id = customer_location_systems.customer_id
      AND cust.owner_user_id = public.current_internal_account_owner_id()
      AND loc.owner_user_id = public.current_internal_account_owner_id()
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customers cust
    JOIN public.locations loc
      ON loc.id = customer_location_systems.location_id
     AND loc.customer_id = cust.id
    WHERE cust.id = customer_location_systems.customer_id
      AND cust.owner_user_id = public.current_internal_account_owner_id()
      AND loc.owner_user_id = public.current_internal_account_owner_id()
  )
);

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES public.customer_location_systems(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS equipment_system_id_idx
  ON public.equipment(system_id);

CREATE OR REPLACE FUNCTION public.validate_profile_owned_equipment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.system_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_location_systems cls
    WHERE cls.id = NEW.system_id
      AND cls.location_id = NEW.location_id
      AND cls.owner_user_id = NEW.owner_user_id
      AND cls.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'equipment.system_id must match an active same-account location system'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profile_owned_equipment_scope
  ON public.equipment;

CREATE TRIGGER validate_profile_owned_equipment_scope
BEFORE INSERT OR UPDATE OF system_id, location_id, owner_user_id
ON public.equipment
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_owned_equipment_scope();

DROP POLICY IF EXISTS equipment_profile_internal_all_account_scope
  ON public.equipment;

CREATE POLICY equipment_profile_internal_all_account_scope
ON public.equipment
FOR ALL
TO authenticated
USING (
  system_id IS NOT NULL
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customer_location_systems cls
    JOIN public.customers cust
      ON cust.id = cls.customer_id
    JOIN public.locations loc
      ON loc.id = cls.location_id
    WHERE cls.id = equipment.system_id
      AND cls.owner_user_id = public.current_internal_account_owner_id()
      AND cls.archived_at IS NULL
      AND loc.id = equipment.location_id
      AND loc.owner_user_id = public.current_internal_account_owner_id()
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
)
WITH CHECK (
  system_id IS NOT NULL
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.customer_location_systems cls
    JOIN public.customers cust
      ON cust.id = cls.customer_id
    JOIN public.locations loc
      ON loc.id = cls.location_id
    WHERE cls.id = equipment.system_id
      AND cls.owner_user_id = public.current_internal_account_owner_id()
      AND cls.archived_at IS NULL
      AND loc.id = equipment.location_id
      AND loc.owner_user_id = public.current_internal_account_owner_id()
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
);

COMMIT;
