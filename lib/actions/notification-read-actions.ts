"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  matchesInternalNotificationFilter,
  type InternalNotificationFilterKey,
} from "@/lib/notifications/internal-awareness";

type NotificationRow = {
  id: string;
  job_id: string | null;
  recipient_ref: string | null;
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

type NotificationPayload = Record<string, unknown>;

const INTERNAL_NOTIFICATION_RECIPIENT_TYPES = ["internal", "internal_user"] as const;

export type ProposalEnrichment = {
  contractor_name: string | null;
  customer_name: string | null;
  address_summary: string | null;
  location_nickname: string | null;
  job_type_label: string | null;
  project_type_label: string | null;
  has_permit_details: boolean;
  has_notes: boolean;
  notes_preview: string | null;
};

type ProposalEnrichmentPatch = Partial<ProposalEnrichment>;

export type JobEnrichment = {
  job_title: string | null;
  customer_name: string | null;
  city: string | null;
  contractor_name: string | null;
};

export type NotificationRowForUI = NotificationRow & {
  is_unread: boolean;
  proposal_enrichment?: ProposalEnrichment | null;
  job_enrichment?: JobEnrichment | null;
};

export type NotificationAwarenessRow = {
  job_id: string | null;
  notification_type: string;
  created_at: string;
};

const DEFAULT_READ_RETENTION_DAYS = 30;

function isOpsNotificationTimingEnabled(): boolean {
  return process.env.OPS_TIMING_DEBUG === "true";
}

function finishOpsNotificationTiming(label: string, startedAt: number): void {
  if (!startedAt) return;
  console.log(`[${label}] ${Date.now() - startedAt}ms`);
}

async function trackOpsNotificationTiming<T>(label: string, value: PromiseLike<T>): Promise<T> {
  const startedAt = isOpsNotificationTimingEnabled() ? Date.now() : 0;
  try {
    return await value;
  } finally {
    finishOpsNotificationTiming(label, startedAt);
  }
}

function mergeProposalEnrichment(
  base: ProposalEnrichmentPatch,
  override: ProposalEnrichmentPatch,
): ProposalEnrichmentPatch {
  return {
    contractor_name: override.contractor_name ?? base.contractor_name ?? null,
    customer_name: override.customer_name ?? base.customer_name ?? null,
    address_summary: override.address_summary ?? base.address_summary ?? null,
    location_nickname: override.location_nickname ?? base.location_nickname ?? null,
    job_type_label: override.job_type_label ?? base.job_type_label ?? null,
    project_type_label: override.project_type_label ?? base.project_type_label ?? null,
    has_permit_details: override.has_permit_details ?? base.has_permit_details,
    has_notes: override.has_notes ?? base.has_notes,
    notes_preview: override.notes_preview ?? base.notes_preview ?? null,
  };
}

async function buildProposalEnrichmentMap(
  supabase: any,
  rows: NotificationRow[],
  accountOwnerUserId: string,
): Promise<Map<string, ProposalEnrichment>> {
  const enrichmentMap = new Map<string, ProposalEnrichment>();

  const proposalRowSubset = rows.filter((row) =>
    isProposalNotificationType(String(row.notification_type ?? "").trim().toLowerCase())
  );

  if (!proposalRowSubset.length) return enrichmentMap;

  // Collect submission IDs and contractor IDs already in the payload
  const submissionIds: string[] = [];
  const contractorIdBySubmissionId = new Map<string, string>();
  const payloadEnrichmentBySubmissionId = new Map<string, ProposalEnrichmentPatch>();

  for (const row of proposalRowSubset) {
    const submissionId = proposalSubmissionId(row);
    if (!submissionId) continue;
    const payload = normalizeNotificationPayload(row.payload);
    const contractorId =
      firstNonEmptyPayloadValue(payload, ["contractor_id", "contractorId"]) ?? "";
    const payloadPatch = proposalEnrichmentFromPayload(payload);

    payloadEnrichmentBySubmissionId.set(
      submissionId,
      mergeProposalEnrichment(payloadEnrichmentBySubmissionId.get(submissionId) ?? {}, payloadPatch),
    );

    submissionIds.push(submissionId);
    if (contractorId) contractorIdBySubmissionId.set(submissionId, contractorId);
  }

  const uniqueSubmissionIds = Array.from(new Set(submissionIds));
  if (!uniqueSubmissionIds.length) return enrichmentMap;

  const { data: submissions } = await supabase
    .from("contractor_intake_submissions")
    .select(
      "id, contractor_id, proposed_customer_first_name, proposed_customer_last_name, proposed_address_line1, proposed_city, proposed_state, proposed_zip, proposed_location_nickname, proposed_job_type, proposed_project_type, proposed_job_notes, proposed_permit_number, proposed_jurisdiction, proposed_permit_date"
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .in("id", uniqueSubmissionIds);

  const submissionById = new Map<string, Record<string, unknown>>();
  for (const sub of (submissions ?? []) as Record<string, unknown>[]) {
    const id = String(sub.id ?? "").trim();
    if (id) submissionById.set(id, sub);
  }

  // Batch-fetch contractor names
  const contractorIdsFromSubmissions = Array.from(submissionById.values())
    .map((sub) => String(sub.contractor_id ?? "").trim())
    .filter(Boolean);
  const uniqueContractorIds = Array.from(
    new Set([
      ...Array.from(contractorIdBySubmissionId.values()).filter(Boolean),
      ...contractorIdsFromSubmissions,
    ])
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
    const payloadPatch = payloadEnrichmentBySubmissionId.get(submissionId) ?? {};
    const sub = submissionById.get(submissionId);
    const contractorId =
      contractorIdBySubmissionId.get(submissionId) ??
      String(sub?.contractor_id ?? "").trim();
    const contractorName = contractorNameById.get(contractorId) || payloadPatch.contractor_name || null;

    const firstName = String(sub?.proposed_customer_first_name ?? "").trim();
    const lastName = String(sub?.proposed_customer_last_name ?? "").trim();
    const customerName = [firstName, lastName].filter(Boolean).join(" ") || payloadPatch.customer_name || null;

    const addressLine = String(sub?.proposed_address_line1 ?? "").trim();
    const city = String(sub?.proposed_city ?? "").trim();
    const state = String(sub?.proposed_state ?? "").trim();
    const zip = String(sub?.proposed_zip ?? "").trim();
    const cityState = [city, state].filter(Boolean).join(", ");
    const localitySummary = [cityState, zip].filter(Boolean).join(" ");
    const addressSummary =
      [addressLine, localitySummary].filter(Boolean).join(", ") ||
      localitySummary ||
      payloadPatch.address_summary ||
      null;

    const locationNickname =
      String(sub?.proposed_location_nickname ?? "").trim() || payloadPatch.location_nickname || null;

    const rawJobType = String(sub?.proposed_job_type ?? "").trim().toLowerCase();
    const jobTypeLabel =
      rawJobType === "ecc" ? "ECC" :
      rawJobType === "service" ? "Service" :
      rawJobType ||
      payloadPatch.job_type_label ||
      null;

    const rawProjectType = String(sub?.proposed_project_type ?? "").trim().toLowerCase();
    const projectTypeLabel = rawProjectType
      ? rawProjectType
          .split(/[_\s]+/)
          .filter(Boolean)
          .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
          .join(" ")
      : payloadPatch.project_type_label || null;

    const rawNotes = String(sub?.proposed_job_notes ?? "").trim();
    const notesPreview = rawNotes
      ? rawNotes.length > 100 ? rawNotes.slice(0, 100) + "\u2026" : rawNotes
      : payloadPatch.notes_preview || null;

    const hasPermitDetails = Boolean(
      String(sub?.proposed_permit_number ?? "").trim() ||
      String(sub?.proposed_jurisdiction ?? "").trim() ||
      String(sub?.proposed_permit_date ?? "").trim()
    ) || Boolean(payloadPatch.has_permit_details);

    enrichmentMap.set(submissionId, {
      contractor_name: contractorName,
      customer_name: customerName,
      address_summary: addressSummary,
      location_nickname: locationNickname,
      job_type_label: jobTypeLabel,
      project_type_label: projectTypeLabel,
      has_permit_details: hasPermitDetails,
      has_notes: Boolean(rawNotes) || Boolean(payloadPatch.has_notes),
      notes_preview: notesPreview,
    });
  }

  return enrichmentMap;
}

async function buildJobEnrichmentMap(
  supabase: any,
  rows: NotificationRow[]
): Promise<Map<string, JobEnrichment>> {
  const enrichmentMap = new Map<string, JobEnrichment>();

  const jobRows = rows.filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    return !isProposalNotificationType(type) && Boolean(notificationJobId(row));
  });

  const uniqueJobIds = Array.from(
    new Set(jobRows.map((row) => notificationJobId(row)).filter((id): id is string => Boolean(id)))
  );
  if (!uniqueJobIds.length) return enrichmentMap;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, customer_first_name, customer_last_name, city, contractor_id")
    .in("id", uniqueJobIds);

  // Collect contractor IDs from jobs for contractor name lookup
  const contractorIdByJobId = new Map<string, string>();
  for (const job of (jobs ?? []) as Record<string, unknown>[]) {
    const id = String(job.id ?? "").trim();
    const cid = String(job.contractor_id ?? "").trim();
    if (id && cid) contractorIdByJobId.set(id, cid);
  }

  const uniqueContractorIds = Array.from(new Set(Array.from(contractorIdByJobId.values()).filter(Boolean)));
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

  for (const job of (jobs ?? []) as Record<string, unknown>[]) {
    const id = String(job.id ?? "").trim();
    if (!id) continue;

    const firstName = String(job.customer_first_name ?? "").trim();
    const lastName = String(job.customer_last_name ?? "").trim();
    const customerName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const contractorId = contractorIdByJobId.get(id) ?? "";
    const contractorName = contractorNameById.get(contractorId) || null;

    enrichmentMap.set(id, {
      job_title: String(job.title ?? "").trim() || null,
      customer_name: customerName,
      city: String(job.city ?? "").trim() || null,
      contractor_name: contractorName,
    });
  }

  return enrichmentMap;
}

