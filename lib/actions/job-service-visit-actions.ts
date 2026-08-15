// lib/actions/job-service-visit-actions.ts
//
// Return visit and callback visit creation server actions.
// Split out of job-actions.ts; see docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md.

"use server";

import { reconcileServiceCaseStatusAfterJobChange } from "@/lib/actions/service-case-reconciliation";
import { buildServiceFollowUpProgressState } from "@/lib/jobs/service-follow-up-progress";
import { createClient } from "@/lib/supabase/server";
import { getActiveWaitingState } from "@/lib/utils/ops-status";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createJob,
  ensureServiceCaseForJob,
  insertJobEvent,
  normalizeServiceVisitType,
  redirectToJobWithBanner,
  requireInternalScopedJobAccessOrRedirect,
  requireOperationalScopedJobMutationAccessOrRedirect,
} from "@/lib/actions/job-actions-shared";
import { updateJobScheduleFromForm } from "@/lib/actions/job-actions";

export async function createNextServiceVisitFromForm(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const sourceJobId = String(formData.get("job_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const visitIntentRaw = String(formData.get("visit_intent") || "").trim().toLowerCase();
  const bridgeModeRaw = String(formData.get("return_creation_mode") || "").trim().toLowerCase();
  const bridgeActionRaw = String(formData.get("follow_up_bridge_action") || "").trim().toLowerCase();
  const isAddToSchedulingQueueBridge =
    bridgeModeRaw === "needs_scheduling" ||
    bridgeActionRaw === "add_to_scheduling_queue";
  const isScheduleReturnNowBridge =
    bridgeModeRaw === "schedule_now" ||
    bridgeActionRaw === "schedule_return_now";
  const isServiceFollowUpBridge = isAddToSchedulingQueueBridge || isScheduleReturnNowBridge;
  let nextVisitReasonRaw = String(formData.get("next_visit_reason") || "").trim();

  if (!sourceJobId) throw new Error("Missing job_id");

  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: sourceJobId,
    onUnauthorized: () => {
      redirectToJobWithBanner({ jobId: sourceJobId, banner: "not_authorized", tabRaw, returnToRaw });
    },
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  let scheduleNowFields: ReturnType<typeof deriveScheduleAndOps> | null = null;
  if (isScheduleReturnNowBridge) {
    try {
      scheduleNowFields = deriveScheduleAndOps(formData);
    } catch {
      redirectToJobWithBanner({
        jobId: sourceJobId,
        banner: "schedule_window_invalid",
        tabRaw,
        returnToRaw,
      });
      return;
    }

    if (!scheduleNowFields.scheduled_date) {
      redirectToJobWithBanner({
        jobId: sourceJobId,
        banner: "schedule_date_required",
        tabRaw,
        returnToRaw,
      });
      return;
    }
  }

  const { data: sourceJob, error: sourceJobErr } = await supabase
    .from("jobs")
    .select(
      "id, job_type, status, field_complete, title, customer_id, location_id, contractor_id, customer_first_name, customer_last_name, customer_email, customer_phone, job_address, city, service_case_id, service_visit_type, ops_status, pending_info_reason, on_hold_reason, action_required_by, follow_up_date, next_action_note",
    )
    .eq("id", sourceJobId)
    .maybeSingle();

  if (sourceJobErr) throw sourceJobErr;

  if (!sourceJob?.id) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "next_service_visit_create_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  if (String(sourceJob.job_type ?? "").trim().toLowerCase() !== "service") {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "next_service_visit_not_service",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const { data: followUpProgressEvents, error: followUpProgressEventsErr } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", sourceJobId)
    .eq("event_type", "ops_update")
    .order("created_at", { ascending: true });

  if (followUpProgressEventsErr) throw followUpProgressEventsErr;

  const serviceFollowUpProgressState = buildServiceFollowUpProgressState({
    pendingInfoReason: (sourceJob as any).pending_info_reason ?? null,
    events: (followUpProgressEvents ?? []) as Array<{ created_at?: string | null; meta?: unknown }>,
  });

  if (isServiceFollowUpBridge) {
    const isCompletedServiceFollowUp =
      String(sourceJob.status ?? "").trim().toLowerCase() === "completed" &&
      Boolean((sourceJob as any).field_complete) &&
      String(sourceJob.ops_status ?? "").trim().toLowerCase() === "pending_info" &&
      Boolean(serviceFollowUpProgressState.reason);

    if (!isCompletedServiceFollowUp || !serviceFollowUpProgressState.bridgeActionLabel) {
      redirectToJobWithBanner({
        jobId: sourceJobId,
        banner: "next_service_visit_not_ready",
        tabRaw,
        returnToRaw,
      });
      return;
    }

    nextVisitReasonRaw = nextVisitReasonRaw || serviceFollowUpProgressState.reason?.display || "";
  }

  if (!nextVisitReasonRaw) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "next_service_visit_reason_required",
      tabRaw,
      returnToRaw,
    });
  }

  const customerId = String(sourceJob.customer_id ?? "").trim();
  const locationId = String(sourceJob.location_id ?? "").trim();

  if (!customerId || !locationId) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "next_service_visit_create_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const serviceCaseId =
    String(sourceJob.service_case_id ?? "").trim() ||
    (await ensureServiceCaseForJob({ supabase, jobId: sourceJobId }));

  const isExplicitReturnVisitIntent = visitIntentRaw === "return_visit" || isServiceFollowUpBridge;

  const childTitle = isExplicitReturnVisitIntent
    ? `Return Visit: ${nextVisitReasonRaw}`.slice(0, 220)
    : `Follow-up: ${nextVisitReasonRaw}`.slice(0, 220);
  const childVisitType = isExplicitReturnVisitIntent
    ? "return_visit"
    : normalizeServiceVisitType(String(sourceJob.service_visit_type ?? "").trim()) ?? "return_visit";

  const activeWaitingState = getActiveWaitingState({
    ops_status: sourceJob.ops_status ?? null,
    pending_info_reason: (sourceJob as any).pending_info_reason ?? null,
    on_hold_reason: (sourceJob as any).on_hold_reason ?? null,
  });

  const created = await createJob(
    {
      parent_job_id: sourceJobId,
      job_type: "service",
      service_case_id: serviceCaseId,
      service_visit_type: childVisitType,
      service_visit_reason: nextVisitReasonRaw,
      service_visit_outcome: "follow_up_required",
      title: childTitle,
      city: String(sourceJob.city ?? "").trim() || "Unknown",
      job_address: String(sourceJob.job_address ?? "").trim() || null,
      scheduled_date: null,
      window_start: null,
      window_end: null,
      status: "open",
      ops_status: "need_to_schedule",
      contractor_id: String(sourceJob.contractor_id ?? "").trim() || null,
      customer_id: customerId,
      location_id: locationId,
      customer_first_name: String(sourceJob.customer_first_name ?? "").trim() || null,
      customer_last_name: String(sourceJob.customer_last_name ?? "").trim() || null,
      customer_email: String(sourceJob.customer_email ?? "").trim() || null,
      customer_phone: String(sourceJob.customer_phone ?? "").trim() || null,
      visit_scope_summary: null,
      visit_scope_items: [],
      job_notes: isExplicitReturnVisitIntent
        ? `Created as return visit from prior service visit ${String(sourceJob.id).slice(0, 8)}.`
        : `Created from prior service visit ${String(sourceJob.id).slice(0, 8)}.`,
    },
    {
      serviceCaseWriteClient: supabase,
    },
  );

  await reconcileServiceCaseStatusAfterJobChange({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    serviceCaseId,
    triggerJobId: created.id,
    source: "create_next_service_visit",
  });

  if (isScheduleReturnNowBridge && scheduleNowFields?.scheduled_date) {
    const scheduleFormData = new FormData();
    scheduleFormData.set("job_id", created.id);
    scheduleFormData.set("scheduled_date", scheduleNowFields.scheduled_date);
    if (scheduleNowFields.window_start) {
      scheduleFormData.set("window_start", scheduleNowFields.window_start);
    }
    if (scheduleNowFields.window_end) {
      scheduleFormData.set("window_end", scheduleNowFields.window_end);
    }
    scheduleFormData.set("schedule_reason", "Scheduled linked service return visit");
    scheduleFormData.set("no_redirect", "1");

    await updateJobScheduleFromForm(scheduleFormData);
  }

  await insertJobEvent({
    supabase,
    jobId: sourceJobId,
    event_type: "service_next_visit_created",
      meta: {
        source_job_id: sourceJobId,
        child_job_id: created.id,
        service_case_id: serviceCaseId,
        next_visit_reason: nextVisitReasonRaw,
        ...(isServiceFollowUpBridge
          ? {
              follow_up_bridge_action: isScheduleReturnNowBridge ? "schedule_return_now" : "add_to_scheduling_queue",
              source_follow_up_reason: serviceFollowUpProgressState.reason?.display ?? null,
              source_follow_up_progress: serviceFollowUpProgressState.progress,
              source_follow_up_progress_label: serviceFollowUpProgressState.progressLabel,
              ...(isScheduleReturnNowBridge
                ? {
                    scheduled_date: scheduleNowFields?.scheduled_date ?? null,
                    window_start: scheduleNowFields?.window_start ?? null,
                    window_end: scheduleNowFields?.window_end ?? null,
                  }
                : {}),
            }
          : {}),
        visit_intent: isExplicitReturnVisitIntent ? "return_visit" : "next_service_visit",
        child_service_visit_type: childVisitType,
      ...(activeWaitingState
        ? {
            waiting_state_type: activeWaitingState.blockerType,
            waiting_state_reason: activeWaitingState.blockerReason,
          }
        : {}),
    },
    userId: actingUserId,
  });

  await insertJobEvent({
    supabase,
    jobId: created.id,
    event_type: "created_from_service_visit",
      meta: {
        source_job_id: sourceJobId,
        child_job_id: created.id,
        service_case_id: serviceCaseId,
        next_visit_reason: nextVisitReasonRaw,
        parent_job_id: sourceJobId,
        ...(isServiceFollowUpBridge
          ? {
              follow_up_bridge_action: isScheduleReturnNowBridge ? "schedule_return_now" : "add_to_scheduling_queue",
              source_follow_up_reason: serviceFollowUpProgressState.reason?.display ?? null,
              source_follow_up_progress: serviceFollowUpProgressState.progress,
              source_follow_up_progress_label: serviceFollowUpProgressState.progressLabel,
              ...(isScheduleReturnNowBridge
                ? {
                    scheduled_date: scheduleNowFields?.scheduled_date ?? null,
                    window_start: scheduleNowFields?.window_start ?? null,
                    window_end: scheduleNowFields?.window_end ?? null,
                  }
                : {}),
            }
          : {}),
        visit_intent: isExplicitReturnVisitIntent ? "return_visit" : "next_service_visit",
        child_service_visit_type: childVisitType,
    },
    userId: actingUserId,
  });

  if (activeWaitingState) {
    await insertJobEvent({
      supabase,
      jobId: sourceJobId,
      event_type: "ops_update",
      meta: {
        source: "job_detail",
        message: isScheduleReturnNowBridge
          ? "Follow-up continued through linked scheduled return visit"
          : "Follow-up continued through linked return visit",
        follow_up_bridge_action: isScheduleReturnNowBridge
          ? "schedule_return_now"
          : isAddToSchedulingQueueBridge
            ? "add_to_scheduling_queue"
            : "create_return_visit",
        blocker_action: "updated",
        blocker_type: activeWaitingState.blockerType,
        blocker_reason: activeWaitingState.blockerReason,
        continued_through_child_job_id: created.id,
        service_case_id: serviceCaseId,
        source_follow_up_reason: serviceFollowUpProgressState.reason?.display ?? null,
        source_follow_up_progress: serviceFollowUpProgressState.progress,
        source_follow_up_progress_label: serviceFollowUpProgressState.progressLabel,
        ...(isScheduleReturnNowBridge
          ? {
              scheduled_date: scheduleNowFields?.scheduled_date ?? null,
              window_start: scheduleNowFields?.window_start ?? null,
              window_end: scheduleNowFields?.window_end ?? null,
            }
          : {}),
        ...(String((sourceJob as any).action_required_by ?? "").trim()
          ? { action_required_by: String((sourceJob as any).action_required_by).trim() }
          : {}),
        ...(String((sourceJob as any).follow_up_date ?? "").trim()
          ? { follow_up_date: String((sourceJob as any).follow_up_date).trim() }
          : {}),
        ...(String((sourceJob as any).next_action_note ?? "").trim()
          ? { next_action_note: String((sourceJob as any).next_action_note).trim() }
          : {}),
      },
      userId: actingUserId,
    });
  }

  revalidatePath(`/jobs/${sourceJobId}`, "page");
  revalidatePath(`/jobs/${sourceJobId}/v2`, "page");
  revalidatePath(`/jobs/${created.id}`, "page");
  revalidatePath("/ops", "page");
  revalidatePath("/jobs", "page");
  revalidatePath("/calendar", "page");

  redirect(`/jobs/${created.id}?banner=${isScheduleReturnNowBridge ? "return_visit_scheduled" : "next_service_visit_created"}`);
}

