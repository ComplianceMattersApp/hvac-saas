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
import { formatBusinessDateUS, startOfTodayUtcIsoLA } from "@/lib/utils/schedule-la";

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
  href: string;
  scheduledDateDisplay: string | null;
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

export type ResumeRecentItem = {
  key: string;
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
  nextBestAction: NextBestAction;
  todayWork: {
    label: string;
    jobs: TodayJobSummary[];
    showFieldActions: boolean;
  };
  priorityChips: PriorityChip[];
  followUps: FollowUpItem[];
  businessPulse: BusinessPulse;
  resumeRecentWork: ResumeRecentItem[];
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
  "id, title, status, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, field_complete, deleted_at, updated_at, account_owner_user_id";

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

async function safeLoadTodayJobsForRole(params: {
  supabase: any;
  accountOwnerUserId: string;
  role: InternalRole;
  userId: string;
  today: string;
}): Promise<TodayJobSummary[]> {
  const { supabase, accountOwnerUserId, role, userId, today } = params;

  try {
    let assignedIds: string[] | null = null;
    if (role === "tech") {
      assignedIds = await safeQueryAssignedJobIdsForUser(supabase, userId);
      if (assignedIds.length === 0) return [];
    }

    let q = supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .eq("account_owner_user_id", accountOwnerUserId)
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
  needScheduling: number | null;
  scheduledToday: number | null;
  pendingInfo: number | null;
  onHold: number | null;
  failed: number | null;
  closeoutReady: number | null;
}> {
  const { supabase, accountOwnerUserId, today } = params;

  const base = (q: any) =>
    q.eq("account_owner_user_id", accountOwnerUserId).is("deleted_at", null);

  const [needScheduling, scheduledToday, pendingInfo, onHold, failed, closeoutReady] =
    await Promise.all([
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
}): Promise<FollowUpItem[]> {
  try {
    const { data, error } = await params.supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .is("deleted_at", null)
      .in("ops_status", [
        "pending_info",
        "on_hold",
        "failed",
        "retest_needed",
        "pending_office_review",
        "invoice_required",
        "paperwork_required",
      ])
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(15);

    if (error) return [];

    return (data ?? [])
      .map((row: any) => {
        const job = normalizeJob(row);
        if (!job) return null;
        const reason = followUpReason(job.opsStatus);
        if (!reason) return null;
        return {
          key: job.id,
          title: job.title,
          reason,
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

function followUpReason(opsStatus: string | null): string | null {
  switch (opsStatus) {
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
    default:
      return null;
  }
}

async function safeLoadRecentResume(params: {
  supabase: any;
  accountOwnerUserId: string;
  limit: number;
}): Promise<ResumeRecentItem[]> {
  try {
    const { data, error } = await params.supabase
      .from("jobs")
      .select(TODAY_JOB_SELECT)
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(params.limit);

    if (error) return [];

    return (data ?? [])
      .map((row: any) => {
        const job = normalizeJob(row);
        if (!job) return null;
        const customer =
          [job.customerFirstName ?? "", job.customerLastName ?? ""]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(" ") || "Customer";
        const updatedRaw = row?.updated_at ? String(row.updated_at) : null;
        const updatedAtDisplay = updatedRaw
          ? formatBusinessDateUS(updatedRaw.slice(0, 10)) || null
          : null;
        return {
          key: job.id,
          title: job.title,
          subtitle: customer,
          href: `/jobs/${job.id}`,
          updatedAtDisplay,
        } satisfies ResumeRecentItem;
      })
      .filter((row: ResumeRecentItem | null): row is ResumeRecentItem => row != null);
  } catch {
    return [];
  }
}

async function safeLoadOpenInvoiceSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<{ count: number | null; balanceCents: number | null }> {
  // Best-effort read. Schema for internal invoices varies — we only read
  // status/balance columns if they exist. Any error yields nulls.
  try {
    const { data, error } = await params.supabase
      .from("internal_invoices")
      .select("status, balance_due_cents, total_cents, amount_paid_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .in("status", ["open", "sent", "partially_paid", "overdue"])
      .limit(500);

    if (error) return { count: null, balanceCents: null };
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return { count: 0, balanceCents: 0 };

    const balance = rows.reduce((sum: number, row: any) => {
      const explicit = Number(row?.balance_due_cents ?? NaN);
      if (Number.isFinite(explicit)) return sum + explicit;
      const total = Number(row?.total_cents ?? 0);
      const paid = Number(row?.amount_paid_cents ?? 0);
      const remaining = Math.max(0, total - paid);
      return sum + (Number.isFinite(remaining) ? remaining : 0);
    }, 0);

    return { count: rows.length, balanceCents: balance };
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
    needScheduling: number | null;
    scheduledToday: number | null;
    pendingInfo: number | null;
    onHold: number | null;
    failed: number | null;
    closeoutReady: number | null;
  };
  openInvoiceCount: number | null;
  servicePlansOverdue: number | null;
};

export function selectNextBestAction(inputs: NextBestActionInputs): NextBestAction {
  const {
    role,
    productMode,
    todayJobs,
    priorityCounts,
    openInvoiceCount,
    servicePlansOverdue,
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
        job: focus,
      };
    }
    return {
      kind: "empty",
      headline: "No assigned jobs right now.",
      detail: "New assignments will show up here as dispatch routes them to you.",
      primaryHref: "/ops/field",
      primaryLabel: "View My Work",
    };
  }

  // Billing: prioritize money stuck.
  if (role === "billing") {
    if ((openInvoiceCount ?? 0) > 0) {
      return {
        kind: "billing_money_stuck",
        headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"} awaiting payment`,
        detail: "Review open balances and follow up on the oldest first.",
        primaryHref: "/reports",
        primaryLabel: "Open Reports",
      };
    }
    return calmBillingDefault();
  }

  // Office / dispatcher: schedule coverage first, then exceptions.
  if (role === "office") {
    if ((priorityCounts.needScheduling ?? 0) > 0) {
      return {
        kind: "dispatcher_schedule",
        headline: `${priorityCounts.needScheduling} job${priorityCounts.needScheduling === 1 ? "" : "s"} need scheduling`,
        detail: "Get unscheduled work onto the calendar.",
        primaryHref: "/ops/call-list",
        primaryLabel: "Open Unscheduled Work",
      };
    }
    if ((priorityCounts.failed ?? 0) > 0 && productMode !== "hvac_service") {
      return {
        kind: "compliance_exception",
        headline: `${priorityCounts.failed} exception${priorityCounts.failed === 1 ? "" : "s"} need review`,
        detail: "Failed or retest-ready work waiting on office action.",
        primaryHref: "/ops?bucket=failed",
        primaryLabel: "Open Exceptions",
      };
    }
    if ((priorityCounts.scheduledToday ?? 0) > 0) {
      return {
        kind: "dispatcher_schedule",
        headline: `${priorityCounts.scheduledToday} visit${priorityCounts.scheduledToday === 1 ? "" : "s"} scheduled today`,
        detail: "Confirm coverage and tech assignments.",
        primaryHref: "/ops",
        primaryLabel: "Open Operations",
      };
    }
    return calmOfficeDefault();
  }

  // Admin / owner: rank across compliance, money, recurring, schedule.
  if (productMode === "ecc_hers" && (priorityCounts.failed ?? 0) > 0) {
    return {
      kind: "compliance_exception",
      headline: `${priorityCounts.failed} compliance item${priorityCounts.failed === 1 ? "" : "s"} need review`,
      detail: "Failed, retest, or pending office review jobs.",
      primaryHref: "/ops?bucket=failed",
      primaryLabel: "Open Exceptions",
    };
  }

  if ((openInvoiceCount ?? 0) > 0) {
    return {
      kind: "billing_money_stuck",
      headline: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"}`,
      detail: "Review revenue waiting on payment.",
      primaryHref: "/reports",
      primaryLabel: "Open Reports",
    };
  }

  if ((priorityCounts.needScheduling ?? 0) > 0) {
    return {
      kind: "dispatcher_schedule",
      headline: `${priorityCounts.needScheduling} job${priorityCounts.needScheduling === 1 ? "" : "s"} need scheduling`,
      detail: "Unscheduled work waiting for dispatch.",
      primaryHref: "/ops/call-list",
      primaryLabel: "Open Unscheduled Work",
    };
  }

  if (
    productMode !== "ecc_hers" &&
    (servicePlansOverdue ?? 0) > 0
  ) {
    return {
      kind: "service_plan_due",
      headline: `${servicePlansOverdue} service plan${servicePlansOverdue === 1 ? "" : "s"} overdue`,
      detail: "Recurring obligations slipping past due.",
      primaryHref: "/service-plans",
      primaryLabel: "Open Service Plans",
    };
  }

  if ((priorityCounts.closeoutReady ?? 0) > 0) {
    return {
      kind: "owner_exception",
      headline: `${priorityCounts.closeoutReady} job${priorityCounts.closeoutReady === 1 ? "" : "s"} ready for closeout`,
      detail: "Finish certs or invoicing to recognize completion.",
      primaryHref: "/ops/closeout-queue",
      primaryLabel: "Open Closeout Queue",
    };
  }

  return calmOwnerDefault();
}

function calmOwnerDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "Nothing urgent on the board.",
    detail: "Your team is caught up on schedule, exceptions, and money for the moment.",
    primaryHref: "/ops",
    primaryLabel: "Open Operations",
  };
}

function calmOfficeDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "Schedule is clear right now.",
    detail: "No unscheduled, exception, or coverage gaps need immediate action.",
    primaryHref: "/ops",
    primaryLabel: "Open Operations",
  };
}

function calmBillingDefault(): NextBestAction {
  return {
    kind: "empty",
    headline: "No open balances waiting.",
    detail: "All invoiced work is paid or in flight.",
    primaryHref: "/reports",
    primaryLabel: "Open Reports",
  };
}

function techJobDetail(job: TodayJobSummary): string | null {
  const address = [job.jobAddress, job.city].filter(Boolean).join(", ");
  const status = job.status === "on_the_way" ? "On the way" : job.status === "in_process" ? "In process" : null;
  const parts = [status, address].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
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
}): PriorityChip[] {
  const chips: PriorityChip[] = [];

  if ((params.priorityCounts.needScheduling ?? 0) > 0) {
    chips.push({
      key: "need_scheduling",
      label: "Need Scheduling",
      count: params.priorityCounts.needScheduling ?? 0,
      href: "/ops/call-list",
      tone: "warn",
      urgent: (params.priorityCounts.needScheduling ?? 0) >= 5,
    });
  }

  if ((params.priorityCounts.failed ?? 0) > 0) {
    chips.push({
      key: "exceptions",
      label: "Needs Attention",
      count: params.priorityCounts.failed ?? 0,
      href: "/ops?bucket=failed",
      tone: "danger",
      urgent: true,
    });
  }

  if ((params.priorityCounts.pendingInfo ?? 0) > 0) {
    chips.push({
      key: "waiting",
      label: "Waiting on Info",
      count: params.priorityCounts.pendingInfo ?? 0,
      href: "/ops?bucket=pending_info",
      tone: "neutral",
      urgent: false,
    });
  }

  if ((params.priorityCounts.onHold ?? 0) > 0) {
    chips.push({
      key: "on_hold",
      label: "On Hold",
      count: params.priorityCounts.onHold ?? 0,
      href: "/ops?bucket=on_hold",
      tone: "neutral",
      urgent: false,
    });
  }

  if ((params.priorityCounts.closeoutReady ?? 0) > 0) {
    chips.push({
      key: "closeout",
      label: "Ready for Closeout",
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
    chips.push({
      key: "service_plans_due",
      label: "Service Plans Due",
      count: params.servicePlansOverdue ?? 0,
      href: "/service-plans",
      tone: "warn",
      urgent: false,
    });
  }

  if (params.canViewBusinessPulse && (params.openInvoiceCount ?? 0) > 0) {
    chips.push({
      key: "open_invoices",
      label: "Open Invoices",
      count: params.openInvoiceCount ?? 0,
      href: "/reports",
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

  const followUpsPromise = safeLoadFollowUps({ supabase, accountOwnerUserId });

  const recentPromise = safeLoadRecentResume({
    supabase,
    accountOwnerUserId,
    limit: 6,
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
    recentPromise,
    servicePlansPromise,
    openInvoicePromise,
  ]);

  const servicePlansOverdue = servicePlans?.due_counts?.overdue ?? null;
  const servicePlansDueIn7 = servicePlans?.due_counts?.due_in_next_7_days ?? null;
  const servicePlansActive = servicePlans?.status_counts?.active ?? null;

  const nextBestAction = selectNextBestAction({
    role,
    productMode,
    todayJobs,
    priorityCounts,
    openInvoiceCount: openInvoice.count,
    servicePlansOverdue,
  });

  const priorityChips = buildPriorityChips({
    productMode,
    role,
    priorityCounts,
    servicePlansOverdue,
    openInvoiceCount: openInvoice.count,
    canViewBusinessPulse,
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
    nextBestAction,
    todayWork: {
      label: todayLabel,
      jobs: todayJobs,
      showFieldActions,
    },
    priorityChips,
    followUps: followUps.slice(0, role === "tech" ? 3 : 8),
    businessPulse,
    resumeRecentWork: recent.slice(0, 6),
  };
}

// Exported for downstream presentation helpers that need the LA today key.
export function getTodayBusinessDateLA(now = new Date()): string {
  return todayBusinessDateLA(now);
}

// Re-export for tests / page rendering.
export { startOfTodayUtcIsoLA };
