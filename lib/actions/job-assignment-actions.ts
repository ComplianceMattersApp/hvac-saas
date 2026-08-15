// lib/actions/job-assignment-actions.ts
//
// Job assignee and team assignment server actions.
// Split out of job-actions.ts; see docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md.

"use server";

import { buildStaffingSnapshotMeta } from "@/lib/actions/job-event-meta";
import { assertAssignableInternalUser } from "@/lib/staffing/human-layer";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  JobAssignment,
  applyJobScheduleUpdate,
  ensureActiveAssignmentAndNotify,
  ensureActiveAssignmentForUser,
  getSafeErrorDetails,
  insertJobEvent,
  normalizeScheduleValue,
  notifyJobAssignmentCreated,
  redirectToJobWithBanner,
  requireInternalScopedJobAccessOrRedirect,
  requireOperationalScopedJobMutationAccessOrRedirect,
} from "@/lib/actions/job-actions-shared";

async function listActiveJobAssignments(params: {
  supabase: any;
  jobId: string;
}): Promise<JobAssignment[]> {
  const { supabase, jobId } = params;

  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as JobAssignment[];
}

async function softRemoveJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  removedBy: string;
}): Promise<void> {
  const { supabase, jobId, userId, removedBy } = params;

  const { data: removed, error } = await supabase
    .from("job_assignments")
    .update({
      is_active: false,
      is_primary: false,
      removed_at: new Date().toISOString(),
      removed_by: removedBy,
    })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .select("id");

  if (error) throw error;

  // Zero rows updated = user was already inactive; skip event to avoid duplicate
  if (!removed || removed.length === 0) return;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_removed",
    meta: {
      actor_user_id: removedBy,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "soft_remove_job_assignment",
    },
    userId: removedBy,
  });
}

type SetPrimaryJobAssignmentResult =
  | { status: "updated" }
  | { status: "already_primary" }
  | { status: "target_not_active_assignee" }
  | { status: "target_not_assignable" };

async function setPrimaryJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
  accountOwnerUserId?: string | null;
}): Promise<SetPrimaryJobAssignmentResult> {
  const { supabase, jobId, userId, actorUserId, accountOwnerUserId = null } = params;

  // Hardening: verify the target user has an active assignment.
  // Also detect no-op: if already primary, skip everything.
  const { data: targetRow, error: readErr } = await supabase
    .from("job_assignments")
    .select("id, is_primary")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (readErr) throw readErr;

  if (!targetRow?.id) {
    return { status: "target_not_active_assignee" };
  }

  try {
    await assertAssignableInternalUser({
      supabase,
      userId,
      accountOwnerUserId,
    });
  } catch (error: any) {
    if (error?.message === "ASSIGNABLE_INTERNAL_USER_REQUIRED") {
      return { status: "target_not_assignable" };
    }
    throw error;
  }

  // Already primary — no change, no event
  if (targetRow.is_primary) return { status: "already_primary" };

  // Clear existing primary on all active rows for this job
  const { error: clearErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: false })
    .eq("job_id", jobId)
    .eq("is_active", true)
    .eq("is_primary", true);

  if (clearErr) throw clearErr;

  // Promote the selected existing assignment row only.
  const { error: setErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: true })
    .eq("id", targetRow.id)
    .eq("job_id", jobId)
    .eq("is_active", true);

  if (setErr) throw setErr;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_primary_set",
    meta: {
      actor_user_id: actorUserId,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "set_primary_job_assignment",
    },
    userId: actorUserId,
  });

  return { status: "updated" };
}

export async function assignJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const makePrimary = String(formData.get("make_primary") || "").trim() === "1";
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) {
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_user_required",
      tabRaw,
      returnToRaw,
    });
  }

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  await ensureActiveAssignmentAndNotify({
    supabase,
    jobId,
    userId,
    actorUserId,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (makePrimary) {
    await setPrimaryJobAssignment({
      supabase,
      jobId,
      userId,
      actorUserId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: makePrimary ? "assignment_added_primary" : "assignment_added",
    tabRaw,
    returnToRaw,
  });
}

export async function setPrimaryJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) throw new Error("Missing user_id");

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  let primaryResult: SetPrimaryJobAssignmentResult = { status: "target_not_active_assignee" };
  try {
    primaryResult = await setPrimaryJobAssignment({
      supabase,
      jobId,
      userId,
      actorUserId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch (error) {
    console.error("[jobs] set primary assignee failed", {
      jobId,
      target_user_id: userId,
      error: getSafeErrorDetails(error),
    });
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_primary_failed",
      tabRaw,
      returnToRaw,
    });
  }

  if (
    primaryResult.status === "target_not_active_assignee" ||
    primaryResult.status === "target_not_assignable"
  ) {
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_primary_target_invalid",
      tabRaw,
      returnToRaw,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: "assignment_primary_set",
    tabRaw,
    returnToRaw,
  });
}

export async function removeJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) throw new Error("Missing user_id");

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  await softRemoveJobAssignment({
    supabase,
    jobId,
    userId,
    removedBy: actorUserId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: "assignment_removed",
    tabRaw,
    returnToRaw,
  });
}

export async function updateJobTeamAssignmentsFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const primaryUserIdRaw = String(formData.get("primary_user_id") || "").trim();
  const selectedUserIds = Array.from(
    new Set(
      formData
        .getAll("selected_user_ids")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  for (const userId of selectedUserIds) {
    try {
      await assertAssignableInternalUser({
        supabase,
        userId,
        accountOwnerUserId: internalUser.account_owner_user_id,
      });
    } catch (error: any) {
      if (error?.message === "ASSIGNABLE_INTERNAL_USER_REQUIRED") {
        redirectToJobWithBanner({
          jobId,
          banner: "assignment_team_target_invalid",
          tabRaw,
          returnToRaw,
        });
      }
      throw error;
    }
  }

  if (primaryUserIdRaw && !selectedUserIds.includes(primaryUserIdRaw)) {
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_primary_target_invalid",
      tabRaw,
      returnToRaw,
    });
  }

  let hasTeamChanged = false;
  let primaryTargetInvalid = false;
  const createdAssignments: JobAssignment[] = [];

  try {
    const beforeAssignments = await listActiveJobAssignments({ supabase, jobId });
    const beforeByUserId = new Map(beforeAssignments.map((row) => [row.user_id, row]));
    const selectedSet = new Set(selectedUserIds);
    const existingPrimary = beforeAssignments.find((row) => row.is_primary);
    const existingPrimaryStillSelected = existingPrimary
      ? selectedSet.has(existingPrimary.user_id)
      : false;

    for (const userId of selectedUserIds) {
      await ensureActiveAssignmentForUser({
        supabase,
        jobId,
        userId,
        actorUserId,
        accountOwnerUserId: internalUser.account_owner_user_id,
        onCreated: (assignment) => {
          createdAssignments.push(assignment);
        },
      });
    }

    for (const assignment of beforeAssignments) {
      if (!selectedSet.has(assignment.user_id)) {
        await softRemoveJobAssignment({
          supabase,
          jobId,
          userId: assignment.user_id,
          removedBy: actorUserId,
        });
      }
    }

    const shouldSetPrimary = selectedUserIds.length > 0 && !existingPrimaryStillSelected;

    if (shouldSetPrimary) {
      const nextPrimaryUserId = selectedSet.has(primaryUserIdRaw)
        ? primaryUserIdRaw
        : selectedUserIds[0];

      const primaryResult = await setPrimaryJobAssignment({
        supabase,
        jobId,
        userId: nextPrimaryUserId,
        actorUserId,
        accountOwnerUserId: internalUser.account_owner_user_id,
      });

      if (
        primaryResult.status === "target_not_active_assignee" ||
        primaryResult.status === "target_not_assignable"
      ) {
        primaryTargetInvalid = true;
      }
    }

    const hasAddedOrRemoved =
      selectedUserIds.some((userId) => !beforeByUserId.has(userId)) ||
      beforeAssignments.some((assignment) => !selectedSet.has(assignment.user_id));
    hasTeamChanged = hasAddedOrRemoved || shouldSetPrimary;
  } catch (error) {
    const safeError = getSafeErrorDetails(error);
    console.error("[jobs] bulk team assignment update failed", {
      marker: "bulk_team_assignment_update_failed",
      jobId,
      actorUserId,
      account_owner_user_id: internalUser.account_owner_user_id,
      selected_user_count: selectedUserIds.length,
      error_code: safeError.error_code,
      error_message: safeError.error_message,
    });
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_team_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  if (primaryTargetInvalid) {
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_primary_target_invalid",
      tabRaw,
      returnToRaw,
    });
  }

  for (const assignment of createdAssignments) {
    console.info("[jobs] assignment notification attempt", {
      marker: "assignment_notification_attempt",
      job_id: jobId,
      actor_user_id: actorUserId,
      target_user_id: assignment.user_id,
      account_owner_user_id: internalUser.account_owner_user_id,
      assignment_created: true,
      notification_attempted: true,
    });

    try {
      const notificationId = await notifyJobAssignmentCreated({
        supabase,
        jobId,
        accountOwnerUserId: internalUser.account_owner_user_id,
        actorUserId,
        recipientUserId: assignment.user_id,
      });

      console.info("[jobs] assignment notification result", {
        marker: "assignment_notification_attempt",
        job_id: jobId,
        actor_user_id: actorUserId,
        target_user_id: assignment.user_id,
        account_owner_user_id: internalUser.account_owner_user_id,
        assignment_created: true,
        notification_attempted: true,
        notification_created: !!notificationId,
      });
    } catch (notificationError) {
      const safeError = getSafeErrorDetails(notificationError);
      console.error("[jobs] job assignment notification failed", {
        marker: "assignment_notification_attempt",
        jobId,
        actorUserId,
        recipientUserId: assignment.user_id,
        account_owner_user_id: internalUser.account_owner_user_id,
        assignment_created: true,
        notification_attempted: true,
        notification_created: false,
        error_code: safeError.error_code,
        error_message: safeError.error_message,
      });
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: hasTeamChanged ? "assignment_team_updated" : "assignment_team_unchanged",
    tabRaw,
    returnToRaw,
  });
}

export async function reassignAndRescheduleJobFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const targetUserId = String(formData.get("target_user_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim();
  const scheduledDate = String(formData.get("scheduled_date") || "").trim() || null;
  const windowStart = String(formData.get("window_start") || "").trim() || null;
  const windowEnd = String(formData.get("window_end") || "").trim() || null;
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const noRedirect = String(formData.get("no_redirect") || "").trim() === "1";

  if (!jobId) throw new Error("Missing job_id");
  if (mode !== "reassign" && mode !== "add" && mode !== "unassign") throw new Error("Invalid mode");
  if ((mode === "reassign" || mode === "add") && !targetUserId) throw new Error("Missing target_user_id");
  if (!scheduledDate) throw new Error("Missing scheduled_date");
  if (windowStart && windowEnd && windowStart >= windowEnd) {
    throw new Error("Arrival window start must be before end");
  }

  function finishReassignTarget(banner: string) {
    if (noRedirect) return;
    redirectToJobWithBanner({
      jobId,
      banner,
      returnToRaw,
    });
  }

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [priorAssignmentsResult, priorJobResult] = await Promise.all([
    supabase.from("job_assignments").select("user_id").eq("job_id", jobId).eq("is_active", true),
    supabase.from("jobs").select("status, scheduled_date, window_start, window_end").eq("id", jobId).single(),
  ]);
  const { data: priorAssignmentRows, error: priorAssignmentErr } = priorAssignmentsResult;
  const { data: priorJob, error: priorJobErr } = priorJobResult;

  if (priorAssignmentErr) throw priorAssignmentErr;
  if (priorJobErr) throw priorJobErr;

  const priorLifecycleStatus = String(priorJob?.status ?? "").trim().toLowerCase();
  const isActiveFieldLifecycle = ["on_the_way", "in_process", "in_progress"].includes(priorLifecycleStatus);
  const didScheduleChange =
    normalizeScheduleValue(priorJob?.scheduled_date) !== normalizeScheduleValue(scheduledDate) ||
    normalizeScheduleValue(priorJob?.window_start) !== normalizeScheduleValue(windowStart) ||
    normalizeScheduleValue(priorJob?.window_end) !== normalizeScheduleValue(windowEnd);
  const resetActiveLifecycle = isActiveFieldLifecycle && didScheduleChange;
  if (resetActiveLifecycle && String(formData.get("confirm_active_reschedule") || "").trim() !== "1") {
    throw new Error("Confirm the active-visit reset before changing this appointment.");
  }

  const scheduleResult = await applyJobScheduleUpdate({
    jobId,
    scheduledDate,
    windowStart,
    windowEnd,
    unscheduleRequested: false,
    resetActiveLifecycle,
  });

  if (mode === "reassign") {
    await ensureActiveAssignmentAndNotify({
      supabase,
      jobId,
      userId: targetUserId,
      actorUserId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
    await setPrimaryJobAssignment({
      supabase,
      jobId,
      userId: targetUserId,
      actorUserId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    const originUserIds = (priorAssignmentRows ?? [])
      .map((row: any) => String(row?.user_id ?? "").trim())
      .filter((assignedUserId: string) => assignedUserId && assignedUserId !== targetUserId);

    for (const originUserId of originUserIds) {
      await softRemoveJobAssignment({
        supabase,
        jobId,
        userId: originUserId,
        removedBy: actorUserId,
      });
    }
  } else if (mode === "add") {
    await ensureActiveAssignmentAndNotify({
      supabase,
      jobId,
      userId: targetUserId,
      actorUserId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } else {
    // mode === "unassign": no target user — remove every currently-active
    // assignee, add no one, set no one primary.
    const originUserIds = (priorAssignmentRows ?? [])
      .map((row: any) => String(row?.user_id ?? "").trim())
      .filter((assignedUserId: string) => assignedUserId);

    for (const originUserId of originUserIds) {
      await softRemoveJobAssignment({
        supabase,
        jobId,
        userId: originUserId,
        removedBy: actorUserId,
      });
    }
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "schedule_updated",
    meta: {
      timeline_v: 1,
      event_family: "scheduling",
      actor_user_id: actorUserId,
      source_action: "reassignAndRescheduleJobFromForm",
      reassignment_mode: mode,
      target_user_id: targetUserId || null,
      ops_eval_failed: scheduleResult.opsEvalFailed,
      active_lifecycle_reset: resetActiveLifecycle,
      active_lifecycle_before: resetActiveLifecycle ? priorLifecycleStatus : null,
      next: { scheduled_date: scheduledDate, window_start: windowStart, window_end: windowEnd },
    },
    userId: actorUserId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  finishReassignTarget(
    mode === "reassign" ? "assignment_primary_set" : mode === "add" ? "assignment_added" : "assignment_removed",
  );
}
