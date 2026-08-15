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
import { resolveAppUrl } from "@/lib/email/layout";
import { buildContractorScheduledEmailHtml, buildCustomerScheduledEmailHtml } from "@/lib/email/operational-scheduled-email";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { sendEmail } from "@/lib/email/sendEmail";
import { sanitizeVisitScopeItems, sanitizeVisitScopeSummary } from "@/lib/jobs/visit-scope";
import type { VisitScopeItem } from "@/lib/jobs/visit-scope";
import { resolveNotificationAccountOwnerUserId } from "@/lib/notifications/account-owner";
import { assertAssignableInternalUser, resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types/job";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
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

export type CreateJobInput = {
  ops_status?: string | null;
  parent_job_id?: string | null;
  service_case_id?: string | null;
  service_case_kind?: string | null;
  job_type?: string | null;
  service_visit_type?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
  customer_id?: string | null;
  location_id?: string | null;
  project_type?: string | null;
  title: string;
  city: string;
  scheduled_date: string | null;
  status: JobStatus;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
  visit_scope_summary?: string | null;
  visit_scope_items?: VisitScopeItem[] | null;
  job_address?: string | null;
  billing_recipient?: "contractor" | "customer" | "other" | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  
  };

export function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatServiceAddress(job: any) {
  const loc = Array.isArray(job?.locations)
    ? job.locations.find((x: any) => x) ?? null
    : job?.locations ?? null;

  const line1 = String(loc?.address_line1 ?? "").trim() || String(job?.job_address ?? "").trim();
  const line2 = String(loc?.address_line2 ?? "").trim();
  const city = String(loc?.city ?? "").trim() || String(job?.city ?? "").trim();
  const state = String(loc?.state ?? "").trim();
  const zip = String(loc?.zip ?? "").trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, line2, cityStateZip].filter(Boolean).join(", ");
}

export type OperationalEmailRecipientType = "customer" | "contractor" | "internal";

export type OperationalEmailNotificationType =
  | "customer_job_scheduled_email"
  | "contractor_job_scheduled_email"
  | "internal_contractor_job_intake_email"
  | "internal_contractor_intake_proposal_email";

export type OperationalEmailDeliveryStatus = "queued" | "sent" | "failed";

export function buildScheduleSignature(input: {
  scheduledDate: unknown;
  windowStart: unknown;
  windowEnd: unknown;
}): string {
  return [
    normalizeScheduleValue(input.scheduledDate) ?? "",
    normalizeScheduleValue(input.windowStart) ?? "",
    normalizeScheduleValue(input.windowEnd) ?? "",
  ].join("|");
}

export function buildOperationalEmailDedupeKey(input: {
  jobId: string;
  notificationType: OperationalEmailNotificationType;
  scope: string;
}): string {
  return `${input.notificationType}:${input.jobId}:${input.scope}`;
}

