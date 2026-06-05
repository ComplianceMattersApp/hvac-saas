import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260605110000_field_charge_proposals_foundation.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

describe('field charge proposals schema foundation migration', () => {
  it('adds an additive proposal table without mutating invoice or payment truth tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.field_charge_proposals');
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_line_items/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\.internal_/i);
  });

  it('locks proposal statuses and source kinds', () => {
    expect(sql).toContain("CHECK (source_kind IN ('pricebook', 'visit_scope', 'manual'))");
    expect(sql).toContain(
      "CHECK (status IN ('draft', 'submitted_for_review', 'approved', 'rejected', 'voided'))",
    );
  });

  it('adds proposal, source, review, and conversion references', () => {
    expect(sql).toContain('account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(sql).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id)');
    expect(sql).toContain('internal_invoice_id uuid NULL REFERENCES public.internal_invoices(id)');
    expect(sql).toContain('source_pricebook_item_id uuid NULL REFERENCES public.pricebook_items(id)');
    expect(sql).toContain('source_visit_scope_item_id uuid NULL');
    expect(sql).toContain('proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(sql).toContain('reviewed_by_user_id uuid NULL REFERENCES auth.users(id)');
    expect(sql).toContain(
      'converted_internal_invoice_line_item_id uuid NULL REFERENCES public.internal_invoice_line_items(id)',
    );
  });

  it('keeps proposed amounts nullable and explicitly non-collectible by avoiding invoice totals', () => {
    expect(sql).toContain('proposed_unit_price_cents integer NULL');
    expect(sql).toContain('proposed_subtotal_cents integer NULL');
    expect(sql).toContain('field_charge_proposals_price_pair_chk');
    expect(sql).not.toContain('subtotal_cents =');
    expect(sql).not.toContain('total_cents =');
    expect(sql).not.toContain('payment_status');
    expect(sql).not.toContain('balance_due');
  });

  it('enforces source-specific shape and reviewed/converted state shape', () => {
    expect(sql).toContain('field_charge_proposals_pricebook_source_chk');
    expect(sql).toContain('field_charge_proposals_visit_scope_source_chk');
    expect(sql).toContain('field_charge_proposals_manual_source_chk');
    expect(sql).toContain('field_charge_proposals_reviewed_state_chk');
    expect(sql).toContain('field_charge_proposals_converted_only_approved_chk');
  });

  it('adds account consistency trigger for job, invoice, pricebook, and converted line references', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.assert_field_charge_proposal_scope()');
    expect(sql).toContain('account_owner_user_id must match jobs.account_owner_user_id');
    expect(sql).toContain('internal invoice/job mismatch');
    expect(sql).toContain('pricebook item/account mismatch');
    expect(sql).toContain('converted line item/job mismatch');
    expect(sql).toContain('CREATE TRIGGER field_charge_proposals_assert_scope');
  });

  it('enables read-only account-scoped RLS for B6-F with no broad app write policies', () => {
    expect(sql).toContain('ALTER TABLE public.field_charge_proposals ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY field_charge_proposals_select_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_charge_proposals_insert_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_charge_proposals_update_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_charge_proposals_delete_account_scope');
  });
});
