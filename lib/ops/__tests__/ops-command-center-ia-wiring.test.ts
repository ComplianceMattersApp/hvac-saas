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

const contractorFilterSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/ContractorFilter.tsx"),
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

function assertFound(label: string, index: number) {
  expect(index, `${label} marker should exist in the Full Ops branch`).toBeGreaterThan(-1);
}

describe("/ops Full Ops command center IA wiring", () => {
  it("makes the first viewport tell the operator where to start", () => {
    const heroStart = opsPageSource.indexOf("Operations Workspace");
    assertFound("Operations Workspace", heroStart);

    const heroSource = opsPageSource.slice(heroStart, heroStart + 1200);
    expect(heroSource).toContain("Start with the queue that needs attention now.");
    expect(heroSource).toContain("activeWorkspaceHref");
    expect(heroSource).not.toContain("Full operations board");
  });

  it("keeps focused queue and filter wiring query-parameter driven", () => {
    expect(opsPageSource).toContain("function buildQueryString(");
    expect(opsPageSource).toContain("bucket: card.key");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter ?? \"\"");
    expect(opsPageSource).toContain("q: q ?? \"\"");
    expect(opsPageSource).toContain("sort: sort ?? \"\"");
    expect(opsPageSource).toContain("signal: signal ?? \"\"");
    expect(opsPageSource).toContain('href={`/ops${buildQueryString({');
  });

  it("keeps the board queue preview compact with job actions still reachable", () => {
    expect(opsPageSource).toContain("Active Queue");
    expect(opsPageSource).toContain("View on board");
    expect(opsPageSource).toContain("Open Job");
  });

  it("renders compact contractor filtering while queue chips own bucket selection", () => {
    expect(opsPageSource).toContain("Board Filters");
    expect(opsPageSource).toContain("ContractorFilter contractors={workspaceContractors}");
    expect(opsPageSource).toContain("All contractors");
    expect(contractorFilterSource).toContain('<option value="">All contractors</option>');
    expect(contractorFilterSource).toContain("contractors.map");
    expect(opsPageSource).not.toContain("OPS_BOARD_BUCKET_FILTERS");
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
    expect(opsPageSource).toContain('contractor_intake: "contractor_intake"');
    expect(opsPageSource).toContain("resolveVisibleOpsWorkspaceQueueKeys");
    expect(opsPageSource).toContain("const coreBoardWorkspaceKeys = resolveVisibleOpsWorkspaceQueueKeys({");
    expect(opsPageSource).toContain("const requestedWorkspaceKeys = [boardBucketWorkspaceKeyMap[effectiveBoardBucketFilter]];");
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
    expect(opsPageSource).toContain("return sortOpsBoardRows(queueRes.data ?? [], boardSort);");
    expect(opsPageSource).not.toContain("visibleWorkspaceSections.map((section)");
  });

  it("applies contractor filtering to visible board rows without changing row actions", () => {
    expect(opsPageSource).toContain("if (contractorScopeFilter) queueQ = queueQ.eq(\"contractor_id\", contractorScopeFilter);");
    expect(opsPageSource).toContain("return sortOpsBoardRows(queueRes.data ?? [], boardSort);");
    expect(opsPageSource).toContain("workspaceContractorName(job)");
    expect(opsPageSource).toContain('href={`/jobs/${job.id}?tab=ops`}');
    expect(opsPageSource).toContain("Open Job");
  });

  it("keeps sorting combined with Contractor and selected queue", () => {
    expect(opsPageSource).toContain("const boardSort = normalizeOpsBoardSort(sp.sort);");
    expect(opsPageSource).toContain('<input type="hidden" name="sort" value={boardSort} />');
    expect(opsPageSource).toContain('<input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />');
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
    expect(opsPageSource).toContain("formatOpsBoardVisibleReasonText");
    expect(opsPageSource).toContain("function workspaceVisibleReasonDisplay(job: any, queueKey: string): OpsBoardVisibleReason");
    expect(opsPageSource).toContain("return getOpsBoardVisibleReason(workspaceReasonInput(job), () => wsStatusReason(job, queueKey), { queueKey });");
    expect(opsPageSource).toContain("function workspaceStatusReason(job: any, queueKey: WorkspaceQueueKey)");
    expect(opsPageSource).toContain("const visibleReason = workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key);");
    expect(opsPageSource).toContain("const visibleReason = getOpsBoardVisibleReason(");
    expect(opsPageSource).toContain("{visibleReason.label}");
    expect(opsPageSource).toContain("{visibleReason.detail}");
  });

  it("guards Ops card reason rendering from bypassing the structured visible reason helper", () => {
    const fullCardRenderStart = opsPageSource.indexOf("selectedWorkspaceSection.previewRows.map");
    const fullCardRenderEnd = opsPageSource.indexOf("workspaceAgeLabel(job)", fullCardRenderStart);
    const fullCardRenderSource =
      fullCardRenderStart > -1 && fullCardRenderEnd > fullCardRenderStart
        ? opsPageSource.slice(fullCardRenderStart, fullCardRenderEnd)
        : "";

    const compactRowStart = opsPageSource.indexOf("function compactRow(");
    const compactRowEnd = opsPageSource.indexOf("const metaItems =", compactRowStart);
    const compactRowSource =
      compactRowStart > -1 && compactRowEnd > compactRowStart
        ? opsPageSource.slice(compactRowStart, compactRowEnd)
        : "";

    expect(fullCardRenderSource).toContain("workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key)");
    expect(fullCardRenderSource).toContain("{visibleReason.label}");
    expect(fullCardRenderSource).toContain("{visibleReason.detail}");
    expect(fullCardRenderSource).not.toContain("wsStatusReason(job");
    expect(fullCardRenderSource).not.toContain("workspaceStatusReason(job");

    expect(compactRowSource).toContain("const visibleReason = getOpsBoardVisibleReason(");
    expect(compactRowSource).toContain("ops_board_failure_detail");
    expect(compactRowSource).toContain("label: `${visibleReason.label}${statusAgeSuffix}`");
    expect(compactRowSource).toContain("message: visibleReason.detail ||");
  });

  it("loads the Closeout chip from status-shaped candidates plus the narrow permit exception", () => {
    expect(opsPageSource).toContain("async function loadCloseoutWorkspaceRows()");
    expect(opsPageSource).toContain('.in("ops_status", ["invoice_required", "paperwork_required"])');
    expect(opsPageSource).toContain('.in("ops_status", ["pending_info", "on_hold"])');
    expect(opsPageSource).toContain('.or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")');
    expect(opsPageSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(opsPageSource).toContain("pending_info_reason: job?.pending_info_reason");
    expect(opsPageSource).toContain("on_hold_reason: job?.on_hold_reason");
    expect(opsPageSource).toContain("listCloseoutQueueJobs(");
    expect(opsPageSource).toContain("buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });");
    expect(opsPageSource).toContain("filterOpsBoardRowsByReason(section.previewRows, effectiveBoardReasonFilter, { queueKey: section.key })");
  });

  it("guards Closeout loading against broad field-complete candidate expansion", () => {
    const loaderStart = opsPageSource.indexOf("async function loadCloseoutWorkspaceRows()");
    const loaderEnd = opsPageSource.indexOf("async function loadWorkspacePreviewRows", loaderStart);
    const loaderSource =
      loaderStart > -1 && loaderEnd > loaderStart
        ? opsPageSource.slice(loaderStart, loaderEnd)
        : "";

    expect(loaderSource).toContain('.in("ops_status", ["invoice_required", "paperwork_required"])');
    expect(loaderSource).toContain('.in("ops_status", ["pending_info", "on_hold"])');
    expect(loaderSource).toContain('.or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")');
    expect(loaderSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(loaderSource).toContain("listCloseoutQueueJobs(");
    expect(loaderSource).not.toContain('.neq("ops_status", "closed")');
    expect(loaderSource).not.toContain('.not("ops_status"');
  });

  it("shows clear filters and empty filtered state for unmatched board filters", () => {
    expect(opsPageSource).toContain("const hasActiveOpsBoardFilters = Boolean(contractorScopeFilter) || Boolean(effectiveBoardReasonFilter);");
    expect(opsPageSource).toContain("clearOpsBoardFiltersHref");
    expect(opsPageSource).toContain("bucket: effectiveBoardBucketFilter");
    expect(opsPageSource).toContain('boardSort === "oldest" ? "" : boardSort');
    expect(opsPageSource).toContain("Clear filters");
    expect(opsPageSource).toContain("No jobs match these filters.");
  });

  it("removes visible focused queue route entry points from the main Ops surface", () => {
    expect(opsPageSource).not.toContain("/ops/queues/waiting");
    expect(opsPageSource).not.toContain("/ops/queues/exceptions");
    expect(opsPageSource).not.toContain("/ops/queues/without-tech");
    expect(opsPageSource).not.toContain("Open focused queue");
    expect(opsPageSource).toContain('href={`/ops${buildQueryString({');
    expect(opsPageSource).toContain('bucket: card.key');
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
