// lib/actions/ops-status.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export type OpsStatus =
  | "need_to_schedule"
  | "scheduled"
  | "pending_info"
  | "on_hold"
  | "failed"
  | "retest_needed"
  | "paperwork_required"
  | "invoice_required"
  | "closed";

const MANUAL_STATUSES: OpsStatus[] = ["pending_info", "on_hold", "retest_needed", "paperwork_required", "invoice_required"];


export async function setOpsStatusIfNotManual(jobId: string, nextStatus: OpsStatus): Promise<void> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, ops_status")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);

  const current = (job.ops_status ?? "") as OpsStatus;

  // Manual lock: do nothing
  if (MANUAL_STATUSES.includes(current)) return;

  const { error: upErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextStatus })
    .eq("id", jobId);

  if (upErr) throw new Error(upErr.message);
}

export async function forceSetOpsStatus(jobId: string, nextStatus: OpsStatus): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("jobs").update({ ops_status: nextStatus }).eq("id", jobId);
  if (error) throw new Error(error.message);
}
