//lib utils ops-status

export type ResolveOpsStatusInput = {
  status: string | null;
  job_type: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  field_complete?: boolean | null;
  certs_complete?: boolean | null;
  invoice_complete?: boolean | null;
  current_ops_status?: string | null;
};

export function resolveOpsStatus(job: ResolveOpsStatusInput): string {
  const status = (job.status ?? "").toLowerCase();
  const jobType = (job.job_type ?? "").toLowerCase();
  const currentOps = (job.current_ops_status ?? "").toLowerCase();

  const isScheduled =
    !!job.scheduled_date || !!job.window_start || !!job.window_end;

  const fieldComplete = !!job.field_complete || status === "completed";
  const certsComplete = !!job.certs_complete;
  const invoiceComplete = !!job.invoice_complete;

  // Pre-field workflow
  if (!fieldComplete) {
    return isScheduled ? "scheduled" : "need_to_schedule";
  }

  // Preserve unresolved ECC failure states.
  // Failed originals and retest-needed jobs should not be auto-resolved
  // by generic closeout actions.
  if (
    jobType === "ecc" &&
    (currentOps === "failed" ||
      currentOps === "retest_needed" ||
      currentOps === "pending_office_review")
  ) {
    return currentOps;
  }

  // Post-field / closeout workflow
  if (jobType === "ecc") {
    if (!certsComplete) return "paperwork_required";
    if (!invoiceComplete) return "invoice_required";
    return "closed";
  }

  if (jobType === "service") {
    if (!invoiceComplete) return "invoice_required";
    return "closed";
  }

  // Fallback
  return job.current_ops_status ?? "need_to_schedule";
}

export type PendingInfoSignalInput = {
  ops_status?: string | null;
  pending_info_reason?: string | null;
  follow_up_date?: string | null;
  next_action_note?: string | null;
  action_required_by?: string | null;
};

function hasSignalValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getPendingInfoSignal(input: PendingInfoSignalInput): boolean {
  const legacyPendingInfo =
    String(input.ops_status ?? "").trim().toLowerCase() === "pending_info";

  const derivedPendingInfo =
    hasSignalValue(input.pending_info_reason) ||
    hasSignalValue(input.follow_up_date) ||
    hasSignalValue(input.next_action_note) ||
    hasSignalValue(input.action_required_by);

  return legacyPendingInfo || derivedPendingInfo;
}