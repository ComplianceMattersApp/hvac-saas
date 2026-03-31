-- Add heating capacity field for furnace/heat-only equipment
-- This is the approved additive bridge: furnace uses heating_capacity_kbtu,
-- cooling equipment continues using tonnage.

ALTER TABLE public.job_equipment ADD COLUMN heating_capacity_kbtu numeric;

COMMENT ON COLUMN public.job_equipment.heating_capacity_kbtu IS 
  'Heating output capacity in KBTU/h. Used exclusively by furnace and heat-only equipment.
   Cooling equipment (condenser, coil, heat pump) uses the tonnage field instead.
   This is an additive bridge: both fields may coexist. Long-term unification planned for v2.0.
   Nullable to preserve backward compatibility with existing cooling records.';
