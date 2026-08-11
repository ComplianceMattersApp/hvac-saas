import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260810123000_internal_invoice_payment_integrity_guards.sql',
);

describe('internal invoice payment integrity migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('serializes invoice payment writes and rejects cross-scope or over-balance truth', () => {
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('NEW.account_owner_user_id IS DISTINCT FROM invoice_owner_id');
    expect(sql).toContain('NEW.job_id IS DISTINCT FROM invoice_job_id');
    expect(sql).toContain("NEW.payment_status = 'recorded'");
    expect(sql).toContain('GREATEST(NEW.amount_cents - COALESCE(NEW.stripe_refunded_amount_cents, 0), 0)');
    expect(sql).toContain('internal_invoice_payments_refund_amount_valid_chk');
    expect(sql).toContain('recorded payments would exceed invoice total');
    expect(sql).toContain('NEW.stripe_refunded_amount_cents := OLD.stripe_refunded_amount_cents');
  });

  it('dedupes in-flight checkout rows before either webhook can promote them', () => {
    expect(sql).toContain("'recorded_v1', 'checkout_v1'");
    expect(sql).toContain('internal_invoice_payments_checkout_v1_session_unique');
    expect(sql).toContain('internal_invoice_payments_collection_operation_unique');
    expect(sql).toContain("stripe_identity_dedupe_scope = 'checkout_v1'");
    expect(sql).toContain("payment_status = 'pending'");
  });

  it('keeps the allocation projection synchronized for every payment transition', () => {
    expect(sql).toContain('CREATE TRIGGER internal_invoice_payments_sync_allocation');
    expect(sql).toContain("WHEN 'recorded' THEN 'active'");
    expect(sql).toContain("WHEN 'reversed' THEN 'reversed'");
    expect(sql).toContain('ON CONFLICT (source_internal_invoice_payment_id)');
    expect(sql).toMatch(/INSERT INTO public\.internal_invoice_payment_allocations[\s\S]+FROM public\.internal_invoice_payments payment/);
  });

  it('atomically reserves one online collection channel per invoice', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.internal_invoice_collection_reservations');
    expect(sql).toContain('invoice_id uuid PRIMARY KEY');
    expect(sql).toContain('claim_internal_invoice_collection_reservation');
    expect(sql).toContain('release_internal_invoice_collection_reservation');
    expect(sql).toContain("'stripe_checkout'");
    expect(sql).toContain("'manual_saved_method'");
    expect(sql).toContain("'scheduled_autopay'");
    expect(sql).toContain("'manual_off_platform'");
    expect(sql).toContain("'field_payment_verification'");
    expect(sql).toContain('recorded_cents + p_amount_cents > invoice_total_cents');
    expect(sql).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(sql).toContain('2678400');
  });

  it('is additive and never deletes payment truth', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.internal_invoice_payments/i);
  });
});
