import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260610110000_stripe_payment_settlements_foundation.sql",
);

const repairMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260610123000_repair_stripe_payment_settlements_upsert_unique.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const repairSql = readFileSync(repairMigrationPath, "utf8");

describe("stripe payment settlements schema foundation migration", () => {
  it("creates the dormant additive settlements table without mutating existing truth tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.stripe_payment_settlements");
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoices/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.internal_invoice_payments/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.internal_invoice_payment_allocations/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.internal_invoices/i);
  });

  it("defines the required settlement columns with nullable internal payment link", () => {
    [
      "id uuid PRIMARY KEY DEFAULT gen_random_uuid()",
      "account_owner_user_id uuid NOT NULL",
      "internal_invoice_payment_id uuid NULL",
      "stripe_connected_account_id text NOT NULL",
      "stripe_charge_id text NULL",
      "stripe_payment_intent_id text NULL",
      "stripe_checkout_session_id text NULL",
      "stripe_balance_transaction_id text NULL",
      "stripe_payout_id text NULL",
      "settlement_kind text NOT NULL",
      "source_object_type text NOT NULL",
      "gross_amount_cents integer NOT NULL DEFAULT 0",
      "stripe_fee_cents integer NOT NULL DEFAULT 0",
      "platform_fee_cents integer NOT NULL DEFAULT 0",
      "net_amount_cents integer NOT NULL DEFAULT 0",
      "currency text NOT NULL DEFAULT 'usd'",
      "available_on timestamptz NULL",
      "payout_arrival_date timestamptz NULL",
      "payout_status text NULL",
      "reporting_category text NULL",
      "fee_details jsonb NOT NULL DEFAULT '[]'::jsonb",
      "sync_status text NOT NULL DEFAULT 'pending'",
      "sync_error text NULL",
      "synced_at timestamptz NULL",
      "created_at timestamptz NOT NULL DEFAULT now()",
      "updated_at timestamptz NOT NULL DEFAULT now()",
    ].forEach((snippet) => expect(sql).toContain(snippet));
  });

  it("adds account owner and nullable payment foreign keys", () => {
    expect(sql).toContain("account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT");
    expect(sql).toContain(
      "internal_invoice_payment_id uuid NULL REFERENCES public.internal_invoice_payments(id) ON DELETE SET NULL",
    );
  });

  it("locks allowed settlement kinds", () => {
    expect(sql).toContain("CONSTRAINT stripe_payment_settlements_kind_valid_chk");
    [
      "'payment'",
      "'refund'",
      "'dispute'",
      "'adjustment'",
      "'application_fee'",
      "'payout_adjustment'",
      "'unmatched'",
    ].forEach((value) => expect(sql).toContain(value));
    expect(sql).not.toContain("'invoice_paid'");
  });

  it("locks allowed sync statuses", () => {
    expect(sql).toContain("CONSTRAINT stripe_payment_settlements_sync_status_valid_chk");
    ["'pending'", "'synced'", "'skipped'", "'unmatched'", "'failed'"].forEach((value) => {
      expect(sql).toContain(value);
    });
    expect(sql).not.toContain("'posted_to_qbo'");
  });

  it("enforces lowercase three-letter currency and array fee details", () => {
    expect(sql).toContain("CONSTRAINT stripe_payment_settlements_currency_valid_chk");
    expect(sql).toContain("currency = lower(currency) AND currency ~ '^[a-z]{3}$'");
    expect(sql).toContain("CONSTRAINT stripe_payment_settlements_fee_details_array_chk");
    expect(sql).toContain("CHECK (jsonb_typeof(fee_details) = 'array')");
  });

  it("adds the expected reconciliation indexes", () => {
    [
      "stripe_payment_settlements_balance_txn_unique",
      "stripe_payment_settlements_owner_payout_idx",
      "stripe_payment_settlements_owner_available_on_idx",
      "stripe_payment_settlements_owner_payout_arrival_idx",
      "stripe_payment_settlements_owner_sync_status_idx",
      "stripe_payment_settlements_owner_kind_idx",
      "stripe_payment_settlements_internal_payment_idx",
    ].forEach((indexName) => expect(sql).toContain(indexName));

    expect(sql).toContain(
      "ON public.stripe_payment_settlements (stripe_connected_account_id, stripe_balance_transaction_id)",
    );
    expect(sql).toContain("WHERE stripe_balance_transaction_id IS NOT NULL");
    expect(sql).toContain("WHERE internal_invoice_payment_id IS NOT NULL");
  });

  it("uses the standard updated_at trigger pattern", () => {
    expect(sql).toContain("CREATE TRIGGER stripe_payment_settlements_set_updated_at");
    expect(sql).toContain("EXECUTE FUNCTION public.set_updated_at()");
  });

  it("enables account-scoped RLS SELECT only with no delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.stripe_payment_settlements ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY stripe_payment_settlements_select_account_scope");
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("actor.user_id = auth.uid()");
    expect(sql).toContain("actor.is_active = true");
    expect(sql).toContain(
      "actor.account_owner_user_id = stripe_payment_settlements.account_owner_user_id",
    );
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*delete/i);
    expect(sql).not.toMatch(/FOR\s+DELETE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*insert/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*update/i);
  });

  it("does not add fields that would mutate invoice payment allocation or ledger behavior", () => {
    expect(sql).not.toMatch(/\binvoice_paid\b/i);
    expect(sql).not.toMatch(/\bbalance_due\b/i);
    expect(sql).not.toMatch(/\ballocation_status\b/i);
    expect(sql).not.toMatch(/\bqbo_/i);
    expect(sql).not.toMatch(/\bgeneral_ledger\b/i);
  });
});

describe("stripe payment settlements upsert uniqueness repair migration", () => {
  it("replaces the partial unique index with a full unique index for conflict inference", () => {
    expect(repairSql).toContain("DROP INDEX IF EXISTS public.stripe_payment_settlements_balance_txn_unique");
    expect(repairSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS stripe_payment_settlements_balance_txn_unique");
    expect(repairSql).toContain(
      "ON public.stripe_payment_settlements (stripe_connected_account_id, stripe_balance_transaction_id)",
    );
    expect(repairSql).not.toContain("WHERE stripe_balance_transaction_id IS NOT NULL");
  });

  it("remains repair-only and does not introduce truth-table mutation or write policies", () => {
    expect(repairSql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payments/i);
    expect(repairSql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(repairSql).not.toMatch(/ALTER\s+TABLE\s+public\.internal_invoices/i);
    expect(repairSql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*insert/i);
    expect(repairSql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*update/i);
    expect(repairSql).not.toMatch(/CREATE\s+POLICY\s+stripe_payment_settlements_.*delete/i);
  });
});
