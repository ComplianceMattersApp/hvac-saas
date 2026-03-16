export type NotificationTriggerEventType =
  | "contractor_report_sent"
  | "retest_ready_requested"
  | "contractor_note";

type InsertInternalNotificationForEventInput = {
  supabase: any;
  jobId: string;
  eventType: NotificationTriggerEventType;
  actorUserId?: string | null;
};

const EVENT_TO_SUBJECT: Record<NotificationTriggerEventType, string> = {
  contractor_report_sent: "Contractor report sent",
  retest_ready_requested: "Retest ready requested",
  contractor_note: "Contractor note received",
};

const EVENT_TO_BODY: Record<NotificationTriggerEventType, string> = {
  contractor_report_sent: "A contractor report was sent to the portal.",
  retest_ready_requested: "Contractor requested retest readiness review.",
  contractor_note: "A contractor added a note.",
};

export async function insertInternalNotificationForEvent(
  input: InsertInternalNotificationForEventInput
): Promise<void> {
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) return;

  const actorUserId = String(input.actorUserId ?? "").trim() || null;

  const payload: Record<string, unknown> = {
    event_type: input.eventType,
    source: "job_events",
  };

  if (actorUserId) payload.actor_user_id = actorUserId;

  const { error } = await input.supabase.from("notifications").insert({
    job_id: jobId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: input.eventType,
    subject: EVENT_TO_SUBJECT[input.eventType],
    body: EVENT_TO_BODY[input.eventType],
    payload,
    status: "queued",
  });

  if (error) throw error;
}