async function requireScopedInternalNotificationContext() {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();

  if (!accountOwnerUserId) {
    throw new Error("NOT_AUTHORIZED");
  }

  return { supabase, accountOwnerUserId, userId: String(userId ?? "").trim() };
}

function isNotificationVisibleToUser(row: Pick<NotificationRow, "recipient_ref">, userId: string): boolean {
  const recipientRef = String(row.recipient_ref ?? "").trim();
  if (!recipientRef) return true;
  return recipientRef === String(userId ?? "").trim();
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

function normalizeNotificationPayload(value: unknown): NotificationPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as NotificationPayload;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as NotificationPayload;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function firstNonEmptyPayloadValue(payload: NotificationPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(payload[key] ?? "").trim();
    if (value) return value;
  }
  return null;
}

function proposalEnrichmentFromPayload(payload: NotificationPayload): ProposalEnrichmentPatch {
  const customerName = firstNonEmptyPayloadValue(payload, [
    "proposal_customer_name",
    "customer_name",
    "proposed_customer_name",
  ]);

  const locationNickname = firstNonEmptyPayloadValue(payload, [
    "proposal_location_nickname",
    "location_nickname",
    "proposed_location_nickname",
  ]);

  const addressSummary = firstNonEmptyPayloadValue(payload, [
    "proposal_location_summary",
    "location_summary",
    "address_summary",
    "proposed_address_summary",
  ]);

  const notesPreview = firstNonEmptyPayloadValue(payload, [
    "proposal_notes_preview",
    "notes_preview",
  ]);

  return {
    contractor_name: firstNonEmptyPayloadValue(payload, ["proposal_contractor_name", "contractor_name"]),
    customer_name: customerName,
    address_summary: addressSummary,
    location_nickname: locationNickname,
    job_type_label: firstNonEmptyPayloadValue(payload, ["proposal_job_type_label", "job_type_label"]),
    project_type_label: firstNonEmptyPayloadValue(payload, ["proposal_project_type_label", "project_type_label"]),
    has_permit_details: Boolean(
      firstNonEmptyPayloadValue(payload, [
        "proposal_permit_number",
        "proposal_permit_jurisdiction",
        "proposal_permit_date",
      ]),
    ),
    has_notes: Boolean(notesPreview),
    notes_preview: notesPreview,
  };
}

