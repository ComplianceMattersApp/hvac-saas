import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260606100000_internal_user_access_capabilities_foundation.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

const allowedCapabilityKeys = [
  'field_billing_enabled',
  'can_view_field_billing_summary',
  'can_collect_field_payment',
  'can_report_non_card_collection',
  'can_collect_card_payment',
  'can_verify_non_card_collection',
];

describe('internal user access capabilities schema foundation migration', () => {
  it('adds the additive capability table with required columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.internal_user_access_capabilities');
    expect(sql).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain('account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(sql).toContain('internal_user_id uuid NOT NULL REFERENCES public.internal_users(user_id)');
    expect(sql).toContain('capability_key text NOT NULL');
    expect(sql).toContain('enabled boolean NOT NULL DEFAULT false');
    expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('updated_by_user_id uuid NULL REFERENCES auth.users(id)');
  });

  it('adds unique account/user/key protection and expected lookup indexes', () => {
    expect(sql).toContain('internal_user_access_capabilities_account_user_key_uidx');
    expect(sql).toContain('UNIQUE (account_owner_user_id, internal_user_id, capability_key)');
    expect(sql).toContain('internal_user_access_capabilities_account_user_idx');
    expect(sql).toContain('ON public.internal_user_access_capabilities (account_owner_user_id, internal_user_id)');
    expect(sql).toContain('internal_user_access_capabilities_enabled_key_idx');
    expect(sql).toContain('ON public.internal_user_access_capabilities (account_owner_user_id, capability_key)');
    expect(sql).toContain('WHERE enabled = true');
  });

  it('locks the capability key allowlist and rejects unknown keys by check constraint', () => {
    expect(sql).toContain('internal_user_access_capabilities_key_valid_chk');
    expect(sql).toContain('CHECK (');
    for (const key of allowedCapabilityKeys) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).not.toContain("'can_issue_invoice'");
    expect(sql).not.toContain("'can_send_invoice'");
    expect(sql).not.toContain("'can_record_manual_payment'");
    expect(sql).not.toContain("'can_export_financial_data'");
  });

  it('adds same-account target invariant trigger against internal_users', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.assert_internal_user_access_capability_scope()');
    expect(sql).toContain('FROM public.internal_users iu');
    expect(sql).toContain('WHERE iu.user_id = NEW.internal_user_id');
    expect(sql).toContain('internal user/account mismatch');
    expect(sql).toContain('CREATE TRIGGER internal_user_access_capabilities_assert_scope');
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON public.internal_user_access_capabilities');
  });

  it('uses the standard updated_at trigger pattern', () => {
    expect(sql).toContain('CREATE TRIGGER internal_user_access_capabilities_set_updated_at');
    expect(sql).toContain('BEFORE UPDATE ON public.internal_user_access_capabilities');
    expect(sql).toContain('EXECUTE FUNCTION public.set_updated_at()');
  });

  it('enables account-scoped RLS with owner/admin management policies', () => {
    expect(sql).toContain('ALTER TABLE public.internal_user_access_capabilities ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY internal_user_access_capabilities_select_account_scope');
    expect(sql).toContain('CREATE POLICY internal_user_access_capabilities_insert_admin_owner_scope');
    expect(sql).toContain('CREATE POLICY internal_user_access_capabilities_update_admin_owner_scope');
    expect(sql).toContain('public.current_internal_account_owner_id()');
    expect(sql).toContain('actor.role = \'admin\'');
    expect(sql).toContain('actor.user_id = internal_user_access_capabilities.account_owner_user_id');
    expect(sql).toContain('updated_by_user_id = auth.uid()');
  });

  it('creates no delete policy and does not touch payment, Stripe, invoice, or role truth', () => {
    expect(sql).toContain('No DELETE policy in this foundation slice');
    expect(sql).not.toMatch(/CREATE POLICY\s+internal_user_access_capabilities_delete/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_users\s+/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.internal_users/i);
    expect(sql).not.toMatch(/INSERT INTO\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(sql).not.toMatch(/tenant_stripe|stripe_checkout|stripe_payment|stripe_charge|stripe_event/i);
  });
});
