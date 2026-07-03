import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import {
  formatAssignmentSummaryForJob,
  formatFailedEccQueueReasonFromRun,
  getOpsQueueCardStatusReason,
} from "@/lib/ops/focused-queues";
import { getOpsBoardVisibleReason, normalizeOpsBoardReason, filterOpsBoardRowsByReason } from "@/lib/ops/ops-board-reasons";
import { normalizeOpsBoardSort, sortOpsBoardRows, type OpsBoardSortKey } from "@/lib/ops/ops-board-sorting";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { formatBusinessDateUS, displayWindowLA, startOfTodayUtcIsoLA, startOfTomorrowUtcIsoLA } from "@/lib/utils/schedule-la";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { resolveLifecycleDaysAgingLabel } from "@/lib/utils/lifecycle-aging";
import { getCloseoutNeeds } from "@/lib/utils/closeout";

export type OpsExportMode = "internal" | "contractor_safe";
export type OpsExportQueueKey =
  | "need_to_schedule"
  | "field_work"
  | "without_tech"
  | "waiting"
  | "exceptions"
  | "closeout";

export const CONTRACTOR_SAFE_REQUIRED_MESSAGE = "Select a contractor before exporting contractor-safe CSV.";

const EXPORT_LIMIT = 1000;
const WORKSPACE_SELECT =
  "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, pending_info_reason, on_hold_reason, permit_number, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";

const QUEUE_LABELS: Record<OpsExportQueueKey, string> = {
  need_to_schedule: "Needs Scheduling",
  field_work: "Field Work",
  without_tech: "Without Tech",
  waiting: "Waiting / Pending Info",
  exceptions: "Exceptions",
  closeout: "Closeout & Review",
};

type ExportJob = Record<string, any>;

const INTERNAL_WORK_CONTRACTOR_FOCUS_ID = "__internal_work";

function normalizeContractorExportIds(value: unknown) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function applyContractorExportScope(query: any, contractorId: string | null) {
  const contractorIds = normalizeContractorExportIds(contractorId);
  if (contractorIds.length === 0) return query;
  const includesInternalWork = contractorIds.includes(INTERNAL_WORK_CONTRACTOR_FOCUS_ID);
  const realContractorIds = contractorIds.filter((id) => id !== INTERNAL_WORK_CONTRACTOR_FOCUS_ID);

  if (includesInternalWork && realContractorIds.length === 0) return query.is("contractor_id", null);
  if (!includesInternalWork && realContractorIds.length === 1) return query.eq("contractor_id", realContractorIds[0]);
  if (!includesInternalWork) return query.in("contractor_id", realContractorIds);
  return query.or(`contractor_id.is.null,contractor_id.in.(${realContractorIds.join(",")})`);
}

export function normalizeOpsExportMode(value: unknown): OpsExportMode {
  return String(value ?? "").trim().toLowerCase() === "contractor_safe" ? "contractor_safe" : "internal";
}

export function normalizeOpsExportQueue(value: unknown, fallbackBucket?: unknown): OpsExportQueueKey {
  const normalized = String(value ?? fallbackBucket ?? "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "need_to_schedule") return "need_to_schedule";
  if (normalized === "field_work" || normalized === "scheduled") return "field_work";
  if (normalized === "without_tech") return "without_tech";
  if (normalized === "waiting") return "waiting";
  if (normalized === "exceptions") return "exceptions";
  if (normalized === "closeout") return "closeout";
  return "need_to_schedule";
}

export function opsExportQueueLabel(queueKey: OpsExportQueueKey): string {
  return QUEUE_LABELS[queueKey] ?? queueKey;
}

export function buildOpsQueueCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ].join("\r\n");
}

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function contractorName(job: ExportJob): string {
  const contractor = Array.isArray(job?.contractors) ? job.contractors[0] : job?.contractors;
  return String(contractor?.name ?? "").trim();
}

function customerName(job: ExportJob): string {
  return [formatPersonNamePart(job?.customer_first_name), formatPersonNamePart(job?.customer_last_name)]
    .filter(Boolean)
    .join(" ");
}

function fallbackJobReference(job: ExportJob): string {
  return String(job?.title ?? "").trim() || `Job ${String(job?.id ?? "").slice(0, 8)}`;
}

function closeoutFlags(job: ExportJob): string {
  const needs = getCloseoutNeeds(job);
  const flags = [];
  if (needs.needsInvoice) flags.push("Needs invoice");
  if (needs.needsCerts) flags.push("Needs certs");
  if (needs.isPermitBlockingCerts) flags.push("Permit blocking certs");
  return flags.join("; ");
}

function latestFailedRunByJob(runs: ExportJob[]) {
  const map = new Map<string, ExportJob>();
  for (const run of runs ?? []) {
    const jobId = String(run?.job_id ?? "").trim();
    if (!jobId) continue;
    const current = map.get(jobId);
    const currentMs = current ? new Date(String(current.created_at ?? "")).getTime() : 0;
    const nextMs = new Date(String(run.created_at ?? "")).getTime();
    if (!current || (Number.isFinite(nextMs) && nextMs > currentMs)) map.set(jobId, run);
  }
  return map;
}

