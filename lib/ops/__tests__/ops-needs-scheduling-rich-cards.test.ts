import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);
const rowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);

const buildNeedsSchedulingStart = opsPageSource.indexOf("function buildNeedsSchedulingRowView(");
const buildNeedsSchedulingEnd = opsPageSource.indexOf("function formatWorkspaceUsdFromCents", buildNeedsSchedulingStart);
const buildNeedsSchedulingSource =
  buildNeedsSchedulingStart > -1 && buildNeedsSchedulingEnd > buildNeedsSchedulingStart
    ? opsPageSource.slice(buildNeedsSchedulingStart, buildNeedsSchedulingEnd)
    : "";

const buildCloseoutStart = opsPageSource.indexOf("function buildCloseoutRowView(");
const buildCloseoutEnd = opsPageSource.indexOf("function formatFollowUpOwner", buildCloseoutStart);
const buildCloseoutSource =
  buildCloseoutStart > -1 && buildCloseoutEnd > buildCloseoutStart
    ? opsPageSource.slice(buildCloseoutStart, buildCloseoutEnd)
    : "";

const buildFieldPaymentStart = opsPageSource.indexOf("function buildFieldPaymentReviewRowView(");
const buildFieldPaymentEnd = opsPageSource.indexOf("const selectedWorkspaceItemNoun", buildFieldPaymentStart);
const buildFieldPaymentSource =
  buildFieldPaymentStart > -1 && buildFieldPaymentEnd > buildFieldPaymentStart
    ? opsPageSource.slice(buildFieldPaymentStart, buildFieldPaymentEnd)
    : "";

const activeQueueRowsStart = opsPageSource.indexOf("const activeQueueRows: OpsBoardActiveQueueRow[]");
const activeQueueRowsEnd = opsPageSource.indexOf("const activeQueuePinnedViews", activeQueueRowsStart);
const activeQueueRowsSource =
  activeQueueRowsStart > -1 && activeQueueRowsEnd > activeQueueRowsStart
    ? opsPageSource.slice(activeQueueRowsStart, activeQueueRowsEnd)
    : "";

const needsSchedulingCardStart = rowCardSource.indexOf("function NeedsSchedulingCard(");
const needsSchedulingCardEnd = rowCardSource.indexOf("function CloseoutCard(", needsSchedulingCardStart);
const needsSchedulingCardSource =
  needsSchedulingCardStart > -1 && needsSchedulingCardEnd > needsSchedulingCardStart
    ? rowCardSource.slice(needsSchedulingCardStart, needsSchedulingCardEnd)
    : "";

const closeoutCardStart = rowCardSource.indexOf("function CloseoutCard(");
const closeoutCardEnd = rowCardSource.indexOf("function FollowUpCard(", closeoutCardStart);
const closeoutCardSource =
  closeoutCardStart > -1 && closeoutCardEnd > closeoutCardStart
    ? rowCardSource.slice(closeoutCardStart, closeoutCardEnd)
    : "";

