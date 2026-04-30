import { loadScopedInternalServiceCaseForMutation } from "@/lib/auth/internal-job-scope";
import { isActiveLinkedJob } from "@/lib/reports/service-case-continuity";

type LinkedServiceJobRow = {
  id: string;
  customer_id: string | null;
  status: string | null;
  ops_status: string | null;
  created_at: string | null;
  field_complete_at: string | null;
};

function parseTimeMs(value: string | null | undefined) {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function pickResolvedByJobId(params: {
  linkedJobs: LinkedServiceJobRow[];
  triggerJobId?: string | null;
}) {
  const triggerJobId = String(params.triggerJobId ?? "").trim();
  const linkedJobs = params.linkedJobs;

  if (triggerJobId && linkedJobs.some((job) => job.id === triggerJobId)) {
    return triggerJobId;
  }

  const terminalJobs = linkedJobs.filter((job) => !isActiveLinkedJob(job));
  if (terminalJobs.length === 0) return null;

  terminalJobs.sort((left, right) => {
    const leftTs = Math.max(parseTimeMs(left.field_complete_at), parseTimeMs(left.created_at));
    const rightTs = Math.max(parseTimeMs(right.field_complete_at), parseTimeMs(right.created_at));
    return rightTs - leftTs;
  });

  return terminalJobs[0]?.id ?? null;
}

export async function reconcileServiceCaseStatusAfterJobChange(params: {
  supabase: any;
  accountOwnerUserId: string;
  serviceCaseId?: string | null;
  triggerJobId?: string | null;
  resolutionSummary?: string | null;
  source?: string | null;
}) {
  const serviceCaseId = String(params.serviceCaseId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!serviceCaseId || !accountOwnerUserId) return;

  const scopedServiceCase = await loadScopedInternalServiceCaseForMutation({
    accountOwnerUserId,
    serviceCaseId,
    select: "status, resolved_at, resolved_by_job_id",
    admin: params.supabase,
  });

  if (!scopedServiceCase?.id) return;

  const scopedCustomerId = String((scopedServiceCase as any).customer_id ?? "").trim();

  const { data: linkedRows, error: linkedRowsErr } = await params.supabase
    .from("jobs")
    .select("id, customer_id, status, ops_status, created_at, field_complete_at")
    .eq("service_case_id", serviceCaseId)
    .is("deleted_at", null);

  if (linkedRowsErr) throw linkedRowsErr;

  const linkedJobs: LinkedServiceJobRow[] = (linkedRows ?? [])
    .map((row: any) => ({
      id: String(row?.id ?? "").trim(),
      customer_id: row?.customer_id ? String(row.customer_id) : null,
      status: row?.status ? String(row.status) : null,
      ops_status: row?.ops_status ? String(row.ops_status) : null,
      created_at: row?.created_at ? String(row.created_at) : null,
      field_complete_at: row?.field_complete_at ? String(row.field_complete_at) : null,
    }))
    .filter(
      (job: LinkedServiceJobRow) =>
        job.id && (!scopedCustomerId || String(job.customer_id ?? "").trim() === scopedCustomerId),
    );

  const activeLinkedJobs = linkedJobs.filter((job: LinkedServiceJobRow) => isActiveLinkedJob(job));
  const currentStatus = String((scopedServiceCase as any).status ?? "").trim().toLowerCase();

  if (activeLinkedJobs.length > 0) {
    if (currentStatus === "resolved") {
      const { error: reopenErr } = await params.supabase
        .from("service_cases")
        .update({
          status: "open",
          resolved_at: null,
          resolved_by_job_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", serviceCaseId);

      if (reopenErr) throw reopenErr;
    }
    return;
  }

  const resolvedByJobId = pickResolvedByJobId({
    linkedJobs,
    triggerJobId: params.triggerJobId,
  });

  const updatePayload: Record<string, unknown> = {
    status: "resolved",
    updated_at: new Date().toISOString(),
  };

  if (!(scopedServiceCase as any).resolved_at) {
    updatePayload.resolved_at = new Date().toISOString();
  }

  if (resolvedByJobId) {
    updatePayload.resolved_by_job_id = resolvedByJobId;
  }

  const resolutionSummary = String(params.resolutionSummary ?? "").trim();
  if (resolutionSummary) {
    updatePayload.resolution_summary = resolutionSummary;
  }

  const { error: resolveErr } = await params.supabase
    .from("service_cases")
    .update(updatePayload)
    .eq("id", serviceCaseId);

  if (resolveErr) {
    // If resolution_summary is not supported in this environment, retry safely without it.
    if (Object.prototype.hasOwnProperty.call(updatePayload, "resolution_summary")) {
      delete updatePayload.resolution_summary;
      const { error: retryErr } = await params.supabase
        .from("service_cases")
        .update(updatePayload)
        .eq("id", serviceCaseId);
      if (retryErr) throw retryErr;
      return;
    }
    throw resolveErr;
  }
}