function primaryFailureReasonByJob(runs: ExportJob[]) {
  const map = new Map<string, string>();
  for (const [jobId, run] of latestFailedRunByJob(runs).entries()) {
    const primaryLine = extractFailureReasons(run)[0] ?? "";
    const formatted = formatFailedEccQueueReasonFromRun(run) || (primaryLine ? "Correction Required" : "");
    if (formatted) map.set(jobId, formatted);
  }
  return map;
}

function visibleReasonForJob(job: ExportJob, queueKey: OpsExportQueueKey, failureByJob: Map<string, string>) {
  const jobId = String(job?.id ?? "").trim();
  const failureDetail = jobId ? failureByJob.get(jobId) ?? null : null;
  const reasonInput = { ...job, ops_board_failure_detail: failureDetail };
  const fallback = () => {
    const lifecycle = String(job?.status ?? "").toLowerCase();
    if (queueKey === "need_to_schedule") return "Awaiting scheduling";
    if (queueKey === "field_work") {
      if (lifecycle === "on_the_way") return "On the way";
      if (lifecycle === "in_progress") return "In progress";
      return "Scheduled field work";
    }
    if (queueKey === "without_tech") return "Scheduled without active tech assignment";
    if (failureDetail) return failureDetail;
    return getOpsQueueCardStatusReason(job);
  };
  return getOpsBoardVisibleReason(reasonInput, fallback, { queueKey });
}

function closeoutProjectionInputs(rows: ExportJob[]) {
  return (rows ?? []).map((job) => ({
    id: String(job?.id ?? "").trim(),
    field_complete: job?.field_complete,
    job_type: job?.job_type,
    ops_status: job?.ops_status,
    pending_info_reason: job?.pending_info_reason,
    on_hold_reason: job?.on_hold_reason,
    permit_number: job?.permit_number,
    invoice_complete: job?.invoice_complete,
    billing_disposition: job?.billing_disposition,
    certs_complete: job?.certs_complete,
  }));
}

async function loadCloseoutRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  contractorId: string | null;
  sort: OpsBoardSortKey;
}) {
  // Invoice-needed closeout is status-invariant. Failed/on-hold/pending status
  // may add exception routing, but must not suppress closeout invoice reminder.
  let query = params.supabase
    .from("jobs")
    .select(WORKSPACE_SELECT)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("field_complete", true)
    .order("created_at", { ascending: true })
    .limit(EXPORT_LIMIT);
  query = applyContractorExportScope(query, params.contractorId);

  const { data, error } = await query;
  if (error) throw error;

  const sourceRows = data ?? [];
  const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
    jobs: closeoutProjectionInputs(sourceRows),
  });
  return sortOpsBoardRows(
    listCloseoutQueueJobs(sourceRows, (job: ExportJob) => projectionsByJobId.get(String(job?.id ?? "").trim()) ?? job),
    params.sort,
  );
}

async function loadJobRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  queueKey: OpsExportQueueKey;
  contractorId: string | null;
  sort: OpsBoardSortKey;
}) {
  if (params.queueKey === "closeout") return loadCloseoutRows(params);

  const today = startOfTodayUtcIsoLA();
  const tomorrow = startOfTomorrowUtcIsoLA();
  let q = params.supabase
    .from("jobs")
    .select(WORKSPACE_SELECT)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(EXPORT_LIMIT);

  if (params.queueKey === "need_to_schedule") q = q.eq("status", "open").eq("ops_status", "need_to_schedule");
  else if (params.queueKey === "field_work") {
    q = q
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .gte("scheduled_date", today)
      .lt("scheduled_date", tomorrow)
      .order("window_start", { ascending: true });
  } else if (params.queueKey === "waiting") {
    q = q.neq("ops_status", "closed").in("ops_status", ["pending_info", "on_hold", "waiting", "pending_office_review"]);
  } else if (params.queueKey === "exceptions") {
    q = q.neq("ops_status", "closed").in("ops_status", ["failed", "retest_needed", "pending_office_review", "problem"]);
  } else if (params.queueKey === "without_tech") {
    q = q.eq("status", "open").eq("ops_status", "scheduled").order("scheduled_date", { ascending: true }).order("window_start", { ascending: true });
  }

  q = applyContractorExportScope(q, params.contractorId);
  const res = await q;
  if (res.error) throw res.error;

  let rows = (res.data ?? []) as ExportJob[];
  if (params.queueKey === "without_tech") {
    const ids = rows.map((row) => String(row?.id ?? "").trim()).filter(Boolean);
    const assignmentMap = ids.length ? await getActiveJobAssignmentDisplayMap({ supabase: params.supabase, jobIds: ids }) : {};
    const snapshot = buildScheduledWithoutTechSnapshot({ jobs: rows as any[], assignmentDisplayMap: assignmentMap, previewLimit: EXPORT_LIMIT });
    const allowedIds = new Set((snapshot.preview ?? []).map((row: ExportJob) => String(row?.id ?? "").trim()));
    rows = rows.filter((row) => allowedIds.has(String(row?.id ?? "").trim()));
  }

  return sortOpsBoardRows(rows, params.sort);
}

