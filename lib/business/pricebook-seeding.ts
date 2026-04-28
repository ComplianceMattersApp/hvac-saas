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

import { SupabaseClient } from '@supabase/supabase-js';

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
  client: SupabaseClient,
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
    // Fetch existing seed keys for this account
    const { data: existing, error } = await client
      .from('pricebook_items')
      .select('seed_key, item_name')
      .eq('account_owner_user_id', account_owner_user_id)
      .not('seed_key', 'is', null);

    if (error) {
      return {
        inserted_count: 0,
        skipped_count: 0,
        errors: [`Database error: ${error.message}`],
      };
    }

    const existing_keys = new Set(existing?.map((r) => r.seed_key) || []);
    const inserted_rows: Array<{ seed_key: string; item_name: string }> = [];
    const skipped_rows: Array<{ seed_key: string; item_name: string }> = [];

    seeds.forEach((seed) => {
      if (existing_keys.has(seed.seed_key)) {
        skipped_rows.push({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        });
      } else {
        inserted_rows.push({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        });
      }
    });

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
  client: SupabaseClient,
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
    // Fetch existing seed keys for this account
    const { data: existing, error: selectError } = await client
      .from('pricebook_items')
      .select('seed_key, item_name')
      .eq('account_owner_user_id', account_owner_user_id)
      .not('seed_key', 'is', null);

    if (selectError) {
      return {
        inserted_count: 0,
        skipped_count: 0,
        errors: [`Database select error: ${selectError.message}`],
      };
    }

    const existing_keys = new Set(existing?.map((r) => r.seed_key) || []);
    const to_insert: Array<
      Omit<PricebookStarterSeedDefinition, 'seed_key' | 'starter_version'> & {
        seed_key: string;
        starter_version: string;
        account_owner_user_id: string;
      }
    > = [];
    const skipped_rows: Array<{ seed_key: string; item_name: string }> = [];

    seeds.forEach((seed) => {
      if (existing_keys.has(seed.seed_key)) {
        skipped_rows.push({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        });
      } else {
        to_insert.push({
          ...seed,
          account_owner_user_id,
        });
      }
    });

    // Insert new rows
    let inserted_count = 0;
    if (to_insert.length > 0) {
      const { error: insertError } = await client
        .from('pricebook_items')
        .insert(to_insert);

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
      inserted_rows: to_insert.map((row) => ({
        seed_key: row.seed_key,
        item_name: row.item_name,
      })),
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
