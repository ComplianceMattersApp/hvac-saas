/**
 * Compliance Matters: Pricebook Starter Seed Helper
 * 
 * Purpose:
 *   Provide idempotent seeding of starter Pricebook items by seed_key.
 *   Foundation for D2C-4 (first-owner provisioning) and D2C-5 (backfill UI).
 * 
 * Design:
 *   - Seed identity is determined by seed_key + account_owner_user_id.
 *   - Rows are inserted once per account. Repeated calls are idempotent.
 *   - Supports dry-run (preview what would happen) and apply modes.
 *   - No integration with provisioning or admin UI yet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Definition of a starter Pricebook item.
 * 
 * A seed is identified by seed_key within an account.
 * Repeated calls with the same seed_key will not duplicate rows.
 */
export interface PricebookStarterSeedDefinition {
  seed_key: string;
  starter_version: string;
  item_name: string;
  item_type: 'service' | 'material' | 'diagnostic' | 'adjustment';
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
  is_active: boolean;
  is_starter: boolean;
}

export type StarterKitVersion = 'v1' | 'v2';

export type StarterKitSeedSelection = {
  starterKitVersion: StarterKitVersion;
  seeds: PricebookStarterSeedDefinition[];
  seedCount: number;
  activeCount: number;
  inactiveCount: number;
};

/**
 * Result of a dry-run or apply operation.
 */
export interface PricebookSeedResult {
  /** Number of rows that would be / were inserted. */
  inserted_count: number;
  /** Number of rows skipped because seed_key already exists. */
  skipped_count: number;
  /** Rows that would be / were inserted. */
  inserted_rows?: Array<{
    seed_key: string;
    item_name: string;
  }>;
  /** Rows that were skipped. */
  skipped_rows?: Array<{
    seed_key: string;
    item_name: string;
  }>;
  /** Errors or validation notes. */
  errors?: string[];
  /** Starter kit metadata for preview/apply reporting. */
  starter_kit_version?: StarterKitVersion;
  seed_count?: number;
  active_seed_count?: number;
  inactive_seed_count?: number;
}

export type ExistingAccountStarterKitBackfillPlan = {
  mode: 'dry_run';
  account_owner_user_id: string;
  starter_kit_version: 'v2';
  seed_count: number;
  active_seed_count: number;
  inactive_seed_count: number;
  would_insert_count: number;
  would_skip_existing_seed_key_count: number;
  possible_collision_count: number;
  preview_insert_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  preview_skip_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  possible_collisions: Array<{
    seed_key: string;
    candidate_item_name: string;
    candidate_category: string | null;
    candidate_unit_label: string | null;
    existing_row_id: string | null;
    existing_row_is_active: boolean | null;
    existing_row_seed_key: string | null;
  }>;
  warnings: string[];
  errors: string[];
};

export type ExistingAccountStarterKitBackfillApplyResult = {
  mode: 'apply';
  account_owner_user_id: string;
  starter_kit_version: 'v2';
  seed_count: number;
  active_seed_count: number;
  inactive_seed_count: number;
  inserted_count: number;
  skipped_existing_seed_key_count: number;
  possible_collision_count: number;
  inserted_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  skipped_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  possible_collisions: ExistingAccountStarterKitBackfillPlan['possible_collisions'];
  warnings: string[];
  errors: string[];
};

export type PricebookExistingSeedRow = {
  seed_key: string;
  item_name: string;
};

export type PricebookExistingCollisionRow = {
  id: string | null;
  seed_key: string | null;
  item_name: string | null;
  category: string | null;
  unit_label: string | null;
  is_active: boolean | null;
};

export type PricebookSeedInsertRow = PricebookStarterSeedDefinition & {
  account_owner_user_id: string;
};

