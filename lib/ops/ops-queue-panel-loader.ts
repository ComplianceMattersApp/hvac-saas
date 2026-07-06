import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBusinessDateUS, displayWindowLA, startOfTodayUtcIsoLA, startOfTomorrowUtcIsoLA } from "@/lib/utils/schedule-la";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { getCloseoutNeeds, getCloseoutQueueNextStepLabel } from "@/lib/utils/closeout";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { canShowExternalInvoiceSentAction, listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import {
  buildLatestCustomerAttemptByJob,
  resolveRecentAttemptDisplay,
} from "@/lib/ops/recent-attempt-display";
import { OPS_BOARD_SORT_OPTIONS, sortOpsBoardRows, type OpsBoardSortKey } from "@/lib/ops/ops-board-sorting";
import {
  buildOpsBoardReasonOptions,
  getOpsBoardReasonLabel,
  getOpsBoardVisibleReason,
  type OpsBoardVisibleReason,
} from "@/lib/ops/ops-board-reasons";
import { formatAssignmentSummaryForJob, getOpsQueueCardStatusReason } from "@/lib/ops/focused-queues";
import { buildOpsStatusEnteredAtByJob, resolveLifecycleDaysAgingLabel } from "@/lib/utils/lifecycle-aging";
import type { OpsBoardActiveQueueRow } from "@/app/ops/_components/OpsBoardActiveQueuePanel";
import type {
  CloseoutRowView,
  FollowUpRowView,
  GenericRowView,
  NeedsSchedulingRowView,
  OpsQueueRowView,
} from "@/app/ops/_components/OpsQueueRowCard";

export type OpsQueuePanelJobBucket = "need_to_schedule" | "field_work" | "waiting" | "exceptions" | "follow_ups" | "closeout";

const WORKSPACE_SELECT =
  "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by, ops_board_failure_note, permit_number, jurisdiction, permit_date, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";

function closeoutProjectionInputs(rows: any[]) {
  return (rows ?? []).map((job: any) => ({
    id: String(job?.id ?? "").trim(),
    field_complete: job?.field_complete,
    job_type: job?.job_type,
    ops_status: job?.ops_status,
    pending_info_reason: job?.pending_info_reason,
    on_hold_reason: job?.on_hold_reason,
    permit_number: job?.permit_number,
    invoice_complete: job?.invoice_complete,
    billing_disposition: job?.billing_disposition,
    certs_complete: job?.certs_complete,
  }));
}

async function loadJobRowsForBucket(params: {
  supabase: SupabaseClient;
  accountOwnerUserId: string;
  bucket: OpsQueuePanelJobBucket;
  boardSort: OpsBoardSortKey;
  previewLimit: number;
}) {
  const { supabase, accountOwnerUserId, bucket, boardSort, previewLimit } = params;

  if (bucket === "closeout") {
    const closeoutRowsRes = await supabase
      .from("jobs")
      .select(WORKSPACE_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .order("created_at", { ascending: true })
      .limit(500);
    if (closeoutRowsRes.error) throw closeoutRowsRes.error;

    const closeoutSourceRows = (closeoutRowsRes.data ?? []) as any[];
    const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase,
      accountOwnerUserId,
      jobs: closeoutProjectionInputs(closeoutSourceRows),
    });

    return {
      rows: sortOpsBoardRows(
        listCloseoutQueueJobs(closeoutSourceRows, (job: any) => projectionsByJobId.get(String(job?.id ?? "").trim()) ?? job),
        boardSort
      ).slice(0, 10),
      closeoutProjectionByJob: projectionsByJobId,
    };
  }

  let queueQ = supabase
    .from("jobs")
    .select(WORKSPACE_SELECT)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(previewLimit);

  if (bucket === "need_to_schedule") {
    queueQ = queueQ.eq("status", "open").eq("ops_status", "need_to_schedule");
  } else if (bucket === "field_work") {
    const wsStartTodayUtc = startOfTodayUtcIsoLA();
    const wsStartTomorrowUtc = startOfTomorrowUtcIsoLA();
    queueQ = queueQ
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .gte("scheduled_date", wsStartTodayUtc)
      .lt("scheduled_date", wsStartTomorrowUtc)
      .order("window_start", { ascending: true });
  } else if (bucket === "waiting") {
    queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["pending_info", "on_hold", "waiting", "pending_office_review"]);
  } else if (bucket === "exceptions") {
    queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["failed", "retest_needed", "pending_office_review", "problem"]);
  } else if (bucket === "follow_ups") {
    queueQ = queueQ
      .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null")
      .order("follow_up_date", { ascending: true, nullsFirst: false });
  }

  const queueRes = await queueQ;
  if (queueRes.error) throw queueRes.error;
  return { rows: sortOpsBoardRows((queueRes.data ?? []) as any[], boardSort), closeoutProjectionByJob: new Map<string, any>() };
}

