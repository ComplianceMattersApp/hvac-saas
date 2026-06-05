import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260605183000_field_payment_collection_reports_foundation.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

describe('field payment collection reports schema foundation migration', () => {
  it('adds an additive report table without mutating payment truth tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.field_payment_collection_reports');
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_line_items/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments\s+/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\.internal_/i);
    expect(sql).not.toContain('INSERT INTO public.internal_invoice_payments');
  });

  it('locks non-card methods and reconciliation statuses', () => {
    expect(sql).toContain("CHECK (payment_method IN ('check', 'cash', 'other'))");
    expect(sql).toContain(
      "CHECK (status IN ('reported', 'under_review', 'needs_correction', 'verified', 'rejected', 'voided', 'corrected'))",
    );
  });

  it('adds required account, job, invoice, reporter, and resolution references', () => {
    expect(sql).toContain('account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(sql).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id)');
    expect(sql).toContain('internal_invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id)');
    expect(sql).toContain('customer_id uuid NULL REFERENCES public.customers(id)');
    expect(sql).toContain('reported_by_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(sql).toContain('reported_at timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('verified_by_user_id uuid NULL REFERENCES auth.users(id)');
    expect(sql).toContain('rejected_by_user_id uuid NULL REFERENCES auth.users(id)');
    expect(sql).toContain('voided_by_user_id uuid NULL REFERENCES auth.users(id)');
    expect(sql).toContain('corrected_from_report_id uuid NULL REFERENCES public.field_payment_collection_reports(id)');
    expect(sql).toContain('final_internal_invoice_payment_id uuid NULL REFERENCES public.internal_invoice_payments(id)');
  });

  it('keeps the report row non-collectible and avoids invoice paid or balance fields', () => {
    expect(sql).toContain('amount_cents integer NOT NULL');
    expect(sql).toContain("currency text NOT NULL DEFAULT 'usd'");
    expect(sql).toContain('reference text NULL');
    expect(sql).toContain('note text NULL');
    expect(sql).toContain('field_payment_collection_reports_verified_state_chk');
    expect(sql).toContain('field_payment_collection_reports_rejected_state_chk');
    expect(sql).toContain('field_payment_collection_reports_voided_state_chk');
    expect(sql).toContain('field_payment_collection_reports_corrected_state_chk');
    expect(sql).not.toContain('balance_due');
    expect(sql).not.toContain('paid_amount');
    expect(sql).not.toContain('allocated_amount_cents');
    expect(sql).not.toContain('subtotal_cents');
    expect(sql).not.toContain('total_cents =');
  });

  it('adds strong source consistency trigger for job, invoice, customer, corrected source, and final payment references', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.assert_field_payment_collection_report_scope()');
    expect(sql).toContain('account_owner_user_id must match jobs.account_owner_user_id');
    expect(sql).toContain('internal invoice/account mismatch');
    expect(sql).toContain('internal invoice/job mismatch');
    expect(sql).toContain('customer/job mismatch');
    expect(sql).toContain('corrected source/account mismatch');
    expect(sql).toContain('final payment/invoice mismatch');
    expect(sql).toContain('CREATE TRIGGER field_payment_collection_reports_assert_scope');
  });

  it('enables read-only account-scoped RLS with no broad app write policies', () => {
    expect(sql).toContain('ALTER TABLE public.field_payment_collection_reports ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY field_payment_collection_reports_select_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_payment_collection_reports_insert_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_payment_collection_reports_update_account_scope');
    expect(sql).not.toContain('CREATE POLICY field_payment_collection_reports_delete_account_scope');
  });

  it('adds reporting queue indexes without introducing payment mutation logic', () => {
    expect(sql).toContain('field_payment_collection_reports_owner_status_idx');
    expect(sql).toContain('field_payment_collection_reports_owner_invoice_status_idx');
    expect(sql).toContain('field_payment_collection_reports_owner_job_status_idx');
    expect(sql).toContain('field_payment_collection_reports_owner_reporter_idx');
    expect(sql).toContain('field_payment_collection_reports_final_payment_idx');
    expect(sql).toContain('field_payment_collection_reports_corrected_from_idx');
    expect(sql).not.toContain('INSERT INTO public.internal_invoice_payments');
    expect(sql).not.toContain('UPDATE public.internal_invoice_payments');
  });
});