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
    expect(depositsPageSource).toContain('redirectTo: "/reports/dashboard?banner=not_authorized"');
  });

  it("calls the deposits read model with account scope and GET filters", () => {
    expect(depositsPageSource).toContain("getDepositsLedgerSummary");
    expect(depositsPageSource).toContain("accountOwnerUserId: internalUser.account_owner_user_id");
    expect(depositsPageSource).toContain("dateFrom: filters.dateFrom || null");
    expect(depositsPageSource).toContain("dateTo: filters.dateTo || null");
    expect(depositsPageSource).toContain("payoutStatus: filters.payoutStatus");
    expect(depositsPageSource).toContain("syncStatus: filters.syncStatus");
    expect(depositsPageSource).toContain("getDepositDetailExportRows");
  });

  it("shows an invoice-first payment-to-bank breakdown using proven settlement fields", () => {
    for (const label of ["Invoice payment breakdown", "Amount paid", "Processing fee", "Other proven deductions", "Expected in bank", "Deposit status"]) {
      expect(depositsPageSource).toContain(label);
    }
    expect(depositsPageSource).toContain("row.stripeFeeCents");
    expect(depositsPageSource).toContain("row.platformFeeCents");
    expect(depositsPageSource).toContain("row.netCents");
    expect(depositsPageSource).toContain("row.payoutHref");
    expect(depositsPageSource).toContain("Paid by Stripe");
    expect(depositsPageSource).toContain("Supporting breakdown only");
    expect(depositsPageSource).toContain("Customer Payments");
    expect(depositsPageSource).toContain("Processing Fees");
    expect(depositsPageSource).toContain("Expected Bank Deposit");
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
      "See what customers paid, processing fees, expected bank amounts, and the Stripe deposits that contain each invoice payment.",
    );
    expect(depositsPageSource).toContain(
      "Follow each online invoice payment from the amount paid, through proven deductions, to the Stripe deposit expected in your bank.",
    );
    expect(depositsPageSource).toContain("Your bank or accounting feed remains the final record");
    expect(depositsPageSource).toContain("Online payments included in this report.");
    expect(depositsPageSource).toContain("Stripe fees, platform fees when present, and settlement adjustments.");
    expect(depositsPageSource).toContain(
      "Estimated amount moving toward bank deposit after fees and adjustments.",
    );
    expect(depositsPageSource).toContain("Net amounts that have not been tied to a completed payout yet.");
    expect(depositsPageSource).toContain(
      "Payments that need review before they can be fully matched.",
    );
  });

  it("renders controlled reconciliation and truthful empty states", () => {
    expect(depositsPageSource).toContain("No deposits to review yet");
    expect(depositsPageSource).toContain("DepositsSyncPanel");
    expect(depositsPageSource).toContain("No recorded online payments were found for this date range.");
    expect(depositsPageSource).toContain("Online payments exist, but their Stripe deposit details have not been synced yet.");
    expect(depositsPageSource).toContain("No deposit records match the current filters.");
  });

  it("keeps needs-review states visible", () => {
    expect(depositsPageSource).toContain("Needs Review");
    expect(depositsPageSource).toContain("Unmatched");
    expect(depositsPageSource).toContain("Pending Sync");
    expect(depositsPageSource).toContain("Sync Failed");
  });

  it("links payout rows and exports without putting Stripe API calls in the page", () => {
    expect(depositsPageSource).toContain("depositDetailHrefForGroup");
    expect(depositsPageSource).toContain("/reports/deposits/export/summary");
    expect(depositsPageSource).toContain("/reports/deposits/export/detail");
    expect(depositsPageSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(depositsPageSource).not.toMatch(/\bstripe\./);
  });
});
