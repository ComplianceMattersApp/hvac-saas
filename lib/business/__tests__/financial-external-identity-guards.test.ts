import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260819120000_financial_external_identity_guards.sql",
), "utf8");

describe("financial external identity guards migration", () => {
  it("makes QuickBooks invoice identity tenant-wide and allocation identity invoice-scoped", () => {
    expect(sql).toContain("internal_invoices_owner_qbo_invoice_identity_unique");
    expect(sql).toContain("internal_inv_pay_owner_invoice_qbo_payment_uidx");
    expect(sql).toMatch(/account_owner_user_id, invoice_id, \(btrim\(qbo_payment_id\)\)/);
  });

  it("makes current canonical Stripe identities unique across every invoice in one tenant", () => {
    expect(sql).toMatch(/account_owner_user_id, \(btrim\(processor_charge_id\)\)/);
    expect(sql).toMatch(/account_owner_user_id, \(btrim\(stripe_payment_intent_id\)\)/);
    expect(sql).toMatch(/account_owner_user_id, \(btrim\(stripe_checkout_session_id\)\)/);
    expect(sql.match(/stripe_identity_dedupe_scope IN \('recorded_v1', 'checkout_v1', 'attempt_v1'\)/g)).toHaveLength(4);
    expect(sql).toContain("payment_status <> 'failed'");
  });

  it("requires every future Stripe write to participate in the identity guard", () => {
    expect(sql).toContain("internal_inv_pay_stripe_scope_valid_chk");
    expect(sql).toContain("assert_internal_invoice_payment_stripe_identity");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.internal_invoice_payments");
    expect(sql).toContain("TG_OP = 'INSERT'");
    expect(sql).toContain("Stripe payment rows require an identity lifecycle scope");
    expect(sql).toContain("Stripe identity lifecycle scope does not match payment status");
  });

  it("bridges retained legacy identities while unique indexes close concurrent races", () => {
    expect(sql).toContain("Historical rows with a NULL dedupe scope");
    expect(sql).toContain("Legacy Stripe payment identity must be reconciled before modification");
    expect(sql).toContain("existing.processor_charge_id");
    expect(sql).toContain("existing.stripe_payment_intent_id");
    expect(sql).toContain("existing.stripe_checkout_session_id");
    expect(sql).toContain("USING ERRCODE = '23505'");
  });

  it("never permits a synced QuickBooks row with a blank external id", () => {
    expect(sql).toContain("internal_invoices_qbo_synced_requires_identity_chk");
    expect(sql).toContain("internal_invoice_payments_qbo_synced_requires_identity_chk");
    expect(sql).toContain("NULLIF(btrim(qbo_invoice_id), '') IS NOT NULL");
    expect(sql).toContain("NULLIF(btrim(qbo_payment_id), '') IS NOT NULL");
  });

  it("adds guards without rewriting or deleting financial rows", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.(internal_invoices|internal_invoice_payments)/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.(internal_invoices|internal_invoice_payments)/i);
  });
});
