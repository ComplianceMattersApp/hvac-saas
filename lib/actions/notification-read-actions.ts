"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";

type NotificationRow = {
  id: string;
  job_id: string | null;
  recipient_type: string;
  channel: string;
  notification_type: string;
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  status: string;
  read_at: string | null;
  created_at: string;
};

export type NotificationRowForUI = NotificationRow & {
  is_unread: boolean;
};

export async function listInternalNotifications(params: {
  limit?: number;
  onlyUnread?: boolean;
} = {}): Promise<NotificationRowForUI[]> {
  // Ensure internal user access
  await requireInternalUser();

  const supabase = await createClient();

  let query = supabase
    .from("notifications")
    .select(
      "id, job_id, recipient_type, channel, notification_type, subject, body, payload, status, read_at, created_at",
      { count: "exact" }
    )
    .eq("recipient_type", "internal")
    .order("created_at", { ascending: false });

  if (params.onlyUnread) {
    query = query.is("read_at", null);
  }

  const limit = params.limit ?? 50;
  const { data, error } = await query.limit(limit);

  if (error) throw error;

  return (data ?? []).map(row => ({
    ...row,
    is_unread: row.read_at === null,
  }));
}

export async function markNotificationAsRead(input: {
  notificationId: string;
}): Promise<void> {
  // Ensure internal user access
  await requireInternalUser();

  const supabase = await createClient();
  const notificationId = String(input.notificationId ?? "").trim();
  if (!notificationId) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_type", "internal");

  if (error) throw error;
}

export async function markAllNotificationsAsRead(): Promise<void> {
  // Ensure internal user access
  await requireInternalUser();

  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_type", "internal")
    .is("read_at", null);

  if (error) throw error;
}
