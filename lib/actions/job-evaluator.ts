// lib/actions/job-evaluator.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { resolveOpsStatus } from "@/lib/utils/ops-status";
import { forceSetOpsStatus, setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import type { OpsStatus } from "@/lib/actions/ops-status";
import { isPrimaryQueueJob } from "@/lib/ops/queue-membership";

/**
 * Job-type-aware ops_status resolver entry point.
 *
 * This is the intended single authority entry point for writing jobs.ops_status.
 * Actions should call this instead of writing ops_status directly.
 *
 * ECC jobs:
 *   Delegates entirely to evaluateEccOpsStatus, which is test-run-aware,
 *   scenario-driven, and handles its own DB write with appropriate hard-lock
 *   guards (active primary responsibilities are never cleared by ECC evaluation).
 *
 * Service jobs (and unknown/fallback job types):
 *   Computes next status via resolveOpsStatus (pure lifecycle utility), then
 *   writes via setOpsStatusIfNotManual, which respects the manual-lock list
 *   so active primary responsibilities are not overwritten by automated
 *   closeout resolution.
 */
export async function evaluateJobOpsStatus(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, job_type, status, scheduled_date, window_start, window_end, field_complete, certs_complete, invoice_complete, ops_status, deleted_at, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job?.id) throw new Error("Job not found");

  const jobType = String(job.job_type ?? "").trim().toLowerCase();
  const currentOps = String(job.ops_status ?? "").trim().toLowerCase();
  const isFieldComplete = Boolean(job.field_complete) || String(job.status ?? "").trim().toLowerCase() === "completed";

  // Legacy rows can carry reminder fields while their ops_status still points
  // at scheduling or closeout. Canonicalize that responsibility before any
  // lifecycle evaluator gets a chance to erase it.
  if (currentOps !== "follow_up" && isPrimaryQueueJob(job, "follow_ups")) {
    await forceSetOpsStatus(jobId, "follow_up");
    return;
  }

  // Pre-field lifecycle is universal and schedule-driven.
  // Guard: never auto-overwrite true ECC failure/retest states with scheduling-derived statuses.
  if (!isFieldComplete) {
    const isProtectedEccFailureState =
      jobType === "ecc" && (currentOps === "failed" || currentOps === "retest_needed");

    if (!isProtectedEccFailureState) {
      const preFieldOps = resolveOpsStatus({
        status: job.status,
        job_type: job.job_type,
        scheduled_date: job.scheduled_date,
        window_start: job.window_start,
        window_end: job.window_end,
        field_complete: job.field_complete,
        certs_complete: job.certs_complete,
        invoice_complete: job.invoice_complete,
        current_ops_status: job.ops_status,
      });

      await setOpsStatusIfNotManual(jobId, preFieldOps as OpsStatus);
    }

    return;
  }

  // Post-field ECC path: delegate to ECC outcome resolver.
  if (jobType === "ecc") {
    await evaluateEccOpsStatus(jobId);
    return;
  }

  // Service / fallback path: compute via shared lifecycle resolver, write safely
  const nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: job.invoice_complete,
    current_ops_status: job.ops_status,
  });

  await setOpsStatusIfNotManual(jobId, nextOps as OpsStatus);
}

export async function healStalePaperworkOpsStatus(jobId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, job_type, status, scheduled_date, window_start, window_end, field_complete, certs_complete, invoice_complete, ops_status"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job?.id) throw new Error("Job not found");

  const currentOps = String(job.ops_status ?? "").toLowerCase();
  const isPaperworkRequired = currentOps === "paperwork_required";
  const isFullyComplete = Boolean(job.field_complete) && Boolean(job.certs_complete) && Boolean(job.invoice_complete);

  if (!isPaperworkRequired || !isFullyComplete) {
    return false;
  }

  const nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: job.invoice_complete,
    current_ops_status: job.ops_status,
  });

  if (String(nextOps ?? "").toLowerCase() === currentOps) {
    return false;
  }

  await forceSetOpsStatus(jobId, nextOps as OpsStatus);
  return true;
}
