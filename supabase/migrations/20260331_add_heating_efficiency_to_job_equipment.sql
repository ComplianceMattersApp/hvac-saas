-- Add heating efficiency % field for furnace/heat-only equipment
-- Mirrors the pattern used by heating_capacity_kbtu (20260330).
-- Used to pre-populate the duct leakage test form when a furnace AFUE
-- is recorded at intake so techs don't have to re-enter it.

ALTER TABLE public.job_equipment ADD COLUMN heating_efficiency_percent numeric;

COMMENT ON COLUMN public.job_equipment.heating_efficiency_percent IS
  'Rated heating efficiency as a percentage (e.g. AFUE 80 = 80).
   Used exclusively by furnace and heat-only equipment.
   Nullable to preserve backward compatibility with existing records.
   Surfaced in duct leakage test form as a default for heating_efficiency_percent.';
