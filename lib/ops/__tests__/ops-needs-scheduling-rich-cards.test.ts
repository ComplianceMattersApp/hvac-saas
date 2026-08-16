import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);
const rowViewsSource = readFileSync(
  resolve(__dirname, "../ops-workspace-row-views.ts"),
  "utf-8",
);
const dataLoaderSource = readFileSync(
  resolve(__dirname, "../ops-workspace-data-loader.ts"),
  "utf-8",
);
const overviewLoaderSource = readFileSync(
  resolve(__dirname, "../ops-workspace-overview-loader.ts"),
  "utf-8",
);
const opsWorkspaceQueuesSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-workspace-queues.ts"),
  "utf-8",
);
const rowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);

const buildNeedsSchedulingStart = rowViewsSource.indexOf("function buildNeedsSchedulingRowView(");
const buildNeedsSchedulingEnd = rowViewsSource.indexOf("function buildCloseoutRowView(", buildNeedsSchedulingStart);
const buildNeedsSchedulingSource =
  buildNeedsSchedulingStart > -1 && buildNeedsSchedulingEnd > buildNeedsSchedulingStart
    ? rowViewsSource.slice(buildNeedsSchedulingStart, buildNeedsSchedulingEnd)
    : "";

const buildCloseoutStart = rowViewsSource.indexOf("function buildCloseoutRowView(");
const buildCloseoutEnd = rowViewsSource.indexOf("function buildFollowUpRowView(", buildCloseoutStart);
const buildCloseoutSource =
  buildCloseoutStart > -1 && buildCloseoutEnd > buildCloseoutStart
    ? rowViewsSource.slice(buildCloseoutStart, buildCloseoutEnd)
    : "";

const buildFieldPaymentStart = rowViewsSource.indexOf("const buildFieldPaymentReviewRowView = (");
const buildFieldPaymentSource = buildFieldPaymentStart > -1 ? rowViewsSource.slice(buildFieldPaymentStart) : "";

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

const loadWorkspaceRowsStart = dataLoaderSource.indexOf("return async function loadWorkspacePreviewRows(");
const loadWorkspaceRowsEnd = dataLoaderSource.indexOf(
  "export async function loadOpsWorkspacePreviewEnrichment(",
  loadWorkspaceRowsStart,
);
const loadWorkspaceRowsSource =
  loadWorkspaceRowsStart > -1 && loadWorkspaceRowsEnd > loadWorkspaceRowsStart
    ? dataLoaderSource.slice(loadWorkspaceRowsStart, loadWorkspaceRowsEnd)
    : "";