function proposalSubmissionId(row: NotificationRow): string | null {
  const payload = normalizeNotificationPayload(row.payload);
  return firstNonEmptyPayloadValue(payload, [
    "contractor_intake_submission_id",
    "contractorIntakeSubmissionId",
    "submission_id",
  ]);
}

function notificationJobId(row: NotificationRow): string | null {
  const fromRow = String(row.job_id ?? "").trim();
  if (fromRow) return fromRow;

  const payload = normalizeNotificationPayload(row.payload);
  return firstNonEmptyPayloadValue(payload, ["job_id", "jobId"]);
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

function rankNewWorkRequestVisibilityRow(row: NotificationRow): number {
  const type = String(row.notification_type ?? "").trim().toLowerCase();
  if (type === "contractor_intake_proposal_submitted") return 4;
  if (type === "internal_contractor_intake_proposal_email") return 3;
  if (type === "contractor_job_created") return 2;
  if (type === "internal_contractor_job_intake_email") return 1;
  return 0;
}

function dedupeJobIntakeVisibilityRows(rows: NotificationRow[]): NotificationRow[] {
  const preferredByJobId = new Map<string, NotificationRow>();
  const passthrough: NotificationRow[] = [];

  for (const row of rows) {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    if (type !== "contractor_job_created" && type !== "internal_contractor_job_intake_email") {
      passthrough.push(row);
      continue;
    }

    const jobId = notificationJobId(row);
    if (!jobId) {
      passthrough.push(row);
      continue;
    }

    const existing = preferredByJobId.get(jobId);
    if (!existing) {
      preferredByJobId.set(jobId, row);
      continue;
    }

    const existingRank = rankNewWorkRequestVisibilityRow(existing);
    const candidateRank = rankNewWorkRequestVisibilityRow(row);

    if (candidateRank > existingRank) {
      preferredByJobId.set(jobId, row);
      continue;
    }

    if (candidateRank === existingRank) {
      const existingUnread = existing.read_at === null;
      const candidateUnread = row.read_at === null;
      if (candidateUnread && !existingUnread) {
        preferredByJobId.set(jobId, row);
        continue;
      }

      if (candidateUnread === existingUnread) {
        const existingCreatedAt = Date.parse(existing.created_at);
        const candidateCreatedAt = Date.parse(row.created_at);
        if (
          Number.isFinite(candidateCreatedAt) &&
          Number.isFinite(existingCreatedAt) &&
          candidateCreatedAt > existingCreatedAt
        ) {
          preferredByJobId.set(jobId, row);
        }
      }
    }
  }

  const merged = [...passthrough, ...preferredByJobId.values()];
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

function isJobNewWorkNotificationType(type: string): boolean {
  return type === "contractor_job_created" || type === "internal_contractor_job_intake_email";
}

function isJobNewWorkStillActionable(job: {
  status: string | null;
  ops_status: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
}): boolean {
  const status = String(job.status ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "completed") return false;

  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  if (opsStatus === "scheduled") return false;

  const hasScheduleWindow =
    Boolean(String(job.scheduled_date ?? "").trim()) ||
    Boolean(String(job.window_start ?? "").trim()) ||
    Boolean(String(job.window_end ?? "").trim());

  if (hasScheduleWindow) return false;
  return true;
}

async function filterActiveJobNewWorkVisibilityRows(
  supabase: any,
  rows: NotificationRow[]
): Promise<NotificationRow[]> {
  const jobIds = Array.from(
    new Set(
      rows
        .map((row) => {
          const type = String(row.notification_type ?? "").trim().toLowerCase();
          if (!isJobNewWorkNotificationType(type)) return null;
          return notificationJobId(row);
        })
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!jobIds.length) return rows;

  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, ops_status, scheduled_date, window_start, window_end")
    .in("id", jobIds);

  if (error) throw error;

  const jobStateById = new Map<
    string,
    {
      status: string | null;
      ops_status: string | null;
      scheduled_date: string | null;
      window_start: string | null;
      window_end: string | null;
    }
  >();

  for (const row of data ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    if (!id) continue;
    jobStateById.set(id, {
      status: (row as any)?.status ?? null,
      ops_status: (row as any)?.ops_status ?? null,
      scheduled_date: (row as any)?.scheduled_date ?? null,
      window_start: (row as any)?.window_start ?? null,
      window_end: (row as any)?.window_end ?? null,
    });
  }

  return rows.filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    if (!isJobNewWorkNotificationType(type)) return true;

    const jobId = notificationJobId(row);
    if (!jobId) return true;

    // Preserve signal when job row is not currently readable.
    const state = jobStateById.get(jobId);
    if (!state) return true;

    return isJobNewWorkStillActionable(state);
  });
}

export async function listInternalNotifications(params: {
  limit?: number;
  onlyUnread?: boolean;
  filterKey?: InternalNotificationFilterKey | null;
} = {}): Promise<NotificationRowForUI[]> {
  const { supabase, accountOwnerUserId, userId } = await requireScopedInternalNotificationContext();
  const admin = createAdminClient();

  let query = supabase
    .from("notifications")
    .select(
      "id, job_id, recipient_ref, recipient_type, channel, notification_type, subject, body, payload, status, read_at, created_at",
      { count: "exact" }
    )
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false });

  if (params.onlyUnread) {
    query = query.is("read_at", null);
  }

  const limit = params.limit ?? 50;
  const { data, error } = await trackOpsNotificationTiming(
    "ops:notifications:fetch",
    query.limit(limit)
  );

  if (error) throw error;

  const shouldTrackMapAndFilter = isOpsNotificationTimingEnabled();
  let mapAndFilterMs = 0;
  const mapAndFilterStartedAt = shouldTrackMapAndFilter ? Date.now() : 0;
  const nowMs = Date.now();
  const readRetentionCutoffMs = nowMs - DEFAULT_READ_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const recipientScopedRows = (data ?? []).filter((row) => isNotificationVisibleToUser(row as NotificationRow, userId));

  const retainedRows = recipientScopedRows.filter((row) => {
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

  const shouldApplyActionableNewWorkFilter =
    params.filterKey === "new_job_notifications" && Boolean(params.onlyUnread);
  const sourceRows = shouldApplyActionableNewWorkFilter
    ? await filterActiveJobNewWorkVisibilityRows(supabase, pendingProposalRows)
    : pendingProposalRows;

  const filteredRows = sourceRows.filter((row) =>
    matchesInternalNotificationFilter(row.notification_type, params.filterKey)
  );

  const visibilityRows = dedupeProposalVisibilityRows(filteredRows).slice(0, limit);
  if (mapAndFilterStartedAt) mapAndFilterMs += Date.now() - mapAndFilterStartedAt;

  const proposalEnrichmentMap = await trackOpsNotificationTiming(
    "ops:notifications:proposalEnrichment",
    buildProposalEnrichmentMap(admin, visibilityRows, accountOwnerUserId)
  );
  const jobEnrichmentMap = await trackOpsNotificationTiming(
    "ops:notifications:jobEnrichment",
    buildJobEnrichmentMap(supabase, visibilityRows)
  );

  const finalMapStartedAt = shouldTrackMapAndFilter ? Date.now() : 0;
  const rowsForUI = visibilityRows.map(row => {
    const submissionId = proposalSubmissionId(row);
    const enrichment = (submissionId && proposalEnrichmentMap.get(submissionId)) || null;
    const jobId = notificationJobId(row);
    const jobEnrichment = (jobId && jobEnrichmentMap.get(jobId)) || null;
    return {
      ...row,
      is_unread: row.read_at === null,
      proposal_enrichment: enrichment,
      job_enrichment: jobEnrichment,
    };
  });
  if (finalMapStartedAt) mapAndFilterMs += Date.now() - finalMapStartedAt;
  if (shouldTrackMapAndFilter) console.log(`[ops:notifications:mapAndFilter] ${mapAndFilterMs}ms`);
  return rowsForUI;
}

export async function listInternalContractorUpdateAwareness(params: {
  limit?: number;
  onlyUnread?: boolean;
} = {}): Promise<NotificationAwarenessRow[]> {
  const { supabase, accountOwnerUserId, userId } = await requireScopedInternalNotificationContext();

  let query = supabase
    .from("notifications")
    .select("job_id, recipient_ref, notification_type, read_at, created_at")
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false });

  const onlyUnread = params.onlyUnread ?? true;
  if (onlyUnread) {
    query = query.is("read_at", null);
  }

  const limit = params.limit ?? 100;
  const { data, error } = await trackOpsNotificationTiming(
    "ops:notifications:fetch",
    query.limit(limit)
  );

  if (error) throw error;

  const shouldTrackMapAndFilter = isOpsNotificationTimingEnabled();
  const mapAndFilterStartedAt = shouldTrackMapAndFilter ? Date.now() : 0;
  const rows = ((data ?? []) as Array<{
    job_id: string | null;
    recipient_ref: string | null;
    notification_type: string | null;
    created_at: string | null;
  }>).filter((row) => isNotificationVisibleToUser(row as NotificationRow, userId));

  const contractorUpdateRows = rows
    .filter((row) =>
      matchesInternalNotificationFilter(
        String(row.notification_type ?? "").trim().toLowerCase(),
        "contractor_updates"
      )
    )
    .map((row) => ({
      job_id: row.job_id ? String(row.job_id).trim() : null,
      notification_type: String(row.notification_type ?? "").trim(),
      created_at: String(row.created_at ?? "").trim(),
    }));

  if (shouldTrackMapAndFilter) {
    console.log(`[ops:notifications:mapAndFilter] ${Date.now() - mapAndFilterStartedAt}ms`);
    // Compatibility label for ops timing tables when enrichment is intentionally skipped.
    console.log("[ops:notifications:jobEnrichment] 0ms");
  }

  return contractorUpdateRows;
}

