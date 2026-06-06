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
    expect(queuePageSource).toContain("loadFieldBillingExplicitCapabilitiesForUser");
    expect(queuePageSource).toContain("explicitCapabilities: explicitFieldBillingCapabilities");
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
    expect(queuePageSource).toContain("Verification records this as final payment truth.");
    expect(queuePageSource).toContain("Rejecting does not record payment.");
    expect(queuePageSource).toContain(
      "Use Verify only after the office confirms this check, cash, or other payment was received.",
    );
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

  it("wires verify and reject actions for authorized reconciliation users", () => {
    expect(queuePageSource).toContain("verifyFieldPaymentCollectionReportFromForm");
    expect(queuePageSource).toContain("rejectFieldPaymentCollectionReportFromForm");
    expect(queuePageSource).toMatch(/>\s*Verify\s*</);
    expect(queuePageSource).toMatch(/>\s*Reject\s*</);
  });

  it("posts verify and reject payloads with required report context", () => {
    expect(queuePageSource).toContain('name="field_payment_report_id"');
    expect(queuePageSource).toContain('name="report_id"');
    expect(queuePageSource).toContain('name="invoice_id"');
    expect(queuePageSource).toContain('name="job_id"');
    expect(queuePageSource).toContain('name="verification_note"');
    expect(queuePageSource).toContain('name="rejection_reason"');
    expect(queuePageSource).toContain('name="return_to"');
  });

  it("requires rejection reason and blocks self-verification in UI", () => {
    expect(queuePageSource).toContain('name="rejection_reason"');
    expect(queuePageSource).toContain("required");
    expect(queuePageSource).toContain("item.reportedByUserId === user.id");
    expect(queuePageSource).toContain("Reporter cannot verify their own report.");
  });

  it("does not expose correction or void actions", () => {
    expect(queuePageSource).not.toMatch(/>\s*Correct\s*</);
    expect(queuePageSource).not.toMatch(/>\s*Void\s*</);
  });

  it("documents B7-S truth boundaries in UI", () => {
    expect(queuePageSource).toContain(
      "Verification records final payment truth through existing internal invoice payment actions.",
    );
    expect(queuePageSource).toContain("Rejection writes no payment truth.");
    expect(queuePageSource).toContain("No correction/void actions are enabled in this slice.");
  });

  it("uses report center tab entry for payment reconciliation", () => {
    expect(queuePageSource).toContain('ReportCenterTabs current="payment-reconciliation"');
    expect(queuePageSource).toContain("Payment Reconciliation");
  });
});
