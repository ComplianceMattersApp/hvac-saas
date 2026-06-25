import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const workspaceRichCardStart = opsPageSource.indexOf("function workspaceNeedsSchedulingRichCard(");
const workspaceRichCardEnd = opsPageSource.indexOf("const selectedWorkspaceItemCount", workspaceRichCardStart);
const workspaceRichCardSource =
  workspaceRichCardStart > -1 && workspaceRichCardEnd > workspaceRichCardStart
    ? opsPageSource.slice(workspaceRichCardStart, workspaceRichCardEnd)
    : "";

const workspaceCloseoutCardStart = opsPageSource.indexOf("function workspaceCloseoutRichCard(");
const workspaceCloseoutCardEnd = opsPageSource.indexOf("function workspaceFieldPaymentReviewCard(", workspaceCloseoutCardStart);
const workspaceCloseoutCardSource =
  workspaceCloseoutCardStart > -1 && workspaceCloseoutCardEnd > workspaceCloseoutCardStart
    ? opsPageSource.slice(workspaceCloseoutCardStart, workspaceCloseoutCardEnd)
    : "";

const workspacePaymentCardStart = opsPageSource.indexOf("function workspaceFieldPaymentReviewCard(");
const workspacePaymentCardEnd = opsPageSource.indexOf("const selectedWorkspaceItemCount", workspacePaymentCardStart);
const workspacePaymentCardSource =
  workspacePaymentCardStart > -1 && workspacePaymentCardEnd > workspacePaymentCardStart
    ? opsPageSource.slice(workspacePaymentCardStart, workspacePaymentCardEnd)
    : "";

const workspaceListStart = opsPageSource.indexOf(
  'selectedWorkspaceSection.key === "closeout" && canViewFieldPaymentVerificationAttention',
);
const workspaceListEnd = opsPageSource.indexOf("</article>", workspaceListStart);
const workspaceListSource =
  workspaceListStart > -1 && workspaceListEnd > workspaceListStart
    ? opsPageSource.slice(workspaceListStart, workspaceListEnd)
    : "";

const loadWorkspaceRowsStart = opsPageSource.indexOf("async function loadWorkspacePreviewRows(");
const loadWorkspaceRowsEnd = opsPageSource.indexOf("const workspacePreviewEntries", loadWorkspaceRowsStart);
const loadWorkspaceRowsSource =
  loadWorkspaceRowsStart > -1 && loadWorkspaceRowsEnd > loadWorkspaceRowsStart
    ? opsPageSource.slice(loadWorkspaceRowsStart, loadWorkspaceRowsEnd)
    : "";

describe("/ops Needs Scheduling rich cards", () => {
  it("renders rich action cards in the actual visible workspace Needs Scheduling queue", () => {
    expect(opsPageSource).toContain('pending: "need_to_schedule"');
    expect(opsPageSource).toContain('label: "Needs Scheduling"');
    expect(workspaceRichCardSource).toContain('variant="needs-scheduling-rich"');
    expect(workspaceListSource).toContain('if (selectedWorkspaceSection.key === "need_to_schedule")');
    expect(workspaceListSource).toContain("return workspaceNeedsSchedulingRichCard(job, visibleReason);");
  });

  it("does not cap the selected Needs Scheduling workspace list at the generic ten-row preview limit", () => {
    expect(loadWorkspaceRowsSource).toContain('workspaceKey === "need_to_schedule"');
    expect(loadWorkspaceRowsSource).toContain("Math.max(tabCount, 10)");
    expect(loadWorkspaceRowsSource).toContain(".limit(queuePreviewLimit)");
    expect(loadWorkspaceRowsSource).not.toContain(".limit(10)");
  });

  it("keeps contact timestamp display wired to the existing recent-attempt read model on the workspace cards", () => {
    expect(opsPageSource).toContain("buildLatestCustomerAttemptByJob");
    expect(opsPageSource).toContain('.eq("event_type", "customer_attempt")');
    expect(workspaceRichCardSource).toContain(
      "resolveRecentAttemptDisplay(selectedPreviewLatestCustomerAttemptByJob.get(jobId) ?? null)",
    );
    expect(workspaceRichCardSource).toContain("Last Attempt");
  });

  it("wires the workspace scheduler to the existing schedule action with current /ops filters preserved", () => {
    expect(opsPageSource).toContain('import { updateJobScheduleFromForm } from "@/lib/actions";');
    expect(workspaceRichCardSource).toContain("form action={updateJobScheduleFromForm}");
    expect(workspaceRichCardSource).toContain("<QueueCardOpenAndAct>");
    expect(workspaceRichCardSource).toContain('name="scheduled_date"');
    expect(workspaceRichCardSource).toContain('name="window_start"');
    expect(workspaceRichCardSource).toContain('name="window_end"');
    expect(workspaceRichCardSource).toContain('name="unschedule"');
    expect(workspaceRichCardSource).toContain('name="return_to" value={activeWorkspaceHref}');
    expect(opsPageSource).toContain("const activeWorkspaceHref");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter");
    expect(opsPageSource).toContain("reason: effectiveBoardReasonFilter");
  });

  it("wires workspace call and text logging to the existing customer contact action", () => {
    expect(opsPageSource).toContain(
      'import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";',
    );
    expect(workspaceRichCardSource).toContain("form action={logCustomerContactAttemptFromForm}");
    expect(workspaceRichCardSource).toContain('name="method" value="call"');
    expect(workspaceRichCardSource).toContain('name="method" value="text"');
    expect(workspaceRichCardSource).toContain("contact_attempt_logged_call");
    expect(workspaceRichCardSource).toContain("contact_attempt_logged_text");
    expect(workspaceRichCardSource).toContain("Open SMS App");
  });

  it("preserves compact workspace card rendering for queues that have not been promoted", () => {
    expect(workspaceListSource).toMatch(
      /if \(selectedWorkspaceSection\.key === "need_to_schedule"\)[\s\S]+return workspaceNeedsSchedulingRichCard\(job, visibleReason\);[\s\S]+<QueueCard[\s\S]+href=\{`\/jobs\/\$\{job\.id\}\?tab=ops`\}[\s\S]+actionLabel="Open Job"/,
    );
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
  });
});