function rowContractorFocusId(row: any) {
  return String(row?.contractor_id ?? "").trim();
}

function filterRowsByContractorFocus(rows: any[], contractorFocusIds: string[], internalWorkId: string) {
  if (contractorFocusIds.length === 0) return rows;
  const set = new Set(contractorFocusIds);
  return rows.filter((row) => {
    const contractorId = rowContractorFocusId(row);
    return contractorId ? set.has(contractorId) : set.has(internalWorkId);
  });
}

function toEpochMs(value?: string | null) {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compactDurationSince(value?: string | null) {
  const startMs = toEpochMs(value);
  if (!startMs) return "Unknown";
  const elapsedMs = Math.max(0, Date.now() - startMs);
  const days = Math.floor(elapsedMs / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  return "Today";
}

function formatWorkspaceTimestamp(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}

function formatJobEventLabel(event: any) {
  const message = String(event?.message ?? "").replace(/\s+/g, " ").trim();
  if (message) return message.length > 42 ? `${message.slice(0, 39)}...` : message;
  const eventType = String(event?.event_type ?? "").trim();
  if (!eventType) return "Updated";
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
}

function buildLatestJobEventByJob(events: any[]) {
  const latestByJob = new Map<string, any>();
  for (const event of Array.isArray(events) ? events : []) {
    const jobId = String(event?.job_id ?? "").trim();
    if (!jobId) continue;
    const current = latestByJob.get(jobId);
    if (!current || toEpochMs(event?.created_at) > toEpochMs(current?.created_at)) {
      latestByJob.set(jobId, event);
    }
  }
  return latestByJob;
}

function buildFollowUpEnteredAtByJob(events: any[]) {
  const enteredByJob = new Map<string, string>();
  for (const event of Array.isArray(events) ? events : []) {
    const jobId = String(event?.job_id ?? "").trim();
    const createdAt = String(event?.created_at ?? "").trim();
    if (!jobId || !createdAt || enteredByJob.has(jobId)) continue;
    const changes = Array.isArray(event?.meta?.changes) ? event.meta.changes : [];
    const hasReminderEntered = changes.some((change: any) => {
      const field = String(change?.field ?? "").trim().toLowerCase();
      if (!["follow_up_date", "next_action_note", "action_required_by"].includes(field)) return false;
      return Boolean(String(change?.to ?? "").trim());
    });
    if (hasReminderEntered) enteredByJob.set(jobId, createdAt);
  }
  return enteredByJob;
}

function workspaceTitle(job: any) {
  return normalizeRetestLinkedJobTitle(job?.title) || `Job ${String(job?.id ?? "").slice(0, 8)}`;
}

function workspaceCustomerLocation(job: any) {
  const customer = [formatPersonNamePart(job?.customer_first_name), formatPersonNamePart(job?.customer_last_name)]
    .filter(Boolean)
    .join(" ");
  const location = [String(job?.job_address ?? "").trim(), formatCityNamePart(job?.city)].filter(Boolean).join(", ");
  if (customer && location) return `${customer} · ${location}`;
  return customer || location || "Customer / location pending";
}

function workspaceContractorName(job: any) {
  return String(job?.contractors?.name ?? "").trim();
}

function timeToTimeInput(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hhmm = /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : "";
  return hhmm || "";
}

/**
 * Simplified vs. the SSR path in app/ops/page.tsx: skips the ECC-test-run failure-detail
 * enrichment and the service-follow-up-progress annotation (both secondary fallbacks —
 * the raw `ops_board_failure_note` column, preferred first, covers the common case).
 */
function workspaceVisibleReasonDisplay(job: any, queueKey: string): OpsBoardVisibleReason {
  return getOpsBoardVisibleReason(job, () => getOpsQueueCardStatusReason(job), { queueKey });
}

function deriveOpsQueueStateChips(reasonLabel: string, assignmentSummary?: string) {
  const chips: { label: string; tone: "rose" | "amber" | "slate" | "green" }[] = [];
  const normalized = reasonLabel.trim().toLowerCase();
  if (normalized.startsWith("failed ecc")) {
    chips.push({ label: "Failed ECC", tone: "rose" });
  } else if (normalized === "needs retest") {
    chips.push({ label: "Needs Retest", tone: "amber" });
  } else if (normalized === "on hold") {
    chips.push({ label: "On Hold", tone: "slate" });
  } else if (normalized === "blocked" || normalized === "missing information") {
    chips.push({ label: reasonLabel, tone: "amber" });
  }
  if (assignmentSummary && assignmentSummary.trim().toLowerCase() === "unassigned") {
    chips.push({ label: "Unassigned", tone: "amber" });
  }
  return chips;
}

function deriveOpsQueueCardTone(stateChips: { tone: "rose" | "amber" | "slate" | "green" }[]) {
  if (stateChips.some((chip) => chip.tone === "rose")) return "rose" as const;
  if (stateChips.some((chip) => chip.tone === "amber")) return "amber" as const;
  return "slate" as const;
}

function formatFollowUpOwner(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "customer") return "Customer";
  if (normalized === "contractor") return "Contractor";
  if (normalized === "rater") return "Rater";
  return "Office";
}

function businessDateToUtcMs(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function followUpUrgency(dueDate: string, todayDate: string) {
  const dueMs = businessDateToUtcMs(dueDate);
  const todayMs = businessDateToUtcMs(todayDate);
  if (dueMs === null || todayMs === null) return { tone: "slate" as const, label: "Needs date" };
  const daysUntilDue = Math.round((dueMs - todayMs) / 86_400_000);
  if (daysUntilDue < 0) return { tone: "rose" as const, label: `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue` };
  if (daysUntilDue === 0) return { tone: "rose" as const, label: "Due today" };
  if (daysUntilDue <= 2) return { tone: "amber" as const, label: `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}` };
  return { tone: "slate" as const, label: `Due in ${daysUntilDue} days` };
}

export type OpsQueuePanelResult = {
  queueLabel: string;
  itemNoun: string;
  reasonOptions: { key: string; label: string }[];
  rows: OpsBoardActiveQueueRow[];
  pinnedViews: [];
  canExportContractorSafeCsv: boolean;
};

const BUCKET_LABELS: Record<OpsQueuePanelJobBucket, string> = {
  need_to_schedule: "Needs Scheduling",
  field_work: "Field Work",
  waiting: "Waiting / Pending Info",
  exceptions: "Exceptions",
  follow_ups: "Follow Ups",
  closeout: "Closeout & Review",
};

const BUCKET_ITEM_NOUNS: Record<OpsQueuePanelJobBucket, string> = {
  need_to_schedule: "jobs",
  field_work: "jobs",
  waiting: "jobs",
  exceptions: "jobs",
  follow_ups: "follow ups",
  closeout: "jobs",
};

export async function loadOpsQueuePanelData(params: {
  supabase: SupabaseClient;
  accountOwnerUserId: string;
  bucket: OpsQueuePanelJobBucket;
  contractorFocusIds: string[];
  internalWorkContractorFocusId: string;
  boardSort: OpsBoardSortKey;
  previewLimit: number;
}): Promise<OpsQueuePanelResult> {
  const { supabase, accountOwnerUserId, bucket, contractorFocusIds, internalWorkContractorFocusId, boardSort, previewLimit } = params;

  const { rows: rawRows, closeoutProjectionByJob } = await loadJobRowsForBucket({
    supabase,
    accountOwnerUserId,
    bucket,
    boardSort: "oldest",
    previewLimit,
  });
  const rows = filterRowsByContractorFocus(rawRows, contractorFocusIds, internalWorkContractorFocusId);
  const jobIds = rows.map((row: any) => String(row?.id ?? "").trim()).filter(Boolean);

  const [assignmentDisplayMap, jobEventsRes, customerAttemptEventsRes, operationalTenantIdentity] = await Promise.all([
    jobIds.length ? getActiveJobAssignmentDisplayMap({ supabase, jobIds }) : Promise.resolve({}),
    jobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, event_type, created_at, message, meta")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, created_at")
          .in("job_id", jobIds)
          .eq("event_type", "customer_attempt")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    resolveOperationalTenantIdentity({ supabase, accountOwnerUserId }),
  ]);

  if (jobEventsRes.error) throw jobEventsRes.error;
  if (customerAttemptEventsRes.error) throw customerAttemptEventsRes.error;

  const jobEvents = jobEventsRes.data ?? [];
  const latestJobEventByJob = buildLatestJobEventByJob(jobEvents);
  const opsStatusEnteredAtByJob = buildOpsStatusEnteredAtByJob(
    jobEvents.filter((event: any) => String(event?.event_type ?? "") === "ops_update")
  );
  const followUpEnteredAtByJob = buildFollowUpEnteredAtByJob(jobEvents);
  const latestCustomerAttemptByJob = buildLatestCustomerAttemptByJob(
    (customerAttemptEventsRes.data ?? []) as Array<{ job_id: string; created_at: string }>
  );

  function workspaceLastActionTag(job: any) {
    const jobId = String(job?.id ?? "").trim();
    const latestEvent = jobId ? latestJobEventByJob.get(jobId) : null;
    if (latestEvent?.created_at) {
      return `${formatJobEventLabel(latestEvent)} · ${formatWorkspaceTimestamp(String(latestEvent.created_at))}`;
    }
    const createdAt = String(job?.created_at ?? "").trim();
    return createdAt ? `Created · ${formatWorkspaceTimestamp(createdAt)}` : "No activity";
  }

  function workspaceQueueEnteredAt(job: any) {
    const jobId = String(job?.id ?? "").trim();
    const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
    if (bucket === "follow_ups") {
      return (jobId ? followUpEnteredAtByJob.get(jobId) ?? null : null) || String(job?.created_at ?? "").trim() || null;
    }
    if (bucket === "closeout") {
      return String(job?.field_complete_at ?? "").trim() || (jobId ? opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] ?? null : null) || String(job?.created_at ?? "").trim() || null;
    }
    return (jobId ? opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] ?? null : null) || String(job?.created_at ?? "").trim() || null;
  }

  function workspaceQueueAgeDays(job: any): number | null {
    const enteredAt = workspaceQueueEnteredAt(job);
    const startMs = toEpochMs(enteredAt);
    if (!startMs) return null;
    return Math.floor(Math.max(0, Date.now() - startMs) / 86_400_000);
  }

  function workspaceQueueAgeChipLabel(job: any): string {
    const days = workspaceQueueAgeDays(job);
    return days === null ? "In queue" : `In queue ${days}d`;
  }

  const followUpTodayDate = new Date().toISOString().slice(0, 10);

  const rowViews: OpsBoardActiveQueueRow[] = rows.map((job: any) => {
    const jobId = String(job?.id ?? "").trim();
    const visibleReason = workspaceVisibleReasonDisplay(job, bucket);

    let view: OpsQueueRowView;
    if (bucket === "need_to_schedule") {
      const stateChips = deriveOpsQueueStateChips(visibleReason.label);
      view = {
        kind: "need_to_schedule",
        jobId,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job),
        ageDays: workspaceQueueAgeDays(job),
        stateChips,
        tone: deriveOpsQueueCardTone(stateChips),
        lastActionText: workspaceLastActionTag(job),
        recentAttemptText: resolveRecentAttemptDisplay(latestCustomerAttemptByJob.get(jobId) ?? null),
        contractorName: workspaceContractorName(job) || operationalTenantIdentity.displayName,
        phone: String(job?.customer_phone ?? "").trim(),
        scheduleDateText: job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "Not scheduled",
        scheduleWindowText: displayWindowLA(job?.window_start, job?.window_end) || (job?.scheduled_date ? "Window TBD" : ""),
        scheduledDateRaw: String(job?.scheduled_date ?? ""),
        windowStartInput: timeToTimeInput(job?.window_start),
        windowEndInput: timeToTimeInput(job?.window_end),
        permitNumber: String(job?.permit_number ?? ""),
        jurisdiction: String(job?.jurisdiction ?? ""),
        permitDate: String(job?.permit_date ?? ""),
        returnToHref: `/ops?bucket=pending${contractorFocusIds.length ? `&contractor=${contractorFocusIds.join(",")}` : ""}#ops-workspace`,
      } satisfies NeedsSchedulingRowView;
    } else if (bucket === "closeout") {
      const projection = closeoutProjectionByJob.get(jobId) ?? job;
      const needs = getCloseoutNeeds(projection);
      const assignmentSummary = formatAssignmentSummaryForJob(jobId, assignmentDisplayMap);
      const stateChips = deriveOpsQueueStateChips(visibleReason.label, assignmentSummary);
      view = {
        kind: "closeout",
        jobId,
        cardDomId: `ops-workspace-closeout-job-${jobId}`,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job),
        ageDays: workspaceQueueAgeDays(job),
        stateChips,
        tone: deriveOpsQueueCardTone(stateChips),
        lastActionText: workspaceLastActionTag(job),
        needsLabel:
          needs.needsInvoice && needs.needsCerts
            ? "Invoice + paperwork"
            : needs.needsInvoice
            ? "Invoice"
            : needs.needsCerts
            ? "Paperwork"
            : "Review",
        contractorName: workspaceContractorName(job),
        scheduledText: job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "",
        assignmentSummary,
        nextStepText: getCloseoutQueueNextStepLabel(projection),
        phone: String(job?.customer_phone ?? "").trim(),
        canMarkExternalInvoiceSent: canShowExternalInvoiceSentAction({ needsInvoice: needs.needsInvoice, billingState: projection?.billingState ?? null }),
        returnToHref: `/ops?bucket=closeout${contractorFocusIds.length ? `&contractor=${contractorFocusIds.join(",")}` : ""}#ops-workspace-closeout-job-${jobId}`,
      } satisfies CloseoutRowView;
    } else if (bucket === "follow_ups") {
      const dueDate = String(job?.follow_up_date ?? "").trim();
      const urgency = followUpUrgency(dueDate, followUpTodayDate);
      view = {
        kind: "follow_ups",
        jobId,
        cardDomId: `ops-workspace-follow-up-job-${jobId}`,
        href: `/jobs/${jobId}/v2#followup`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        dueText: dueDate ? formatBusinessDateUS(dueDate) : "No date set",
        urgencyLabel: urgency.label,
        urgencyTone: urgency.tone,
        ageLabel: workspaceQueueAgeChipLabel(job),
        ageDays: workspaceQueueAgeDays(job),
        lastActionText: workspaceLastActionTag(job),
        owner: formatFollowUpOwner(job?.action_required_by),
        statusLabel: getOpsQueueCardStatusReason(job),
        note: String(job?.next_action_note ?? "").trim() || "No reminder note added.",
      } satisfies FollowUpRowView;
    } else {
      const assignmentSummary = formatAssignmentSummaryForJob(jobId, assignmentDisplayMap);
      const stateChips = deriveOpsQueueStateChips(visibleReason.label, assignmentSummary);
      view = {
        kind: "generic",
        jobId,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job),
        ageDays: workspaceQueueAgeDays(job),
        stateChips,
        tone: deriveOpsQueueCardTone(stateChips),
        lastActionText: workspaceLastActionTag(job),
        assignmentSummary,
        contractorName: workspaceContractorName(job),
      } satisfies GenericRowView;
    }

    return {
      id: jobId,
      reasonKey: getOpsBoardReasonLabel(job, { queueKey: bucket })?.key ?? null,
      sortable: {
        created_at: job?.created_at ?? null,
        scheduled_date: job?.scheduled_date ?? null,
        window_start: job?.window_start ?? null,
        customer_first_name: job?.customer_first_name ?? null,
        customer_last_name: job?.customer_last_name ?? null,
        contractors: { name: workspaceContractorName(job) || null },
      },
      view,
    };
  });

  return {
    queueLabel: BUCKET_LABELS[bucket],
    itemNoun: BUCKET_ITEM_NOUNS[bucket],
    reasonOptions: buildOpsBoardReasonOptions(rows, { queueKey: bucket }),
    rows: rowViews,
    pinnedViews: [],
    canExportContractorSafeCsv: contractorFocusIds.length > 0,
  };
}

export { OPS_BOARD_SORT_OPTIONS };
