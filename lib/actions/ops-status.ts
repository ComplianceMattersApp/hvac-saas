// lib/actions/ops-status.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export type OpsStatus =
  | "need_to_schedule"
  | "scheduled"
  | "pending_info"
  | "pending_office_review"
  | "on_hold"
  | "failed"
  | "retest_needed"
  | "paperwork_required"
  | "invoice_required"
  | "closed";

const MANUAL_STATUSES: OpsStatus[] = [
  "pending_info",
  "pending_office_review",
  "on_hold",
  "retest_needed",
  "paperwork_required",
];

export type SetOpsStatusResult = {
  jobId: string;
  previousStatus: OpsStatus | "";
  requestedStatus: OpsStatus;
  finalStatus: OpsStatus | "";
  updated: boolean;
  manualLockPrevented: boolean;
};

export async function setOpsStatusIfNotManual(jobId: string, nextStatus: OpsStatus): Promise<SetOpsStatusResult> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, ops_status")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);

  const current = (job.ops_status ?? "") as OpsStatus;

  // Manual lock: do nothing
  if (MANUAL_STATUSES.includes(current)) {
    const blockedResult: SetOpsStatusResult = {
      jobId,
      previousStatus: current,
      requestedStatus: nextStatus,
      finalStatus: current,
      updated: false,
      manualLockPrevented: true,
    };

    console.error("[OPS_STATUS_SET]", blockedResult);
    return blockedResult;
  }

  if (current === nextStatus) {
    const unchangedResult: SetOpsStatusResult = {
      jobId,
      previousStatus: current,
      requestedStatus: nextStatus,
      finalStatus: current,
      updated: false,
      manualLockPrevented: false,
    };

    console.error("[OPS_STATUS_SET]", unchangedResult);
    return unchangedResult;
  }

  const { error: upErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextStatus })
    .eq("id", jobId);

  if (upErr) throw new Error(upErr.message);

  const { data: after, error: afterErr } = await supabase
    .from("jobs")
    .select("ops_status")
    .eq("id", jobId)
    .single();

  if (afterErr) throw new Error(afterErr.message);

  const finalStatus = (after?.ops_status ?? "") as OpsStatus;
  const result: SetOpsStatusResult = {
    jobId,
    previousStatus: current,
    requestedStatus: nextStatus,
    finalStatus,
    updated: finalStatus === nextStatus,
    manualLockPrevented: false,
  };

  console.error("[OPS_STATUS_SET]", result);
  return result;
}

export async function forceSetOpsStatus(jobId: string, nextStatus: OpsStatus): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("jobs").update({ ops_status: nextStatus }).eq("id", jobId);
  if (error) throw new Error(error.message);
}
