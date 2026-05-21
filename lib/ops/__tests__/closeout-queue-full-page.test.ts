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
  it("renders a dedicated link to /ops/closeout-queue from the closeout card header", () => {
    expect(opsPageSource).toContain("View Closeout Queue");
    expect(opsPageSource).toContain("/ops/closeout-queue");
  });

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

  it("reads closeout source jobs from field-complete and not-closed projection input", () => {
    expect(closeoutQueuePageSource).toContain('.eq("field_complete", true)');
    expect(closeoutQueuePageSource).toContain('.neq("ops_status", "closed")');
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

  it("uses the existing external billing invoice-sent tracking action", () => {
    expect(closeoutQueuePageSource).toContain("markInvoiceCompleteFromForm");
    expect(closeoutQueuePageSource).toContain('name="success_notice" value="external_invoice_sent"');
    expect(closeoutQueuePageSource).toMatch(/>\s*Invoice Sent\s*</);
  });

  it("uses a pending-aware submit button for Invoice Sent", () => {
    expect(closeoutQueuePageSource).toContain("SubmitButton");
    expect(closeoutQueuePageSource).toContain('loadingText="Marking..."');
  });

  it("adds a By Contractor sort option", () => {
    expect(closeoutQueuePageSource).toContain("By Contractor");
    expect(closeoutQueuePageSource).toContain('sort=contractor');
  });

  it("uses closeout-specific next step copy", () => {
    expect(closeoutQueuePageSource).toContain("getCloseoutQueueNextStepLabel");
    expect(closeoutQueuePageSource).not.toContain("Customer follow-up is required");
  });

  it("renders an in-page contractor filter for narrowing the queue", () => {
    expect(closeoutQueuePageSource).toContain("ContractorFilter");
    expect(closeoutQueuePageSource).toContain("All Contractors");
  });

  it("gates Invoice Sent with external billing eligibility instead of internal invoicing rows", () => {
    expect(closeoutQueuePageSource).toContain("canShowExternalInvoiceSentAction");
    expect(closeoutQueuePageSource).toContain("projection.billingState");
    expect(closeoutQueuePageSource).toContain("canMarkExternalInvoiceSent");
  });

  it("revalidates the closeout queue after lightweight invoice sent tracking", () => {
    expect(jobOpsActionsSource).toContain('revalidatePath(`/ops/closeout-queue`)');
    expect(jobOpsActionsSource).toContain("success_notice");
  });
});