export async function listInternalNewWorkRequestAwareness(params: {
  limit?: number;
  onlyUnread?: boolean;
} = {}): Promise<NotificationAwarenessRow[]> {
  const { supabase, accountOwnerUserId, userId } = await requireScopedInternalNotificationContext();

  let query = supabase
    .from("notifications")
    .select(
      "id, job_id, recipient_ref, recipient_type, channel, notification_type, subject, body, payload, status, read_at, created_at"
    )
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false });

  const onlyUnread = params.onlyUnread ?? true;
  if (onlyUnread) {
    query = query.is("read_at", null);
  }

  const limit = params.limit ?? 100;
  const { data, error } = await trackOpsNotificationTiming(
    "ops:notifications:fetch",
    query.limit(limit)
  );

  if (error) throw error;

  const rows = ((data ?? []) as NotificationRow[]).filter((row) => isNotificationVisibleToUser(row, userId));
  const newWorkRows = rows.filter((row) =>
    matchesInternalNotificationFilter(
      String(row.notification_type ?? "").trim().toLowerCase(),
      "new_job_notifications"
    )
  );

  const pendingProposalRows = await filterPendingProposalVisibilityRows(
    supabase,
    newWorkRows
  );
  const activeJobNewWorkRows = await filterActiveJobNewWorkVisibilityRows(
    supabase,
    pendingProposalRows
  );
  const dedupedProposalRows = dedupeProposalVisibilityRows(activeJobNewWorkRows);
  const dedupedRows = dedupeJobIntakeVisibilityRows(dedupedProposalRows).slice(0, limit);

  return dedupedRows.map((row) => ({
    job_id: row.job_id ? String(row.job_id).trim() : null,
    notification_type: String(row.notification_type ?? "").trim(),
    created_at: String(row.created_at ?? "").trim(),
  }));
}

