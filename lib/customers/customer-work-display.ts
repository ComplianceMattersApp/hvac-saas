import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";

export type CustomerWorkJobLike = {
  status?: string | null;
  ops_status?: string | null;
  deleted_at?: string | null;
  scheduled_date?: string | null;
  created_at?: string | null;
  city?: string | null;
  job_address?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
};

export type CustomerWorkCaseRollupState = "open" | "closed" | "cancelled" | "needs_review";

export function normalizeCustomerWorkStatus(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function isCustomerWorkJobActive(job: CustomerWorkJobLike) {
  if (job.deleted_at) return false;

  const lifecycle = normalizeCustomerWorkStatus(job.status);
  if (["cancelled", "completed", "closed"].includes(lifecycle)) return false;

  const ops = normalizeCustomerWorkStatus(job.ops_status);
  return !["closed", "closed_out", "paperwork_required", "invoice_required"].includes(ops);
}

export function isCustomerWorkJobNeedsReview(job: CustomerWorkJobLike) {
  const ops = normalizeCustomerWorkStatus(job.ops_status);
  return ["failed", "retest_needed", "pending_office_review", "pending_info", "on_hold"].includes(ops);
}

export function deriveCustomerWorkCaseRollup(jobs: CustomerWorkJobLike[]): {
  state: CustomerWorkCaseRollupState;
  label: "Open" | "Closed" | "Cancelled" | "Needs Review";
} {
  const visibleJobs = jobs.filter((job) => !job.deleted_at);
  if (visibleJobs.length === 0) return { state: "closed", label: "Closed" };

  if (visibleJobs.some(isCustomerWorkJobActive)) {
    return visibleJobs.some(isCustomerWorkJobNeedsReview)
      ? { state: "needs_review", label: "Needs Review" }
      : { state: "open", label: "Open" };
  }

  if (visibleJobs.every((job) => normalizeCustomerWorkStatus(job.status) === "cancelled")) {
    return { state: "cancelled", label: "Cancelled" };
  }

  const latest = [...visibleJobs].sort(compareCustomerWorkJobsLatestFirst)[0];
  if (latest && normalizeCustomerWorkStatus(latest.status) === "cancelled") {
    return { state: "cancelled", label: "Cancelled" };
  }

  return { state: "closed", label: "Closed" };
}

export function compareCustomerWorkJobsLatestFirst(a: CustomerWorkJobLike, b: CustomerWorkJobLike) {
  return jobWorkTimestamp(b) - jobWorkTimestamp(a);
}

export function formatCustomerWorkCity(value?: string | null) {
  return formatCityNamePart(value);
}

export function formatCustomerWorkPersonName(value?: string | null) {
  return formatPersonNamePart(value);
}

export function formatCustomerWorkAddress(job: Pick<CustomerWorkJobLike, "job_address" | "city">) {
  const street = String(job.job_address ?? "").trim();
  const city = formatCustomerWorkCity(job.city);
  return [street, city].filter(Boolean).join(", ");
}

export function formatCustomerWorkFailureReason(job: CustomerWorkJobLike) {
  const ops = normalizeCustomerWorkStatus(job.ops_status);
  if (!["failed", "retest_needed", "pending_office_review"].includes(ops)) return null;

  const specific = [
    job.service_visit_outcome,
    job.service_visit_reason,
    job.pending_info_reason,
    job.on_hold_reason,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  if (!specific) return ops === "pending_office_review" ? "Correction Required" : "Failed";
  return `Failed: ${specific.replace(/_/g, " ").replace(/\s+/g, " ")}`;
}

function jobWorkTimestamp(job: CustomerWorkJobLike) {
  const raw = String(job.scheduled_date ?? job.created_at ?? "").trim();
  if (!raw) return 0;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
