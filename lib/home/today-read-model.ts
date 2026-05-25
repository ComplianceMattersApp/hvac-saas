// Home / Today V1 — Shared Read Model (Phase 1 prototype)
//
// Purpose:
//   Compose existing read helpers into one normalized "Today" snapshot the
//   /today route can render responsively (desktop launchpad vs. mobile
//   ranked action stream) WITHOUT duplicating /ops or /reports logic.
//
// Boundaries (Phase 1):
//   - Read-only. No mutations. No schema changes. No auth/RLS changes.
//   - Best-effort optional sections wrap upstream reads in try/catch so a
//     single bad read does not blank the whole landing surface. Failures
//     surface as `null` or empty arrays — callers render empty states.
//   - Financial fields are gated via `canViewBusinessPulse`.

import {
  getRequestActorContext,
  type RequestActorContext,
} from "@/lib/auth/request-actor-context";
import type { InternalRole, InternalUserRow } from "@/lib/auth/internal-user";
import {
  resolveProductModeForAccountOwnerId,
  type ProductMode,
} from "@/lib/business/product-mode-defaults";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import {
  getCurrentInternalUserClockState,
  type TimeClockDerivedDisplayState,
} from "@/lib/time-clock/read-model";
import { getInternalUnreadNotificationBadgeCount } from "@/lib/actions/notification-read-actions";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { summarizeMaintenanceAgreementsForAccount } from "@/lib/maintenance-agreements/read-model";
import {
  displayWindowLA,
  formatBusinessDateUS,
  startOfTodayUtcIsoLA,
} from "@/lib/utils/schedule-la";
import {
  getActiveJobAssignmentDisplayMap,
  type ActiveJobAssignmentDisplay,
} from "@/lib/staffing/human-layer";

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type TodayJobSummary = {
  id: string;
  title: string;
  status: string | null;
  opsStatus: string | null;
  scheduledDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  jobAddress: string | null;
  city: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  fieldComplete: boolean;
};

export type TodayHeader = {
  displayDate: string;
  accountDisplayName: string;
  roleLabel: string;
  productMode: ProductMode;
  clockState: TimeClockDerivedDisplayState | null;
  timeClockEnabled: boolean;
  unreadNotificationCount: number;
};

export type NextBestActionKind =
  | "tech_next_job"
  | "dispatcher_schedule"
  | "owner_exception"
  | "billing_money_stuck"
  | "compliance_exception"
  | "service_plan_due"
  | "follow_up"
  | "empty";

export type NextBestAction = {
  kind: NextBestActionKind;
  headline: string;
  detail: string | null;
  primaryHref: string;
  primaryLabel: string;
  focusKey:
    | "need_scheduling"
    | "without_tech"
    | "closeout"
    | "waiting"
    | "exceptions"
    | "open_invoices"
    | "service_plans_due"
    | "resume_recent"
    | null;
  job?: TodayJobSummary | null;
};

export type PriorityChip = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "neutral" | "warn" | "danger" | "info";
  urgent: boolean;
};

export type FollowUpItem = {
  key: string;
  title: string;
  reason: string;
  concernKey: "scheduling" | "closeout" | "waiting" | "exceptions";
  href: string;
  scheduledDateDisplay: string | null;
};

export type FollowUpGroup = {
  key: "scheduling" | "closeout" | "waiting" | "exceptions" | "service_plans" | "payments";
  label: string;
  count: number;
  href: string;
  preview: FollowUpItem[];
  summary: string | null;
};

export type BusinessPulse = {
  visible: boolean;
  servicePlansActive: number | null;
  servicePlansOverdue: number | null;
  servicePlansDueIn7: number | null;
  openInvoiceCount: number | null;
  openInvoiceBalanceCents: number | null;
  unreadNotificationCount: number;
};

export type TeamCoverageAssignment = {
  key: string;
  assigneeName: string;
  jobId: string;
  jobTitle: string;
  windowLabel: string | null;
  customerLocationLabel: string;
  statusLabel: string;
  href: string;
};

export type TeamCoverage = {
  visible: boolean;
  summaryLabel: string;
  assignments: TeamCoverageAssignment[];
  unassignedCount: number;
  hasMore: boolean;
  href: string;
  emptyStateMessage: string | null;
};

export type ResumeRecentItem = {
  key: string;
  itemType: "Job";
  title: string;
  subtitle: string;
  href: string;
  updatedAtDisplay: string | null;
};

export type TodayReadModel = {
  userContext: {
    userId: string;
    role: InternalRole;
    accountOwnerUserId: string;
    canViewBusinessPulse: boolean;
  };
  productMode: ProductMode;
  role: InternalRole;
  todayHeader: TodayHeader;
  dailyBriefing: string;
  nextBestAction: NextBestAction;
  todayWork: {
    label: string;
    jobs: TodayJobSummary[];
    showFieldActions: boolean;
  };
  priorityChips: PriorityChip[];
  followUps: FollowUpItem[];
  followUpGroups: FollowUpGroup[];
  teamCoverage: TeamCoverage;
  businessPulse: BusinessPulse;
  resumeRecentWork: ResumeRecentItem[];
  resumeRecentHasMore: boolean;
  showWelcomeModal: boolean;
};

export type TodayReadModelRedirect = {
  kind: "redirect";
  to: "/login" | "/portal";
};

export type TodayReadModelResult = TodayReadModel | TodayReadModelRedirect;

// -----------------------------------------------------------------------------
// Role helpers
// -----------------------------------------------------------------------------

export function canViewBusinessPulseForRole(role: InternalRole): boolean {
  // Owner/admin and billing roles see money/recurring confidence.
  // Office and tech do not see balances in Phase 1.
  return role === "admin" || role === "billing";
}

function roleLabelFor(role: InternalRole, productMode: ProductMode): string {
  if (role === "admin") return productMode === "ecc_hers" ? "Owner / Compliance Lead" : "Owner / Admin";
  if (role === "billing") return "Billing";
  if (role === "office") return "Dispatcher / Office";
  if (role === "tech") return "Technician";
  return "Internal";
}

