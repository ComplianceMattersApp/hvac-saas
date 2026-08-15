// lib/actions/job-actions-shared.ts
//
// Shared internals for the job action modules. Deliberately NOT a "use server"
// file: these are helpers, not server actions. Keeping them here lets
// job-actions.ts and the per-domain action modules split apart without either
// duplicating the logic or turning a helper into a server endpoint.

import { evaluateJobOpsStatus } from "@/lib/actions/job-evaluator";
import { buildStaffingSnapshotMeta } from "@/lib/actions/job-event-meta";
import { insertTargetedInternalNotification } from "@/lib/actions/notification-actions";
import { loadScopedInternalEccJobForMutation, loadScopedInternalEccTestRunForMutation } from "@/lib/auth/internal-ecc-scope";
import { loadScopedInternalEquipmentJobForMutation, loadScopedInternalJobEquipmentForMutation } from "@/lib/auth/internal-equipment-scope";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { assertAssignableInternalUser, resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types/job";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type FieldActionTimingRecorder = (phase: string, elapsedMs: number) => void;

export function getSafeErrorDetails(error: unknown): { error_code: string | null; error_message: string | null } {
  if (!error) {
    return { error_code: null, error_message: null };
  }

  const maybeRecord = error as Record<string, unknown>;
  const errorCode =
    typeof maybeRecord.code === "string"
      ? maybeRecord.code
      : typeof maybeRecord.error_code === "string"
        ? maybeRecord.error_code
        : null;
  const errorMessage =
    typeof maybeRecord.message === "string"
      ? maybeRecord.message
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    error_code: errorCode,
    error_message: errorMessage,
  };
}

export function redirectToTests(opts: {
  jobId: string;
  testType?: string | null;
  systemId?: string | null;
  testRunId?: string | null;
  notice?: string | null;
}) {
  const { jobId } = opts;
  const testType = String(opts.testType ?? "").trim();
  const systemId = String(opts.systemId ?? "").trim();
  const testRunId = String(opts.testRunId ?? "").trim();
  const notice = String(opts.notice ?? "").trim();

  const q = new URLSearchParams();
  if (testType) q.set("t", testType);
  if (systemId) q.set("s", systemId);
  if (testRunId) q.set("r", testRunId);
  if (notice) q.set("notice", notice);

  const qs = q.toString();
  redirect(qs ? `/jobs/${jobId}/tests?${qs}` : `/jobs/${jobId}/tests`);
}

