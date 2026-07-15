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
    expect(source).toContain("loadFieldBillingExplicitCapabilitiesForUser");
    expect(source).toContain("const explicitFieldBillingCapabilities = await loadFieldBillingExplicitCapabilitiesForUser");
    expect(source).toContain("explicitCapabilities: explicitFieldBillingCapabilities");
    expect(source).toContain("hasDirectInvoiceDraftMutationAccess");
    expect(source).toContain("const fieldBillingCapabilities = resolveFieldBillingCapabilities");
    expect(source).toContain("const canAccessDraftLineWorkspace = hasDirectInvoiceDraftMutationAccess(fieldBillingCapabilities)");
    expect(source).toContain("invoice.status === \"draft\" && canAccessDraftLineWorkspace");
    expect(source).toContain("capabilities={fieldBillingCapabilities}");
    expect(source).toContain("Draft invoice charges are view-only under your current permissions.");
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

  it("reads durable billing disposition and treats resolved zero-dollar invoices as handled", () => {
    expect(source).toContain("billing_disposition,");
    expect(source).toContain("billing_disposition_note,");
    expect(source).toContain("billing_disposition_at,");
    expect(source).toContain("billing_disposition_by_user_id,");
    expect(source).toContain("const jobBillingDisposition = normalizeJobBillingDisposition((job as any).billing_disposition)");
    expect(source).toContain("const billingDispositionResolved = Boolean(jobBillingDisposition && job.invoice_complete)");
    expect(source).toContain("const totalReady = billingDispositionResolved || Number(invoice?.total_cents ?? 0) > 0");
    expect(source).toContain("const canIssue = Boolean(invoice && isDraft && !billingDispositionResolved");
    expect(source).toContain('billingDisposition={jobBillingDisposition}');
    expect(source).toContain("Billing handled");
    expect(source).toContain("jobBillingDispositionLabel ?? \"Billing Handled\"");
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
    expect(source).toContain('description="Add-on invoices for this job stay listed here, including drafts that have not been issued. Open one to review its charges or continue billing."');
    expect(source).toContain("billingName: familyInvoice.billing_name");
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
    expect(source).toContain("/invoice/print?invoice_id=${encodeURIComponent(invoice.id)}");
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
    expect(source).toContain("Create a separate invoice linked to this same job and original invoice.");
    expect(source).toContain("If it does, create a continuation job instead.");
  });

  it("keeps invoice builder guidance in plain billing language", () => {
    expect(source).toContain("Start from the work already completed, then add any extra fees or add-ons as needed.");
    expect(source).toContain("Existing invoice charges stay on the draft while you add anything else that belongs on this bill.");
    expect(source).toContain("Review the current charges, then add another charge for fees, add-ons, or anything not already listed on the invoice.");
    expect(source).not.toContain("Use direct invoice charges from Pricebook/manual only for billing cleanup or add-ons not captured in Work Items.");
    expect(source).not.toContain("Use direct invoice charges when the billed item was not captured as a Work Item.");
  });

  it("surfaces exact duplicate charge risks and requires issue acknowledgement", () => {
    expect(source).toContain("resolveInternalInvoiceDuplicateRisks");
    expect(source).toContain("Possible duplicate billing found");
    expect(source).toContain('name="duplicate_charge_review_confirmed"');
    expect(source).toContain("I reviewed the matching invoice and confirm this is a separate charge.");
  });

  it("uses shared short invoice reference helper in the primary header and billing details", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const invoiceHeaderReference = invoice");
    expect(source).toContain("formatInvoiceDisplayReference({");
    expect(source).toContain("invoiceDisplayNumber:");
    expect(source).toContain("invoiceNumber: invoice.invoice_number");
    expect(source).toContain("invoiceId: invoice.id");
    expect(source).toContain("{invoiceHeaderReference}");
    expect(source).toContain('name="invoice_number" value={invoice.invoice_number}');
    expect(source).toContain("{invoiceHeaderReference}");
    expect(source).not.toContain('defaultValue={invoice.invoice_number}');
    expect(source).not.toContain("Invoice ${invoice.invoice_number}");
  });

  it("does not render legacy invoice references in the normal invoice workspace", () => {
    expect(source).not.toContain("const legacyInvoiceReference = invoice");
    expect(source).not.toContain("Legacy ref:");
    expect(source).not.toContain("String(invoice.invoice_number ?? \"\").trim() || null");
  });

  it("uses explicit billing-recipient address rendering in the workspace billing panel", () => {
    expect(source).toContain('import { formatInvoiceBillingAddressLines } from "@/lib/business/internal-invoice-address-rendering";');
    expect(source).toContain("billing_recipient,");
    expect(source).toContain("formatInvoiceBillingAddressLines(invoice, (job as any).billing_recipient)");
    expect(source).not.toContain("function formatBillingAddress");
  });

  it("wires manual saved-card charge action and one-time copy", () => {
    expect(source).toContain("chargeSavedCardForIssuedInvoiceFromForm");
    expect(source).toContain("Charge saved card");
    expect(source).toContain("Charge saved card once");
    expect(source).toContain("This is not autopay");
    expect(source).toContain("no subscription is created");
    expect(source).toContain("collected payment updates only after Stripe confirms the charge");
  });

  it("preserves existing payment actions while adding saved-card control", () => {
    expect(source).toContain("hasFieldPaymentCollectionAccess");
    expect(source).toContain("const canCollectFieldPaymentAccess = hasFieldPaymentCollectionAccess(fieldBillingCapabilities)");
    expect(source).toContain("const canReportNonCardPaymentAccess = fieldBillingCapabilities.can_report_non_card_collection");
    expect(source).toContain("const canShowFieldCollectionSection = Boolean(");
    expect(source).toContain("const canShowFieldNonCardPaymentForm = Boolean(");
    expect(source).toContain("&& invoice.status === \"issued\"");
    expect(source).toContain("&& hasOutstandingInvoiceBalance");
    expect(source).toContain("&& canCollectFieldPaymentAccess");
    expect(source).toContain("collectIssuedInvoiceCardPaymentFromForm");
    expect(source).toContain("Collect or report payment");
    expect(source).toContain("Card payments open a secure checkout page. Once the payment is complete, this invoice updates automatically.");
    expect(source).toContain("Cash, check, and other reported payments are submitted for office confirmation before they count as collected payment.");
    expect(source).toContain("Card collection is not enabled for your role.");
    expect(source).toContain("Online payments are not ready.");
    expect(source).toContain("Record Received Payment is final payment truth.");
    expect(source).toContain("Create payment link");
    expect(source).toContain("Record Received Payment");
    expect(source).toContain("collectTenantInvoicePaymentNowFromForm");
    expect(source).toContain("recordInternalInvoicePaymentFromForm");
    expect(source).toContain("reportNonCardFieldPaymentCollectionFromForm");
    expect(source).toContain("issueInternalInvoiceFromForm");
    expect(source).toContain("sendInternalInvoiceEmailFromForm");
    expect(source).toContain("voidInternalInvoiceFromForm");
    expect(source).toContain("Charges");
    expect(source).toContain("Issue Readiness");
    expect(source).toContain("Billing Recipient");
    expect(source).toContain("Collection Actions");
    expect(source).toContain("Payment History");
    expect(source).not.toContain("Audit / Technical Details");
    expect(source).not.toContain("Source-of-truth audit details remain available below.");
    expect(source).not.toContain("Payment totals and paid status are derived from allocation-compatible payment truth.");
    expect(source).not.toContain("Platform fee");
    expect(source).not.toContain("not enabled in this slice");
    expect(source).not.toContain("not enabled here yet");
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

  it("shows one field non-card payment intent for field-only actors with report authority", () => {
    expect(source).toContain("const canShowFieldNonCardPaymentForm = Boolean(");
    expect(source).toContain("&& canReportNonCardPaymentAccess");
    expect(source).toContain("action={reportNonCardFieldPaymentCollectionFromForm}");
    expect(source).toContain("Report Payment");
    expect(source).toContain("Report this payment for office confirmation. It does not count as collected payment until the office confirms the money was received.");
    expect(source).toContain("<option value=\"cash\">Cash</option>");
    expect(source).toContain("<option value=\"check\">Check</option>");
    expect(source).toContain("<option value=\"other\">Other</option>");
    expect(source).toContain("name=\"reference\"");
    expect(source).toContain("name=\"note\"");
  });

  it("shows awaiting confirmation state from open field payment reports without verify reject controls in field workspace", () => {
    expect(source).toContain("openFieldPaymentReportsForSelectedInvoice");
    expect(source).toContain(".from(\"field_payment_collection_reports\")");
    expect(source).toContain(".eq(\"internal_invoice_id\", invoice.id)");
    expect(source).toContain(".in(\"status\", [\"reported\", \"under_review\", \"needs_correction\"])");
    expect(source).toContain("const hasOpenFieldPaymentReportForSelectedInvoice = openFieldPaymentReportsForSelectedInvoice.length > 0;");
    expect(source).toContain("Reported Payment");
    expect(source).toContain("Reported payment awaiting confirmation");
    expect(source).toContain("Payment reported - awaiting office confirmation before it counts as collected payment.");
    expect(source).not.toContain("verifyFieldPaymentCollectionReportFromForm");
    expect(source).not.toContain("rejectFieldPaymentCollectionReportFromForm");
  });

  it("keeps owner manual payment as final truth path and not confirm-payment routing", () => {
    expect(source).toContain("action={recordInternalInvoicePaymentFromForm}");
    expect(source).toContain("Saving immediately updates this invoice&apos;s paid amount and open balance.");
    expect(source).toContain("Record Received Payment");
    expect(source).toContain("Check # / Reference");
    expect(source).toContain("payment.received_reference");
    expect(source).not.toContain("Confirm Payment queue item");
  });

  it("keeps field collection targeting the selected invoice workspace id", () => {
    expect(source).toContain("const returnTo = invoice");
    expect(source).toContain("? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoice.id)}#invoice-workspace`");
    expect(source).toContain("<input type=\"hidden\" name=\"invoice_id\" value={invoice.id} />");
    expect(source).toContain("<input type=\"hidden\" name=\"return_to\" value={returnTo} />");
    expect(source).toContain("action={collectIssuedInvoiceCardPaymentFromForm}");
    expect(source).toContain("action={reportNonCardFieldPaymentCollectionFromForm}");
    expect(source).toContain("action={collectTenantInvoicePaymentNowFromForm}");
    expect(source).toContain("action={recordInternalInvoicePaymentFromForm}");
  });
});