export async function markNotificationAsRead(input: {
  notificationId: string;
}): Promise<void> {
  const { supabase, accountOwnerUserId, userId } = await requireScopedInternalNotificationContext();
  const notificationId = String(input.notificationId ?? "").trim();
  if (!notificationId) return;

  const { data: scopedNotification, error: scopedNotificationErr } = await supabase
    .from("notifications")
    .select("id, recipient_ref")
    .eq("id", notificationId)
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedNotificationErr) throw scopedNotificationErr;
  if (!scopedNotification?.id || !isNotificationVisibleToUser(scopedNotification as NotificationRow, userId)) {
    throw new Error("NOT_AUTHORIZED");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId);

  if (error) throw error;

  revalidatePath("/ops");
  revalidatePath("/ops/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { supabase, accountOwnerUserId, userId } = await requireScopedInternalNotificationContext();

  const { data: unreadRows, error: unreadErr } = await supabase
    .from("notifications")
    .select("id, recipient_ref")
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .is("read_at", null);

  if (unreadErr) throw unreadErr;

  const targetIds = (unreadRows ?? [])
    .filter((row: any) => isNotificationVisibleToUser(row as NotificationRow, userId))
    .map((row: any) => String(row?.id ?? "").trim())
    .filter(Boolean);

  if (targetIds.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", targetIds);

    if (error) throw error;
  }

  revalidatePath("/ops");
  revalidatePath("/ops/notifications");
  revalidatePath("/", "layout");
}

