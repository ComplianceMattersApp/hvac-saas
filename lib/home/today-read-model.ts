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
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import {
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";
import {
  resolveProductModeForAccountOwnerId,
  type ProductMode,
} from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";
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
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";
import {
  buildOpsStatusEnteredAtByJob,
  resolveLifecycleAging,
} from "@/lib/utils/lifecycle-aging";
import {
  getActiveJobAssignmentDisplayMap,
  type ActiveJobAssignmentDisplay,
} from "@/lib/staffing/human-layer";
import { countPendingContractorIntakeQueueRows } from "@/lib/ops/contractor-intake-queue";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import {
  buildRetestContinuationParentIds,
  countCurrentExceptionStatuses,
} from "@/lib/ops/retest-queue-exclusivity";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";

const OPEN_INVOICES_REPORT_HREF = "/reports/invoices?view=open";
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
  fieldCompleteAt: string | null;
};

export type TodayHeader = {
  displayDate: string;
  accountDisplayName: string;
  companyLogoUrl: string | null;
  greetingLine: string;
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
  customerName?: string | null;
  city?: string | null;
  ageDisplay?: string | null;
};

export type FollowUpGroup = {
  key:
    | "scheduling"
    | "without_tech"
    | "closeout"
    | "waiting"
    | "exceptions"
    | "service_plans"
    | "payments";
  label: string;
  count: number;
  href: string;
  preview: FollowUpItem[];
  summary: string | null;
};

export type BusinessPulse = {
  visible: boolean;
  failedPaymentsOpenCount: number | null;
  failedPaymentsBalanceAtRiskCents: number | null;
  servicePlansActive: number | null;
  servicePlansOverdue: number | null;
  servicePlansDueIn7: number | null;
  servicePlansNotScheduled: number | null;
  openInvoiceCount: number | null;
  openInvoiceBalanceCents: number | null;
  unreadNotificationCount: number;
};

export type RoleAwarePulseMode = "business" | "money" | "ops";

export type RoleAwarePulseTile = {
  key:
    | "open_invoices"
    | "confirm_payments"
    | "failed_attempts"
    | "need_scheduling"
    | "waiting"
    | "closeout"
    | "without_tech";
  label: string;
  value: number;
  valueDetail: string | null;
  href: string;
  context: string;
  tone: "neutral" | "warn" | "danger" | "info";
};

export type RoleAwarePulse = {
  visible: boolean;
  mode: RoleAwarePulseMode | null;
  title: string;
  subtitle: string;
  tiles: RoleAwarePulseTile[];
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
  roleAwarePulse: RoleAwarePulse;
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
  const surfaceProfile = resolveProductSurfaceProfile(productMode);
  if (role === "admin") return productMode === "ecc_hers" ? "Owner / Compliance Lead" : "Owner / Admin";
  if (role === "billing") return "Billing";
  if (role === "office") return "Dispatcher / Office";
  if (role === "tech") return surfaceProfile.labels.fieldUser;
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

function firstToken(value: string): string {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] ?? "";
}

export function derivePreferredGreetingName(user: any): string | null {
  const metadata = (user?.user_metadata ?? null) as Record<string, unknown> | null;

  const directFirstName = firstToken(String(metadata?.first_name ?? ""));
  if (directFirstName) return directFirstName;

  const fullName = firstToken(String(metadata?.full_name ?? ""));
  if (fullName) return fullName;

  const displayName = firstToken(String(metadata?.display_name ?? ""));
  if (displayName) return displayName;

  const genericName = firstToken(String(metadata?.name ?? ""));
  if (genericName) return genericName;

  return null;
}

