import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const closeoutQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/closeout-queue/page.tsx"),
  "utf-8",
);

const jobOpsActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-ops-actions.ts"),
  "utf-8",
);

describe("/ops closeout queue - Full Page link", () => {
  it("preserves contractor filter in the dedicated closeout queue link", () => {
    expect(opsPageSource).toContain("encodeURIComponent(contractorScopeFilter)");
  });
});

describe("/ops/closeout-queue page", () => {
  it("redirects unauthenticated users to /login", () => {
    expect(closeoutQueuePageSource).toContain('redirect("/login")');
  });

  it("redirects contractor users to /portal", () => {
    expect(closeoutQueuePageSource).toContain('redirect("/portal")');
  });

  it("reads closeout source jobs from field-complete projection input without closed-status prefilter", () => {
    expect(closeoutQueuePageSource).toContain('.eq("field_complete", true)');
    expect(closeoutQueuePageSource).not.toContain('.neq("ops_status", "closed")');
  });

  it("falls back to a compatibility jobs select when billing_disposition is unavailable", () => {
    expect(closeoutQueuePageSource).toContain("withJobsBillingDispositionSelectFallback");
    expect(closeoutQueuePageSource).toContain("const baseSelectCompat =");
    expect(closeoutQueuePageSource).toContain("runPrimary: () => buildQueueQuery(baseSelect)");
    expect(closeoutQueuePageSource).toContain("runCompat: () => buildQueueQuery(baseSelectCompat)");
  });

  it("derives queue membership from canonical billing-truth closeout projection", () => {
    expect(closeoutQueuePageSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(closeoutQueuePageSource).toContain("listCloseoutQueueJobs");
    expect(closeoutQueuePageSource).toContain("getCloseoutNeeds");
  });

  it("renders required heading and helper subtitle", () => {
    expect(closeoutQueuePageSource).toContain(">Closeout Work Queue<");
    expect(closeoutQueuePageSource).toContain(
      "Jobs that need billing, paperwork, report, or completion follow-up before they can fully close.",
    );
  });

  it("renders empty state copy for no pending closeout work", () => {
    expect(closeoutQueuePageSource).toContain("No closeout work is waiting right now.");
    expect(closeoutQueuePageSource).toContain(
      "Completed jobs with billing, paperwork, or report follow-up will appear here.",
    );
  });

  it("uses View Job as the primary action", () => {
    expect(closeoutQueuePageSource).toMatch(/>\s*View Job\s*</);
    expect(closeoutQueuePageSource).toContain("/jobs/${jobId}?tab=ops");
  });

  it("uses the existing external billing completion tracking action", () => {
    expect(closeoutQueuePageSource).toContain("markInvoiceCompleteFromForm");
    expect(closeoutQueuePageSource).toContain('name="success_notice" value="external_billing_complete"');
    expect(closeoutQueuePageSource).toMatch(/>\s*External Billing Complete\s*</);
  });

  it("uses a pending-aware submit button for External Billing Complete", () => {
    expect(closeoutQueuePageSource).toContain("CloseoutSubmitButton");
    expect(closeoutQueuePageSource).toContain("<CloseoutSubmitButton className={compactActionClass}>");
    expect(closeoutQueuePageSource).toMatch(/<CloseoutSubmitButton[^>]*>\s*External Billing Complete/);
  });

  it("adds a By Contractor sort option", () => {
    expect(closeoutQueuePageSource).toContain("By Contractor");
    expect(closeoutQueuePageSource).toContain('sort=contractor');
  });

  it("uses closeout-specific next step copy", () => {
    expect(closeoutQueuePageSource).toContain("getCloseoutQueueNextStepLabel");
    expect(closeoutQueuePageSource).not.toContain("Customer follow-up is required");
  });

  it("falls back to internal account naming when contractor is not assigned", () => {
    expect(closeoutQueuePageSource).toContain("resolveContractorResponsibleDisplay");
    expect(closeoutQueuePageSource).toContain("resolveInternalBusinessIdentityByAccountOwnerId");
    expect(closeoutQueuePageSource).not.toContain("Unassigned contractor");
  });

  it("renders an in-page contractor filter for narrowing the queue", () => {
    expect(closeoutQueuePageSource).toContain("ContractorFilter");
    expect(closeoutQueuePageSource).toContain("contractorOptions");
  });

  it("gates External Billing Complete with external billing eligibility instead of internal invoicing rows", () => {
    expect(closeoutQueuePageSource).toContain("canShowExternalInvoiceSentAction");
    expect(closeoutQueuePageSource).toContain("projection.billingState");
    expect(closeoutQueuePageSource).toContain("canMarkExternalInvoiceSent");
  });

  it("revalidates the closeout queue after lightweight external billing completion tracking", () => {
    expect(jobOpsActionsSource).toContain('revalidatePath(`/ops/closeout-queue`)');
    expect(jobOpsActionsSource).toContain("success_notice");
  });

  it("loads field-reported non-card payment reconciliation through the existing read model", () => {
    expect(closeoutQueuePageSource).toContain("listFieldPaymentCollectionReportsForReconciliation");
    expect(closeoutQueuePageSource).toContain("openFieldPaymentItems");
    expect(closeoutQueuePageSource).toContain("visibleFieldPaymentItems");
  });

  it("gates field payment reconciliation attention to financial authority or verification permission", () => {
    expect(closeoutQueuePageSource).toContain("canViewFinancialRegister");
    expect(closeoutQueuePageSource).toContain("resolveFieldBillingCapabilities");
    expect(closeoutQueuePageSource).toContain("loadFieldBillingExplicitCapabilitiesForUser");
    expect(closeoutQueuePageSource).toContain("explicitCapabilities: explicitFieldBillingCapabilities");
    expect(closeoutQueuePageSource).toContain("fieldBillingCapabilities.can_verify_non_card_collection");
    expect(closeoutQueuePageSource).toContain("canViewFieldPaymentReconciliationAttention");
  });

  it("links confirm payment cards to selected invoice workspace and job", () => {
    expect(closeoutQueuePageSource).toContain("item.links.invoiceWorkspaceHref");
    expect(closeoutQueuePageSource).toContain("Open invoice workspace");
    expect(closeoutQueuePageSource).toContain("item.links.jobHref");
    expect(closeoutQueuePageSource).toContain("View Job");
  });

  it("adds a Confirm Payment queue filter chip when open reports exist", () => {
    expect(closeoutQueuePageSource).toContain("showConfirmPaymentFilter");
    expect(closeoutQueuePageSource).toContain("Confirm Payment (");
    expect(closeoutQueuePageSource).toContain("filter=confirm_payment");
    expect(closeoutQueuePageSource).toContain("openFieldPaymentCount");
  });

  it("shows verify and reject controls integrated into closeout-style confirm payment cards", () => {
    expect(closeoutQueuePageSource).toContain("verifyFieldPaymentCollectionReportFromForm");
    expect(closeoutQueuePageSource).toContain("rejectFieldPaymentCollectionReportFromForm");
    expect(closeoutQueuePageSource).toMatch(/>\s*Confirm Payment\s*</);
    expect(closeoutQueuePageSource).toMatch(/>\s*Reject Report\s*</);
    expect(closeoutQueuePageSource).toContain("Field-reported payment needs confirmation.");
  });

  it("posts required B7-R payload fields for verify and reject actions", () => {
    expect(closeoutQueuePageSource).toContain('name="field_payment_report_id"');
    expect(closeoutQueuePageSource).toContain('name="report_id"');
    expect(closeoutQueuePageSource).toContain('name="invoice_id"');
    expect(closeoutQueuePageSource).toContain('name="job_id"');
    expect(closeoutQueuePageSource).toContain('name="verification_note"');
    expect(closeoutQueuePageSource).toContain('name="rejection_reason"');
    expect(closeoutQueuePageSource).toContain('name="return_to"');
  });

  it("requires rejection reason in the closeout verification UI", () => {
    expect(closeoutQueuePageSource).toContain('name="rejection_reason"');
    expect(closeoutQueuePageSource).toContain("required");
  });

  it("shows self-verification UI block when reporter matches current actor", () => {
    expect(closeoutQueuePageSource).toContain("item.reportedByUserId === user.id");
    expect(closeoutQueuePageSource).toContain("Reporter cannot verify their own report.");
  });

  it("keeps correction and void controls out of this slice", () => {
    expect(closeoutQueuePageSource).not.toMatch(/>\s*Correct\s*</);
    expect(closeoutQueuePageSource).not.toMatch(/>\s*Void\s*</);
  });

  it("uses required Confirm Payment helper and action copy", () => {
    expect(closeoutQueuePageSource).toContain(
      "Check, cash, and other reported payments count as collected payment only after office confirmation.",
    );
    expect(closeoutQueuePageSource).toContain("Verify only after confirming the money was received.");
    expect(closeoutQueuePageSource).toContain("Rejecting does not record payment.");
  });

  it("removes large standalone yellow reconciliation panel as primary presentation", () => {
    expect(closeoutQueuePageSource).not.toContain("Field Payment Reconciliation Attention");
    expect(closeoutQueuePageSource).not.toContain("bg-amber-50/60");
  });
});
