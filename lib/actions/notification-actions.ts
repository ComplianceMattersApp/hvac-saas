import { revalidatePath } from "next/cache";
import { resolveNotificationAccountOwnerUserId } from "@/lib/notifications/account-owner";
import { sendWebPushNotificationForInternalNotification } from "@/lib/notifications/web-push-delivery";

export type NotificationTriggerEventType =
  | "contractor_report_sent"
  | "retest_ready_requested"
  | "contractor_job_created"
  | "contractor_note"
  | "contractor_correction_submission"
  | "contractor_schedule_updated";

type InsertInternalNotificationForEventInput = {
  supabase: any;
  jobId: string;
  eventType: NotificationTriggerEventType;
  actorUserId?: string | null;
};

type ContractorReportEmailDeliveryStatus = "queued" | "sent" | "failed";

type InsertContractorReportEmailDeliveryNotificationInput = {
  supabase: any;
  jobId: string;
  contractorId?: string | null;
  recipientEmail?: string | null;
  eventId: string;
  dedupeKey?: string | null;
  subject: string;
  body: string;
  status: ContractorReportEmailDeliveryStatus;
  sentAt?: string | null;
  errorDetail?: string | null;
};

type FindExistingContractorReportEmailDeliveryInput = {
  supabase: any;
  dedupeKey: string;
};

const EVENT_TO_SUBJECT: Record<NotificationTriggerEventType, string> = {
  contractor_report_sent: "Contractor report sent",
  retest_ready_requested: "Retest ready requested",
  contractor_job_created: "Contractor job submitted",
  contractor_note: "Contractor note received",
  contractor_correction_submission: "Contractor correction submission received",
  contractor_schedule_updated: "Contractor provided scheduling",
};

const EVENT_TO_BODY: Record<NotificationTriggerEventType, string> = {
  contractor_report_sent: "A contractor report was sent to the portal.",
  retest_ready_requested: "Contractor requested retest readiness review.",
  contractor_job_created: "A contractor submitted a new job that needs internal review and scheduling.",
  contractor_note: "A contractor added a note.",
  contractor_correction_submission: "A contractor submitted corrections for review.",
  contractor_schedule_updated: "A contractor submitted scheduling data with a new job.",
};

const INTERNAL_NEW_WORK_PROPOSAL_NOTIFICATION_TYPES = [
  "contractor_intake_proposal_submitted",
  "internal_contractor_intake_proposal_email",
] as const;

const INTERNAL_NEW_WORK_JOB_NOTIFICATION_TYPES = [
  "contractor_job_created",
  "internal_contractor_job_intake_email",
] as const;

type MarkInternalNewWorkNotificationsResolvedInput = {
  supabase: any;
  accountOwnerUserId: string;
  contractorIntakeSubmissionId?: string | null;
  jobId?: string | null;
  readAtIso?: string | null;
};

function isInternalAwarenessEventType(value: NotificationTriggerEventType): boolean {
  return value !== "contractor_report_sent";
}

type InsertInternalAwarenessNotificationInput = {
  supabase: any;
  jobId?: string | null;
  contractorIntakeSubmissionId?: string | null;
  accountOwnerUserId: string;
  actorUserId: string;
  notificationType: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
};

type InsertTargetedInternalNotificationInput = {
  supabase: any;
  jobId: string;
  accountOwnerUserId: string;
  actorUserId: string;
  recipientUserId: string;
  notificationType: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
};

type CreateContractorIntakeProposalAwarenessNotificationInput = {
  supabase: any;
  contractorIntakeSubmissionId: string;
  accountOwnerUserId: string;
  actorUserId: string;
  contractorId: string;
  proposalSnapshot?: {
    contractorName?: string | null;
    customerName?: string | null;
    locationNickname?: string | null;
    locationSummary?: string | null;
    jobTypeLabel?: string | null;
    projectTypeLabel?: string | null;
    notesPreview?: string | null;
    permitNumber?: string | null;
    permitJurisdiction?: string | null;
    permitDate?: string | null;
  };
};

