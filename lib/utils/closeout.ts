export type CloseoutProjectionInput = {
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  invoice_complete?: boolean | null;
  invoice_number?: string | null;
  certs_complete?: boolean | null;
};

export function getCloseoutNeeds(job: CloseoutProjectionInput) {
  const jobType = String(job.job_type ?? "").toLowerCase();
  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  const isService = jobType === "service";
  const isEcc = jobType === "ecc";
  const isFailureFlow = isEcc && (opsStatus === "failed" || opsStatus === "retest_needed");
  const needsInvoice = !Boolean(job.invoice_complete) && !Boolean(job.invoice_number);
  const needsCerts = isEcc && !isFailureFlow && !Boolean(job.certs_complete);

  return {
    needsInvoice,
    needsCerts,
    isService,
    isEcc,
    isFailureFlow,
  };
}

export function isInCloseoutQueue(job: CloseoutProjectionInput) {
  if (!job.field_complete) return false;

  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  if (opsStatus === "closed") return false;

  const needs = getCloseoutNeeds(job);
  if (needs.isFailureFlow) return false;

  return needs.needsInvoice || needs.needsCerts;
}