export function revalidateEccProjectionConsumers(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath("/ops");
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/jobs/${jobId}`);
}

export async function requireInternalEccTestsAccess(params: {
  supabase: any;
  jobId: string;
  testRunId?: string | null;
}) {
  const { supabase, jobId } = params;

  const { internalUser } = await requireInternalUser({ supabase });

  const testRunId = String(params.testRunId ?? "").trim();

  if (testRunId) {
    const scopedRun = await loadScopedInternalEccTestRunForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      testRunId,
      testRunSelect: "is_completed",
    });

    if (!scopedRun?.job?.id || !scopedRun?.testRun?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return {
      ...scopedRun,
      internalUser,
    };
  }

  const scopedJob = await loadScopedInternalEccJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return {
    job: scopedJob,
    testRun: null,
    internalUser,
  };
}

export async function resolveSystemIdForRun(params: {
  supabase: any;
  jobId: string;
  testRunId: string;
  systemIdFromForm?: string | null;
}): Promise<string | null> {
  const fromForm = String(params.systemIdFromForm ?? "").trim();
  if (fromForm) return fromForm;

  const { data, error } = await params.supabase
    .from("ecc_test_runs")
    .select("system_id")
    .eq("id", params.testRunId)
    .eq("job_id", params.jobId)
    .maybeSingle();

  if (error) throw error;

  const fromRun = String(data?.system_id ?? "").trim();
  return fromRun || null;
}

export function normalizeJobTab(raw: string): "info" | "ops" | "tests" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "ops" || value === "tests") return value;
  return "info";
}

export function redirectToJobWithBanner(params: {
  jobId: string;
  banner: string;
  tabRaw?: string;
  returnToRaw?: string;
  cacheBust?: boolean;
}) {
  const tab = normalizeJobTab(String(params.tabRaw ?? ""));
  const returnToRaw = String(params.returnToRaw ?? "").trim();

  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const target = new URL(returnToRaw, "https://app.local");
    target.searchParams.set("banner", params.banner);
    if (params.cacheBust) target.searchParams.set("rv", Date.now().toString());
    redirect(`${target.pathname}?${target.searchParams.toString()}${target.hash}`);
  }

  const q = new URLSearchParams();
  q.set("tab", tab);
  q.set("banner", params.banner);
  if (params.cacheBust) q.set("rv", Date.now().toString());
  redirect(`/jobs/${params.jobId}?${q.toString()}`);
}

export async function requireInternalScopedJobAccessOrRedirect(params: {
  supabase: any;
  jobId: string;
  onUnauthorized?: () => void;
  timing?: FieldActionTimingRecorder;
}) {
  const jobId = String(params.jobId ?? "").trim();
  const { userId, internalUser } = await requireInternalUser({
    supabase: params.supabase,
    timing: params.timing,
  });
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: "id",
    timing: params.timing,
  });

  if (!scopedJob?.id) {
    if (params.onUnauthorized) {
      params.onUnauthorized();
    }
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return { userId, internalUser, scopedJob };
}


export async function cleanupOrphanSystem(opts: {
  supabase: any;
  jobId: string;
  systemId: string;
}) {
  const { supabase, jobId, systemId } = opts;
  if (!systemId) return;

  // any equipment left on this system?
  const { count: eqCount, error: eqErr } = await supabase
    .from("job_equipment")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (eqErr) throw eqErr;

  // any test runs left on this system?
  const { count: trCount, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (trErr) throw trErr;

  // orphan rule
  if ((eqCount ?? 0) === 0 && (trCount ?? 0) === 0) {
    const { error: delSysErr } = await supabase
      .from("job_systems")
      .delete()
      .eq("job_id", jobId)
      .eq("id", systemId);

    if (delSysErr) throw delSysErr;
  }
}

export async function requireInternalEquipmentMutationAccess(params: {
  supabase: any;
  jobId: string;
  equipmentId?: string | null;
}) {
  const { supabase, jobId } = params;
  const { internalUser } = await requireInternalUser({ supabase });

  const equipmentId = String(params.equipmentId ?? "").trim();

  if (equipmentId) {
    const scopedEquipment = await loadScopedInternalJobEquipmentForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      equipmentId,
      equipmentSelect: "system_id",
    });

    if (!scopedEquipment?.job?.id || !scopedEquipment?.equipment?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return {
      ...scopedEquipment,
      internalUser,
    };
  }

  const scopedJob = await loadScopedInternalEquipmentJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return {
    job: scopedJob,
    equipment: null,
    internalUser,
  };
}

export async function requireOperationalScopedJobMutationAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
  timing?: FieldActionTimingRecorder;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
    timing: params.timing,
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

export async function insertJobEvent(params: {
  supabase: any;
  jobId: string;
  event_type: string;
  meta?: Record<string, any> | null;
  userId?: string | null;
}): Promise<string> {
  const { supabase, jobId, event_type } = params;
  const meta = params.meta ?? null;
  const userId = params.userId ?? null;

  const { data, error } = await supabase
    .from("job_events")
    .insert({
      job_id: jobId,
      event_type,
      meta,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (!data?.id) {
    throw new Error("Failed to retrieve inserted event id");
  }

  return data.id;
}

export function normalizeScheduleValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export type JobAssignment = {
  id: string;
  job_id: string;
  user_id: string;
  assigned_by: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

export type JobAssignmentCreatedCallback = (assignment: JobAssignment) => Promise<void> | void;

export async function addJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  assignedBy: string;
  accountOwnerUserId?: string | null;
  isPrimary?: boolean;
  timing?: FieldActionTimingRecorder;
}): Promise<JobAssignment> {
  const {
    supabase,
    jobId,
    userId,
    assignedBy,
    accountOwnerUserId = null,
    isPrimary = false,
    timing,
  } = params;

  await assertAssignableInternalUser({
    supabase,
    userId,
    accountOwnerUserId,
  });

  const assignmentInsertStartedAt = timing ? Date.now() : 0;
  const { data, error } = await supabase
    .from("job_assignments")
    .insert({
      job_id: jobId,
      user_id: userId,
      assigned_by: assignedBy,
      is_active: true,
      is_primary: isPrimary,
    })
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .single();
  if (timing) timing("assignmentInsertSlowPath", Date.now() - assignmentInsertStartedAt);

  if (error) throw error;

  const assignmentEventStartedAt = timing ? Date.now() : 0;
  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_added",
    meta: {
      actor_user_id: assignedBy,
      affected_user_id: userId,
      is_primary: isPrimary,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "add_job_assignment",
    },
    userId: assignedBy,
  });
  if (timing) timing("assignmentAddedEventInsert", Date.now() - assignmentEventStartedAt);

  return data as JobAssignment;
}

export async function notifyJobAssignmentCreated(params: {
  supabase: any;
  jobId: string;
  accountOwnerUserId: string;
  actorUserId: string;
  recipientUserId: string;
}): Promise<string | null> {
  const displayMap = await resolveUserDisplayMap({
    supabase: params.supabase,
    userIds: [params.actorUserId],
  });
  const actorDisplayName = String(displayMap[params.actorUserId] ?? "").trim() || "A teammate";

  return insertTargetedInternalNotification({
    supabase: params.supabase,
    jobId: params.jobId,
    accountOwnerUserId: params.accountOwnerUserId,
    actorUserId: params.actorUserId,
    recipientUserId: params.recipientUserId,
    notificationType: "internal_job_assigned",
    subject: `${actorDisplayName} assigned you to a job`,
    body: "Open the job to review dispatch details and next steps.",
    payload: {
      source: "job_assignments",
      event_type: "assignment_added",
      assigned_user_id: params.recipientUserId,
      assigned_by_user_id: params.actorUserId,
    },
  });
}

export async function ensureActiveAssignmentForUser(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
  accountOwnerUserId?: string | null;
  timing?: FieldActionTimingRecorder;
  onCreated?: JobAssignmentCreatedCallback;
}): Promise<JobAssignment> {
  const {
    supabase,
    jobId,
    userId,
    actorUserId,
    accountOwnerUserId = null,
    timing,
    onCreated,
  } = params;

  // Fast path: active row already exists
  const existingCheckStartedAt = timing ? Date.now() : 0;
  const { data: existing, error: selectErr } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (timing) timing("assignmentExistingFastPathCheck", Date.now() - existingCheckStartedAt);

  if (selectErr) throw selectErr;
  if (existing) return existing as JobAssignment;

  // Slow path: create via addJobAssignment so assignment_added fires.
  // On 23505 unique-violation (parallel insert race), the winning call already
  // emitted assignment_added — re-select the surviving row without re-emitting.
  try {
    const createdAssignment = await addJobAssignment({
      supabase,
      jobId,
      userId,
      assignedBy: actorUserId,
      accountOwnerUserId,
      isPrimary: false,
      timing,
    });

    if (onCreated) {
      await onCreated(createdAssignment);
    }

    return createdAssignment;
  } catch (addErr: any) {
    if (addErr?.code === "23505") {
      const { data: raced, error: racedErr } = await supabase
        .from("job_assignments")
        .select(
          "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
        )
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (racedErr) throw racedErr;
      if (!raced) {
        throw new Error(
          "Concurrent assignment insert detected but no active row found after race"
        );
      }
      return raced as JobAssignment;
    }
    throw addErr;
  }
}

export async function ensureActiveAssignmentAndNotify(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
  accountOwnerUserId: string;
  timing?: FieldActionTimingRecorder;
}) {
  const {
    supabase,
    jobId,
    userId,
    actorUserId,
    accountOwnerUserId,
    timing,
  } = params;

  let assignmentCreated = false;
  let notificationCreated = false;
  let notificationId: string | null = null;

  await ensureActiveAssignmentForUser({
    supabase,
    jobId,
    userId,
    actorUserId,
    accountOwnerUserId,
    timing,
    onCreated: async () => {
      assignmentCreated = true;
      console.info("[jobs] assignment notification attempt", {
        marker: "assignment_notification_attempt",
        job_id: jobId,
        actor_user_id: actorUserId,
        target_user_id: userId,
        account_owner_user_id: accountOwnerUserId,
        assignment_created: true,
        notification_attempted: true,
      });

      try {
        notificationId = await notifyJobAssignmentCreated({
          supabase,
          jobId,
          accountOwnerUserId,
          actorUserId,
          recipientUserId: userId,
        });
        notificationCreated = !!notificationId;

        console.info("[jobs] assignment notification result", {
          marker: "assignment_notification_attempt",
          job_id: jobId,
          actor_user_id: actorUserId,
          target_user_id: userId,
          account_owner_user_id: accountOwnerUserId,
          assignment_created: true,
          notification_attempted: true,
          notification_created: notificationCreated,
        });
      } catch (notificationError) {
        const safeError = getSafeErrorDetails(notificationError);
        console.error("[jobs] job assignment notification failed", {
          marker: "assignment_notification_attempt",
          jobId,
          actorUserId,
          recipientUserId: userId,
          account_owner_user_id: accountOwnerUserId,
          assignment_created: true,
          notification_attempted: true,
          notification_created: false,
          error_code: safeError.error_code,
          error_message: safeError.error_message,
        });
      }
    },
  });

  if (!assignmentCreated) {
    console.info("[jobs] assignment notification skipped", {
      marker: "assignment_notification_attempt",
      job_id: jobId,
      actor_user_id: actorUserId,
      target_user_id: userId,
      account_owner_user_id: accountOwnerUserId,
      assignment_created: false,
      notification_attempted: false,
      notification_created: false,
    });
  }

  return {
    assignmentCreated,
    notificationCreated,
    notificationId,
  };
}

export async function updateJob(input: {
  ops_status?: string | null;
  id: string;
  title?: string;
  service_visit_type?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
  city?: string;
  status?: JobStatus;
  scheduled_date?: string | null;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  on_the_way_at?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
}) {
  const supabase = await createClient();
  const { id, ...updates } = input;

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function applyJobScheduleUpdate(params: {
  jobId: string;
  scheduledDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  unscheduleRequested: boolean;
  resetActiveLifecycle?: boolean;
  extraFields?: Record<string, unknown>;
}): Promise<{
  opsEvalFailed: boolean;
  nextLifecycleStatus: "open" | undefined;
  nextOnTheWayAt: null | undefined;
}> {
  const { jobId, scheduledDate, windowStart, windowEnd, unscheduleRequested, resetActiveLifecycle, extraFields } = params;

  const isUnscheduledAfterSave = !scheduledDate && !windowStart && !windowEnd;
  const nextLifecycleStatus: "open" | undefined =
    resetActiveLifecycle || (unscheduleRequested && isUnscheduledAfterSave) ? "open" : undefined;
  const nextOnTheWayAt: null | undefined =
    resetActiveLifecycle || (unscheduleRequested && isUnscheduledAfterSave) ? null : undefined;

  await updateJob({
    id: jobId,
    scheduled_date: scheduledDate,
    window_start: windowStart,
    window_end: windowEnd,
    status: nextLifecycleStatus,
    on_the_way_at: nextOnTheWayAt,
    ...extraFields,
  });

  let opsEvalFailed = false;
  try {
    await evaluateJobOpsStatus(jobId);
  } catch {
    opsEvalFailed = true;
  }

  return { opsEvalFailed, nextLifecycleStatus, nextOnTheWayAt };
}
