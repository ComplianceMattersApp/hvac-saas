import { isInCloseoutQueue } from "@/lib/utils/closeout";
import type { JobBillingStateReadModel } from "@/lib/business/job-billing-state";

type CloseoutQueueJob = {
  id?: string | null;
  created_at?: string | null;
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

export type CloseoutQueueSort = "newest" | "oldest" | "contractor";

function parseSortTimestamp(value?: string | null) {
  const timestamp = Date.parse(String(value ?? "").trim());
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeContractorName(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function listCloseoutQueueJobs<T extends CloseoutQueueJob>(
  jobs: T[],
  getProjection: (job: T) => CloseoutQueueJob,
): T[] {
  return (jobs ?? []).filter((job) => isInCloseoutQueue(getProjection(job)));
}

export function sortCloseoutQueueJobs<T>(
  jobs: T[],
  sort: CloseoutQueueSort,
  getContractorName: (job: T) => string | null | undefined,
  getCreatedAt: (job: T) => string | null | undefined,
  getId: (job: T) => string | null | undefined,
): T[] {
  const rows = [...(jobs ?? [])];

  return rows.sort((left, right) => {
    if (sort === "contractor") {
      const leftName = normalizeContractorName(getContractorName(left));
      const rightName = normalizeContractorName(getContractorName(right));
      const leftHasName = Boolean(leftName);
      const rightHasName = Boolean(rightName);

      if (leftHasName !== rightHasName) return leftHasName ? -1 : 1;

      if (leftHasName && rightHasName) {
        const nameComparison = leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
        if (nameComparison !== 0) return nameComparison;
      }
    }

    const leftTime = parseSortTimestamp(getCreatedAt(left));
    const rightTime = parseSortTimestamp(getCreatedAt(right));

    if (leftTime != null && rightTime != null && leftTime !== rightTime) {
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    }

    if (leftTime != null && rightTime == null) return sort === "oldest" ? -1 : 1;
    if (leftTime == null && rightTime != null) return sort === "oldest" ? 1 : -1;

    return String(getId(left) ?? "").localeCompare(String(getId(right) ?? ""), undefined, { sensitivity: "base" });
  });
}

export function canShowExternalInvoiceSentAction(input: {
  needsInvoice: boolean;
  billingState?: Pick<JobBillingStateReadModel, "lightweightBillingAllowed" | "usesInternalInvoicing" | "jobInvoiceCompleteProjection"> | null;
}) {
  if (!input.needsInvoice) return false;
  if (!input.billingState) return false;
  if (input.billingState.usesInternalInvoicing) return false;
  if (!input.billingState.lightweightBillingAllowed) return false;
  if (input.billingState.jobInvoiceCompleteProjection) return false;
  return true;
}
