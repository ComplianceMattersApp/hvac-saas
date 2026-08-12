import { isCloseoutBlockingQueueStatus } from "@/lib/ops/queue-status-contracts";
import { isValidEccPermitNumber } from "@/lib/ecc/permit-needed";

export type CloseoutProjectionInput = {
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  permit_number?: string | null;
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
  const isPermitBlockingCerts = isEcc && !isValidEccPermitNumber(job.permit_number);
  const needsPermit = isPermitBlockingCerts && !isFailureFlow;
  // Use lifecycle completion booleans as source-of-truth for closeout queue projection.
  const needsInvoice = !Boolean(job.invoice_complete);
  const needsCerts = isEcc && !isFailureFlow && !isPermitBlockingCerts && !Boolean(job.certs_complete);

  return {
    needsInvoice,
    needsCerts,
    needsPermit,
    isPermitBlockingCerts,
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
  const needs = getCloseoutNeeds(job);
  // SQL prefilters (.neq ops_status closed) in app/ops/page.tsx and
  // lib/ops/ops-queue-export.ts rely on this exclusion being unconditional.
  // If closed jobs ever become queue-eligible, update those reads too.
  if (opsStatus === "closed") return false;

  // Billing is an independent obligation. A completed job may therefore be in
  // Closeout at the same time as its one primary action queue (Waiting,
  // Exceptions, or Follow Ups). Paying/issuing the invoice removes only this
  // Closeout membership; it must not resolve the primary responsibility.
  if (needs.needsInvoice) return true;

  if (needs.isBlockedForCloseout) {
    const isAutomaticPermitWait =
      opsStatus === "pending_info" &&
      needs.needsPermit &&
      isPermitMissingCloseoutReason(job);
    if (!isAutomaticPermitWait) return false;
  }

  // The Closeout queue contains work that can be completed now. A missing permit
  // remains a job-detail blocker, but by itself belongs in Waiting / Pending Info.
  const hasCloseoutWork = needs.needsCerts;
  if (!hasCloseoutWork) return false;

  if (opsStatus === "invoice_required" || opsStatus === "paperwork_required") return true;

  return needs.isBlockedForCloseout && isPermitMissingCloseoutReason(job);
}

export function getCloseoutQueueNextStepLabel(job: CloseoutProjectionInput) {
  const needs = getCloseoutNeeds(job);

  if (needs.needsPermit) return "Add permit number";
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

  if (needs.needsPermit) {
    return "Add the permit number before sending certs and closing this job.";
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

  // Nothing is outstanding at this point. If the job is already closed, saying it
  // is "ready for closeout" describes work that has in fact been done — the
  // specific ECC/billing messages above still win, this only replaces the generic
  // service fallback.
  // Deliberately says the *work* is complete, not the money. Whether payment is
  // still outstanding is reported by the lifecycle ribbon and the billing card,
  // which have the invoice balance; this projection only sees closeout state.
  if (String(job.ops_status ?? "").toLowerCase() === "closed") {
    return "Job closed. Field and admin work complete.";
  }

  return "Field work complete - ready for closeout.";
}