describe("/ops Needs Scheduling rich cards", () => {
  it("renders rich action cards in the actual visible workspace Needs Scheduling queue", () => {
    expect(opsWorkspaceQueuesSource).toContain('pending: "need_to_schedule"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Needs Scheduling"');
    expect(needsSchedulingCardSource).toContain("<MobileOpsCard");
    expect(rowViewsSource).toContain('if (queueKey === "need_to_schedule")');
    expect(rowViewsSource).toContain("return buildNeedsSchedulingRowView(job, reason, formattedRecentAttempt);");
    expect(activeQueueRowsSource).toContain("rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key)");
  });

  it("does not cap the selected Needs Scheduling workspace list at the generic ten-row preview limit", () => {
    expect(loadWorkspaceRowsSource).toContain('workspaceKey === "need_to_schedule"');
    expect(loadWorkspaceRowsSource).not.toContain("queuePreviewLimit");
    expect(loadWorkspaceRowsSource).not.toContain(".limit(");
  });

  it("keeps contact timestamp display wired to the existing recent-attempt read model on the workspace cards", () => {
    expect(dataLoaderSource).toContain("buildLatestCustomerAttemptByJob");
    expect(dataLoaderSource).toContain('.eq("event_type", "customer_attempt")');
    expect(rowViewsSource).toContain("resolveRecentAttemptDisplay(");
    expect(rowViewsSource).toContain("context.latestCustomerAttemptByJob.get(job.id) ?? null");
    expect(buildNeedsSchedulingSource).toContain("formattedRecentAttempt");
    expect(needsSchedulingCardSource).toContain("Last Attempt");
  });

  it("shows contractor context without duplicating it in the action area", () => {
    expect(buildNeedsSchedulingSource).toContain(
      "workspaceContractorName(job) || context.defaultContractorName",
    );
    expect(needsSchedulingCardSource).toContain(
      '{ label: "Contractor", value: view.contractorName || "Internal work"',
    );

    expect(needsSchedulingCardSource).not.toContain("Open & Act");
  });

  it("keeps scheduling controls out of the compact card while preserving its job destination", () => {
    expect(needsSchedulingCardSource).toContain("phoneHref={phoneHref}");
    expect(needsSchedulingCardSource).not.toContain("form action={updateJobScheduleFromForm}");
    expect(needsSchedulingCardSource).not.toContain('name="scheduled_date"');
    expect(needsSchedulingCardSource).not.toContain("Save Schedule");
    expect(buildNeedsSchedulingSource).toContain("returnToHref: context.activeWorkspaceHref");
    expect(opsPageSource).toContain("const activeWorkspaceHref");
    expect(opsPageSource).toContain("contractor: contractorFocusFilter ?? \"\"");
    expect(opsPageSource).toContain("reason: effectiveBoardReasonFilter");
  });

  it("keeps direct call and text links but hides contact logging controls", () => {
    expect(needsSchedulingCardSource).not.toContain("form action={logCustomerContactAttemptFromForm}");
    expect(needsSchedulingCardSource).not.toContain("Log Call");
    expect(needsSchedulingCardSource).not.toContain("Log Text Attempt");
    expect(rowCardSource).toContain('textHref ? <a href={textHref}');
  });

  it("preserves compact workspace card rendering for queues that have not been promoted", () => {
    expect(rowViewsSource).toContain('if (queueKey === "need_to_schedule")');
    expect(rowViewsSource).toContain("return buildGenericRowView(job, reason, queueKey, formattedRecentAttempt);");
    expect(activeQueueRowsSource).toContain("rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key)");
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
  });
});

describe("/ops Closeout rich cards", () => {
  it("renders rich closeout cards only from the actual visible closeout workspace key", () => {
    expect(opsWorkspaceQueuesSource).toContain('closeout: "closeout"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Closeout & Review"');
    expect(closeoutCardSource).toContain("<MobileOpsCard");
    expect(rowViewsSource).toContain('if (queueKey === "closeout")');
    expect(rowViewsSource).toContain("return buildCloseoutRowView(job, reason, formattedRecentAttempt);");
    expect(activeQueueRowsSource).toContain("rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key)");
  });

  it("uses closeout projection for the compact next step without inline mutation actions", () => {
    expect(overviewLoaderSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(opsPageSource).toContain("closeoutProjectionByJob: selectedWorkspaceCloseoutProjectionByJob");
    expect(buildCloseoutSource).toContain("context.closeoutProjectionByJob.get(jobId) ?? job");
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
    expect(opsPageSource).toContain("rowViewBuilders.buildFieldPaymentReviewRowView(item)");
    expect(fieldPaymentCardSource).toContain("form action={verifyFieldPaymentCollectionReportFromForm}");
    expect(fieldPaymentCardSource).toContain("form action={rejectFieldPaymentCollectionReportFromForm}");
    expect(fieldPaymentCardSource).toContain("Reporter cannot verify their own report.");
    expect(fieldPaymentCardSource).toContain("Confirm Payment");
    expect(fieldPaymentCardSource).toContain("Reject Report");
    expect(fieldPaymentCardSource).toContain('name="return_to" value={view.returnToHref}');
    expect(buildFieldPaymentSource).toContain("returnToHref: `${context.activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`");
    expect(
      readFileSync(resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"), "utf-8"),
    ).toContain("'/ops'");
  });

  it("keeps non-closeout queues on the compact workspace card path", () => {
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
    expect(activeQueueRowsSource).not.toContain('selectedWorkspaceSection.key === "exceptions"');
    expect(rowViewsSource).toContain("return buildGenericRowView(job, reason, queueKey, formattedRecentAttempt);");
  });
});
