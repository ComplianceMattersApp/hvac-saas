BEGIN;

-- Atomic retire+install for the equipment Replace flow (VISUAL-ALIGNMENT-SPEC.md §8.5 step 3).
-- A PL/pgSQL function body executes as a single statement from the caller's
-- point of view, so if the insert or the retiring update fails, both roll
-- back together — this is what prevents ending up with a retired unit and no
-- replacement (or two simultaneously active units) if only one write lands.

CREATE OR REPLACE FUNCTION public.replace_customer_location_equipment(
  p_owner_user_id uuid,
  p_old_equipment_id uuid,
  p_retire_reason text,
  p_location_id uuid,
  p_system_id uuid,
  p_equipment_type text,
  p_manufacturer text,
  p_model text,
  p_serial text,
  p_notes text,
  p_tonnage numeric,
  p_refrigerant_type text,
  p_heating_capacity_kbtu numeric,
  p_heating_output_btu numeric,
  p_heating_efficiency_percent numeric,
  p_install_source text,
  p_source_job_id uuid
)
RETURNS public.equipment
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old public.equipment;
  v_new public.equipment;
BEGIN
  -- Lock the old row for the life of this call so a concurrent replace can't
  -- also read it as still-active and mint a second successor.
  SELECT * INTO v_old
  FROM public.equipment
  WHERE id = p_old_equipment_id
    AND owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Equipment % not found in account scope', p_old_equipment_id
      USING ERRCODE = '22023';
  END IF;

  -- Defense in depth: the caller's requireScopedEquipmentForMutation already
  -- confirms this, but re-check location here too — owner_user_id alone
  -- isn't enough scope, since one account can own multiple locations.
  IF v_old.location_id <> p_location_id THEN
    RAISE EXCEPTION 'Equipment % does not belong to location %', p_old_equipment_id, p_location_id
      USING ERRCODE = '22023';
  END IF;

  IF v_old.status = 'retired' THEN
    RAISE EXCEPTION 'Equipment % is already retired', p_old_equipment_id
      USING ERRCODE = '22023';
  END IF;

  -- Insert the replacement first so the retiring row has something to point at.
  -- validate_profile_owned_equipment_scope (trigger) still enforces that
  -- p_system_id, if set, is an active system on p_location_id for this owner.
  INSERT INTO public.equipment (
    owner_user_id, location_id, system_id, equipment_type,
    manufacturer, model, serial, notes,
    tonnage, refrigerant_type,
    heating_capacity_kbtu, heating_output_btu, heating_efficiency_percent,
    install_source, source_job_id, status
  ) VALUES (
    p_owner_user_id, p_location_id, p_system_id, p_equipment_type,
    p_manufacturer, p_model, p_serial, p_notes,
    p_tonnage, p_refrigerant_type,
    p_heating_capacity_kbtu, p_heating_output_btu, p_heating_efficiency_percent,
    p_install_source, p_source_job_id, 'active'
  )
  RETURNING * INTO v_new;

  UPDATE public.equipment
  SET status = 'retired',
      retired_at = now(),
      retire_reason = p_retire_reason,
      replaced_by_equipment_id = v_new.id
  WHERE id = v_old.id;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.replace_customer_location_equipment IS
  'Atomically retires one equipment row and installs its replacement. Called
   via supabase.rpc() from replaceCustomerLocationEquipmentFromForm using the
   service-role/admin client — app-level account/customer/location scoping
   happens before this is invoked, and owner_user_id is re-checked here as
   defense in depth (matching validate_profile_owned_equipment_scope). Not
   granted to authenticated/anon: see the REVOKE below. If a caller ever needs
   to invoke this from a non-admin/session client, add real auth.uid()-based
   ownership verification here first — right now it trusts p_owner_user_id as
   given, which is only safe because only the trusted server action supplies it.';

-- Functions are executable by PUBLIC by default unless revoked. This function
-- trusts its p_owner_user_id argument rather than deriving it from auth.uid(),
-- so it must stay restricted to roles that bypass grants (service_role) —
-- never exposed to authenticated/anon.
REVOKE EXECUTE ON FUNCTION public.replace_customer_location_equipment(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text,
  numeric, text, numeric, numeric, numeric, text, uuid
) FROM PUBLIC;

COMMIT;