export interface PricebookSeedingStore {
  listExistingSeedRows(account_owner_user_id: string): Promise<{
    data: PricebookExistingSeedRow[] | null;
    error: { message: string } | null;
  }>;
  insertSeedRows(rows: PricebookSeedInsertRow[]): Promise<{
    error: { message: string } | null;
  }>;
  listExistingRowsForCollision?(account_owner_user_id: string): Promise<{
    data: PricebookExistingCollisionRow[] | null;
    error: { message: string } | null;
  }>;
}

export function createPricebookSeedingStoreFromSupabase(
  client: SupabaseClient,
): PricebookSeedingStore {
  return {
    async listExistingSeedRows(account_owner_user_id) {
      const { data, error } = await client
        .from('pricebook_items')
        .select('seed_key, item_name')
        .eq('account_owner_user_id', account_owner_user_id)
        .not('seed_key', 'is', null);

      return {
        data: (data ?? null) as PricebookExistingSeedRow[] | null,
        error: error ? { message: error.message } : null,
      };
    },

    async insertSeedRows(rows) {
      const { error } = await client.from('pricebook_items').insert(rows);
      return { error: error ? { message: error.message } : null };
    },

    async listExistingRowsForCollision(account_owner_user_id) {
      const { data, error } = await client
        .from('pricebook_items')
        .select('id, seed_key, item_name, category, unit_label, is_active')
        .eq('account_owner_user_id', account_owner_user_id);

      return {
        data: (data ?? null) as PricebookExistingCollisionRow[] | null,
        error: error ? { message: error.message } : null,
      };
    },
  };
}

function buildSeedPlan(
  existing: PricebookExistingSeedRow[] | null,
  account_owner_user_id: string,
  seeds: PricebookStarterSeedDefinition[],
) {
  const existing_keys = new Set(existing?.map((row) => row.seed_key) || []);
  const inserted_rows: Array<{ seed_key: string; item_name: string }> = [];
  const skipped_rows: Array<{ seed_key: string; item_name: string }> = [];
  const to_insert: PricebookSeedInsertRow[] = [];

  seeds.forEach((seed) => {
    if (existing_keys.has(seed.seed_key)) {
      skipped_rows.push({
        seed_key: seed.seed_key,
        item_name: seed.item_name,
      });
      return;
    }

    inserted_rows.push({
      seed_key: seed.seed_key,
      item_name: seed.item_name,
    });
    to_insert.push({
      ...seed,
      account_owner_user_id,
    });
  });

  return {
    inserted_rows,
    skipped_rows,
    to_insert,
  };
}

/**
 * Starter Kit V1 seed definitions.
 * 
 * These 12 items represent the legacy starter catalog.
 * Each has a unique seed_key in the format: starter_v1.<domain>.<item>
 * 
 * Mapped to existing v1 starter rows by name + backfilled with metadata.
 */