export function buildTodayGreetingLine(user: any): string {
  const name = derivePreferredGreetingName(user);
  if (!name) return "Welcome back.";
  return `Welcome back, ${name}.`;
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
  "id, title, status, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, field_complete, field_complete_at, deleted_at, created_at";

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
    fieldCompleteAt: row?.field_complete_at ? String(row.field_complete_at) : null,
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
  const href = "/ops?bucket=field_work#ops-workspace";

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
  role: InternalRole;
  today: string;
}): Promise<{
  scheduledTodayWithoutTech: number | null;
  needScheduling: number | null;
  scheduledToday: number | null;
  pendingInfo: number | null;
  onHold: number | null;
  failed: number | null;
  closeoutReady: number | null;
  contractorIntake: number | null;
}> {
  const { supabase } = params;

  // jobs is RLS-scoped; no explicit account_owner filter (column does not exist).
  const base = (q: any) => q.is("deleted_at", null);

  // These reads intentionally mirror the predicates used to construct the Ops
  // workspace tabs. Today is an orientation surface; Ops owns queue truth.
  const scheduledTodayWithoutTechPromise = (async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, status, ops_status, scheduled_date, window_start")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("status", "open")
        .eq("ops_status", "scheduled")
        .order("scheduled_date", { ascending: true })
        .order("window_start", { ascending: true })
        .limit(50);

      if (error) return null;

      const scheduledIds: string[] = Array.from(new Set((data ?? [])
        .map((row: any) => String(row?.id ?? "").trim())
        .filter(Boolean)));

      const assignmentDisplayMap = scheduledIds.length
        ? await getActiveJobAssignmentDisplayMap({ supabase, jobIds: scheduledIds })
        : {};

      return buildScheduledWithoutTechSnapshot({
        jobs: data ?? [],
        assignmentDisplayMap,
        previewLimit: 10,
      }).count;
    } catch {
      return null;
    }
  })();

  const exceptionCountPromise = (async (): Promise<number | null> => {
    try {
      const [exceptions, continuations] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, ops_status")
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .in("ops_status", ["failed", "retest_needed", "pending_office_review", "problem"]),
        supabase
          .from("jobs")
          .select("parent_job_id")
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .eq("job_type", "ecc")
          .not("parent_job_id", "is", null),
      ]);
      if (exceptions.error || continuations.error) return null;
      const counts = countCurrentExceptionStatuses(
        exceptions.data ?? [],
        buildRetestContinuationParentIds(continuations.data),
      );
      return ["failed", "retest_needed", "pending_office_review", "problem"]
        .reduce((total, status) => total + (counts.get(status) ?? 0), 0);
    } catch {
      return null;
    }
  })();

  const closeoutCountPromise = (async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, created_at, field_complete, job_type, ops_status, pending_info_reason, on_hold_reason, permit_number, invoice_complete, billing_disposition, certs_complete")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("field_complete", true)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return null;
      const jobs = data ?? [];
      const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
        supabase,
        accountOwnerUserId: params.accountOwnerUserId,
        jobs,
      });
      return listCloseoutQueueJobs(
        jobs,
        (job: any) => projectionsByJobId.get(String(job?.id ?? "").trim()) ?? job,
      ).length;
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
    contractorIntake,
  ] = await Promise.all([
    scheduledTodayWithoutTechPromise,
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("ops_status", "need_to_schedule").eq("status", "open").neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q)
        .neq("status", "cancelled")
        .neq("ops_status", "closed")
        .eq("field_complete", false)
        .gte("scheduled_date", startOfTodayUtcIsoLA())
        .lt("scheduled_date", startOfTomorrowUtcIsoLA()),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q).eq("ops_status", "pending_info").neq("status", "cancelled"),
    ),
    safeCount(supabase, "jobs", (q) =>
      base(q)
        .in("ops_status", ["on_hold", "waiting", "pending_office_review"])
        .neq("status", "cancelled"),
    ),
    exceptionCountPromise,
    closeoutCountPromise,
    params.role === "admin" || params.role === "office"
      ? countPendingContractorIntakeQueueRows({
          supabase,
          accountOwnerUserId: params.accountOwnerUserId,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    scheduledTodayWithoutTech,
    needScheduling,
    scheduledToday,
    pendingInfo,
    onHold,
    failed,
    closeoutReady,
    contractorIntake,
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

    const rows = Array.isArray(data) ? data : [];
    const jobIds = rows.map((row: any) => String(row?.id ?? "").trim()).filter(Boolean);

    const [statusEventsRes, failedRunsRes] = await Promise.all([
      jobIds.length
        ? params.supabase
            .from("job_events")
            .select("job_id, created_at, meta")
            .in("job_id", jobIds)
            .eq("event_type", "ops_update")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      jobIds.length
        ? params.supabase
            .from("ecc_test_runs")
            .select("job_id, created_at, computed_pass, override_pass, is_completed")
            .in("job_id", jobIds)
            .eq("is_completed", true)
            .or("override_pass.eq.false,computed_pass.eq.false")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (statusEventsRes.error) return [];
    if (failedRunsRes.error) return [];

    const enteredAtByJob = buildOpsStatusEnteredAtByJob(
      (statusEventsRes.data ?? []) as Array<{ job_id?: unknown; created_at?: unknown; meta?: unknown }>,
    );

    const failedEvidenceByJob = new Map<string, string>();
    for (const run of failedRunsRes.data ?? []) {
      const jobId = String((run as any)?.job_id ?? "").trim();
      if (!jobId || failedEvidenceByJob.has(jobId)) continue;
      const createdAt = String((run as any)?.created_at ?? "").trim();
      if (!createdAt) continue;
      failedEvidenceByJob.set(jobId, createdAt);
    }

    return rows
      .map((row: any): FollowUpItem | null => {
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
        const firstName = job.customerFirstName ?? null;
        const lastName = job.customerLastName ?? null;
        const fullName = [firstName, lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
        const lifecycleLabel = resolveLifecycleAging({
          status: job.status,
          opsStatus: job.opsStatus,
          createdAt: row?.created_at ? String(row.created_at) : null,
          scheduledDate: job.scheduledDate,
          fieldCompleteAt: job.fieldCompleteAt,
          stateEnteredAtByStatus: enteredAtByJob.get(job.id) ?? null,
          failedEvidenceAt: failedEvidenceByJob.get(job.id) ?? null,
          todayDate: params.today,
        }).label;

        return {
          key: job.id,
          title: job.title,
          reason,
          concernKey,
          href: `/jobs/${job.id}?tab=ops`,
          scheduledDateDisplay: job.scheduledDate
            ? formatBusinessDateUS(job.scheduledDate) || null
            : null,
          customerName: fullName || null,
          city: job.city || null,
          ageDisplay: lifecycleLabel,
        };
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
  // Lightweight Today snapshot for Open Invoices V1: issued, non-void invoices
  // with positive balance after recorded internal invoice payments only.
  try {
    const { data: invoices, error } = await params.supabase
      .from("internal_invoices")
      .select("id, total_cents, voided_at")
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
      if (String((row as any)?.voided_at ?? "").trim()) continue;
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
    contractorIntake: number | null;
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
  const surfaceProfile = resolveProductSurfaceProfile(productMode);

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
        primaryHref: OPEN_INVOICES_REPORT_HREF,
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
      primaryHref: "/ops?bucket=exceptions#ops-workspace",
      primaryLabel: "Review Exceptions",
      focusKey: "exceptions",
    };
  }

  if ((priorityCounts.scheduledTodayWithoutTech ?? 0) > 0) {
    return {
      kind: "dispatcher_schedule",
      headline: `${priorityCounts.scheduledTodayWithoutTech} scheduled ${priorityCounts.scheduledTodayWithoutTech === 1 ? "visit is" : "visits are"} unassigned`,
      detail: "Dispatch coverage is missing for work already on today’s board.",
      primaryHref: "/ops",
      primaryLabel: `Assign ${surfaceProfile.labels.fieldUser}s`,
      focusKey: "without_tech",
    };
  }

  if ((priorityCounts.needScheduling ?? 0) > 0) {
    return {
      kind: "dispatcher_schedule",
      headline: `${priorityCounts.needScheduling} job${priorityCounts.needScheduling === 1 ? "" : "s"} need scheduling`,
      detail: "Get unscheduled work onto the calendar before gaps widen.",
      primaryHref: "/ops?bucket=pending#ops-workspace",
      primaryLabel: "Open Scheduling Queue",
      focusKey: "need_scheduling",
    };
  }

  if ((priorityCounts.closeoutReady ?? 0) > 0) {
    return {
      kind: "owner_exception",
      headline: `${priorityCounts.closeoutReady} job${priorityCounts.closeoutReady === 1 ? "" : "s"} ready for closeout`,
      detail: "Finish certs and invoicing so work can close cleanly.",
      primaryHref: "/ops?bucket=closeout#ops-workspace",
      primaryLabel: "Review Closeout",
      focusKey: "closeout",
    };
  }

  if (waitingCount > 0) {
    return {
      kind: "follow_up",
      headline: `${waitingCount} waiting item${waitingCount === 1 ? "" : "s"} need follow-up`,
      detail: "Pending info and on-hold work need office attention.",
      primaryHref: "/ops?bucket=waiting#ops-workspace",
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
      primaryHref: OPEN_INVOICES_REPORT_HREF,
      primaryLabel: "Review Open Invoices",
      focusKey: "open_invoices",
    };
  }

  if ((openInvoiceCount ?? 0) > 0) {
    return {
      kind: "billing_money_stuck",
      headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"}`,
      detail: "Keep collections moving after operational priorities are handled.",
      primaryHref: OPEN_INVOICES_REPORT_HREF,
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
  productMode?: ProductMode;
  todayJobsCount: number;
  priorityCounts: NextBestActionInputs["priorityCounts"];
  openInvoiceCount: number | null;
  servicePlansOverdue: number | null;
  followUpsCount: number;
}): string {
  const surfaceProfile = resolveProductSurfaceProfile(params.productMode ?? "hybrid");
  const scheduled = params.priorityCounts.scheduledToday ?? params.todayJobsCount;
  const withoutTech = params.priorityCounts.scheduledTodayWithoutTech ?? 0;
  const needScheduling = params.priorityCounts.needScheduling ?? 0;
  const closeoutReady = params.priorityCounts.closeoutReady ?? 0;
  const waiting = (params.priorityCounts.pendingInfo ?? 0) + (params.priorityCounts.onHold ?? 0);

  if (params.role === "tech") {
    if (scheduled > 0) {
      return `Your assigned route is active with ${scheduled} ${scheduled === 1 ? "visit" : "visits"}.`;
    }
    return "Your assigned work queue is clear right now.";
  }

  if (params.role === "billing") {
    if ((params.openInvoiceCount ?? 0) > 0) {
      return `${params.openInvoiceCount} open ${params.openInvoiceCount === 1 ? "invoice is" : "invoices are"} awaiting payment follow-up.`;
    }
    if (closeoutReady > 0) {
      return `${closeoutReady} ${closeoutReady === 1 ? "visit is" : "visits are"} waiting on closeout billing steps.`;
    }
    return "Money attention is clear right now.";
  }

  if (scheduled > 0 && needScheduling > 0 && closeoutReady > 0) {
    return `Today has ${scheduled} scheduled ${scheduled === 1 ? "visit" : "visits"}, ${needScheduling} waiting to be scheduled, and ${closeoutReady} ready for closeout.`;
  }

  if (scheduled > 0 && withoutTech > 0) {
    return `You have ${scheduled} scheduled ${scheduled === 1 ? "visit" : "visits"} today, and ${withoutTech} ${withoutTech === 1 ? "is" : "are"} missing ${surfaceProfile.labels.fieldUser.toLowerCase()} coverage.`;
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
    return `${params.openInvoiceCount} open ${params.openInvoiceCount === 1 ? "invoice is" : "invoices are"} awaiting payment follow-up.`;
  }

  return "Today is clear. No urgent queues need action right now.";
}

export function buildFollowUpGroups(params: {
  role: InternalRole;
  productMode?: ProductMode;
  followUps: FollowUpItem[];
  priorityCounts: NextBestActionInputs["priorityCounts"];
  servicePlansOverdue: number | null;
  openInvoiceCount: number | null;
  canViewBusinessPulse: boolean;
}): FollowUpGroup[] {
  const surfaceProfile = resolveProductSurfaceProfile(params.productMode ?? "hybrid");
  if (params.role === "tech") {
    return [];
  }

  const schedulingItems = params.followUps.filter((item) => item.concernKey === "scheduling");
  const closeoutItems = params.followUps.filter((item) => item.concernKey === "closeout");
  const waitingItems = params.followUps.filter((item) => item.concernKey === "waiting");
  const exceptionItems = params.followUps.filter((item) => item.concernKey === "exceptions");

  const groups: FollowUpGroup[] = [];

  const schedulingCount = params.priorityCounts.needScheduling ?? 0;
  const withoutTechCount = params.priorityCounts.scheduledTodayWithoutTech ?? 0;

  if (withoutTechCount > 0 && params.role !== "billing") {
    groups.push({
      key: "without_tech",
      label: `Without ${surfaceProfile.labels.fieldUser}`,
      count: withoutTechCount,
      href: "/ops",
      preview: [],
      summary: `${withoutTechCount} scheduled ${withoutTechCount === 1 ? "job is" : "jobs are"} missing assignment.`,
    });
  }

  if (params.role !== "billing" && (schedulingCount > 0 || schedulingItems.length > 0)) {
    groups.push({
      key: "scheduling",
      label: "Needs Scheduling",
      count: schedulingCount > 0 ? schedulingCount : schedulingItems.length,
      href: "/ops?bucket=pending#ops-workspace",
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
      href: "/ops?bucket=closeout#ops-workspace",
      preview: closeoutItems.slice(0, 3),
      summary: closeoutItems.length === 0 ? `${closeoutCount} ${closeoutCount === 1 ? "job" : "jobs"} ready for closeout.` : null,
    });
  }

  const waitingCount = (params.priorityCounts.pendingInfo ?? 0) + (params.priorityCounts.onHold ?? 0);
  if (params.role !== "billing" && (waitingCount > 0 || waitingItems.length > 0)) {
    groups.push({
      key: "waiting",
      label: "Waiting / Pending Info",
      count: waitingCount > 0 ? waitingCount : waitingItems.length,
      href: "/ops?bucket=waiting#ops-workspace",
      preview: waitingItems.slice(0, 3),
      summary: null,
    });
  }

  const exceptionCount = params.priorityCounts.failed ?? 0;
  if (params.role !== "billing" && (exceptionCount > 0 || exceptionItems.length > 0)) {
    groups.push({
      key: "exceptions",
      label: "Exceptions",
      count: exceptionCount > 0 ? exceptionCount : exceptionItems.length,
      href: "/ops?bucket=exceptions#ops-workspace",
      preview: exceptionItems.slice(0, 3),
      summary: null,
    });
  }

  if ((params.servicePlansOverdue ?? 0) > 0 && params.role === "admin") {
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
      label: "Open Invoice Follow-Up",
      count: params.openInvoiceCount ?? 0,
      href: OPEN_INVOICES_REPORT_HREF,
      preview: [],
      summary: `${params.openInvoiceCount} open ${params.openInvoiceCount === 1 ? "invoice" : "invoices"} awaiting payment follow-up.`,
    });
  }

  return groups.slice(0, params.role === "billing" ? 3 : 5);
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
  const surfaceProfile = resolveProductSurfaceProfile(params.productMode);
  if (params.role === "tech") {
    return [];
  }

  const chips: PriorityChip[] = [];
  const focusKey = params.primaryFocusKey ?? null;

  const pushChip = (chip: PriorityChip) => {
    if (focusKey && chip.key === focusKey) {
      return;
    }
    chips.push(chip);
  };

  if (params.role !== "billing" && (params.priorityCounts.needScheduling ?? 0) > 0) {
    pushChip({
      key: "need_scheduling",
      label: "Start Here: Scheduling",
      count: params.priorityCounts.needScheduling ?? 0,
      href: "/ops?bucket=pending#ops-workspace",
      tone: "warn",
      urgent: (params.priorityCounts.needScheduling ?? 0) >= 5,
    });
  }

  if (
    (params.role === "admin" || params.role === "office") &&
    (params.priorityCounts.contractorIntake ?? 0) > 0
  ) {
    pushChip({
      key: "contractor_intake",
      label: "Contractor Intake",
      count: params.priorityCounts.contractorIntake ?? 0,
      href: "/ops?bucket=contractor_intake#ops-workspace",
      tone: "info",
      urgent: false,
    });
  }

  if (params.role !== "billing" && (params.priorityCounts.scheduledTodayWithoutTech ?? 0) > 0) {
    pushChip({
      key: "without_tech",
      label: `Without ${surfaceProfile.labels.fieldUser}`,
      count: params.priorityCounts.scheduledTodayWithoutTech ?? 0,
      href: "/ops",
      tone: "warn",
      urgent: true,
    });
  }

  if (params.role !== "billing" && (params.priorityCounts.failed ?? 0) > 0) {
    pushChip({
      key: "exceptions",
      label: "Needs Attention",
      count: params.priorityCounts.failed ?? 0,
      href: "/ops?bucket=exceptions#ops-workspace",
      tone: "danger",
      urgent: true,
    });
  }

  if (params.role !== "billing" && (params.priorityCounts.pendingInfo ?? 0) > 0) {
    pushChip({
      key: "waiting",
      label: "Waiting on Info",
      count: params.priorityCounts.pendingInfo ?? 0,
      href: "/ops?bucket=waiting#ops-workspace",
      tone: "neutral",
      urgent: false,
    });
  }

  if (params.role !== "billing" && (params.priorityCounts.onHold ?? 0) > 0) {
    pushChip({
      key: "on_hold",
      label: "On Hold",
      count: params.priorityCounts.onHold ?? 0,
      href: "/ops?bucket=waiting#ops-workspace",
      tone: "neutral",
      urgent: false,
    });
  }

  if ((params.priorityCounts.closeoutReady ?? 0) > 0) {
    pushChip({
      key: "closeout",
      label: "Next: Closeout",
      count: params.priorityCounts.closeoutReady ?? 0,
      href: "/ops?bucket=closeout#ops-workspace",
      tone: "info",
      urgent: false,
    });
  }

  if (
    params.role === "admin" &&
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
      href: OPEN_INVOICES_REPORT_HREF,
      tone: "info",
      urgent: false,
    });
  }

  return chips;
}

function buildRoleAwarePulse(params: {
  role: InternalRole;
  productMode: ProductMode;
  canViewBusinessPulse: boolean;
  canViewConfirmPaymentAttention: boolean;
  canViewFailedPaymentAttention: boolean;
  priorityCounts: NextBestActionInputs["priorityCounts"];
  openInvoiceCount: number | null;
  openInvoiceBalanceCents: number | null;
  confirmPaymentsOpenCount: number | null;
  confirmPaymentsTotalReportedCents: number | null;
  failedPaymentsOpenCount: number | null;
  failedPaymentsBalanceAtRiskCents: number | null;
}): RoleAwarePulse {
  const surfaceProfile = resolveProductSurfaceProfile(params.productMode);
  const waitingCount =
    (params.priorityCounts.pendingInfo ?? 0) +
    (params.priorityCounts.onHold ?? 0);

  const tiles: RoleAwarePulseTile[] = [];

  const pushTile = (tile: RoleAwarePulseTile) => {
    tiles.push(tile);
  };

  const canViewOpsPressure = params.role === "admin" || params.role === "office";
  const canViewMoneyAttention = params.canViewBusinessPulse;

  if (canViewMoneyAttention) {
    pushTile({
      key: "open_invoices",
      label: "OPEN INVOICES",
      value: params.openInvoiceCount ?? 0,
      valueDetail:
        params.openInvoiceBalanceCents != null
          ? formatCurrencyCents(params.openInvoiceBalanceCents)
          : null,
      href: OPEN_INVOICES_REPORT_HREF,
      context: "Accounts receivable follow-up",
      tone: "info",
    });
  }

  if (params.canViewConfirmPaymentAttention) {
    pushTile({
      key: "confirm_payments",
      label: "CONFIRM PAYMENTS",
      value: params.confirmPaymentsOpenCount ?? 0,
      valueDetail:
        params.confirmPaymentsTotalReportedCents != null
          ? `${formatCurrencyCents(params.confirmPaymentsTotalReportedCents)} reported`
          : "Reported payment needs verification",
      href: "/reports/payment-reconciliation",
      context: "Reported, not collected truth",
      tone: (params.confirmPaymentsOpenCount ?? 0) > 0 ? "warn" : "neutral",
    });
  }

  if (params.canViewFailedPaymentAttention) {
    pushTile({
      key: "failed_attempts",
      label: "FAILED ATTEMPTS",
      value: params.failedPaymentsOpenCount ?? 0,
      valueDetail:
        params.failedPaymentsBalanceAtRiskCents != null
          ? `${formatCurrencyCents(params.failedPaymentsBalanceAtRiskCents)} at risk`
          : "Failed attempt attention",
      href: "/reports/failed-payments",
      context: "Failed attempt, not collected money",
      tone: (params.failedPaymentsOpenCount ?? 0) > 0 ? "danger" : "neutral",
    });
  }

  if (canViewOpsPressure) {
    pushTile({
      key: "need_scheduling",
      label: "NEEDS SCHEDULING",
      value: params.priorityCounts.needScheduling ?? 0,
      valueDetail: null,
      href: "/ops?bucket=pending#ops-workspace",
      context: "Live queue",
      tone: (params.priorityCounts.needScheduling ?? 0) > 0 ? "warn" : "neutral",
    });
    pushTile({
      key: "waiting",
      label: "WAITING / PENDING",
      value: waitingCount,
      valueDetail: null,
      href: "/ops?bucket=waiting#ops-workspace",
      context: "Office follow-up",
      tone: waitingCount > 0 ? "warn" : "neutral",
    });
    pushTile({
      key: "closeout",
      label: "CLOSEOUT / INVOICE",
      value: params.priorityCounts.closeoutReady ?? 0,
      valueDetail: null,
      href: "/ops?bucket=closeout#ops-workspace",
      context: "Office follow-up",
      tone: (params.priorityCounts.closeoutReady ?? 0) > 0 ? "info" : "neutral",
    });
    pushTile({
      key: "without_tech",
      label: `WITHOUT ${surfaceProfile.labels.fieldUser.toUpperCase()}`,
      value: params.priorityCounts.scheduledTodayWithoutTech ?? 0,
      valueDetail: null,
      href: "/ops",
      context: "Dispatch coverage",
      tone: (params.priorityCounts.scheduledTodayWithoutTech ?? 0) > 0 ? "warn" : "neutral",
    });
  }

  if (params.role === "billing" && !canViewOpsPressure) {
    pushTile({
      key: "closeout",
      label: "INVOICE / CLOSEOUT",
      value: params.priorityCounts.closeoutReady ?? 0,
      valueDetail: null,
      href: "/ops?bucket=closeout#ops-workspace",
      context: "Billing-ready office work",
      tone: (params.priorityCounts.closeoutReady ?? 0) > 0 ? "info" : "neutral",
    });
  }

  if (params.role === "admin") {
    return {
      visible: true,
      mode: "business",
      title: "Business Pulse",
      subtitle: "Financial attention plus operational pressure.",
      tiles,
    };
  }

  if (params.role === "billing") {
    return {
      visible: true,
      mode: "money",
      title: "Money Attention",
      subtitle: "Financial follow-up and verification pressure.",
      tiles,
    };
  }

  if (params.role === "office") {
    return {
      visible: true,
      mode: "ops",
      title: "Ops Pressure",
      subtitle: "Dispatch and office follow-up pressure.",
      tiles,
    };
  }

  return {
    visible: false,
    mode: null,
    title: "",
    subtitle: "",
    tiles: [],
  };
}

function formatCurrencyCents(cents: number): string {
  const dollars = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

// -----------------------------------------------------------------------------
// Orchestration entrypoint
// -----------------------------------------------------------------------------

type TodayTimedPhase = <T,>(phaseName: string, factory: () => Promise<T>) => Promise<T>;

export async function buildTodayReadModel(): Promise<TodayReadModelResult> {
  const timingEnabled = process.env.TODAY_TIMING_DEBUG === "true";
  const routeStartMs = timingEnabled ? Date.now() : 0;
  const phaseDurationsMs: Record<string, number> = {};

  const setPhaseValue = (phaseName: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phaseName] = durationMs;
  };

  const timedPhase: TodayTimedPhase = async <T,>(phaseName: string, factory: () => Promise<T>) => {
    const startMs = timingEnabled ? Date.now() : 0;
    try {
      const value = await factory();
      if (timingEnabled) {
        setPhaseValue(phaseName, Date.now() - startMs);
      }
      return value;
    } catch (error) {
      if (timingEnabled) {
        setPhaseValue(phaseName, Date.now() - startMs);
      }
      throw error;
    }
  };

  const emitTimingLog = (details: {
    resultKind: "redirect" | "ok";
    routeClass: "unauthenticated" | "unauthorized" | "contractor" | "internal";
    role: InternalRole | null;
    accountOwnerScoped: boolean;
    todayJobsCount: number;
  }) => {
    if (!timingEnabled) return;

    console.info(
      "[today-timing]",
      JSON.stringify({
        routeLabels: {
          resultKind: details.resultKind,
          routeClass: details.routeClass,
          role: details.role,
          accountOwnerScoped: details.accountOwnerScoped,
          todayJobsCount: details.todayJobsCount,
        },
        phasesMs: {
          requestActorContext: phaseDurationsMs.requestActorContext ?? 0,
          concernReadProductMode: phaseDurationsMs.concernReadProductMode ?? 0,
          concernReadTenantIdentity: phaseDurationsMs.concernReadTenantIdentity ?? 0,
          concernReadUnreadNotifications: phaseDurationsMs.concernReadUnreadNotifications ?? 0,
          concernReadTimeClockSettings: phaseDurationsMs.concernReadTimeClockSettings ?? 0,
          concernReadTimeClockState: phaseDurationsMs.concernReadTimeClockState ?? 0,
          todayJobsRead: phaseDurationsMs.todayJobsRead ?? 0,
          priorityCountsRead: phaseDurationsMs.priorityCountsRead ?? 0,
          followUpsRead: phaseDurationsMs.followUpsRead ?? 0,
          teamCoverageRead: phaseDurationsMs.teamCoverageRead ?? 0,
          recentResumeRead: phaseDurationsMs.recentResumeRead ?? 0,
          openInvoiceSnapshotRead: phaseDurationsMs.openInvoiceSnapshotRead ?? 0,
          servicePlansSummaryRead: phaseDurationsMs.servicePlansSummaryRead ?? 0,
          groupedParallelAwait: phaseDurationsMs.groupedParallelAwait ?? 0,
          composeReadModel: phaseDurationsMs.composeReadModel ?? 0,
          totalServerReadModel: Date.now() - routeStartMs,
        },
      }),
    );
  };

  const actor = await timedPhase("requestActorContext", () => getRequestActorContext());

  if (actor.kind === "unauthenticated" || actor.kind === "unauthorized") {
    emitTimingLog({
      resultKind: "redirect",
      routeClass: actor.kind,
      role: null,
      accountOwnerScoped: false,
      todayJobsCount: 0,
    });
    return { kind: "redirect", to: "/login" };
  }

  if (actor.kind === "contractor") {
    emitTimingLog({
      resultKind: "redirect",
      routeClass: actor.kind,
      role: null,
      accountOwnerScoped: false,
      todayJobsCount: 0,
    });
    return { kind: "redirect", to: "/portal" };
  }

  const internalUser = actor.internalUser as InternalUserRow | null;
  if (!internalUser || actor.kind !== "internal") {
    emitTimingLog({
      resultKind: "redirect",
      routeClass: "unauthorized",
      role: null,
      accountOwnerScoped: false,
      todayJobsCount: 0,
    });
    return { kind: "redirect", to: "/login" };
  }

  const readModel = await buildTodayReadModelForInternalActor(actor, internalUser, timedPhase);
  emitTimingLog({
    resultKind: "ok",
    routeClass: "internal",
    role: internalUser.role,
    accountOwnerScoped: true,
    todayJobsCount: readModel.todayWork.jobs.length,
  });
  return readModel;
}

async function buildTodayReadModelForInternalActor(
  actor: RequestActorContext,
  internalUser: InternalUserRow,
  timedPhase?: TodayTimedPhase,
): Promise<TodayReadModel> {
  const localTimedPhase: TodayTimedPhase = timedPhase
    ? timedPhase
    : async <T,>(_phaseName: string, factory: () => Promise<T>) => factory();

  const supabase = actor.supabase;
  const userId = String(actor.user?.id ?? "");
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const role = internalUser.role;
  const today = todayBusinessDateLA();
  const canViewBusinessPulse = canViewBusinessPulseForRole(role);
  const explicitFieldBillingCapabilities = await localTimedPhase(
    "fieldBillingExplicitCapabilitiesRead",
    () =>
      loadFieldBillingExplicitCapabilitiesForUser({
        supabase,
        accountOwnerUserId,
        internalUserId: userId,
      }),
  );
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });
  const canViewFailedPaymentAttention = canViewFinancialRegister({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
  });
  const showWelcomeModal = !hasDismissedTodayWelcome(actor.user?.user_metadata ?? null);
  const canViewConfirmPaymentAttention =
    canViewFailedPaymentAttention ||
    fieldBillingCapabilities.can_verify_non_card_collection;

  const productModePromise = localTimedPhase("concernReadProductMode", async () => {
    try {
      return await resolveProductModeForAccountOwnerId({
        supabase,
        accountOwnerUserId,
      });
    } catch {
      return "hybrid" as ProductMode;
    }
  });

  const identityPromise = localTimedPhase("concernReadTenantIdentity", async () => {
    try {
      return await resolveOperationalTenantIdentity({
        supabase,
        accountOwnerUserId,
      });
    } catch {
      return null;
    }
  });

  const unreadPromise = localTimedPhase("concernReadUnreadNotifications", async () => {
    try {
      return await getInternalUnreadNotificationBadgeCount({
        supabase,
        accountOwnerUserId,
      });
    } catch {
      return 0;
    }
  });

  // Time clock state (per-user) — only meaningful if feature flag is on.
  const timeClockSettingsPromise = localTimedPhase("concernReadTimeClockSettings", async () => {
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
  });

  const clockStatePromise = localTimedPhase("concernReadTimeClockState", async () => {
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
  });

  const todayJobsPromise = localTimedPhase("todayJobsRead", () =>
    safeLoadTodayJobsForRole({
      supabase,
      accountOwnerUserId,
      role,
      userId,
      today,
    }),
  );

  const priorityCountsPromise = localTimedPhase("priorityCountsRead", () =>
    safeLoadPriorityCounts({
      supabase,
      accountOwnerUserId,
      role,
      today,
    }),
  );

  const followUpsPromise = localTimedPhase("followUpsRead", () =>
    safeLoadFollowUps({ supabase, accountOwnerUserId, today }),
  );

  const teamCoveragePromise = localTimedPhase("teamCoverageRead", () =>
    safeLoadTeamCoverage({
      supabase,
      role,
      today,
      maxRows: 5,
    }),
  );

  const recentPromise = localTimedPhase("recentResumeRead", () =>
    safeLoadRecentResume({
      supabase,
      accountOwnerUserId,
      limit: 5,
    }),
  );

  const servicePlansPromise = localTimedPhase("servicePlansSummaryRead", async () => {
    if (!isMaintenanceAgreementsEnabled()) return null;
    try {
      return await summarizeMaintenanceAgreementsForAccount({
        supabase,
        accountOwnerUserId,
      });
    } catch {
      return null;
    }
  });

  const openInvoicePromise = localTimedPhase("openInvoiceSnapshotRead", () =>
    canViewBusinessPulse
      ? safeLoadOpenInvoiceSnapshot({ supabase, accountOwnerUserId })
      : Promise.resolve({ count: null, balanceCents: null }),
  );

  const failedPaymentAttentionPromise = localTimedPhase("failedPaymentAttentionRead", async () => {
    if (!canViewFailedPaymentAttention) {
      return {
        openCount: null,
        totalBalanceDueCents: null,
      };
    }

    try {
      const result = await loadFailedPaymentReconciliationItems({
        admin: supabase,
        accountOwnerUserId,
        limit: 25,
      });

      return {
        openCount: result.summary.openCount,
        totalBalanceDueCents: result.summary.totalBalanceDueCents,
      };
    } catch {
      return {
        openCount: null,
        totalBalanceDueCents: null,
      };
    }
  });

  const confirmPaymentAttentionPromise = localTimedPhase("confirmPaymentAttentionRead", async () => {
    if (!canViewConfirmPaymentAttention) {
      return {
        openCount: null,
        totalReportedAmountCents: null,
      };
    }

    try {
      const result = await listFieldPaymentCollectionReportsForReconciliation({
        admin: supabase,
        accountOwnerUserId,
        limit: 50,
      });

      return {
        openCount: result.summary.openCount,
        totalReportedAmountCents: result.summary.totalReportedAmountCents,
      };
    } catch {
      return {
        openCount: null,
        totalReportedAmountCents: null,
      };
    }
  });

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
    failedPaymentAttention,
    confirmPaymentAttention,
  ] = await localTimedPhase("groupedParallelAwait", async () =>
    Promise.all([
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
      failedPaymentAttentionPromise,
      confirmPaymentAttentionPromise,
    ]),
  );

  const servicePlansOverdue = servicePlans?.due_counts?.overdue ?? null;
  const servicePlansDueIn7 = servicePlans?.due_counts?.due_in_next_7_days ?? null;
  const servicePlansNotScheduled = servicePlans?.due_counts?.not_scheduled_active ?? null;
  const servicePlansActive = servicePlans?.status_counts?.active ?? null;

  const followUpGroups = buildFollowUpGroups({
    role,
    productMode,
    followUps,
    priorityCounts,
    servicePlansOverdue,
    openInvoiceCount: openInvoice.count,
    canViewBusinessPulse,
  });

  const dailyBriefing = buildDailyBriefing({
    role,
    productMode,
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
    companyLogoUrl: identity?.logoUrl ?? null,
    greetingLine: buildTodayGreetingLine(actor.user),
    roleLabel: roleLabelFor(role, productMode),
    productMode,
    clockState,
    timeClockEnabled,
    unreadNotificationCount: typeof unread === "number" ? unread : 0,
  };

  const businessPulse: BusinessPulse = {
    visible: canViewBusinessPulse,
    failedPaymentsOpenCount: canViewFailedPaymentAttention ? failedPaymentAttention.openCount : null,
    failedPaymentsBalanceAtRiskCents: canViewFailedPaymentAttention
      ? failedPaymentAttention.totalBalanceDueCents
      : null,
    servicePlansActive: canViewBusinessPulse ? servicePlansActive : null,
    servicePlansOverdue: canViewBusinessPulse ? servicePlansOverdue : null,
    servicePlansDueIn7: canViewBusinessPulse ? servicePlansDueIn7 : null,
    servicePlansNotScheduled: canViewBusinessPulse ? servicePlansNotScheduled : null,
    openInvoiceCount: canViewBusinessPulse ? openInvoice.count : null,
    openInvoiceBalanceCents: canViewBusinessPulse ? openInvoice.balanceCents : null,
    unreadNotificationCount: typeof unread === "number" ? unread : 0,
  };

  const roleAwarePulse = buildRoleAwarePulse({
    role,
    productMode,
    canViewBusinessPulse,
    canViewConfirmPaymentAttention,
    canViewFailedPaymentAttention,
    priorityCounts,
    openInvoiceCount: openInvoice.count,
    openInvoiceBalanceCents: openInvoice.balanceCents,
    confirmPaymentsOpenCount: confirmPaymentAttention.openCount,
    confirmPaymentsTotalReportedCents:
      confirmPaymentAttention.totalReportedAmountCents,
    failedPaymentsOpenCount: failedPaymentAttention.openCount,
    failedPaymentsBalanceAtRiskCents:
      failedPaymentAttention.totalBalanceDueCents,
  });

  const showFieldActions = role === "tech";
  const todayLabel = role === "tech" ? "My Work" : "Today’s Work";

  return localTimedPhase("composeReadModel", async () => ({
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
    roleAwarePulse,
    resumeRecentWork: recent.items,
    resumeRecentHasMore: recent.hasMore,
    showWelcomeModal,
  }));
}

// Exported for downstream presentation helpers that need the LA today key.
export function getTodayBusinessDateLA(now = new Date()): string {
  return todayBusinessDateLA(now);
}

// Re-export for tests / page rendering.
export { startOfTodayUtcIsoLA };
