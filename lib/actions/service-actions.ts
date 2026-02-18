// lib/actions/service-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";

/**
 * Service jobs:
 * - When marked complete -> ops_status = invoice_required
 * - When invoice marked sent -> ops_status = closed
 *
 * Guardrail:
 * - Will NOT overwrite pending_info / on_hold (manual lock)
 */

export async function markServiceComplete(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", jobId)
    .single();

  if (error) throw new Error(error.message);

  if (job.job_type !== "service") {
    throw new Error("markServiceComplete can only be used for Service jobs.");
  }

  await setOpsStatusIfNotManual(jobId, "invoice_required");
}

export async function markInvoiceSent(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", jobId)
    .single();

  if (error) throw new Error(error.message);

  if (job.job_type !== "service") {
    throw new Error("markInvoiceSent can only be used for Service jobs.");
  }

  await setOpsStatusIfNotManual(jobId, "closed");
}
