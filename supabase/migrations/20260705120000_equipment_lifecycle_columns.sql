BEGIN;

-- Equipment lifecycle + canonical-schema shape (VISUAL-ALIGNMENT-SPEC.md §8.4).
-- Additive only: new nullable/defaulted columns, new constraints, one policy
-- replacement. No existing column is dropped, renamed, or rewritten, and no
-- row data is mutated. Historical job_equipment/job_systems rows are left
-- untouched per the §8.3 decision (immutable snapshots, not migrated here).

-- 1. Spec fields equipment has always been missing relative to job_equipment.
--    Nullable, no default: no existing equipment row ever captured these
--    (addCustomerLocationEquipmentFromForm never wrote them), so NULL is the
--    accurate backfill value, not a placeholder.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS tonnage numeric,
  ADD COLUMN IF NOT EXISTS refrigerant_type text,
  ADD COLUMN IF NOT EXISTS heating_capacity_kbtu numeric,
  ADD COLUMN IF NOT EXISTS heating_output_btu numeric,
  ADD COLUMN IF NOT EXISTS heating_efficiency_percent numeric;

-- 2. Lifecycle.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retired_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS retire_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by_equipment_id uuid
    REFERENCES public.equipment(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipment.replaced_by_equipment_id IS
  'Points at the unit that replaced this one. FK is ON DELETE SET NULL, which
   only protects against the *new* unit being deleted while pointed at (silently
   un-links rather than erroring). There is no delete action for canonical
   equipment yet (create-only as of this migration) — once one is added, it must
   forbid hard-deleting any row that another row''s replaced_by_equipment_id
   points at, rather than relying on this FK''s SET NULL behavior to paper over
   a broken lifecycle chain.';

-- 3. Explicit provenance — replaces "which table is this row in" as the signal.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS install_source text NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS source_job_id uuid
    REFERENCES public.jobs(id) ON DELETE SET NULL;

-- Every existing equipment row was created via the profile-only path with no
-- job reference, so 'standalone' is the factually correct default for 100%
-- of current rows, not just a convenient placeholder.

-- Constraints (text + CHECK, matching this repo's existing convention —
-- see jobs_status_check / jobs_billing_recipient_check — not a Postgres enum).
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'retired'::text])),
  ADD CONSTRAINT equipment_retire_reason_check
    CHECK (retire_reason IS NULL OR retire_reason = ANY (ARRAY['failure'::text, 'warranty'::text, 'upgrade'::text])),
  ADD CONSTRAINT equipment_retirement_consistency_chk
    CHECK (
      (status = 'active' AND retired_at IS NULL AND retire_reason IS NULL)
      OR
      (status = 'retired' AND retired_at IS NOT NULL AND retire_reason IS NOT NULL)
    ),
  ADD CONSTRAINT equipment_replaced_by_not_self
    CHECK (replaced_by_equipment_id IS NULL OR replaced_by_equipment_id <> id),
  ADD CONSTRAINT equipment_install_source_check
    CHECK (install_source = ANY (ARRAY['job'::text, 'contractor'::text, 'standalone'::text])),
  ADD CONSTRAINT equipment_source_job_consistency_chk
    CHECK ((install_source = 'job') = (source_job_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS equipment_status_idx ON public.equipment(status);
CREATE INDEX IF NOT EXISTS equipment_replaced_by_equipment_id_idx ON public.equipment(replaced_by_equipment_id);
CREATE INDEX IF NOT EXISTS equipment_source_job_id_idx ON public.equipment(source_job_id);

-- 4. RLS fix: the existing policy hard-requires system_id IS NOT NULL in both
--    USING and WITH CHECK, which makes standalone equipment (system_id NULL —
--    already permitted by the insert trigger) invisible to internal users.
--    This is a live bug, not latent: app/customers/[id]/page.tsx builds its
--    supabase client via createClient() (anon key, session-scoped, RLS-subject)
--    and passes it straight into loadCustomerSystemsEquipmentSummary, which
--    queries equipment directly — confirmed the only non-admin-client read path
--    onto this table. (Writes go through addCustomerLocationEquipmentFromForm's
--    admin/service-role client, which bypasses RLS entirely and was never
--    affected by this gap.)
DROP POLICY IF EXISTS equipment_profile_internal_all_account_scope ON public.equipment;

CREATE POLICY equipment_profile_internal_all_account_scope
ON public.equipment
FOR ALL
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.locations loc
    JOIN public.customers cust ON cust.id = loc.customer_id
    WHERE loc.id = equipment.location_id
      AND loc.owner_user_id = public.current_internal_account_owner_id()
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
  AND (
    equipment.system_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customer_location_systems cls
      WHERE cls.id = equipment.system_id
        AND cls.location_id = equipment.location_id
        AND cls.owner_user_id = public.current_internal_account_owner_id()
        AND cls.archived_at IS NULL
    )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.locations loc
    JOIN public.customers cust ON cust.id = loc.customer_id
    WHERE loc.id = equipment.location_id
      AND loc.owner_user_id = public.current_internal_account_owner_id()
      AND cust.owner_user_id = public.current_internal_account_owner_id()
  )
  AND (
    equipment.system_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customer_location_systems cls
      WHERE cls.id = equipment.system_id
        AND cls.location_id = equipment.location_id
        AND cls.owner_user_id = public.current_internal_account_owner_id()
        AND cls.archived_at IS NULL
    )
  )
);

-- 5. Documentation only — flags the dormant-looking FK found in the audit so
--    future work on the Replace flow doesn't accidentally repoint it.
COMMENT ON COLUMN public.ecc_test_runs.equipment_id IS
  'FK to public.equipment(id), ON DELETE SET NULL. Must stay pinned to the
   specific physical unit that was actually tested at the time of the test run
   — never reassigned to follow equipment.replaced_by_equipment_id when a unit
   is later replaced. A test run is a historical record of what was measured on
   a specific piece of hardware; the compliance/service history value of this
   column depends on it never silently pointing at a different (newer) unit.
   As of this migration, no form in the app populates this column — flagged in
   the pre-redesign audit as possibly dead; left as-is here, not removed.';

COMMIT;