export async function createCallbackVisitFromForm(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const sourceJobId = String(formData.get("job_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const callbackVisitReasonRaw = String(formData.get("callback_visit_reason") || "").trim();

  if (!sourceJobId) throw new Error("Missing job_id");

  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: sourceJobId,
    onUnauthorized: () => {
      redirectToJobWithBanner({ jobId: sourceJobId, banner: "not_authorized", tabRaw, returnToRaw });
    },
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { data: sourceJob, error: sourceJobErr } = await supabase
    .from("jobs")
    .select(
      "id, job_type, status, ops_status, field_complete, customer_id, location_id, contractor_id, customer_first_name, customer_last_name, customer_email, customer_phone, job_address, city, service_case_id",
    )
    .eq("id", sourceJobId)
    .maybeSingle();

  if (sourceJobErr) throw sourceJobErr;

  if (!sourceJob?.id) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "callback_visit_create_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  if (String(sourceJob.job_type ?? "").trim().toLowerCase() !== "service") {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "callback_visit_not_service",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const normalizedStatus = String(sourceJob.status ?? "").trim().toLowerCase();
  const normalizedOpsStatus = String(sourceJob.ops_status ?? "").trim().toLowerCase();
  const callbackEligibleHistoricalAnchor =
    Boolean(sourceJob.field_complete) ||
    normalizedStatus === "completed" ||
    normalizedOpsStatus === "closed";

  if (!callbackEligibleHistoricalAnchor) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "callback_visit_requires_historical_anchor",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  if (!callbackVisitReasonRaw) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "callback_visit_reason_required",
      tabRaw,
      returnToRaw,
    });
    return;
  }
  const callbackVisitReason = callbackVisitReasonRaw;

  const customerId = String(sourceJob.customer_id ?? "").trim();
  const locationId = String(sourceJob.location_id ?? "").trim();

  if (!customerId || !locationId) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "callback_visit_create_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const serviceCaseId =
    String(sourceJob.service_case_id ?? "").trim() ||
    (await ensureServiceCaseForJob({ supabase, jobId: sourceJobId }));

  const callbackIntakeEventId = await insertJobEvent({
    supabase,
    jobId: sourceJobId,
    event_type: "callback_reported",
    meta: {
      source_action: "callback_intake_reported",
      callback_report_text: callbackVisitReason,
      anchor_job_id: sourceJobId,
      service_case_id: serviceCaseId || null,
      callback_reported_by_user_id: actingUserId,
    },
    userId: actingUserId,
  });

  const created = await createJob(
    {
      job_type: "service",
      service_case_id: serviceCaseId,
      service_visit_type: "callback",
      service_visit_reason: callbackVisitReason,
      service_visit_outcome: "follow_up_required",
      title: `Callback: ${callbackVisitReason}`.slice(0, 220),
      city: String(sourceJob.city ?? "").trim() || "Unknown",
      job_address: String(sourceJob.job_address ?? "").trim() || null,
      scheduled_date: null,
      window_start: null,
      window_end: null,
      status: "open",
      ops_status: "need_to_schedule",
      contractor_id: String(sourceJob.contractor_id ?? "").trim() || null,
      customer_id: customerId,
      location_id: locationId,
      customer_first_name: String(sourceJob.customer_first_name ?? "").trim() || null,
      customer_last_name: String(sourceJob.customer_last_name ?? "").trim() || null,
      customer_email: String(sourceJob.customer_email ?? "").trim() || null,
      customer_phone: String(sourceJob.customer_phone ?? "").trim() || null,
      visit_scope_summary: null,
      visit_scope_items: [],
      job_notes: `Created from callback intake on job ${String(sourceJob.id).slice(0, 8)}.`,
    },
    {
      serviceCaseWriteClient: supabase,
    },
  );

  await reconcileServiceCaseStatusAfterJobChange({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    serviceCaseId,
    triggerJobId: created.id,
    source: "create_callback_visit",
  });

  await insertJobEvent({
    supabase,
    jobId: sourceJobId,
    event_type: "callback_visit_created",
    meta: {
      source_action: "callback_visit_created_from_intake",
      anchor_job_id: sourceJobId,
      child_job_id: created.id,
      service_case_id: serviceCaseId,
      callback_visit_reason: callbackVisitReason,
      callback_intake_event_id: callbackIntakeEventId,
    },
    userId: actingUserId,
  });

  await insertJobEvent({
    supabase,
    jobId: created.id,
    event_type: "created_from_callback_report",
    meta: {
      source_action: "callback_visit_created_from_intake",
      anchor_job_id: sourceJobId,
      child_job_id: created.id,
      service_case_id: serviceCaseId,
      callback_visit_reason: callbackVisitReason,
      callback_intake_event_id: callbackIntakeEventId,
    },
    userId: actingUserId,
  });

  revalidatePath(`/jobs/${sourceJobId}`, "page");
  revalidatePath(`/jobs/${sourceJobId}/v2`, "page");
  revalidatePath(`/jobs/${created.id}`, "page");
  revalidatePath("/ops", "page");
  revalidatePath("/jobs", "page");

  redirect(`/jobs/${created.id}?banner=callback_visit_created`);
}
