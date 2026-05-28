import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260528090000_tenant_saved_payment_method_setup_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("tenant saved payment method setup schema foundation migration", () => {
  it("creates all required additive foundation tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_stripe_customers");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_customer_payment_methods");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_saved_payment_method_setups");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_customer_autopay_consents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_saved_method_payment_attempts");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_stripe_event_receipts");

    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./i);
  });

  it("uses uuid account owner scope columns across all new tables", () => {
    const ownerColumnMatches = sql.match(/account_owner_user_id\s+uuid\s+NOT\s+NULL/gi) ?? [];
    expect(ownerColumnMatches.length).toBe(6);
    expect(sql).toContain("REFERENCES auth.users(id)");
  });

  it("adds required idempotency and uniqueness indexes", () => {
    expect(sql).toContain("tenant_stripe_customers_one_current_per_customer_idx");
    expect(sql).toContain("tenant_customer_payment_methods_connected_pm_unique_idx");
    expect(sql).toContain("tenant_customer_payment_methods_active_default_per_customer_idx");
    expect(sql).toContain("tenant_saved_payment_method_setups_setup_intent_unique_idx");
    expect(sql).toContain("tenant_saved_payment_method_setups_checkout_session_unique_idx");
    expect(sql).toContain("tenant_saved_method_payment_attempts_idempotency_key_unique_idx");
    expect(sql).toContain("tenant_stripe_event_receipts_connected_event_unique_idx");
  });

  it("enables account-scoped RLS with select/insert/update policies and no delete policies", () => {
    const tables = [
      "tenant_stripe_customers",
      "tenant_customer_payment_methods",
      "tenant_saved_payment_method_setups",
      "tenant_customer_autopay_consents",
      "tenant_saved_method_payment_attempts",
      "tenant_stripe_event_receipts",
    ];

    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_select_account_scope`);
      expect(sql).toContain(`CREATE POLICY ${table}_insert_account_scope`);
      expect(sql).toContain(`CREATE POLICY ${table}_update_account_scope`);
      expect(sql).not.toContain(`CREATE POLICY ${table}_delete_account_scope`);
    }
  });

  it("keeps credential and secret fields out of schema foundation", () => {
    const forbiddenColumns = [
      /stripe_customer_secret/i,
      /stripe_payment_method_secret/i,
      /setup_intent_client_secret/i,
      /payment_intent_client_secret/i,
      /card_number/i,
      /card_cvc/i,
      /card_cvv/i,
      /full_pan/i,
      /routing_number/i,
      /bank_account_number/i,
      /account_number/i,
      /iban/i,
      /ach_authorization/i,
      /mandate_reference/i,
    ];

    for (const pattern of forbiddenColumns) {
      expect(sql).not.toMatch(pattern);
    }
  });

  it("keeps ACH/bank execution behavior deferred while allowing display-safe metadata", () => {
    expect(sql).toContain("bank_name_display");
    expect(sql).toContain("bank_last4_display");

    const forbiddenExecutionPrimitives = [
      /microdeposit/i,
      /financial_connections/i,
      /ach_debit/i,
      /us_bank_account_debit/i,
      /bank_transfer/i,
      /debit_mandate/i,
      /mandate_accepted_at/i,
    ];

    for (const pattern of forbiddenExecutionPrimitives) {
      expect(sql).not.toMatch(pattern);
    }
  });

  it("keeps payment truth boundaries by not mutating internal invoice payments schema", () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payments\s+ADD\s+COLUMN/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payments\s+DROP/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.internal_invoice_payments/i);
  });
});

describe("checkout session id constraint fix migration", () => {
  const fixMigrationPath = join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260527120000_fix_checkout_session_id_constraint.sql",
  );

  const fixSql = readFileSync(fixMigrationPath, "utf8");

  it("replaces the too-strict constraint with one that accepts cs_test_ and cs_live_ format", () => {
    expect(fixSql).toContain("DROP CONSTRAINT IF EXISTS tenant_saved_payment_method_setups_checkout_session_id_format_c");
    expect(fixSql).toContain("ADD CONSTRAINT tenant_saved_payment_method_setups_checkout_session_id_format_c");
    expect(fixSql).toContain("^cs_(test|live)_[A-Za-z0-9]+$");
    // old strict pattern must not appear in the fix migration
    expect(fixSql).not.toContain("'^cs_[A-Za-z0-9]+$'");
  });

  it("does not touch any other table or constraint", () => {
    expect(fixSql).not.toMatch(/DROP\s+TABLE/i);
    // Exactly one DROP CONSTRAINT and one ADD CONSTRAINT — the expected pair
    const dropConstraintCount = (fixSql.match(/DROP\s+CONSTRAINT/gi) ?? []).length;
    const addConstraintCount = (fixSql.match(/ADD\s+CONSTRAINT/gi) ?? []).length;
    expect(dropConstraintCount).toBe(1);
    expect(addConstraintCount).toBe(1);
    // Both reference only the expected constraint name
    expect(fixSql).toContain("tenant_saved_payment_method_setups_checkout_session_id_format_c");
    // All ALTER TABLE references are on the expected table
    const alteredTables = [...fixSql.matchAll(/ALTER\s+TABLE\s+public\.(\S+)/gi)].map(m => m[1]);
    for (const tableName of alteredTables) {
      expect(tableName).toBe("tenant_saved_payment_method_setups");
    }
  });
});
