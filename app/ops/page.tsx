// app/ops/page
import Link from "next/link";
import ContractorFocusSelector from "./_components/ContractorFocusSelector";
import QueueCard from "@/components/ops/QueueCard";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { type OpsWorkspaceJob } from "@/lib/ops/ops-workspace-job-contract";
import { OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS } from "@/lib/ui/page-widths";
import {
  OPS_BOARD_SORT_OPTIONS,
  normalizeOpsBoardSort,
  sortOpsBoardRows,
} from "@/lib/ops/ops-board-sorting";
import {
  type OpsBoardFilterBucket,
} from "@/lib/ops/ops-workspace-queues";
import {
  getOpsBoardReasonLabel,
  normalizeOpsBoardReason,
} from "@/lib/ops/ops-board-reasons";
import OpsBoardActiveQueuePanel, {
  type OpsBoardActiveQueueRow,
} from "./_components/OpsBoardActiveQueuePanel";
import OpsMobileQueueSwitcher from "./_components/OpsMobileQueueSwitcher";
import {
  createOpsWorkspaceRowViewBuilders,
  type OpsWorkspaceRowJob,
} from "@/lib/ops/ops-workspace-row-views";
import {
  createOpsWorkspacePreviewLoader,
  loadOpsWorkspacePreviewEnrichment,
} from "@/lib/ops/ops-workspace-data-loader";
import { loadOpsWorkspaceOverview } from "@/lib/ops/ops-workspace-overview-loader";
import {
  buildContractorFocusFacet,
  INTERNAL_WORK_CONTRACTOR_FOCUS_ID,
  normalizeContractorFocusIds,
} from "@/lib/ops/ops-workspace-contractor-facets";
import { startOpsServerTimer } from "@/lib/ops/ops-server-timing";
import { loadOpsPermitWorkspaceSnapshot } from "@/lib/ops/ops-permit-workspace-loader";
import { loadOpsWorkspaceBootstrap } from "@/lib/ops/ops-workspace-bootstrap-loader";
import {
  buildOpsWorkspaceQueryString,
  loadOpsWorkspaceSelection,
} from "@/lib/ops/ops-workspace-selection-loader";
import OpsPermitWorkspace from "./_components/OpsPermitWorkspace";
import OpsWorkspaceUtilityRail from "./_components/OpsWorkspaceUtilityRail";
function normalizeOpsBoardFilterBucket(value: unknown): OpsBoardFilterBucket {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "need_to_schedule") return "pending";
  if (normalized === "scheduled") return "field_work";
  if (normalized === "intake") return "contractor_intake";
  if (
    normalized === "pending" ||
    normalized === "field_work" ||
    normalized === "without_tech" ||
    normalized === "waiting" ||
    normalized === "exceptions" ||
    normalized === "closeout" ||
    normalized === "follow_ups" ||
    normalized === "contractor_intake" ||
    normalized === "permits"
  ) {
    return normalized;
  }
  return "all";
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: Promise<{
  bucket?: string;
  create?: string;
  contractor?: string | string[];
  notice?: string;
  q?: string;
  sort?: string;
  reason?: string;
  signal?: string;
  permit_error?: string;
}>;
}) {
  
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const boardBucketFilter = normalizeOpsBoardFilterBucket(sp.bucket);
  const activeBoardBucketFilter = boardBucketFilter === "all" ? "pending" : boardBucketFilter;
  const contractorFocusIdsFromQuery = normalizeContractorFocusIds(sp.contractor);
  const notice = (sp.notice ?? "").trim().toLowerCase();
  const q = (sp.q ?? "").trim() || null;
  const sort = (sp.sort ?? "").trim() || "default";
  const boardSort = normalizeOpsBoardSort(sp.sort);
  const boardReasonFilter = normalizeOpsBoardReason(sp.reason);
  const permitActionError = (sp.permit_error ?? "").trim();
  const createIntent = (sp.create ?? "").trim().toLowerCase();

  const opsTimingEnabled = process.env.OPS_TIMING_DEBUG === "true";
  const finishTotalTiming = startOpsServerTimer(opsTimingEnabled);

  const finishRequestActorContextTiming = startOpsServerTimer(opsTimingEnabled);
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;
  const access = await resolveDualContextAccess({
    supabase,
    user,
    getPortalAdmin: createAdminClient,
  });

  const signal = (sp.signal ?? "").trim().toLowerCase() || "";

  if (!user) redirect("/login");

  if (!access.hasActiveAppAccess) {
    redirect(landingPathForDualContextAccess(access));
  }

  if (actorContext.kind === "contractor") {
    redirect("/portal");
  }

  if (actorContext.kind !== "internal" || !actorContext.internalUser) {
    redirect("/login");
  }

  const internalUser = actorContext.internalUser;
  const admin = createAdminClient();
  finishRequestActorContextTiming("ops:requestActorContext");

  const {
    accountTimeZone,
    canCreateEccBatchInvoice,
    canViewFieldPaymentVerificationAttention,
    contractorIntakeQueueAvailable,
    fieldPaymentReconciliationAttention,
    hasActiveIncomingWorkshareConnection,
    permitWorkflowEnabled,
    productMode,
    returnedWorkshareCount,
    showContractorFocusSelection,
    showTeamClockStatusCard,
    teamClockStatusRows,
  } = await loadOpsWorkspaceBootstrap({
    actorUserId: user.id,
    internalUser,
    supabase,
  });

  const contractorFocusIds = showContractorFocusSelection ? contractorFocusIdsFromQuery : [];
  const contractorScopeFilter =
    contractorFocusIds.length === 1 && contractorFocusIds[0] !== INTERNAL_WORK_CONTRACTOR_FOCUS_ID
      ? contractorFocusIds[0]
      : null;
  const contractorFocusFilter = contractorFocusIds.length > 0 ? contractorFocusIds.join(",") : null;
  const contractorFocusIdSet = new Set(contractorFocusIds);
  const finishBusinessIdentityTiming = startOpsServerTimer(opsTimingEnabled);
  const operationalTenantIdentityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).then((result) => {
    finishBusinessIdentityTiming("ops:businessIdentity");
    return result;
  });

    const followUpTodayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const finishWorkspaceCountsTiming = startOpsServerTimer(opsTimingEnabled);

    const {
      activePermitRequestRows,
      closeoutProjectionByJob: overviewCloseoutProjectionByJob,
      closeoutQueueRowsFull,
      coreBoardWorkspaceKeys,
      effectiveBoardBucketFilter,
      scheduledWithoutTechSnapshot,
      startTodayUtc: wsStartTodayUtc,
      startTomorrowUtc: wsStartTomorrowUtc,
      waitingExceptionSnapshot,
      workspaceTabs,
    } = await loadOpsWorkspaceOverview({
      supabase,
      admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      contractorIntakeQueueAvailable,
      contractorScopeFilter,
      permitWorkflowEnabled,
      productMode,
      requestedBucket: activeBoardBucketFilter,
    });

    const loadWorkspacePreviewRows = createOpsWorkspacePreviewLoader({
      supabase,
      admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      boardSort,
      closeoutQueueRows: closeoutQueueRowsFull,
      contractorIntakeQueueAvailable,
      retestContinuationParentIds: waitingExceptionSnapshot.retestContinuationParentIds,
      serviceFollowUpByJob: waitingExceptionSnapshot.serviceFollowUpByJob,
      scheduledWithoutTechSnapshot,
      startTodayUtc: wsStartTodayUtc,
      startTomorrowUtc: wsStartTomorrowUtc,
    });
    const {
      clearOpsBoardFiltersHref,
      contractorFocusSourceRows,
      effectiveBoardReasonFilter,
      hasActiveOpsBoardFilters,
      opsRailQueueRows,
      selectedContractorIntakeRows,
      selectedPermitRows,
      selectedPreviewRows,
      selectedWorkspaceCountText,
      selectedWorkspaceItemNoun,
      selectedWorkspaceKey,
      selectedWorkspacePreviewCount,
      selectedWorkspaceSection,
      selectedWorkspaceTab,
      selectedWorkspaceTotalCount,
      workspaceReasonOptions,
    } = await loadOpsWorkspaceSelection({
      activePermitRequestRows,
      boardReasonFilter,
      boardSort,
      closeoutQueueRowsFull,
      contractorFocusFilter,
      contractorFocusIdSet,
      coreBoardWorkspaceKeys,
      effectiveBoardBucketFilter,
      loadWorkspacePreviewRows,
      workspaceTabs,
    });

    finishWorkspaceCountsTiming("ops:workspace:countsAndPreview");
    finishTotalTiming("ops:totalBeforeRender");

    // These enrichment reads all depend only on the selected preview job ids
    // (plus two independent account-level reads), so they run as one barrier
    // instead of eight sequential round-trips.
    const {
      assignmentDisplayMap: selectedPreviewAssignmentDisplayMap,
      closeoutProjectionByJob: selectedWorkspaceCloseoutProjectionByJob,
      latestCustomerAttemptByJob: selectedPreviewLatestCustomerAttemptByJob,
      opsStatusEnteredAtByJob,
      operationalTenantIdentity,
      workspaceContractors,
      workspaceEvidence,
    } = await loadOpsWorkspacePreviewEnrichment({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      closeoutProjectionByJob: overviewCloseoutProjectionByJob,
      selectedWorkspaceKey,
      selectedPreviewRows,
      operationalTenantIdentityPromise,
    });
    const {
      allCount: contractorFocusAllCount,
      internalCount: contractorFocusInternalCount,
      options: contractorFocusOptions,
      showFilter: showWorkspaceContractorFilter,
    } = buildContractorFocusFacet({
      rows: contractorFocusSourceRows,
      activeContractors: workspaceContractors,
      selectedIds: contractorFocusIdSet,
      enabled: showContractorFocusSelection,
    });
    const activeWorkspaceBaseHref = `/ops${buildOpsWorkspaceQueryString({
      bucket: effectiveBoardBucketFilter,
      create: "",
      contractor: contractorFocusFilter ?? "",
      q: q ?? "",
      sort,
      reason: effectiveBoardReasonFilter ?? "",
      signal,
    })}`;
    const activeWorkspaceHref = `${activeWorkspaceBaseHref}#ops-workspace`;
    const rowViewBuilders = createOpsWorkspaceRowViewBuilders({
      accountTimeZone,
      activeWorkspaceBaseHref,
      activeWorkspaceHref,
      actorUserId: user.id,
      assignmentDisplayMap: selectedPreviewAssignmentDisplayMap,
      closeoutProjectionByJob: selectedWorkspaceCloseoutProjectionByJob,
      defaultContractorName: operationalTenantIdentity.displayName,
      followUpTodayDate,
      latestCustomerAttemptByJob: selectedPreviewLatestCustomerAttemptByJob,
      opsStatusEnteredAtByJob,
      serviceFollowUpByJob: waitingExceptionSnapshot.serviceFollowUpByJob,
      workspaceEvidence,
    });

    const canShowJobQueueExport = selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake";
    const canExportContractorSafeCsv = contractorFocusIds.length > 0;

    // Oldest/Newest describe time in the active queue, matching the "In queue"
    // badge. Keep the selection snapshot immutable so every downstream view
    // observes an explicit projection rather than a mutated shared array.
    const selectedWorkspaceJobRows = canShowJobQueueExport
      ? (selectedWorkspaceSection.previewRows as OpsWorkspaceJob[])
      : [];
    const sortedSelectedWorkspaceJobRows = sortOpsBoardRows(
      selectedWorkspaceJobRows,
      boardSort,
      { queueEnteredAt: (job) => rowViewBuilders.queueEnteredAt(job, selectedWorkspaceKey) },
    );

    const activeQueueRows: OpsBoardActiveQueueRow[] =
      canShowJobQueueExport
        ? sortedSelectedWorkspaceJobRows.map((job) => {
            const typedJob: OpsWorkspaceRowJob = job;
            const view = rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key);
            return {
              id: String(job.id ?? ""),
              reasonKey: getOpsBoardReasonLabel(rowViewBuilders.reasonInput(typedJob), { queueKey: selectedWorkspaceSection.key })?.key ?? null,
              sortable: {
                created_at: job.created_at ?? null,
                queue_entered_at: rowViewBuilders.queueEnteredAt(typedJob, selectedWorkspaceSection.key),
                scheduled_date: job.scheduled_date ?? null,
                window_start: job.window_start ?? null,
                customer_first_name: job.customer_first_name ?? null,
                customer_last_name: job.customer_last_name ?? null,
                contractors: { name: rowViewBuilders.contractorName(typedJob) || null },
              },
              view,
            };
          })
        : [];
    const activeQueuePinnedViews =
      canShowJobQueueExport && selectedWorkspaceSection?.key === "closeout" && canViewFieldPaymentVerificationAttention
        ? (fieldPaymentReconciliationAttention?.items ?? []).map((item) => rowViewBuilders.buildFieldPaymentReviewRowView(item))
        : [];
    const queueHealthAgingOver30 = activeQueueRows.filter(
      (row) => "ageDays" in row.view && row.view.ageDays != null && row.view.ageDays > 30,
    ).length;
    const queueHealthBreakdown = new Map<string, number>();
    let queueHealthUnassigned = 0;
    for (const row of activeQueueRows) {
      const stateChips = "stateChips" in row.view ? row.view.stateChips : [];
      for (const chip of stateChips) {
        if (chip.label === "Unassigned") {
          queueHealthUnassigned += 1;
          continue;
        }
        queueHealthBreakdown.set(chip.label, (queueHealthBreakdown.get(chip.label) ?? 0) + 1);
      }
    }
    const queueHealthStats = {
      agingOver30: queueHealthAgingOver30,
      unassigned: queueHealthUnassigned,
      breakdown: Array.from(queueHealthBreakdown.entries()).map(([label, count]) => ({ label, count })),
    };
    const opsBoardHeaderRightActionByBucket: Partial<Record<string, { label: string; href: string }>> = {
      pending: {
        label: "Plan routes →",
        href: "/calendar?view=plan",
      },
      ...(canCreateEccBatchInvoice
        ? {
            closeout: {
              label: "Batch Contractor Invoice",
              href: contractorScopeFilter
                ? `/billing/ready-to-bill?contractor=${encodeURIComponent(contractorScopeFilter)}`
                : "/billing/ready-to-bill",
            },
          }
        : {}),
    };
    const shouldExpandPermitCreateForm =
      selectedWorkspaceKey === "permits" && createIntent === "permit_request";
    const permitWorkspaceSnapshot = await loadOpsPermitWorkspaceSnapshot({
      accountOwnerUserId: internalUser.account_owner_user_id,
      accountTimeZone,
      rows: selectedPermitRows,
    });

    return (
      <div
        data-ops-visual-scope
        className={`mx-auto ${OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS} space-y-3 bg-slate-50/45 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 xl:px-6`}
      >
        {notice === "estimates_unavailable" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.24)]">
            <div className="font-semibold">Estimates are not enabled for this environment yet.</div>
            <div className="mt-1 text-amber-900/85">
              Internal estimate routes remain fail-closed here until the estimate migration is intentionally applied and the feature flag is explicitly enabled.
            </div>
          </section>
        ) : null}

        <header
          data-ops-sticky-header
          className="sticky top-14 z-30 -mx-2.5 border-b border-slate-200 bg-gray-100/95 px-4 py-3 shadow-[0_6px_14px_-12px_rgba(15,31,53,0.22)] backdrop-blur-sm sm:-mx-4 sm:px-5 sm:py-4 xl:-mx-6 xl:px-6"
        >
          <OpsMobileQueueSwitcher queues={opsRailQueueRows} />
          <div className="hidden flex-wrap items-start justify-between gap-3 xl:flex">
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {operationalTenantIdentity.displayName} · Operations
              </div>
              <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.02em] text-navy">
                Operations Workspace
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                Start with the queue that needs attention now. Then work down through field progress, exceptions, and closeout.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {returnedWorkshareCount > 0 ? (
                <Link href="/ops/workshare/returned" className="inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
                  Returned Work · {returnedWorkshareCount}
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_304px] xl:items-start">
        <div className="min-w-0 space-y-3 sm:space-y-4">
        <section
          id="ops-workspace"
          data-ops-specialized-mobile={canShowJobQueueExport ? undefined : ""}
          className="border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-3xl xl:border xl:border-slate-300/80 xl:bg-white xl:p-4 xl:shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] xl:ring-1 xl:ring-slate-200/70"
        >
          <div className="mb-3 hidden flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 xl:flex">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Board Filters</div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">Operations workbench</div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              {selectedWorkspacePreviewCount === selectedWorkspaceTotalCount
                ? `${selectedWorkspaceTotalCount} visible ${selectedWorkspaceItemNoun}`
                : `${selectedWorkspacePreviewCount} of ${selectedWorkspaceTotalCount} visible ${selectedWorkspaceItemNoun}`}
            </div>
          </div>

          {!canShowJobQueueExport ? (
          <>
          {showWorkspaceContractorFilter ? (
            <ContractorFocusSelector
              allCount={contractorFocusAllCount}
              internalWorkCount={contractorFocusInternalCount}
              internalWorkId={INTERNAL_WORK_CONTRACTOR_FOCUS_ID}
              options={contractorFocusOptions}
              selectedIds={contractorFocusIds}
            />
          ) : null}

          <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</label>
              <input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />
              <input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />
              <input type="hidden" name="sort" value={boardSort} />
              <select
                name="reason"
                defaultValue={effectiveBoardReasonFilter ?? ""}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <option value="">All reasons</option>
                {workspaceReasonOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white">
                Apply
              </button>
            </form>
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Sort</label>
              <input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />
              <input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />
              <input type="hidden" name="reason" value={effectiveBoardReasonFilter ?? ""} />
              <select
                name="sort"
                defaultValue={boardSort}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                {OPS_BOARD_SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white">
                Apply
              </button>
            </form>
            {hasActiveOpsBoardFilters ? (
              <Link href={clearOpsBoardFiltersHref} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50">
                Clear filters
              </Link>
            ) : null}
          </div>

          <article className="border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-2xl xl:border xl:border-slate-300/80 xl:bg-white xl:p-3.5 xl:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] xl:ring-1 xl:ring-slate-200/70">
            <div className={`mb-2 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 ${
              selectedWorkspaceKey === "contractor_intake" ? "flex" : "hidden xl:flex"
            }`}>
            <div className="hidden xl:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-950">{selectedWorkspaceSection?.label ?? selectedWorkspaceTab.label}</div>
              <div className="text-xs text-slate-600">
                {selectedWorkspaceCountText}
              </div>
            </div>
            {selectedWorkspaceKey === "contractor_intake" ? (
              <Link
                href={`/ops/contractor-intake/export${buildOpsWorkspaceQueryString({
                  contractor: contractorFocusFilter ?? "",
                })}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 xl:min-h-10 xl:w-auto xl:rounded-lg xl:border-slate-200/90 xl:bg-slate-50 xl:px-3 xl:py-1 xl:text-[13px]"
              >
                Export CSV
              </Link>
            ) : null}
          </div>

            {selectedWorkspaceKey === "permits" ? (
              <OpsPermitWorkspace
                actionError={permitActionError}
                contractors={workspaceContractors}
                expandCreateForm={shouldExpandPermitCreateForm}
                snapshot={permitWorkspaceSnapshot}
              />
            ) : selectedWorkspaceKey === "contractor_intake" ? (
              selectedContractorIntakeRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <div>No contractor-submitted work is waiting for review.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedContractorIntakeRows.map((submission) => (
                    <QueueCard
                      key={submission.id}
                      href={submission.detailHref}
                      title={submission.proposedTitle}
                      subtitle={`${submission.customerDisplay} - ${submission.addressDisplay}`}
                      actionLabel="Review Intake"
                      tagsColumns={2}
                      tags={[
                        { label: "Contractor", value: submission.contractorName },
                        {
                          label: "Submitted",
                          value: `${submission.submittedAgeDays} days ago - ${submission.submittedAtDisplay}`,
                        },
                        { label: "Proposed customer", value: submission.customerDisplay },
                        { label: "Address", value: submission.addressDisplay },
                        {
                          label: "Job/project",
                          value: `${submission.jobTypeLabel} / ${submission.projectTypeLabel}`,
                        },
                        { label: "Review status", value: submission.reviewStatus },
                        ...(submission.notesPreview
                          ? [{ label: "Notes", value: submission.notesPreview, fullWidth: true }]
                          : []),
                      ]}
                    />
                  ))}
                </div>
              )
            ) : null}
          </article>
          </>
          ) : (
            <OpsBoardActiveQueuePanel
              // Remount whenever the rendered bucket or contractor focus changes.
              // Queue chips and Apply() both navigate via soft nav, which keeps
              // this client component mounted — without a bucket+contractor key
              // its useState-seeded activeBucket/panelCache would keep serving
              // the previously rendered bucket's (or pre-filter) rows.
              key={`ops-panel-${effectiveBoardBucketFilter}-${contractorFocusFilter ?? "all"}`}
              contractorFocusSelector={
                showWorkspaceContractorFilter ? (
                  <ContractorFocusSelector
                    allCount={contractorFocusAllCount}
                    internalWorkCount={contractorFocusInternalCount}
                    internalWorkId={INTERNAL_WORK_CONTRACTOR_FOCUS_ID}
                    options={contractorFocusOptions}
                    selectedIds={contractorFocusIds}
                  />
                ) : null
              }
              initialBucket={effectiveBoardBucketFilter}
              initialSort={boardSort}
              initialPanel={{
                queueLabel: selectedWorkspaceSection?.label ?? selectedWorkspaceTab.label,
                itemNoun: selectedWorkspaceItemNoun,
                reasonOptions: workspaceReasonOptions,
                rows: activeQueueRows,
                pinnedViews: activeQueuePinnedViews,
                canExportContractorSafeCsv,
              }}
              contractorParam={contractorFocusFilter ?? ""}
              hasContractorFilter={contractorFocusIds.length > 0}
              clearContractorHref={clearOpsBoardFiltersHref}
              headerRightActionByBucket={opsBoardHeaderRightActionByBucket}
            />
          )}
        </section>
        </div>

        <OpsWorkspaceUtilityRail
          canExportQueue={canShowJobQueueExport}
          hasIncomingWorkshare={hasActiveIncomingWorkshareConnection}
          queueHealth={queueHealthStats}
          queues={opsRailQueueRows}
          returnedWorkshareCount={returnedWorkshareCount}
          showTeamClock={showTeamClockStatusCard}
          teamClockRows={teamClockStatusRows}
        />
        </div>
      </div>
    );
}
