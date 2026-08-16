import type { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  buildBillingTruthCloseoutProjectionMap,
  type BillingTruthCloseoutProjection,
  type BillingTruthProjectionJobInput,
} from "@/lib/business/job-billing-state";
import type { OperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import {
  CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT,
  listPendingContractorIntakeQueueRows,
  type ContractorIntakeQueueRow,
} from "@/lib/ops/contractor-intake-queue";
import { isPrimaryQueueJob, resolvePrimaryOpsQueue } from "@/lib/ops/queue-membership";
import {
  type OpsBoardSortKey,
  sortOpsBoardRows,
} from "@/lib/ops/ops-board-sorting";
import {
  buildOpsWorkspaceEvidenceIndex,
  type OpsWorkspaceEvidenceIndex,
  type OpsWorkspaceJobEventEvidence,
} from "@/lib/ops/ops-workspace-evidence";
import {
  OPS_WORKSPACE_JOB_SELECT,
  type OpsWorkspaceJob,
} from "@/lib/ops/ops-workspace-job-contract";
import {
  buildLatestCustomerAttemptByJob,
  type CustomerAttemptEvent,
} from "@/lib/ops/recent-attempt-display";
import type { ScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import type { ServiceFollowUpQueueStateByJob } from "@/lib/ops/service-follow-up-queue-state";
import { loadFocusedOpsQueueRows } from "@/lib/ops/waiting-exception-loader";
import { buildOpsStatusEnteredAtByJob } from "@/lib/utils/lifecycle-aging";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

export type OpsWorkspacePreviewRow = OpsWorkspaceJob | ContractorIntakeQueueRow;

type WorkspaceContractor = {
  id: string;
  name: string | null;
};

type PreviewEnrichmentReadModelInput = {
  jobEvents?: readonly unknown[];
  contractorReportEvents?: readonly unknown[];
  failedRuns?: readonly unknown[];
  customerAttemptEvents?: readonly CustomerAttemptEvent[];
};

export type OpsWorkspacePreviewEnrichmentReadModels = {
  opsStatusEnteredAtByJob: Map<string, Record<string, string>>;
  workspaceEvidence: OpsWorkspaceEvidenceIndex;
  latestCustomerAttemptByJob: Map<string, string>;
};

export type OpsWorkspacePreviewEnrichment = OpsWorkspacePreviewEnrichmentReadModels & {
  assignmentDisplayMap: Awaited<ReturnType<typeof getActiveJobAssignmentDisplayMap>>;
  closeoutProjectionByJob: Map<string, BillingTruthCloseoutProjection>;
  operationalTenantIdentity: OperationalTenantIdentity;
  workspaceContractors: WorkspaceContractor[];
};

function normalizedJobId(row: { id?: unknown }) {
  return String(row.id ?? "").trim();
}

export function buildCloseoutProjectionInputs(
  rows: readonly OpsWorkspaceJob[],
): BillingTruthProjectionJobInput[] {
  return rows.map((job) => ({
    id: normalizedJobId(job),
    field_complete: job.field_complete,
    job_type: job.job_type,
    ops_status: job.ops_status,
    pending_info_reason: job.pending_info_reason,
    on_hold_reason: job.on_hold_reason,
    permit_number: job.permit_number,
    invoice_complete: job.invoice_complete,
    billing_disposition: job.billing_disposition,
    certs_complete: job.certs_complete,
  }));
}

export function buildOpsWorkspacePreviewEnrichmentReadModels(
  input: PreviewEnrichmentReadModelInput,
): OpsWorkspacePreviewEnrichmentReadModels {
  const jobEvents = input.jobEvents ?? [];
  const opsUpdateEvents = jobEvents.filter((event): event is OpsWorkspaceJobEventEvidence => {
    if (event === null || typeof event !== "object") return false;
    return String((event as OpsWorkspaceJobEventEvidence).event_type ?? "") === "ops_update";
  });

  return {
    opsStatusEnteredAtByJob: buildOpsStatusEnteredAtByJob(opsUpdateEvents),
    workspaceEvidence: buildOpsWorkspaceEvidenceIndex({
      jobEvents,
      contractorReportEvents: input.contractorReportEvents,
      failedRuns: input.failedRuns,
    }),
    latestCustomerAttemptByJob: buildLatestCustomerAttemptByJob([
      ...(input.customerAttemptEvents ?? []),
    ]),
  };
}

export function createOpsWorkspacePreviewLoader(context: {
  supabase: ServerSupabaseClient;
  admin: AdminSupabaseClient;
  accountOwnerUserId: string;
  boardSort: OpsBoardSortKey;
  closeoutQueueRows?: readonly OpsWorkspaceJob[];
  contractorIntakeQueueAvailable: boolean;
  retestContinuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
  scheduledWithoutTechSnapshot: ScheduledWithoutTechSnapshot;
  startTodayUtc: string;
  startTomorrowUtc: string;
}) {
  async function loadWithoutTechPreviewRows(): Promise<OpsWorkspaceJob[]> {
    const previewIds = context.scheduledWithoutTechSnapshot.preview
      .map(normalizedJobId)
      .filter(Boolean);

    if (previewIds.length === 0) return [];

    const previewResult = await context.supabase
      .from("jobs")
      .select(OPS_WORKSPACE_JOB_SELECT)
      .in("id", previewIds)
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (previewResult.error) throw previewResult.error;

    const rowsById = new Map(
      ((previewResult.data ?? []) as OpsWorkspaceJob[]).map((row) => [normalizedJobId(row), row]),
    );

    return previewIds.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [row] : [];
    });
  }

  async function loadCloseoutWorkspaceRows(): Promise<OpsWorkspaceJob[]> {
    let queueRows: OpsWorkspaceJob[];
    if (context.closeoutQueueRows) {
      // The overview already loaded and canonically projected the full closeout
      // set for counts and facets. Reuse it so cards cannot drift from either.
      queueRows = [...context.closeoutQueueRows];
    } else {
      // Invoice-needed closeout is status-invariant. Failed/on-hold/pending status
      // may add exception routing, but must not suppress closeout invoice reminder.
      const closeoutRowsResult = await context.supabase
        .from("jobs")
        .select(OPS_WORKSPACE_JOB_SELECT)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        // Closed jobs can never pass isInCloseoutQueue because the canonical
        // projection copies ops_status verbatim. This bounds active history only.
        .neq("ops_status", "closed")
        .eq("field_complete", true)
        .order("created_at", { ascending: true });

      if (closeoutRowsResult.error) throw closeoutRowsResult.error;

      const sourceRows = (closeoutRowsResult.data ?? []) as OpsWorkspaceJob[];
      const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
        supabase: context.supabase,
        accountOwnerUserId: context.accountOwnerUserId,
        jobs: buildCloseoutProjectionInputs(sourceRows),
      });
      queueRows = listCloseoutQueueJobs(
        sourceRows,
        (job) => projectionsByJobId.get(normalizedJobId(job)) ?? job,
      );
    }
    const jobIds = queueRows.map(normalizedJobId).filter(Boolean);
    const statusEventsResult = jobIds.length
      ? await context.supabase
          .from("job_events")
          .select("job_id, created_at, meta")
          .in("job_id", jobIds)
          .eq("event_type", "ops_update")
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (statusEventsResult.error) throw statusEventsResult.error;
    const enteredAtByJob = buildOpsStatusEnteredAtByJob(statusEventsResult.data ?? []);

    return sortOpsBoardRows(queueRows, context.boardSort, {
      queueEnteredAt: (job) => {
        const jobId = normalizedJobId(job);
        const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
        return (
          String(job.field_complete_at ?? "").trim()
          || enteredAtByJob.get(jobId)?.[opsStatus]
          || String(job.created_at ?? "").trim()
          || null
        );
      },
    });
  }

  return async function loadWorkspacePreviewRows(
    workspaceKey: string,
  ): Promise<OpsWorkspacePreviewRow[]> {
    if (workspaceKey === "without_tech") return loadWithoutTechPreviewRows();
    if (workspaceKey === "closeout") return loadCloseoutWorkspaceRows();

    if (workspaceKey === "contractor_intake") {
      if (!context.contractorIntakeQueueAvailable) return [];
      return listPendingContractorIntakeQueueRows({
        supabase: context.admin,
        accountOwnerUserId: context.accountOwnerUserId,
        limit: CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT,
      });
    }

    if (workspaceKey === "waiting" || workspaceKey === "exceptions") {
      return loadFocusedOpsQueueRows({
        supabase: context.supabase,
        queueKey: workspaceKey,
        continuationParentIds: context.retestContinuationParentIds,
        serviceFollowUpByJob: context.serviceFollowUpByJob,
        sortKey: context.boardSort,
      });
    }

    if (!["need_to_schedule", "field_work", "follow_ups"].includes(workspaceKey)) {
      return [];
    }

    let queueQuery = context.supabase
      .from("jobs")
      .select(OPS_WORKSPACE_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });

    if (workspaceKey === "need_to_schedule") {
      queueQuery = queueQuery
        .eq("status", "open")
        .eq("ops_status", "need_to_schedule")
        .is("follow_up_date", null)
        .is("next_action_note", null)
        .is("action_required_by", null);
    } else if (workspaceKey === "field_work") {
      queueQuery = queueQuery
        .in("status", ["open", "on_the_way", "in_process", "in_progress"])
        .neq("ops_status", "closed")
        .eq("field_complete", false)
        .is("follow_up_date", null)
        .is("next_action_note", null)
        .is("action_required_by", null)
        .gte("scheduled_date", context.startTodayUtc)
        .lt("scheduled_date", context.startTomorrowUtc)
        .order("window_start", { ascending: true });
    } else {
      queueQuery = queueQuery
        .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null")
        .order("follow_up_date", { ascending: true, nullsFirst: false });
    }

    const queueResult = await queueQuery;
    if (queueResult.error) throw queueResult.error;

    let queueRows = (queueResult.data ?? []) as OpsWorkspaceJob[];
    if (workspaceKey === "field_work") {
      const jobIds = queueRows.map(normalizedJobId).filter(Boolean);
      const assignmentMap = jobIds.length
        ? await getActiveJobAssignmentDisplayMap({
            supabase: context.supabase,
            jobIds,
          })
        : {};
      queueRows = queueRows.filter((row) => {
        const jobId = normalizedJobId(row);
        return (
          resolvePrimaryOpsQueue(row) === null
          && Array.isArray(assignmentMap[jobId])
          && assignmentMap[jobId].length > 0
        );
      });
    }

    const currentRows = workspaceKey === "follow_ups"
      ? queueRows.filter((row) => isPrimaryQueueJob(row, "follow_ups"))
      : queueRows;
    return sortOpsBoardRows(currentRows, context.boardSort);
  };
}

