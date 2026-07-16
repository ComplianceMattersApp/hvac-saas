import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260716120000_contractor_saved_payment_method_foundation.sql"),
  "utf8",
);

describe("contractor saved payment method schema", () => {
  it("keeps contractor payment identity separate from customer payment identity", () => {
    expect(sql).toContain("tenant_contractor_stripe_customers");
    expect(sql).toContain("tenant_contractor_payment_methods");
    expect(sql).toContain("tenant_contractor_saved_payment_method_setups");
    expect(sql).not.toMatch(/customer_id uuid NOT NULL REFERENCES public\.customers/);
  });

  it("stores only processor references and display-safe card fields", () => {
    expect(sql).toContain("stripe_payment_method_id");
    expect(sql).toContain("display_last4");
    expect(sql).toContain("display_exp_month");
    expect(sql).toContain("display_exp_year");
    expect(sql).not.toMatch(/card_number|\bcvc\b|client_secret/i);
  });

  it("allows scoped reads but leaves writes to service-role workflows", () => {
    expect(sql).toMatch(/public\.current_user_has_contractor_membership\(%I\.contractor_id\)/);
    expect(sql).toContain("FOR SELECT TO authenticated");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)\s+TO authenticated/i);
  });

  it("provides webhook idempotency and setup lifecycle constraints", () => {
    expect(sql).toContain("tenant_contractor_stripe_event_receipts_event_idx");
    expect(sql).toContain("stripe_checkout_session_id");
    expect(sql).toContain("setup_status IN");
  });
});