describe("/ops Closeout rich cards", () => {
  it("renders rich closeout cards only from the actual visible closeout workspace key", () => {
    expect(opsPageSource).toContain('closeout: "closeout"');
    expect(opsPageSource).toContain('label: "Closeout & Review"');
    expect(workspaceCloseoutCardSource).toContain('variant="closeout-rich"');
    expect(workspaceListSource).toContain('if (selectedWorkspaceSection.key === "closeout")');
    expect(workspaceListSource).toContain("return workspaceCloseoutRichCard(job, visibleReason);");
  });

  it("uses closeout projection and billing truth before showing External Billing Complete", () => {
    expect(opsPageSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(opsPageSource).toContain("const selectedWorkspaceCloseoutProjectionByJob");
    expect(workspaceCloseoutCardSource).toContain("selectedWorkspaceCloseoutProjectionByJob.get(jobId) ?? job");
    expect(workspaceCloseoutCardSource).toContain("canShowExternalInvoiceSentAction");
    expect(workspaceCloseoutCardSource).toContain("form action={markInvoiceCompleteFromForm}");
    expect(workspaceCloseoutCardSource).toContain("External Billing Complete");
    expect(workspaceCloseoutCardSource).toContain('name="return_to" value={`${activeWorkspaceBaseHref}#ops-workspace-closeout-job-${jobId}`}');
  });

  it("does not promote deep invoice or payment workspace mutations into closeout job cards", () => {
    expect(workspaceCloseoutCardSource).not.toContain("createInternalInvoice");
    expect(workspaceCloseoutCardSource).not.toContain("issueInternalInvoice");
    expect(workspaceCloseoutCardSource).not.toContain("sendInternalInvoice");
    expect(workspaceCloseoutCardSource).not.toContain("void");
    expect(workspaceCloseoutCardSource).not.toContain("recordPayment");
    expect(workspaceCloseoutCardSource).not.toContain("line_items");
  });

  it("wires optional confirm-payment cards through the existing verification actions", () => {
    expect(workspaceListSource).toContain("workspaceFieldPaymentReviewCard(item)");
    expect(workspacePaymentCardSource).toContain("form action={verifyFieldPaymentCollectionReportFromForm}");
    expect(workspacePaymentCardSource).toContain("form action={rejectFieldPaymentCollectionReportFromForm}");
    expect(workspacePaymentCardSource).toContain("Reporter cannot verify their own report.");
    expect(workspacePaymentCardSource).toContain("Confirm Payment");
    expect(workspacePaymentCardSource).toContain("Reject Report");
    expect(workspacePaymentCardSource).toContain('name="return_to" value={`${activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`}');
    expect(
      readFileSync(resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"), "utf-8"),
    ).toContain("'/ops'");
  });

  it("keeps non-closeout queues on the compact workspace card path", () => {
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "exceptions"');
    expect(workspaceListSource).toContain("Open Job");
  });
});