export async function loadOpsWorkspacePreviewEnrichment(params: {
  supabase: ServerSupabaseClient;
  accountOwnerUserId: string;
  closeoutProjectionByJob?: ReadonlyMap<string, BillingTruthCloseoutProjection>;
  selectedWorkspaceKey: string;
  selectedPreviewRows: OpsWorkspaceJob[];
  operationalTenantIdentityPromise: Promise<OperationalTenantIdentity>;
}): Promise<OpsWorkspacePreviewEnrichment> {
  const jobIds = params.selectedPreviewRows.map(normalizedJobId).filter(Boolean);
  const hasJobs = jobIds.length > 0;
  const emptyResult = { data: [], error: null };

  const [
    assignmentDisplayMap,
    failedRunsResult,
    customerAttemptEventsResult,
    contractorReportEventsResult,
    jobEventsResult,
    closeoutProjection,
    operationalTenantIdentity,
    workspaceContractorsResult,
  ] = await Promise.all([
    hasJobs
      ? getActiveJobAssignmentDisplayMap({ supabase: params.supabase, jobIds })
      : Promise.resolve({}),
    hasJobs
      ? params.supabase
          .from("ecc_test_runs")
          .select("job_id, test_type, computed, computed_pass, override_pass, is_completed, created_at")
          .in("job_id", jobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
      : Promise.resolve(emptyResult),
    hasJobs
      ? params.supabase
          .from("job_events")
          .select("job_id, created_at")
          .in("job_id", jobIds)
          .eq("event_type", "customer_attempt")
          .order("created_at", { ascending: false })
      : Promise.resolve(emptyResult),
    hasJobs
      ? params.supabase
          .from("job_events")
          .select("job_id, event_type, created_at, meta")
          .in("job_id", jobIds)
          .eq("event_type", "contractor_report_sent")
          .order("created_at", { ascending: false })
      : Promise.resolve(emptyResult),
    hasJobs
      ? params.supabase
          .from("job_events")
          .select("job_id, event_type, created_at, message, meta")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve(emptyResult),
    params.selectedWorkspaceKey === "closeout" && hasJobs && !params.closeoutProjectionByJob
      ? buildBillingTruthCloseoutProjectionMap({
          supabase: params.supabase,
          accountOwnerUserId: params.accountOwnerUserId,
          jobs: buildCloseoutProjectionInputs(params.selectedPreviewRows),
        })
      : Promise.resolve(null),
    params.operationalTenantIdentityPromise,
    params.supabase
      .from("contractors")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true }),
  ]);

  if (failedRunsResult.error) throw failedRunsResult.error;
  if (customerAttemptEventsResult.error) throw customerAttemptEventsResult.error;
  if (contractorReportEventsResult.error) throw contractorReportEventsResult.error;
  if (jobEventsResult.error) throw jobEventsResult.error;
  if (workspaceContractorsResult.error) throw workspaceContractorsResult.error;

  const readModels = buildOpsWorkspacePreviewEnrichmentReadModels({
    jobEvents: jobEventsResult.data ?? [],
    contractorReportEvents: contractorReportEventsResult.data ?? [],
    failedRuns: failedRunsResult.data ?? [],
    customerAttemptEvents: (customerAttemptEventsResult.data ?? []) as CustomerAttemptEvent[],
  });

  return {
    ...readModels,
    assignmentDisplayMap,
    closeoutProjectionByJob:
      params.selectedWorkspaceKey === "closeout" && params.closeoutProjectionByJob
        ? new Map(params.closeoutProjectionByJob)
        : closeoutProjection?.projectionsByJobId ?? new Map(),
    operationalTenantIdentity,
    workspaceContractors: (workspaceContractorsResult.data ?? []) as WorkspaceContractor[],
  };
}
