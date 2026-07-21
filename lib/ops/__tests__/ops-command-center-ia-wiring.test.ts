import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const waitingQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

const exceptionsQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"),
  "utf-8",
);

const withoutTechQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/without-tech/page.tsx"),
  "utf-8",
);

const opsBoardSortingSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-board-sorting.ts"),
  "utf-8",
);

const opsBoardReasonsSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-board-reasons.ts"),
  "utf-8",
);

const opsWorkspaceQueuesSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-workspace-queues.ts"),
  "utf-8",
);

const queueCardSource = readFileSync(
  resolve(__dirname, "../../../components/ops/QueueCard.tsx"),
  "utf-8",
);

const jobContactActionsSource = readFileSync(
  resolve(__dirname, "../../../lib/actions/job-contact-actions.ts"),
  "utf-8",
);

const clearContactAttemptAutoFollowupsMigrationSource = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260702205000_clear_contact_attempt_auto_followups.sql"),
  "utf-8",
);

const contractorFocusSelectorSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/ContractorFocusSelector.tsx"),
  "utf-8",
);

const opsRowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);

const opsActiveQueuePanelSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsBoardActiveQueuePanel.tsx"),
  "utf-8",
);

function assertFound(label: string, index: number) {
  expect(index, `${label} marker should exist in the Full Ops branch`).toBeGreaterThan(-1);
}

