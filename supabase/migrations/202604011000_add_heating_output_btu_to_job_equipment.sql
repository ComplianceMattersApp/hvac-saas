-- Add heating output (BTU/h) field for furnace/heat-only equipment.
-- Distinct from heating_capacity_kbtu (rated kBTU/h): this stores the
-- measured/confirmed output in BTU/h so the duct leakage test form can
-- be pre-populated without requiring manual re-entry.

ALTER TABLE public.job_equipment ADD COLUMN heating_output_btu numeric;

COMMENT ON COLUMN public.job_equipment.heating_output_btu IS
  'Heating output in BTU/h as entered at intake or equipment setup.
   Used to pre-populate the duct leakage test form heating_output_btu field.
   Nullable; furnace-only. Distinct from heating_capacity_kbtu (rated kBTU/h).';
