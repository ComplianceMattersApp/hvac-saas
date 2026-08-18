BEGIN;

-- Bridge between the two equipment worlds (VISUAL-ALIGNMENT-SPEC.md §8):
--   job_equipment            = immutable per-job snapshots (compliance record)
--   equipment                = canonical, location-owned physical units
--
-- Until now nothing connected them: equipment captured on a job never reached
-- the address's canonical inventory, so a new job at a known address started
-- from zero ("recapture everything"). This column records which physical unit
-- a job snapshot documents, letting capture flows adopt units into the
-- location inventory and letting new jobs seed their snapshot from what is
-- already on file — without ever rewriting historical snapshot rows.
--
-- ON DELETE SET NULL: losing the canonical row must never take the compliance
-- snapshot down with it; the snapshot simply becomes unlinked again.

ALTER TABLE public.job_equipment
  ADD COLUMN IF NOT EXISTS canonical_equipment_id uuid
    REFERENCES public.equipment(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_equipment.canonical_equipment_id IS
  'The canonical location-owned physical unit (public.equipment) this job
   snapshot documents. Nullable: legacy rows and workshare-received snapshots
   are unlinked. Linking is provenance only — snapshot fields stay frozen per
   job and are never rewritten to follow the canonical row.';

CREATE INDEX IF NOT EXISTS job_equipment_canonical_equipment_id_idx
  ON public.job_equipment(canonical_equipment_id);

COMMIT;
