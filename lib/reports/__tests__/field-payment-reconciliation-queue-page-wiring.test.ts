import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const queuePageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/payment-reconciliation/page.tsx"),
  "utf-8",
);

describe("field payment reconciliation queue page wiring", () => {
  it("loads internal-user boundary and redirects unauthorized users", () => {
    expect(queuePageSource).toContain("requireInternalUser");
    expect(queuePageSource).toContain("isInternalAccessError");
    expect(queuePageSource).toContain('redirect("/reports/invoices?banner=not_authorized")');
  });

  it("uses financial authority OR verification capability access gate", () => {
    expect(queuePageSource).toContain("canViewFinancialRegister");
    expect(queuePageSource).toContain("resolveFieldBillingCapabilities");
    expect(queuePageSource).toContain("fieldBillingCapabilities.can_verify_non_card_collection");
    expect(queuePageSource).toContain("const canAccessQueue =");
  });

  it("loads field payment reconciliation read model", () => {
    expect(queuePageSource).toContain("listFieldPaymentCollectionReportsForReconciliation");
    expect(queuePageSource).toContain("accountOwnerUserId: internalUser.account_owner_user_id");
  });

  it("renders required office-verification copy", () => {
    expect(queuePageSource).toContain("Field-reported payments need office verification before they count as collected.");
    expect(queuePageSource).toContain("Card payments are confirmed by Stripe. Check, cash, and other field reports stay here until verified.");
    expect(queuePageSource).toContain("Verifying payments will be added in a later step.");
  });

  it("renders queue row details for office reconciliation", () => {
    expect(queuePageSource).toContain("Customer / Job");
    expect(queuePageSource).toContain("Invoice");
    expect(queuePageSource).toContain("Method");
    expect(queuePageSource).toContain("Amount");
    expect(queuePageSource).toContain("Reference");
    expect(queuePageSource).toContain("Reported By");
    expect(queuePageSource).toContain("Reported At");
    expect(queuePageSource).toContain("Status");
    expect(queuePageSource).toContain("Note");
  });

  it("includes invoice job and customer links", () => {
    expect(queuePageSource).toContain("Open invoice workspace");
    expect(queuePageSource).toContain("item.links.invoiceWorkspaceHref");
    expect(queuePageSource).toContain("Open job");
    expect(queuePageSource).toContain("item.links.jobHref");
    expect(queuePageSource).toContain("Open customer");
    expect(queuePageSource).toContain("item.links.customerHref");
  });

  it("does not expose verify reject correct or void actions", () => {
    expect(queuePageSource).not.toMatch(/>\s*Verify\s*</);
    expect(queuePageSource).not.toMatch(/>\s*Reject\s*</);
    expect(queuePageSource).not.toMatch(/>\s*Correct\s*</);
    expect(queuePageSource).not.toMatch(/>\s*Void\s*</);
  });

  it("documents read-only truth boundaries in UI", () => {
    expect(queuePageSource).toContain("No verify/reject/correct/void actions.");
    expect(queuePageSource).toContain("No internal_invoice_payments writes.");
    expect(queuePageSource).toContain("No internal_invoice_payment_allocations writes.");
    expect(queuePageSource).toContain("No invoice paid/balance mutation.");
    expect(queuePageSource).toContain("No Stripe/webhook mutation.");
  });

  it("uses report center tab entry for payment reconciliation", () => {
    expect(queuePageSource).toContain('ReportCenterTabs current="payment-reconciliation"');
    expect(queuePageSource).toContain("Payment Reconciliation");
  });
});
