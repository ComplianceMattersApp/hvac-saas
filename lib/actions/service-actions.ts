// lib/actions/service-actions.ts
"use server";

import { requireInternalUser } from "@/lib/auth/internal-user";
import { isInternalAccessError } from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const CLOSEOUT_MANUAL_LOCK_STATUSES = new Set([
  "pending_info",
  "pending_office_review",
  "on_hold",
  "retest_needed",
  "paperwork_required",
]);

function hasManualCloseoutLock(value?: string | null) {
  return CLOSEOUT_MANUAL_LOCK_STATUSES.has(String(value ?? "").trim().toLowerCase());
}

type ScopedServiceCloseoutJob = {
  id: string;
  job_type: string | null;
  ops_status: string | null;
  status: string | null;
  field_complete: boolean | null;
  service_case_id: string | null;
  service_visit_outcome: string | null;
  invoice_complete: boolean | null;
  data_entry_completed_at: string | null;
};

async function requireInternalScopedServiceCloseoutJob(params: {
  supabase: any;
  jobId: string;
  select: string;
}) {
  const jobId = String(params.jobId ?? "").trim();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase: params.supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        redirect("/login");
      }
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }
    throw error;
  }

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: String(authz.internalUser.account_owner_user_id ?? "").trim(),
    jobId,
    select: params.select,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return {
    userId: authz.userId,
    internalUser: authz.internalUser,
    job: scopedJob as ScopedServiceCloseoutJob,
  };
}

async function requireOperationalServiceCloseoutEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

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
  const { userId: actingUserId, internalUser, job } = await requireInternalScopedServiceCloseoutJob({
    supabase,
    jobId,
    select:
      "job_type, ops_status, status, field_complete, service_case_id, service_visit_outcome",
  });
  await requireOperationalServiceCloseoutEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

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
  const { userId: actingUserId, internalUser, job } = await requireInternalScopedServiceCloseoutJob({
    supabase,
    jobId,
    select: "job_type, ops_status, invoice_complete, data_entry_completed_at",
  });
  await requireOperationalServiceCloseoutEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode === "internal_invoicing") {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?banner=internal_invoicing_billing_pending`);
  }

  if (job.job_type !== "service") {
    throw new Error("markInvoiceSent can only be used for Service jobs.");
  }

  if (hasManualCloseoutLock(job.ops_status)) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/ops`);
    redirect(`/jobs/${jobId}?banner=service_closeout_locked`);
  }

  const completedAt = job.data_entry_completed_at ?? new Date().toISOString();
  let invoiceCompleteChanged = false;
  let dataEntryCompletedChanged = false;

  if (!job.invoice_complete || !job.data_entry_completed_at) {
    const updatePayload: { invoice_complete?: boolean; data_entry_completed_at?: string } = {};

    if (!job.invoice_complete) {
      updatePayload.invoice_complete = true;
    }

    if (!job.data_entry_completed_at) {
      updatePayload.data_entry_completed_at = completedAt;
    }

    const { data: updatedJob, error: updateErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", jobId)
      .select("id, invoice_complete, data_entry_completed_at")
      .maybeSingle();

    if (updateErr) throw new Error(updateErr.message);

    if (!updatedJob?.id || updatedJob.invoice_complete !== true) {
      throw new Error("Invoice complete update failed (no row updated).");
    }

    if (!job.data_entry_completed_at && !updatedJob.data_entry_completed_at) {
      throw new Error("Data entry completion update failed (timestamp missing).");
    }

    invoiceCompleteChanged = !job.invoice_complete;
    dataEntryCompletedChanged = !job.data_entry_completed_at;
  }

  const result = await setOpsStatusIfNotManual(jobId, "closed");

  const changeSet = [] as Array<{ field: string; from: unknown; to: unknown }>;

  if (invoiceCompleteChanged) {
    changeSet.push({ field: "invoice_complete", from: !!job.invoice_complete, to: true });
  }

  if (dataEntryCompletedChanged) {
    changeSet.push({ field: "data_entry_completed_at", from: job.data_entry_completed_at ?? null, to: completedAt });
  }

  if (result.updated) {
    changeSet.push({ field: "ops_status", from: job.ops_status ?? null, to: "closed" });
  }

  if (changeSet.length > 0) {
    const { error: eventErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "ops_update",
      message: "Invoice marked sent",
      meta: {
        changes: changeSet,
        source: "service_invoice_sent_action",
        actor_user_id: actingUserId,
      },
      user_id: actingUserId,
    });

    if (eventErr) throw new Error(eventErr.message);
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);

  if (result.manualLockPrevented) {
    redirect(`/jobs/${jobId}?banner=service_closeout_locked`);
  }

  if (!result.updated && !invoiceCompleteChanged && !dataEntryCompletedChanged) {
    redirect(`/jobs/${jobId}?banner=service_closeout_already_saved`);
  }

  redirect(`/jobs/${jobId}?banner=service_closeout_saved`);
}
