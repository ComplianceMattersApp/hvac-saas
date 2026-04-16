// lib/actions/service-actions.ts
"use server";

import { requireInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  await requireInternalUser({ supabase });

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, status, field_complete, service_case_id, service_visit_outcome")
    .eq("id", jobId)
    .single();

  if (error) throw new Error(error.message);

  if (job.job_type !== "service") {
    throw new Error("markServiceComplete can only be used for Service jobs.");
  }

  // Idempotent: already field-complete and at invoice_required
  if (job.field_complete && job.ops_status === "invoice_required") {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?banner=service_closeout_already_saved`);
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

  if (job.service_case_id && String(job.service_visit_outcome ?? "").trim().toLowerCase() === "resolved") {
    const { error: serviceCaseErr } = await supabase
      .from("service_cases")
      .update({
        status: "resolved",
        resolved_by_job_id: jobId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", String(job.service_case_id));

    if (serviceCaseErr) throw new Error(serviceCaseErr.message);
  }

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
  redirect(`/jobs/${jobId}?banner=service_closeout_saved`);
}

export async function markInvoiceSent(jobId: string): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode === "internal_invoicing") {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?banner=internal_invoicing_billing_pending`);
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", jobId)
    .single();

  if (error) throw new Error(error.message);

  if (job.job_type !== "service") {
    throw new Error("markInvoiceSent can only be used for Service jobs.");
  }

  const result = await setOpsStatusIfNotManual(jobId, "closed");

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);

  if (result.manualLockPrevented) {
    redirect(`/jobs/${jobId}?banner=service_closeout_locked`);
  }

  if (!result.updated) {
    redirect(`/jobs/${jobId}?banner=service_closeout_already_saved`);
  }

  redirect(`/jobs/${jobId}?banner=service_closeout_saved`);
}
