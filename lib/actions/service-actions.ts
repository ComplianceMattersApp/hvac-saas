// lib/actions/service-actions.ts
"use server";

import { requireInternalUser } from "@/lib/auth/internal-user";
import { isInternalAccessError } from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { applyExternalBillingCompletionMutation } from "@/lib/actions/external-billing-completion";
import { reconcileServiceCaseStatusAfterJobChange } from "@/lib/actions/service-case-reconciliation";
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
function buildServiceCloseoutRedirectPath(params: {
  jobId: string;
  banner: string;
  returnToRaw?: string | null;
}): string {
  const returnToRaw = String(params.returnToRaw ?? "").trim();
  const target =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? new URL(returnToRaw, "https://app.local")
      : new URL(`/jobs/${params.jobId}`, "https://app.local");

  target.searchParams.set("banner", params.banner);

  return `${target.pathname}?${target.searchParams.toString()}${target.hash}`;
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
 * - When external billing is marked complete -> ops_status = closed
 *
 * Guardrail for markInvoiceSent:
 * - Will NOT overwrite pending_info / on_hold (manual lock)
 */

export async function markServiceComplete(jobIdOrFormData: string | FormData, returnToOverride?: string): Promise<void> {
  const formData = jobIdOrFormData instanceof FormData ? jobIdOrFormData : null;
  const jobId = String(formData ? formData.get("job_id") : jobIdOrFormData || "").trim();
  const returnToRaw = String(formData ? formData.get("return_to") : returnToOverride || "").trim();

  if (!jobId) throw new Error("Job ID is required");

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
    redirect(
      buildServiceCloseoutRedirectPath({
        jobId,
        banner: "service_closeout_already_saved",
        returnToRaw,
      }),
    );
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

  await reconcileServiceCaseStatusAfterJobChange({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    serviceCaseId: job.service_case_id,
    triggerJobId: jobId,
    resolutionSummary:
      String(job.service_visit_outcome ?? "").trim().toLowerCase() === "resolved"
        ? "Service visit marked resolved"
        : null,
    source: "mark_service_complete",
  });

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
  redirect(
    buildServiceCloseoutRedirectPath({
      jobId,
      banner: "service_closeout_saved",
      returnToRaw,
    }),
  );
}

export async function markInvoiceSent(jobIdOrFormData: string | FormData, returnToOverride?: string): Promise<void> {
  const formData = jobIdOrFormData instanceof FormData ? jobIdOrFormData : null;
  const jobId = String(formData ? formData.get("job_id") : jobIdOrFormData || "").trim();
  const returnToRaw = String(formData ? formData.get("return_to") : returnToOverride || "").trim();

  if (!jobId) throw new Error("Job ID is required");

  const supabase = await createClient();
  const { userId: actingUserId, internalUser, job } = await requireInternalScopedServiceCloseoutJob({
    supabase,
    jobId,
    select: "job_type, ops_status, invoice_complete, data_entry_completed_at, service_case_id",
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
    redirect(
      buildServiceCloseoutRedirectPath({
        jobId,
        banner: "internal_invoicing_billing_pending",
        returnToRaw,
      }),
    );
  }

  if (job.job_type !== "service") {
    throw new Error("markInvoiceSent can only be used for Service jobs.");
  }

  if (hasManualCloseoutLock(job.ops_status)) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/ops`);
    redirect(
      buildServiceCloseoutRedirectPath({
        jobId,
        banner: "service_closeout_locked",
        returnToRaw,
      }),
    );
  }

  const completionResult = await applyExternalBillingCompletionMutation({
    supabase,
    jobId,
    currentInvoiceComplete: job.invoice_complete,
    currentDataEntryCompletedAt: job.data_entry_completed_at,
    invoiceFieldMode: "if_missing",
    dataEntryFieldMode: "if_missing",
  });
  const completedAt = completionResult.completedAt;
  const invoiceCompleteChanged = completionResult.invoiceCompleteChanged;
  const dataEntryCompletedChanged = completionResult.dataEntryCompletedChanged;

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
      message: "External billing marked complete",
      meta: {
        changes: changeSet,
        source: "service_invoice_sent_action",
        actor_user_id: actingUserId,
      },
      user_id: actingUserId,
    });

    if (eventErr) throw new Error(eventErr.message);
  }

  if (job.job_type === "service") {
    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      serviceCaseId: job.service_case_id,
      triggerJobId: jobId,
      source: "mark_invoice_sent",
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);

  if (result.manualLockPrevented) {
    redirect(
      buildServiceCloseoutRedirectPath({
        jobId,
        banner: "service_closeout_locked",
        returnToRaw,
      }),
    );
  }

  if (!result.updated && !invoiceCompleteChanged && !dataEntryCompletedChanged) {
    redirect(
      buildServiceCloseoutRedirectPath({
        jobId,
        banner: "service_closeout_already_saved",
        returnToRaw,
      }),
    );
  }

  redirect(
    buildServiceCloseoutRedirectPath({
      jobId,
      banner: "service_closeout_saved",
      returnToRaw,
    }),
  );
}
