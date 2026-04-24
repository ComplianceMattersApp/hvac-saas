"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  matchesInternalNotificationFilter,
  type InternalNotificationFilterKey,
} from "@/lib/notifications/internal-awareness";

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

const DEFAULT_READ_RETENTION_DAYS = 30;

async function requireScopedInternalNotificationContext() {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();

  if (!accountOwnerUserId) {
    throw new Error("NOT_AUTHORIZED");
  }

  return { supabase, accountOwnerUserId };
}

function isHiddenInternalNotificationType(value: string): boolean {
  return value === "contractor_report_sent";
}

function isProposalNotificationType(value: string): boolean {
  return (
    value === "contractor_intake_proposal_submitted" ||
    value === "internal_contractor_intake_proposal_email"
  );
}

function proposalSubmissionId(row: NotificationRow): string | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const id = String(payload.contractor_intake_submission_id ?? "").trim();
  return id || null;
}

function rankProposalVisibilityRow(row: NotificationRow): number {
  const type = String(row.notification_type ?? "").trim().toLowerCase();
  if (type === "contractor_intake_proposal_submitted") return 3;
  if (type === "internal_contractor_intake_proposal_email") return 2;
  return 1;
}

function dedupeProposalVisibilityRows(rows: NotificationRow[]): NotificationRow[] {
  const preferredByProposalId = new Map<string, NotificationRow>();
  const passthrough: NotificationRow[] = [];

  for (const row of rows) {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    if (!isProposalNotificationType(type)) {
      passthrough.push(row);
      continue;
    }

    const proposalId = proposalSubmissionId(row);
    if (!proposalId) {
      passthrough.push(row);
      continue;
    }

    const existing = preferredByProposalId.get(proposalId);
    if (!existing) {
      preferredByProposalId.set(proposalId, row);
      continue;
    }

    const existingRank = rankProposalVisibilityRow(existing);
    const candidateRank = rankProposalVisibilityRow(row);
    if (candidateRank > existingRank) {
      preferredByProposalId.set(proposalId, row);
      continue;
    }

    if (candidateRank === existingRank) {
      const existingUnread = existing.read_at === null;
      const candidateUnread = row.read_at === null;
      if (candidateUnread && !existingUnread) {
        preferredByProposalId.set(proposalId, row);
        continue;
      }

      if (candidateUnread === existingUnread) {
        const existingCreatedAt = Date.parse(existing.created_at);
        const candidateCreatedAt = Date.parse(row.created_at);
        if (Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt) && candidateCreatedAt > existingCreatedAt) {
          preferredByProposalId.set(proposalId, row);
        }
      }
    }
  }

  const merged = [...passthrough, ...preferredByProposalId.values()];
  merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return merged;
}

async function filterPendingProposalVisibilityRows(
  supabase: any,
  rows: NotificationRow[]
): Promise<NotificationRow[]> {
  const proposalIds = Array.from(
    new Set(
      rows
        .map((row) => {
          const type = String(row.notification_type ?? "").trim().toLowerCase();
          if (!isProposalNotificationType(type)) return null;
          return proposalSubmissionId(row);
        })
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!proposalIds.length) return rows;

  const { data, error } = await supabase
    .from("contractor_intake_submissions")
    .select("id, review_status")
    .in("id", proposalIds);

  if (error) throw error;

  const pendingIds = new Set(
    (data ?? [])
      .map((row: any) => {
        const id = String(row?.id ?? "").trim();
        const reviewStatus = String(row?.review_status ?? "").trim().toLowerCase();
        if (!id) return null;
        return reviewStatus === "pending" ? id : null;
      })
      .filter((id: string | null): id is string => Boolean(id))
  );

  return rows.filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    if (!isProposalNotificationType(type)) return true;
    const proposalId = proposalSubmissionId(row);
    if (!proposalId) return true;
    return pendingIds.has(proposalId);
  });
}

export async function listInternalNotifications(params: {
  limit?: number;
  onlyUnread?: boolean;
  filterKey?: InternalNotificationFilterKey | null;
} = {}): Promise<NotificationRowForUI[]> {
  const { supabase, accountOwnerUserId } = await requireScopedInternalNotificationContext();

  let query = supabase
    .from("notifications")
    .select(
      "id, job_id, recipient_type, channel, notification_type, subject, body, payload, status, read_at, created_at",
      { count: "exact" }
    )
    .eq("recipient_type", "internal")
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false });

  if (params.onlyUnread) {
    query = query.is("read_at", null);
  }

  const limit = params.limit ?? 50;
  const { data, error } = await query.limit(limit);

  if (error) throw error;

  const nowMs = Date.now();
  const readRetentionCutoffMs = nowMs - DEFAULT_READ_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const retainedRows = (data ?? []).filter((row) => {
    if (row.read_at === null) return true;
    const readAtMs = Date.parse(String(row.read_at ?? ""));
    if (!Number.isFinite(readAtMs)) return true;
    return readAtMs >= readRetentionCutoffMs;
  });

  const awarenessRows = retainedRows.filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    return !isHiddenInternalNotificationType(type);
  });

  const pendingProposalRows = await filterPendingProposalVisibilityRows(
    supabase,
    awarenessRows
  );

  const filteredRows = pendingProposalRows.filter((row) =>
    matchesInternalNotificationFilter(row.notification_type, params.filterKey)
  );

  const visibilityRows = dedupeProposalVisibilityRows(filteredRows).slice(0, limit);

  return visibilityRows.map(row => ({
    ...row,
    is_unread: row.read_at === null,
  }));
}

export async function markNotificationAsRead(input: {
  notificationId: string;
}): Promise<void> {
  const { supabase, accountOwnerUserId } = await requireScopedInternalNotificationContext();
  const notificationId = String(input.notificationId ?? "").trim();
  if (!notificationId) return;

  const { data: scopedNotification, error: scopedNotificationErr } = await supabase
    .from("notifications")
    .select("id")
    .eq("id", notificationId)
    .eq("recipient_type", "internal")
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedNotificationErr) throw scopedNotificationErr;
  if (!scopedNotification?.id) {
    throw new Error("NOT_AUTHORIZED");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_type", "internal")
    .eq("account_owner_user_id", accountOwnerUserId);

  if (error) throw error;

  revalidatePath("/ops");
  revalidatePath("/ops/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { supabase, accountOwnerUserId } = await requireScopedInternalNotificationContext();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_type", "internal")
    .eq("account_owner_user_id", accountOwnerUserId)
    .is("read_at", null);

  if (error) throw error;

  revalidatePath("/ops");
  revalidatePath("/ops/notifications");
  revalidatePath("/", "layout");
}

export async function getInternalUnreadNotificationCount(): Promise<number> {
  const { supabase, accountOwnerUserId } = await requireScopedInternalNotificationContext();

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, job_id, recipient_type, channel, notification_type, subject, body, payload, status, read_at, created_at"
    )
    .eq("recipient_type", "internal")
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false })
    .is("read_at", null);

  if (error) throw error;

  const awarenessRows = ((data ?? []) as NotificationRow[]).filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    return !isHiddenInternalNotificationType(type);
  });

  const pendingProposalRows = await filterPendingProposalVisibilityRows(
    supabase,
    awarenessRows
  );

  const visibilityRows = dedupeProposalVisibilityRows(pendingProposalRows);
  return visibilityRows.length;
}
