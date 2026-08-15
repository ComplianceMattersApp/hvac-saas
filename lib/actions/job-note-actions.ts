// lib/actions/job-note-actions.ts
//
// Public note, internal note, and data entry completion server actions.
// Split out of job-actions.ts; see docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md.

"use server";

import { getSafeErrorDetails, insertJobEvent, requireInternalScopedJobAccessOrRedirect, requireOperationalScopedJobMutationAccessOrRedirect } from "@/lib/actions/job-actions-shared";
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from "@/lib/actions/job-evaluator";
import { insertTargetedInternalNotification } from "@/lib/actions/notification-actions";
import { forceSetOpsStatus } from "@/lib/actions/ops-status";
import { reconcileServiceCaseStatusAfterJobChange } from "@/lib/actions/service-case-reconciliation";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { notifyContractorOfSharedJobUpdate } from "@/lib/notifications/contractor-shared-job-update";
import { buildNotePreview, normalizeTaggedUserIds } from "@/lib/notifications/internal-note-tagging";
import { assertAssignableInternalUser, resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addPublicNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";
  const noteScope = String(formData.get("note_scope") || "").trim().toLowerCase();

  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(
      buildPublicNoteRedirectPath({
        jobId,
        tab,
        banner: "note_add_failed",
        returnToRaw,
        noteScope,
      }),
    );
  }

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { data: recentDuplicate, error: duplicateErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "public_note")
    .eq("user_id", userId)
    .contains("meta", { note })
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .maybeSingle();

  if (duplicateErr) throw duplicateErr;
  if (recentDuplicate?.id) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/v2`, "page");
    revalidatePath(`/ops`);
    redirect(
      buildPublicNoteRedirectPath({
        jobId,
        tab,
        banner: "note_already_added",
        returnToRaw,
        noteScope,
      }),
    );
  }

  const eventId = await insertJobEvent({
    supabase,
    jobId,
    event_type: "public_note",
    meta: { note },
    userId,
  });

  try {
    await notifyContractorOfSharedJobUpdate({
      admin: createAdminClient(),
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      eventId,
      note,
    });
  } catch (error) {
    console.error("contractor_shared_note_email_failed", {
      jobId,
      eventId,
      error: error instanceof Error ? error.message : "Unknown email error",
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath(`/ops`);
  redirect(
    buildPublicNoteRedirectPath({
      jobId,
      tab,
      banner: "note_added",
      returnToRaw,
      noteScope,
    }),
  );
}

function buildPublicNoteRedirectPath(params: {
  jobId: string;
  tab: string;
  banner: string;
  returnToRaw?: string | null;
  noteScope?: string | null;
}) {
  const returnToRaw = String(params.returnToRaw ?? "").trim();
  const target =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? new URL(returnToRaw, "https://app.local")
      : new URL(`/jobs/${params.jobId}?tab=${params.tab}`, "https://app.local");

  target.searchParams.set("banner", params.banner);
  if (String(params.noteScope ?? "").trim() === "shared") {
    target.searchParams.set("note_scope", "shared");
  }

  return `${target.pathname}?${target.searchParams.toString()}${target.hash}`;
}

function buildInternalNoteRedirectPath(params: {
  jobId: string;
  tab: string;
  banner: string;
  returnToRaw?: string | null;
  mentionRecipientName?: string | null;
  mentionCount?: number | null;
}) {
  const returnToRaw = String(params.returnToRaw ?? "").trim();
  const target =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? new URL(returnToRaw, "https://app.local")
      : new URL(`/jobs/${params.jobId}?tab=${params.tab}`, "https://app.local");

  target.searchParams.set("banner", params.banner);

  const recipientName = String(params.mentionRecipientName ?? "").trim();
  if (recipientName) {
    target.searchParams.set("mention_recipient", recipientName);
  }

  if (typeof params.mentionCount === "number" && params.mentionCount > 0) {
    target.searchParams.set("mention_count", String(params.mentionCount));
  }

  return `${target.pathname}?${target.searchParams.toString()}${target.hash}`;
}

export async function addInternalNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const context = String(formData.get("context") || "").trim() || null;
  const anchorEventId = String(formData.get("anchor_event_id") || "").trim() || null;
  const anchorEventType = String(formData.get("anchor_event_type") || "").trim() || null;
  const taggedUserIds = normalizeTaggedUserIds(formData.getAll("tagged_user_ids"));

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(
      buildInternalNoteRedirectPath({
        jobId,
        tab,
        banner: "note_add_failed",
        returnToRaw,
      }),
    );
  }

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  console.info("[jobs] internal note submission received", {
    marker: "internal_note_submission_received",
    job_id: jobId,
    actor_user_id: userId,
    account_owner_user_id: internalUser.account_owner_user_id,
    note_length: note.length,
    tagged_user_ids_count: taggedUserIds.length,
  });

  const hasContextFields = !!(context || anchorEventId || anchorEventType);
  const meta = hasContextFields
    ? {
        note,
        ...(taggedUserIds.length > 0 ? { tagged_user_ids: taggedUserIds } : {}),
        ...(context ? { context } : {}),
        ...(anchorEventId ? { anchor_event_id: anchorEventId } : {}),
        ...(anchorEventType ? { anchor_event_type: anchorEventType } : {}),
      }
    : {
        note,
        ...(taggedUserIds.length > 0 ? { tagged_user_ids: taggedUserIds } : {}),
      };

  const duplicateMeta: Record<string, unknown> = { note };
  if (taggedUserIds.length > 0) duplicateMeta.tagged_user_ids = taggedUserIds;
  if (context) duplicateMeta.context = context;
  if (anchorEventId) duplicateMeta.anchor_event_id = anchorEventId;
  if (anchorEventType) duplicateMeta.anchor_event_type = anchorEventType;

  const { data: recentDuplicate, error: duplicateErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "internal_note")
    .eq("user_id", userId)
    .contains("meta", duplicateMeta)
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .maybeSingle();

  if (duplicateErr) throw duplicateErr;

  if (recentDuplicate?.id) {
    console.info("[jobs] internal note duplicate skipped", {
      marker: "internal_note_duplicate_skipped",
      job_id: jobId,
      actor_user_id: userId,
      account_owner_user_id: internalUser.account_owner_user_id,
      tagged_user_ids_count: taggedUserIds.length,
      has_tagged_user_ids: taggedUserIds.length > 0,
    });
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/v2`, "page");
    revalidatePath(`/ops`);
    refresh();
    return;
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "internal_note",
    meta,
    userId,
  });

  console.info("[jobs] internal note saved", {
    marker: "internal_note_saved",
    job_id: jobId,
    actor_user_id: userId,
    account_owner_user_id: internalUser.account_owner_user_id,
    tagged_user_ids_count: taggedUserIds.length,
  });

  if (taggedUserIds.length > 0) {
    let validatedRecipientCount = 0;
    let notificationAttempted = false;
    let notificationCreatedCount = 0;
    let mentionRecipientDisplayName: string | null = null;
    let mentionAlertFailed = false;

    try {
      const validRecipientIds: string[] = [];

      for (const candidateId of taggedUserIds) {
        if (!candidateId || candidateId === userId) continue;

        await assertAssignableInternalUser({
          userId: candidateId,
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
        });

        validRecipientIds.push(candidateId);
      }

      const uniqueRecipientIds = Array.from(new Set(validRecipientIds));
      validatedRecipientCount = uniqueRecipientIds.length;
      notificationAttempted = uniqueRecipientIds.length > 0;

      console.info("[jobs] internal note tag notification attempt", {
        marker: "internal_note_tag_notification_attempt",
        job_id: jobId,
        actor_user_id: userId,
        account_owner_user_id: internalUser.account_owner_user_id,
        tagged_user_ids_count: taggedUserIds.length,
        tagged_user_ids_safe_prefixes: taggedUserIds.slice(0, 3).map((value) => value.slice(0, 8)),
        validated_recipient_count: validatedRecipientCount,
        notification_attempted: notificationAttempted,
      });

      if (uniqueRecipientIds.length > 0) {
        const displayMap = await resolveUserDisplayMap({
          supabase,
          userIds: [userId, ...uniqueRecipientIds],
        });
        const actorDisplayName =
          String(displayMap[userId] ?? "").trim() || "A teammate";
        if (uniqueRecipientIds.length === 1) {
          mentionRecipientDisplayName =
            String(displayMap[uniqueRecipientIds[0]!] ?? "").trim() || "teammate";
        }
        const notePreview = buildNotePreview(note, 140);

        for (const recipientId of uniqueRecipientIds) {
          const createdNotificationId = await insertTargetedInternalNotification({
            supabase,
            jobId,
            accountOwnerUserId: internalUser.account_owner_user_id,
            actorUserId: userId,
            recipientUserId: recipientId,
            notificationType: "internal_note_tag",
            subject: `${actorDisplayName} tagged you on a job note`,
            body: notePreview ? `\"${notePreview}\"` : "Open the job to review the tagged note.",
            payload: {
              source: "job_events",
              event_type: "internal_note",
              context: context ?? undefined,
              anchor_event_id: anchorEventId ?? undefined,
              anchor_event_type: anchorEventType ?? undefined,
            },
          });

          if (createdNotificationId) {
            notificationCreatedCount += 1;
          }
        }
      }

      console.info("[jobs] internal note tag notification result", {
        marker: "internal_note_tag_notification_attempt",
        job_id: jobId,
        actor_user_id: userId,
        account_owner_user_id: internalUser.account_owner_user_id,
        tagged_user_ids_count: taggedUserIds.length,
        validated_recipient_count: validatedRecipientCount,
        notification_attempted: notificationAttempted,
        notification_created: notificationCreatedCount > 0,
        notification_created_count: notificationCreatedCount,
      });
    } catch (notificationError) {
      mentionAlertFailed = notificationAttempted;
      const safeError = getSafeErrorDetails(notificationError);
      console.error("[jobs] internal note tag notification failed", {
        marker: "internal_note_tag_notification_attempt",
        jobId,
        actorUserId: userId,
        account_owner_user_id: internalUser.account_owner_user_id,
        tagged_user_ids_count: taggedUserIds.length,
        validated_recipient_count: validatedRecipientCount,
        notification_attempted: notificationAttempted,
        notification_created: notificationCreatedCount > 0,
        error_code: safeError.error_code,
        error_message: safeError.error_message,
      });
    }

    const mentionBanner =
      notificationCreatedCount > 0
        ? notificationCreatedCount === 1
          ? "internal_note_mention_alert_created"
          : "internal_note_mention_alerts_created"
        : mentionAlertFailed
        ? "internal_note_mention_alert_failed"
        : null;

    if (mentionBanner) {
      revalidatePath(`/jobs/${jobId}`);
      revalidatePath(`/jobs/${jobId}/v2`, "page");
      revalidatePath(`/ops`);
      redirect(
        buildInternalNoteRedirectPath({
          jobId,
          tab,
          banner: mentionBanner,
          returnToRaw,
          mentionRecipientName:
            mentionBanner === "internal_note_mention_alert_created"
              ? mentionRecipientDisplayName
              : null,
          mentionCount:
            mentionBanner === "internal_note_mention_alerts_created"
              ? notificationCreatedCount
              : null,
        }),
      );
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/v2`, "page");
  revalidatePath(`/ops`);
  redirect(
    buildInternalNoteRedirectPath({
      jobId,
      tab,
      banner: "follow_up_note_added",
      returnToRaw,
    }),
  );
}

export async function completeDataEntryFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const invoice = String(formData.get("invoice_number") || "").trim() || null;
  const completedAt = new Date().toISOString();

  const supabase = await createClient();
  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
  });
  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode === "internal_invoicing") {
    redirect(`/jobs/${id}?banner=internal_invoicing_billing_pending`);
  }

  async function recordPostDataEntryOpsProjectionChange(previousOpsStatus: unknown) {
    const { data: refreshedJob, error: refreshedJobErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", id)
      .single();

    if (refreshedJobErr) throw refreshedJobErr;

    const finalOpsStatus = refreshedJob?.ops_status ?? null;

    if (finalOpsStatus === (previousOpsStatus ?? null)) {
      return;
    }

    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "ops_update",
      meta: {
        source: "job_detail_data_entry_recompute",
        changes: [{ field: "ops_status", from: previousOpsStatus ?? null, to: finalOpsStatus }],
      },
      userId: actingUserId,
    });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, invoice_number, invoice_complete, data_entry_completed_at, service_case_id")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;


  // Service: data entry completion = invoice sent/recorded -> closed
  const jobType = String(job?.job_type ?? "").trim().toLowerCase();

// Service closes locally after successful invoice/data entry save.
// Only ECC stays in paperwork flow.
if (jobType !== "ecc") {
  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_number: invoice,
      invoice_complete: true,
      data_entry_completed_at: completedAt,
    })
    .eq("id", id);

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "ops_update",
    meta: {
      source: "job_detail_data_entry",
      changes: [
        { field: "invoice_number", from: job?.invoice_number ?? null, to: invoice },
        { field: "invoice_complete", from: !!job?.invoice_complete, to: true },
        { field: "data_entry_completed_at", from: job?.data_entry_completed_at ?? null, to: completedAt },
      ],
    },
    userId: actingUserId,
  });

  if (jobType === "service") {
    const previousOpsStatus = job?.ops_status ?? null;

    if (String(previousOpsStatus ?? "").trim().toLowerCase() !== "closed") {
      await forceSetOpsStatus(id, "closed");

      await insertJobEvent({
        supabase,
        jobId: id,
        event_type: "ops_update",
        meta: {
          source: "job_detail_data_entry_closeout",
          changes: [
            { field: "ops_status", from: previousOpsStatus, to: "closed" },
          ],
        },
        userId: actingUserId,
      });
    }

      await reconcileServiceCaseStatusAfterJobChange({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        serviceCaseId: job?.service_case_id ?? null,
        triggerJobId: id,
        source: "complete_data_entry_from_form",
      });

    redirect(`/jobs/${id}`);
  }

  await evaluateJobOpsStatus(id);
  await healStalePaperworkOpsStatus(id);
  await recordPostDataEntryOpsProjectionChange(job?.ops_status ?? null);

  redirect(`/jobs/${id}`);
}

  // ECC: data entry completion should NOT close the job
  // ECC must go: paperwork_required -> (paperwork complete) -> closed
  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_number: invoice,
      invoice_complete: true,
      data_entry_completed_at: completedAt,
    })
    .eq("id", id);

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "ops_update",
    meta: {
      source: "job_detail_data_entry",
      changes: [
        { field: "invoice_number", from: job?.invoice_number ?? null, to: invoice },
        { field: "invoice_complete", from: !!job?.invoice_complete, to: true },
        { field: "data_entry_completed_at", from: job?.data_entry_completed_at ?? null, to: completedAt },
      ],
    },
    userId: actingUserId,
  });

  await evaluateJobOpsStatus(id);
  await healStalePaperworkOpsStatus(id);
  await recordPostDataEntryOpsProjectionChange(job?.ops_status ?? null);

  redirect(`/jobs/${id}`);
}
