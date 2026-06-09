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
    expect(depositsPageSource).toContain('redirectTo: "/reports/invoices?banner=not_authorized"');
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

    expect(depositsPageSource).toContain("Payments Register shows gross payment event truth.");
    expect(depositsPageSource).toContain("Deposits explain Stripe settlement and payout timing.");
    expect(depositsPageSource).toContain("Settlement rows do not change invoice paid/balance.");
    expect(depositsPageSource).toContain(
      "Stripe Dashboard remains the fallback for fee, net, and payout verification until settlement sync and deposit reporting are smoke-tested.",
    );
  });

  it("renders an empty state without prompting owners to sync", () => {
    expect(depositsPageSource).toContain("No settlement data synced yet.");
    expect(depositsPageSource).toContain("Stripe Dashboard remains the fallback until settlement sync is run and verified.");
    expect(depositsPageSource).not.toMatch(/<button[^>]*>\s*Sync/i);
    expect(depositsPageSource).not.toContain("Run settlement sync");
  });

  it("keeps needs-review states visible", () => {
    expect(depositsPageSource).toContain("Needs Review");
    expect(depositsPageSource).toContain("Unmatched");
    expect(depositsPageSource).toContain("Pending Sync");
    expect(depositsPageSource).toContain("Sync Failed");
  });

  it("does not add sync helper, CSV/export, detail, or Stripe API wiring", () => {
    expect(depositsPageSource).not.toContain("syncStripePaymentSettlements");
    expect(depositsPageSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(depositsPageSource).not.toMatch(/Export CSV|\/reports\/deposits\/export/i);
    expect(depositsPageSource).not.toContain("/reports/deposits/[payoutId]");
    expect(depositsPageSource).not.toMatch(/href=\{`\/reports\/deposits\/\$\{/);
    expect(depositsPageSource).not.toMatch(/\bstripe\./);
  });
});
