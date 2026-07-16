import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(__dirname, "../../../app/payments/invoice/[token]/page.tsx"),
  "utf8",
);
const actionsSource = readFileSync(
  resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"),
  "utf8",
);
const emailSource = readFileSync(
  resolve(__dirname, "../../actions/internal-invoice-actions.ts"),
  "utf8",
);
const publicActionSource = readFileSync(
  resolve(__dirname, "../../actions/public-invoice-payment-actions.ts"),
  "utf8",
);

describe("invoice payment link stale-state route wiring", () => {
  it("uses app-controlled payment links for reusable copied and emailed invoice links", () => {
    expect(actionsSource).toContain("createTenantInvoicePaymentLink");
    expect(emailSource).toContain("createTenantInvoicePaymentLink");
    expect(actionsSource).toContain("createTenantInvoiceCheckoutSession");
    expect(actionsSource).toContain("redirectToCheckout");
  });

  it("attempts to expire any stored open Stripe sessions after non-Stripe payment truth is recorded", () => {
    expect(actionsSource).toContain("expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice");
    expect(actionsSource).toContain("source: 'manual_off_platform'");
    expect(actionsSource).toContain("source: 'field_payment_reconciliation'");
  });

  it("checks live invoice balance before creating Stripe Checkout", () => {
    const balanceCheckIndex = routeSource.indexOf("resolveInvoiceCollectedPaymentSummary");
    const externalDispositionIndex = routeSource.indexOf("resolveJobBlocksOnlineInvoicePayment");
    const paidMessageIndex = routeSource.indexOf('state="paid"');
    const changedMessageIndex = routeSource.indexOf('state="changed"');
    const checkoutIndex = publicActionSource.indexOf("createTenantInvoiceCheckoutSession");

    expect(externalDispositionIndex).toBeGreaterThanOrEqual(0);
    expect(balanceCheckIndex).toBeGreaterThanOrEqual(0);
    expect(paidMessageIndex).toBeGreaterThan(externalDispositionIndex);
    expect(paidMessageIndex).toBeGreaterThan(balanceCheckIndex);
    expect(changedMessageIndex).toBeGreaterThan(balanceCheckIndex);
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(publicActionSource).toContain("resolveInvoiceCollectedPaymentSummary");
  });

  it("renders a limited review step and creates checkout only from the explicit public action", () => {
    expect(routeSource).toContain("Secure invoice payment");
    expect(routeSource).toContain("Invoice total");
    expect(routeSource).toContain("Payments received");
    expect(routeSource).toContain("Balance due");
    expect(routeSource).toContain("beginPublicInvoiceCheckout");
    expect(routeSource).not.toContain("createTenantInvoiceCheckoutSession");
    expect(publicActionSource).toContain("verifyTenantInvoicePaymentLinkToken");
    expect(publicActionSource).toContain("paymentLinkToken: token");
  });

  it("renders friendly stale-state customer copy", () => {
    expect(routeSource).toContain("Invoice already paid");
    expect(routeSource).toContain("No payment is needed for this invoice.");
    expect(routeSource).toContain("This payment link is no longer active.");
    expect(routeSource).toContain("Please contact the company if you believe a balance is still due.");
    expect(routeSource).toContain("Invoice balance changed");
    expect(routeSource).toContain("Please request an updated payment link.");
  });
});
