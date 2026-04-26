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

export type ProposalEnrichment = {
  contractor_name: string | null;
  customer_name: string | null;
  address_summary: string | null;
  job_type_label: string | null;
  notes_preview: string | null;
};

export type NotificationRowForUI = NotificationRow & {
  is_unread: boolean;
  proposal_enrichment?: ProposalEnrichment | null;
};

const DEFAULT_READ_RETENTION_DAYS = 30;

async function buildProposalEnrichmentMap(
  supabase: any,
  rows: NotificationRow[]
): Promise<Map<string, ProposalEnrichment>> {
  const enrichmentMap = new Map<string, ProposalEnrichment>();

  const proposalRowSubset = rows.filter((row) =>
    isProposalNotificationType(String(row.notification_type ?? "").trim().toLowerCase())
  );

  if (!proposalRowSubset.length) return enrichmentMap;

  // Collect submission IDs and contractor IDs already in the payload
  const submissionIds: string[] = [];
  const contractorIdBySubmissionId = new Map<string, string>();

  for (const row of proposalRowSubset) {
    const submissionId = proposalSubmissionId(row);
    if (!submissionId) continue;
    const contractorId = String((row.payload ?? {}).contractor_id ?? "").trim();
    submissionIds.push(submissionId);
    if (contractorId) contractorIdBySubmissionId.set(submissionId, contractorId);
  }

  const uniqueSubmissionIds = Array.from(new Set(submissionIds));
  if (!uniqueSubmissionIds.length) return enrichmentMap;

  const { data: submissions } = await supabase
    .from("contractor_intake_submissions")
    .select(
      "id, proposed_customer_first_name, proposed_customer_last_name, proposed_address_line1, proposed_city, proposed_job_type, proposed_job_notes"
    )
    .in("id", uniqueSubmissionIds);

  const submissionById = new Map<string, Record<string, unknown>>();
  for (const sub of (submissions ?? []) as Record<string, unknown>[]) {
    const id = String(sub.id ?? "").trim();
    if (id) submissionById.set(id, sub);
  }

  // Batch-fetch contractor names
  const uniqueContractorIds = Array.from(
    new Set(Array.from(contractorIdBySubmissionId.values()).filter(Boolean))
  );
  const contractorNameById = new Map<string, string>();
  if (uniqueContractorIds.length) {
    const { data: contractors } = await supabase
      .from("contractors")
      .select("id, name")
      .in("id", uniqueContractorIds);
    for (const c of (contractors ?? []) as Record<string, unknown>[]) {
      const id = String(c.id ?? "").trim();
      const name = String(c.name ?? "").trim();
      if (id && name) contractorNameById.set(id, name);
    }
  }

  for (const submissionId of uniqueSubmissionIds) {
    const sub = submissionById.get(submissionId);
    const contractorId = contractorIdBySubmissionId.get(submissionId) ?? "";
    const contractorName = contractorNameById.get(contractorId) || null;

    const firstName = String(sub?.proposed_customer_first_name ?? "").trim();
    const lastName = String(sub?.proposed_customer_last_name ?? "").trim();
    const customerName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const addressLine = String(sub?.proposed_address_line1 ?? "").trim();
    const city = String(sub?.proposed_city ?? "").trim();
    const addressSummary = [addressLine, city].filter(Boolean).join(", ") || null;

    const rawJobType = String(sub?.proposed_job_type ?? "").trim().toLowerCase();
    const jobTypeLabel =
      rawJobType === "ecc" ? "ECC" :
      rawJobType === "service" ? "Service" :
      rawJobType || null;

    const rawNotes = String(sub?.proposed_job_notes ?? "").trim();
    const notesPreview = rawNotes
      ? rawNotes.length > 100 ? rawNotes.slice(0, 100) + "\u2026" : rawNotes
      : null;

    enrichmentMap.set(submissionId, {
      contractor_name: contractorName,
      customer_name: customerName,
      address_summary: addressSummary,
      job_type_label: jobTypeLabel,
      notes_preview: notesPreview,
    });
  }

  return enrichmentMap;
}

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

  const statusByProposalId = new Map<string, string>();
  for (const row of data ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    if (!id) continue;
    const reviewStatus = String((row as any)?.review_status ?? "").trim().toLowerCase();
    statusByProposalId.set(id, reviewStatus);
  }

  return rows.filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    if (!isProposalNotificationType(type)) return true;

    const proposalId = proposalSubmissionId(row);
    if (!proposalId) return true;

    // If the proposal row cannot be read in this session (for example, due to
    // tighter RLS on contractor_intake_submissions), keep the visibility signal
    // instead of silently dropping it from ribbon/feed unread surfaces.
    const reviewStatus = statusByProposalId.get(proposalId);
    if (!reviewStatus) return true;

    return reviewStatus === "pending";
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

  const proposalEnrichmentMap = await buildProposalEnrichmentMap(supabase, visibilityRows);

  return visibilityRows.map(row => {
    const submissionId = proposalSubmissionId(row);
    const enrichment = (submissionId && proposalEnrichmentMap.get(submissionId)) || null;
    return {
      ...row,
      is_unread: row.read_at === null,
      proposal_enrichment: enrichment,
    };
  });
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
