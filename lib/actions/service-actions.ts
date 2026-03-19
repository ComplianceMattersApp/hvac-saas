// lib/actions/service-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { revalidatePath } from "next/cache";

/**
 * Service jobs:
 * - When marked complete -> field_complete = true, status = completed,
 *   ops_status = invoice_required
 * - When invoice marked sent -> ops_status = closed
 *
 * Guardrail for markInvoiceSent:
 * - Will NOT overwrite pending_info / on_hold (manual lock)
 */

export async function markServiceComplete(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, status, field_complete")
    .eq("id", jobId)
    .single();

  if (error) throw new Error(error.message);

  if (job.job_type !== "service") {
    throw new Error("markServiceComplete can only be used for Service jobs.");
  }

  // Idempotent: already field-complete and at invoice_required
  if (job.field_complete && job.ops_status === "invoice_required") {
    revalidatePath(`/jobs/${jobId}`);
    return;
  }

  const beforeStatus = job.status ?? "in_progress";
  const beforeOps = job.ops_status ?? null;
  const beforeFieldComplete = Boolean(job.field_complete);

  // Atomically set field lifecycle complete + service closeout ops state
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      status: "completed",
      field_complete: true,
      field_complete_at: new Date().toISOString(),
      ops_status: "invoice_required",
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUserId = user?.id ?? null;

  const eventMeta = buildMovementEventMeta({
    from: beforeStatus,
    to: "completed",
    trigger: "ops_action",
    sourceAction: "mark_service_complete",
  });

  // Emit job_completed only if not already completed
  if (beforeStatus !== "completed") {
    await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "job_completed",
      meta: { ...eventMeta, actor_user_id: actingUserId },
      user_id: actingUserId,
    });
  }

  // Emit ops_update for the service closeout transition
  await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Service work marked complete — invoice required",
    meta: {
      changes: [
        { field: "status", from: beforeStatus, to: "completed" },
        { field: "field_complete", from: beforeFieldComplete, to: true },
        { field: "ops_status", from: beforeOps, to: "invoice_required" },
      ],
      source: "service_closeout_action",
      actor_user_id: actingUserId,
    },
    user_id: actingUserId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
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