function formatTodayDateLA(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}

function hasDismissedTodayWelcome(userMetadata: unknown): boolean {
  const marker = (userMetadata as any)?.today_dashboard_v1_welcome;
  if (!marker || typeof marker !== "object") return false;

  const dismissed = Boolean((marker as any)?.dismissed);
  const dismissedAt = String((marker as any)?.dismissed_at ?? "").trim();
  return dismissed || dismissedAt.length > 0;
}

function todayBusinessDateLA(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// -----------------------------------------------------------------------------
// Lightweight supabase reads (best-effort, fail-safe)
// -----------------------------------------------------------------------------

async function safeQueryAssignedJobIdsForUser(
  supabase: any,
  userId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (error) return [];
    return Array.from(
      new Set(
        (data ?? [])
          .map((row: any) => String(row?.job_id ?? "").trim())
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

const TODAY_JOB_SELECT =
  "id, title, status, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, field_complete, deleted_at, created_at";

function normalizeJob(row: any): TodayJobSummary | null {
  const id = String(row?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: String(row?.title ?? "").trim() || "Untitled Job",
    status: row?.status ? String(row.status) : null,
    opsStatus: row?.ops_status ? String(row.ops_status) : null,
    scheduledDate: row?.scheduled_date ? String(row.scheduled_date) : null,
    windowStart: row?.window_start ? String(row.window_start) : null,
    windowEnd: row?.window_end ? String(row.window_end) : null,
    jobAddress: row?.job_address ? String(row.job_address) : null,
    city: row?.city ? String(row.city) : null,
    customerFirstName: row?.customer_first_name ? String(row.customer_first_name) : null,
    customerLastName: row?.customer_last_name ? String(row.customer_last_name) : null,
    customerPhone: row?.customer_phone ? String(row.customer_phone) : null,
    fieldComplete: Boolean(row?.field_complete),
  };
}

function formatStatusLabel(status: string | null, opsStatus: string | null): string {
  const source = status ?? opsStatus ?? "scheduled";
  return source.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function coverageCustomerLocationLabel(job: TodayJobSummary): string {
  const customer = [job.customerFirstName ?? "", job.customerLastName ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const location = [job.jobAddress ?? "", job.city ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  if (customer && location) return `${customer} • ${location}`;
  return customer || location || "Customer / location pending";
}

export function buildTeamCoverageSnapshot(params: {
  role: InternalRole;
  todayScheduledJobs: TodayJobSummary[];
  assignmentDisplayMap: Record<string, ActiveJobAssignmentDisplay[]>;
  maxRows: number;
}): TeamCoverage {
  const href = "/ops/field";

  if (params.role === "tech" || params.role === "billing") {
    return {
      visible: false,
      summaryLabel: "",
      assignments: [],
      unassignedCount: 0,
      hasMore: false,
      href,
      emptyStateMessage: null,
    };
  }

  const assignments: TeamCoverageAssignment[] = [];
  let unassignedCount = 0;

  const sortedJobs = [...params.todayScheduledJobs].sort((a, b) => {
    const aKey = `${a.windowStart ?? ""}|${a.title}|${a.id}`;
    const bKey = `${b.windowStart ?? ""}|${b.title}|${b.id}`;
    return aKey.localeCompare(bKey);
  });

  for (const job of sortedJobs) {
    const jobAssignments = params.assignmentDisplayMap[job.id] ?? [];
    if (jobAssignments.length === 0) {
      unassignedCount += 1;
      continue;
    }

    for (const assignment of jobAssignments) {
      const windowLabel = displayWindowLA(job.windowStart, job.windowEnd) || null;
      assignments.push({
        key: `${job.id}:${assignment.user_id}`,
        assigneeName: assignment.display_name,
        jobId: job.id,
        jobTitle: job.title,
        windowLabel,
        customerLocationLabel: coverageCustomerLocationLabel(job),
        statusLabel: formatStatusLabel(job.status, job.opsStatus),
        href: `/jobs/${job.id}?tab=ops`,
      });
    }
  }

  const hasMore = assignments.length > params.maxRows;
  const visibleAssignments = assignments.slice(0, params.maxRows);

  const summaryLabel =
    visibleAssignments.length > 0
      ? `${visibleAssignments.length} assigned ${visibleAssignments.length === 1 ? "visit" : "visits"} today`
      : unassignedCount > 0
      ? "Scheduled work needs assignment."
      : "No assigned field work scheduled for today.";

  const emptyStateMessage =
    visibleAssignments.length === 0
      ? unassignedCount > 0
        ? "Scheduled work needs assignment."
        : "No assigned field work scheduled for today."
      : null;

  return {
    visible: true,
    summaryLabel,
    assignments: visibleAssignments,
    unassignedCount,
    hasMore,
    href,
    emptyStateMessage,
  };
}

async function safeLoadTeamCoverage(params: {
  supabase: any;
  role: InternalRole;
  today: string;
  maxRows: number;
}): Promise<TeamCoverage> {
  if (params.role === "tech" || params.role === "billing") {
    return buildTeamCoverageSnapshot({
      role: params.role,
      todayScheduledJobs: [],
      assignmentDisplayMap: {},
      maxRows: params.maxRows,
    });
  }

  try {
    const { data, error } = await params.supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", false)
      .eq("scheduled_date", params.today)
      .order("window_start", { ascending: true })
      .limit(120);

    if (error) {
      return buildTeamCoverageSnapshot({
        role: params.role,
        todayScheduledJobs: [],
        assignmentDisplayMap: {},
        maxRows: params.maxRows,
      });
    }

    const jobs = (data ?? [])
      .map((row: any) => normalizeJob(row))
      .filter((job: TodayJobSummary | null): job is TodayJobSummary => job != null);

    const assignmentDisplayMap = await getActiveJobAssignmentDisplayMap({
      supabase: params.supabase,
      jobIds: jobs.map((job: TodayJobSummary) => job.id),
    }).catch(() => ({} as Record<string, ActiveJobAssignmentDisplay[]>));

    return buildTeamCoverageSnapshot({
      role: params.role,
      todayScheduledJobs: jobs,
      assignmentDisplayMap,
      maxRows: params.maxRows,
    });
  } catch {
    return buildTeamCoverageSnapshot({
      role: params.role,
      todayScheduledJobs: [],
      assignmentDisplayMap: {},
      maxRows: params.maxRows,
    });
  }
}

async function safeLoadTodayJobsForRole(params: {
  supabase: any;
  accountOwnerUserId: string;
  role: InternalRole;
  userId: string;
  today: string;
}): Promise<TodayJobSummary[]> {
  const { supabase, role, userId, today } = params;

  try {
    let assignedIds: string[] | null = null;
    if (role === "tech") {
      assignedIds = await safeQueryAssignedJobIdsForUser(supabase, userId);
      if (assignedIds.length === 0) return [];
    }

    // NOTE: `public.jobs` has no `account_owner_user_id` column — tenant scope is
    // enforced by RLS (`is_internal_user()`), matching the pattern used by /ops.
    // Adding `.eq("account_owner_user_id", ...)` here used to silently break this
    // query (PostgREST 400 swallowed by the try/catch) and was the reason /today
    // showed empty states even when scheduled-today work existed.
    let q = supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (assignedIds && assignedIds.length > 0) {
      q = q.in("id", assignedIds);
    } else {
      // Office/admin/billing — focus on today scheduled and in-progress visits.
      q = q.or(
        `scheduled_date.eq.${today},status.eq.on_the_way,status.eq.in_process`,
      );
    }

    const { data, error } = await q.limit(50);
    if (error) return [];

    const all: TodayJobSummary[] = ((data ?? []) as unknown[])
      .map((row) => normalizeJob(row))
      .filter((row: TodayJobSummary | null): row is TodayJobSummary => row != null);

    // For tech: keep in-progress + today + overdue (date < today) but not field-complete.
    if (role === "tech") {
      const active = all.filter((j: TodayJobSummary) => !j.fieldComplete);
      const inProgress = active.filter(
        (j: TodayJobSummary) => j.status === "on_the_way" || j.status === "in_process",
      );
      const todayOnly = active.filter(
        (j: TodayJobSummary) =>
          j.status !== "on_the_way" &&
          j.status !== "in_process" &&
          j.scheduledDate === today,
      );
      const overdue = active.filter(
        (j: TodayJobSummary) =>
          j.status !== "on_the_way" &&
          j.status !== "in_process" &&
          j.scheduledDate != null &&
          j.scheduledDate < today,
      );
      return [...inProgress, ...todayOnly, ...overdue].slice(0, 12);
    }

    return all
      .filter((j: TodayJobSummary) => !j.fieldComplete)
      .sort((a: TodayJobSummary, b: TodayJobSummary) => {
        const aKey = `${a.scheduledDate ?? ""}|${a.windowStart ?? ""}`;
        const bKey = `${b.scheduledDate ?? ""}|${b.windowStart ?? ""}`;
        return aKey.localeCompare(bKey);
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function safeCount(
  supabase: any,
  table: string,
  build: (q: any) => any,
): Promise<number | null> {
  try {
    const base = supabase.from(table).select("id", { count: "exact", head: true });
    const { count, error } = await build(base);
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

async function safeLoadPriorityCounts(params: {
  supabase: any;
  accountOwnerUserId: string;
  today: string;
}): Promise<{
  scheduledTodayWithoutTech: number | null;
  needScheduling: number | null;
  scheduledToday: number | null;
  pendingInfo: number | null;
  onHold: number | null;
  failed: number | null;
  closeoutReady: number | null;
}> {
  const { supabase, today } = params;

  // jobs is RLS-scoped; no explicit account_owner filter (column does not exist).
  const base = (q: any) => q.is("deleted_at", null);

  const scheduledTodayWithoutTechPromise = (async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("field_complete", false)
        .eq("scheduled_date", today)
        .limit(400);

      if (error) return null;

      const todayIds: string[] = Array.from(
        new Set(
          (data ?? [])
            .map((row: any) => String(row?.id ?? "").trim())
            .filter(Boolean),
        ),
      );

      if (todayIds.length === 0) return 0;

      const { data: assignments, error: assignmentError } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("is_active", true)
        .in("job_id", todayIds);

      if (assignmentError) return null;

      const assignedIds = new Set(
        (assignments ?? [])
          .map((row: any) => String(row?.job_id ?? "").trim())
          .filter(Boolean),
      );

      return todayIds.reduce((count: number, id: string) => {
        return count + (assignedIds.has(id) ? 0 : 1);
      }, 0);
    } catch {
      return null;
    }
  })();

  const [
    scheduledTodayWithoutTech,
    needScheduling,
    scheduledToday,
    pendingInfo,
    onHold,
    failed,
    closeoutReady,
  ] = await Promise.all([
    scheduledTodayWithoutTechPromise,
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("ops_status", "need_to_schedule").neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("scheduled_date", today).neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("ops_status", "pending_info").neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("ops_status", "on_hold").neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).in("ops_status", ["failed", "retest_needed", "pending_office_review"]).neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).in("ops_status", ["invoice_required", "paperwork_required"]).neq("status", "cancelled"),
    ),
  ]);

  return {
    scheduledTodayWithoutTech,
    needScheduling,
    scheduledToday,
    pendingInfo,
    onHold,
    failed,
    closeoutReady,
  };
}

async function safeLoadFollowUps(params: {
  supabase: any;
  accountOwnerUserId: string;
  today: string;
}): Promise<FollowUpItem[]> {
  try {
    // jobs is RLS-scoped; tenant scope comes from RLS, not from a non-existent
    // account_owner_user_id column. Include actionable stuck statuses AND jobs
    // scheduled in the past that are not field-complete (“still open”).
    const { data, error } = await params.supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .or(
        [
          `ops_status.in.(need_to_schedule,pending_info,on_hold,failed,retest_needed,pending_office_review,invoice_required,paperwork_required)`,
          `and(scheduled_date.lt.${params.today},field_complete.eq.false,ops_status.neq.closed)`,
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) return [];

    return (data ?? [])
      .map((row: any) => {
        const job = normalizeJob(row);
        if (!job) return null;
        const reason = followUpReason({
          opsStatus: job.opsStatus,
          scheduledDate: job.scheduledDate,
          today: params.today,
          fieldComplete: job.fieldComplete,
        });
        if (!reason) return null;
        const concernKey = followUpConcernKey(reason);
        return {
          key: job.id,
          title: job.title,
          reason,
          concernKey,
          href: `/jobs/${job.id}?tab=ops`,
          scheduledDateDisplay: job.scheduledDate
            ? formatBusinessDateUS(job.scheduledDate) || null
            : null,
        } satisfies FollowUpItem;
      })
      .filter((row: FollowUpItem | null): row is FollowUpItem => row != null);
  } catch {
    return [];
  }
}

export function followUpReason(params: {
  opsStatus: string | null;
  scheduledDate: string | null;
  today: string;
  fieldComplete: boolean;
}): string | null {
  switch (params.opsStatus) {
    case "need_to_schedule":
      return "Needs scheduling";
    case "pending_info":
      return "Pending info";
    case "on_hold":
      return "On hold";
    case "failed":
      return "Failed — needs review";
    case "retest_needed":
      return "Retest needed";
    case "pending_office_review":
      return "Pending office review";
    case "invoice_required":
      return "Closeout — invoice required";
    case "paperwork_required":
      return "Closeout — paperwork required";
  }
  // Scheduled in the past, not field-complete — still-open exception.
  if (
    !params.fieldComplete &&
    params.scheduledDate &&
    params.scheduledDate < params.today &&
    params.opsStatus !== "closed"
  ) {
    return "Past scheduled date — not completed";
  }
  return null;
}

function followUpConcernKey(reason: string): FollowUpItem["concernKey"] {
  if (reason === "Needs scheduling" || reason === "Past scheduled date — not completed") {
    return "scheduling";
  }
  if (reason.startsWith("Closeout")) return "closeout";
  if (
    reason === "Pending info" ||
    reason === "On hold" ||
    reason === "Pending office review"
  ) {
    return "waiting";
  }
  return "exceptions";
}

async function safeLoadRecentResume(params: {
  supabase: any;
  accountOwnerUserId: string;
  limit: number;
}): Promise<{ items: ResumeRecentItem[]; hasMore: boolean }> {
  try {
    const { data, error } = await params.supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(params.limit + 1);

    if (error) return { items: [], hasMore: false };

    const rows = Array.isArray(data) ? data : [];
    const hasMore = rows.length > params.limit;
    const trimmed = rows.slice(0, params.limit);

    const items = trimmed
      .map((row: any) => {
        const job = normalizeJob(row);
        if (!job) return null;
        const customer =
          [job.customerFirstName ?? "", job.customerLastName ?? ""]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(" ") || "Customer";
        const updatedRaw = row?.created_at ? String(row.created_at) : null;
        const updatedAtDisplay = updatedRaw
          ? formatBusinessDateUS(updatedRaw.slice(0, 10)) || null
          : null;
        return {
          key: job.id,
          itemType: "Job",
          title: job.title,
          subtitle: customer,
          href: `/jobs/${job.id}`,
          updatedAtDisplay,
        } satisfies ResumeRecentItem;
      })
      .filter((row: ResumeRecentItem | null): row is ResumeRecentItem => row != null);
    return { items, hasMore };
  } catch {
    return { items: [], hasMore: false };
  }
}

async function safeLoadOpenInvoiceSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<{ count: number | null; balanceCents: number | null }> {
  // internal_invoices.status is currently one of: draft | issued | void.
  // "Open" means issued but not fully paid; balance is derived by subtracting
  // recorded payments in internal_invoice_payments from invoice total_cents.
  try {
    const { data: invoices, error } = await params.supabase
      .from("internal_invoices")
      .select("id, total_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("status", "issued")
      .limit(500);

    if (error) return { count: null, balanceCents: null };
    const invoiceRows = Array.isArray(invoices) ? invoices : [];
    if (invoiceRows.length === 0) return { count: 0, balanceCents: 0 };

    const invoiceIds = invoiceRows
      .map((row: any) => String(row?.id ?? "").trim())
      .filter(Boolean);
    const totalsById = new Map<string, number>();
    for (const row of invoiceRows) {
      const id = String((row as any)?.id ?? "").trim();
      if (!id) continue;
      totalsById.set(id, Number((row as any)?.total_cents ?? 0) || 0);
    }

    const paidById = new Map<string, number>();
    if (invoiceIds.length > 0) {
      const { data: payments, error: payErr } = await params.supabase
        .from("internal_invoice_payments")
        .select("invoice_id, amount_cents, payment_status")
        .eq("account_owner_user_id", params.accountOwnerUserId)
        .in("invoice_id", invoiceIds);
      if (payErr) return { count: null, balanceCents: null };
      for (const row of payments ?? []) {
        const status = String((row as any)?.payment_status ?? "").trim().toLowerCase();
        if (status !== "recorded") continue;
        const id = String((row as any)?.invoice_id ?? "").trim();
        if (!id) continue;
        const amount = Number((row as any)?.amount_cents ?? 0) || 0;
        paidById.set(id, (paidById.get(id) ?? 0) + amount);
      }
    }

    let openCount = 0;
    let outstanding = 0;
    for (const [id, total] of totalsById.entries()) {
      const paid = paidById.get(id) ?? 0;
      const balance = Math.max(0, total - paid);
      if (balance > 0) {
        openCount += 1;
        outstanding += balance;
      }
    }

    return { count: openCount, balanceCents: outstanding };
  } catch {
    return { count: null, balanceCents: null };
  }
}

// -----------------------------------------------------------------------------
// Pure ranking: Next Best Action
// -----------------------------------------------------------------------------

export type NextBestActionInputs = {
  role: InternalRole;
  productMode: ProductMode;
  todayJobs: TodayJobSummary[];
  priorityCounts: {
    scheduledTodayWithoutTech: number | null;
    needScheduling: number | null;
    scheduledToday: number | null;
    pendingInfo: number | null;
    onHold: number | null;
    failed: number | null;
    closeoutReady: number | null;
  };
  openInvoiceCount: number | null;
  openInvoiceBalanceCents: number | null;
  servicePlansOverdue: number | null;
  resumeRecentCount: number;
};

export function selectNextBestAction(inputs: NextBestActionInputs): NextBestAction {
  const {
    role,
    productMode,
    todayJobs,
    priorityCounts,
    openInvoiceCount,
    openInvoiceBalanceCents,
    servicePlansOverdue,
    resumeRecentCount,
  } = inputs;

  const inProgress = todayJobs.find(
    (j) => j.status === "on_the_way" || j.status === "in_process",
  );

  // Tech: always anchor on next field job.
  if (role === "tech") {
    const focus = inProgress ?? todayJobs[0] ?? null;
    if (focus) {
      return {
        kind: "tech_next_job",
        headline: focus.title,
        detail: techJobDetail(focus),
        primaryHref: `/jobs/${focus.id}?tab=ops`,
        primaryLabel: "Open Job",
        focusKey: null,
        job: focus,
      };
    }
    return {
      kind: "empty",
      headline: "No assigned jobs right now.",
      detail: "New assignments will show up here as dispatch routes them to you.",
      primaryHref: "/ops/field",
      primaryLabel: "View My Work",
      focusKey: null,
    };
  }

  // Billing: prioritize money stuck.
  if (role === "billing") {
    if ((openInvoiceCount ?? 0) > 0) {
      return {
        kind: "billing_money_stuck",
        headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"} awaiting payment`,
        detail: "Review open balances and follow up on the oldest first.",
        primaryHref: "/reports/payments",
        primaryLabel: "Review Open Invoices",
        focusKey: "open_invoices",
      };
    }
    return calmBillingDefault();
  }

  const waitingCount = (priorityCounts.pendingInfo ?? 0) + (priorityCounts.onHold ?? 0);
  const hasUrgentFinancial =
    (openInvoiceCount ?? 0) >= 5 ||
    (openInvoiceBalanceCents ?? 0) >= 500_000;

  if ((priorityCounts.failed ?? 0) > 0) {
    return {
      kind: "compliance_exception",
      headline: `${priorityCounts.failed} critical exception${priorityCounts.failed === 1 ? "" : "s"} need review`,
      detail:
        productMode === "ecc_hers"
          ? "Compliance exceptions are blocking clean throughput."
          : "Failed or escalated jobs are blocking throughput.",
      primaryHref: "/ops?bucket=failed",
      primaryLabel: "Review Exceptions",
      focusKey: "exceptions",
    };
  }

  if ((priorityCounts.scheduledTodayWithoutTech ?? 0) > 0) {
    return {
      kind: "dispatcher_schedule",
      headline: `${priorityCounts.scheduledTodayWithoutTech} scheduled ${priorityCounts.scheduledTodayWithoutTech === 1 ? "visit is" : "visits are"} unassigned`,
      detail: "Dispatch coverage is missing for work already on today’s board.",
      primaryHref: "/ops/field",
      primaryLabel: "Assign Technicians",
      focusKey: "without_tech",
    };
  }

  if ((priorityCounts.needScheduling ?? 0) > 0) {
    return {
      kind: "dispatcher_schedule",
      headline: `${priorityCounts.needScheduling} job${priorityCounts.needScheduling === 1 ? "" : "s"} need scheduling`,
      detail: "Get unscheduled work onto the calendar before gaps widen.",
      primaryHref: "/ops/call-list",
      primaryLabel: "Open Scheduling Queue",
      focusKey: "need_scheduling",
    };
  }

  if ((priorityCounts.closeoutReady ?? 0) > 0) {
    return {
      kind: "owner_exception",
      headline: `${priorityCounts.closeoutReady} job${priorityCounts.closeoutReady === 1 ? "" : "s"} ready for closeout`,
      detail: "Finish certs and invoicing so work can close cleanly.",
      primaryHref: "/ops/closeout-queue",
      primaryLabel: "Review Closeout",
      focusKey: "closeout",
    };
  }

  if (waitingCount > 0) {
    return {
      kind: "follow_up",
      headline: `${waitingCount} waiting item${waitingCount === 1 ? "" : "s"} need follow-up`,
      detail: "Pending info and on-hold work need office attention.",
      primaryHref: "/ops?bucket=pending_info",
      primaryLabel: "Review Waiting Work",
      focusKey: "waiting",
    };
  }

  if (productMode !== "ecc_hers" && (servicePlansOverdue ?? 0) > 0) {
    return {
      kind: "service_plan_due",
      headline: `${servicePlansOverdue} service plan${servicePlansOverdue === 1 ? "" : "s"} overdue`,
      detail: "Recurring obligations are slipping past due.",
      primaryHref: "/service-plans",
      primaryLabel: "Review Service Plans",
      focusKey: "service_plans_due",
    };
  }

  if (hasUrgentFinancial && (openInvoiceCount ?? 0) > 0) {
    return {
      kind: "billing_money_stuck",
      headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"} need urgent payment follow-up`,
      detail: "High-value receivables need immediate billing action.",
      primaryHref: "/reports/payments",
      primaryLabel: "Review Open Invoices",
      focusKey: "open_invoices",
    };
  }

  if ((openInvoiceCount ?? 0) > 0) {
    return {
      kind: "billing_money_stuck",
      headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"}`,
      detail: "Keep collections moving after operational priorities are handled.",
      primaryHref: "/reports/payments",
      primaryLabel: "Review Open Invoices",
      focusKey: "open_invoices",
    };
  }

  if (resumeRecentCount > 0) {
    return {
      kind: "follow_up",
      headline: "Resume recent work",
      detail: "No urgent queues are blocking today, pick up your latest active item.",
      primaryHref: "/today#resume-recent-work",
      primaryLabel: "Resume Recent Work",
      focusKey: "resume_recent",
    };
  }

  return role === "office" ? calmOfficeDefault() : calmOwnerDefault();
}

function calmOwnerDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "Nothing urgent on the board.",
    detail: "Your team is caught up on schedule, exceptions, and money for the moment.",
    primaryHref: "/ops",
    primaryLabel: "Open Operations",
    focusKey: null,
  };
}

function calmOfficeDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "Schedule is clear right now.",
    detail: "No unscheduled, exception, or coverage gaps need immediate action.",
    primaryHref: "/ops",
    primaryLabel: "Open Operations",
    focusKey: null,
  };
}

function calmBillingDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "No open balances waiting.",
    detail: "All invoiced work is paid or in flight.",
    primaryHref: "/reports/payments",
    primaryLabel: "Open Payments",
    focusKey: null,
  };
}

function techJobDetail(job: TodayJobSummary): string | null {
  const address = [job.jobAddress, job.city].filter(Boolean).join(", ");
  const status = job.status === "on_the_way" ? "On the way" : job.status === "in_process" ? "In process" : null;
  const parts = [status, address].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
}

export function buildDailyBriefing(params: {
  role: InternalRole;
  todayJobsCount: number;
  priorityCounts: NextBestActionInputs["priorityCounts"];
  openInvoiceCount: number | null;
  servicePlansOverdue: number | null;
  followUpsCount: number;
}): string {
  const scheduled = params.priorityCounts.scheduledToday ?? params.todayJobsCount;
  const withoutTech = params.priorityCounts.scheduledTodayWithoutTech ?? 0;
  const needScheduling = params.priorityCounts.needScheduling ?? 0;
  const closeoutReady = params.priorityCounts.closeoutReady ?? 0;
  const waiting = (params.priorityCounts.pendingInfo ?? 0) + (params.priorityCounts.onHold ?? 0);

  if (params.role === "tech" && scheduled > 0) {
    const later = waiting > 0
      ? `${waiting} ${waiting === 1 ? "other item needs" : "other items need"} follow-up later.`
      : "You are clear after today’s route.";
    return `Your next job is ready. ${later}`;
  }

  if (scheduled > 0 && needScheduling > 0 && closeoutReady > 0) {
    return `Today has ${scheduled} scheduled ${scheduled === 1 ? "visit" : "visits"}, ${needScheduling} waiting to be scheduled, and ${closeoutReady} ready for closeout.`;
  }

  if (scheduled > 0 && withoutTech > 0) {
    return `You have ${scheduled} scheduled ${scheduled === 1 ? "visit" : "visits"} today, and ${withoutTech} ${withoutTech === 1 ? "is" : "are"} missing technician coverage.`;
  }

  if (needScheduling > 0) {
    return `Schedule pressure is high: ${needScheduling} ${needScheduling === 1 ? "job is" : "jobs are"} waiting for dispatch.`;
  }

  if (waiting > 0 || params.followUpsCount > 0) {
    const count = Math.max(waiting, params.followUpsCount);
    return `Today looks clear, but ${count} ${count === 1 ? "follow-up is" : "follow-ups are"} waiting.`;
  }

  if ((params.servicePlansOverdue ?? 0) > 0) {
    return `${params.servicePlansOverdue} service ${params.servicePlansOverdue === 1 ? "plan is" : "plans are"} overdue and need attention.`;
  }

  if ((params.openInvoiceCount ?? 0) > 0) {
    return `${params.openInvoiceCount} open ${params.openInvoiceCount === 1 ? "invoice is" : "invoices are"} waiting in payments.`;
  }

  return "Today is clear. No urgent queues need action right now.";
}

export function buildFollowUpGroups(params: {
  role: InternalRole;
  followUps: FollowUpItem[];
  priorityCounts: NextBestActionInputs["priorityCounts"];
  servicePlansOverdue: number | null;
  openInvoiceCount: number | null;
  canViewBusinessPulse: boolean;
}): FollowUpGroup[] {
  const schedulingItems = params.followUps.filter((item) => item.concernKey === "scheduling");
  const closeoutItems = params.followUps.filter((item) => item.concernKey === "closeout");
  const waitingItems = params.followUps.filter((item) => item.concernKey === "waiting");
  const exceptionItems = params.followUps.filter((item) => item.concernKey === "exceptions");

  const groups: FollowUpGroup[] = [];

  const schedulingCount = (params.priorityCounts.needScheduling ?? 0) + (params.priorityCounts.scheduledTodayWithoutTech ?? 0);
  if (schedulingCount > 0 || schedulingItems.length > 0) {
    groups.push({
      key: "scheduling",
      label: "Needs Scheduling",
      count: schedulingCount > 0 ? schedulingCount : schedulingItems.length,
      href: "/ops/call-list",
      preview: schedulingItems.slice(0, 3),
      summary: null,
    });
  }

  const closeoutCount = params.priorityCounts.closeoutReady ?? 0;
  if (closeoutCount > 0 || closeoutItems.length > 0) {
    groups.push({
      key: "closeout",
      label: "Closeout & Review",
      count: closeoutCount > 0 ? closeoutCount : closeoutItems.length,
      href: "/ops/closeout-queue",
      preview: closeoutItems.slice(0, 3),
      summary: closeoutItems.length === 0 ? `${closeoutCount} ${closeoutCount === 1 ? "job" : "jobs"} ready for closeout.` : null,
    });
  }

  const waitingCount = (params.priorityCounts.pendingInfo ?? 0) + (params.priorityCounts.onHold ?? 0);
  if (waitingCount > 0 || waitingItems.length > 0) {
    groups.push({
      key: "waiting",
      label: "Waiting / Pending Info",
      count: waitingCount > 0 ? waitingCount : waitingItems.length,
      href: "/ops?bucket=pending_info",
      preview: waitingItems.slice(0, 3),
      summary: null,
    });
  }

  const exceptionCount = params.priorityCounts.failed ?? 0;
  if (exceptionCount > 0 || exceptionItems.length > 0) {
    groups.push({
      key: "exceptions",
      label: "Exceptions",
      count: exceptionCount > 0 ? exceptionCount : exceptionItems.length,
      href: "/ops?bucket=failed",
      preview: exceptionItems.slice(0, 3),
      summary: null,
    });
  }

  if ((params.servicePlansOverdue ?? 0) > 0 && params.role !== "tech") {
    groups.push({
      key: "service_plans",
      label: "Service Plan Follow-Up",
      count: params.servicePlansOverdue ?? 0,
      href: "/service-plans",
      preview: [],
      summary: `${params.servicePlansOverdue} overdue ${params.servicePlansOverdue === 1 ? "plan" : "plans"}.`,
    });
  }

  if (params.canViewBusinessPulse && (params.openInvoiceCount ?? 0) > 0) {
    groups.push({
      key: "payments",
      label: "Payment Follow-Up",
      count: params.openInvoiceCount ?? 0,
      href: "/reports/payments",
      preview: [],
      summary: `${params.openInvoiceCount} open ${params.openInvoiceCount === 1 ? "invoice" : "invoices"} awaiting payment.`,
    });
  }

  return groups.slice(0, params.role === "tech" ? 3 : 5);
}

// -----------------------------------------------------------------------------
// Priority chip construction
// -----------------------------------------------------------------------------

export function buildPriorityChips(params: {
  productMode: ProductMode;
  role: InternalRole;
  priorityCounts: NextBestActionInputs["priorityCounts"];
  servicePlansOverdue: number | null;
  openInvoiceCount: number | null;
  canViewBusinessPulse: boolean;
  primaryFocusKey?: NextBestAction["focusKey"];
}): PriorityChip[] {
  const chips: PriorityChip[] = [];
  const focusKey = params.primaryFocusKey ?? null;

  const pushChip = (chip: PriorityChip) => {
    if (focusKey && chip.key === focusKey) {
      return;
    }
    chips.push(chip);
  };

  if ((params.priorityCounts.needScheduling ?? 0) > 0) {
    pushChip({
      key: "need_scheduling",
      label: "Start Here: Scheduling",
      count: params.priorityCounts.needScheduling ?? 0,
      href: "/ops/call-list",
      tone: "warn",
      urgent: (params.priorityCounts.needScheduling ?? 0) >= 5,
    });
  }

  if ((params.priorityCounts.scheduledTodayWithoutTech ?? 0) > 0) {
    pushChip({
      key: "without_tech",
      label: "Without Tech",
      count: params.priorityCounts.scheduledTodayWithoutTech ?? 0,
      href: "/ops/field",
      tone: "warn",
      urgent: true,
    });
  }

  if ((params.priorityCounts.failed ?? 0) > 0) {
    pushChip({
      key: "exceptions",
      label: "Needs Attention",
      count: params.priorityCounts.failed ?? 0,
      href: "/ops?bucket=failed",
      tone: "danger",
      urgent: true,
    });
  }

  if ((params.priorityCounts.pendingInfo ?? 0) > 0) {
    pushChip({
      key: "waiting",
      label: "Waiting on Info",
      count: params.priorityCounts.pendingInfo ?? 0,
      href: "/ops?bucket=pending_info",
      tone: "neutral",
      urgent: false,
    });
  }

  if ((params.priorityCounts.onHold ?? 0) > 0) {
    pushChip({
      key: "on_hold",
      label: "On Hold",
      count: params.priorityCounts.onHold ?? 0,
      href: "/ops?bucket=on_hold",
      tone: "neutral",
      urgent: false,
    });
  }

  if ((params.priorityCounts.closeoutReady ?? 0) > 0) {
    pushChip({
      key: "closeout",
      label: "Next: Closeout",
      count: params.priorityCounts.closeoutReady ?? 0,
      href: "/ops/closeout-queue",
      tone: "info",
      urgent: false,
    });
  }

  if (
    params.productMode !== "ecc_hers" &&
    (params.servicePlansOverdue ?? 0) > 0
  ) {
    pushChip({
      key: "service_plans_due",
      label: "Service Plans Due",
      count: params.servicePlansOverdue ?? 0,
      href: "/service-plans",
      tone: "warn",
      urgent: false,
    });
  }

  if (params.canViewBusinessPulse && (params.openInvoiceCount ?? 0) > 0) {
    pushChip({
      key: "open_invoices",
      label: "Money: Open Invoices",
      count: params.openInvoiceCount ?? 0,
      href: "/reports/payments",
      tone: "info",
      urgent: false,
    });
  }

  return chips;
}

// -----------------------------------------------------------------------------
// Orchestration entrypoint
// -----------------------------------------------------------------------------

export async function buildTodayReadModel(): Promise<TodayReadModelResult> {
  const actor = await getRequestActorContext();

  if (actor.kind === "unauthenticated" || actor.kind === "unauthorized") {
    return { kind: "redirect", to: "/login" };
  }

  if (actor.kind === "contractor") {
    return { kind: "redirect", to: "/portal" };
  }

  const internalUser = actor.internalUser as InternalUserRow | null;
  if (!internalUser || actor.kind !== "internal") {
    return { kind: "redirect", to: "/login" };
  }

  return buildTodayReadModelForInternalActor(actor, internalUser);
}

async function buildTodayReadModelForInternalActor(
  actor: RequestActorContext,
  internalUser: InternalUserRow,
): Promise<TodayReadModel> {
  const supabase = actor.supabase;
  const userId = String(actor.user?.id ?? "");
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const role = internalUser.role;
  const today = todayBusinessDateLA();
  const canViewBusinessPulse = canViewBusinessPulseForRole(role);
  const showWelcomeModal = !hasDismissedTodayWelcome(actor.user?.user_metadata ?? null);

  const productModePromise = resolveProductModeForAccountOwnerId({
    supabase,
    accountOwnerUserId,
  }).catch<ProductMode>(() => "hybrid");

  const identityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId,
  }).catch(() => null);

  const unreadPromise = getInternalUnreadNotificationBadgeCount({
    supabase,
    accountOwnerUserId,
  }).catch(() => 0);

  // Time clock state (per-user) — only meaningful if feature flag is on.
  const timeClockSettingsPromise = (async () => {
    try {
      const { data } = await supabase
        .from("account_settings")
        .select("time_clock_enabled")
        .eq("account_owner_user_id", accountOwnerUserId)
        .maybeSingle();
      return Boolean((data as any)?.time_clock_enabled);
    } catch {
      return false;
    }
  })();

  const clockStatePromise = (async () => {
    try {
      const enabled = await timeClockSettingsPromise;
      if (!enabled) return null;
      const result = await getCurrentInternalUserClockState({
        supabase,
        accountOwnerUserId,
        internalUserId: userId,
      });
      return result.displayState;
    } catch {
      return null;
    }
  })();

  const todayJobsPromise = safeLoadTodayJobsForRole({
    supabase,
    accountOwnerUserId,
    role,
    userId,
    today,
  });

  const priorityCountsPromise = safeLoadPriorityCounts({
    supabase,
    accountOwnerUserId,
    today,
  });

  const followUpsPromise = safeLoadFollowUps({ supabase, accountOwnerUserId, today });

  const teamCoveragePromise = safeLoadTeamCoverage({
    supabase,
    role,
    today,
    maxRows: 5,
  });

  const recentPromise = safeLoadRecentResume({
    supabase,
    accountOwnerUserId,
    limit: 5,
  });

  const servicePlansPromise = (async () => {
    if (!isMaintenanceAgreementsEnabled()) return null;
    try {
      return await summarizeMaintenanceAgreementsForAccount({
        supabase,
        accountOwnerUserId,
      });
    } catch {
      return null;
    }
  })();

  const openInvoicePromise = canViewBusinessPulse
    ? safeLoadOpenInvoiceSnapshot({ supabase, accountOwnerUserId })
    : Promise.resolve({ count: null, balanceCents: null });

  const [
    productMode,
    identity,
    unread,
    timeClockEnabled,
    clockState,
    todayJobs,
    priorityCounts,
    followUps,
    teamCoverage,
    recent,
    servicePlans,
    openInvoice,
  ] = await Promise.all([
    productModePromise,
    identityPromise,
    unreadPromise,
    timeClockSettingsPromise,
    clockStatePromise,
    todayJobsPromise,
    priorityCountsPromise,
    followUpsPromise,
    teamCoveragePromise,
    recentPromise,
    servicePlansPromise,
    openInvoicePromise,
  ]);

  const servicePlansOverdue = servicePlans?.due_counts?.overdue ?? null;
  const servicePlansDueIn7 = servicePlans?.due_counts?.due_in_next_7_days ?? null;
  const servicePlansActive = servicePlans?.status_counts?.active ?? null;

  const followUpGroups = buildFollowUpGroups({
    role,
    followUps,
    priorityCounts,
    servicePlansOverdue,
    openInvoiceCount: openInvoice.count,
    canViewBusinessPulse,
  });

  const dailyBriefing = buildDailyBriefing({
    role,
    todayJobsCount: todayJobs.length,
    priorityCounts,
    openInvoiceCount: openInvoice.count,
    servicePlansOverdue,
    followUpsCount: followUps.length,
  });

  const nextBestAction = selectNextBestAction({
    role,
    productMode,
    todayJobs,
    priorityCounts,
    openInvoiceCount: openInvoice.count,
    openInvoiceBalanceCents: openInvoice.balanceCents,
    servicePlansOverdue,
    resumeRecentCount: recent.items.length,
  });

  const priorityChips = buildPriorityChips({
    productMode,
    role,
    priorityCounts,
    servicePlansOverdue,
    openInvoiceCount: openInvoice.count,
    canViewBusinessPulse,
    primaryFocusKey: nextBestAction.focusKey,
  });

  const todayHeader: TodayHeader = {
    displayDate: formatTodayDateLA(),
    accountDisplayName:
      (identity?.displayName as string | undefined)?.trim() ||
      "Compliance Matters",
    roleLabel: roleLabelFor(role, productMode),
    productMode,
    clockState,
    timeClockEnabled,
    unreadNotificationCount: typeof unread === "number" ? unread : 0,
  };

  const businessPulse: BusinessPulse = {
    visible: canViewBusinessPulse,
    servicePlansActive: canViewBusinessPulse ? servicePlansActive : null,
    servicePlansOverdue: canViewBusinessPulse ? servicePlansOverdue : null,
    servicePlansDueIn7: canViewBusinessPulse ? servicePlansDueIn7 : null,
    openInvoiceCount: canViewBusinessPulse ? openInvoice.count : null,
    openInvoiceBalanceCents: canViewBusinessPulse ? openInvoice.balanceCents : null,
    unreadNotificationCount: typeof unread === "number" ? unread : 0,
  };

  const showFieldActions = role === "tech";
  const todayLabel = role === "tech" ? "My Work" : "Today’s Work";

  return {
    userContext: {
      userId,
      role,
      accountOwnerUserId,
      canViewBusinessPulse,
    },
    productMode,
    role,
    todayHeader,
    dailyBriefing,
    nextBestAction,
    todayWork: {
      label: todayLabel,
      jobs: todayJobs.slice(0, 8),
      showFieldActions,
    },
    priorityChips,
    followUps: followUps.slice(0, role === "tech" ? 3 : 8),
    followUpGroups,
    teamCoverage,
    businessPulse,
    resumeRecentWork: recent.items,
    resumeRecentHasMore: recent.hasMore,
    showWelcomeModal,
  };
}

// Exported for downstream presentation helpers that need the LA today key.
export function getTodayBusinessDateLA(now = new Date()): string {
  return todayBusinessDateLA(now);
}

// Re-export for tests / page rendering.
export { startOfTodayUtcIsoLA };
