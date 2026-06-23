import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const todayPageSource = readFileSync(
  resolve(__dirname, "../../../app/today/page.tsx"),
  "utf-8",
);

const todayReadModelSource = readFileSync(
  resolve(__dirname, "../today-read-model.ts"),
  "utf-8",
);

describe("today business attention wiring", () => {
  it("imports and uses failed and confirm-payment read models", () => {
    expect(todayReadModelSource).toContain("loadFailedPaymentReconciliationItems");
    expect(todayReadModelSource).toContain("listFieldPaymentCollectionReportsForReconciliation");
    expect(todayReadModelSource).toContain("failedPaymentAttentionPromise");
    expect(todayReadModelSource).toContain("confirmPaymentAttentionPromise");
    expect(todayReadModelSource).toContain("failedPaymentsOpenCount");
  });

  it("keeps financial tiles role-gated and allows explicit confirm-payment verifier access", () => {
    expect(todayReadModelSource).toContain("canViewFinancialRegister");
    expect(todayReadModelSource).toContain("canViewFailedPaymentAttention");
    expect(todayReadModelSource).toContain("canViewConfirmPaymentAttention");
    expect(todayReadModelSource).toContain("fieldBillingCapabilities.can_verify_non_card_collection");
    expect(todayReadModelSource).toContain("failedPaymentsOpenCount: canViewFailedPaymentAttention ? failedPaymentAttention.openCount : null");
    expect(todayReadModelSource).toContain("confirmPaymentsOpenCount: confirmPaymentAttention.openCount");
  });

  it("links money attention tiles to trusted report surfaces", () => {
    expect(todayReadModelSource).toContain("FAILED ATTEMPTS");
    expect(todayReadModelSource).toContain("CONFIRM PAYMENTS");
    expect(todayReadModelSource).toContain("OPEN INVOICES");
    expect(todayReadModelSource).toContain("/reports/failed-payments");
    expect(todayReadModelSource).toContain("/reports/payment-reconciliation");
    expect(todayReadModelSource).toContain('/reports/invoices?view=open');
    expect(todayReadModelSource).toContain("/reports/payments");
  });

  it("uses copy that distinguishes reported and failed attention from collected truth", () => {
    expect(todayReadModelSource).toContain("Reported, not collected truth");
    expect(todayReadModelSource).toContain("Failed attempt, not collected money");
    expect(todayReadModelSource).toContain("Accounts receivable follow-up");
    expect(todayReadModelSource).toContain("awaiting payment follow-up");
    expect(todayReadModelSource).toContain("reported");
    expect(todayPageSource).toContain("tile.context");
  });

  it("keeps the lightweight Today open-invoice snapshot aligned with Open Invoices V1", () => {
    expect(todayReadModelSource).toContain("Lightweight Today snapshot for Open Invoices V1");
    expect(todayReadModelSource).toContain('.select("id, total_cents, voided_at")');
    expect(todayReadModelSource).toContain('status !== "recorded"');
  });

  it("does not expose retry, acknowledge, resolve, or customer-message actions", () => {
    expect(todayPageSource).not.toContain("Retry saved card");
    expect(todayPageSource).not.toContain("Acknowledge");
    expect(todayPageSource).not.toContain("Resolve");
    expect(todayPageSource).not.toContain("Send SMS");
    expect(todayPageSource).not.toContain("Send Email");
  });

  it("renders role-aware pulse section titles", () => {
    expect(todayPageSource).toContain('pulse.mode === "business"');
    expect(todayReadModelSource).toContain("Business Pulse");
    expect(todayReadModelSource).toContain("Money Attention");
    expect(todayReadModelSource).toContain("Ops Pressure");
  });

  it("keeps field technicians out of business-pressure chip/groups", () => {
    expect(todayReadModelSource).toContain('if (params.role === "tech") {');
    expect(todayReadModelSource).toContain("return [];");
  });

  it("does not call Stripe and does not mutate payment/invoice/allocation/visit/next_due truth", () => {
    expect(todayPageSource.toLowerCase()).not.toContain("stripe");
    expect(todayReadModelSource.toLowerCase()).not.toContain("stripe");
    expect(todayReadModelSource).not.toContain("insert(");
    expect(todayReadModelSource).not.toContain("update(");
    expect(todayReadModelSource).not.toContain("upsert(");
    expect(todayReadModelSource).not.toContain("delete(");
  });
});
