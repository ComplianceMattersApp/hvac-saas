import { revalidatePath } from "next/cache";
import { resolveNotificationAccountOwnerUserId } from "@/lib/notifications/account-owner";

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
