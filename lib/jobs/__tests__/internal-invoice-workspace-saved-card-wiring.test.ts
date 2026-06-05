import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);

describe("internal invoice workspace saved-card charge wiring", () => {
  it("wires direct draft-line workspace access through field billing capabilities", () => {
    expect(source).toContain('import {');
    expect(source).toContain("resolveFieldBillingCapabilities");
    expect(source).toContain("hasDirectInvoiceDraftMutationAccess");
    expect(source).toContain("const fieldBillingCapabilities = resolveFieldBillingCapabilities");
    expect(source).toContain("const canAccessDraftLineWorkspace = hasDirectInvoiceDraftMutationAccess(fieldBillingCapabilities)");
    expect(source).toContain("invoice.status === \"draft\" && canAccessDraftLineWorkspace");
    expect(source).toContain("capabilities={fieldBillingCapabilities}");
    expect(source).toContain("Draft invoice lines are view-only under your current permissions.");
  });

  it("keeps lifecycle and payment controls behind financial lifecycle authorization", () => {
    expect(source).toContain("invoicePaymentLinkUiState.showPanel && canManageFinancialInvoiceLifecycle");
    expect(source).toContain("invoice.status === \"issued\" && canManageFinancialInvoiceLifecycle");
    expect(source).toContain("const canIssueInvoiceLifecycle = hasInvoiceIssueAccess(fieldBillingCapabilities)");
    expect(source).toContain("const canSendInvoiceLifecycle = hasInvoiceSendAccess(fieldBillingCapabilities)");
    expect(source).toContain("invoice.status === \"draft\" && canIssueInvoiceLifecycle");
    expect(source).toContain("invoice.status === \"issued\" && canSendInvoiceLifecycle");
    expect(source).toContain("Invoice issue authority is not available for your current role.");
    expect(source).toContain("Invoice send authority is not available for your current role.");
  });

  it("includes compact stage and next-step rail copy in header", () => {
    expect(source).toContain("function resolveInvoiceRevenueWorkflowRail");
    expect(source).toContain("Revenue Workflow Rail");
    expect(source).toContain("Stage:</span> {invoiceRevenueWorkflowRail.stage}.");
    expect(source).toContain("Next:</span> {invoiceRevenueWorkflowRail.next}");
    expect(source).toContain('stage: "Draft invoice"');
    expect(source).toContain('stage: "Issued and unpaid"');
    expect(source).toContain('stage: "Issued and paid"');
  });

  it("shows supplemental invoice family context as read-only when supplemental invoices exist", () => {
    expect(source).toContain("resolveInternalInvoiceFamilySummaryByJobId");
    expect(source).toContain("const supplementalInvoiceFamilyItems =");
    expect(source).toContain("<SupplementalInvoiceFamilySection");
    expect(source).toContain('description="Primary invoice controls stay focused on the current invoice. Supplemental invoices remain read-only family context here."');
    expect(source).not.toContain("Create Supplemental Invoice");
    expect(source).not.toContain("Add follow-up charge");
  });

  it("supports selecting invoice workspace context by invoice_id", () => {
    expect(source).toContain("const requestedInvoiceId = firstSearchValue(sp.invoice_id) ?? firstSearchValue(sp.supplemental_invoice_id);");
    expect(source).toContain("resolveInternalInvoiceById");
    expect(source).toContain("const canUseRequestedInvoice = Boolean(");
    expect(source).toContain("const invalidRequestedInvoiceSelection = Boolean(requestedInvoiceId && !canUseRequestedInvoice);");
    expect(source).toContain("internal_invoice_selection_invalid");
    expect(source).toContain("workspaceHref: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(familyInvoice.id)}#invoice-workspace`");
    expect(source).toContain("selectedInvoiceId={invoice.id}");
    expect(source).toContain("<input type=\"hidden\" name=\"invoice_id\" value={invoice.id} />");
  });

  it("shows Create Add-On Invoice only for issued primary invoice with lifecycle authority", () => {
    expect(source).toContain("createSupplementalInternalInvoiceFromForm");
    expect(source).toContain("const canCreateSupplementalDraftFromCurrentInvoice = Boolean(");
    expect(source).toContain("invoice.invoice_kind === \"primary\"");
    expect(source).toContain("invoice.status === \"issued\"");
    expect(source).toContain("&& canManageFinancialInvoiceLifecycle");
    expect(source).toContain("{supplementalParentInvoiceId ? (");
    expect(source).toContain("Create Add-On Invoice");
    expect(source).toContain("Reason for add-on invoice");
    expect(source).toContain("Customer added warranty, service plan, or additional work.");
    expect(source).toContain("original_internal_invoice_id");
    expect(source).toContain("Use this when the customer adds work or a charge after this invoice was issued or paid. The original invoice stays unchanged.");
  });

  it("uses shared short invoice reference helper in the primary header", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const invoiceHeaderReference = invoice");
    expect(source).toContain("formatInvoiceDisplayReference({");
    expect(source).toContain("invoiceDisplayNumber:");
    expect(source).toContain("invoiceNumber: invoice.invoice_number");
    expect(source).toContain("invoiceId: invoice.id");
    expect(source).toContain("{invoiceHeaderReference}");
    expect(source).not.toContain("Invoice ${invoice.invoice_number}");
  });

  it("keeps legacy invoice number as secondary audit text", () => {
    expect(source).toContain("const legacyInvoiceReference = invoice");
    expect(source).toContain("Legacy ref:");
    expect(source).toContain("String(invoice.invoice_number ?? \"\").trim() || null");
  });

  it("wires manual saved-card charge action and one-time copy", () => {
    expect(source).toContain("chargeSavedCardForIssuedInvoiceFromForm");
    expect(source).toContain("Charge saved card");
    expect(source).toContain("Charge saved card once");
    expect(source).toContain("This is not autopay");
    expect(source).toContain("no subscription is created");
    expect(source).toContain("recorded only after Stripe webhook confirmation");
  });

  it("preserves existing payment actions while adding saved-card control", () => {
    expect(source).toContain("hasFieldPaymentCollectionAccess");
    expect(source).toContain("const canCollectFieldPaymentAccess = hasFieldPaymentCollectionAccess(fieldBillingCapabilities)");
    expect(source).toContain("const canShowFieldCollectionSection = Boolean(");
    expect(source).toContain("&& invoice.status === \"issued\"");
    expect(source).toContain("&& hasOutstandingInvoiceBalance");
    expect(source).toContain("&& canCollectFieldPaymentAccess");
    expect(source).toContain("collectIssuedInvoiceCardPaymentFromForm");
    expect(source).toContain("Collect Payment");
    expect(source).toContain("Card collection launches secure Stripe Checkout. Payment updates only after Stripe webhook confirmation.");
    expect(source).toContain("Check, cash, and other field reporting are not enabled in this slice. Future field reports will require office verification before final payment truth.");
    expect(source).toContain("Card collection is not enabled for your role.");
    expect(source).toContain("Online payments are not ready.");
    expect(source).toContain("Field-reported check, cash, and other collections are not enabled here yet. When enabled, office verification will be required before final payment truth.");
    expect(source).toContain("Create payment link");
    expect(source).toContain("Record manual payment");
    expect(source).toContain("collectTenantInvoicePaymentNowFromForm");
    expect(source).toContain("recordInternalInvoicePaymentFromForm");
    expect(source).toContain("issueInternalInvoiceFromForm");
    expect(source).toContain("sendInternalInvoiceEmailFromForm");
    expect(source).toContain("voidInternalInvoiceFromForm");
    expect(source).toContain("Payment Options");
    expect(source).toContain("Payment History");
    expect(source).toContain("Audit / Technical Details");
    expect(source).not.toContain("Platform fee");
  });

  it("shows field collection entry point only for issued invoices with outstanding balance", () => {
    expect(source).toContain("const hasOutstandingInvoiceBalance = Number(paymentSummary?.balanceDueCents ?? 0) > 0;");
    expect(source).toContain("const canShowFieldCollectionSection = Boolean(");
    expect(source).toContain("invoice");
    expect(source).toContain("&& invoice.status === \"issued\"");
    expect(source).toContain("&& hasOutstandingInvoiceBalance");
    expect(source).toContain("&& canCollectFieldPaymentAccess");
    expect(source).toContain("&& !canManageFinancialInvoiceLifecycle");
  });

  it("keeps field collection targeting the selected invoice workspace id", () => {
    expect(source).toContain("const returnTo = invoice");
    expect(source).toContain("? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoice.id)}#invoice-workspace`");
    expect(source).toContain("<input type=\"hidden\" name=\"invoice_id\" value={invoice.id} />");
    expect(source).toContain("<input type=\"hidden\" name=\"return_to\" value={returnTo} />");
    expect(source).toContain("action={collectIssuedInvoiceCardPaymentFromForm}");
    expect(source).toContain("action={collectTenantInvoicePaymentNowFromForm}");
    expect(source).toContain("action={recordInternalInvoicePaymentFromForm}");
  });
});
