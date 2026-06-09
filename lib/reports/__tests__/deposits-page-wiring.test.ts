import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const depositsPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/deposits/page.tsx"),
  "utf-8",
);

describe("deposits report page wiring", () => {
  it("uses the financial register access posture for Owner/Admin/Billing access", () => {
    expect(depositsPageSource).toContain("requireInternalUser");
    expect(depositsPageSource).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(depositsPageSource).toContain('redirect("/login")');
    expect(depositsPageSource).toContain('redirect("/portal")');
    expect(depositsPageSource).toContain('redirectTo: "/reports/dashboard?banner=not_authorized"');
  });

  it("calls the deposits read model with account scope and GET filters", () => {
    expect(depositsPageSource).toContain("getDepositsLedgerSummary");
    expect(depositsPageSource).toContain("accountOwnerUserId: internalUser.account_owner_user_id");
    expect(depositsPageSource).toContain("dateFrom: filters.dateFrom || null");
    expect(depositsPageSource).toContain("dateTo: filters.dateTo || null");
    expect(depositsPageSource).toContain("payoutStatus: filters.payoutStatus");
    expect(depositsPageSource).toContain("syncStatus: filters.syncStatus");
  });

  it("renders the required owner-facing summary labels and boundary copy", () => {
    for (const label of [
      "Gross Collected",
      "Fees & Adjustments",
      "Net Deposits",
      "Pending Payouts",
      "Unmatched / Needs Review",
    ]) {
      expect(depositsPageSource).toContain(label);
    }

    expect(depositsPageSource).toContain(
      "Track how online invoice payments become bank deposits, including fees, net deposits, payout timing, and exportable records.",
    );
    expect(depositsPageSource).toContain(
      "Deposits help you see how online payments turn into bank deposits, including Stripe fees, net amounts, and payout timing.",
    );
    expect(depositsPageSource).toContain("Your invoices and payment records stay unchanged.");
    expect(depositsPageSource).toContain("Online payments included in this deposits report.");
    expect(depositsPageSource).toContain("Stripe fees, platform fees when present, and settlement adjustments.");
    expect(depositsPageSource).toContain(
      "Estimated amount moving toward bank deposit after fees and adjustments.",
    );
    expect(depositsPageSource).toContain("Net amounts that have not been tied to a completed payout yet.");
    expect(depositsPageSource).toContain(
      "Settlement rows that need review before they can be fully matched.",
    );
  });

  it("renders an empty state without prompting owners to sync", () => {
    expect(depositsPageSource).toContain("No deposits to review yet");
    expect(depositsPageSource).toContain(
      "Once online payments are settled, this report will show the fees, net deposit amount, and payout timing. Your invoices and payment records stay unchanged.",
    );
    expect(depositsPageSource).not.toMatch(/<button[^>]*>\s*Sync/i);
    expect(depositsPageSource).not.toContain("Run settlement sync");
    expect(depositsPageSource).not.toContain(["No settlement", "data synced yet."].join(" "));
    expect(depositsPageSource).not.toContain(["Stripe Dashboard remains", "the fallback"].join(" "));
  });

  it("keeps needs-review states visible", () => {
    expect(depositsPageSource).toContain("Needs Review");
    expect(depositsPageSource).toContain("Unmatched");
    expect(depositsPageSource).toContain("Pending Sync");
    expect(depositsPageSource).toContain("Sync Failed");
  });

  it("links payout rows and read-only exports without adding sync helper or Stripe API wiring", () => {
    expect(depositsPageSource).toContain("depositDetailHrefForGroup");
    expect(depositsPageSource).toContain("/reports/deposits/export/summary");
    expect(depositsPageSource).toContain("/reports/deposits/export/detail");
    expect(depositsPageSource).not.toContain("syncStripePaymentSettlements");
    expect(depositsPageSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(depositsPageSource).not.toMatch(/\bstripe\./);
  });
});
