export type CloseoutProjectionInput = {
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

const BLOCKED_CLOSEOUT_STATUSES = new Set([
  "pending_info",
  "pending_office_review",
  "failed",
  "retest_needed",
  "on_hold",
]);

export function getCloseoutNeeds(job: CloseoutProjectionInput) {
  const jobType = String(job.job_type ?? "").toLowerCase();
  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  const isService = jobType === "service";
  const isEcc = jobType === "ecc";
  const isFailureFlow =
    isEcc &&
    (opsStatus === "failed" ||
      opsStatus === "retest_needed" ||
      opsStatus === "pending_office_review");
  const isBlockedForCloseout = BLOCKED_CLOSEOUT_STATUSES.has(opsStatus);
  // Use lifecycle completion booleans as source-of-truth for closeout queue projection.
  const needsInvoice = !Boolean(job.invoice_complete);
  const needsCerts = isEcc && !isFailureFlow && !Boolean(job.certs_complete);

  return {
    needsInvoice,
    needsCerts,
    isService,
    isEcc,
    isFailureFlow,
    isBlockedForCloseout,
  };
}

export function isInCloseoutQueue(job: CloseoutProjectionInput) {
  if (!job.field_complete) return false;

  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  if (opsStatus === "closed") return false;

  const needs = getCloseoutNeeds(job);
  if (needs.isBlockedForCloseout) return false;

  return needs.needsInvoice || needs.needsCerts;
}