function getSafeErrorDetails(error: unknown): { error_code: string | null; error_message: string | null } {
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

export async function insertInternalAwarenessNotification(
  input: InsertInternalAwarenessNotificationInput,
): Promise<string> {
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const jobId = String(input.jobId ?? "").trim() || null;
  const contractorIntakeSubmissionId =
    String(input.contractorIntakeSubmissionId ?? "").trim() || null;
  const notificationType = String(input.notificationType ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();

  if (!accountOwnerUserId) throw new Error("Missing accountOwnerUserId for internal notification");
  if (!actorUserId) throw new Error("Missing actorUserId for internal notification");
  if (!notificationType) throw new Error("Missing notificationType for internal notification");
  if ((jobId && contractorIntakeSubmissionId) || (!jobId && !contractorIntakeSubmissionId)) {
    throw new Error("Internal notification requires exactly one scope reference");
  }

  const { data, error } = await input.supabase.rpc("insert_internal_notification", {
    p_job_id: jobId,
    p_submission_id: contractorIntakeSubmissionId,
    p_account_owner_user_id: accountOwnerUserId,
    p_actor_user_id: actorUserId,
    p_notification_type: notificationType,
    p_subject: subject,
    p_body: body,
    p_payload: input.payload ?? {},
  });

  if (error) throw error;

  const notificationId = String(data ?? "").trim();
  if (!notificationId) {
    throw new Error("Failed to create internal notification row");
  }

  revalidatePath("/", "layout");
  return notificationId;
}

export async function insertTargetedInternalNotification(
  input: InsertTargetedInternalNotificationInput,
): Promise<string | null> {
  const jobId = String(input.jobId ?? "").trim();
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const recipientUserId = String(input.recipientUserId ?? "").trim();
  const notificationType = String(input.notificationType ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();

  if (!jobId) throw new Error("Missing jobId for targeted internal notification");
  if (!accountOwnerUserId) throw new Error("Missing accountOwnerUserId for targeted internal notification");
  if (!actorUserId) throw new Error("Missing actorUserId for targeted internal notification");
  if (!recipientUserId) throw new Error("Missing recipientUserId for targeted internal notification");
  if (!notificationType) throw new Error("Missing notificationType for targeted internal notification");
  if (recipientUserId === actorUserId) return null;

  const payload: Record<string, unknown> = {
    ...(input.payload ?? {}),
    actor_user_id: actorUserId,
    tagged_user_id: recipientUserId,
  };

  const channel = "in_app" as const;
  const recipientType = "internal" as const;

  const { data, error } = await input.supabase
    .from("notifications")
    .insert({
      job_id: jobId,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: recipientType,
      recipient_ref: recipientUserId,
      channel,
      notification_type: notificationType,
      subject: subject || null,
      body: body || null,
      payload,
      status: "queued",
    })
    .select("id, recipient_ref, recipient_type")
    .single();

  if (error) {
    const safeError = getSafeErrorDetails(error);
    console.error("[notification-actions] targeted notification insert failed", {
      marker: "targeted_internal_notification_insert_failed",
      notification_type: notificationType,
      channel,
      recipient_type: recipientType,
      recipient_ref: recipientUserId,
      account_owner_user_id: accountOwnerUserId,
      job_id: jobId,
      error_code: safeError.error_code,
      error_message: safeError.error_message,
    });
    throw error;
  }

  const notificationId = String(data?.id ?? "").trim();
  if (!notificationId) {
    throw new Error("Failed to create targeted internal notification row");
  }

  const storedRecipientRef = String(data?.recipient_ref ?? "").trim();
  const storedRecipientType = String(data?.recipient_type ?? "").trim().toLowerCase();
  const storedRecipientTypeValid = storedRecipientType === "internal" || storedRecipientType === "internal_user";
  if (!storedRecipientTypeValid || storedRecipientRef !== recipientUserId) {
    // Defensive rollback: a targeted insert must never persist without an exact recipient scope.
    await input.supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("account_owner_user_id", accountOwnerUserId);
    throw new Error("TARGETED_INTERNAL_NOTIFICATION_SCOPE_MISMATCH");
  }

  console.info("[notification-actions] targeted notification insert succeeded", {
    marker: "targeted_internal_notification_insert_succeeded",
    notification_id: notificationId,
    notification_type: notificationType,
    channel,
    recipient_type: recipientType,
    recipient_ref: recipientUserId,
    account_owner_user_id: accountOwnerUserId,
    job_id: jobId,
  });

  // Best-effort: await so serverless runtimes do not end before attempt audit writes.
  // Failures are logged and swallowed; never blocks notification creation.
  try {
    console.info("[notification-actions] web push invocation about to start", {
      marker: "web_push_invocation_about_to_start",
      notification_id: notificationId,
      notification_type: notificationType,
      recipient_type: recipientType,
      recipient_ref: recipientUserId,
      account_owner_user_id: accountOwnerUserId,
    });

    await sendWebPushNotificationForInternalNotification({
      supabase: input.supabase,
      notificationId,
      accountOwnerUserId,
      recipientUserId,
      notificationType,
      jobId,
    });

    console.info("[notification-actions] web push invocation completed", {
      marker: "web_push_invocation_completed",
      notification_id: notificationId,
    });
  } catch (err) {
    const safeError = getSafeErrorDetails(err);
    console.warn("[notification-actions] Push delivery failed (safe to ignore)", {
      marker: "web_push_invocation_failed",
      notificationId,
      recipientUserId,
      error_code: safeError.error_code,
      error_message: safeError.error_message,
    });
  }

  revalidatePath("/", "layout");
  return notificationId;
}

export async function createContractorIntakeProposalAwarenessNotification(
  input: CreateContractorIntakeProposalAwarenessNotificationInput,
): Promise<string> {
  const contractorIntakeSubmissionId = String(input.contractorIntakeSubmissionId ?? "").trim();
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const contractorId = String(input.contractorId ?? "").trim();
  const snapshot = input.proposalSnapshot ?? {};

  const payload: Record<string, unknown> = {
    source: "contractor_intake_submissions",
    contractor_intake_submission_id: contractorIntakeSubmissionId,
    contractor_id: contractorId,
    submitted_by_user_id: actorUserId,
    account_owner_user_id: accountOwnerUserId,
  };

  const appendIfPresent = (key: string, value: string | null | undefined) => {
    const normalized = String(value ?? "").trim();
    if (normalized) payload[key] = normalized;
  };

  appendIfPresent("proposal_contractor_name", snapshot.contractorName);
  appendIfPresent("proposal_customer_name", snapshot.customerName);
  appendIfPresent("proposal_location_nickname", snapshot.locationNickname);
  appendIfPresent("proposal_location_summary", snapshot.locationSummary);
  appendIfPresent("proposal_job_type_label", snapshot.jobTypeLabel);
  appendIfPresent("proposal_project_type_label", snapshot.projectTypeLabel);
  appendIfPresent("proposal_notes_preview", snapshot.notesPreview);
  appendIfPresent("proposal_permit_number", snapshot.permitNumber);
  appendIfPresent("proposal_permit_jurisdiction", snapshot.permitJurisdiction);
  appendIfPresent("proposal_permit_date", snapshot.permitDate);

  return insertInternalAwarenessNotification({
    supabase: input.supabase,
    contractorIntakeSubmissionId,
    accountOwnerUserId,
    actorUserId,
    notificationType: "contractor_intake_proposal_submitted",
    subject: "New Contractor Intake Proposal",
    body: "A contractor submitted an intake proposal pending internal finalization.",
    payload,
  });
}

export async function markInternalNewWorkNotificationsResolved(
  input: MarkInternalNewWorkNotificationsResolvedInput,
): Promise<void> {
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const contractorIntakeSubmissionId =
    String(input.contractorIntakeSubmissionId ?? "").trim() || null;
  const jobId = String(input.jobId ?? "").trim() || null;

  if (!accountOwnerUserId) {
    throw new Error("Missing accountOwnerUserId for new-work notification resolution");
  }

  if (!contractorIntakeSubmissionId && !jobId) {
    return;
  }

  const readAtIso = String(input.readAtIso ?? "").trim() || new Date().toISOString();

  if (contractorIntakeSubmissionId) {
    const { error } = await input.supabase
      .from("notifications")
      .update({ read_at: readAtIso })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("recipient_type", "internal")
      .in("notification_type", [...INTERNAL_NEW_WORK_PROPOSAL_NOTIFICATION_TYPES])
      .contains("payload", {
        contractor_intake_submission_id: contractorIntakeSubmissionId,
      })
      .is("read_at", null);

    if (error) throw error;
  }

  if (jobId) {
    const { error: byJobIdError } = await input.supabase
      .from("notifications")
      .update({ read_at: readAtIso })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("recipient_type", "internal")
      .in("notification_type", [...INTERNAL_NEW_WORK_JOB_NOTIFICATION_TYPES])
      .eq("job_id", jobId)
      .is("read_at", null);

    if (byJobIdError) throw byJobIdError;

    const { error: byPayloadJobIdError } = await input.supabase
      .from("notifications")
      .update({ read_at: readAtIso })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("recipient_type", "internal")
      .in("notification_type", [...INTERNAL_NEW_WORK_JOB_NOTIFICATION_TYPES])
      .contains("payload", { job_id: jobId })
      .is("read_at", null);

    if (byPayloadJobIdError) throw byPayloadJobIdError;
  }
}

export async function insertInternalNotificationForEvent(
  input: InsertInternalNotificationForEventInput
): Promise<void> {
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) return;
  if (!isInternalAwarenessEventType(input.eventType)) return;

  const actorUserId = String(input.actorUserId ?? "").trim() || null;
  if (!actorUserId) {
    throw new Error(`Missing actor user for internal notification event ${input.eventType}`);
  }

  const accountOwnerUserId = await resolveNotificationAccountOwnerUserId({
    jobId,
  });

  if (!accountOwnerUserId) {
    throw new Error(`Unable to resolve notification account owner for job ${jobId}`);
  }

  const payload: Record<string, unknown> = {
    event_type: input.eventType,
    source: "job_events",
  };

  if (actorUserId) payload.actor_user_id = actorUserId;

  await insertInternalAwarenessNotification({
    supabase: input.supabase,
    jobId,
    accountOwnerUserId,
    actorUserId,
    notificationType: input.eventType,
    subject: EVENT_TO_SUBJECT[input.eventType],
    body: EVENT_TO_BODY[input.eventType],
    payload,
  });
}

export async function findExistingContractorReportEmailDelivery(
  input: FindExistingContractorReportEmailDeliveryInput
): Promise<{ id: string; status: string | null } | null> {
  const dedupeKey = String(input.dedupeKey ?? "").trim();
  if (!dedupeKey) return null;

  const { data, error } = await input.supabase
    .from("notifications")
    .select("id, status")
    .eq("channel", "email")
    .eq("notification_type", "contractor_report_email")
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

export async function insertContractorReportEmailDeliveryNotification(
  input: InsertContractorReportEmailDeliveryNotificationInput
): Promise<{ id: string }> {
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) throw new Error("Missing jobId");

  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) throw new Error("Missing eventId");

  const contractorId = String(input.contractorId ?? "").trim() || null;
  const recipientEmail = String(input.recipientEmail ?? "").trim().toLowerCase() || null;
  const dedupeKey = String(input.dedupeKey ?? "").trim() || null;
  const errorDetail = String(input.errorDetail ?? "").trim() || null;

  const payload: Record<string, unknown> = {
    event_type: "contractor_report_sent",
    source: "job_events",
    event_id: eventId,
  };

  if (recipientEmail) payload.recipient_email = recipientEmail;
  if (dedupeKey) payload.dedupe_key = dedupeKey;
  if (errorDetail) payload.error_detail = errorDetail;

  const { data, error } = await input.supabase
    .from("notifications")
    .insert({
      job_id: jobId,
      recipient_type: "contractor",
      recipient_ref: contractorId,
      channel: "email",
      notification_type: "contractor_report_email",
      subject: input.subject,
      body: input.body,
      payload,
      status: input.status,
      sent_at: input.status === "sent" ? input.sentAt ?? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create contractor email notification row");

  return { id: String(data.id) };
}

export async function markContractorReportEmailDeliveryNotification(
  input: {
    supabase: any;
    notificationId: string;
    status: "sent" | "failed";
    sentAt?: string | null;
    errorDetail?: string | null;
  }
): Promise<void> {
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
      patch.body = `Contractor report email delivery failed: ${errorDetail}`;
    }
  }

  const { error } = await input.supabase
    .from("notifications")
    .update(patch)
    .eq("id", notificationId);

  if (error) throw error;
}