export async function findExistingOperationalEmailDelivery(input: {
  supabase: any;
  notificationType: OperationalEmailNotificationType;
  dedupeKey: string;
}): Promise<{ id: string; status: string | null } | null> {
  const dedupeKey = String(input.dedupeKey ?? "").trim();
  if (!dedupeKey) return null;

  const { data, error } = await input.supabase
    .from("notifications")
    .select("id, status")
    .eq("channel", "email")
    .eq("notification_type", input.notificationType)
    .contains("payload", { dedupe_key: dedupeKey })
    .in("status", ["queued", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    status: data.status ?? null,
  };
}

export async function hasOperationalEmailHistory(input: {
  supabase: any;
  jobId: string;
  notificationType: OperationalEmailNotificationType;
}): Promise<boolean> {
  const { data, error } = await input.supabase
    .from("notifications")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("channel", "email")
    .eq("notification_type", input.notificationType)
    .in("status", ["queued", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

export async function insertOperationalEmailDeliveryNotification(input: {
  supabase: any;
  jobId: string;
  notificationType: OperationalEmailNotificationType;
  recipientType: OperationalEmailRecipientType;
  recipientRef?: string | null;
  recipientEmail?: string | null;
  subject: string;
  body: string;
  dedupeKey: string;
  status: OperationalEmailDeliveryStatus;
  sentAt?: string | null;
  errorDetail?: string | null;
}): Promise<{ id: string }> {
  const accountOwnerUserId = await resolveNotificationAccountOwnerUserId({
    jobId: input.jobId,
  });

  if (!accountOwnerUserId) {
    throw new Error(`Unable to resolve notification account owner for job ${input.jobId}`);
  }

  const payload: Record<string, unknown> = {
    source: "operational_email",
    dedupe_key: input.dedupeKey,
  };

  const recipientEmail = String(input.recipientEmail ?? "").trim().toLowerCase() || null;
  if (recipientEmail) payload.recipient_email = recipientEmail;

  const errorDetail = String(input.errorDetail ?? "").trim() || null;
  if (errorDetail) payload.error_detail = errorDetail;

  const { data, error } = await input.supabase
    .from("notifications")
    .insert({
      job_id: input.jobId,
      recipient_type: input.recipientType,
      recipient_ref: String(input.recipientRef ?? "").trim() || null,
      channel: "email",
      notification_type: input.notificationType,
      account_owner_user_id: accountOwnerUserId,
      subject: input.subject,
      body: input.body,
      payload,
      status: input.status,
      sent_at: input.status === "sent" ? input.sentAt ?? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create operational email notification row");

  return { id: String(data.id) };
}

export async function markOperationalEmailDeliveryNotification(input: {
  supabase: any;
  notificationId: string;
  status: "sent" | "failed";
  sentAt?: string | null;
  errorDetail?: string | null;
}): Promise<void> {
  const notificationId = String(input.notificationId ?? "").trim();
  if (!notificationId) return;

  const patch: Record<string, unknown> = {
    status: input.status,
  };

  if (input.status === "sent") {
    patch.sent_at = input.sentAt ?? new Date().toISOString();
  }

  if (input.status === "failed") {
    const errorDetail = String(input.errorDetail ?? "").trim();
    if (errorDetail) {
      patch.body = `Operational email delivery failed: ${errorDetail}`;
    }
  }

  const { error } = await input.supabase
    .from("notifications")
    .update(patch)
    .eq("id", notificationId);

  if (error) throw error;
}

export async function sendCustomerScheduledEmailForJob({
  supabase,
  jobId,
  variant,
}: {
  supabase: any;
  jobId: string;
  variant?: "scheduled" | "updated";
}): Promise<void> {
  const { data: scheduledJob, error: scheduledJobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_type,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      customer_id,
      job_address,
      city,
      scheduled_date,
      window_start,
      window_end,
      contractor_id,
      contractors:contractor_id ( name, owner_user_id ),
      customers:customer_id ( owner_user_id ),
      locations:location_id (address_line1, address_line2, city, state, zip, owner_user_id)
      `
    )
    .eq("id", jobId)
    .single();

  if (scheduledJobErr) {
    console.error("Customer scheduled email job snapshot failed:", scheduledJobErr);
    return;
  }

  const customerEmail = String(scheduledJob?.customer_email ?? "").trim().toLowerCase();
  if (!customerEmail) return;

  const customerName =
    [
      String(scheduledJob?.customer_first_name ?? "").trim(),
      String(scheduledJob?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const customerPhone = String(scheduledJob?.customer_phone ?? "").trim() || null;
  const serviceAddress = formatServiceAddress(scheduledJob) || "Address not available";
  const scheduledDateText = formatBusinessDateUS(String(scheduledJob?.scheduled_date ?? "").trim()) || "Not available";
  const scheduledWindowText =
    displayWindowLA(
      String(scheduledJob?.window_start ?? "").trim() || null,
      String(scheduledJob?.window_end ?? "").trim() || null,
    ) || "Not available";

  const serviceTypeRaw = String(scheduledJob?.job_type ?? "").trim();
  const serviceType = serviceTypeRaw ? toTitleCase(serviceTypeRaw) : null;
  const accountOwnerUserId =
    String((scheduledJob as any)?.customers?.owner_user_id ?? "").trim() ||
    String((scheduledJob as any)?.locations?.owner_user_id ?? "").trim() ||
    String((scheduledJob as any)?.contractors?.owner_user_id ?? "").trim();
  const tenantIdentity = await resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId,
  });
  const supportDisplayName = tenantIdentity.displayName;
  const supportPhone = tenantIdentity.supportPhone;
  const supportEmail = tenantIdentity.supportEmail;
  const companyName = tenantIdentity.displayName;
  const subjectDate = scheduledDateText && scheduledDateText !== "Not available"
    ? scheduledDateText
    : "Date TBD";
  const emailVariant = variant === "updated" ? "updated" : "scheduled";
  const subject =
    emailVariant === "updated"
      ? `Appointment Updated \u2013 ${customerName} \u2013 ${subjectDate}`
      : `Job Scheduled \u2013 ${customerName} \u2013 ${subjectDate}`;
  const scheduleSignature = buildScheduleSignature({
    scheduledDate: scheduledJob?.scheduled_date,
    windowStart: scheduledJob?.window_start,
    windowEnd: scheduledJob?.window_end,
  });
  const dedupeKey = buildOperationalEmailDedupeKey({
    jobId,
    notificationType: "customer_job_scheduled_email",
    scope: scheduleSignature,
  });

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase,
    notificationType: "customer_job_scheduled_email",
    dedupeKey,
  });

  if (existingDelivery) return;

  const queuedDelivery = await insertOperationalEmailDeliveryNotification({
    supabase,
    jobId,
    notificationType: "customer_job_scheduled_email",
    recipientType: "customer",
    recipientRef: null,
    recipientEmail: customerEmail,
    subject,
    body: "Customer appointment confirmation email.",
    dedupeKey,
    status: "queued",
  });

  try {
    await sendEmail({
      to: customerEmail,
      subject,
      html: buildCustomerScheduledEmailHtml({
        customerName,
        customerPhone,
        customerEmail,
        serviceAddress,
        scheduledDate: scheduledDateText,
        scheduledWindow: scheduledWindowText,
        serviceType,
        companyName,
        supportDisplayName,
        companyLogoUrl: tenantIdentity.logoUrl,
        supportPhone,
        supportEmail,
        variant: emailVariant,
      }),
    });

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "failed",
      errorDetail: errorMessage,
    });

    console.error("Customer scheduled email send failed:", {
      jobId,
      customerEmail,
      error: errorMessage,
    });
  }
}

export async function sendContractorScheduledEmailForJob({
  supabase,
  jobId,
}: {
  supabase: any;
  jobId: string;
}): Promise<void> {
  const { data: scheduledJob, error: scheduledJobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_type,
      permit_number,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      customer_id,
      job_address,
      city,
      scheduled_date,
      window_start,
      window_end,
      contractor_id,
      contractors:contractor_id ( email, name, owner_user_id ),
      customers:customer_id ( owner_user_id ),
      locations:location_id (address_line1, address_line2, city, state, zip, owner_user_id)
      `
    )
    .eq("id", jobId)
    .single();

  if (scheduledJobErr) {
    console.error("Contractor scheduled email job snapshot failed:", scheduledJobErr);
    return;
  }

  const contractorId = String(scheduledJob?.contractor_id ?? "").trim();
  if (!contractorId) return;

  const contractorEmail = String((scheduledJob as any)?.contractors?.email ?? "").trim().toLowerCase();
  if (!contractorEmail) {
    console.error("Contractor scheduled email skipped: contractor email is missing.", {
      jobId,
      contractorId,
    });
    return;
  }

  const customerName =
    [
      String(scheduledJob?.customer_first_name ?? "").trim(),
      String(scheduledJob?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const customerPhone = String(scheduledJob?.customer_phone ?? "").trim() || null;
  const customerEmail = String(scheduledJob?.customer_email ?? "").trim().toLowerCase() || null;
  const serviceAddress = formatServiceAddress(scheduledJob) || "Address not available";
  const scheduledDateText = formatBusinessDateUS(String(scheduledJob?.scheduled_date ?? "").trim()) || "Not available";
  const scheduledWindowText =
    displayWindowLA(
      String(scheduledJob?.window_start ?? "").trim() || null,
      String(scheduledJob?.window_end ?? "").trim() || null,
    ) || "Not available";

  const serviceTypeRaw = String(scheduledJob?.job_type ?? "").trim();
  const serviceType = serviceTypeRaw ? toTitleCase(serviceTypeRaw) : null;
  const permitNumber = String(scheduledJob?.permit_number ?? "").trim() || null;
  const accountOwnerUserId =
    String((scheduledJob as any)?.customers?.owner_user_id ?? "").trim() ||
    String((scheduledJob as any)?.locations?.owner_user_id ?? "").trim() ||
    String((scheduledJob as any)?.contractors?.owner_user_id ?? "").trim();
  const tenantIdentity = await resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId,
  });
  const supportDisplayName = tenantIdentity.displayName;
  const supportPhone = tenantIdentity.supportPhone;
  const supportEmail = tenantIdentity.supportEmail;
  const companyName = tenantIdentity.displayName;
  const subjectDate = scheduledDateText && scheduledDateText !== "Not available"
    ? scheduledDateText
    : "Date TBD";
  const subject = `${supportDisplayName} Schedule \u2013 ${customerName} \u2013 ${subjectDate}`;
  const scheduleSignature = buildScheduleSignature({
    scheduledDate: scheduledJob?.scheduled_date,
    windowStart: scheduledJob?.window_start,
    windowEnd: scheduledJob?.window_end,
  });
  const dedupeKey = buildOperationalEmailDedupeKey({
    jobId,
    notificationType: "contractor_job_scheduled_email",
    scope: scheduleSignature,
  });

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase,
    notificationType: "contractor_job_scheduled_email",
    dedupeKey,
  });

  if (existingDelivery) return;

  const appUrl = resolveAppUrl();
  const portalJobUrl = appUrl ? `${appUrl}/portal/jobs/${jobId}` : null;

  const queuedDelivery = await insertOperationalEmailDeliveryNotification({
    supabase,
    jobId,
    notificationType: "contractor_job_scheduled_email",
    recipientType: "contractor",
    recipientRef: contractorId,
    recipientEmail: contractorEmail,
    subject,
    body: "Contractor schedule notification email.",
    dedupeKey,
    status: "queued",
  });

  try {
    await sendEmail({
      to: contractorEmail,
      subject,
      html: buildContractorScheduledEmailHtml({
        customerName,
        customerPhone,
        customerEmail,
        serviceAddress,
        scheduledDate: scheduledDateText,
        scheduledWindow: scheduledWindowText,
        serviceType,
        permitNumber,
        portalJobUrl,
        companyName,
        supportDisplayName,
        companyLogoUrl: tenantIdentity.logoUrl,
        supportPhone,
        supportEmail,
      }),
    });

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "failed",
      errorDetail: errorMessage,
    });

    console.error("Contractor scheduled email send failed:", {
      jobId,
      contractorEmail,
      error: errorMessage,
    });
  }
}

export const SERVICE_CASE_KINDS = new Set([
  "reactive",
  "callback",
  "warranty",
  "maintenance",
]);

export const SERVICE_VISIT_TYPES = new Set([
  "diagnostic",
  "repair",
  "return_visit",
  "callback",
  "maintenance",
]);

export const SERVICE_VISIT_OUTCOMES = new Set([
  "resolved",
  "follow_up_required",
  "no_issue_found",
]);

export function normalizeServiceCaseKind(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_CASE_KINDS.has(normalized) ? normalized : null;
}

export function normalizeServiceVisitType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_VISIT_TYPES.has(normalized) ? normalized : null;
}

export function normalizeServiceVisitOutcome(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_VISIT_OUTCOMES.has(normalized) ? normalized : null;
}

export function deriveInitialServiceVisitReason(input: {
  serviceVisitReason?: string | null;
  title?: string | null;
  jobNotes?: string | null;
}) {
  const explicitReason = String(input.serviceVisitReason ?? "").trim();
  if (explicitReason) return explicitReason;

  const title = String(input.title ?? "").trim();
  if (title) return title;

  const notes = String(input.jobNotes ?? "").trim();
  if (notes) return notes;

  return "service visit";
}

export   function buildInitialProblemSummary(input: {
  job_notes?: string | null;
  title?: string | null;
}) {
  const notes = String(input.job_notes ?? "").trim();
  if (notes) return notes;

  const title = String(input.title ?? "").trim();
  if (title) return title;

  return null;
}

export async function createServiceCaseForRootJob(params: {
  supabase: any;
  customerId: string;
  locationId: string;
  problemSummary?: string | null;
  caseKind?: string | null;
}) {
  const { supabase, customerId, locationId, problemSummary, caseKind } = params;

  const normalizedCaseKind = normalizeServiceCaseKind(caseKind) ?? "reactive";

  const { data, error } = await supabase
    .from("service_cases")
    .insert({
      customer_id: customerId,
      location_id: locationId,
      problem_summary: problemSummary ?? null,
      case_kind: normalizedCaseKind,
      status: "open",
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create service case");

  return String(data.id);
}

export async function ensureServiceCaseForJob(params: {
  supabase: any;
  jobId: string;
}) {
  const { supabase, jobId } = params;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, customer_id, location_id, service_case_id, job_notes, title")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found while ensuring service case");

  if (job.service_case_id) {
    return String(job.service_case_id);
  }

  if (!job.customer_id || !job.location_id) {
    throw new Error("Cannot create service case: job missing customer_id or location_id");
  }

  const serviceCaseId = await createServiceCaseForRootJob({
    supabase,
    customerId: String(job.customer_id),
    locationId: String(job.location_id),
    problemSummary: buildInitialProblemSummary({
      job_notes: job.job_notes,
      title: job.title,
    }),
  });

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ service_case_id: serviceCaseId })
    .eq("id", jobId);

  if (updErr) throw updErr;

  return serviceCaseId;
}

