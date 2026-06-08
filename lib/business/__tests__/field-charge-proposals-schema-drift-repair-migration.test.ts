import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repairMigrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260608160000_repair_field_charge_proposals_schema_drift.sql',
);

const foundationMigrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260605110000_field_charge_proposals_foundation.sql',
);

const repairSql = readFileSync(repairMigrationPath, 'utf8');
const foundationSql = readFileSync(foundationMigrationPath, 'utf8');

describe('field charge proposals schema drift repair migration', () => {
  it('restores only the proposal schema contract without invoice, payment, or Stripe mutation', () => {
    expect(repairSql).toContain('CREATE TABLE IF NOT EXISTS public.field_charge_proposals');
    expect(repairSql).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\./i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_line_items/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(repairSql).not.toMatch(/stripe|checkout_session|payment_intent|payment_method/i);
  });

  it('keeps the intended table, constraint, and index contract aligned', () => {
    const requiredTokens = [
      'account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)',
      'job_id uuid NOT NULL REFERENCES public.jobs(id)',
      'internal_invoice_id uuid NULL REFERENCES public.internal_invoices(id)',
      'source_pricebook_item_id uuid NULL REFERENCES public.pricebook_items(id)',
      'source_visit_scope_item_id uuid NULL',
      'converted_internal_invoice_line_item_id uuid NULL REFERENCES public.internal_invoice_line_items(id)',
      "CHECK (source_kind IN ('pricebook', 'visit_scope', 'manual'))",
      "CHECK (status IN ('draft', 'submitted_for_review', 'approved', 'rejected', 'voided'))",
      'field_charge_proposals_price_pair_chk',
      'field_charge_proposals_pricebook_source_chk',
      'field_charge_proposals_visit_scope_source_chk',
      'field_charge_proposals_manual_source_chk',
      'field_charge_proposals_reviewed_state_chk',
      'field_charge_proposals_converted_only_approved_chk',
      'field_charge_proposals_owner_job_status_idx',
      'field_charge_proposals_owner_invoice_status_idx',
      'field_charge_proposals_source_pricebook_idx',
      'field_charge_proposals_converted_line_item_idx',
    ];

    for (const token of requiredTokens) {
      expect(foundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it('keeps account-scope enforcement and read-only RLS posture aligned', () => {
    const requiredTokens = [
      'CREATE OR REPLACE FUNCTION public.assert_field_charge_proposal_scope()',
      'field_charge_proposals account_owner_user_id must match jobs.account_owner_user_id',
      'field_charge_proposals internal invoice/job mismatch',
      'field_charge_proposals pricebook item/account mismatch',
      'field_charge_proposals converted line item/job mismatch',
      'CREATE TRIGGER field_charge_proposals_assert_scope',
      'ALTER TABLE public.field_charge_proposals ENABLE ROW LEVEL SECURITY',
      'CREATE POLICY field_charge_proposals_select_account_scope',
    ];

    for (const token of requiredTokens) {
      expect(foundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    expect(repairSql).not.toContain('CREATE POLICY field_charge_proposals_insert_account_scope');
    expect(repairSql).not.toContain('CREATE POLICY field_charge_proposals_update_account_scope');
    expect(repairSql).not.toContain('CREATE POLICY field_charge_proposals_delete_account_scope');
  });
});
