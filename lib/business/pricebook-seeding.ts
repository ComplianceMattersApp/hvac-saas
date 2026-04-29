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

export type StarterKitVersion = 'v1' | 'v2' | 'v3';
export type BackfillStarterKitVersion = Exclude<StarterKitVersion, 'v1'>;

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
  starter_kit_version: BackfillStarterKitVersion;
  seed_count: number;
  active_seed_count: number;
  inactive_seed_count: number;
  would_insert_count: number;
  would_skip_existing_seed_key_count: number;
  would_skip_existing_equivalent_count: number;
  possible_collision_count: number;
  preview_insert_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  preview_skip_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  preview_existing_equivalent_rows: Array<{
    seed_key: string;
    candidate_item_name: string;
    candidate_category: string | null;
    candidate_unit_label: string | null;
    candidate_item_type: PricebookStarterSeedDefinition['item_type'];
    existing_row_id: string | null;
    existing_row_is_active: boolean | null;
    existing_row_seed_key: string | null;
  }>;
  possible_collisions: Array<{
    seed_key: string;
    candidate_item_name: string;
    candidate_category: string | null;
    candidate_unit_label: string | null;
    candidate_item_type: PricebookStarterSeedDefinition['item_type'];
    existing_row_id: string | null;
    existing_row_is_active: boolean | null;
    existing_row_seed_key: string | null;
    existing_row_item_type: string | null;
  }>;
  warnings: string[];
  errors: string[];
};

export type ExistingAccountStarterKitBackfillApplyResult = {
  mode: 'apply';
  account_owner_user_id: string;
  starter_kit_version: BackfillStarterKitVersion;
  seed_count: number;
  active_seed_count: number;
  inactive_seed_count: number;
  inserted_count: number;
  skipped_existing_seed_key_count: number;
  skipped_existing_equivalent_count: number;
  possible_collision_count: number;
  inserted_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  skipped_rows: Array<{
    seed_key: string;
    item_name: string;
  }>;
  equivalent_rows: ExistingAccountStarterKitBackfillPlan['preview_existing_equivalent_rows'];
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
  item_type?: string | null;
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
        .select('id, seed_key, item_name, category, unit_label, item_type, is_active')
        .eq('account_owner_user_id', account_owner_user_id);

      return {
        data: (data ?? null) as PricebookExistingCollisionRow[] | null,
        error: error ? { message: error.message } : null,
      };
    },
  };
}