export async function getInternalUnreadNotificationBadgeCount(params: {
  supabase?: any;
  accountOwnerUserId?: string | null;
} = {}): Promise<number> {
  let supabase = params.supabase;
  let accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  let currentUserId = "";

  if (!supabase || !accountOwnerUserId) {
    const context = await requireScopedInternalNotificationContext();
    supabase = context.supabase;
    accountOwnerUserId = context.accountOwnerUserId;
    currentUserId = context.userId;
  } else {
    const { userId } = await requireInternalUser({ supabase });
    currentUserId = String(userId ?? "").trim();
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_ref, notification_type, payload, read_at, created_at")
    .in("recipient_type", INTERNAL_NOTIFICATION_RECIPIENT_TYPES)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false })
    .is("read_at", null);

  if (error) throw error;

  const awarenessRows = ((data ?? []) as NotificationRow[])
    .filter((row) => isNotificationVisibleToUser(row, currentUserId))
    .filter((row) => {
    const type = String(row.notification_type ?? "").trim().toLowerCase();
    return !isHiddenInternalNotificationType(type);
    });

  const pendingProposalRows = await filterPendingProposalVisibilityRows(
    supabase,
    awarenessRows as NotificationRow[]
  );

  const activeJobNewWorkRows = await filterActiveJobNewWorkVisibilityRows(
    supabase,
    pendingProposalRows
  );

  const visibilityRows = dedupeProposalVisibilityRows(activeJobNewWorkRows);
  return visibilityRows.length;
}

export async function getInternalUnreadNotificationCount(): Promise<number> {
  return getInternalUnreadNotificationBadgeCount();
}
