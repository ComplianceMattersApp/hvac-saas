import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260527174000_internal_invoice_payments_stripe_identity_dedupe_v1.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

describe('internal invoice payments stripe identity dedupe migration', () => {
  it('is additive and does not perform payment cleanup or destructive table changes', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS stripe_identity_dedupe_scope');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.internal_invoice_payments/i);
  });

  it('keeps stripe_event_id idempotency in place by not dropping prior stripe event unique index', () => {
    expect(sql).not.toMatch(/DROP\s+INDEX\s+.*stripe_event_id/i);
  });

  it('adds partial unique index for recorded_v1 stripe payment intent identity', () => {
    expect(sql).toContain('internal_invoice_payments_recorded_v1_pi_identity_unique');
    expect(sql).toContain('stripe_payment_intent_id');
    expect(sql).toContain("stripe_identity_dedupe_scope = 'recorded_v1'");
    expect(sql).toContain("payment_status = 'recorded'");
  });

  it('adds partial unique index for recorded_v1 stripe charge identity', () => {
    expect(sql).toContain('internal_invoice_payments_recorded_v1_charge_identity_unique');
    expect(sql).toContain('processor_charge_id');
    expect(sql).toContain("payment_method = 'card_stripe_online'");
  });

  it('adds partial unique index for recorded_v1 checkout session identity', () => {
    expect(sql).toContain('internal_invoice_payments_recorded_v1_checkout_identity_unique');
    expect(sql).toContain('stripe_checkout_session_id');
  });
});
