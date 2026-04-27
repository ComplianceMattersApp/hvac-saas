-- Compliance Matters: pricebook seed identity/versioning foundation (D2C-1/D2C-2)
-- Purpose:
--   1) Add seed metadata columns for starter identity/versioning.
--   2) Add safety constraints for seed metadata quality.
--   3) Add partial uniqueness on account_owner_user_id + seed_key.
--   4) Backfill known v1 starter rows with metadata only.
--
-- Guardrails:
--   - No Starter Kit V2 rows are inserted.
--   - No existing business values are changed (names, categories, units, prices, active state).
--   - Only seed_key/starter_version metadata is populated for known legacy starter rows.

BEGIN;

ALTER TABLE public.pricebook_items
  ADD COLUMN IF NOT EXISTS seed_key text NULL,
  ADD COLUMN IF NOT EXISTS starter_version text NULL;

ALTER TABLE public.pricebook_items
  DROP CONSTRAINT IF EXISTS pricebook_items_seed_key_trimmed_chk;

ALTER TABLE public.pricebook_items
  ADD CONSTRAINT pricebook_items_seed_key_trimmed_chk
  CHECK (
    seed_key IS NULL
    OR (length(btrim(seed_key)) > 0 AND btrim(seed_key) = seed_key)
  );

ALTER TABLE public.pricebook_items
  DROP CONSTRAINT IF EXISTS pricebook_items_seed_key_format_chk;

ALTER TABLE public.pricebook_items
  ADD CONSTRAINT pricebook_items_seed_key_format_chk
  CHECK (
    seed_key IS NULL
    OR seed_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
  );

ALTER TABLE public.pricebook_items
  DROP CONSTRAINT IF EXISTS pricebook_items_starter_version_required_with_seed_key_chk;

ALTER TABLE public.pricebook_items
  ADD CONSTRAINT pricebook_items_starter_version_required_with_seed_key_chk
  CHECK (
    seed_key IS NULL
    OR (
      starter_version IS NOT NULL
      AND length(btrim(starter_version)) > 0
      AND btrim(starter_version) = starter_version
    )
  );

-- Backfill known v1 starter rows by metadata only.
-- Duplicate-safe behavior:
--   For each account_owner_user_id + legacy item_name, only one canonical row
--   receives seed metadata (rn = 1). Duplicate same-name starter rows are left
--   unmapped (seed_key remains NULL) for later manual remediation.
WITH legacy_seed_map (item_name, seed_key) AS (
  VALUES
    ('Service Call', 'starter_v1.fees.service_call'),
    ('Diagnostic Fee', 'starter_v1.diagnostics.diagnostic_fee'),
    ('Preventive Maintenance - Residential', 'starter_v1.maintenance.preventive_maintenance_residential'),
    ('Preventive Maintenance - Commercial', 'starter_v1.maintenance.preventive_maintenance_commercial'),
    ('Refrigerant R-410A (per lb)', 'starter_v1.refrigerant.r410a_per_lb'),
    ('Filter Replacement', 'starter_v1.parts.filter_replacement'),
    ('Thermostat (Standard)', 'starter_v1.controls.thermostat_standard'),
    ('Capacitor Replacement', 'starter_v1.repair.capacitor_replacement'),
    ('Contactor Replacement', 'starter_v1.repair.contactor_replacement'),
    ('ECC / Title 24 Test', 'starter_v1.compliance.ecc_title_24_test'),
    ('Labor (hourly)', 'starter_v1.labor.hourly'),
    ('Discount / Adjustment', 'starter_v1.adjustments.discount_adjustment')
),
ranked_candidates AS (
  SELECT
    pi.id,
    lsm.seed_key,
    ROW_NUMBER() OVER (
      PARTITION BY pi.account_owner_user_id, pi.item_name
      ORDER BY pi.is_active DESC, pi.created_at ASC, pi.id ASC
    ) AS rn
  FROM public.pricebook_items pi
  INNER JOIN legacy_seed_map lsm
    ON lsm.item_name = pi.item_name
  WHERE pi.is_starter = true
    AND pi.seed_key IS NULL
),
canonical_rows AS (
  SELECT id, seed_key
  FROM ranked_candidates
  WHERE rn = 1
)
UPDATE public.pricebook_items pi
SET
  seed_key = cr.seed_key,
  starter_version = 'starter_v1'
FROM canonical_rows cr
WHERE pi.id = cr.id;

CREATE UNIQUE INDEX IF NOT EXISTS pricebook_items_owner_seed_key_uidx
  ON public.pricebook_items (account_owner_user_id, seed_key)
  WHERE seed_key IS NOT NULL;

COMMIT;