export async function buildOpsQueueExport(params: {
  supabase: any;
  accountOwnerUserId: string;
  mode: OpsExportMode;
  queueKey: OpsExportQueueKey;
  contractorId: string | null;
  reason?: string | null;
  sort?: string | null;
}) {
  if (params.mode === "contractor_safe" && !params.contractorId) {
    return { ok: false as const, status: 400, message: CONTRACTOR_SAFE_REQUIRED_MESSAGE };
  }

  const sort = normalizeOpsBoardSort(params.sort);
  const reason = normalizeOpsBoardReason(params.reason);
  const rows = await loadJobRows({ ...params, sort });
  const filteredRows = filterOpsBoardRowsByReason(rows, reason, { queueKey: params.queueKey });
  const jobIds = filteredRows.map((job) => String(job?.id ?? "").trim()).filter(Boolean);

  const [assignmentMap, failedRunsRes] = await Promise.all([
    jobIds.length ? getActiveJobAssignmentDisplayMap({ supabase: params.supabase, jobIds }) : Promise.resolve({}),
    jobIds.length
      ? params.supabase
          .from("ecc_test_runs")
          .select("job_id, test_type, computed, computed_pass, override_pass, is_completed, created_at")
          .in("job_id", jobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (failedRunsRes.error) throw failedRunsRes.error;

  const failureByJob = primaryFailureReasonByJob(failedRunsRes.data ?? []);
  const csvRows = filteredRows.map((job) =>
    params.mode === "contractor_safe"
      ? contractorSafeCsvRow(job, params.queueKey, failureByJob)
      : internalCsvRow(job, params.queueKey, failureByJob, assignmentMap),
  );

  const headers = params.mode === "contractor_safe" ? contractorSafeHeaders() : internalHeaders();
  return {
    ok: true as const,
    csv: csvRows.length
      ? buildOpsQueueCsv(csvRows)
      : headers.map(escapeCsvCell).join(","),
    rowCount: csvRows.length,
  };
}

function contractorSafeHeaders() {
  return [
    "Queue",
    "Contractor",
    "Job Number / Job Reference",
    "Customer Name",
    "Service Address",
    "City",
    "Scheduled Date",
    "Scheduled Window",
    "Job Status",
    "Visible Reason",
    "Reason Detail",
    "Permit Number",
    "Needs Action",
  ];
}

function internalHeaders() {
  return [
    ...contractorSafeHeaders(),
    "Lifecycle Status",
    "Ops Status",
    "Assigned Team",
    "Age / Days Open",
    "Closeout Flags",
    "Internal Job Link",
  ];
}

function baseCsvRow(job: ExportJob, queueKey: OpsExportQueueKey, failureByJob: Map<string, string>) {
  const reason = visibleReasonForJob(job, queueKey, failureByJob);
  return {
    "Queue": opsExportQueueLabel(queueKey),
    "Contractor": contractorName(job),
    "Job Number / Job Reference": fallbackJobReference(job),
    "Customer Name": customerName(job),
    "Service Address": String(job?.job_address ?? "").trim(),
    "City": formatCityNamePart(job?.city),
    "Scheduled Date": formatBusinessDateUS(String(job?.scheduled_date ?? "").trim()) || "",
    "Scheduled Window": displayWindowLA(job?.window_start, job?.window_end) || "",
    "Job Status": String(job?.status ?? "").trim(),
    "Visible Reason": reason.label,
    "Reason Detail": reason.detail ?? "",
    "Permit Number": String(job?.permit_number ?? "").trim(),
    "Needs Action": reason.detail ? `${reason.label}: ${reason.detail}` : reason.label,
  };
}

function contractorSafeCsvRow(job: ExportJob, queueKey: OpsExportQueueKey, failureByJob: Map<string, string>) {
  return baseCsvRow(job, queueKey, failureByJob);
}

function internalCsvRow(
  job: ExportJob,
  queueKey: OpsExportQueueKey,
  failureByJob: Map<string, string>,
  assignmentMap: Record<string, any[]>,
) {
  const jobId = String(job?.id ?? "").trim();
  const base = baseCsvRow(job, queueKey, failureByJob);
  return {
    ...base,
    "Lifecycle Status": String(job?.status ?? "").trim(),
    "Ops Status": String(job?.ops_status ?? "").trim(),
    "Assigned Team": formatAssignmentSummaryForJob(jobId, assignmentMap),
    "Age / Days Open": resolveLifecycleDaysAgingLabel({
      status: String(job?.status ?? "").trim() || null,
      opsStatus: String(job?.ops_status ?? "").trim() || null,
      createdAt: String(job?.created_at ?? "").trim() || null,
      scheduledDate: String(job?.scheduled_date ?? "").trim() || null,
      fieldCompleteAt: String(job?.field_complete_at ?? "").trim() || null,
    }) ?? "",
    "Closeout Flags": closeoutFlags(job),
    "Internal Job Link": jobId ? `/jobs/${jobId}?tab=ops` : "",
  };
}