function normalizePlannerComparableValue(value: unknown): string {
  return String(value ?? '');
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

function createStarterV3Seed(params: {
  seed_key: string;
  item_name: string;
  item_type: 'service' | 'material' | 'diagnostic' | 'adjustment';
  category: string;
  default_description: string;
  default_unit_price?: number;
  unit_label: string;
  is_active?: boolean;
}): PricebookStarterSeedDefinition {
  return {
    seed_key: params.seed_key,
    starter_version: 'starter_v3',
    item_name: params.item_name,
    item_type: params.item_type,
    category: params.category,
    default_description: params.default_description,
    default_unit_price: params.default_unit_price ?? 0,
    unit_label: params.unit_label,
    is_active: params.is_active ?? true,
    is_starter: true,
  };
}

export const STARTER_KIT_V3_SEEDS: PricebookStarterSeedDefinition[] = [
  // Diagnostics
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.service_call', item_name: 'Service Call', item_type: 'service', category: 'Fees', default_description: 'Standard dispatched service call fee.', default_unit_price: 95, unit_label: 'trip' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.diagnostic_fee', item_name: 'Diagnostic Fee', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'System diagnostic and fault isolation.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.performance_diagnostic', item_name: 'System Performance Diagnostic', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Performance diagnostic for airflow, electrical, and refrigerant checks.', default_unit_price: 0, unit_label: 'system' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.airflow_diagnostic', item_name: 'Airflow Diagnostic', item_type: 'diagnostic', category: 'Duct / Airflow', default_description: 'Airflow diagnostic including static checks and balancing observations.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.electrical_diagnostic', item_name: 'Electrical Diagnostic', item_type: 'diagnostic', category: 'Electrical', default_description: 'Electrical system diagnostic for low/high voltage controls and components.', default_unit_price: 0, unit_label: 'system' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.refrigerant_diagnostic', item_name: 'Refrigerant Diagnostic', item_type: 'diagnostic', category: 'Refrigerant Services', default_description: 'Refrigerant system diagnostic and baseline verification.', default_unit_price: 0, unit_label: 'system' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.no_cooling', item_name: 'No Cooling Diagnostic', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Targeted no-cooling troubleshooting diagnostic.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.no_heating', item_name: 'No Heating Diagnostic', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Targeted no-heating troubleshooting diagnostic.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.noise_vibration', item_name: 'Noise / Vibration Diagnostic', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Diagnostic for abnormal noise, vibration, and mechanical resonance.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.diagnostics.startup_commissioning', item_name: 'Startup / Commissioning Diagnostic', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Startup diagnostics and commissioning baseline checks.', default_unit_price: 0, unit_label: 'system' }),

  // Maintenance
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.pm_residential', item_name: 'Preventive Maintenance - Residential', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Residential preventive maintenance visit.', default_unit_price: 150, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.pm_commercial', item_name: 'Preventive Maintenance - Commercial', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Commercial preventive maintenance visit.', default_unit_price: 260, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.pm_heat_pump', item_name: 'Heat Pump Maintenance', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Seasonal preventive maintenance for heat pump systems.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.filter_change_visit', item_name: 'Filter Change Visit', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Scheduled visit for filter replacement and quick operational check.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.condenser_coil_cleaning', item_name: 'Condenser Coil Cleaning', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Condenser coil cleaning service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.evaporator_coil_cleaning', item_name: 'Evaporator Coil Cleaning', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Evaporator coil cleaning service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.drain_line_flush', item_name: 'Drain Line Flush', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Preventive condensate drain line flush and treatment.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.electrical_safety_check', item_name: 'Electrical Safety Check', item_type: 'diagnostic', category: 'Electrical', default_description: 'Electrical safety check during preventive maintenance.', default_unit_price: 0, unit_label: 'system' }),
  createStarterV3Seed({ seed_key: 'starter_v3.maintenance.maintenance_report', item_name: 'Maintenance Report Package', item_type: 'service', category: 'Compliance Docs', default_description: 'Maintenance findings and service documentation package.', default_unit_price: 0, unit_label: 'doc' }),

  // Electrical
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.capacitor_replacement', item_name: 'Capacitor Replacement', item_type: 'service', category: 'Electrical', default_description: 'Capacitor replacement parts and labor.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.contactor_replacement', item_name: 'Contactor Replacement', item_type: 'service', category: 'Electrical', default_description: 'Contactor replacement parts and labor.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.relay_replacement', item_name: 'Relay Replacement', item_type: 'service', category: 'Electrical', default_description: 'Control relay replacement parts and labor.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.disconnect_replacement', item_name: 'Disconnect Replacement', item_type: 'service', category: 'Electrical', default_description: 'Service disconnect replacement.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.breaker_replacement', item_name: 'Breaker Replacement', item_type: 'service', category: 'Electrical', default_description: 'Breaker replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.fuse_replacement', item_name: 'Fuse Replacement', item_type: 'service', category: 'Electrical', default_description: 'Fuse replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.hard_start_kit_install', item_name: 'Hard Start Kit Install', item_type: 'service', category: 'Electrical', default_description: 'Hard start kit install labor and materials.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.electrical.wiring_repair_minor', item_name: 'Minor Wiring Repair', item_type: 'service', category: 'Electrical', default_description: 'Minor HVAC wiring repair and securement.', default_unit_price: 0, unit_label: 'job' }),

  // Motors / Fans
  createStarterV3Seed({ seed_key: 'starter_v3.motors.blower_motor_replacement', item_name: 'Blower Motor Replacement', item_type: 'service', category: 'Parts', default_description: 'Blower motor replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.condenser_fan_motor_replacement', item_name: 'Condenser Fan Motor Replacement', item_type: 'service', category: 'Parts', default_description: 'Condenser fan motor replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.inducer_motor_replacement', item_name: 'Inducer Motor Replacement', item_type: 'service', category: 'Parts', default_description: 'Inducer motor replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.ecm_module_replacement', item_name: 'ECM Motor Module Replacement', item_type: 'service', category: 'Parts', default_description: 'ECM module replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.blower_wheel_cleaning', item_name: 'Blower Wheel Cleaning', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Blower wheel cleaning service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.blower_wheel_replacement', item_name: 'Blower Wheel Replacement', item_type: 'service', category: 'Parts', default_description: 'Blower wheel replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.fan_blade_replacement', item_name: 'Fan Blade Replacement', item_type: 'service', category: 'Parts', default_description: 'Condenser fan blade replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.motors.motor_run_test', item_name: 'Motor Amp-Draw / Run Test', item_type: 'diagnostic', category: 'Electrical', default_description: 'Motor run test and amp-draw verification.', default_unit_price: 0, unit_label: 'test' }),

  // Refrigerant
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.r410a_per_lb', item_name: 'Refrigerant R-410A (per lb)', item_type: 'material', category: 'Refrigerant', default_description: 'R-410A refrigerant material charged per pound.', default_unit_price: 0, unit_label: 'lb' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.r454b_per_lb', item_name: 'Refrigerant R-454B (per lb)', item_type: 'material', category: 'Refrigerant', default_description: 'R-454B refrigerant material charged per pound.', default_unit_price: 0, unit_label: 'lb' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.r32_per_lb', item_name: 'Refrigerant R-32 (per lb)', item_type: 'material', category: 'Refrigerant', default_description: 'R-32 refrigerant material charged per pound.', default_unit_price: 0, unit_label: 'lb' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.leak_search', item_name: 'Refrigerant Leak Search', item_type: 'service', category: 'Refrigerant Services', default_description: 'Refrigerant leak search and pinpoint diagnostic.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.leak_repair_minor', item_name: 'Refrigerant Leak Repair (Minor)', item_type: 'service', category: 'Refrigerant Services', default_description: 'Minor refrigerant leak repair labor allowance.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.nitrogen_pressure_test', item_name: 'Nitrogen Pressure Test', item_type: 'diagnostic', category: 'Refrigerant Services', default_description: 'Nitrogen pressure test for leak verification.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.vacuum_decay_test', item_name: 'Vacuum / Decay Test', item_type: 'diagnostic', category: 'Refrigerant Services', default_description: 'Vacuum and decay integrity verification test.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.filter_drier_replacement', item_name: 'Filter Drier Replacement', item_type: 'service', category: 'Refrigerant Services', default_description: 'Filter drier replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.refrigerant_recovery', item_name: 'Refrigerant Recovery', item_type: 'service', category: 'Refrigerant Services', default_description: 'Recovery and handling of existing refrigerant charge.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.charge_adjustment', item_name: 'Refrigerant Charge Adjustment', item_type: 'service', category: 'Refrigerant Services', default_description: 'Charge adjustment labor allowance (material billed separately).', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.refrigerant.refrigerant_service_report', item_name: 'Refrigerant Service Report', item_type: 'service', category: 'Compliance Docs', default_description: 'Refrigerant service and compliance documentation package.', default_unit_price: 0, unit_label: 'doc' }),

  // Drain / Condensate
  createStarterV3Seed({ seed_key: 'starter_v3.drain.drain_line_clear', item_name: 'Condensate Drain Line Clear', item_type: 'service', category: 'HVAC - Repair', default_description: 'Drain line clearing and flow restore service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.condensate_pump_replacement', item_name: 'Condensate Pump Replacement', item_type: 'service', category: 'Parts', default_description: 'Condensate pump replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.trap_rebuild', item_name: 'Drain Trap Rebuild', item_type: 'service', category: 'HVAC - Repair', default_description: 'Condensate trap rebuild and sealing.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.float_switch_install', item_name: 'Float Switch Install', item_type: 'service', category: 'Controls', default_description: 'Condensate safety float switch installation.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.secondary_pan_treatment', item_name: 'Secondary Drain Pan Treatment', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Secondary pan treatment and inspection.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.safety_flush', item_name: 'Condensate Safety Flush', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Preventive condensate line safety flush.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.drain.system_inspection', item_name: 'Condensate System Inspection', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Condensate routing and performance inspection.', default_unit_price: 0, unit_label: 'visit' }),

  // Thermostats / Controls
  createStarterV3Seed({ seed_key: 'starter_v3.controls.thermostat_standard', item_name: 'Thermostat (Standard)', item_type: 'material', category: 'Controls', default_description: 'Standard thermostat install starter row.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.thermostat_smart', item_name: 'Thermostat (Smart)', item_type: 'material', category: 'Controls', default_description: 'Smart thermostat install starter row.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.thermostat_wiring_repair', item_name: 'Thermostat Wiring Repair', item_type: 'service', category: 'Controls', default_description: 'Low-voltage thermostat wiring repair.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.transformer_replacement', item_name: 'Low-Voltage Transformer Replacement', item_type: 'service', category: 'Controls', default_description: '24V transformer replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.control_board_replacement', item_name: 'Control Board Replacement', item_type: 'service', category: 'Controls', default_description: 'Control board replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.zoning_damper_service', item_name: 'Zoning Damper Service', item_type: 'service', category: 'Controls', default_description: 'Zoning damper service and calibration.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.zoning_panel_diagnostic', item_name: 'Zoning Panel Diagnostic', item_type: 'diagnostic', category: 'Controls', default_description: 'Zoning control panel diagnostic.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.controls.thermostat_wifi_setup', item_name: 'Thermostat Wi-Fi Setup', item_type: 'service', category: 'Controls', default_description: 'Thermostat Wi-Fi/app setup support.', default_unit_price: 0, unit_label: 'job' }),

  // Heating
  createStarterV3Seed({ seed_key: 'starter_v3.heating.ignitor_replacement', item_name: 'Ignitor Replacement', item_type: 'service', category: 'HVAC - Repair', default_description: 'Ignitor replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.flame_sensor_cleaning', item_name: 'Flame Sensor Cleaning', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Flame sensor cleaning service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.flame_sensor_replacement', item_name: 'Flame Sensor Replacement', item_type: 'service', category: 'HVAC - Repair', default_description: 'Flame sensor replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.gas_valve_replacement', item_name: 'Gas Valve Replacement', item_type: 'service', category: 'HVAC - Repair', default_description: 'Gas valve replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.pressure_switch_replacement', item_name: 'Pressure Switch Replacement', item_type: 'service', category: 'HVAC - Repair', default_description: 'Pressure switch replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.limit_switch_replacement', item_name: 'Limit Switch Replacement', item_type: 'service', category: 'HVAC - Repair', default_description: 'Limit switch replacement labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.heat_exchanger_inspection', item_name: 'Heat Exchanger Inspection', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Heat exchanger inspection and condition notes.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.furnace_tuneup', item_name: 'Furnace Tune-Up', item_type: 'service', category: 'HVAC - Maintenance', default_description: 'Seasonal furnace tune-up service.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.heating.heat_pump_defrost_service', item_name: 'Heat Pump Defrost Service', item_type: 'service', category: 'HVAC - Repair', default_description: 'Heat pump defrost system service and calibration.', default_unit_price: 0, unit_label: 'job' }),

  // IAQ
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.filter_1in', item_name: 'Filter (1-inch Standard)', item_type: 'material', category: 'Parts', default_description: 'Standard 1-inch filter material row.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.filter_4in', item_name: 'Filter (4-inch Media)', item_type: 'material', category: 'Parts', default_description: '4-inch media filter material row.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.uv_light_install', item_name: 'UV Light Install', item_type: 'service', category: 'Parts', default_description: 'UV light installation labor and parts allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.media_filter_cabinet_install', item_name: 'Media Filter Cabinet Install', item_type: 'service', category: 'Parts', default_description: 'Media filter cabinet installation labor and materials.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.assessment', item_name: 'IAQ Assessment', item_type: 'diagnostic', category: 'HVAC - Diagnostics', default_description: 'Indoor air quality assessment and recommendation baseline.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.duct_sanitizing_treatment', item_name: 'Duct Sanitizing Treatment', item_type: 'service', category: 'Duct / Airflow', default_description: 'Duct sanitizing treatment service allowance.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.iaq.dehumidifier_service', item_name: 'Dehumidifier Service', item_type: 'service', category: 'HVAC - Repair', default_description: 'Dehumidifier service and performance check.', default_unit_price: 0, unit_label: 'visit' }),

  // Duct / Vent / Airflow
  createStarterV3Seed({ seed_key: 'starter_v3.duct.duct_leakage_test', item_name: 'Duct Leakage Test', item_type: 'diagnostic', category: 'Duct / Airflow', default_description: 'Duct leakage testing service item.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.airflow_verification', item_name: 'Airflow Verification', item_type: 'diagnostic', category: 'Duct / Airflow', default_description: 'Airflow verification and balancing test item.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.static_pressure_test', item_name: 'Static Pressure Test', item_type: 'diagnostic', category: 'Duct / Airflow', default_description: 'External static pressure measurement and documentation.', default_unit_price: 0, unit_label: 'test' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.duct_sealing_minor', item_name: 'Duct Sealing (Minor)', item_type: 'service', category: 'Duct / Airflow', default_description: 'Minor accessible duct sealing service.', default_unit_price: 0, unit_label: 'job' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.supply_register_repair', item_name: 'Supply Register Repair', item_type: 'service', category: 'Duct / Airflow', default_description: 'Supply register repair/replacement labor allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.return_grille_repair', item_name: 'Return Grille Repair', item_type: 'service', category: 'Duct / Airflow', default_description: 'Return grille repair/replacement labor allowance.', default_unit_price: 0, unit_label: 'each' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.dryer_vent_inspection', item_name: 'Dryer Vent Inspection', item_type: 'diagnostic', category: 'Duct / Airflow', default_description: 'Dryer vent airflow and blockage inspection.', default_unit_price: 0, unit_label: 'visit' }),
  createStarterV3Seed({ seed_key: 'starter_v3.duct.balance_adjustment', item_name: 'Air Balance Adjustment', item_type: 'service', category: 'Duct / Airflow', default_description: 'Air balancing adjustment service.', default_unit_price: 0, unit_label: 'system' }),

  // Compliance docs
  createStarterV3Seed({ seed_key: 'starter_v3.docs.compliance_package', item_name: 'Compliance Documentation Package', item_type: 'service', category: 'Compliance Docs', default_description: 'Compliance documentation preparation and packet handling.', default_unit_price: 0, unit_label: 'doc' }),
  createStarterV3Seed({ seed_key: 'starter_v3.docs.permit_filing_admin_fee', item_name: 'Permit / Filing Admin Fee', item_type: 'service', category: 'Permits / Documentation', default_description: 'Permit and filing administrative processing fee.', default_unit_price: 0, unit_label: 'doc' }),
  createStarterV3Seed({ seed_key: 'starter_v3.docs.hers_upload', item_name: 'HERS Upload / Registry Entry', item_type: 'service', category: 'Compliance Docs', default_description: 'HERS registry upload and submission handling.', default_unit_price: 0, unit_label: 'doc' }),
  createStarterV3Seed({ seed_key: 'starter_v3.docs.title24_forms', item_name: 'Title 24 Forms Processing', item_type: 'service', category: 'Compliance Docs', default_description: 'Title 24 documentation prep and processing.', default_unit_price: 0, unit_label: 'doc' }),
  createStarterV3Seed({ seed_key: 'starter_v3.docs.photo_documentation', item_name: 'Photo Documentation Package', item_type: 'service', category: 'Compliance Docs', default_description: 'Photo documentation and attachment packaging.', default_unit_price: 0, unit_label: 'doc' }),
  createStarterV3Seed({ seed_key: 'starter_v3.docs.closeout_report', item_name: 'Closeout Report Package', item_type: 'service', category: 'Compliance Docs', default_description: 'Project closeout summary and attached documentation.', default_unit_price: 0, unit_label: 'doc' }),

  // Replacement / estimate placeholders
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.system_replacement_estimate_split', item_name: 'System Replacement Estimate Placeholder (Split)', item_type: 'service', category: 'Other', default_description: 'Placeholder estimate line for split-system replacement scoping.', default_unit_price: 0, unit_label: 'system', is_active: false }),
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.system_replacement_estimate_package', item_name: 'System Replacement Estimate Placeholder (Package)', item_type: 'service', category: 'Other', default_description: 'Placeholder estimate line for package-unit replacement scoping.', default_unit_price: 0, unit_label: 'system', is_active: false }),
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.duct_replacement_estimate', item_name: 'Duct Replacement Estimate Placeholder', item_type: 'service', category: 'Other', default_description: 'Placeholder estimate line for duct replacement scoping.', default_unit_price: 0, unit_label: 'job', is_active: false }),
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.panel_upgrade_estimate', item_name: 'Electrical Panel Upgrade Placeholder', item_type: 'service', category: 'Other', default_description: 'Placeholder estimate line for panel upgrade coordination.', default_unit_price: 0, unit_label: 'job', is_active: false }),
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.permit_allowance_placeholder', item_name: 'Permit Allowance Placeholder', item_type: 'service', category: 'Permits / Documentation', default_description: 'Placeholder allowance line for permit estimate assumptions.', default_unit_price: 0, unit_label: 'doc', is_active: false }),
  createStarterV3Seed({ seed_key: 'starter_v3.replacement.crane_service_placeholder', item_name: 'Crane Service Placeholder', item_type: 'service', category: 'Other', default_description: 'Placeholder line for equipment crane coordination.', default_unit_price: 0, unit_label: 'job', is_active: false }),
];

export function normalizeStarterKitVersion(value: unknown): StarterKitVersion {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'v3') return 'v3';
  if (normalized === 'v2') return 'v2';
  return 'v1';
}

export function resolveStarterKitSeeds(version?: unknown): StarterKitSeedSelection {
  const starterKitVersion = normalizeStarterKitVersion(version);
  const seeds =
    starterKitVersion === 'v3'
      ? STARTER_KIT_V3_SEEDS
      : starterKitVersion === 'v2'
        ? STARTER_KIT_V2_SEEDS
        : STARTER_KIT_V1_SEEDS;
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
  starter_kit_version?: BackfillStarterKitVersion;
  previewLimit?: number;
}): Promise<ExistingAccountStarterKitBackfillPlan> {
  const { store, account_owner_user_id } = params;
  const starterKitVersion: BackfillStarterKitVersion =
    params.starter_kit_version === 'v3' ? 'v3' : 'v2';
  const selection = resolveStarterKitSeeds(starterKitVersion);
  const resolvedPreviewLimit = Number.isInteger(params.previewLimit) && Number(params.previewLimit) > 0
    ? Number(params.previewLimit)
    : 10;

  const buildPlanResult = (input: {
    would_insert_rows: Array<{ seed_key: string; item_name: string }>;
    would_skip_rows: Array<{ seed_key: string; item_name: string }>;
    would_skip_existing_equivalent_rows: ExistingAccountStarterKitBackfillPlan['preview_existing_equivalent_rows'];
    possible_collisions: ExistingAccountStarterKitBackfillPlan['possible_collisions'];
    warnings?: string[];
    errors?: string[];
  }): ExistingAccountStarterKitBackfillPlan => {
    const wouldInsertRows = input.would_insert_rows;
    const wouldSkipRows = input.would_skip_rows;
    const wouldSkipEquivalentRows = input.would_skip_existing_equivalent_rows;
    const possibleCollisions = input.possible_collisions;

    return {
      mode: 'dry_run',
      account_owner_user_id,
      starter_kit_version: starterKitVersion,
      seed_count: selection.seedCount,
      active_seed_count: selection.activeCount,
      inactive_seed_count: selection.inactiveCount,
      would_insert_count: wouldInsertRows.length,
      would_skip_existing_seed_key_count: wouldSkipRows.length,
      would_skip_existing_equivalent_count: wouldSkipEquivalentRows.length,
      possible_collision_count: possibleCollisions.length,
      preview_insert_rows: wouldInsertRows.slice(0, resolvedPreviewLimit),
      preview_skip_rows: wouldSkipRows.slice(0, resolvedPreviewLimit),
      preview_existing_equivalent_rows: wouldSkipEquivalentRows.slice(0, resolvedPreviewLimit),
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
        would_skip_existing_equivalent_rows: [],
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
      would_skip_existing_equivalent_rows: [],
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
          would_skip_existing_equivalent_rows: [],
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
          would_skip_existing_equivalent_rows: [],
          possible_collisions: [],
          errors: [`Database error: ${collisionError.message}`],
        });
      }

      collisionRows = existingCollisionRows ?? [];
    }

    const possibleCollisions: ExistingAccountStarterKitBackfillPlan['possible_collisions'] = [];
    const equivalentRows: ExistingAccountStarterKitBackfillPlan['preview_existing_equivalent_rows'] = [];
    const filteredInsertRows: Array<{ seed_key: string; item_name: string }> = [];
    if (collisionRows.length > 0) {
      const candidateBySeedKey = new Map(selection.seeds.map((seed) => [seed.seed_key, seed]));

      inserted_rows.forEach((candidate) => {
        const fullSeed = candidateBySeedKey.get(candidate.seed_key);
        if (!fullSeed) {
          return;
        }
        const signatureMatches = collisionRows.filter((existingRow) => {
          const sameSignature =
            normalizePlannerComparableValue(existingRow.item_name) ===
              normalizePlannerComparableValue(fullSeed.item_name) &&
            normalizePlannerComparableValue(existingRow.category) ===
              normalizePlannerComparableValue(fullSeed.category) &&
            normalizePlannerComparableValue(existingRow.unit_label) ===
              normalizePlannerComparableValue(fullSeed.unit_label);

          const hasMatchingSeedKey =
            normalizePlannerComparableValue(existingRow.seed_key) ===
            normalizePlannerComparableValue(fullSeed.seed_key);

          return sameSignature && !hasMatchingSeedKey;
        });

        if (signatureMatches.length === 0) {
          filteredInsertRows.push(candidate);
          return;
        }

        if (signatureMatches.length === 1) {
          const existingRow = signatureMatches[0];
          const existingRowItemType = normalizePlannerComparableValue(existingRow.item_type);
          const candidateItemType = normalizePlannerComparableValue(fullSeed.item_type);
          const hasKnownItemType = existingRowItemType.length > 0;
          const itemTypeMatches = hasKnownItemType && existingRowItemType === candidateItemType;
          const isActiveEquivalent = existingRow.is_active === true;

          if (isActiveEquivalent && itemTypeMatches) {
            equivalentRows.push({
              seed_key: fullSeed.seed_key,
              candidate_item_name: fullSeed.item_name,
              candidate_category: fullSeed.category,
              candidate_unit_label: fullSeed.unit_label,
              candidate_item_type: fullSeed.item_type,
              existing_row_id: existingRow.id,
              existing_row_is_active: existingRow.is_active,
              existing_row_seed_key: existingRow.seed_key,
            });
            return;
          }
        }

        filteredInsertRows.push(candidate);

        signatureMatches.forEach((existingRow) => {
          possibleCollisions.push({
            seed_key: fullSeed.seed_key,
            candidate_item_name: fullSeed.item_name,
            candidate_category: fullSeed.category,
            candidate_unit_label: fullSeed.unit_label,
            candidate_item_type: fullSeed.item_type,
            existing_row_id: existingRow.id,
            existing_row_is_active: existingRow.is_active,
            existing_row_seed_key: existingRow.seed_key,
            existing_row_item_type: existingRow.item_type ?? null,
          });
        });
      });
    } else {
      filteredInsertRows.push(...inserted_rows);
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

    if (equivalentRows.length > 0) {
      warnings.push(
        `Skipped ${equivalentRows.length} existing active equivalent row(s) with legacy/different seed keys.`,
      );
    }

    return buildPlanResult({
      would_insert_rows: filteredInsertRows,
      would_skip_rows: skipped_rows,
      would_skip_existing_equivalent_rows: equivalentRows,
      possible_collisions: possibleCollisions,
      warnings,
      errors: [],
    });
  } catch (err) {
    return buildPlanResult({
      would_insert_rows: [],
      would_skip_rows: [],
      would_skip_existing_equivalent_rows: [],
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
  starter_kit_version?: BackfillStarterKitVersion;
  confirmApply: true;
  allowCollisions?: true;
}): Promise<ExistingAccountStarterKitBackfillApplyResult> {
  const { store, account_owner_user_id } = params;
  const starterKitVersion: BackfillStarterKitVersion =
    params.starter_kit_version === 'v3' ? 'v3' : 'v2';
  const selection = resolveStarterKitSeeds(starterKitVersion);

  const buildApplyResult = (input: {
    inserted_rows: Array<{ seed_key: string; item_name: string }>;
    skipped_rows: Array<{ seed_key: string; item_name: string }>;
    equivalent_rows: ExistingAccountStarterKitBackfillApplyResult['equivalent_rows'];
    possible_collisions: ExistingAccountStarterKitBackfillApplyResult['possible_collisions'];
    warnings?: string[];
    errors?: string[];
  }): ExistingAccountStarterKitBackfillApplyResult => ({
    mode: 'apply',
    account_owner_user_id,
    starter_kit_version: starterKitVersion,
    seed_count: selection.seedCount,
    active_seed_count: selection.activeCount,
    inactive_seed_count: selection.inactiveCount,
    inserted_count: input.inserted_rows.length,
    skipped_existing_seed_key_count: input.skipped_rows.length,
    skipped_existing_equivalent_count: input.equivalent_rows.length,
    possible_collision_count: input.possible_collisions.length,
    inserted_rows: input.inserted_rows,
    skipped_rows: input.skipped_rows,
    equivalent_rows: input.equivalent_rows,
    possible_collisions: input.possible_collisions,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
  });

  // Runtime guard: explicit confirmation required even though the type enforces confirmApply: true.
  if (params.confirmApply !== true) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: [],
      equivalent_rows: [],
      possible_collisions: [],
      errors: ['confirmApply: true is required to execute the apply path.'],
    });
  }

  const plan = await planExistingAccountStarterKitBackfill({
    store,
    account_owner_user_id,
    starter_kit_version: starterKitVersion,
    previewLimit: selection.seedCount,
  });

  if (plan.errors.length > 0) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      equivalent_rows: plan.preview_existing_equivalent_rows,
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
      equivalent_rows: plan.preview_existing_equivalent_rows,
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
      equivalent_rows: plan.preview_existing_equivalent_rows,
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
      equivalent_rows: plan.preview_existing_equivalent_rows,
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
        equivalent_rows: plan.preview_existing_equivalent_rows,
        possible_collisions: plan.possible_collisions,
        warnings: plan.warnings,
        errors: [`Database insert error: ${insertError.message}`],
      });
    }

    return buildApplyResult({
      inserted_rows: plan.preview_insert_rows,
      skipped_rows: plan.preview_skip_rows,
      equivalent_rows: plan.preview_existing_equivalent_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [],
    });
  } catch (err) {
    return buildApplyResult({
      inserted_rows: [],
      skipped_rows: plan.preview_skip_rows,
      equivalent_rows: plan.preview_existing_equivalent_rows,
      possible_collisions: plan.possible_collisions,
      warnings: plan.warnings,
      errors: [`Unexpected error: ${err instanceof Error ? err.message : String(err)}`],
    });
  }
}