describe("/ops Full Ops command center IA wiring", () => {
  it("makes the first viewport tell the operator where to start", () => {
    const heroStart = opsPageSource.indexOf("Operations Workspace");
    assertFound("Operations Workspace", heroStart);

    const heroSource = opsPageSource.slice(heroStart, heroStart + 1200);
    expect(heroSource).toContain("Start with the queue that needs attention now.");
    expect(heroSource).not.toContain("Full operations board");
  });

  it("keeps focused queue and filter wiring query-parameter driven", () => {
    expect(opsPageSource).toContain("function buildQueryString(");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter ?? \"\"");
    expect(opsPageSource).toContain("q: q ?? \"\"");
  });

  it("keeps the board queue preview compact with job actions still reachable", () => {
    expect(opsPageSource).toContain("Active Queue");
    expect(opsRowCardSource).toContain("Open Job");
    expect(opsPageSource).toContain("selectedWorkspacePreviewCount");
    expect(opsPageSource).toContain("selectedWorkspaceTotalCount");
    expect(opsPageSource).toContain("Showing ${selectedWorkspacePreviewCount} of ${selectedWorkspaceTotalCount}");
    expect(opsPageSource).toContain("/ops/closeout-queue${contractorScopeFilter");
    expect(opsPageSource).toContain("View all");
  });

  it("renders an Excel-style Contractor Focus selector for ECC/hybrid while queue chips own bucket selection", () => {
    expect(opsPageSource).toContain("Board Filters");
    expect(opsPageSource).toContain('const showContractorFocusSelection = productMode === "ecc_hers" || productMode === "hybrid";');
    expect(opsPageSource).toContain("<ContractorFocusSelector");
    expect(opsPageSource).toContain("contractorFocusInternalCount");
    expect(contractorFocusSelectorSource).toContain("Contractor Focus");
    expect(contractorFocusSelectorSource).toContain("Change");
    expect(contractorFocusSelectorSource).toContain("Search contractors");
    expect(contractorFocusSelectorSource).toContain("All Contractors");
    expect(contractorFocusSelectorSource).toContain("Internal Work");
    expect(contractorFocusSelectorSource).toContain("Clear");
    expect(contractorFocusSelectorSource).toContain("Apply");
    expect(contractorFocusSelectorSource).toContain('params.set("contractor", nextIds.join(","))');
    expect(opsPageSource).not.toContain("OPS_BOARD_BUCKET_FILTERS");
    expect(opsPageSource).not.toContain("Tap to narrow");
  });

  it("renders compact sort controls on the primary Ops board", () => {
    expect(opsPageSource).toContain("OPS_BOARD_SORT_OPTIONS");
    expect(opsPageSource).toContain('name="sort"');
    expect(opsPageSource).toContain("defaultValue={boardSort}");
    expect(opsBoardSortingSource).toContain("Oldest first");
    expect(opsBoardSortingSource).toContain("Newest first");
    expect(opsBoardSortingSource).toContain("Scheduled soonest");
    expect(opsBoardSortingSource).toContain("Contractor A-Z");
    expect(opsBoardSortingSource).toContain("Customer A-Z");
    expect(opsBoardSortingSource).not.toContain("Recently updated");
  });

  it("renders compact reason controls on the primary Ops board", () => {
    expect(opsPageSource).toContain("buildOpsBoardReasonOptions");
    expect(opsPageSource).toContain("filterOpsBoardRowsByReason");
    expect(opsPageSource).toContain("normalizeOpsBoardReason(sp.reason)");
    expect(opsPageSource).toContain('name="reason"');
    expect(opsPageSource).toContain("All reasons");
    expect(opsBoardReasonsSource).toContain("Needs invoice");
    expect(opsBoardReasonsSource).toContain("Needs certs");
    expect(opsBoardReasonsSource).toContain("Needs invoice and certs");
    expect(opsBoardReasonsSource).toContain("Failed ECC test");
    expect(opsBoardReasonsSource).not.toContain("ops_status:");
  });

  it("maps bucket filters to existing Ops board queue categories", () => {
    expect(opsPageSource).toContain('const activeBoardBucketFilter = boardBucketFilter === "all" ? "pending" : boardBucketFilter;');
    expect(opsPageSource).toContain("boardBucketWorkspaceKeyMap");
    expect(opsPageSource).toContain('pending: "need_to_schedule"');
    expect(opsPageSource).toContain('field_work: "field_work"');
    expect(opsPageSource).toContain('waiting: "waiting"');
    expect(opsPageSource).toContain('exceptions: "exceptions"');
    expect(opsPageSource).toContain('closeout: "closeout"');
    expect(opsPageSource).toContain('follow_ups: "follow_ups"');
    expect(opsPageSource).toContain('contractor_intake: "contractor_intake"');
    expect(opsPageSource).toContain("resolveVisibleOpsWorkspaceQueueKeys");
    expect(opsPageSource).toContain("const coreBoardWorkspaceKeys = resolveVisibleOpsWorkspaceQueueKeys({");
    expect(opsPageSource).toContain("const requestedWorkspaceKeys = [boardBucketWorkspaceKeyMap[effectiveBoardBucketFilter]];");
  });

  it("keeps follow-up reminders always visible with date urgency styling", () => {
    expect(opsPageSource).toContain('key: "follow_ups"');
    expect(opsPageSource).toContain('label: "Follow Ups"');
    expect(opsPageSource).toContain('.or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null")');
    expect(opsPageSource).toContain("function followUpUrgency(dueDate: string)");
    expect(opsPageSource).toContain('variant: "follow-up-overdue"');
    expect(opsPageSource).toContain('variant: "follow-up-soon"');
    expect(queueCardSource).toContain('variant === "follow-up-overdue" || variant === "follow-up-due"');
    expect(queueCardSource).toContain('variant === "follow-up-soon" || variant === "follow-up-unscheduled"');
  });

  it("keeps contact attempts from auto-creating Follow Ups queue reminders", () => {
    expect(jobContactActionsSource).toContain("Contact attempts are history only.");
    expect(jobContactActionsSource).toContain("Follow-up reminders are created through");
    expect(jobContactActionsSource).not.toContain("function nextFollowUpDate");
    expect(jobContactActionsSource).not.toContain("follow_up_date: followUp");
    expect(clearContactAttemptAutoFollowupsMigrationSource).toContain("legacy contact-attempt cadence reminders");
    expect(clearContactAttemptAutoFollowupsMigrationSource).toContain("event_type = 'customer_attempt'");
    expect(clearContactAttemptAutoFollowupsMigrationSource).toContain("next_action_note");
  });

  it("restores fixed queue chips as the primary Ops queue selector", () => {
    expect(opsPageSource).toContain('aria-label="Operations queue selector"');
    expect(opsPageSource).toContain('aria-current={chip.isSelected ? "page" : undefined}');
    expect(opsPageSource).toContain("workspaceQueueChips.map");
    expect(opsPageSource).toContain("coreBoardWorkspaceKeys.map");
    expect(opsPageSource).toContain("bucket: chipBucket");
    expect(opsPageSource).toContain('key: "field_work"');
    expect(opsPageSource).toContain('label: "Field Work"');
    expect(opsPageSource).toContain('label: "Contractor Intake"');
    expect(opsPageSource).toContain('? "Intake"');
    expect(opsPageSource).toContain("{chip.mobileLabel} · {chip.count}");
    expect(opsPageSource).toContain("{chip.label} · {chip.count}");
  });

  it("keeps mobile fixed queue chips visible without hidden horizontal overflow", () => {
    expect(opsPageSource).toContain('className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector"');
    expect(opsPageSource).not.toContain('className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Operations queue selector"');
    expect(opsPageSource).toContain("flex-[1_1_calc(50%-0.5rem)]");
    expect(opsPageSource).toContain("min-h-10");
  });

  it("restores Field Work through the existing scheduled field-work read model", () => {
    expect(opsWorkspaceQueuesSource).toContain("export type OpsBoardFilterBucket =");
    expect(opsWorkspaceQueuesSource).toContain('"contractor_intake"');
    expect(opsPageSource).toContain('if (normalized === "scheduled") return "field_work";');
    expect(opsPageSource).toContain('} else if (workspaceKey === "field_work") {');
    expect(opsPageSource).toContain('.eq("field_complete", false)');
    expect(opsPageSource).toContain('.gte("scheduled_date", wsStartTodayUtc)');
    expect(opsPageSource).toContain('.lt("scheduled_date", wsStartTomorrowUtc)');
    expect(opsPageSource).toContain('if (queueKey === "field_work")');
  });

  it("renders one active queue section refined by filters and sort", () => {
    expect(opsPageSource).toContain("const selectedWorkspaceSection =");
    expect(opsPageSource).toContain("selectedWorkspaceSection.previewRows.map");
    expect(opsPageSource).toContain("const workspaceReasonOptions = buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });");
    expect(opsPageSource).toContain("return sortOpsBoardRows(currentRows, boardSort);");
    expect(opsPageSource).not.toContain("visibleWorkspaceSections.map((section)");
  });

  it("assembles exception failure evidence before queue-age sorting", () => {
    const failedEvidenceIndex = opsPageSource.indexOf(
      "latestFailedRunByJob = buildLatestFailedRunByJob(selectedPreviewFailedRunsRes.data ?? []);",
    );
    const queueSortIndex = opsPageSource.indexOf(
      "const queueSortedRows = sortOpsBoardRows(selectedWorkspaceSection.previewRows, boardSort",
    );

    expect(failedEvidenceIndex).toBeGreaterThan(-1);
    expect(queueSortIndex).toBeGreaterThan(failedEvidenceIndex);
    expect(opsPageSource).toContain("queueEnteredAt: (job) => workspaceQueueEnteredAt(job, selectedWorkspaceKey)");
    expect(opsPageSource).toContain("queue_entered_at: workspaceQueueEnteredAt(job, selectedWorkspaceSection.key)");
    expect(opsActiveQueuePanelSource).toContain("{ queueEnteredAt: (row) => row.queue_entered_at }");
  });

  it("does not cap active operations queues to ten preview rows", () => {
    expect(opsPageSource).toContain("previewLimit: Math.max(scheduledOpenRows.length, 1)");
    expect(opsPageSource).not.toContain(").slice(0, 10);");
    expect(opsPageSource).not.toContain("queuePreviewLimit");
  });

  it("shows failed-report delivery awareness without changing exception routing", () => {
    expect(opsPageSource).toContain('event?.event_type ?? "").trim() !== "contractor_report_sent"');
    expect(opsPageSource).toContain('label: "Failure report sent", tone: "green"');
    expect(opsPageSource).toContain('label: "Failure report not sent", tone: "amber"');
    expect(opsPageSource).toContain('queueKey === "exceptions"');
  });

  it("applies contractor filtering to visible board rows without changing row actions", () => {
    expect(opsPageSource).toContain("function filterRowsByContractorFocus(rows: any[])");
    expect(opsPageSource).toContain("previewRows: filterRowsByContractorFocus(section.previewRows)");
    expect(opsPageSource).toContain("contractorFocusIdSet.has(INTERNAL_WORK_CONTRACTOR_FOCUS_ID)");
    expect(opsPageSource).toContain("return sortOpsBoardRows(currentRows, boardSort);");
    expect(opsPageSource).toContain("workspaceContractorName(job)");
    expect(opsPageSource).toContain('href: `/jobs/${jobId}?tab=ops`');
    expect(opsRowCardSource).toContain("Open Job");
  });

  it("scopes contractor options to the rendered bucket via server-nav chips so per-bucket counts stay correct", () => {
    // Queue chips navigate (server round-trip) rather than switching the panel
    // client-side, so the SSR-computed contractor facet always matches the
    // bucket being viewed. Chips carry the active-bucket highlight for that nav.
    expect(opsPageSource).toContain("active: chip.isSelected");
    expect(opsPageSource).not.toContain('"switchable"');
    // Picker source is the selected bucket's rows (before the contractor filter),
    // not a bucket-agnostic sweep of every open job.
    expect(opsPageSource).toContain(
      "reasonSourceWorkspaceSections.find((section) => section.key === selectedWorkspaceKey)?.previewRows ?? []",
    );
    expect(opsPageSource).not.toContain("loadActiveQueueContractorFocusSourceRows");
    expect(opsPageSource).toContain("contractorFocusInternalCount += 1");
    // Closeout facet counts the full closeout set, not the 10-row preview.
    expect(opsPageSource).toContain('selectedWorkspaceKey === "closeout"');
    expect(opsPageSource).toContain("? closeoutQueueRowsFull");
  });

  it("keeps sorting combined with Contractor and selected queue", () => {
    expect(opsPageSource).toContain("const boardSort = normalizeOpsBoardSort(sp.sort);");
    expect(opsPageSource).toContain('<input type="hidden" name="sort" value={boardSort} />');
    expect(opsPageSource).toContain('<input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />');
    expect(opsPageSource).toContain('<input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />');
    expect(opsPageSource).toContain('<input type="hidden" name="reason" value={effectiveBoardReasonFilter ?? ""} />');
  });

  it("keeps reason filtering combined with Contractor, selected queue, and Sort", () => {
    expect(opsPageSource).toContain("const boardReasonFilter = normalizeOpsBoardReason(sp.reason);");
    expect(opsPageSource).toContain("const workspaceReasonOptions = buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });");
    expect(opsPageSource).toContain("const effectiveBoardReasonFilter = boardReasonFilter && workspaceReasonOptions.some");
    expect(opsPageSource).toContain("previewRows: filterOpsBoardRowsByReason(section.previewRows, effectiveBoardReasonFilter, { queueKey: section.key })");
    expect(opsPageSource).toContain('<input type="hidden" name="sort" value={boardSort} />');
    expect(opsPageSource).toContain('<input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />');
  });

  it("uses the same reason helper for options, filtering, and visible row reason", () => {
    expect(opsPageSource).toContain("getOpsBoardVisibleReason");
    expect(opsPageSource).toContain("function workspaceVisibleReasonDisplay(job: any, queueKey: string): OpsBoardVisibleReason");
    expect(opsPageSource).toContain("return getOpsBoardVisibleReason(workspaceReasonInput(job), () => wsStatusReason(job, queueKey), { queueKey });");
    expect(opsPageSource).toContain("const visibleReason = workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key);");
    expect(opsPageSource).toContain("reasonLabel: visibleReason.label");
    expect(opsPageSource).toContain("reasonDetail: visibleReason.detail");
  });

  it("guards Ops card reason rendering from bypassing the structured visible reason helper", () => {
    const fullCardRenderStart = opsPageSource.indexOf("selectedWorkspaceSection.previewRows.map");
    const fullCardRenderEnd = opsPageSource.indexOf("sortable: {", fullCardRenderStart);
    const fullCardRenderSource =
      fullCardRenderStart > -1 && fullCardRenderEnd > fullCardRenderStart
        ? opsPageSource.slice(fullCardRenderStart, fullCardRenderEnd)
        : "";

    expect(fullCardRenderSource).toContain("workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key)");
    expect(fullCardRenderSource).not.toContain("wsStatusReason(job");
    expect(fullCardRenderSource).not.toContain("workspaceStatusReason(job");
  });

  it("loads the Closeout chip from field-complete candidates and canonical projection", () => {
    expect(opsPageSource).toContain("async function loadCloseoutWorkspaceRows()");
    expect(opsPageSource).toContain('.eq("field_complete", true)');
    expect(opsPageSource).toContain("Invoice-needed closeout is status-invariant.");
    expect(opsPageSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(opsPageSource).toContain("pending_info_reason: job?.pending_info_reason");
    expect(opsPageSource).toContain("on_hold_reason: job?.on_hold_reason");
    expect(opsPageSource).toContain("listCloseoutQueueJobs(");
    expect(opsPageSource).toContain("const closeoutEnteredAtByJob = buildOpsStatusEnteredAtByJob");
    expect(opsPageSource).toContain("buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });");
    expect(opsPageSource).toContain("filterOpsBoardRowsByReason(section.previewRows, effectiveBoardReasonFilter, { queueKey: section.key })");
  });

  it("guards Closeout loading against status and permit-only prefilters", () => {
    const loaderStart = opsPageSource.indexOf("async function loadCloseoutWorkspaceRows()");
    const loaderEnd = opsPageSource.indexOf("async function loadWorkspacePreviewRows", loaderStart);
    const loaderSource =
      loaderStart > -1 && loaderEnd > loaderStart
        ? opsPageSource.slice(loaderStart, loaderEnd)
        : "";

    expect(loaderSource).toContain('.eq("field_complete", true)');
    expect(loaderSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(loaderSource).toContain("listCloseoutQueueJobs(");
    expect(loaderSource).not.toContain('.in("ops_status", ["invoice_required", "paperwork_required"])');
    expect(loaderSource).not.toContain('.or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")');
    expect(loaderSource).not.toContain('.neq("ops_status", "closed")');
    expect(loaderSource).not.toContain('.not("ops_status"');
  });

  it("shows clear filters and empty filtered state for unmatched board filters", () => {
    expect(opsPageSource).toContain("const hasActiveOpsBoardFilters = contractorFocusIds.length > 0 || Boolean(effectiveBoardReasonFilter);");
    expect(opsPageSource).toContain("clearOpsBoardFiltersHref");
    expect(opsPageSource).toContain("bucket: effectiveBoardBucketFilter");
    expect(opsPageSource).toContain('boardSort === "oldest" ? "" : boardSort');
    expect(opsPageSource).toContain("Clear filters");
    expect(opsActiveQueuePanelSource).toContain("No jobs match these filters.");
  });

  it("removes visible focused queue route entry points from the main Ops surface", () => {
    expect(opsPageSource).not.toContain("/ops/queues/waiting");
    expect(opsPageSource).not.toContain("/ops/queues/exceptions");
    expect(opsPageSource).not.toContain("/ops/queues/without-tech");
    expect(opsPageSource).not.toContain("Open focused queue");
  });

  it("leaves direct focused queue route files renderable with return navigation", () => {
    expect(waitingQueuePageSource).toContain("No waiting work right now.");
    expect(waitingQueuePageSource).toContain('href="/ops"');
    expect(exceptionsQueuePageSource).toContain("No exceptions are waiting right now.");
    expect(exceptionsQueuePageSource).toContain('href="/ops"');
    expect(withoutTechQueuePageSource).toContain("No coverage gaps right now.");
    expect(withoutTechQueuePageSource).toContain('href="/ops"');
  });

  it("adds pending contractor intake as an operational queue without using notifications as truth", () => {
    expect(opsPageSource).toContain("countPendingContractorIntakeQueueRows");
    expect(opsPageSource).toContain("listPendingContractorIntakeQueueRows");
    expect(opsPageSource).toContain("CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT");
    expect(opsPageSource).toContain("isContractorIntakeQueueAvailableForProductMode");
    expect(opsPageSource).toContain("contractorIntakeQueueAvailable");
    expect(opsPageSource).toContain("? countPendingContractorIntakeQueueRows");
    expect(opsPageSource).toContain("resolveEffectiveOpsBoardBucketFilter");
    expect(opsPageSource).toContain('if (normalized === "intake") return "contractor_intake";');
    expect(opsPageSource).toContain('normalized === "contractor_intake"');
    expect(opsPageSource).toContain('selectedWorkspaceKey === "contractor_intake"');
    expect(opsPageSource).toContain('bucket: "contractor_intake"');
    expect(opsPageSource).toContain("/ops/contractor-intake/export");
    expect(opsPageSource).toContain("No contractor-submitted work is waiting for review.");
    expect(opsPageSource).toContain("Review Intake");
    expect(opsPageSource).toContain("selectedContractorIntakeRows");
  });

  it("keeps the existing Ops workbench chips in place", () => {
    expect(opsPageSource).toContain('label: "Needs Scheduling"');
    expect(opsPageSource).toContain('label: "Field Work"');
    expect(opsPageSource).toContain('label: "Waiting / Pending Info"');
    expect(opsPageSource).toContain('label: "Exceptions"');
    expect(opsPageSource).toContain('label: "Closeout & Review"');
    expect(opsPageSource).toContain('label: "Permits"');
  });
});