const fieldPaymentCardStart = rowCardSource.indexOf("function FieldPaymentReviewCard(");
const fieldPaymentCardSource = fieldPaymentCardStart > -1 ? rowCardSource.slice(fieldPaymentCardStart) : "";

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
    expect(needsSchedulingCardSource).toContain('variant="needs-scheduling-rich"');
    expect(activeQueueRowsSource).toContain('selectedWorkspaceSection.key === "need_to_schedule"');
    expect(activeQueueRowsSource).toContain("buildNeedsSchedulingRowView(job, visibleReason)");
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
    expect(buildNeedsSchedulingSource).toContain(
      "resolveRecentAttemptDisplay(selectedPreviewLatestCustomerAttemptByJob.get(jobId) ?? null)",
    );
    expect(needsSchedulingCardSource).toContain("Last Attempt");
  });

  it("shows contractor context without duplicating it in the action area", () => {
    expect(buildNeedsSchedulingSource).toContain(
      "workspaceContractorName(job) || operationalTenantIdentity.displayName",
    );
    expect(needsSchedulingCardSource).toContain(
      '...(view.contractorName ? [{ label: "Contractor", value: view.contractorName }] : [])',
    );

    expect(needsSchedulingCardSource).not.toContain("Open & Act");
  });

  it("wires the workspace scheduler to the existing schedule action with current /ops filters preserved", () => {
    expect(opsPageSource).toContain('import { updateJobScheduleFromForm } from "@/lib/actions";');
    expect(needsSchedulingCardSource).toContain("form action={updateJobScheduleFromForm}");
    expect(needsSchedulingCardSource).toContain("headerContent={");
    expect(needsSchedulingCardSource).toContain('name="scheduled_date"');
    expect(needsSchedulingCardSource).toContain('name="window_start"');
    expect(needsSchedulingCardSource).toContain('name="window_end"');
    expect(needsSchedulingCardSource).toContain('name="unschedule"');
    expect(needsSchedulingCardSource).toContain('name="return_to" value={view.returnToHref}');
    expect(buildNeedsSchedulingSource).toContain("returnToHref: activeWorkspaceHref");
    expect(opsPageSource).toContain("const activeWorkspaceHref");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter");
    expect(opsPageSource).toContain("reason: effectiveBoardReasonFilter");
  });

  it("wires workspace call and text logging to the existing customer contact action", () => {
    expect(opsPageSource).toContain(
      'import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";',
    );
    expect(needsSchedulingCardSource).toContain("form action={logCustomerContactAttemptFromForm}");
    expect(needsSchedulingCardSource).toContain('name="method" value="call"');
    expect(needsSchedulingCardSource).toContain('name="method" value="text"');
    expect(needsSchedulingCardSource).toContain("contact_attempt_logged_call");
    expect(needsSchedulingCardSource).toContain("contact_attempt_logged_text");
    expect(needsSchedulingCardSource).toContain(">Text<");
  });

  it("preserves compact workspace card rendering for queues that have not been promoted", () => {
    expect(activeQueueRowsSource).toMatch(
      /selectedWorkspaceSection\.key === "need_to_schedule"[\s\S]+buildNeedsSchedulingRowView\(job, visibleReason\)[\s\S]+buildGenericRowView\(job, visibleReason, selectedWorkspaceSection\.key\)/,
    );
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
  });
});

describe("/ops Closeout rich cards", () => {
  it("renders rich closeout cards only from the actual visible closeout workspace key", () => {
    expect(opsPageSource).toContain('closeout: "closeout"');
    expect(opsPageSource).toContain('label: "Closeout & Review"');
    expect(closeoutCardSource).toContain('variant="closeout-rich"');
    expect(activeQueueRowsSource).toContain('selectedWorkspaceSection.key === "closeout"');
    expect(activeQueueRowsSource).toContain("buildCloseoutRowView(job, visibleReason)");
  });

  it("uses closeout projection for the compact next step without inline mutation actions", () => {
    expect(opsPageSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(opsPageSource).toContain("const selectedWorkspaceCloseoutProjectionByJob");
    expect(buildCloseoutSource).toContain("selectedWorkspaceCloseoutProjectionByJob.get(jobId) ?? job");
    expect(buildCloseoutSource).toContain("getCloseoutQueueNextStepLabel(projection)");
    expect(closeoutCardSource).not.toContain("form action={markInvoiceCompleteFromForm}");
    expect(closeoutCardSource).not.toContain("External Billing Complete");
  });

  it("does not promote deep invoice or payment workspace mutations into closeout job cards", () => {
    expect(closeoutCardSource).not.toContain("createInternalInvoice");
    expect(closeoutCardSource).not.toContain("issueInternalInvoice");
    expect(closeoutCardSource).not.toContain("sendInternalInvoice");
    expect(closeoutCardSource).not.toContain("recordPayment");
    expect(closeoutCardSource).not.toContain("line_items");
  });

  it("wires optional confirm-payment cards through the existing verification actions", () => {
    expect(opsPageSource).toContain("buildFieldPaymentReviewRowView(item)");
    expect(fieldPaymentCardSource).toContain("form action={verifyFieldPaymentCollectionReportFromForm}");
    expect(fieldPaymentCardSource).toContain("form action={rejectFieldPaymentCollectionReportFromForm}");
    expect(fieldPaymentCardSource).toContain("Reporter cannot verify their own report.");
    expect(fieldPaymentCardSource).toContain("Confirm Payment");
    expect(fieldPaymentCardSource).toContain("Reject Report");
    expect(fieldPaymentCardSource).toContain('name="return_to" value={view.returnToHref}');
    expect(buildFieldPaymentSource).toContain("returnToHref: `${activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`");
    expect(
      readFileSync(resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"), "utf-8"),
    ).toContain("'/ops'");
  });

  it("keeps non-closeout queues on the compact workspace card path", () => {
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "exceptions"');
    expect(activeQueueRowsSource).toContain("buildGenericRowView");
  });
});