export async function resolveServiceCaseIdForNewJob(params: {
  supabase: any;
  parentJobId?: string | null;
  customerId?: string | null;
  locationId?: string | null;
  title?: string | null;
  jobNotes?: string | null;
  caseKind?: string | null;
}) {
  const {
    supabase,
    parentJobId,
    customerId,
    locationId,
    title,
    jobNotes,
    caseKind,
  } = params;

  const parentId = String(parentJobId ?? "").trim();

  // Child job path: inherit from parent
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("jobs")
      .select("id, service_case_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentErr) throw parentErr;
    if (!parent?.id) throw new Error("Parent job not found");

    if (parent.service_case_id) {
      return String(parent.service_case_id);
    }

    // Repair path during rollout/backfill transition
    return await ensureServiceCaseForJob({
      supabase,
      jobId: parentId,
    });
  }

  // Root job path: no service_case_id yet; create after job insert
  if (!customerId || !locationId) {
    throw new Error("Cannot resolve root service case without customer_id and location_id");
  }

  return await createServiceCaseForRootJob({
    supabase,
    customerId,
    locationId,
    caseKind,
    problemSummary: buildInitialProblemSummary({
      job_notes: jobNotes,
      title,
    }),
  });
}

export async function createJob(
  input: CreateJobInput,
  options?: { serviceCaseWriteClient?: any }
): Promise<{ id: string; service_case_id: string | null; job_display_number: string }> {
  const supabase = await createClient();
  const serviceCaseWriteClient = options?.serviceCaseWriteClient ?? supabase;

  const normalizedJobType = String(input.job_type ?? "ecc").trim().toLowerCase();
  const parentJobId = String(input.parent_job_id ?? "").trim() || null;

  let resolvedServiceCaseId = String(input.service_case_id ?? "").trim() || null;

  // Child jobs must carry the parent service_case_id to satisfy lineage guardrails.
  if (parentJobId && !resolvedServiceCaseId) {
    resolvedServiceCaseId = await resolveServiceCaseIdForNewJob({
      supabase: serviceCaseWriteClient,
      parentJobId,
    });
  }

  const normalizedServiceVisitType =
    normalizedJobType === "service"
      ? normalizeServiceVisitType(input.service_visit_type) ?? "diagnostic"
      : null;

  // SERVICE VISIT REASON DERIVATION (Step 5 Clean-Up):
  // With explicit Job Title / Visit Title model, derive service_visit_reason from:
  // 1. explicit serviceVisitReason (if provided)
  // 2. title (the new explicit title field, previously visit_scope_summary)
  // 3. job_notes (fallback)
  // 4. "service visit" (default)
  //
  // This removes the fuzzy fallback to visit_scope_summary and ties reason
  // explicitly to the job title layer.
  const normalizedServiceVisitReason =
    normalizedJobType === "service"
      ? deriveInitialServiceVisitReason({
          serviceVisitReason: input.service_visit_reason,
          title: input.title,
          jobNotes: input.job_notes,
        })
      : null;

  const normalizedVisitScopeSummary = sanitizeVisitScopeSummary(input.visit_scope_summary);
  const normalizedVisitScopeItems = sanitizeVisitScopeItems(input.visit_scope_items ?? []);

  const normalizedServiceVisitOutcome =
    normalizedJobType === "service"
      ? normalizeServiceVisitOutcome(input.service_visit_outcome) ?? "follow_up_required"
      : null;

  const payload = {
    parent_job_id: parentJobId,
    service_case_id: resolvedServiceCaseId,

    job_type: normalizedJobType,
    service_visit_type: normalizedServiceVisitType,
    service_visit_reason: normalizedServiceVisitReason,
    service_visit_outcome: normalizedServiceVisitOutcome,
    project_type: input.project_type ?? "alteration",

    title: input.title,
    job_address: input.job_address ?? null,
    city: input.city,
    scheduled_date: input.scheduled_date,
    status: input.status,
    contractor_id: input.contractor_id ?? null,
    permit_number: input.permit_number ?? null,
    jurisdiction: input.jurisdiction ?? null,
    permit_date: input.permit_date ?? null,
    window_start: input.window_start ?? null,
    window_end: input.window_end ?? null,
    customer_phone: input.customer_phone ?? null,
    customer_id: input.customer_id ?? null,
    location_id: input.location_id ?? null,
    customer_first_name: input.customer_first_name ?? null,
    customer_last_name: input.customer_last_name ?? null,
    customer_email: input.customer_email ?? null,
    job_notes: input.job_notes ?? null,
    visit_scope_summary: normalizedVisitScopeSummary,
    visit_scope_items: normalizedVisitScopeItems,
    ops_status: input.ops_status ?? null,

    billing_recipient: input.billing_recipient ?? null,
    billing_name: input.billing_name ?? null,
    billing_email: input.billing_email ?? null,
    billing_phone: input.billing_phone ?? null,
    billing_address_line1: input.billing_address_line1 ?? null,
    billing_address_line2: input.billing_address_line2 ?? null,
    billing_city: input.billing_city ?? null,
    billing_state: input.billing_state ?? null,
    billing_zip: input.billing_zip ?? null,
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id, customer_id, location_id, service_case_id, parent_job_id, title, job_notes, job_display_number")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Job insert failed");
  const jobDisplayNumber = String(data.job_display_number ?? "").trim();
  if (!jobDisplayNumber) throw new Error("Job insert failed: missing job_display_number");

  let serviceCaseId = data.service_case_id ? String(data.service_case_id) : null;

  // Root job: create case after insert if not already provided
  if (!serviceCaseId && !data.parent_job_id) {
    if (!data.customer_id || !data.location_id) {
      throw new Error("Root job created without customer_id/location_id; cannot create service case");
    }

    serviceCaseId = await resolveServiceCaseIdForNewJob({
      supabase: serviceCaseWriteClient,
      customerId: String(data.customer_id),
      locationId: String(data.location_id),
      title: data.title,
      jobNotes: data.job_notes,
      caseKind: input.service_case_kind,
    });

    const { error: updErr } = await serviceCaseWriteClient
      .from("jobs")
      .update({ service_case_id: serviceCaseId })
      .eq("id", data.id);

    if (updErr) throw updErr;
  }
  

  return {
    id: String(data.id),
    service_case_id: serviceCaseId,
    job_display_number: jobDisplayNumber,
  };
}
