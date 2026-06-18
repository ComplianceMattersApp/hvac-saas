import { isCloseoutBlockingQueueStatus } from "@/lib/ops/queue-status-contracts";

export type CloseoutProjectionInput = {
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

const ECC_FAILURE_STATUSES = new Set([
  "failed",
  "retest_needed",
  "pending_office_review",
]);

export function getCloseoutNeeds(job: CloseoutProjectionInput) {
  const jobType = String(job.job_type ?? "").toLowerCase();
  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  const isService = jobType === "service";
  const isEcc = jobType === "ecc";
  const isFailureFlow = isEcc && ECC_FAILURE_STATUSES.has(opsStatus);
  const isBlockedForCloseout = isCloseoutBlockingQueueStatus(opsStatus);
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

function isPermitMissingCloseoutReason(job: CloseoutProjectionInput): boolean {
  const text = `${job.pending_info_reason ?? ""} ${job.on_hold_reason ?? ""}`.toLowerCase();
  if (!text.includes("permit")) return false;
  return /\b(missing|needed|need|required|require|blank|number|#)\b/.test(text);
}

export function isInCloseoutQueue(job: CloseoutProjectionInput) {
  if (!job.field_complete) return false;

  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  if (opsStatus === "closed") return false;

  const needs = getCloseoutNeeds(job);
  const hasCloseoutWork = needs.needsInvoice || needs.needsCerts;
  if (!hasCloseoutWork) return false;

  if (opsStatus === "invoice_required" || opsStatus === "paperwork_required") return true;

  return needs.isBlockedForCloseout && isPermitMissingCloseoutReason(job);
}

export function getCloseoutQueueNextStepLabel(job: CloseoutProjectionInput) {
  const needs = getCloseoutNeeds(job);

  if (needs.needsInvoice && needs.needsCerts) return "Invoice and send certs";
  if (needs.needsCerts) return "Send certs";
  if (needs.needsInvoice) return "Invoice";
  return "Review closeout requirements";
}

export function getJobDetailCloseoutReadinessMessage(job: CloseoutProjectionInput) {
  const needs = getCloseoutNeeds(job);

  if (needs.isEcc && needs.isFailureFlow) {
    return needs.needsInvoice
      ? "Complete billing; job needs retest or review."
      : "Job needs retest or review before closeout.";
  }

  if (needs.isEcc && needs.needsInvoice && needs.needsCerts) {
    return "Send certs and complete billing to close this job.";
  }

  if (needs.isEcc && needs.needsInvoice) {
    return "Complete billing to close this job.";
  }

  if (needs.isEcc && needs.needsCerts) {
    return "Send certs to close this job.";
  }

  if (needs.isEcc) {
    return "Invoice and certs are complete.";
  }

  if (needs.needsInvoice) {
    return "Complete billing to close this job.";
  }

  return "Field work complete - ready for closeout.";
}
