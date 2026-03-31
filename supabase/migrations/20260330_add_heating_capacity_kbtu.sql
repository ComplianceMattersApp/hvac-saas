-- Add heating capacity field for furnace/heat-only equipment
-- This is the approved additive bridge: furnace uses heating_capacity_kbtu,
-- cooling equipment continues using tonnage.
--
-- Unit-split design (do not re-audit):
--   heating_capacity_kbtu  = equipment nameplate rated capacity (kBTU/h)
--                            stored at equipment level; used for system sizing context.
--   heating_output_btu     = operator-entered output in BTU/h; primary prefill source
--                            for the duct leakage test form (added 20260331).
--   When heating_output_btu is NULL, the test page derives it as:
--     heating_capacity_kbtu * 1000  (exact unit conversion, not an approximation).
--   The two fields can diverge only when a tech explicitly enters a different
--   measured output from the nameplate — this is intentional and valid.

ALTER TABLE public.job_equipment ADD COLUMN heating_capacity_kbtu numeric;

COMMENT ON COLUMN public.job_equipment.heating_capacity_kbtu IS 
  'Equipment nameplate rated capacity in kBTU/h. Used exclusively by furnace and heat-only equipment.
   Cooling equipment (condenser, coil, heat pump) uses the tonnage field instead.
   UNIT SPLIT: this is the nameplate value (kBTU/h). The test-form prefill field is
   heating_output_btu (BTU/h). When heating_output_btu is NULL, the test page falls
   back to heating_capacity_kbtu * 1000 as an exact unit conversion.
   Nullable to preserve backward compatibility with existing cooling records.';