export const STARTER_KIT_V1_SEEDS: PricebookStarterSeedDefinition[] = [
  {
    seed_key: 'starter_v1.fees.service_call',
    starter_version: 'starter_v1',
    item_name: 'Service Call',
    item_type: 'service',
    category: 'HVAC - General',
    default_description: 'Standard service call fee.',
    default_unit_price: 95.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.diagnostics.diagnostic_fee',
    starter_version: 'starter_v1',
    item_name: 'Diagnostic Fee',
    item_type: 'diagnostic',
    category: 'HVAC - General',
    default_description: 'System diagnostic / inspection fee.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.maintenance.preventive_maintenance_residential',
    starter_version: 'starter_v1',
    item_name: 'Preventive Maintenance - Residential',
    item_type: 'service',
    category: 'HVAC - Maintenance',
    default_description: 'Residential HVAC preventive maintenance visit.',
    default_unit_price: 150.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.maintenance.preventive_maintenance_commercial',
    starter_version: 'starter_v1',
    item_name: 'Preventive Maintenance - Commercial',
    item_type: 'service',
    category: 'HVAC - Maintenance',
    default_description: 'Commercial HVAC preventive maintenance visit.',
    default_unit_price: 250.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.refrigerant.r410a_per_lb',
    starter_version: 'starter_v1',
    item_name: 'Refrigerant R-410A (per lb)',
    item_type: 'material',
    category: 'Refrigerant',
    default_description: 'R-410A refrigerant, priced per pound. Update to your current rate.',
    default_unit_price: 0.00,
    unit_label: 'lb',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.parts.filter_replacement',
    starter_version: 'starter_v1',
    item_name: 'Filter Replacement',
    item_type: 'material',
    category: 'Parts',
    default_description: 'Air filter replacement. Update to your stocked filter price.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.parts.thermostat_standard',
    starter_version: 'starter_v1',
    item_name: 'Thermostat (Standard)',
    item_type: 'material',
    category: 'Parts',
    default_description: 'Standard thermostat supply and installation. Update to your price.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.repair.capacitor_replacement',
    starter_version: 'starter_v1',
    item_name: 'Capacitor Replacement',
    item_type: 'service',
    category: 'HVAC - Repair',
    default_description: 'Run/start capacitor replacement, parts and labor.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.repair.contactor_replacement',
    starter_version: 'starter_v1',
    item_name: 'Contactor Replacement',
    item_type: 'service',
    category: 'HVAC - Repair',
    default_description: 'Contactor replacement, parts and labor.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.compliance.ecc_title_24_test',
    starter_version: 'starter_v1',
    item_name: 'ECC / Title 24 Test',
    item_type: 'diagnostic',
    category: 'Compliance',
    default_description: 'Energy Code Compliance / Title 24 diagnostic test.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.labor.hourly',
    starter_version: 'starter_v1',
    item_name: 'Labor (hourly)',
    item_type: 'service',
    category: 'Labor',
    default_description: 'Technician labor, billed per hour. Update to your labor rate.',
    default_unit_price: 0.00,
    unit_label: 'hr',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v1.adjustments.discount_adjustment',
    starter_version: 'starter_v1',
    item_name: 'Discount / Adjustment',
    item_type: 'adjustment',
    category: 'Adjustments',
    default_description: 'Pricing discount or correction. Enter as a negative value if applicable.',
    default_unit_price: 0.00,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
];

/**
 * Starter Kit V2A seed definitions.
 *
 * Narrow expansion slice: definitions only.
 * V1 remains the active provisioning default until a later wiring slice.
 */
export const STARTER_KIT_V2_SEEDS: PricebookStarterSeedDefinition[] = [
  {
    seed_key: 'starter_v2.fees.service_call_standard',
    starter_version: 'starter_v2',
    item_name: 'Service Call',
    item_type: 'service',
    category: 'Fees',
    default_description: 'Standard dispatched service call fee. Editable default.',
    default_unit_price: 95.0,
    unit_label: 'trip',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.fees.trip_charge_followup',
    starter_version: 'starter_v2',
    item_name: 'Trip Charge (Return Visit)',
    item_type: 'service',
    category: 'Fees',
    default_description: 'Return trip dispatch fee when policy applies. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'trip',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.diagnostics.system_diagnostic',
    starter_version: 'starter_v2',
    item_name: 'Diagnostic Fee',
    item_type: 'diagnostic',
    category: 'HVAC - Diagnostics',
    default_description:
      'System diagnostic and fault isolation. Review/edit default price before issuing.',
    default_unit_price: 0.0,
    unit_label: 'visit',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.diagnostics.performance_assessment',
    starter_version: 'starter_v2',
    item_name: 'System Performance Diagnostic',
    item_type: 'diagnostic',
    category: 'HVAC - Diagnostics',
    default_description:
      'Performance diagnostic including airflow, refrigerant, or electrical verification as needed.',
    default_unit_price: 0.0,
    unit_label: 'system',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.labor.standard_hourly',
    starter_version: 'starter_v2',
    item_name: 'Labor (hourly)',
    item_type: 'service',
    category: 'Labor',
    default_description: 'Technician labor billed hourly. Editable default.',
    default_unit_price: 125.0,
    unit_label: 'hr',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.labor.after_hours_hourly',
    starter_version: 'starter_v2',
    item_name: 'Labor (after hours)',
    item_type: 'service',
    category: 'Labor',
    default_description: 'After-hours labor placeholder. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'hr',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.compliance.ecc_title24_test',
    starter_version: 'starter_v2',
    item_name: 'ECC / Title 24 Test',
    item_type: 'diagnostic',
    category: 'ECC / Compliance Testing',
    default_description:
      'ECC/Title 24 diagnostic test item. Review/edit default price before issuing.',
    default_unit_price: 0.0,
    unit_label: 'test',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.compliance.duct_leakage_test',
    starter_version: 'starter_v2',
    item_name: 'Duct Leakage Test',
    item_type: 'diagnostic',
    category: 'Duct / Airflow',
    default_description: 'Duct leakage testing service item.',
    default_unit_price: 0.0,
    unit_label: 'test',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.compliance.airflow_verification',
    starter_version: 'starter_v2',
    item_name: 'Airflow Verification',
    item_type: 'diagnostic',
    category: 'Duct / Airflow',
    default_description: 'Airflow verification/testing service item.',
    default_unit_price: 0.0,
    unit_label: 'test',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.compliance_docs.reporting_package',
    starter_version: 'starter_v2',
    item_name: 'Compliance Documentation Package',
    item_type: 'service',
    category: 'Compliance Docs',
    default_description: 'Documentation preparation and compliance packet handling.',
    default_unit_price: 0.0,
    unit_label: 'doc',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.permits.filing_admin_fee',
    starter_version: 'starter_v2',
    item_name: 'Permit / Filing Admin Fee',
    item_type: 'service',
    category: 'Permits / Documentation',
    default_description: 'Permit/admin filing support fee. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'doc',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.refrigerant.r410a_per_lb',
    starter_version: 'starter_v2',
    item_name: 'Refrigerant R-410A (per lb)',
    item_type: 'material',
    category: 'Refrigerant',
    default_description: 'Refrigerant priced per lb. Review/edit for current market pricing.',
    default_unit_price: 0.0,
    unit_label: 'lb',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.refrigerant.r454b_per_lb',
    starter_version: 'starter_v2',
    item_name: 'Refrigerant R-454B (per lb)',
    item_type: 'material',
    category: 'Refrigerant',
    default_description: 'Refrigerant priced per lb. Review/edit for current market pricing.',
    default_unit_price: 0.0,
    unit_label: 'lb',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.refrigerant.leak_search_repair',
    starter_version: 'starter_v2',
    item_name: 'Refrigerant Leak Search / Repair',
    item_type: 'service',
    category: 'Refrigerant Services',
    default_description: 'Leak search and minor repair service placeholder. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'flat',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.maintenance.pm_residential',
    starter_version: 'starter_v2',
    item_name: 'Preventive Maintenance - Residential',
    item_type: 'service',
    category: 'HVAC - Maintenance',
    default_description: 'Residential preventive maintenance visit. Editable default.',
    default_unit_price: 150.0,
    unit_label: 'visit',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.maintenance.pm_commercial',
    starter_version: 'starter_v2',
    item_name: 'Preventive Maintenance - Commercial',
    item_type: 'service',
    category: 'HVAC - Maintenance',
    default_description: 'Commercial preventive maintenance visit. Editable default.',
    default_unit_price: 250.0,
    unit_label: 'visit',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.electrical.capacitor_replacement',
    starter_version: 'starter_v2',
    item_name: 'Capacitor Replacement',
    item_type: 'service',
    category: 'Electrical',
    default_description: 'Capacitor replacement parts and labor. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.electrical.contactor_replacement',
    starter_version: 'starter_v2',
    item_name: 'Contactor Replacement',
    item_type: 'service',
    category: 'Electrical',
    default_description: 'Contactor replacement parts and labor. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.controls.thermostat_standard',
    starter_version: 'starter_v2',
    item_name: 'Thermostat (Standard)',
    item_type: 'material',
    category: 'Controls',
    default_description: 'Standard thermostat supply/install starter row. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.parts.filter_replacement',
    starter_version: 'starter_v2',
    item_name: 'Filter Replacement',
    item_type: 'material',
    category: 'Parts',
    default_description: 'Filter replacement starter row. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.parts.filter_standard_1in',
    starter_version: 'starter_v2',
    item_name: 'Filter (1-inch Standard)',
    item_type: 'material',
    category: 'Parts',
    default_description: 'Common 1-inch filter material row. Review before billing.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: true,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.adjustments.discount_adjustment_deferred',
    starter_version: 'starter_v2',
    item_name: 'Discount / Adjustment (Deferred)',
    item_type: 'adjustment',
    category: 'Adjustments',
    default_description: 'Placeholder only until adjustment policy is implemented.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: false,
    is_starter: true,
  },
  {
    seed_key: 'starter_v2.adjustments.warranty_credit_placeholder',
    starter_version: 'starter_v2',
    item_name: 'Warranty Credit Placeholder (Deferred)',
    item_type: 'adjustment',
    category: 'Adjustments',
    default_description: 'Placeholder only; credit execution deferred.',
    default_unit_price: 0.0,
    unit_label: 'each',
    is_active: false,
    is_starter: true,
  },
];

export function normalizeStarterKitVersion(value: unknown): StarterKitVersion {
  return String(value ?? '').trim().toLowerCase() === 'v2' ? 'v2' : 'v1';
}

export function resolveStarterKitSeeds(version?: unknown): StarterKitSeedSelection {
  const starterKitVersion = normalizeStarterKitVersion(version);
  const seeds = starterKitVersion === 'v2' ? STARTER_KIT_V2_SEEDS : STARTER_KIT_V1_SEEDS;
  const activeCount = seeds.filter((seed) => seed.is_active).length;
  const inactiveCount = seeds.length - activeCount;

  return {
    starterKitVersion,
    seeds,
    seedCount: seeds.length,
    activeCount,
    inactiveCount,
  };
}

/**
 * Validate seed definitions.
 * 
 * Returns errors array if validation fails; empty if valid.
 */
export function validateSeedDefinitions(
  seeds: PricebookStarterSeedDefinition[]
): string[] {
  const errors: string[] = [];
  const seen_keys = new Set<string>();

  seeds.forEach((seed, index) => {
    // Check for duplicates
    if (seen_keys.has(seed.seed_key)) {
      errors.push(
        `Duplicate seed_key at index ${index}: "${seed.seed_key}"`
      );
    }
    seen_keys.add(seed.seed_key);

    // Check required fields
    if (!seed.seed_key || seed.seed_key.trim() === '') {
      errors.push(`Seed at index ${index} has empty seed_key`);
    }
    if (!seed.starter_version || seed.starter_version.trim() === '') {
      errors.push(`Seed at index ${index} has empty starter_version`);
    }
    if (!seed.item_name || seed.item_name.trim() === '') {
      errors.push(`Seed at index ${index} has empty item_name`);
    }
    if (!['service', 'material', 'diagnostic', 'adjustment'].includes(seed.item_type)) {
      errors.push(
        `Seed at index ${index} has invalid item_type: "${seed.item_type}"`
      );
    }

    // Check that is_starter and is_active are true for starter seeds
    if (!seed.is_starter) {
      errors.push(`Seed at index ${index} has is_starter=false`);
    }
  });

  return errors;
}

/**
 * Dry-run: Preview what would happen if seeding were applied.
 * 
 * Does not write to database. Returns a summary of what would be inserted
 * and what would be skipped.
 */
export async function dryRunPricebookSeeding(
  store: PricebookSeedingStore,
  account_owner_user_id: string,
  seeds: PricebookStarterSeedDefinition[]
): Promise<PricebookSeedResult> {
  const errors = validateSeedDefinitions(seeds);
  if (errors.length > 0) {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors,
    };
  }

  if (!account_owner_user_id || account_owner_user_id.trim() === '') {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors: ['account_owner_user_id is required and cannot be empty'],
    };
  }

  try {
    const { data: existing, error } = await store.listExistingSeedRows(account_owner_user_id);

    if (error) {
      return {
        inserted_count: 0,
        skipped_count: 0,
        errors: [`Database error: ${error.message}`],
      };
    }

    const { inserted_rows, skipped_rows } = buildSeedPlan(
      existing,
      account_owner_user_id,
      seeds,
    );

    return {
      inserted_count: inserted_rows.length,
      skipped_count: skipped_rows.length,
      inserted_rows,
      skipped_rows,
    };
  } catch (err) {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors: [`Unexpected error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Apply seeding: Insert missing seed rows for an account.
 * 
 * Idempotent: calling twice will not duplicate rows. Uses seed_key for identity.
 * Skips rows where seed_key already exists; does not update existing rows.
 */
export async function applyPricebookSeeding(
  store: PricebookSeedingStore,
  account_owner_user_id: string,
  seeds: PricebookStarterSeedDefinition[]
): Promise<PricebookSeedResult> {
  const errors = validateSeedDefinitions(seeds);
  if (errors.length > 0) {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors,
    };
  }

  if (!account_owner_user_id || account_owner_user_id.trim() === '') {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors: ['account_owner_user_id is required and cannot be empty'],
    };
  }

  try {
    const { data: existing, error: selectError } = await store.listExistingSeedRows(account_owner_user_id);

    if (selectError) {
      return {
        inserted_count: 0,
        skipped_count: 0,
        errors: [`Database select error: ${selectError.message}`],
      };
    }

    const { inserted_rows, skipped_rows, to_insert } = buildSeedPlan(
      existing,
      account_owner_user_id,
      seeds,
    );

    // Insert new rows
    let inserted_count = 0;
    if (to_insert.length > 0) {
      const { error: insertError } = await store.insertSeedRows(to_insert);

      if (insertError) {
        return {
          inserted_count: 0,
          skipped_count: 0,
          errors: [`Database insert error: ${insertError.message}`],
        };
      }

      inserted_count = to_insert.length;
    }

    return {
      inserted_count,
      skipped_count: skipped_rows.length,
      inserted_rows,
      skipped_rows,
    };
  } catch (err) {
    return {
      inserted_count: 0,
      skipped_count: 0,
      errors: [`Unexpected error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Existing-account planner helper for Starter Kit V2 backfill.
 *
 * Dry-run only: computes missing vs existing seed_keys for one account.
 * This helper never writes data.
 */
export async function planExistingAccountStarterKitBackfill(params: {
  store: PricebookSeedingStore;
  account_owner_user_id: string;
  previewLimit?: number;
}): Promise<ExistingAccountStarterKitBackfillPlan> {
  const { store, account_owner_user_id } = params;
  const selection = resolveStarterKitSeeds('v2');
  const resolvedPreviewLimit = Number.isInteger(params.previewLimit) && Number(params.previewLimit) > 0
    ? Number(params.previewLimit)
    : 10;

  const buildPlanResult = (input: {
    would_insert_rows: Array<{ seed_key: string; item_name: string }>;
    would_skip_rows: Array<{ seed_key: string; item_name: string }>;
    possible_collisions: ExistingAccountStarterKitBackfillPlan['possible_collisions'];
    warnings?: string[];
    errors?: string[];
  }): ExistingAccountStarterKitBackfillPlan => {
    const wouldInsertRows = input.would_insert_rows;
    const wouldSkipRows = input.would_skip_rows;
    const possibleCollisions = input.possible_collisions;

    return {
      mode: 'dry_run',
      account_owner_user_id,
      starter_kit_version: 'v2',
      seed_count: selection.seedCount,
      active_seed_count: selection.activeCount,
      inactive_seed_count: selection.inactiveCount,
      would_insert_count: wouldInsertRows.length,
      would_skip_existing_seed_key_count: wouldSkipRows.length,
      possible_collision_count: possibleCollisions.length,
      preview_insert_rows: wouldInsertRows.slice(0, resolvedPreviewLimit),
      preview_skip_rows: wouldSkipRows.slice(0, resolvedPreviewLimit),
      possible_collisions: possibleCollisions.slice(0, resolvedPreviewLimit),
      warnings: input.warnings ?? [],
      errors: input.errors ?? [],
    };
  };

  if (!account_owner_user_id || account_owner_user_id.trim() === '') {
    return {
      ...buildPlanResult({
        would_insert_rows: [],
        would_skip_rows: [],
        possible_collisions: [],
        errors: ['account_owner_user_id is required and cannot be empty'],
      }),
      account_owner_user_id: account_owner_user_id || '',
    };
  }

  const seedDefinitionErrors = validateSeedDefinitions(selection.seeds);
  if (seedDefinitionErrors.length > 0) {
    return buildPlanResult({
      would_insert_rows: [],
      would_skip_rows: [],
      possible_collisions: [],
      errors: seedDefinitionErrors,
    });
  }

  try {
    const { data: existing, error } = await store.listExistingSeedRows(account_owner_user_id);
    if (error) {
        return buildPlanResult({
          would_insert_rows: [],
          would_skip_rows: [],
          possible_collisions: [],
          errors: [`Database error: ${error.message}`],
        });
    }

    const { inserted_rows, skipped_rows } = buildSeedPlan(
      existing,
      account_owner_user_id,
      selection.seeds,
    );

    let collisionRows: PricebookExistingCollisionRow[] = [];
    if (store.listExistingRowsForCollision) {
      const { data: existingCollisionRows, error: collisionError } =
        await store.listExistingRowsForCollision(account_owner_user_id);

      if (collisionError) {
        return buildPlanResult({
          would_insert_rows: inserted_rows,
          would_skip_rows: skipped_rows,
          possible_collisions: [],
          errors: [`Database error: ${collisionError.message}`],
        });
      }

      collisionRows = existingCollisionRows ?? [];
    }

    const possibleCollisions: ExistingAccountStarterKitBackfillPlan['possible_collisions'] = [];
    if (collisionRows.length > 0) {
      const candidateBySeedKey = new Map(selection.seeds.map((seed) => [seed.seed_key, seed]));

      inserted_rows.forEach((candidate) => {
        const fullSeed = candidateBySeedKey.get(candidate.seed_key);
        if (!fullSeed) {
          return;
        }

        collisionRows.forEach((existingRow) => {
          const sameSignature =
            String(existingRow.item_name ?? '') === fullSeed.item_name &&
            String(existingRow.category ?? '') === String(fullSeed.category ?? '') &&
            String(existingRow.unit_label ?? '') === String(fullSeed.unit_label ?? '');

          const hasMatchingSeedKey = String(existingRow.seed_key ?? '') === fullSeed.seed_key;
          if (!sameSignature || hasMatchingSeedKey) {
            return;
          }

          possibleCollisions.push({
            seed_key: fullSeed.seed_key,
            candidate_item_name: fullSeed.item_name,
            candidate_category: fullSeed.category,
            candidate_unit_label: fullSeed.unit_label,
            existing_row_id: existingRow.id,
            existing_row_is_active: existingRow.is_active,
            existing_row_seed_key: existingRow.seed_key,
          });
        });
      });
    }

    const warnings: string[] = [];
    if (selection.inactiveCount > 0) {
      warnings.push(
        `${selection.inactiveCount} deferred/inactive starter rows are included in planning output.`,
      );
    }

    if (possibleCollisions.length > 0) {
      warnings.push(
        `Possible name/category/unit collisions detected for ${possibleCollisions.length} starter rows.`,
      );
    }

    return buildPlanResult({
      would_insert_rows: inserted_rows,
      would_skip_rows: skipped_rows,
      possible_collisions: possibleCollisions,
      warnings,
      errors: [],
    });
  } catch (err) {
    return buildPlanResult({
      would_insert_rows: [],
      would_skip_rows: [],
      possible_collisions: [],
      warnings: [],
      errors: [`Unexpected error: ${err instanceof Error ? err.message : String(err)}`],
    });
  }
}

/**
 * Existing-account apply helper for Starter Kit V2 backfill.
 *
 * Apply path is explicit and single-account only.
 * This helper reuses the dry-run planner before writing, then inserts only
 * missing V2 seed rows by seed_key. Existing rows are never updated/deleted.
 *
 * Requires `confirmApply: true` to execute the write path.
 * Blocked by default if collisions are detected; pass `allowCollisions: true` to override.
 */
export async function applyExistingAccountStarterKitBackfill(params: {
  store: PricebookSeedingStore;
  account_owner_user_id: string;
  confirmApply: true;
  allowCollisions?: true;
}): Promise<ExistingAccountStarterKitBackfillApplyResult> {
  const { store, account_owner_user_id } = params;
  const selection = resolveStarterKitSeeds('v2');

  const buildApplyResult = (input: {
    inserted_rows: Array<{ seed_key: string; item_name: string }>;
    skipped_rows: Array<{ seed_key: string; item_name: string }>;
    possible_collisions: ExistingAccountStarterKitBackfillApplyResult['possible_collisions'];
    warnings?: string[];
    errors?: string[];
  }): ExistingAccountStarterKitBackfillApplyResult => ({
    mode: 'apply',
    account_owner_user_id,
    starter_kit_version: 'v2',
    seed_count: selection.seedCount,
    active_seed_count: selection.activeCount,
    inactive_seed_count: selection.inactiveCount,
    inserted_count: input.inserted_rows.length,
    skipped_existing_seed_key_count: input.skipped_rows.length,
    possible_collision_count: input.possible_collisions.length,
    inserted_rows: input.inserted_rows,
    skipped_rows: input.skipped_rows,
    possible_collisions: input.possible_collisions,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
  });

  // Runtime guard: explicit confirmation required even though the type enforces confirmApply: true.
  if (params.confirmApply !== true) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: [],
      possible_collisions: [],
      errors: ['confirmApply: true is required to execute the apply path.'],
    });
  }

  const plan = await planExistingAccountStarterKitBackfill({
    store,
    account_owner_user_id,
    previewLimit: selection.seedCount,
  });

  if (plan.errors.length > 0) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: plan.errors,
    });
  }

  // Collision blocking: block by default; require explicit allowCollisions: true to proceed.
  if (plan.possible_collision_count > 0 && params.allowCollisions !== true) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [
        `Apply blocked: ${plan.possible_collision_count} possible name/category/unit collision(s) detected. Review collisions and pass allowCollisions: true to proceed.`,
      ],
    });
  }

  const plannedInsertKeys = new Set(plan.preview_insert_rows.map((row) => row.seed_key));
  const to_insert = selection.seeds
    .filter((seed) => plannedInsertKeys.has(seed.seed_key))
    .map((seed) => ({
      ...seed,
      account_owner_user_id,
    }));

  if (to_insert.length !== plan.would_insert_count) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [
        'Planner/apply mismatch: incomplete insert candidate set; no rows were written.',
      ],
    });
  }

  if (to_insert.length === 0) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [],
    });
  }

  try {
    const { error: insertError } = await store.insertSeedRows(to_insert);
    if (insertError) {
      return buildApplyResult({
        inserted_rows: [],
        skipped_rows: plan.preview_skip_rows,
        possible_collisions: plan.possible_collisions,
        warnings: plan.warnings,
        errors: [`Database insert error: ${insertError.message}`],
      });
    }

    return buildApplyResult({
      inserted_rows: plan.preview_insert_rows,
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [],
    });
  } catch (err) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [`Unexpected error: ${err instanceof Error ? err.message : String(err)}`],
    });
  }
}
