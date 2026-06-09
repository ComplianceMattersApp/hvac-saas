import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const detailPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/deposits/[payoutId]/page.tsx"),
  "utf-8",
);

describe("deposit detail page wiring", () => {
  it("uses the same financial access posture as deposits and Payments Register", () => {
    expect(detailPageSource).toContain("requireInternalUser");
    expect(detailPageSource).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(detailPageSource).toContain('redirect("/login")');
    expect(detailPageSource).toContain('redirect("/portal")');
    expect(detailPageSource).toContain('redirectTo: "/reports/invoices?banner=not_authorized"');
  });

  it("calls the detail read model with account scope and decoded payout group id", () => {
    expect(detailPageSource).toContain("getDepositDetailLedger");
    expect(detailPageSource).toContain("decodeURIComponent");
    expect(detailPageSource).toContain("accountOwnerUserId: internalUser.account_owner_user_id");
    expect(detailPageSource).toContain("payoutGroupId");
  });

  it("renders required summary labels and friendly boundary copy", () => {
    for (const label of [
      "Gross Collected",
      "Fees & Adjustments",
      "Net Deposit",
      "Payments",
      "Unmatched / Needs Review",
    ]) {
      expect(detailPageSource).toContain(label);
    }

    expect(detailPageSource).toContain(
      "Review the online payments, fees, net amount, and payout timing behind this deposit group.",
    );
    expect(detailPageSource).toContain(
      "Deposits help explain how online payments become bank deposits. Your invoices and payment records stay unchanged.",
    );
    expect(detailPageSource).toContain(
      "This read-only detail view shows how fees and adjustments affect the net amount for this deposit group.",
    );
  });

  it("keeps unmatched and pending groups visible and non-leaky", () => {
    expect(detailPageSource).toContain("Pending payout / no payout assigned");
    expect(detailPageSource).toContain("No settlement rows match this deposit group in your account.");
    expect(detailPageSource).toContain("Unmatched");
    expect(detailPageSource).toContain("Needs Review");
    expect(detailPageSource).toContain("rowStatusLabels");
    expect(detailPageSource).toContain("needsReviewLabels");
  });

  it("allows read-only detail export without sync, refund/dispute, payment, or Stripe API controls", () => {
    expect(detailPageSource).toContain("/reports/deposits/export/detail");
    expect(detailPageSource).toContain("payout_group_id");
    expect(detailPageSource).not.toContain("syncStripePaymentSettlements");
    expect(detailPageSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(detailPageSource).not.toMatch(/<button[^>]*>(?:.|\n)*(Refund|Dispute|Record Payment|Correction)/i);
    expect(detailPageSource).not.toMatch(/href=.*(refund|dispute|record-payment|correction)/i);
    expect(detailPageSource).not.toMatch(/\bstripe\./);
  });
});
