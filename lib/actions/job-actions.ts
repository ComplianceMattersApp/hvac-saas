//lib/actions/job-actions

"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath, refresh } from "next/cache";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";
import { findOrCreateCustomer } from "@/lib/customers/findOrCreateCustomer";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from "@/lib/actions/job-evaluator";
import { forceSetOpsStatus } from "@/lib/actions/ops-status";
import { releasePendingInfoAndRecompute } from "@/lib/actions/job-ops-actions";
import { buildMovementEventMeta, buildStaffingSnapshotMeta } from "@/lib/actions/job-event-meta";
import {
  createContractorIntakeProposalAwarenessNotification,
  insertInternalNotificationForEvent,
} from "@/lib/actions/notification-actions";
import { resolveCanonicalOwner } from "@/lib/auth/canonical-owner";
import {
  loadScopedInternalJobForMutation,
  loadScopedInternalServiceCaseForMutation,
} from "@/lib/auth/internal-job-scope";
import {
  loadScopedInternalEquipmentJobForMutation,
  loadScopedInternalJobEquipmentForMutation,
} from "@/lib/auth/internal-equipment-scope";
import { loadScopedInternalContractorForMutation } from "@/lib/auth/internal-contractor-scope";
import {
  loadScopedInternalEccJobForMutation,
  loadScopedInternalEccTestRunForMutation,
} from "@/lib/auth/internal-ecc-scope";
import { requireInternalRole, requireInternalUser } from "@/lib/auth/internal-user";
import {
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import { renderSystemEmailLayout, escapeHtml, resolveAppUrl } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";
import { resolveNotificationAccountOwnerUserId } from "@/lib/notifications/account-owner";
import { assertAssignableInternalUser } from "@/lib/staffing/human-layer";
import { getThresholdRuleForTest } from "@/lib/ecc/rule-profiles";
import type { JobStatus } from "@/lib/types/job";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { mapToCanonicalRole, sanitizeEquipmentFields } from "@/lib/utils/equipment-domain";
import {
  buildContractorProposalSubmissionFields,
  deriveInternalIntakeJobTitle,
  resolveCreateJobTitle,
} from "@/lib/utils/contractor-intake-title";
import {
  hasVisitScopeContent,
  isVisitScopeItemPromoted,
  parseVisitScopeItemsJson,
  sanitizeVisitScopeItems,
  sanitizeVisitScopeSummary,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";

export type { JobStatus } from "@/lib/types/job";

type OnTheWayUndoEligibility = {
  eligible: boolean;
  reason: string | null;
  onMyWayEventId: string | null;
};

type CreateJobInput = {
  ops_status?: string | null;
  parent_job_id?: string | null;
  service_case_id?: string | null;
  service_case_kind?: string | null;
  job_type?: string | null;
  service_visit_type?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
  customer_id?: string | null;
  location_id?: string | null;
  project_type?: string | null;
  title: string;
  city: string;
  scheduled_date: string | null;
  status: JobStatus;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
  visit_scope_summary?: string | null;
  visit_scope_items?: VisitScopeItem[] | null;
  job_address?: string | null;
  billing_recipient?: "contractor" | "customer" | "other" | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  
  };

type IntakeRelationshipJobSummary = {
  id: string;
  title: string | null;
  job_type: string | null;
  status: string | null;
  ops_status: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string | null;
};

export type InternalIntakeRelationshipContext = {
  activeJobs: IntakeRelationshipJobSummary[];
  recentJobs: IntakeRelationshipJobSummary[];
};

function normalizeIntakeJobType(value: unknown): "ecc" | "service" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "ecc" || normalized === "service" ? normalized : null;
}

function isActiveIntakeRelationshipJob(job: {
  status?: string | null;
  ops_status?: string | null;
}) {
  const lifecycleStatus = String(job.status ?? "").trim().toLowerCase();
  if (lifecycleStatus === "cancelled") return false;

  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  return opsStatus !== "closed";
}

function mapIntakeRelationshipJobSummary(row: any): IntakeRelationshipJobSummary {
  return {
    id: String(row?.id ?? ""),
    title: row?.title ? String(row.title) : null,
    job_type: row?.job_type ? String(row.job_type) : null,
    status: row?.status ? String(row.status) : null,
    ops_status: row?.ops_status ? String(row.ops_status) : null,
    scheduled_date: row?.scheduled_date ? String(row.scheduled_date) : null,
    window_start: row?.window_start ? String(row.window_start) : null,
    window_end: row?.window_end ? String(row.window_end) : null,
    created_at: row?.created_at ? String(row.created_at) : null,
  };
}

function isOpenActiveJobCandidate(row: {
  status?: string | null;
  ops_status?: string | null;
}) {
  const lifecycleStatus = String(row.status ?? "").trim().toLowerCase();
  const opsStatus = String(row.ops_status ?? "").trim().toLowerCase();

  if (lifecycleStatus === "on_the_way" || lifecycleStatus === "in_process" || lifecycleStatus === "in_progress") {
    return true;
  }

  return opsStatus === "in_process" || opsStatus === "scheduled";
}

function intakeRelationshipCandidateSortValue(row: {
  status?: string | null;
  ops_status?: string | null;
  created_at?: string | null;
}) {
  const lifecycleStatus = String(row.status ?? "").trim().toLowerCase();
  const opsStatus = String(row.ops_status ?? "").trim().toLowerCase();
  const isLive =
    lifecycleStatus === "on_the_way" ||
    lifecycleStatus === "in_process" ||
    lifecycleStatus === "in_progress" ||
    opsStatus === "in_process";
  const createdAtMs = row.created_at ? new Date(String(row.created_at)).getTime() : 0;

  return {
    liveRank: isLive ? 1 : 0,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
  };
}

async function cleanupOrphanSystem(opts: {
  supabase: any;
  jobId: string;
  systemId: string;
}) {
  const { supabase, jobId, systemId } = opts;
  if (!systemId) return;

  // any equipment left on this system?
  const { count: eqCount, error: eqErr } = await supabase
    .from("job_equipment")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (eqErr) throw eqErr;

  // any test runs left on this system?
  const { count: trCount, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (trErr) throw trErr;

  // orphan rule
  if ((eqCount ?? 0) === 0 && (trCount ?? 0) === 0) {
    const { error: delSysErr } = await supabase
      .from("job_systems")
      .delete()
      .eq("job_id", jobId)
      .eq("id", systemId);

    if (delSysErr) throw delSysErr;
  }
}

async function applyRetestResolution(params: {
  supabase: any;
  childJobId: string;
  parentJobId: string;
  childOpsBefore: string | null;
  childOpsAfter: string | null;
}) {
  const { supabase, childJobId, parentJobId, childOpsBefore, childOpsAfter } = params;

  // Only act on transitions into terminal ECC outcomes
  const becamePassed =
    childOpsAfter === "paperwork_required" && childOpsBefore !== "paperwork_required";
  const becameFailed =
    childOpsAfter === "failed" && childOpsBefore !== "failed";

  if (!becamePassed && !becameFailed) return;

  if (becamePassed) {
    // Child event
    await insertJobEvent({
      supabase,
      jobId: childJobId,
      event_type: "job_passed",
      meta: { via: "ecc_evaluate" },
    });

    // Parent breadcrumb
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_passed",
      meta: { child_job_id: childJobId },
    });
  }

  if (becameFailed) {
    // Child event
    await insertJobEvent({
      supabase,
      jobId: childJobId,
      event_type: "job_failed",
      meta: { via: "ecc_evaluate" },
    });

    // Parent breadcrumb (no parent status change)
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_failed",
      meta: { child_job_id: childJobId },
    });
  }
}

export async function insertJobEvent(params: {
  supabase: any;
  jobId: string;
  event_type: string;
  meta?: Record<string, any> | null;
  userId?: string | null;
}) {
  const { supabase, jobId, event_type } = params;
  const meta = params.meta ?? null;
  const userId = params.userId ?? null;

  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type,
    meta,
    user_id: userId,
  });

  if (error) throw error;
}

async function getOnTheWayUndoEligibilityInternal(params: {
  supabase: any;
  jobId: string;
}): Promise<OnTheWayUndoEligibility> {
  const jobId = String(params.jobId ?? "").trim();

  if (!jobId) {
    return {
      eligible: false,
      reason: "missing_job_id",
      onMyWayEventId: null,
    };
  }

  const { supabase } = params;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("status, on_the_way_at")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;

  if (!job) {
    return {
      eligible: false,
      reason: "job_not_found",
      onMyWayEventId: null,
    };
  }

  if (String(job.status ?? "").trim().toLowerCase() !== "on_the_way") {
    return {
      eligible: false,
      reason: "status_not_on_the_way",
      onMyWayEventId: null,
    };
  }

  if (!job.on_the_way_at) {
    return {
      eligible: false,
      reason: "missing_on_the_way_at",
      onMyWayEventId: null,
    };
  }

  const { data: latestEvent, error: latestEventErr } = await supabase
    .from("job_events")
    .select("id, event_type, meta")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestEventErr) throw latestEventErr;

  if (!latestEvent?.id) {
    return {
      eligible: false,
      reason: "missing_on_my_way_event",
      onMyWayEventId: null,
    };
  }

  if (String(latestEvent.event_type ?? "").trim() !== "on_my_way") {
    return {
      eligible: false,
      reason: "later_event_exists",
      onMyWayEventId: null,
    };
  }

  const meta =
    latestEvent.meta && typeof latestEvent.meta === "object" && !Array.isArray(latestEvent.meta)
      ? latestEvent.meta
      : null;

  const movementTo = String(meta?.movement_context?.to_status ?? meta?.to ?? "")
    .trim()
    .toLowerCase();
  const sourceAction = String(meta?.source_action ?? "").trim().toLowerCase();
  const autoScheduleApplied = meta?.auto_schedule_applied === true;

  if (movementTo && movementTo !== "on_the_way") {
    return {
      eligible: false,
      reason: "latest_event_not_on_the_way_transition",
      onMyWayEventId: null,
    };
  }

  if (sourceAction && sourceAction !== "advance_job_status_from_form") {
    return {
      eligible: false,
      reason: "unsupported_source_action",
      onMyWayEventId: null,
    };
  }

  if (autoScheduleApplied) {
    return {
      eligible: false,
      reason: "auto_schedule_applied",
      onMyWayEventId: null,
    };
  }

  return {
    eligible: true,
    reason: null,
    onMyWayEventId: String(latestEvent.id),
  };
}

export async function getOnTheWayUndoEligibility(jobId: string): Promise<OnTheWayUndoEligibility> {
  const supabase = await createClient();
  return getOnTheWayUndoEligibilityInternal({ supabase, jobId });
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatServiceAddress(job: any) {
  const loc = Array.isArray(job?.locations)
    ? job.locations.find((x: any) => x) ?? null
    : job?.locations ?? null;

  const line1 = String(loc?.address_line1 ?? "").trim() || String(job?.job_address ?? "").trim();
  const line2 = String(loc?.address_line2 ?? "").trim();
  const city = String(loc?.city ?? "").trim() || String(job?.city ?? "").trim();
  const state = String(loc?.state ?? "").trim();
  const zip = String(loc?.zip ?? "").trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, line2, cityStateZip].filter(Boolean).join(", ");
}

function buildCustomerScheduledEmailHtml(args: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string;
  serviceAddress: string;
  scheduledDate: string;
  scheduledWindow: string;
  serviceType: string | null;
  companyName: string | null;
  supportDisplayName: string;
  supportPhone: string | null;
  supportEmail: string | null;
}) {
  const details: string[] = [
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Service Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Scheduled Date:</strong> ${escapeHtml(args.scheduledDate)}</li>`,
    `<li><strong>Time Window:</strong> ${escapeHtml(args.scheduledWindow)}</li>`,
  ];

  if (args.serviceType) {
    details.push(`<li><strong>Service Type:</strong> ${escapeHtml(args.serviceType)}</li>`);
  }

  if (args.companyName) {
    details.push(`<li><strong>Service Company:</strong> ${escapeHtml(args.companyName)}</li>`);
  }

  details.push(`<li><strong>Customer Email:</strong> ${escapeHtml(args.customerEmail)}</li>`);

  if (args.customerPhone) {
    details.push(`<li><strong>Customer Phone:</strong> ${escapeHtml(args.customerPhone)}</li>`);
  }

  const supportDetails = [args.supportPhone, args.supportEmail].filter(Boolean).join(" • ");
  const supportLine = supportDetails
    ? `${escapeHtml(args.supportDisplayName)} (${escapeHtml(supportDetails)})`
    : escapeHtml(args.supportDisplayName);

  return renderSystemEmailLayout({
    title: "Your Job Is Scheduled",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Your upcoming service has been scheduled.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      <p style="margin: 0 0 12px 0;">Please ensure someone can provide access to the service location during the scheduled time window.</p>
      <p style="margin: 0;">If you need to make changes, please contact ${supportLine} as soon as possible.</p>
    `,
  });
}

function buildContractorScheduledEmailHtml(args: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceAddress: string;
  scheduledDate: string;
  scheduledWindow: string;
  serviceType: string | null;
  permitNumber: string | null;
  portalJobUrl: string | null;
  companyName: string | null;
  supportDisplayName: string;
}) {
  const details: string[] = [
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Service Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Scheduled Date:</strong> ${escapeHtml(args.scheduledDate)}</li>`,
    `<li><strong>Time Window:</strong> ${escapeHtml(args.scheduledWindow)}</li>`,
  ];

  if (args.customerPhone) {
    details.push(`<li><strong>Customer Phone:</strong> ${escapeHtml(args.customerPhone)}</li>`);
  }

  if (args.customerEmail) {
    details.push(`<li><strong>Customer Email:</strong> ${escapeHtml(args.customerEmail)}</li>`);
  }

  if (args.serviceType) {
    details.push(`<li><strong>Service Type:</strong> ${escapeHtml(args.serviceType)}</li>`);
  }

  if (args.companyName) {
    details.push(`<li><strong>Company:</strong> ${escapeHtml(args.companyName)}</li>`);
  }

  if (args.permitNumber) {
    details.push(`<li><strong>Permit Number:</strong> ${escapeHtml(args.permitNumber)}</li>`);
  }

  const portalSection = args.portalJobUrl
    ? `<p style="margin: 0 0 12px 0;">Portal Job Link: <a href="${escapeHtml(args.portalJobUrl)}">${escapeHtml(args.portalJobUrl)}</a></p>`
    : "";

  return renderSystemEmailLayout({
    title: `${args.supportDisplayName} Schedule`,
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">A job has been scheduled or updated.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      <p style="margin: 0 0 12px 0;">Please ensure someone can provide access to the property and equipment if needed.</p>
      ${portalSection}
      <p style="margin: 0;">For questions or changes, please contact us directly.</p>
    `,
  });
}

type OperationalEmailRecipientType = "customer" | "contractor" | "internal";

type OperationalEmailNotificationType =
  | "customer_job_scheduled_email"
  | "contractor_job_scheduled_email"
  | "internal_contractor_job_intake_email"
  | "internal_contractor_intake_proposal_email";

type OperationalEmailDeliveryStatus = "queued" | "sent" | "failed";

function normalizeScheduleValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function buildScheduleSignature(input: {
  scheduledDate: unknown;
  windowStart: unknown;
  windowEnd: unknown;
}): string {
  return [
    normalizeScheduleValue(input.scheduledDate) ?? "",
    normalizeScheduleValue(input.windowStart) ?? "",
    normalizeScheduleValue(input.windowEnd) ?? "",
  ].join("|");
}

function buildOperationalEmailDedupeKey(input: {
  jobId: string;
  notificationType: OperationalEmailNotificationType;
  scope: string;
}): string {
  return `${input.notificationType}:${input.jobId}:${input.scope}`;
}

async function findExistingOperationalEmailDelivery(input: {
  supabase: any;
  notificationType: OperationalEmailNotificationType;
  dedupeKey: string;
}): Promise<{ id: string; status: string | null } | null> {
  const dedupeKey = String(input.dedupeKey ?? "").trim();
  if (!dedupeKey) return null;

  const { data, error } = await input.supabase
    .from("notifications")
    .select("id, status")
    .eq("channel", "email")
    .eq("notification_type", input.notificationType)
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

async function hasOperationalEmailHistory(input: {
  supabase: any;
  jobId: string;
  notificationType: OperationalEmailNotificationType;
}): Promise<boolean> {
  const { data, error } = await input.supabase
    .from("notifications")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("channel", "email")
    .eq("notification_type", input.notificationType)
    .in("status", ["queued", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function insertOperationalEmailDeliveryNotification(input: {
  supabase: any;
  jobId: string;
  notificationType: OperationalEmailNotificationType;
  recipientType: OperationalEmailRecipientType;
  recipientRef?: string | null;
  recipientEmail?: string | null;
  subject: string;
  body: string;
  dedupeKey: string;
  status: OperationalEmailDeliveryStatus;
  sentAt?: string | null;
  errorDetail?: string | null;
}): Promise<{ id: string }> {
  const accountOwnerUserId = await resolveNotificationAccountOwnerUserId({
    jobId: input.jobId,
  });

  if (!accountOwnerUserId) {
    throw new Error(`Unable to resolve notification account owner for job ${input.jobId}`);
  }

  const payload: Record<string, unknown> = {
    source: "operational_email",
    dedupe_key: input.dedupeKey,
  };

  const recipientEmail = String(input.recipientEmail ?? "").trim().toLowerCase() || null;
  if (recipientEmail) payload.recipient_email = recipientEmail;

  const errorDetail = String(input.errorDetail ?? "").trim() || null;
  if (errorDetail) payload.error_detail = errorDetail;

  const { data, error } = await input.supabase
    .from("notifications")
    .insert({
      job_id: input.jobId,
      recipient_type: input.recipientType,
      recipient_ref: String(input.recipientRef ?? "").trim() || null,
      channel: "email",
      notification_type: input.notificationType,
      account_owner_user_id: accountOwnerUserId,
      subject: input.subject,
      body: input.body,
      payload,
      status: input.status,
      sent_at: input.status === "sent" ? input.sentAt ?? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create operational email notification row");

  return { id: String(data.id) };
}

async function markOperationalEmailDeliveryNotification(input: {
  supabase: any;
  notificationId: string;
  status: "sent" | "failed";
  sentAt?: string | null;
  errorDetail?: string | null;
}): Promise<void> {
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
      patch.body = `Operational email delivery failed: ${errorDetail}`;
    }
  }

  const { error } = await input.supabase
    .from("notifications")
    .update(patch)
    .eq("id", notificationId);

  if (error) throw error;
}

function resolveOpsAlertAppUrl(): string | null {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    resolveAppUrl(),
    String(process.env.SITE_URL ?? "").trim(),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return raw.replace(/\/$/, "");
      }
    } catch {
      // Ignore invalid URL values and continue scanning candidates.
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return null;
}

function formatCreatedDateTimeLA(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function buildContractorIntakeAlertEmailHtml(args: {
  contractorName: string;
  customerName: string;
  serviceAddress: string;
  serviceType: string;
  createdAtText: string;
  jobUrl: string | null;
}) {
  const details: string[] = [
    `<li><strong>Contractor:</strong> ${escapeHtml(args.contractorName)}</li>`,
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Service/Test Type:</strong> ${escapeHtml(args.serviceType)}</li>`,
    `<li><strong>Created:</strong> ${escapeHtml(args.createdAtText)}</li>`,
  ];

  const linkBlock = args.jobUrl
    ? `<p style="margin: 0 0 12px 0;"><strong>Job Link:</strong> <a href="${escapeHtml(args.jobUrl)}">${escapeHtml(args.jobUrl)}</a></p>`
    : "";

  return renderSystemEmailLayout({
    title: "New Contractor Intake Job",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">A contractor submitted a new job that needs office/admin review.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      ${linkBlock}
      <p style="margin: 0;">Please review scheduling and next steps in Ops.</p>
    `,
  });
}

function buildContractorIntakeProposalAlertEmailHtml(args: {
  contractorName: string;
  customerName: string;
  proposedAddress: string;
  serviceType: string;
  submittedAtText: string;
  proposalUrl: string | null;
}) {
  const details: string[] = [
    `<li><strong>Contractor:</strong> ${escapeHtml(args.contractorName)}</li>`,
    `<li><strong>Proposed Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Proposed Address:</strong> ${escapeHtml(args.proposedAddress)}</li>`,
    `<li><strong>Service/Test Type:</strong> ${escapeHtml(args.serviceType)}</li>`,
    `<li><strong>Submitted:</strong> ${escapeHtml(args.submittedAtText)}</li>`,
  ];

  const linkBlock = args.proposalUrl
    ? `<p style="margin: 0 0 12px 0;"><strong>Proposal Link:</strong> <a href="${escapeHtml(args.proposalUrl)}">${escapeHtml(args.proposalUrl)}</a></p>`
    : "";

  return renderSystemEmailLayout({
    title: "New Contractor Intake Proposal",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">A contractor submitted a new intake proposal that requires internal review before canonical job creation.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      ${linkBlock}
      <p style="margin: 0;">Please review and finalize or reject from the Admin intake proposals queue.</p>
    `,
  });
}

async function resolveInternalOpsRecipientEmails(params: {
  admin: any;
  accountOwnerUserId: string;
}): Promise<string[]> {
  const { admin, accountOwnerUserId } = params;

  const { data: internalRows, error: internalErr } = await admin
    .from("internal_users")
    .select("user_id, role, is_active")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .in("role", ["admin", "office"]);

  if (internalErr) throw internalErr;

  const recipientUserIds = Array.from(
    new Set(
      (internalRows ?? [])
        .map((row: any) => String(row?.user_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (recipientUserIds.length === 0) return [];

  const { data: profileRows, error: profileErr } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", recipientUserIds);

  if (profileErr) throw profileErr;

  return Array.from(
    new Set(
      (profileRows ?? [])
        .map((row: any) => String(row?.email ?? "").trim().toLowerCase())
        .filter((email: string) => email.includes("@")),
    ),
  );
}

async function sendInternalContractorIntakeAlertEmail(params: {
  jobId: string;
  accountOwnerUserId: string;
}): Promise<void> {
  const { jobId, accountOwnerUserId } = params;
  const admin = createAdminClient();
  const intakeDedupeKey = buildOperationalEmailDedupeKey({
    jobId,
    notificationType: "internal_contractor_job_intake_email",
    scope: "initial_submission",
  });

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase: admin,
    notificationType: "internal_contractor_job_intake_email",
    dedupeKey: intakeDedupeKey,
  });

  if (existingDelivery) return;

  const recipientEmails = await resolveInternalOpsRecipientEmails({
    admin,
    accountOwnerUserId,
  });

  if (recipientEmails.length === 0) return;

  const { data: jobSnapshot, error: jobErr } = await admin
    .from("jobs")
    .select(
      `
      id,
      created_at,
      job_type,
      project_type,
      city,
      job_address,
      customer_first_name,
      customer_last_name,
      contractor_id,
      contractors:contractor_id ( name ),
      locations:location_id (address_line1, address_line2, city, state, zip)
      `,
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!jobSnapshot?.id) return;

  const customerName =
    [
      String((jobSnapshot as any)?.customer_first_name ?? "").trim(),
      String((jobSnapshot as any)?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const contractorName =
    String((jobSnapshot as any)?.contractors?.name ?? "").trim() || "Contractor";

  const serviceAddress = formatServiceAddress(jobSnapshot) || "Address not available";

  const jobTypeRaw = String((jobSnapshot as any)?.job_type ?? "").trim();
  const projectTypeRaw = String((jobSnapshot as any)?.project_type ?? "").trim();
  const serviceType = [toTitleCase(jobTypeRaw), toTitleCase(projectTypeRaw)]
    .filter(Boolean)
    .join(" / ") || "Not specified";

  const createdAtText = formatCreatedDateTimeLA(
    String((jobSnapshot as any)?.created_at ?? "").trim() || null,
  );

  const appUrl = resolveOpsAlertAppUrl();
  const jobUrl = appUrl ? `${appUrl}/jobs/${jobId}` : null;

  const subject = `New Contractor Job Intake - ${customerName} - ${serviceAddress}`;
  const html = buildContractorIntakeAlertEmailHtml({
    contractorName,
    customerName,
    serviceAddress,
    serviceType,
    createdAtText,
    jobUrl,
  });

  const queuedDelivery = await insertOperationalEmailDeliveryNotification({
    supabase: admin,
    jobId,
    notificationType: "internal_contractor_job_intake_email",
    recipientType: "internal",
    subject,
    body: "Internal ops/admin alert for contractor-submitted job.",
    dedupeKey: intakeDedupeKey,
    status: "queued",
  });

  try {
    await sendEmail({
      to: recipientEmails,
      subject,
      html,
    });

    await markOperationalEmailDeliveryNotification({
      supabase: admin,
      notificationId: queuedDelivery.id,
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase: admin,
      notificationId: queuedDelivery.id,
      status: "failed",
      errorDetail: errorMessage,
    });

    throw error;
  }
}

async function sendInternalContractorIntakeProposalAlertEmail(params: {
  proposalId: string;
  accountOwnerUserId: string;
}): Promise<void> {
  const proposalId = String(params.proposalId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!proposalId || !accountOwnerUserId) return;

  const admin = createAdminClient();
  const dedupeKey = `internal_contractor_intake_proposal_email:${proposalId}:initial_submission`;

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase: admin,
    notificationType: "internal_contractor_intake_proposal_email",
    dedupeKey,
  });

  if (existingDelivery) return;

  const recipientEmails = await resolveInternalOpsRecipientEmails({
    admin,
    accountOwnerUserId,
  });

  if (recipientEmails.length === 0) return;

  const { data: proposal, error: proposalErr } = await admin
    .from("contractor_intake_submissions")
    .select(
      `
      id,
      created_at,
      contractor_id,
      proposed_customer_first_name,
      proposed_customer_last_name,
      proposed_address_line1,
      proposed_city,
      proposed_zip,
      proposed_job_type,
      proposed_project_type,
      contractors:contractor_id ( name )
      `,
    )
    .eq("id", proposalId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (proposalErr) throw proposalErr;
  if (!proposal?.id) return;

  const contractorName = String((proposal as any)?.contractors?.name ?? "").trim() || "Contractor";
  const customerName = [
    String((proposal as any)?.proposed_customer_first_name ?? "").trim(),
    String((proposal as any)?.proposed_customer_last_name ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ") || "Customer";

  const proposedAddress = [
    String((proposal as any)?.proposed_address_line1 ?? "").trim(),
    String((proposal as any)?.proposed_city ?? "").trim(),
    String((proposal as any)?.proposed_zip ?? "").trim(),
  ]
    .filter(Boolean)
    .join(", ") || "Address not available";

  const serviceType = [
    toTitleCase(String((proposal as any)?.proposed_job_type ?? "").trim()),
    toTitleCase(String((proposal as any)?.proposed_project_type ?? "").trim()),
  ]
    .filter(Boolean)
    .join(" / ") || "Not specified";

  const submittedAtText = formatCreatedDateTimeLA(
    String((proposal as any)?.created_at ?? "").trim() || null,
  );

  const appUrl = resolveOpsAlertAppUrl();
  const proposalUrl = appUrl
    ? `${appUrl}/ops/admin/contractor-intake-submissions/${proposalId}`
    : null;

  const subject = `New Contractor Intake Proposal - ${customerName} - ${proposedAddress}`;
  const html = buildContractorIntakeProposalAlertEmailHtml({
    contractorName,
    customerName,
    proposedAddress,
    serviceType,
    submittedAtText,
    proposalUrl,
  });

  const { data: queuedDelivery, error: queueErr } = await admin
    .from("notifications")
    .insert({
      job_id: null,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: "internal",
      recipient_ref: null,
      channel: "email",
      notification_type: "internal_contractor_intake_proposal_email",
      subject,
      body: "Internal ops/admin alert for contractor-submitted intake proposal.",
      payload: {
        source: "contractor_intake_submissions",
        dedupe_key: dedupeKey,
        contractor_intake_submission_id: proposalId,
      },
      status: "queued",
      sent_at: null,
    })
    .select("id")
    .single();

  if (queueErr) throw queueErr;
  if (!queuedDelivery?.id) throw new Error("Failed to create proposal email notification row");

  try {
    await sendEmail({
      to: recipientEmails,
      subject,
      html,
    });

    await markOperationalEmailDeliveryNotification({
      supabase: admin,
      notificationId: String(queuedDelivery.id),
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase: admin,
      notificationId: String(queuedDelivery.id),
      status: "failed",
      errorDetail: errorMessage,
    });

    throw error;
  }
}

async function sendCustomerScheduledEmailForJob({
  supabase,
  jobId,
}: {
  supabase: any;
  jobId: string;
}): Promise<void> {
  const { data: scheduledJob, error: scheduledJobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_type,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      job_address,
      city,
      scheduled_date,
      window_start,
      window_end,
      contractor_id,
      contractors:contractor_id ( name, owner_user_id ),
      locations:location_id (address_line1, address_line2, city, state, zip)
      `
    )
    .eq("id", jobId)
    .single();

  if (scheduledJobErr) {
    console.error("Customer scheduled email job snapshot failed:", scheduledJobErr);
    return;
  }

  const customerEmail = String(scheduledJob?.customer_email ?? "").trim().toLowerCase();
  if (!customerEmail) return;

  const customerName =
    [
      String(scheduledJob?.customer_first_name ?? "").trim(),
      String(scheduledJob?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const customerPhone = String(scheduledJob?.customer_phone ?? "").trim() || null;
  const serviceAddress = formatServiceAddress(scheduledJob) || "Address not available";
  const scheduledDateText = formatBusinessDateUS(String(scheduledJob?.scheduled_date ?? "").trim()) || "Not available";
  const scheduledWindowText =
    displayWindowLA(
      String(scheduledJob?.window_start ?? "").trim() || null,
      String(scheduledJob?.window_end ?? "").trim() || null,
    ) || "Not available";

  const serviceTypeRaw = String(scheduledJob?.job_type ?? "").trim();
  const serviceType = serviceTypeRaw ? toTitleCase(serviceTypeRaw) : null;
  const companyName = String((scheduledJob as any)?.contractors?.name ?? "").trim() || null;
  const accountOwnerUserId = String((scheduledJob as any)?.contractors?.owner_user_id ?? "").trim();
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });
  const supportDisplayName = internalBusinessIdentity.display_name;
  const supportPhone = internalBusinessIdentity.support_phone;
  const supportEmail = internalBusinessIdentity.support_email;
  const subjectDate = scheduledDateText && scheduledDateText !== "Not available"
    ? scheduledDateText
    : "Date TBD";
  const subject = `Job Scheduled \u2013 ${customerName} \u2013 ${subjectDate}`;
  const scheduleSignature = buildScheduleSignature({
    scheduledDate: scheduledJob?.scheduled_date,
    windowStart: scheduledJob?.window_start,
    windowEnd: scheduledJob?.window_end,
  });
  const dedupeKey = buildOperationalEmailDedupeKey({
    jobId,
    notificationType: "customer_job_scheduled_email",
    scope: scheduleSignature,
  });

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase,
    notificationType: "customer_job_scheduled_email",
    dedupeKey,
  });

  if (existingDelivery) return;

  const queuedDelivery = await insertOperationalEmailDeliveryNotification({
    supabase,
    jobId,
    notificationType: "customer_job_scheduled_email",
    recipientType: "customer",
    recipientRef: null,
    recipientEmail: customerEmail,
    subject,
    body: "Customer appointment confirmation email.",
    dedupeKey,
    status: "queued",
  });

  try {
    await sendEmail({
      to: customerEmail,
      subject,
      html: buildCustomerScheduledEmailHtml({
        customerName,
        customerPhone,
        customerEmail,
        serviceAddress,
        scheduledDate: scheduledDateText,
        scheduledWindow: scheduledWindowText,
        serviceType,
        companyName,
        supportDisplayName,
        supportPhone,
        supportEmail,
      }),
    });

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "failed",
      errorDetail: errorMessage,
    });

    console.error("Customer scheduled email send failed:", {
      jobId,
      customerEmail,
      error: errorMessage,
    });
  }
}

async function sendContractorScheduledEmailForJob({
  supabase,
  jobId,
}: {
  supabase: any;
  jobId: string;
}): Promise<void> {
  const { data: scheduledJob, error: scheduledJobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_type,
      permit_number,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      job_address,
      city,
      scheduled_date,
      window_start,
      window_end,
      contractor_id,
      contractors:contractor_id ( email, name, owner_user_id ),
      locations:location_id (address_line1, address_line2, city, state, zip)
      `
    )
    .eq("id", jobId)
    .single();

  if (scheduledJobErr) {
    console.error("Contractor scheduled email job snapshot failed:", scheduledJobErr);
    return;
  }

  const contractorId = String(scheduledJob?.contractor_id ?? "").trim();
  if (!contractorId) return;

  const contractorEmail = String((scheduledJob as any)?.contractors?.email ?? "").trim().toLowerCase();
  if (!contractorEmail) {
    console.error("Contractor scheduled email skipped: contractor email is missing.", {
      jobId,
      contractorId,
    });
    return;
  }

  const customerName =
    [
      String(scheduledJob?.customer_first_name ?? "").trim(),
      String(scheduledJob?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const customerPhone = String(scheduledJob?.customer_phone ?? "").trim() || null;
  const customerEmail = String(scheduledJob?.customer_email ?? "").trim().toLowerCase() || null;
  const serviceAddress = formatServiceAddress(scheduledJob) || "Address not available";
  const scheduledDateText = formatBusinessDateUS(String(scheduledJob?.scheduled_date ?? "").trim()) || "Not available";
  const scheduledWindowText =
    displayWindowLA(
      String(scheduledJob?.window_start ?? "").trim() || null,
      String(scheduledJob?.window_end ?? "").trim() || null,
    ) || "Not available";

  const serviceTypeRaw = String(scheduledJob?.job_type ?? "").trim();
  const serviceType = serviceTypeRaw ? toTitleCase(serviceTypeRaw) : null;
  const permitNumber = String(scheduledJob?.permit_number ?? "").trim() || null;
  const companyName = String((scheduledJob as any)?.contractors?.name ?? "").trim() || null;
  const accountOwnerUserId = String((scheduledJob as any)?.contractors?.owner_user_id ?? "").trim();
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });
  const supportDisplayName = internalBusinessIdentity.display_name;
  const subjectDate = scheduledDateText && scheduledDateText !== "Not available"
    ? scheduledDateText
    : "Date TBD";
  const subject = `${supportDisplayName} Schedule \u2013 ${customerName} \u2013 ${subjectDate}`;
  const scheduleSignature = buildScheduleSignature({
    scheduledDate: scheduledJob?.scheduled_date,
    windowStart: scheduledJob?.window_start,
    windowEnd: scheduledJob?.window_end,
  });
  const dedupeKey = buildOperationalEmailDedupeKey({
    jobId,
    notificationType: "contractor_job_scheduled_email",
    scope: scheduleSignature,
  });

  const existingDelivery = await findExistingOperationalEmailDelivery({
    supabase,
    notificationType: "contractor_job_scheduled_email",
    dedupeKey,
  });

  if (existingDelivery) return;

  const appUrl = resolveAppUrl();
  const portalJobUrl = appUrl ? `${appUrl}/portal/jobs/${jobId}` : null;

  const queuedDelivery = await insertOperationalEmailDeliveryNotification({
    supabase,
    jobId,
    notificationType: "contractor_job_scheduled_email",
    recipientType: "contractor",
    recipientRef: contractorId,
    recipientEmail: contractorEmail,
    subject,
    body: "Contractor schedule notification email.",
    dedupeKey,
    status: "queued",
  });

  try {
    await sendEmail({
      to: contractorEmail,
      subject,
      html: buildContractorScheduledEmailHtml({
        customerName,
        customerPhone,
        customerEmail,
        serviceAddress,
        scheduledDate: scheduledDateText,
        scheduledWindow: scheduledWindowText,
        serviceType,
        permitNumber,
        portalJobUrl,
        companyName,
        supportDisplayName,
      }),
    });

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "sent",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown send error";

    await markOperationalEmailDeliveryNotification({
      supabase,
      notificationId: queuedDelivery.id,
      status: "failed",
      errorDetail: errorMessage,
    });

    console.error("Contractor scheduled email send failed:", {
      jobId,
      contractorEmail,
      error: errorMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// PH2-B: Staffing helpers — job_assignments table
// All helpers are unexported; wire into server actions directly.
// Structure is intentionally extract-ready: no external dependencies,
// uniform (supabase, ...) signature pattern, self-contained error handling.
// ---------------------------------------------------------------------------

type JobAssignment = {
  id: string;
  job_id: string;
  user_id: string;
  assigned_by: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

/** Returns all currently-active assignment rows for a job. */
async function listActiveJobAssignments(params: {
  supabase: any;
  jobId: string;
}): Promise<JobAssignment[]> {
  const { supabase, jobId } = params;

  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as JobAssignment[];
}

/**
 * Inserts a new active assignment row.
 * Throws on duplicate active assignment for the same (job_id, user_id) —
 * use ensureActiveAssignmentForUser for the idempotent path.
 * Emits assignment_added on actual insert.
 */
async function addJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  assignedBy: string;
  accountOwnerUserId?: string | null;
  isPrimary?: boolean;
}): Promise<JobAssignment> {
  const { supabase, jobId, userId, assignedBy, accountOwnerUserId = null, isPrimary = false } = params;

  await assertAssignableInternalUser({
    supabase,
    userId,
    accountOwnerUserId,
  });

  const { data, error } = await supabase
    .from("job_assignments")
    .insert({
      job_id: jobId,
      user_id: userId,
      assigned_by: assignedBy,
      is_active: true,
      is_primary: isPrimary,
    })
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .single();

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_added",
    meta: {
      actor_user_id: assignedBy,
      affected_user_id: userId,
      is_primary: isPrimary,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "add_job_assignment",
    },
    userId: assignedBy,
  });

  return data as JobAssignment;
}

/**
 * Soft-removes an active assignment.
 * Sets is_active = false, removed_at = now(), removed_by = actor.
 * Targets only active rows; no-ops (no event) if the user is already inactive.
 * Emits assignment_removed only on actual row change.
 */
async function softRemoveJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  removedBy: string;
}): Promise<void> {
  const { supabase, jobId, userId, removedBy } = params;

  const { data: removed, error } = await supabase
    .from("job_assignments")
    .update({
      is_active: false,
      removed_at: new Date().toISOString(),
      removed_by: removedBy,
    })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .select("id");

  if (error) throw error;

  // Zero rows updated = user was already inactive; skip event to avoid duplicate
  if (!removed || removed.length === 0) return;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_removed",
    meta: {
      actor_user_id: removedBy,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "soft_remove_job_assignment",
    },
    userId: removedBy,
  });
}

/**
 * Makes userId the sole primary assignment on the job.
 * Verifies the target has an active row before acting (hardening).
 * No-ops (and emits no event) if the target is already primary.
 * Clears is_primary on all other active rows first, then sets the target.
 * Only acts on active rows; does NOT activate an inactive assignment.
 * Emits assignment_primary_set on actual change only.
 */
async function setPrimaryJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
}): Promise<void> {
  const { supabase, jobId, userId, actorUserId } = params;

  // Hardening: verify the target user has an active assignment.
  // Also detect no-op: if already primary, skip everything.
  const { data: targetRow, error: readErr } = await supabase
    .from("job_assignments")
    .select("id, is_primary")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (readErr) throw readErr;

  if (!targetRow) {
    throw new Error(
      `Cannot set primary: no active assignment found for user ${userId} on job ${jobId}`
    );
  }

  // Already primary — no change, no event
  if (targetRow.is_primary) return;

  // Clear existing primary on all active rows for this job
  const { error: clearErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: false })
    .eq("job_id", jobId)
    .eq("is_active", true)
    .eq("is_primary", true);

  if (clearErr) throw clearErr;

  // Promote the target user
  const { error: setErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: true })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (setErr) throw setErr;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_primary_set",
    meta: {
      actor_user_id: actorUserId,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "set_primary_job_assignment",
    },
    userId: actorUserId,
  });
}

/**
 * Returns the existing active assignment for userId, or creates one.
 * Concurrency-safe: on a 23505 unique-violation (parallel insert race),
 * re-selects and returns the surviving active row instead of throwing.
 */
async function ensureActiveAssignmentForUser(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
  accountOwnerUserId?: string | null;
}): Promise<JobAssignment> {
  const { supabase, jobId, userId, actorUserId, accountOwnerUserId = null } = params;

  // Fast path: active row already exists
  const { data: existing, error: selectErr } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (selectErr) throw selectErr;
  if (existing) return existing as JobAssignment;

  // Slow path: create via addJobAssignment so assignment_added fires.
  // On 23505 unique-violation (parallel insert race), the winning call already
  // emitted assignment_added — re-select the surviving row without re-emitting.
  try {
    return await addJobAssignment({
      supabase,
      jobId,
      userId,
      assignedBy: actorUserId,
      accountOwnerUserId,
      isPrimary: false,
    });
  } catch (addErr: any) {
    if (addErr?.code === "23505") {
      const { data: raced, error: racedErr } = await supabase
        .from("job_assignments")
        .select(
          "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
        )
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (racedErr) throw racedErr;
      if (!raced) {
        throw new Error(
          "Concurrent assignment insert detected but no active row found after race"
        );
      }
      return raced as JobAssignment;
    }
    throw addErr;
  }
}

/** Returns the current primary active assignment, or null if none is set. */
async function getPrimaryActiveAssignment(params: {
  supabase: any;
  jobId: string;
}): Promise<JobAssignment | null> {
  const { supabase, jobId } = params;

  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as JobAssignment | null;
}

// ---------------------------------------------------------------------------


type OpsSnapshot = {
  ops_status: string | null;
  pending_info_reason: string | null;
  follow_up_date: string | null; // keep as string for diffing
  next_action_note: string | null;
  action_required_by: string | null;
};

const SERVICE_CASE_KINDS = new Set([
  "reactive",
  "callback",
  "warranty",
  "maintenance",
]);

const SERVICE_VISIT_TYPES = new Set([
  "diagnostic",
  "repair",
  "return_visit",
  "callback",
  "maintenance",
]);

const SERVICE_VISIT_OUTCOMES = new Set([
  "resolved",
  "follow_up_required",
  "no_issue_found",
]);

function normalizeServiceCaseKind(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_CASE_KINDS.has(normalized) ? normalized : null;
}

function normalizeServiceVisitType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_VISIT_TYPES.has(normalized) ? normalized : null;
}

function normalizeServiceVisitOutcome(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SERVICE_VISIT_OUTCOMES.has(normalized) ? normalized : null;
}

function deriveInitialServiceVisitReason(input: {
  serviceVisitReason?: string | null;
  title?: string | null;
  jobNotes?: string | null;
}) {
  const explicitReason = String(input.serviceVisitReason ?? "").trim();
  if (explicitReason) return explicitReason;

  const title = String(input.title ?? "").trim();
  if (title) return title;

  const notes = String(input.jobNotes ?? "").trim();
  if (notes) return notes;

  return "service visit";
}

  function buildInitialProblemSummary(input: {
  job_notes?: string | null;
  title?: string | null;
}) {
  const notes = String(input.job_notes ?? "").trim();
  if (notes) return notes;

  const title = String(input.title ?? "").trim();
  if (title) return title;

  return null;
}

async function createServiceCaseForRootJob(params: {
  supabase: any;
  customerId: string;
  locationId: string;
  problemSummary?: string | null;
  caseKind?: string | null;
}) {
  const { supabase, customerId, locationId, problemSummary, caseKind } = params;

  const normalizedCaseKind = normalizeServiceCaseKind(caseKind) ?? "reactive";

  const { data, error } = await supabase
    .from("service_cases")
    .insert({
      customer_id: customerId,
      location_id: locationId,
      problem_summary: problemSummary ?? null,
      case_kind: normalizedCaseKind,
      status: "open",
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create service case");

  return String(data.id);
}

async function ensureServiceCaseForJob(params: {
  supabase: any;
  jobId: string;
}) {
  const { supabase, jobId } = params;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, customer_id, location_id, service_case_id, job_notes, title")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found while ensuring service case");

  if (job.service_case_id) {
    return String(job.service_case_id);
  }

  if (!job.customer_id || !job.location_id) {
    throw new Error("Cannot create service case: job missing customer_id or location_id");
  }

  const serviceCaseId = await createServiceCaseForRootJob({
    supabase,
    customerId: String(job.customer_id),
    locationId: String(job.location_id),
    problemSummary: buildInitialProblemSummary({
      job_notes: job.job_notes,
      title: job.title,
    }),
  });

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ service_case_id: serviceCaseId })
    .eq("id", jobId);

  if (updErr) throw updErr;

  return serviceCaseId;
}

async function resolveServiceCaseIdForNewJob(params: {
  supabase: any;
  parentJobId?: string | null;
  customerId?: string | null;
  locationId?: string | null;
  title?: string | null;
  jobNotes?: string | null;
  caseKind?: string | null;
}) {
  const {
    supabase,
    parentJobId,
    customerId,
    locationId,
    title,
    jobNotes,
    caseKind,
  } = params;

  const parentId = String(parentJobId ?? "").trim();

  // Child job path: inherit from parent
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("jobs")
      .select("id, service_case_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentErr) throw parentErr;
    if (!parent?.id) throw new Error("Parent job not found");

    if (parent.service_case_id) {
      return String(parent.service_case_id);
    }

    // Repair path during rollout/backfill transition
    return await ensureServiceCaseForJob({
      supabase,
      jobId: parentId,
    });
  }

  // Root job path: no service_case_id yet; create after job insert
  if (!customerId || !locationId) {
    throw new Error("Cannot resolve root service case without customer_id and location_id");
  }

  return await createServiceCaseForRootJob({
    supabase,
    customerId,
    locationId,
    caseKind,
    problemSummary: buildInitialProblemSummary({
      job_notes: jobNotes,
      title,
    }),
  });
}

export async function getInternalIntakeRelationshipContext(input: {
  customerId: string;
  locationId: string;
  jobType?: string;
}): Promise<InternalIntakeRelationshipContext> {
  const supabase = await createClient();
  await requireInternalUser({ supabase });

  const customerId = String(input.customerId ?? "").trim();
  const locationId = String(input.locationId ?? "").trim();
  const jobType = normalizeIntakeJobType(input.jobType);

  if (!customerId || !locationId || !jobType) {
    return { activeJobs: [], recentJobs: [] };
  }

  const selectColumns = [
    "id",
    "title",
    "job_type",
    "status",
    "ops_status",
    "service_case_id",
    "parent_job_id",
    "scheduled_date",
    "window_start",
    "window_end",
    "created_at",
  ].join(", ");

  const [{ data: activeRows, error: activeErr }, { data: recentRows, error: recentErr }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(selectColumns)
        .eq("customer_id", customerId)
        .eq("location_id", locationId)
        .eq("job_type", jobType)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("scheduled_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(24),
      supabase
        .from("jobs")
        .select(selectColumns)
        .eq("customer_id", customerId)
        .eq("location_id", locationId)
        .eq("job_type", jobType)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  if (activeErr) throw activeErr;
  if (recentErr) throw recentErr;

  const activeParentIds = new Set(
    (activeRows ?? [])
      .map((row: any) => String(row?.parent_job_id ?? "").trim())
      .filter(Boolean)
  );

  const activeJobs = (activeRows ?? [])
    .filter((row: any) => isOpenActiveJobCandidate(row))
    .filter((row: any) => !activeParentIds.has(String(row?.id ?? "").trim()))
    .sort((left: any, right: any) => {
      const leftSort = intakeRelationshipCandidateSortValue(left);
      const rightSort = intakeRelationshipCandidateSortValue(right);

      if (leftSort.liveRank !== rightSort.liveRank) {
        return rightSort.liveRank - leftSort.liveRank;
      }

      return rightSort.createdAtMs - leftSort.createdAtMs;
    })
    .filter((() => {
      const seenServiceCaseIds = new Set<string>();

      return (row: any) => {
        const serviceCaseId = String(row?.service_case_id ?? "").trim();
        if (!serviceCaseId) return true;
        if (seenServiceCaseIds.has(serviceCaseId)) return false;
        seenServiceCaseIds.add(serviceCaseId);
        return true;
      };
    })())
    .slice(0, 6)
    .map(mapIntakeRelationshipJobSummary);

  const activeJobIds = new Set(activeJobs.map((job) => job.id));
  const recentJobs = (recentRows ?? [])
    .map(mapIntakeRelationshipJobSummary)
    .filter((job) => !activeJobIds.has(job.id));

  return {
    activeJobs,
    recentJobs,
  };
}

function buildOpsChanges(before: OpsSnapshot, after: OpsSnapshot) {
  const keys = Object.keys(after) as (keyof OpsSnapshot)[];
  const changes: Array<{ field: keyof OpsSnapshot; from: any; to: any }> = [];

  for (const k of keys) {
    const from = before[k] ?? null;
    const to = after[k] ?? null;
    if (from !== to) changes.push({ field: k, from, to });
  }

  return changes;
}

/** ✅ Single source of truth for redirects back to /tests (NEVER writes s= when empty) */
function redirectToTests(opts: {
  jobId: string;
  testType?: string | null;
  systemId?: string | null;
}) {
  const { jobId } = opts;
  const testType = String(opts.testType ?? "").trim();
  const systemId = String(opts.systemId ?? "").trim();

  const q = new URLSearchParams();
  if (testType) q.set("t", testType);
  if (systemId) q.set("s", systemId);

  const qs = q.toString();
  redirect(qs ? `/jobs/${jobId}/tests?${qs}` : `/jobs/${jobId}/tests`);
}

function revalidateEccProjectionConsumers(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath("/ops");
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/jobs/${jobId}`);
}

async function requireInternalEccTestsAccess(params: {
  supabase: any;
  jobId: string;
  testRunId?: string | null;
}) {
  const { supabase, jobId } = params;

  const { internalUser } = await requireInternalUser({ supabase });

  const testRunId = String(params.testRunId ?? "").trim();

  if (testRunId) {
    const scopedRun = await loadScopedInternalEccTestRunForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      testRunId,
      testRunSelect: "is_completed",
    });

    if (!scopedRun?.job?.id || !scopedRun?.testRun?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return scopedRun;
  }

  const scopedJob = await loadScopedInternalEccJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return { job: scopedJob, testRun: null };
}

async function requireInternalEquipmentMutationAccess(params: {
  supabase: any;
  jobId: string;
  equipmentId?: string | null;
}) {
  const { supabase, jobId } = params;
  const { internalUser } = await requireInternalUser({ supabase });

  const equipmentId = String(params.equipmentId ?? "").trim();

  if (equipmentId) {
    const scopedEquipment = await loadScopedInternalJobEquipmentForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      equipmentId,
      equipmentSelect: "system_id",
    });

    if (!scopedEquipment?.job?.id || !scopedEquipment?.equipment?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return scopedEquipment;
  }

  const scopedJob = await loadScopedInternalEquipmentJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return { job: scopedJob, equipment: null };
}

/** ✅ Defensive resolver: if form is missing system_id, fall back to run.system_id */
async function resolveSystemIdForRun(params: {
  supabase: any;
  jobId: string;
  testRunId: string;
  systemIdFromForm?: string | null;
}): Promise<string | null> {
  const fromForm = String(params.systemIdFromForm ?? "").trim();
  if (fromForm) return fromForm;

  const { data, error } = await params.supabase
    .from("ecc_test_runs")
    .select("system_id")
    .eq("id", params.testRunId)
    .eq("job_id", params.jobId)
    .maybeSingle();

  if (error) throw error;

  const fromRun = String(data?.system_id ?? "").trim();
  return fromRun || null;
}

export async function updateJobTypeFromForm(formData: FormData) {
  const supabase = await createClient();

  const jobId = String(formData.get("job_id") ?? "").trim();
  const rawType = String(formData.get("job_type") ?? "").trim().toLowerCase();

  if (!jobId) {
    throw new Error("Missing job_id");
  }

  const { userId: actingUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  const allowed = ["ecc", "service"];

  if (!allowed.includes(rawType)) {
    throw new Error("Invalid job type");
  }

  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select("job_type, title, job_notes, service_visit_type, service_visit_reason, service_visit_outcome")
    .eq("id", jobId)
    .single();

  if (beforeErr) {
    console.error("Job type read failed", beforeErr);
    throw new Error("Unable to load existing job type");
  }

  const previousJobType = String(beforeJob?.job_type ?? "").trim().toLowerCase() || null;

  const updatePayload: Record<string, any> = {
    job_type: rawType,
  };

  if (rawType === "service") {
    updatePayload.service_visit_type =
      normalizeServiceVisitType(beforeJob?.service_visit_type) ?? "diagnostic";
    updatePayload.service_visit_reason = deriveInitialServiceVisitReason({
      serviceVisitReason: beforeJob?.service_visit_reason,
      title: beforeJob?.title,
      jobNotes: beforeJob?.job_notes,
    });
    updatePayload.service_visit_outcome =
      normalizeServiceVisitOutcome(beforeJob?.service_visit_outcome) ?? "follow_up_required";
  }

  const { error } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", jobId);

  if (error) {
    console.error("Job type update failed", error);
    throw new Error("Unable to update job type");
  }

  if (previousJobType !== rawType) {
    await insertJobEvent({
      supabase,
      jobId,
      event_type: "ops_update",
      meta: {
        source: "job_detail_info",
        changes: [
          {
            field: "job_type",
            from: previousJobType,
            to: rawType,
          },
        ],
      },
      userId: actingUserId,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
}

export async function updateJobServiceContractFromForm(formData: FormData) {
  const supabase = await createClient();
  const {
    userId: actingUserId,
    internalUser,
  } = await requireInternalUser({ supabase });

  const jobId = String(formData.get("job_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");

  const beforeJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select:
      "job_type, service_visit_type, service_visit_reason, service_visit_outcome, title, job_notes",
  });

  if (!beforeJob) {
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  if (String(beforeJob?.job_type ?? "").toLowerCase() !== "service") {
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const normalizedVisitType =
    normalizeServiceVisitType(String(formData.get("service_visit_type") || "").trim()) ??
    normalizeServiceVisitType(beforeJob?.service_visit_type) ??
    "diagnostic";

  const normalizedVisitOutcome =
    normalizeServiceVisitOutcome(String(formData.get("service_visit_outcome") || "").trim()) ??
    normalizeServiceVisitOutcome(beforeJob?.service_visit_outcome) ??
    "follow_up_required";

  const normalizedVisitReason = deriveInitialServiceVisitReason({
    serviceVisitReason: String(formData.get("service_visit_reason") || "").trim(),
    title: beforeJob?.title,
    jobNotes: beforeJob?.job_notes,
  });

  let serviceCaseId = String(beforeJob?.service_case_id ?? "").trim() || null;
  if (!serviceCaseId) {
    serviceCaseId = await ensureServiceCaseForJob({
      supabase,
      jobId,
    });
  }

  const beforeCase = await loadScopedInternalServiceCaseForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    serviceCaseId,
    expectedCustomerId: String(beforeJob?.customer_id ?? "").trim() || null,
    select: "case_kind",
  });

  if (!beforeCase) {
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const normalizedCaseKind =
    normalizeServiceCaseKind(String(formData.get("service_case_kind") || "").trim()) ??
    normalizeServiceCaseKind(beforeCase?.case_kind) ??
    "reactive";

  const beforeVisitType = normalizeServiceVisitType(beforeJob?.service_visit_type);
  const beforeVisitReason = String(beforeJob?.service_visit_reason ?? "").trim() || null;
  const beforeVisitOutcome = normalizeServiceVisitOutcome(beforeJob?.service_visit_outcome);
  const beforeCaseKind = normalizeServiceCaseKind(beforeCase?.case_kind);

  const isNoop =
    beforeVisitType === normalizedVisitType &&
    beforeVisitReason === normalizedVisitReason &&
    beforeVisitOutcome === normalizedVisitOutcome &&
    beforeCaseKind === normalizedCaseKind;

  if (isNoop) {
    revalidatePath(`/jobs/${jobId}`);
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_already_saved",
      tabRaw,
      returnToRaw,
    });
  }

  const { error: jobUpdateErr } = await supabase
    .from("jobs")
    .update({
      service_visit_type: normalizedVisitType,
      service_visit_reason: normalizedVisitReason,
      service_visit_outcome: normalizedVisitOutcome,
    })
    .eq("id", jobId);

  if (jobUpdateErr) {
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const { error: caseUpdateErr } = await supabase
    .from("service_cases")
    .update({
      case_kind: normalizedCaseKind,
      updated_at: new Date().toISOString(),
    })
    .eq("id", serviceCaseId);

  if (caseUpdateErr) {
    redirectToJobWithBanner({
      jobId,
      banner: "service_contract_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const changes: Array<{ field: string; from: string | null; to: string | null }> = [];

  if (beforeCaseKind !== normalizedCaseKind) {
    changes.push({
      field: "service_cases.case_kind",
      from: beforeCaseKind,
      to: normalizedCaseKind,
    });
  }

  if (beforeVisitType !== normalizedVisitType) {
    changes.push({
      field: "jobs.service_visit_type",
      from: beforeVisitType,
      to: normalizedVisitType,
    });
  }

  if (beforeVisitReason !== normalizedVisitReason) {
    changes.push({
      field: "jobs.service_visit_reason",
      from: beforeVisitReason,
      to: normalizedVisitReason,
    });
  }

  if (beforeVisitOutcome !== normalizedVisitOutcome) {
    changes.push({
      field: "jobs.service_visit_outcome",
      from: beforeVisitOutcome,
      to: normalizedVisitOutcome,
    });
  }

  if (changes.length > 0) {
    await insertJobEvent({
      supabase,
      jobId,
      event_type: "ops_update",
      meta: {
        source: "job_detail_service_contract",
        changes,
      },
      userId: actingUserId,
    });
  }

  revalidatePath(`/jobs/${jobId}`, "page");
  revalidatePath("/jobs", "page");
  revalidatePath("/ops", "page");
  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const [pathOnly] = returnToRaw.split("?");
    if (pathOnly) revalidatePath(pathOnly, "page");
  }

  refresh();
  redirectToJobWithBanner({
    jobId,
    banner: "service_contract_saved",
    tabRaw,
    returnToRaw,
    cacheBust: true,
  });
}

export async function updateJobVisitScopeFromForm(formData: FormData) {
  const supabase = await createClient();
  const {
    userId: actingUserId,
    internalUser,
  } = await requireInternalUser({ supabase });

  const jobId = String(formData.get("job_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");

  const beforeJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: "job_type, visit_scope_summary, visit_scope_items",
  });

  if (!beforeJob) {
    redirectToJobWithBanner({
      jobId,
      banner: "visit_scope_job_read_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const nextSummary = sanitizeVisitScopeSummary(formData.get("visit_scope_summary"));
  const nextItemsRaw = String(formData.get("visit_scope_items_json") || "").trim();
  const normalizedNextItemsRaw =
    nextItemsRaw === "undefined" || nextItemsRaw === "null" ? "" : nextItemsRaw;

  let nextItems: VisitScopeItem[] = [];
  try {
    nextItems = parseVisitScopeItemsJson(normalizedNextItemsRaw);
  } catch (error) {
    const canTreatAsBlankEccSave =
      beforeJob?.job_type === "ecc" &&
      !nextSummary &&
      (!normalizedNextItemsRaw || normalizedNextItemsRaw === "[]");

    if (canTreatAsBlankEccSave) {
      nextItems = [];
    } else {
      console.error("updateJobVisitScopeFromForm: visit scope parse failed", {
        jobId,
        raw: normalizedNextItemsRaw,
        jobType: beforeJob?.job_type ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      redirectToJobWithBanner({
        jobId,
        banner: "visit_scope_payload_invalid",
        tabRaw,
        returnToRaw,
      });
    }
  }

  if (beforeJob?.job_type === "service" && !hasVisitScopeContent(nextSummary, nextItems)) {
    redirectToJobWithBanner({
      jobId,
      banner: "visit_scope_required",
      tabRaw,
      returnToRaw,
    });
  }

  const beforeSummary = sanitizeVisitScopeSummary(beforeJob?.visit_scope_summary);
  let beforeItems: VisitScopeItem[] = [];
  try {
    beforeItems = sanitizeVisitScopeItems(beforeJob?.visit_scope_items ?? []);
  } catch {
    beforeItems = [];
  }

  const beforeItemsSerialized = JSON.stringify(beforeItems);
  const nextItemsSerialized = JSON.stringify(nextItems);

  if (beforeSummary === nextSummary && beforeItemsSerialized === nextItemsSerialized) {
    revalidatePath(`/jobs/${jobId}`);
    redirectToJobWithBanner({
      jobId,
      banner: "visit_scope_already_saved",
      tabRaw,
      returnToRaw,
    });
  }

  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      visit_scope_summary: nextSummary,
      visit_scope_items: nextItems,
    })
    .eq("id", jobId);

  if (updateErr) {
    console.error("updateJobVisitScopeFromForm: jobs update failed", {
      jobId,
      jobType: beforeJob?.job_type ?? null,
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
    });
    redirectToJobWithBanner({
      jobId,
      banner: "visit_scope_job_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  const changes: Array<{ field: string; from: string | null; to: string | null }> = [];

  if (beforeSummary !== nextSummary) {
    changes.push({
      field: "jobs.visit_scope_summary",
      from: beforeSummary,
      to: nextSummary,
    });
  }

  if (beforeItemsSerialized !== nextItemsSerialized) {
    changes.push({
      field: "jobs.visit_scope_items",
      from: `${beforeItems.length} item(s)`,
      to: `${nextItems.length} item(s)`,
    });
  }

  if (changes.length > 0) {
    await insertJobEvent({
      supabase,
      jobId,
      event_type: "ops_update",
      meta: {
        source: "job_detail_visit_scope",
        changes,
      },
      userId: actingUserId,
    });
  }

  revalidatePath(`/jobs/${jobId}`, "page");
  revalidatePath("/jobs", "page");
  revalidatePath("/ops", "page");
  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const [pathOnly] = returnToRaw.split("?");
    if (pathOnly) revalidatePath(pathOnly, "page");
  }

  refresh();
  redirectToJobWithBanner({
    jobId,
    banner: "visit_scope_saved",
    tabRaw,
    returnToRaw,
    cacheBust: true,
  });
}

export async function promoteCompanionScopeToServiceJobFromForm(formData: FormData) {
  const supabase = await createClient();

  const sourceJobId = String(formData.get("job_id") || "").trim();
  const itemIndexRaw = String(formData.get("item_index") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!sourceJobId) throw new Error("Missing job_id");

  const { userId: actingUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: sourceJobId,
    onUnauthorized: () => {
      redirectToJobWithBanner({
        jobId: sourceJobId,
        banner: "not_authorized",
        tabRaw,
        returnToRaw,
      });
    },
  });

  const itemIndex = Number(itemIndexRaw);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_promotion_not_eligible",
      tabRaw,
      returnToRaw,
    });
  }

  const { data: sourceJob, error: sourceJobErr } = await supabase
    .from("jobs")
    .select(`
      id,
      job_type,
      title,
      job_notes,
      customer_id,
      location_id,
      contractor_id,
      customer_first_name,
      customer_last_name,
      customer_email,
      customer_phone,
      job_address,
      city,
      service_case_id,
      visit_scope_summary,
      visit_scope_items
    `)
    .eq("id", sourceJobId)
    .maybeSingle();

  if (sourceJobErr) throw sourceJobErr;
  if (!sourceJob?.id) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_promotion_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  if (String(sourceJob.job_type ?? "").trim().toLowerCase() !== "ecc") {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_promotion_not_eligible",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  let sourceItems: VisitScopeItem[] = [];
  try {
    sourceItems = sanitizeVisitScopeItems(sourceJob.visit_scope_items ?? []);
  } catch {
    sourceItems = [];
  }

  const sourceItem = sourceItems[itemIndex] ?? null;
  if (!sourceItem || sourceItem.kind !== "companion_service") {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_promotion_not_eligible",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  if (isVisitScopeItemPromoted(sourceItem)) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_already_promoted",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const customerId = String(sourceJob.customer_id ?? "").trim();
  const locationId = String(sourceJob.location_id ?? "").trim();

  if (!customerId || !locationId) {
    redirectToJobWithBanner({
      jobId: sourceJobId,
      banner: "companion_scope_promotion_failed",
      tabRaw,
      returnToRaw,
    });
    return;
  }

  const serviceCaseId = String(sourceJob.service_case_id ?? "").trim() || await ensureServiceCaseForJob({
    supabase,
    jobId: sourceJobId,
  });

  const promotedAt = new Date().toISOString();
  const serviceVisitReason = deriveInitialServiceVisitReason({
    serviceVisitReason: sourceItem.title,
    title: sourceItem.title,
    jobNotes: sourceItem.details ?? sourceJob.job_notes,
  });
  const followUpNotes = [
    `Promoted from ECC companion scope on job ${String(sourceJob.id).slice(0, 8)}.`,
    sourceItem.details ? sourceItem.details : null,
  ].filter(Boolean).join("\n\n");

  const created = await createJob({
    job_type: "service",
    service_case_id: serviceCaseId,
    service_case_kind: "reactive",
    service_visit_type: "repair",
    service_visit_reason: serviceVisitReason,
    service_visit_outcome: "follow_up_required",
    title: sourceItem.title,
    city: String(sourceJob.city ?? "").trim() || "Unknown",
    job_address: String(sourceJob.job_address ?? "").trim() || null,
    scheduled_date: null,
    status: "open",
    contractor_id: String(sourceJob.contractor_id ?? "").trim() || null,
    customer_id: customerId,
    location_id: locationId,
    customer_first_name: String(sourceJob.customer_first_name ?? "").trim() || null,
    customer_last_name: String(sourceJob.customer_last_name ?? "").trim() || null,
    customer_email: String(sourceJob.customer_email ?? "").trim() || null,
    customer_phone: String(sourceJob.customer_phone ?? "").trim() || null,
    job_notes: followUpNotes || null,
    visit_scope_summary: sourceItem.title,
    visit_scope_items: [
      {
        title: sourceItem.title,
        details: sourceItem.details ?? null,
        kind: "primary",
      },
    ],
    ops_status: "need_to_schedule",
  }, {
    serviceCaseWriteClient: supabase,
  });

  const nextItems = sourceItems.map((item, index) =>
    index === itemIndex
      ? {
          ...item,
          promoted_service_job_id: created.id,
          promoted_at: promotedAt,
          promoted_by_user_id: actingUserId,
        }
      : item,
  );

  const { error: sourceUpdateErr } = await supabase
    .from("jobs")
    .update({
      visit_scope_items: nextItems,
    })
    .eq("id", sourceJobId);

  if (sourceUpdateErr) {
    throw sourceUpdateErr;
  }

  await insertJobEvent({
    supabase,
    jobId: sourceJobId,
    event_type: "companion_scope_promoted",
    meta: {
      promoted_service_job_id: created.id,
      source_item_index: itemIndex,
      source_item_title: sourceItem.title,
      promoted_at: promotedAt,
    },
    userId: actingUserId,
  });

  await insertJobEvent({
    supabase,
    jobId: created.id,
    event_type: "created_from_companion_scope",
    meta: {
      source_job_id: sourceJobId,
      source_item_index: itemIndex,
      source_item_title: sourceItem.title,
      promoted_at: promotedAt,
    },
    userId: actingUserId,
  });

  revalidatePath(`/jobs/${sourceJobId}`, "page");
  revalidatePath(`/jobs/${created.id}`, "page");
  revalidatePath("/jobs", "page");
  revalidatePath("/ops", "page");

  redirect(`/jobs/${created.id}?banner=companion_scope_promoted`);
}

export async function getContractors() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, phone, email")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function notifyInternalNextActionChanged(params: {
  supabase: any;
  jobId: string;
  eventType: string;
  meta?: Record<string, any> | null;
}) {
  const { jobId } = params;
  return { jobId };
}

export async function requestRetestReadyFromPortal(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) {
    throw new Error("Only contractor users can request retest readiness.");
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, contractor_id, ops_status, job_type")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found.");

  if (String(job.contractor_id ?? "") !== String(cu.contractor_id ?? "")) {
    throw new Error("You do not have access to this job.");
  }

  const jobType = String(job.job_type ?? "").trim().toLowerCase();
  if (jobType !== "ecc") {
    redirect(`/portal/jobs/${jobId}`);
  }

  if (String(job.ops_status ?? "").toLowerCase() !== "failed") {
    redirect(`/portal/jobs/${jobId}`);
  }

  const { data: openRetestChild, error: childErr } = await supabase
    .from("jobs")
    .select("id, ops_status")
    .eq("parent_job_id", jobId)
    .is("deleted_at", null)
    .neq("ops_status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (childErr) throw childErr;
  if (openRetestChild?.id) {
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_already_received`);
  }

  const { data: existingRequest, error: reqErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "retest_ready_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reqErr) throw reqErr;

  if (existingRequest?.id) {
    revalidatePath(`/portal/jobs/${jobId}`);
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_already_received`);
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "retest_ready_requested",
    meta: {
      source: "contractor_portal",
      requested_by: "contractor",
      next_action: "create_retest_job",
    },
    userId: user.id,
  });

  await insertInternalNotificationForEvent({
    supabase,
    jobId,
    eventType: "retest_ready_requested",
    actorUserId: user.id,
  });

  await notifyInternalNextActionChanged({
    supabase,
    jobId,
    eventType: "retest_ready_requested",
    meta: {
      next_action: "create_retest_job",
    },
  });

  revalidatePath("/ops");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");

  redirect(`/portal/jobs/${jobId}?banner=retest_ready_requested`);
}

export async function archiveJobFromForm(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const job_id = String(formData.get("job_id") ?? "").trim();
  if (!job_id) throw new Error("Missing job_id");

  // Confirm we have an authenticated user
  const { data: u, error: ue } = await supabase.auth.getUser();
  const actingUserId = u?.user?.id ?? null;
  console.error("ARCHIVE AUTH", { uid: actingUserId, err: ue?.message ?? null });
  if (ue) throw ue;
  if (!actingUserId) redirect("/login");

  try {
    await requireInternalRole("admin", { supabase, userId: actingUserId });
    console.error("ARCHIVE INTERNAL", {
      ok: true,
      uid: actingUserId,
      iuErr: null,
    });
  } catch (error) {
    console.error("ARCHIVE INTERNAL", {
      ok: false,
      uid: actingUserId,
      iuErr:
        error instanceof Error
          ? error.message
          : "UNKNOWN_INTERNAL_ACCESS_ERROR",
    });
    throw error;
  }

  // Do the archive and REQUIRE a returned row (proves success)
  const ts = new Date().toISOString();

  const { data: updated, error: upErr } = await supabase
    .from("jobs")
    .update({ deleted_at: ts })
    .eq("id", job_id)
    .is("deleted_at", null)
    .select("id, deleted_at")
    .maybeSingle();

  console.error("ARCHIVE UPDATE", { updated, upErr });

  if (upErr) throw upErr;
  if (!updated?.id) {
    throw new Error("Archive failed (no row updated). Job may already be archived or RLS blocked the update.");
  }

  revalidatePath("/ops");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job_id}`);

  redirect(`/ops?saved=job_archived`);
}

export async function addJobEquipmentFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentRole = String(formData.get("equipment_role") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentRole) throw new Error("Missing equipment_role");

  const systemChoice = String(formData.get("system_location") || "").trim();
  const systemCustom = String(formData.get("system_location_custom") || "").trim();

  if (systemChoice === "__new__" && !systemCustom) {
    throw new Error("Please type a new System Location name.");
  }

  const systemLocationRaw =
    systemChoice === "__new__" ? systemCustom : systemChoice;

  if (!systemLocationRaw) throw new Error("Missing system_location");

  // Keep the user's casing for display, but use exact match for now.
  const systemLocation = systemLocationRaw;

  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const heatingCapacityRaw = String(formData.get("heating_capacity_kbtu") || "").trim();
  const heatingCapacityKbtu = heatingCapacityRaw ? Number(heatingCapacityRaw) : null;

  const heatingOutputRaw = String(formData.get("heating_output_btu") || "").trim();
  const heatingOutputBtu = heatingOutputRaw ? Number(heatingOutputRaw) : null;

  const heatingEfficiencyRaw = String(formData.get("heating_efficiency_percent") || "").trim();
  const heatingEfficiencyPercent = heatingEfficiencyRaw ? Number(heatingEfficiencyRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  await requireInternalEquipmentMutationAccess({ supabase, jobId });

  // 1) Resolve/Create system for this job + location
  const { data: existingSystem, error: sysFindErr } = await supabase
    .from("job_systems")
    .select("id")
    .eq("job_id", jobId)
    .eq("name", systemLocation)
    .maybeSingle();

  if (sysFindErr) throw sysFindErr;

  let systemId = existingSystem?.id ?? null;

  if (!systemId) {
    const { data: newSystem, error: sysCreateErr } = await supabase
      .from("job_systems")
      .insert({ job_id: jobId, name: systemLocation })
      .select("id")
      .single();

    if (sysCreateErr) throw sysCreateErr;
    systemId = newSystem.id;
  }

  if (!systemId) throw new Error("Unable to resolve system_id");

  // 2) Insert equipment tied to system_id — sanitize fields by canonical role
  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole,
    manufacturer,
    model,
    serial,
    notes,
    tonnage,
    refrigerantType,
    heatingCapacityKbtu,
    heatingOutputBtu,
    heatingEfficiencyPercent,
  });

  const { error: eqErr } = await supabase.from("job_equipment").insert({
    job_id: jobId,
    system_id: systemId,
    system_location: systemLocation,
    ...eqFields,
  });

  if (eqErr) throw eqErr;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function updateJobEquipmentFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const equipmentRole =
    String(formData.get("equipment_role") || "").trim() || null;

  const systemLocation =
    String(formData.get("system_location") || "").trim() || null;

  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const heatingCapacityRaw = String(formData.get("heating_capacity_kbtu") || "").trim();
  const heatingCapacityKbtu = heatingCapacityRaw ? Number(heatingCapacityRaw) : null;

  const heatingOutputRaw = String(formData.get("heating_output_btu") || "").trim();
  const heatingOutputBtu = heatingOutputRaw ? Number(heatingOutputRaw) : null;

  const heatingEfficiencyRaw = String(formData.get("heating_efficiency_percent") || "").trim();
  const heatingEfficiencyPercent = heatingEfficiencyRaw ? Number(heatingEfficiencyRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  await requireInternalEquipmentMutationAccess({ supabase, jobId, equipmentId });

  const { data: existingEquipment, error: equipmentErr } = await supabase
    .from("job_equipment")
    .select("system_id")
    .eq("id", equipmentId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (equipmentErr) throw equipmentErr;

  const previousSystemId = String(existingEquipment?.system_id ?? "").trim();

  let systemId: string | null = null;

  if (systemLocation) {
    const { data: existingSystem, error: sysFindErr } = await supabase
      .from("job_systems")
      .select("id")
      .eq("job_id", jobId)
      .eq("name", systemLocation)
      .maybeSingle();

    if (sysFindErr) throw sysFindErr;

    systemId = existingSystem?.id ?? null;

    if (!systemId) {
      const { data: newSystem, error: sysCreateErr } = await supabase
        .from("job_systems")
        .insert({ job_id: jobId, name: systemLocation })
        .select("id")
        .single();

      if (sysCreateErr) throw sysCreateErr;
      systemId = String(newSystem?.id ?? "").trim() || null;
    }
  }

  // Sanitize fields by canonical role before update
  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole ?? "",
    manufacturer,
    model,
    serial,
    notes,
    tonnage,
    refrigerantType,
    heatingCapacityKbtu,
    heatingOutputBtu,
    heatingEfficiencyPercent,
  });

  const { error } = await supabase
    .from("job_equipment")
    .update({
      system_id: systemId,
      system_location: systemLocation,
      ...eqFields,
    })
    .eq("id", equipmentId)
    .eq("job_id", jobId);

  if (error) throw error;

  if (previousSystemId && previousSystemId !== String(systemId ?? "").trim()) {
    await cleanupOrphanSystem({ supabase, jobId, systemId: previousSystemId });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function deleteJobEquipmentFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const supabase = await createClient();
  await requireInternalEquipmentMutationAccess({ supabase, jobId, equipmentId });

 const { data: deleted, error: delErr } = await supabase
  .from("job_equipment")
  .delete()
  .eq("id", equipmentId)
  .eq("job_id", jobId)
  .select("system_id")
  .maybeSingle();

if (delErr) throw delErr;

const systemId = String(deleted?.system_id ?? "").trim();
await cleanupOrphanSystem({ supabase, jobId, systemId });

revalidatePath(`/jobs/${jobId}`);
revalidatePath(`/jobs/${jobId}/info`);
revalidatePath(`/jobs/${jobId}/tests`);
}

export async function saveEccTestOverrideFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  // hardening: these must be provided by the form
  const systemIdRaw = String(formData.get("system_id") || "").trim();
  const testTypeRaw = String(formData.get("test_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const { overridePass, overrideReason } = parseOverrideSelectionFromForm(formData);

  // ✅ validate testType against allowed pills
  const allowed = new Set(["duct_leakage", "airflow", "refrigerant_charge", "custom"]);
  const testType = allowed.has(testTypeRaw) ? testTypeRaw : "";

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId, testRunId });

  // Only update override fields, never touch data/computed
  const { data: updated, error } = await supabase
    .from("ecc_test_runs")
    .update({
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .select("id, job_id, test_type, override_pass, override_reason")
    .maybeSingle();

  if (error) throw error;
  if (!updated?.id) {
    throw new Error(
      `Override update matched 0 rows. job_id=${jobId} test_run_id=${testRunId}`
    );
  }

    await evaluateEccOpsStatus(jobId);
    revalidatePath(`/jobs/${jobId}`);

  // Re-render tests page
  revalidatePath(`/jobs/${jobId}/tests`);

  /**
   * 🔒 HARD RULE: never redirect with &s=
   * - if systemId missing, redirect without s (or throw)
   */
  // 🔒 Resolve system_id from the run (authoritative), fallback to form

const { data: run, error: runErr } = await supabase
  .from("ecc_test_runs")
  .select("system_id")
  .eq("id", testRunId)
  .eq("job_id", jobId)
  .single();

if (runErr) throw runErr;

const systemId =
  (run?.system_id ? String(run.system_id).trim() : "") ||
  (systemIdRaw ? String(systemIdRaw).trim() : "") ||
  "";


  if (!testType) {
    // preserve system if present, but don't emit blank s=
    if (systemId) redirectToTests({ jobId, systemId });
    redirectToTests({ jobId });
  }

  if (!systemId) {
    // explicit error OR redirect without s; pick one:
    // throw new Error("Missing system_id");
    redirectToTests({ jobId, testType });
  }

  redirectToTests({ jobId, testType, systemId });
}

function getDuctLeakagePercentAllowed(projectType: string) {
  const normalizedProjectType = String(projectType ?? "").trim().toLowerCase();

  if (
    normalizedProjectType === "all_new" ||
    normalizedProjectType === "allnew" ||
    normalizedProjectType === "new" ||
    normalizedProjectType === "new_construction" ||
    normalizedProjectType === "new_prescriptive"
  ) {
    return 0.05;
  }

  if (normalizedProjectType === "alteration") {
    return 0.1;
  }

  return null;
}

function computeDuctLeakagePayload(formData: FormData, projectType: string) {
  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredLeakageCfm = num("measured_duct_leakage_cfm");
  const tonnage = num("tonnage");
  const heatingOutputBtu = num("heating_output_btu");
  const heatingInputBtu = num("heating_input_btu");
  const heatingEfficiencyPercent = num("heating_efficiency_percent");

  const airflowMethodRaw = String(formData.get("airflow_method") || "").trim().toLowerCase();
  const airflowMethod = airflowMethodRaw === "heating" ? "heating" : "cooling";

  const leakagePercentAllowed = getDuctLeakagePercentAllowed(projectType);

  const derivedHeatingOutputBtu =
    heatingOutputBtu != null
      ? heatingOutputBtu
      : heatingInputBtu != null &&
        heatingEfficiencyPercent != null &&
        heatingEfficiencyPercent > 0 &&
        heatingEfficiencyPercent <= 100
      ? heatingInputBtu * (heatingEfficiencyPercent / 100)
      : null;

  const heatingOutputKbtu =
    airflowMethod === "heating" && derivedHeatingOutputBtu != null
      ? derivedHeatingOutputBtu / 1000
      : null;

  const nominalAirflowCfm =
    airflowMethod === "heating"
      ? heatingOutputKbtu != null
        ? heatingOutputKbtu * 21.7
        : null
      : tonnage != null
      ? tonnage * 400
      : null;

  const maxLeakageCfm =
    nominalAirflowCfm != null && leakagePercentAllowed != null
      ? nominalAirflowCfm * leakagePercentAllowed
      : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (airflowMethod === "cooling" && tonnage == null) {
    warnings.push("Missing tonnage");
  }

  if (airflowMethod === "heating") {
    if (derivedHeatingOutputBtu == null) {
      warnings.push("Missing heating output BTU or input BTU with efficiency");
    }
    if (
      heatingInputBtu != null &&
      (heatingEfficiencyPercent == null || heatingEfficiencyPercent <= 0 || heatingEfficiencyPercent > 100)
    ) {
      warnings.push("Heating efficiency must be between 0 and 100 when using input BTU");
    }
  }

  if (measuredLeakageCfm == null) warnings.push("Missing measured duct leakage");
  if (leakagePercentAllowed == null) warnings.push("No leakage rule profile found for project type");

  let computedPass: boolean | null = null;

  if (measuredLeakageCfm != null && maxLeakageCfm != null) {
    computedPass = measuredLeakageCfm <= maxLeakageCfm;
    if (computedPass === false) {
      failures.push(`Duct leakage above max (${maxLeakageCfm} CFM)`);
    }
  }

  const data = {
    measured_duct_leakage_cfm: measuredLeakageCfm,
    tonnage,
    airflow_method: airflowMethod,
    heating_output_btu: heatingOutputBtu,
    heating_input_btu: heatingInputBtu,
    heating_efficiency_percent: heatingEfficiencyPercent,
    derived_nominal_airflow_cfm: nominalAirflowCfm,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const computed = {
    airflow_method: airflowMethod,
    base_airflow_cfm: nominalAirflowCfm,
    leakage_percent_allowed: leakagePercentAllowed,
    leakage_percent_allowed_display:
      leakagePercentAllowed != null ? leakagePercentAllowed * 100 : null,
    max_leakage_cfm: maxLeakageCfm,
    measured_duct_leakage_cfm: measuredLeakageCfm,
    heating_output_kbtu: heatingOutputKbtu,
    failures,
    warnings,
  };

  return { data, computed, computedPass };
}

export async function addEccTestRunFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const systemId = String(formData.get("system_id") || "").trim();
  const testType = String(formData.get("test_type") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim(); // optional

  if (!jobId) throw new Error("Missing job_id");
  if (!systemId) throw new Error("Missing system_id");
  if (!testType) throw new Error("Missing test_type");

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // Attach to Visit #1 (create it if missing)
  const { data: visitExisting, error: visitFindErr } = await supabase
    .from("job_visits")
    .select("id, visit_number")
    .eq("job_id", jobId)
    .eq("visit_number", 1)
    .maybeSingle();

  if (visitFindErr) throw visitFindErr;

  let visitId = visitExisting?.id;

  if (!visitId) {
    const { data: visitNew, error: visitCreateErr } = await supabase
      .from("job_visits")
      .insert({ job_id: jobId, visit_number: 1 })
      .select("id")
      .single();

    if (visitCreateErr) throw visitCreateErr;
    visitId = visitNew.id;
  }

  if (!visitId) throw new Error("Unable to resolve Visit #1");

  // 🔒 Duplicate prevention: job + system + test_type
  const { data: existing, error: existErr } = await supabase
    .from("ecc_test_runs")
    .select("id")
    .eq("job_id", jobId)
    .eq("system_id", systemId)
    .eq("test_type", testType)
    .limit(1);

  if (existErr) throw existErr;

  if ((existing ?? []).length) {
    revalidatePath(`/jobs/${jobId}/tests`);
    redirectToTests({ jobId, testType, systemId });
  }

  const payload: any = {
    job_id: jobId,
    visit_id: visitId,
    test_type: testType,

    // ✅ canonical anchor
    system_id: systemId,

    // keep legacy for now
    system_key: systemId,

    is_completed: false,
    data: {},
    computed: {},
    computed_pass: null,
    override_pass: null,
    override_reason: null,
  };

  if (equipmentId) payload.equipment_id = equipmentId;

  const { error: insErr } = await supabase.from("ecc_test_runs").insert(payload);

  if (insErr) throw insErr;

  revalidatePath(`/jobs/${jobId}/tests`);
  redirectToTests({ jobId, testType, systemId });
}

export async function deleteEccTestRunFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId, testRunId });

const { data: deletedRun, error: delRunErr } = await supabase
  .from("ecc_test_runs")
  .delete()
  .eq("id", testRunId)
  .eq("job_id", jobId)
  .select("system_id")
  .maybeSingle();

if (delRunErr) throw delRunErr;

const systemId = String(deletedRun?.system_id ?? "").trim();
await cleanupOrphanSystem({ supabase, jobId, systemId });

await evaluateEccOpsStatus(jobId);

revalidateEccProjectionConsumers(jobId);
}

export async function createContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole(["admin", "office"], {
    supabase,
  });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const returnPath = String(formData.get("return_path") || "").trim();
  const postedOwnerUserId = String(formData.get("owner_user_id") || "").trim();

  if (!name) throw new Error("Contractor name is required");
  if (postedOwnerUserId && postedOwnerUserId !== accountOwnerUserId) {
    throw new Error("Access denied");
  }

  const { data, error } = await supabase
    .from("contractors")
    .insert({
      name,
      phone,
      email,
      notes,
      owner_user_id: accountOwnerUserId,
    })
    .select("id, name, phone, email")
    .single();

  if (error) throw error;

  // Revalidate common views where contractors appear
  revalidatePath("/jobs");
  if (returnPath) revalidatePath(returnPath);

  return data;
}

export async function updateJobContractorFromForm(formData: FormData) {
  const supabase = await createClient();

  const jobId = String(formData.get("job_id") || "").trim();
  const contractorIdRaw = String(formData.get("contractor_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");

  // empty string means "clear"
  const contractor_id = contractorIdRaw ? contractorIdRaw : null;

  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
    onUnauthorized: () => {
      redirectToJobWithBanner({
        jobId,
        banner: "not_authorized",
        tabRaw,
        returnToRaw,
      });
    },
  });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) {
    redirectToJobWithBanner({
      jobId,
      banner: "not_authorized",
      tabRaw,
      returnToRaw,
    });
  }

  if (contractor_id) {
    const scopedContractor = await loadScopedInternalContractorForMutation({
      accountOwnerUserId,
      contractorId: contractor_id,
      select: "id",
    });

    if (!scopedContractor?.id) {
      redirectToJobWithBanner({
        jobId,
        banner: "not_authorized",
        tabRaw,
        returnToRaw,
      });
    }
  }

  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select("contractor_id")
    .eq("id", jobId)
    .single();

  if (beforeErr) {
    redirectToJobWithBanner({
      jobId,
      banner: "contractor_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  // Hardening: contractor changes are jobs.contractor_id-only and must not
  // mutate staffing history in job_assignments. Also skip no-op rewrites.
  const currentContractorId = beforeJob?.contractor_id ? String(beforeJob.contractor_id) : null;
  if (currentContractorId === contractor_id) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");
    redirectToJobWithBanner({
      jobId,
      banner: "contractor_unchanged",
      tabRaw,
      returnToRaw,
    });
  }

  const { error } = await supabase
    .from("jobs")
    .update({ contractor_id })
    .eq("id", jobId);

  if (error) {
    redirectToJobWithBanner({
      jobId,
      banner: "contractor_update_failed",
      tabRaw,
      returnToRaw,
    });
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "ops_update",
    meta: {
      source: "job_detail_info",
      changes: [
        {
          field: "contractor_id",
          from: currentContractorId,
          to: contractor_id,
        },
      ],
    },
    userId: actingUserId,
  });

  revalidatePath(`/jobs/${jobId}`, "page");
  revalidatePath("/jobs", "page");
  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const [pathOnly] = returnToRaw.split("?");
    if (pathOnly) revalidatePath(pathOnly, "page");
  }

  // Ensure the client route reflects the post-mutation server state immediately.
  refresh();
  redirectToJobWithBanner({
    jobId,
    banner: "contractor_updated",
    tabRaw,
    returnToRaw,
    cacheBust: true,
  });
}

function normalizeJobTab(raw: string): "info" | "ops" | "tests" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "ops" || value === "tests") return value;
  return "info";
}

function redirectToJobWithBanner(params: {
  jobId: string;
  banner: string;
  tabRaw?: string;
  returnToRaw?: string;
  cacheBust?: boolean;
}) {
  const tab = normalizeJobTab(String(params.tabRaw ?? ""));
  const returnToRaw = String(params.returnToRaw ?? "").trim();

  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const [pathOnly, searchRaw = ""] = returnToRaw.split("?");
    const search = new URLSearchParams(searchRaw);
    search.set("banner", params.banner);
    if (params.cacheBust) search.set("rv", Date.now().toString());
    redirect(`${pathOnly}?${search.toString()}`);
  }

  const q = new URLSearchParams();
  q.set("tab", tab);
  q.set("banner", params.banner);
  if (params.cacheBust) q.set("rv", Date.now().toString());
  redirect(`/jobs/${params.jobId}?${q.toString()}`);
}

async function requireInternalScopedJobAccessOrRedirect(params: {
  supabase: any;
  jobId: string;
  onUnauthorized?: () => void;
}) {
  const jobId = String(params.jobId ?? "").trim();
  const { userId, internalUser } = await requireInternalUser({
    supabase: params.supabase,
  });
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: "id",
  });

  if (!scopedJob?.id) {
    if (params.onUnauthorized) {
      params.onUnauthorized();
    }
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return { userId, internalUser, scopedJob };
}

export async function assignJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const makePrimary = String(formData.get("make_primary") || "").trim() === "1";
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) {
    redirectToJobWithBanner({
      jobId,
      banner: "assignment_user_required",
      tabRaw,
      returnToRaw,
    });
  }

  const supabase = await createClient();
  const { userId: actorUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await ensureActiveAssignmentForUser({
    supabase,
    jobId,
    userId,
    actorUserId,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (makePrimary) {
    await setPrimaryJobAssignment({
      supabase,
      jobId,
      userId,
      actorUserId,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: makePrimary ? "assignment_added_primary" : "assignment_added",
    tabRaw,
    returnToRaw,
  });
}

export async function setPrimaryJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) throw new Error("Missing user_id");

  const supabase = await createClient();
  const { userId: actorUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await setPrimaryJobAssignment({
    supabase,
    jobId,
    userId,
    actorUserId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: "assignment_primary_set",
    tabRaw,
    returnToRaw,
  });
}

export async function removeJobAssigneeFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const tabRaw = String(formData.get("tab") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!userId) throw new Error("Missing user_id");

  const supabase = await createClient();
  const { userId: actorUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await softRemoveJobAssignment({
    supabase,
    jobId,
    userId,
    removedBy: actorUserId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/ops");
  revalidatePath("/ops/field");
  revalidatePath(`/calendar`);

  redirectToJobWithBanner({
    jobId,
    banner: "assignment_removed",
    tabRaw,
    returnToRaw,
  });
}

/** =========================
 * SAVE: REFRIGERANT CHARGE
 * - merges existing data
 * - revalidates /tests
 * - redirects back preserving t & s (never blank s=)
 * ========================= */

export async function markRefrigerantChargeExemptFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const details = String(formData.get("rc_override_details") || "").trim() || null;

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  // Choose reason (package_unit wins if both checked)
  const exemptReason = exemptPackageUnit
    ? "package_unit"
    : exemptConditions
      ? "conditions_not_met"
      : null;

  const supabase = await createClient();

  if (!exemptReason) {
    const systemId = await resolveSystemIdForRun({
      supabase,
      jobId,
      testRunId,
      systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
    });

    const q = new URLSearchParams();
    q.set("t", "refrigerant_charge");
    if (systemId) q.set("s", systemId);
    q.set("notice", "rc_exempt_reason_required");

    redirect(`/jobs/${jobId}/tests?${q.toString()}`);
  }

  const reasonLabel =
    exemptReason === "package_unit"
      ? "Package unit — charge verification not required"
      : "Conditions not met / weather — charge verification override";

  const fullReason = details ? `${reasonLabel}: ${details}` : reasonLabel;

  // merge into data for persistence/UI defaults
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;
  const mergedData = {
    ...existingData,
    charge_exempt_reason: exemptReason,
    charge_exempt_details: details,
  };

  const computed = {
    status: "exempt",
    exempt_reason: exemptReason,
    exempt_details: details,
    note: "Marked exempt (auto-pass) by technician",
  };

  const { error: upErr } = await supabase
    .from("ecc_test_runs")
    .update({
      data: mergedData,
      computed,
      computed_pass: true,
      override_pass: true,
      override_reason: fullReason,
      is_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (upErr) throw upErr;

  await evaluateEccOpsStatus(jobId);

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId });
}

export async function saveRefrigerantChargeDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

    // Override / exemption flags (no schema change; stored + enforced via override_pass)
  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const overrideDetails = String(formData.get("rc_override_details") || "").trim() || null;

  // If both checked, treat as package unit (and record a warning)
  const isChargeExempt = exemptPackageUnit || exemptConditions;

  const chargeExemptReason = exemptPackageUnit
    ? "package_unit"
    : exemptConditions
      ? "conditions_not_met"
      : null;

  const chargeOverrideReasonText = exemptPackageUnit
    ? "Package unit — charge verification not required"
    : exemptConditions
      ? "Conditions not met / weather — charge verification override"
      : null;

  const fullOverrideReason =
    isChargeExempt
      ? (overrideDetails
          ? `${chargeOverrideReasonText}: ${overrideDetails}`
          : chargeOverrideReasonText)
      : null;

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const data = {
    // CHEERS F2
    lowest_return_air_db_f: num("lowest_return_air_db_f"),
    condenser_air_entering_db_f: num("condenser_air_entering_db_f"),
    liquid_line_temp_f: num("liquid_line_temp_f"),
    liquid_line_pressure_psig: num("liquid_line_pressure_psig"),
    condenser_sat_temp_f: num("condenser_sat_temp_f"),
    target_subcool_f: num("target_subcool_f"),

    // CHEERS G
    suction_line_temp_f: num("suction_line_temp_f"),
    suction_line_pressure_psig: num("suction_line_pressure_psig"),
    evaporator_sat_temp_f: num("evaporator_sat_temp_f"),

    // Your workflow extras
    outdoor_temp_f: num("outdoor_temp_f"),
    refrigerant_type: String(formData.get("refrigerant_type") || "").trim() || null,
    filter_drier_installed: formData.get("filter_drier_installed") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const measuredSubcool =
    data.condenser_sat_temp_f != null && data.liquid_line_temp_f != null
      ? data.condenser_sat_temp_f - data.liquid_line_temp_f
      : null;

  const measuredSuperheat =
    data.suction_line_temp_f != null && data.evaporator_sat_temp_f != null
      ? data.suction_line_temp_f - data.evaporator_sat_temp_f
      : null;

  const subcoolDelta =
    measuredSubcool != null && data.target_subcool_f != null
      ? measuredSubcool - data.target_subcool_f
      : null;

  // Rules (your current spec)
  const rules = {
    indoor_min_f: 70, // we will use lowest_return_air_db_f as indoor proxy
    outdoor_min_f: 55,
    subcool_tolerance_f: 2,
    superheat_max_f: 25,
    filter_drier_required: true,
  };

  const failures: string[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];

  // Temperature gating (doesn't block saving; affects computed_pass)
  if (data.lowest_return_air_db_f != null && data.lowest_return_air_db_f < rules.indoor_min_f) {
    blocked.push(`Indoor temp below ${rules.indoor_min_f}F`);
  } else if (data.lowest_return_air_db_f == null) {
    warnings.push("Missing lowest return air dry bulb");
  }

  if (data.outdoor_temp_f != null && data.outdoor_temp_f < rules.outdoor_min_f) {
    blocked.push(`Outdoor temp below ${rules.outdoor_min_f}F`);
  } else if (data.outdoor_temp_f == null) {
    warnings.push("Missing outdoor temp");
  }

  // Filter drier required
  if (rules.filter_drier_required && !data.filter_drier_installed) {
    failures.push("Filter drier not confirmed");
  }

  // Superheat rule
  if (measuredSuperheat != null) {
    if (measuredSuperheat >= rules.superheat_max_f) {
      failures.push(`Superheat >= ${rules.superheat_max_f}F`);
    }
  } else {
    warnings.push("Missing superheat inputs");
  }

  // Subcool rule (needs target)
  if (data.target_subcool_f == null) {
    warnings.push("Missing target subcool");
  }
  if (measuredSubcool != null && data.target_subcool_f != null) {
    if (Math.abs(measuredSubcool - data.target_subcool_f) > rules.subcool_tolerance_f) {
      failures.push(`Subcool not within ±${rules.subcool_tolerance_f}F of target`);
    }
  } else {
    warnings.push("Missing subcool inputs");
  }

  // Decide computed_pass
  const hasCoreCompute =
    measuredSubcool != null &&
    measuredSuperheat != null &&
    data.target_subcool_f != null;

  const isBlocked = blocked.length > 0;

  // ✅ Exemption/override path: counts as PASS and should not block job resolution
  const computedPass = isChargeExempt
    ? true
    : isBlocked
      ? null
      : hasCoreCompute
        ? failures.length === 0
        : null;

  if (isChargeExempt) {
    // keep a breadcrumb inside computed for auditing
    warnings.push(
      exemptPackageUnit
        ? "Charge verification exempt: package unit"
        : "Charge verification override: conditions not met"
    );
    if (overrideDetails) warnings.push(`Override details: ${overrideDetails}`);
  }

  const computed = {
    status: isChargeExempt ? "exempt" : isBlocked ? "blocked" : "computed",
    blocked: isChargeExempt ? [] : blocked,
    measured_subcool_f: measuredSubcool,
    measured_superheat_f: measuredSuperheat,
    subcool_delta_f: subcoolDelta,
    rules,
    failures: isChargeExempt ? [] : failures,
    warnings,
  };

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // 1) Load existing data so we don't wipe fields
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;

  // 2) Merge: new values override old; untouched fields remain
  const mergedData = { ...existingData, ...data };

  const { error: upErr } = await supabase
    .from("ecc_test_runs")
      .update({
    data: {
      ...mergedData,
      // store exemption info for reporting/audit
      charge_exempt: isChargeExempt || undefined,
      charge_exempt_reason: chargeExemptReason || undefined,
      charge_exempt_details: overrideDetails || undefined,
    },
    computed,
    computed_pass: computedPass,
    // ✅ this is the key that makes evaluateEccOpsStatus treat it as PASS
    override_pass: isChargeExempt ? true : null,
    override_reason: isChargeExempt ? fullOverrideReason : null,
    updated_at: new Date().toISOString(),
  })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (upErr) throw upErr;

  // ✅ preserve system selection reliably
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId });
}

/** =========================
 * SAVE: AIRFLOW
 * - revalidates /tests
 * - redirects back preserving t & s
 * ========================= */
export async function saveAirflowDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredTotalCfm = num("measured_total_cfm");
  const tonnage = num("tonnage");

  const cfmPerTon = resolveAirflowCfmPerTon(projectType);
  const requiredTotalCfm = tonnage != null ? tonnage * cfmPerTon : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredTotalCfm == null) warnings.push("Missing measured total airflow");

  let computedPass: boolean | null = null;

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    computedPass = measuredTotalCfm < requiredTotalCfm ? false : true;
    if (computedPass === false) {
      failures.push(`Airflow below required (${requiredTotalCfm} CFM)`);
    }
  } else {
    computedPass = null;
  }

  // NEW: airflow pass override
  const airflowOverridePass = String(formData.get("airflow_override_pass") || "").trim() === "true";
  const airflowOverrideReason = String(formData.get("airflow_override_reason") || "").trim();

  if (airflowOverridePass && !airflowOverrideReason) {
    throw new Error("Airflow override reason is required when override is enabled.");
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,

    // breadcrumb for reporting/audit
    airflow_override_applied: airflowOverridePass,
    airflow_override_reason: airflowOverridePass ? airflowOverrideReason : null,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
    failures,
    warnings,

    // breadcrumb for reporting/audit
    override_mode: airflowOverridePass ? "pass_override" : null,
  };

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: airflowOverridePass ? true : null,
      override_reason: airflowOverridePass ? airflowOverrideReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "airflow", systemId });
}

function parseOverrideSelectionFromForm(formData: FormData) {
  const override = String(formData.get("override") || "none").trim().toLowerCase();
  const reasonRaw = String(formData.get("override_reason") || "").trim();

  let overridePass: boolean | null = null;
  if (override === "pass") overridePass = true;
  else if (override === "fail") overridePass = false;

  if (overridePass !== null && !reasonRaw) {
    throw new Error("Override reason is required when manual override is selected.");
  }

  return {
    overridePass,
    overrideReason: overridePass !== null ? reasonRaw : null,
  };
}

function resolveAirflowCfmPerTon(projectType: string): number {
  const threshold = getThresholdRuleForTest(projectType, "airflow");
  const rawValue = threshold?.unit === "cfm_per_ton" ? threshold.targetValue : null;
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

/** =========================
 * SAVE: DUCT LEAKAGE
 * - revalidates /tests
 * - redirects back preserving t & s
 * ========================= */
export async function saveDuctLeakageDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);
  const { overridePass, overrideReason } = parseOverrideSelectionFromForm(formData);

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId, testRunId });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "duct_leakage", systemId });
}

/** =========================
 * COMPLETE TEST RUN
 * ✅ FIXES System 2 collision by scoping conflict check to (visit + test_type + system_id)
 * ✅ Always redirects preserving t & s (never blank s=)
 * ========================= */
export async function completeEccTestRunFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // 1) Load the run we are completing (this is the one we must KEEP)
  const { data: run, error: runErr } = await supabase
    .from("ecc_test_runs")
    .select("id, job_id, test_type, visit_id, is_completed, system_id, computed_pass, override_pass, data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (runErr) throw runErr;
  if (!run) throw new Error("Test run not found");

  // Resolve system_id: prefer form, fallback to run.system_id
  const systemId =
    String(formData.get("system_id") || "").trim() ||
    String(run.system_id || "").trim() ||
    null;


    
  // 2) Ensure visit_id exists (fallback to earliest visit)
  let visitId: string | null = run.visit_id ?? null;

  if (!visitId) {
    const { data: v, error: vErr } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();

    if (vErr) throw vErr;
    if (!v?.id) throw new Error("No visit exists for this job");
    visitId = v.id;

    // --- AUTO-SAVE ON COMPLETE (duct_leakage) ---
// If user skipped Save, we compute + persist so a run can never be "completed" blank.
const hasPassFail =
  run.override_pass === true ||
  run.override_pass === false ||
  run.computed_pass === true ||
  run.computed_pass === false;

const hasAnyData =
  run.data && typeof run.data === "object" && Object.keys(run.data).length > 0;

if (!hasPassFail && !hasAnyData && run.test_type === "duct_leakage") {
  const projectType = String(formData.get("project_type") || "").trim(); // "alteration" | "all_new"
  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);

  // Persist compute before allowing completion
  const { error: saveErr } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      updated_at: new Date().toISOString(),
      visit_id: visitId, // also ensure visit_id is stamped
      system_id: systemId, // ensure system_id is stamped
    })
    .eq("id", run.id)
    .eq("job_id", jobId);

  if (saveErr) throw saveErr;

  // refresh local run values for later logic
  run.computed_pass = computedPass as any;
  run.data = data as any;
}

    // stamp visit_id on the run we're keeping
    const { error: stampErr } = await supabase
      .from("ecc_test_runs")
      .update({ visit_id: visitId })
      .eq("id", run.id)
      .eq("job_id", jobId);

    if (stampErr) throw stampErr;
  }

  // 3) Find any duplicate for same visit + test_type (+ system_id if present)
const baseConflictQuery = supabase
  .from("ecc_test_runs")
  .select("id, computed_pass, override_pass, data, updated_at")
  .eq("job_id", jobId)
  .eq("visit_id", visitId)
  .eq("test_type", run.test_type)
  .neq("id", run.id)
  .order("updated_at", { ascending: false })
  .limit(1);

  const { data: existing, error: existErr } = systemId
    ? await baseConflictQuery.eq("system_id", systemId)
    : await baseConflictQuery;

  if (existErr) throw existErr;

  const conflict = (existing ?? [])[0] ?? null;
  const conflictHasPassFail =
  conflict?.override_pass === true ||
  conflict?.override_pass === false ||
  conflict?.computed_pass === true ||
  conflict?.computed_pass === false;

const conflictHasAnyData =
  conflict?.data && typeof conflict.data === "object" && Object.keys(conflict.data).length > 0;

// pick keeper: prefer the row that actually has pass/fail or data
const clickedIsGoodNow =
  run.override_pass === true ||
  run.override_pass === false ||
  run.computed_pass === true ||
  run.computed_pass === false ||
  (run.data && typeof run.data === "object" && Object.keys(run.data).length > 0);

const keepId = !clickedIsGoodNow && (conflictHasPassFail || conflictHasAnyData) ? conflict.id : run.id;
const deleteId = keepId === run.id ? conflict?.id : run.id;


  // 4) Mark THIS run completed (the one the user clicked)
  const { error: completeErr } = await supabase
    .from("ecc_test_runs")
    .update({ is_completed: true, updated_at: new Date().toISOString() })
    .eq("id", keepId)
    .eq("job_id", jobId);

  if (completeErr) throw completeErr;

  // 5) If there was a conflict, delete the OTHER row (never delete the clicked one)
  if (deleteId) {
    const { error: delErr } = await supabase
      .from("ecc_test_runs")
      .delete()
      .eq("id", deleteId)
      .eq("job_id", jobId);

    if (delErr) throw delErr;
  }

  // 6) Update ECC ops_status based on completed test outcomes (failed vs paperwork_required)

// BEFORE snapshot: child ops_status + parent link
const { data: childBefore, error: childBeforeErr } = await supabase
  .from("jobs")
  .select("ops_status, parent_job_id")
  .eq("id", jobId)
  .maybeSingle();

if (childBeforeErr) throw childBeforeErr;

const childOpsBefore = (childBefore?.ops_status ?? null) as string | null;
const parentJobId = (childBefore?.parent_job_id ?? null) as string | null;

// Existing behavior (keep)
await evaluateEccOpsStatus(jobId);

// AFTER snapshot: child ops_status
const { data: childAfter, error: childAfterErr } = await supabase
  .from("jobs")
  .select("ops_status")
  .eq("id", jobId)
  .maybeSingle();

if (childAfterErr) throw childAfterErr;

const childOpsAfter = (childAfter?.ops_status ?? null) as string | null;

// Retest resolution (only if linked)
if (parentJobId) {
  await applyRetestResolution({
    supabase,
    childJobId: jobId,
    parentJobId,
    childOpsBefore,
    childOpsAfter,
  });
}


  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: run.test_type, systemId });
}

/** =========================
 * SAVE & COMPLETE: DUCT LEAKAGE (Combined)
 * - saves readings + completes in one action
 * - sets is_completed = true
 * ========================= */
export async function saveAndCompleteDuctLeakageFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);
  const { overridePass, overrideReason } = parseOverrideSelectionFromForm(formData);

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "duct_leakage", systemId });
}

/** =========================
 * SAVE & COMPLETE: AIRFLOW (Combined)
 * - saves readings + completes in one action
 * - sets is_completed = true
 * ========================= */
export async function saveAndCompleteAirflowFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredTotalCfm = num("measured_total_cfm");
  const tonnage = num("tonnage");

  const cfmPerTon = resolveAirflowCfmPerTon(projectType);
  const requiredTotalCfm = tonnage != null ? tonnage * cfmPerTon : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredTotalCfm == null) warnings.push("Missing measured total airflow");

  let computedPass: boolean | null = null;

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    computedPass = measuredTotalCfm < requiredTotalCfm ? false : true;
    if (computedPass === false) {
      failures.push(`Airflow below required (${requiredTotalCfm} CFM)`);
    }
  } else {
    computedPass = null;
  }

  const airflowOverridePass = String(formData.get("airflow_override_pass") || "").trim() === "true";
  const airflowOverrideReason = String(formData.get("airflow_override_reason") || "").trim();

  if (airflowOverridePass && !airflowOverrideReason) {
    throw new Error("Airflow override reason is required when override is enabled.");
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,
    airflow_override_applied: airflowOverridePass,
    airflow_override_reason: airflowOverridePass ? airflowOverrideReason : null,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
    failures,
    warnings,
    override_mode: airflowOverridePass ? "pass_override" : null,
  };

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: airflowOverridePass ? true : null,
      override_reason: airflowOverridePass ? airflowOverrideReason : null,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "airflow", systemId });
}

/** =========================
 * SAVE & COMPLETE: REFRIGERANT CHARGE (Combined)
 * - saves readings + completes in one action
 * - sets is_completed = true
 * ========================= */
export async function saveAndCompleteRefrigerantChargeFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const overrideDetails = String(formData.get("rc_override_details") || "").trim() || null;

  const isChargeExempt = exemptPackageUnit || exemptConditions;

  const chargeExemptReason = exemptPackageUnit
    ? "package_unit"
    : exemptConditions
      ? "conditions_not_met"
      : null;

  const chargeOverrideReasonText = exemptPackageUnit
    ? "Package unit — charge verification not required"
    : exemptConditions
      ? "Conditions not met / weather — charge verification override"
      : null;

  const fullOverrideReason =
    isChargeExempt
      ? (overrideDetails
          ? `${chargeOverrideReasonText}: ${overrideDetails}`
          : chargeOverrideReasonText)
      : null;

  const data = {
    lowest_return_air_db_f: num("lowest_return_air_db_f"),
    condenser_air_entering_db_f: num("condenser_air_entering_db_f"),
    liquid_line_temp_f: num("liquid_line_temp_f"),
    liquid_line_pressure_psig: num("liquid_line_pressure_psig"),
    condenser_sat_temp_f: num("condenser_sat_temp_f"),
    target_subcool_f: num("target_subcool_f"),
    suction_line_temp_f: num("suction_line_temp_f"),
    suction_line_pressure_psig: num("suction_line_pressure_psig"),
    evaporator_sat_temp_f: num("evaporator_sat_temp_f"),
    outdoor_temp_f: num("outdoor_temp_f"),
    refrigerant_type: String(formData.get("refrigerant_type") || "").trim() || null,
    filter_drier_installed: formData.get("filter_drier_installed") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const measuredSubcool =
    data.condenser_sat_temp_f != null && data.liquid_line_temp_f != null
      ? data.condenser_sat_temp_f - data.liquid_line_temp_f
      : null;

  const measuredSuperheat =
    data.suction_line_temp_f != null && data.evaporator_sat_temp_f != null
      ? data.suction_line_temp_f - data.evaporator_sat_temp_f
      : null;

  const subcoolDelta =
    measuredSubcool != null && data.target_subcool_f != null
      ? measuredSubcool - data.target_subcool_f
      : null;

  const rules = {
    indoor_min_f: 70,
    outdoor_min_f: 55,
    subcool_tolerance_f: 2,
    superheat_max_f: 25,
    filter_drier_required: true,
  };

  const failures: string[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];

  if (data.lowest_return_air_db_f != null && data.lowest_return_air_db_f < rules.indoor_min_f) {
    blocked.push(`Indoor temp below ${rules.indoor_min_f}F`);
  } else if (data.lowest_return_air_db_f == null) {
    warnings.push("Missing lowest return air dry bulb");
  }

  if (data.outdoor_temp_f != null && data.outdoor_temp_f < rules.outdoor_min_f) {
    blocked.push(`Outdoor temp below ${rules.outdoor_min_f}F`);
  } else if (data.outdoor_temp_f == null) {
    warnings.push("Missing outdoor temp");
  }

  if (rules.filter_drier_required && !data.filter_drier_installed) {
    failures.push("Filter drier not confirmed");
  }

  if (measuredSuperheat != null) {
    if (measuredSuperheat >= rules.superheat_max_f) {
      failures.push(`Superheat >= ${rules.superheat_max_f}F`);
    }
  } else {
    warnings.push("Missing superheat inputs");
  }

  if (data.target_subcool_f == null) {
    warnings.push("Missing target subcool");
  }
  if (measuredSubcool != null && data.target_subcool_f != null) {
    if (Math.abs(measuredSubcool - data.target_subcool_f) > rules.subcool_tolerance_f) {
      failures.push(`Subcool not within ±${rules.subcool_tolerance_f}F of target`);
    }
  } else {
    warnings.push("Missing subcool inputs");
  }

  const hasCoreCompute =
    measuredSubcool != null &&
    measuredSuperheat != null &&
    data.target_subcool_f != null;

  const isBlocked = blocked.length > 0;

  const computedPass = isChargeExempt
    ? true
    : isBlocked
      ? null
      : hasCoreCompute
        ? failures.length === 0
        : null;

  if (isChargeExempt) {
    warnings.push(
      exemptPackageUnit
        ? "Charge verification exempt: package unit"
        : "Charge verification override: conditions not met"
    );
    if (overrideDetails) warnings.push(`Override details: ${overrideDetails}`);
  }

  const computed = {
    status: isChargeExempt ? "exempt" : isBlocked ? "blocked" : "computed",
    blocked: isChargeExempt ? [] : blocked,
    measured_subcool_f: measuredSubcool,
    measured_superheat_f: measuredSuperheat,
    subcool_delta_f: subcoolDelta,
    rules,
    failures: isChargeExempt ? [] : failures,
    warnings,
  };

  const supabase = await createClient();
  await requireInternalEccTestsAccess({ supabase, jobId });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Load existing data so we don't wipe fields
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;
  const mergedData = { ...existingData, ...data };

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: {
        ...mergedData,
        charge_exempt: isChargeExempt || undefined,
        charge_exempt_reason: chargeExemptReason || undefined,
        charge_exempt_details: overrideDetails || undefined,
      },
      computed,
      computed_pass: computedPass,
      override_pass: isChargeExempt ? true : null,
      override_reason: isChargeExempt ? fullOverrideReason : null,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId });
}


export async function addAlterationCoreTestsFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const systemId = String(formData.get("system_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim(); // optional

  if (!jobId) throw new Error("Missing job_id");
  if (!systemId) throw new Error("Missing system_id");

  const supabase = await createClient();

  // Attach to Visit #1 for now
  const { data: visit, error: visitErr } = await supabase
    .from("job_visits")
    .select("id, visit_number")
    .eq("job_id", jobId)
    .order("visit_number", { ascending: true })
    .limit(1)
    .single();

  if (visitErr) throw visitErr;
  if (!visit?.id) throw new Error("No visit found for job");

  // Find existing core tests for THIS job + THIS system
  const { data: existing, error: existingError } = await supabase
    .from("ecc_test_runs")
    .select("test_type")
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (existingError) throw existingError;

  const existingSet = new Set((existing ?? []).map((r: any) => r.test_type));

  const required = ["duct_leakage", "airflow", "refrigerant_charge"];

  const toInsert = required
    .filter((t) => !existingSet.has(t))
    .map((test_type) => {
      const row: any = {
        job_id: jobId,
        visit_id: visit.id,
        test_type,
        system_id: systemId,
        is_completed: false,
        data: {},
        computed: {},
        computed_pass: null,
        override_pass: null,
        override_reason: null,
      };

      if (equipmentId) row.equipment_id = equipmentId;
      return row;
    });

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("ecc_test_runs").insert(toInsert);
    if (insertError) throw insertError;
  }

  revalidatePath(`/jobs/${jobId}/tests`);
  redirectToTests({ jobId, systemId });
}

async function updateJob(input: {
  ops_status?: string | null;
  id: string;
  title?: string;
  service_visit_type?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
  city?: string;
  status?: JobStatus;
  scheduled_date?: string | null;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  on_the_way_at?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
}) {
  const supabase = await createClient();
  const { id, ...updates } = input;

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function createJob(
  input: CreateJobInput,
  options?: { serviceCaseWriteClient?: any }
): Promise<{ id: string; service_case_id: string | null }> {
  const supabase = await createClient();
  const serviceCaseWriteClient = options?.serviceCaseWriteClient ?? supabase;

  const normalizedJobType = String(input.job_type ?? "ecc").trim().toLowerCase();
  const parentJobId = String(input.parent_job_id ?? "").trim() || null;

  let resolvedServiceCaseId = String(input.service_case_id ?? "").trim() || null;

  // Child jobs must carry the parent service_case_id to satisfy lineage guardrails.
  if (parentJobId && !resolvedServiceCaseId) {
    resolvedServiceCaseId = await resolveServiceCaseIdForNewJob({
      supabase: serviceCaseWriteClient,
      parentJobId,
    });
  }

  const normalizedServiceVisitType =
    normalizedJobType === "service"
      ? normalizeServiceVisitType(input.service_visit_type) ?? "diagnostic"
      : null;

  const normalizedServiceVisitReason =
    normalizedJobType === "service"
      ? deriveInitialServiceVisitReason({
          serviceVisitReason: input.service_visit_reason ?? input.visit_scope_summary,
          title: input.title,
          jobNotes: input.job_notes,
        })
      : null;

  const normalizedVisitScopeSummary = sanitizeVisitScopeSummary(input.visit_scope_summary);
  const normalizedVisitScopeItems = sanitizeVisitScopeItems(input.visit_scope_items ?? []);

  const normalizedServiceVisitOutcome =
    normalizedJobType === "service"
      ? normalizeServiceVisitOutcome(input.service_visit_outcome) ?? "follow_up_required"
      : null;

  const payload = {
    parent_job_id: parentJobId,
    service_case_id: resolvedServiceCaseId,

    job_type: normalizedJobType,
    service_visit_type: normalizedServiceVisitType,
    service_visit_reason: normalizedServiceVisitReason,
    service_visit_outcome: normalizedServiceVisitOutcome,
    project_type: input.project_type ?? "alteration",

    title: input.title,
    job_address: input.job_address ?? null,
    city: input.city,
    scheduled_date: input.scheduled_date,
    status: input.status,
    contractor_id: input.contractor_id ?? null,
    permit_number: input.permit_number ?? null,
    jurisdiction: input.jurisdiction ?? null,
    permit_date: input.permit_date ?? null,
    window_start: input.window_start ?? null,
    window_end: input.window_end ?? null,
    customer_phone: input.customer_phone ?? null,
    customer_id: input.customer_id ?? null,
    location_id: input.location_id ?? null,
    customer_first_name: input.customer_first_name ?? null,
    customer_last_name: input.customer_last_name ?? null,
    customer_email: input.customer_email ?? null,
    job_notes: input.job_notes ?? null,
    visit_scope_summary: normalizedVisitScopeSummary,
    visit_scope_items: normalizedVisitScopeItems,
    ops_status: input.ops_status ?? null,

    billing_recipient: input.billing_recipient ?? null,
    billing_name: input.billing_name ?? null,
    billing_email: input.billing_email ?? null,
    billing_phone: input.billing_phone ?? null,
    billing_address_line1: input.billing_address_line1 ?? null,
    billing_address_line2: input.billing_address_line2 ?? null,
    billing_city: input.billing_city ?? null,
    billing_state: input.billing_state ?? null,
    billing_zip: input.billing_zip ?? null,
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id, customer_id, location_id, service_case_id, parent_job_id, title, job_notes")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Job insert failed");

  let serviceCaseId = data.service_case_id ? String(data.service_case_id) : null;

  // Root job: create case after insert if not already provided
  if (!serviceCaseId && !data.parent_job_id) {
    if (!data.customer_id || !data.location_id) {
      throw new Error("Root job created without customer_id/location_id; cannot create service case");
    }

    serviceCaseId = await resolveServiceCaseIdForNewJob({
      supabase: serviceCaseWriteClient,
      customerId: String(data.customer_id),
      locationId: String(data.location_id),
      title: data.title,
      jobNotes: data.job_notes,
      caseKind: input.service_case_kind,
    });

    const { error: updErr } = await serviceCaseWriteClient
      .from("jobs")
      .update({ service_case_id: serviceCaseId })
      .eq("id", data.id);

    if (updErr) throw updErr;
  }
  

  return {
    id: String(data.id),
    service_case_id: serviceCaseId,
  };
}

/**
 * CREATE: used by /jobs/new form
 */
export async function createJobFromForm(formData: FormData) {
  // ----- basic fields -----
  const relationshipActionRaw = String(formData.get("relationship_action") || "").trim();
  const relationshipJobId = String(formData.get("relationship_job_id") || "").trim();
  const relationshipAction =
    relationshipActionRaw === "open_active_job" ||
    relationshipActionRaw === "create_follow_up"
      ? relationshipActionRaw
      : "new_case";

  const rawJobType = String(formData.get("job_type") || "").trim().toLowerCase();
  const relationshipJobType = normalizeIntakeJobType(rawJobType);

  if (!relationshipJobType) {
    throw new Error("Invalid job type");
  }

const jobType = relationshipJobType;
  const projectType = String(formData.get("project_type") || "alteration").trim();

  const contractorIdRaw = formData.get("contractor_id");
  const contractor_id =
    typeof contractorIdRaw === "string" && contractorIdRaw.trim()
      ? contractorIdRaw.trim()
      : null;

  const title = String(formData.get("title") || "").trim();
  const postedCity = String(formData.get("city") || "").trim();

  const customerPhoneRaw = String(formData.get("customer_phone") || "").trim();

  const billing_recipient = String(formData.get("billing_recipient") || "").trim() as
    | "contractor"
    | "customer"
    | "other"
    | "";

const billing_name = String(formData.get("billing_name") || "").trim() || null;
const billing_email = String(formData.get("billing_email") || "").trim() || null;
const billing_phone = String(formData.get("billing_phone") || "").trim() || null;

const billing_address_line1 =
  String(formData.get("billing_address_line1") || "").trim() || null;
const billing_address_line2 =
  String(formData.get("billing_address_line2") || "").trim() || null;
const billing_city = String(formData.get("billing_city") || "").trim() || null;
const billing_state = String(formData.get("billing_state") || "").trim() || null;
const billing_zip = String(formData.get("billing_zip") || "").trim() || null;

const { scheduled_date: derived_scheduled_date, window_start: derived_window_start, window_end: derived_window_end, ops_status: derived_ops_status } =
  deriveScheduleAndOps(formData);

const permitNumberRaw = String(formData.get("permit_number") || "").trim();
const permitDateRaw = String(formData.get("permit_date") || "").trim();
const jurisdictionRaw = String(formData.get("jurisdiction") || "").trim();

const customerFirstNameRaw = String(formData.get("customer_first_name") || "").trim();
const customerLastNameRaw = String(formData.get("customer_last_name") || "").trim();
const customerEmailRaw = String(formData.get("customer_email") || "").trim();
const jobNotesRaw = String(formData.get("job_notes") || "").trim();
const visitScopeSummaryRaw = String(formData.get("visit_scope_summary") || "").trim();
const visitScopeItemsRaw = String(formData.get("visit_scope_items_json") || "").trim();
const jobAddressFormRaw = String(formData.get("job_address") || "").trim();
const serviceCaseKindRaw = String(formData.get("service_case_kind") || "").trim();
const serviceVisitTypeRaw = String(formData.get("service_visit_type") || "").trim();
const serviceVisitReasonRaw = String(formData.get("service_visit_reason") || "").trim();
const serviceVisitOutcomeRaw = String(formData.get("service_visit_outcome") || "").trim();

const service_case_kind = normalizeServiceCaseKind(serviceCaseKindRaw);
const service_visit_type = normalizeServiceVisitType(serviceVisitTypeRaw);
const service_visit_reason = serviceVisitReasonRaw || null;
const service_visit_outcome = normalizeServiceVisitOutcome(serviceVisitOutcomeRaw);

const jurisdiction = jobType === "service" ? null : (jurisdictionRaw || null);
const permit_date = jobType === "service" ? null : (permitDateRaw || null);
const permit_number = jobType === "service" ? null : (permitNumberRaw || null);

// Intake create is always born open; lifecycle transitions happen later via dedicated flows.
const status: JobStatus = "open";

// ----- supabase + identity -----
const supabase = await createClient();

const { data: userData, error: userErr } = await supabase.auth.getUser();
if (userErr) throw new Error(userErr.message);

const user = userData?.user ?? null;
const userId = user?.id ?? null;

let isContractorUser = false;

// Enforce contractor based on login (multi-user per contractor)
let contractorIdFinal = contractor_id;

if (userId) {
  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (cuErr) throw new Error(cuErr.message);

  if (cu?.contractor_id) {
    contractorIdFinal = cu.contractor_id;
    isContractorUser = true;
  }
  
}

// Contractor/customer intake: scheduling is set by ops after submission, not during intake.
// Internal staff submissions (isContractorUser = false) keep scheduling fields as-is.
const scheduled_date = isContractorUser ? null : derived_scheduled_date;
const window_start = isContractorUser ? null : derived_window_start;
const window_end = isContractorUser ? null : derived_window_end;
const ops_status = isContractorUser ? "need_to_schedule" : derived_ops_status;
const visit_scope_summary = isContractorUser ? null : sanitizeVisitScopeSummary(visitScopeSummaryRaw);
let visit_scope_items: VisitScopeItem[] = [];

if (!isContractorUser) {
  try {
    visit_scope_items = parseVisitScopeItemsJson(visitScopeItemsRaw);
  } catch {
    redirect("/jobs/new?err=visit_scope_invalid");
  }

  if (jobType === "service" && !hasVisitScopeContent(visit_scope_summary, visit_scope_items)) {
    redirect("/jobs/new?err=visit_scope_required");
  }
}

const { canonicalOwnerUserId, canonicalWriteClient } =
  await resolveCanonicalOwner({
    actorUserId: userId,
    defaultWriteClient: supabase,
    contractorId: isContractorUser ? contractorIdFinal : null,
  });

  function redirectInvalidExistingPairing() {
    redirect("/jobs/new?err=invalid_customer_location");
  }

  function redirectToCreatedJob(jobId: string, banner: string) {
    const search = new URLSearchParams();
    search.set("banner", banner);
    const suffix = `?${search.toString()}`;

    if (isContractorUser) {
      redirect(`/portal/jobs/${jobId}${suffix}`);
    }

    redirect(`/jobs/${jobId}${suffix}`);
  }

  const DUPLICATE_SUBMISSION_WINDOW_MS = 45_000;

  function normalizeDuplicateField(value: string | null | undefined) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function sameDuplicateField(left: string | null | undefined, right: string | null | undefined) {
    return normalizeDuplicateField(left) === normalizeDuplicateField(right);
  }

  async function findRecentDuplicateJob(params: {
    customerId: string;
    locationId: string;
    city?: string | null;
    title?: string | null;
    scheduledDate?: string | null;
    windowStart?: string | null;
    windowEnd?: string | null;
    permitNumber?: string | null;
    jobAddress?: string | null;
  }) {
    const compareServiceTitle =
      jobType === "service" || normalizeDuplicateField(params.title).length > 0;
    const comparePermitNumber = normalizeDuplicateField(params.permitNumber).length > 0;
    const compareJobAddress = normalizeDuplicateField(params.jobAddress).length > 0;

    let query = canonicalWriteClient
      .from("jobs")
      .select(
        "id, title, city, scheduled_date, window_start, window_end, permit_number, job_address"
      )
      .eq("customer_id", params.customerId)
      .eq("location_id", params.locationId)
      .eq("job_type", jobType)
      .gte("created_at", new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MS).toISOString())
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(5);

    if (contractorIdFinal) {
      query = query.eq("contractor_id", contractorIdFinal);
    } else {
      query = query.is("contractor_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const match = (data ?? []).find((candidate: {
      id?: string | null;
      title?: string | null;
      city?: string | null;
      scheduled_date?: string | null;
      window_start?: string | null;
      window_end?: string | null;
      permit_number?: string | null;
      job_address?: string | null;
    }) => {
      if (!sameDuplicateField(candidate.city, params.city)) return false;
      if (!sameDuplicateField(candidate.scheduled_date, params.scheduledDate)) return false;
      if (!sameDuplicateField(candidate.window_start, params.windowStart)) return false;
      if (!sameDuplicateField(candidate.window_end, params.windowEnd)) return false;
      if (compareServiceTitle && !sameDuplicateField(candidate.title, params.title)) return false;
      if (comparePermitNumber && !sameDuplicateField(candidate.permit_number, params.permitNumber)) {
        return false;
      }
      if (compareJobAddress && !sameDuplicateField(candidate.job_address, params.jobAddress)) {
        return false;
      }

      return true;
    });

    return match?.id ? String(match.id) : null;
  }

  async function findExistingIntakeDuplicate(params: {
    customerId: string;
    locationId: string;
    city?: string | null;
    title?: string | null;
    scheduledDate?: string | null;
    windowStart?: string | null;
    windowEnd?: string | null;
    permitNumber?: string | null;
    jobAddress?: string | null;
  }) {
    return findRecentDuplicateJob(params);
  }


  // ----- billing defaults based on FINAL contractor id -----
  let billingRecipientFinal =
    billing_recipient || (contractorIdFinal ? "contractor" : "customer");

  if (billingRecipientFinal === "contractor" && !contractorIdFinal) {
    billingRecipientFinal = "customer";
  }

  if (billingRecipientFinal === "other") {
    if (!billing_name || !billing_address_line1 || !billing_city || !billing_state || !billing_zip) {
      throw new Error("Billing recipient is Other: Billing name and full address are required.");
    }
  }

  // ----- canonical service address input -----
  const existingCustomerId = String(formData.get("customer_id") || "").trim();
  const existingLocationId = String(formData.get("location_id") || "").trim();
  let existingCustomerSnapshot: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null = null;

  if (existingCustomerId) {
    const { data: ownedCustomer, error: ownedCustomerErr } = await canonicalWriteClient
      .from("customers")
      .select("id, owner_user_id")
      .eq("id", existingCustomerId)
      .maybeSingle();

    if (ownedCustomerErr) throw ownedCustomerErr;

    const ownerUserId = String((ownedCustomer as any)?.owner_user_id ?? "").trim();
    if (!ownedCustomer?.id || ownerUserId !== String(canonicalOwnerUserId)) {
      redirectInvalidExistingPairing();
    }
  }

  if (existingLocationId) {
    const { data: ownedLocation, error: ownedLocationErr } = await canonicalWriteClient
      .from("locations")
      .select("id, customer_id, owner_user_id")
      .eq("id", existingLocationId)
      .maybeSingle();

    if (ownedLocationErr) throw ownedLocationErr;

    const ownerUserId = String((ownedLocation as any)?.owner_user_id ?? "").trim();
    const locationCustomerId = String((ownedLocation as any)?.customer_id ?? "").trim();

    if (!ownedLocation?.id || ownerUserId !== String(canonicalOwnerUserId) || !locationCustomerId) {
      redirectInvalidExistingPairing();
    }

    if (existingCustomerId && locationCustomerId !== existingCustomerId) {
      redirectInvalidExistingPairing();
    }
  }

  if (relationshipAction === "open_active_job") {
    if (isContractorUser) {
      throw new Error("Open Active Job is only available for internal intake.");
    }

    if (!existingCustomerId || !existingLocationId) {
      throw new Error("Open Active Job requires a resolved customer and location.");
    }

    if (!relationshipJobId) {
      throw new Error("Select an active job before continuing.");
    }

    const anchorJob = await loadRelationshipAnchorJob({
      jobId: relationshipJobId,
      customerId: existingCustomerId,
      locationId: existingLocationId,
      requireActive: true,
      expectedJobType: relationshipJobType,
    });

    redirect(`/jobs/${String(anchorJob.id)}?banner=intake_existing_job_selected`);
  }

  if (existingCustomerId) {
    const { data: existingCustomerRow, error: existingCustomerErr } = await supabase
      .from("customers")
      .select("first_name, last_name, email, phone")
      .eq("id", existingCustomerId)
      .maybeSingle();

    if (existingCustomerErr) throw existingCustomerErr;
    existingCustomerSnapshot = existingCustomerRow;
  }

  const customerFirstNameSnapshot =
    customerFirstNameRaw || String(existingCustomerSnapshot?.first_name ?? "").trim() || null;
  const customerLastNameSnapshot =
    customerLastNameRaw || String(existingCustomerSnapshot?.last_name ?? "").trim() || null;
  const customerEmailSnapshot =
    customerEmailRaw || String(existingCustomerSnapshot?.email ?? "").trim() || null;
  const customerPhoneSnapshot =
    customerPhoneRaw || String(existingCustomerSnapshot?.phone ?? "").trim() || null;

  let existingLocationSnapshot: {
    address_line1?: string | null;
    city?: string | null;
    zip?: string | null;
  } | null = null;

  if (existingLocationId) {
    const { data: existingLocation, error: existingLocationErr } = await supabase
      .from("locations")
      .select("id, address_line1, city, zip")
      .eq("id", existingLocationId)
      .maybeSingle();

    if (existingLocationErr) throw existingLocationErr;
    existingLocationSnapshot = existingLocation;
  }

  const address_line1 =
    String(formData.get("address_line1") || "").trim() ||
    jobAddressFormRaw ||
    String(existingLocationSnapshot?.address_line1 ?? "").trim();

  const city = postedCity || String(existingLocationSnapshot?.city ?? "").trim();

  const jobAddressRaw = address_line1;

  const titleFinal = resolveCreateJobTitle({
    submittedTitle: title,
    isContractorUser,
    jobType,
    projectType,
    serviceVisitReason: service_visit_reason,
    visitScopeSummary: visit_scope_summary,
    visitScopeItems: visit_scope_items,
  });

  if (!city) throw new Error("City is required");

  const locationNickname =
    String(formData.get("location_nickname") || "").trim() || null;
  const zip =
    String(formData.get("zip") || "").trim() ||
    String(existingLocationSnapshot?.zip ?? "").trim() ||
    null;

  if (!existingLocationId && !zip) {
    throw new Error("Zip is required");
  }

    const normalizeAddressPart = (value: string | null | undefined) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const normalizedAddressLine1 = normalizeAddressPart(address_line1);
  const normalizedCity = normalizeAddressPart(city);
  const normalizedZip = normalizeAddressPart(zip);

  async function findReusableLocation(customerId: string) {
  if (!normalizedAddressLine1 || !normalizedCity) return null;

  const { data: existingLocations, error } = await supabase
    .from("locations")
    .select("id, address_line1, city, zip, postal_code")
    .eq("customer_id", customerId);

  if (error) throw error;

  const match = (existingLocations || []).find((loc) => {
    const locAddress = normalizeAddressPart(loc.address_line1);
    const locCity = normalizeAddressPart(loc.city);
    const locZip = normalizeAddressPart((loc as any).zip ?? (loc as any).postal_code);

    const sameAddress = locAddress === normalizedAddressLine1;
    const sameCity = locCity === normalizedCity;

    const zipProvided = !!normalizedZip;
    const sameZip = !zipProvided || locZip === normalizedZip;

    return sameAddress && sameCity && sameZip;
  });

  return match ?? null;
}

  async function loadCanonicalJobSnapshot(params: {
    customerId: string;
    locationId: string;
    fallback: {
      customer_first_name?: string | null;
      customer_last_name?: string | null;
      customer_email?: string | null;
      customer_phone?: string | null;
      job_address?: string | null;
      city?: string | null;
    };
  }) {
    const [{ data: customerRow, error: customerErr }, { data: locationRow, error: locationErr }] = await Promise.all([
      canonicalWriteClient
        .from("customers")
        .select("first_name, last_name, email, phone")
        .eq("id", params.customerId)
        .maybeSingle(),
      canonicalWriteClient
        .from("locations")
        .select("address_line1, city")
        .eq("id", params.locationId)
        .maybeSingle(),
    ]);

    if (customerErr) throw customerErr;
    if (locationErr) throw locationErr;

    const customer_first_name =
      String(customerRow?.first_name ?? "").trim() ||
      String(params.fallback.customer_first_name ?? "").trim() ||
      null;
    const customer_last_name =
      String(customerRow?.last_name ?? "").trim() ||
      String(params.fallback.customer_last_name ?? "").trim() ||
      null;
    const customer_email =
      String(customerRow?.email ?? "").trim() ||
      String(params.fallback.customer_email ?? "").trim() ||
      null;
    const customer_phone =
      String(customerRow?.phone ?? "").trim() ||
      String(params.fallback.customer_phone ?? "").trim() ||
      null;
    const job_address =
      String(locationRow?.address_line1 ?? "").trim() ||
      String(params.fallback.job_address ?? "").trim() ||
      null;
    const city =
      String(locationRow?.city ?? "").trim() ||
      String(params.fallback.city ?? "").trim() ||
      null;

    if (!city) throw new Error("City is required");

    return {
      customer_first_name,
      customer_last_name,
      customer_email,
      customer_phone,
      job_address,
      city,
    };
  }

  async function loadRelationshipAnchorJob(params: {
    jobId: string;
    customerId: string;
    locationId: string;
    requireActive: boolean;
    expectedJobType: "ecc" | "service" | null;
  }) {
    const { data: anchorJob, error: anchorErr } = await canonicalWriteClient
      .from("jobs")
      .select("id, customer_id, location_id, service_case_id, job_type, status, ops_status")
      .eq("id", params.jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (anchorErr) throw anchorErr;
    if (!anchorJob?.id) {
      throw new Error("Selected related job was not found.");
    }

    if (
      String(anchorJob.customer_id ?? "").trim() !== params.customerId ||
      String(anchorJob.location_id ?? "").trim() !== params.locationId
    ) {
      throw new Error("Selected related job does not match the resolved customer and location.");
    }

    if (params.expectedJobType && normalizeIntakeJobType(anchorJob.job_type) !== params.expectedJobType) {
      throw new Error("Selected related job does not match the chosen job type.");
    }

    if (params.requireActive && !isActiveIntakeRelationshipJob(anchorJob)) {
      throw new Error("Selected active job is no longer active.");
    }

    return anchorJob;
  }

  // ----- equipment payload (optional) + server validation -----
  const equipmentJsonRaw = String(formData.get("equipment_json") || "").trim();
  let equipmentPayload: any = null;

  if (equipmentJsonRaw) {
    try {
      equipmentPayload = JSON.parse(equipmentJsonRaw);
    } catch {
      throw new Error("Equipment payload was invalid. Please try again.");
    }

    const systems = Array.isArray(equipmentPayload?.systems) ? equipmentPayload.systems : [];
    for (const s of systems) {
      const hasComponents = Array.isArray(s?.components) && s.components.length > 0;
      const name = String(s?.name || "").trim();
      // Locked rule A: selecting a component => system name required
      if (hasComponents && !name) {
        throw new Error("Equipment added: System Location/Name is required for each system.");
      
      }
      
    }
    
  }

  

 async function insertEquipmentForJob(jobId: string) {
  console.error("EQUIP ENTER", { jobId, isContractorUser });

  const { data: u0, error: u0e } = await supabase.auth.getUser();
  console.error("EQUIP AUTH (top)", {
    uid: u0?.user?.id ?? null,
    err: u0e?.message ?? null,
  });

  const systems = Array.isArray(equipmentPayload?.systems)
    ? equipmentPayload.systems
    : [];
  if (!systems.length) return;

  for (const s of systems) {
    const systemName = String(s?.name || "").trim();
    const comps = Array.isArray(s?.components) ? s.components : [];
    if (!comps.length) continue;

    // B) right before job_systems insert (per system)
    console.error("EQUIP BEFORE job_systems insert", { jobId, systemName });

    const { data: u1, error: u1e } = await supabase.auth.getUser();
    console.error("EQUIP AUTH (pre-insert)", {
      uid: u1?.user?.id ?? null,
      err: u1e?.message ?? null,
    });

    // Create system (job_systems.name is NOT NULL)
    const { data: createdSystem, error: sysCreateErr } = await supabase
      .from("job_systems")
      .insert({ job_id: jobId, name: systemName })
      .select("id")
      .single();

    // C) if it fails, print the full supabase error object
    if (sysCreateErr) {
      console.error("job_systems insert error obj:", sysCreateErr);
      throw sysCreateErr;
    }

    const systemId = createdSystem?.id;
    if (!systemId) throw new Error("Unable to create system_id");

    for (const c of comps) {
      const rawType = String(c?.type || "").trim();
      if (!rawType) continue;

      const eq = sanitizeEquipmentFields({
        canonicalRole: mapToCanonicalRole(rawType),
        manufacturer: c?.manufacturer ? String(c.manufacturer).trim() : null,
        model: c?.model ? String(c.model).trim() : null,
        serial: c?.serial ? String(c.serial).trim() : null,
        notes: c?.notes ? String(c.notes).trim() : null,
        tonnage: c?.tonnage ? Number(String(c.tonnage).trim()) || null : null,
        refrigerantType: c?.refrigerant_type ? String(c.refrigerant_type).trim() || null : null,
        heatingCapacityKbtu: c?.heating_capacity_kbtu
          ? Number(String(c.heating_capacity_kbtu).trim()) || null
          : c?.tonnage && mapToCanonicalRole(rawType) === "furnace"
          ? Number(String(c.tonnage).trim()) || null
          : null,
        heatingOutputBtu: c?.heating_output_btu
          ? Number(String(c.heating_output_btu).trim()) || null
          : null,
        heatingEfficiencyPercent: c?.heating_efficiency_percent
          ? Number(String(c.heating_efficiency_percent).trim()) || null
          : null,
      });

      const { error: eqErr } = await supabase.from("job_equipment").insert({
        job_id: jobId,
        system_id: systemId,
        system_location: systemName,
        ...eq,
      });

      if (eqErr) {
        console.error("job_equipment insert error obj:", eqErr);
        throw eqErr;
      }
    }
  }
}

async function logIntakeSubmitted(jobId: string) {
  if (isContractorUser) return; // <-- add this line

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "intake_submitted",
    meta: {
      source: contractorIdFinal ? "contractor" : "internal",
      contractor_id: contractorIdFinal,
      job_type: jobType,
      project_type: projectType,
    },
    userId,
  });
}

  async function notifyInternalNextActionChanged(params: {
    supabase: any;
    jobId: string;
    eventType: string;
    meta?: Record<string, any> | null;
  }) {
    const { jobId } = params;

    // Intentionally lightweight for now.
    // This is the seam where email / notification-ledger wiring can be added later.
    // For this thread, the system notification is:
    // 1) job_events entry
    // 2) /ops visibility
    // 3) revalidation
    return { jobId };
  }



async function postCreate(createdJobId: string, metaSource: string) {
  async function runBestEffortPostCreateStep(
    step: string,
    work: () => Promise<void>
  ) {
    try {
      await work();
    } catch (error) {
      console.error("Post-create step failed after durable create:", {
        step,
        createdJobId,
        isContractorUser,
        error: error instanceof Error ? error.message : "Unknown post-create error",
      });
    }
  }

  if (!isContractorUser) {
  // Internal users can write system timeline events
  await insertJobEvent({
    supabase,
    jobId: createdJobId,
    event_type: "job_created",
    meta: { source: metaSource },
    userId,
  });

  await logIntakeSubmitted(createdJobId);

  if (scheduled_date) {
    await insertJobEvent({
      supabase,
      jobId: createdJobId,
      event_type: "scheduled",
      meta: {
        scheduled_date,
        window_start: window_start ?? null,
        window_end: window_end ?? null,
        source: "create",
      },
      userId,
    });
    await sendCustomerScheduledEmailForJob({ supabase, jobId: createdJobId });
    await sendContractorScheduledEmailForJob({ supabase, jobId: createdJobId });
  }
  } else {
    await runBestEffortPostCreateStep("contractor_job_created_event", async () => {
      await insertJobEvent({
        supabase,
        jobId: createdJobId,
        event_type: "contractor_job_created",
        meta: {
          source: "contractor_portal",
          next_action: "review_and_schedule",
        },
        userId,
      });
    });

    await runBestEffortPostCreateStep("contractor_next_action_notification", async () => {
      await insertInternalNotificationForEvent({
        supabase,
        jobId: createdJobId,
        eventType: "contractor_job_created",
        actorUserId: userId,
      });

      await notifyInternalNextActionChanged({
        supabase,
        jobId: createdJobId,
        eventType: "contractor_job_created",
        meta: {
          next_action: "review_and_schedule",
        },
      });
    });

    await runBestEffortPostCreateStep("contractor_intake_alert_email", async () => {
      await sendInternalContractorIntakeAlertEmail({
        jobId: createdJobId,
        accountOwnerUserId: canonicalOwnerUserId,
      });
    });

    if (scheduled_date) {
      await runBestEffortPostCreateStep("contractor_schedule_updated_event", async () => {
        await insertJobEvent({
          supabase,
          jobId: createdJobId,
          event_type: "contractor_schedule_updated",
          meta: {
            source: "contractor_portal",
            scheduled_date,
            window_start: window_start ?? null,
            window_end: window_end ?? null,
          },
          userId,
        });
      });

      await runBestEffortPostCreateStep("contractor_schedule_updated_notification", async () => {
        await insertInternalNotificationForEvent({
          supabase,
          jobId: createdJobId,
          eventType: "contractor_schedule_updated",
          actorUserId: userId,
        });
      });
    }
}

  await runBestEffortPostCreateStep("job_equipment_attach", async () => {
    await insertEquipmentForJob(createdJobId);
  });

  // refresh views
  await runBestEffortPostCreateStep("revalidate_jobs_detail", async () => {
    revalidatePath(`/jobs/${createdJobId}`);
  });
  await runBestEffortPostCreateStep("revalidate_ops", async () => {
    revalidatePath(`/ops`);
  });

  if (isContractorUser) {
    await runBestEffortPostCreateStep("revalidate_portal_home", async () => {
      revalidatePath(`/portal`);
    });
    await runBestEffortPostCreateStep("revalidate_portal_job_detail", async () => {
      revalidatePath(`/portal/jobs/${createdJobId}`);
    });
    redirect(`/portal/jobs/${createdJobId}?banner=job_created`);
  }

  redirect(`/jobs/${createdJobId}?banner=job_created`);
}

const CONTRACTOR_SANDBOX_ALLOWED = new Set([
  "contractor_note",
  "contractor_correction_submission",
  "attachment_added",
  "contractor_job_created",
  "contractor_schedule_updated",
  "retest_ready_requested",
]);

function canContractorWriteEvent(event_type: string) {
  return CONTRACTOR_SANDBOX_ALLOWED.has(event_type);
}

  let followUpServiceCaseId: string | null = null;

  if (!isContractorUser && existingCustomerId && existingLocationId && relationshipAction === "create_follow_up") {
    if (!relationshipJobId) {
      throw new Error("Select an existing job before continuing.");
    }

    const relationshipAnchorJob = await loadRelationshipAnchorJob({
      jobId: relationshipJobId,
      customerId: existingCustomerId,
      locationId: existingLocationId,
      requireActive: false,
      expectedJobType: relationshipJobType,
    });

    followUpServiceCaseId = relationshipAnchorJob.service_case_id
      ? String(relationshipAnchorJob.service_case_id)
      : await ensureServiceCaseForJob({
          supabase: canonicalWriteClient,
          jobId: String(relationshipAnchorJob.id),
        });
  }

  // ---- Branch 1: existing customer + existing location ----
  if (existingCustomerId && existingLocationId) {
    const existingDuplicateId = await findExistingIntakeDuplicate({
      customerId: existingCustomerId,
      locationId: existingLocationId,
      city,
      title: titleFinal,
      scheduledDate: scheduled_date,
      windowStart: window_start,
      windowEnd: window_end,
      permitNumber: permit_number,
      jobAddress: jobAddressRaw || null,
    });
    if (existingDuplicateId) {
      redirectToCreatedJob(existingDuplicateId, "job_already_created");
    }

    const canonicalSnapshot = await loadCanonicalJobSnapshot({
      customerId: existingCustomerId,
      locationId: existingLocationId,
      fallback: {
        customer_first_name: customerFirstNameSnapshot,
        customer_last_name: customerLastNameSnapshot,
        customer_email: customerEmailSnapshot,
        customer_phone: customerPhoneSnapshot,
        job_address: jobAddressRaw || null,
        city,
      },
    });

    const created = await createJob({
      job_type: jobType,
      service_case_id: followUpServiceCaseId,
      service_case_kind,
      service_visit_type,
      service_visit_reason,
      service_visit_outcome,
      project_type: projectType,
      job_address: canonicalSnapshot.job_address,
      customer_id: existingCustomerId,
      location_id: existingLocationId,

      customer_first_name: canonicalSnapshot.customer_first_name,
      customer_last_name: canonicalSnapshot.customer_last_name,
      customer_email: canonicalSnapshot.customer_email,
      job_notes: jobNotesRaw || null,
      visit_scope_summary,
      visit_scope_items,

      title: titleFinal,
      city: canonicalSnapshot.city,
      scheduled_date,
      status,
      contractor_id: contractorIdFinal,
      permit_number,
      jurisdiction,
      permit_date,
      window_start,
      window_end,
      customer_phone: canonicalSnapshot.customer_phone,
      ops_status,

      billing_recipient: billingRecipientFinal,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
    }, {
      serviceCaseWriteClient: canonicalWriteClient,
    });

 await postCreate(created.id, followUpServiceCaseId ? "customer_follow_up" : "customer");
 return;
  }

  // Contractor proposal seam:
  // when canonical customer+location are not explicitly supplied,
  // persist intake proposal data for internal finalization instead of
  // creating canonical customer/location entities in this path.
  if (isContractorUser && (!existingCustomerId || !existingLocationId)) {
    const submittingUserId = String(userId ?? "").trim();
    const proposalContractorId = String(contractorIdFinal ?? "").trim();
    const proposalOwnerUserId = String(canonicalOwnerUserId ?? "").trim();

    if (!submittingUserId || !proposalContractorId || !proposalOwnerUserId) {
      redirect("/jobs/new?err=contractor_proposal_submit_failed");
    }

    const proposalFields = buildContractorProposalSubmissionFields({
      resolvedTitle: titleFinal,
      jobNotesRaw,
    });

    const proposalWriteClient = createAdminClient();
    const uploadedProposalFiles = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);

    function safeProposalFileName(raw: string) {
      const cleaned = String(raw ?? "").trim().replace(/[^\w.\- ()]/g, "_");
      return cleaned || "intake-upload";
    }

    const { data: proposalRow, error: proposalErr } = await proposalWriteClient
      .from("contractor_intake_submissions")
      .insert({
        account_owner_user_id: proposalOwnerUserId,
        submitted_by_user_id: submittingUserId,
        contractor_id: proposalContractorId,
        proposed_customer_first_name: customerFirstNameRaw || null,
        proposed_customer_last_name: customerLastNameRaw || null,
        proposed_customer_phone: customerPhoneRaw || null,
        proposed_customer_email: customerEmailRaw || null,
        proposed_address_line1: address_line1 || null,
        proposed_city: city || null,
        proposed_zip: zip || null,
        proposed_location_nickname: locationNickname || null,
        proposed_job_type: jobType || null,
        proposed_project_type: projectType || null,
        proposed_title: proposalFields.proposed_title,
        proposed_job_notes: proposalFields.proposed_job_notes,
        proposed_permit_number: permit_number || null,
        proposed_jurisdiction: jurisdiction || null,
        proposed_permit_date: permit_date || null,
      })
      .select("id")
      .single();

    if (proposalErr) {
      throw proposalErr;
    }

    const proposalId = String((proposalRow as any)?.id ?? "").trim();
    if (!proposalId) {
      redirect("/jobs/new?err=contractor_proposal_submit_failed");
    }

    if (proposalId) {
      const persistedAttachmentIds: string[] = [];
      const persistedStoragePaths: string[] = [];

      async function rollbackProposalOnAttachmentFailure() {
        if (persistedAttachmentIds.length > 0) {
          const { error: deleteAttachmentRowsErr } = await proposalWriteClient
            .from("attachments")
            .delete()
            .eq("entity_type", "contractor_intake_submission")
            .eq("entity_id", proposalId)
            .in("id", persistedAttachmentIds);

          if (deleteAttachmentRowsErr) {
            console.error("proposal_attachment_row_rollback_failed", {
              proposalId,
              error:
                deleteAttachmentRowsErr instanceof Error
                  ? deleteAttachmentRowsErr.message
                  : String((deleteAttachmentRowsErr as any)?.message ?? "Unknown rollback row delete error"),
            });
          }
        }

        if (persistedStoragePaths.length > 0) {
          const uniquePaths = Array.from(new Set(persistedStoragePaths));
          const { error: deleteStorageErr } = await proposalWriteClient.storage
            .from("attachments")
            .remove(uniquePaths);

          if (deleteStorageErr) {
            console.error("proposal_attachment_storage_rollback_failed", {
              proposalId,
              error:
                deleteStorageErr instanceof Error
                  ? deleteStorageErr.message
                  : String((deleteStorageErr as any)?.message ?? "Unknown rollback storage delete error"),
            });
          }
        }

        const { error: deleteProposalErr } = await proposalWriteClient
          .from("contractor_intake_submissions")
          .delete()
          .eq("id", proposalId)
          .eq("review_status", "pending");

        if (deleteProposalErr) {
          console.error("proposal_row_rollback_failed", {
            proposalId,
            error:
              deleteProposalErr instanceof Error
                ? deleteProposalErr.message
                : String((deleteProposalErr as any)?.message ?? "Unknown rollback proposal delete error"),
          });
        }
      }

      try {
        for (const file of uploadedProposalFiles) {
          const attachmentId = crypto.randomUUID();
          const safeName = safeProposalFileName(file.name);
          const storagePath = `contractor-intake/${proposalId}/${attachmentId}-${safeName}`;
          const contentType = String(file.type ?? "").trim() || "application/octet-stream";

          const buffer = Buffer.from(await file.arrayBuffer());
          const { error: uploadErr } = await proposalWriteClient.storage
            .from("attachments")
            .upload(storagePath, buffer, {
              contentType,
              upsert: false,
            });

          if (uploadErr) throw uploadErr;

          const { error: attachmentRowErr } = await proposalWriteClient.from("attachments").insert({
            id: attachmentId,
            entity_type: "contractor_intake_submission",
            entity_id: proposalId,
            bucket: "attachments",
            storage_path: storagePath,
            file_name: safeName,
            content_type: contentType,
            file_size: file.size,
            caption: null,
          });

          if (attachmentRowErr) {
            await proposalWriteClient.storage.from("attachments").remove([storagePath]);
            throw attachmentRowErr;
          }

          persistedAttachmentIds.push(attachmentId);
          persistedStoragePaths.push(storagePath);
        }
      } catch (error) {
        console.error("proposal_attachment_persist_failed", {
          proposalId,
          error: error instanceof Error ? error.message : "Unknown proposal attachment persist error",
        });
        await rollbackProposalOnAttachmentFailure();
        redirect("/jobs/new?err=contractor_proposal_submit_failed");
      }

      await createContractorIntakeProposalAwarenessNotification({
        supabase,
        contractorIntakeSubmissionId: proposalId,
        accountOwnerUserId: proposalOwnerUserId,
        actorUserId: submittingUserId,
        contractorId: proposalContractorId,
      });

      try {
        await sendInternalContractorIntakeProposalAlertEmail({
          proposalId,
          accountOwnerUserId: proposalOwnerUserId,
        });
      } catch (error) {
        console.error("proposal_internal_email_alert_failed", {
          proposalId,
          error: error instanceof Error ? error.message : "Unknown proposal alert email error",
        });
      }
    }

    revalidatePath("/ops");
    revalidatePath("/ops/notifications");
    revalidatePath("/ops/admin");
    revalidatePath("/ops/admin/contractor-intake-submissions");
    revalidatePath("/portal");
    revalidatePath("/portal/jobs");
    redirect("/jobs/new?err=contractor_proposal_submitted");
  }

  // If no service address, bounce back (your existing behavior)
  if (!address_line1) {
    redirect("/jobs/new?err=missing_address");
  }

// ---- Branch 2: existing customer + NEW location ----
if (existingCustomerId && !existingLocationId) {
  if (!address_line1) throw new Error("Service Address is required");
  if (!city) throw new Error("City is required");
  if (!zip) throw new Error("Zip is required");

  let locationIdToUse: string;

  const reusableLocation = await findReusableLocation(existingCustomerId);

  if (reusableLocation?.id) {
    locationIdToUse = reusableLocation.id;
  } else {
    const { data: location, error: locationErr } = await canonicalWriteClient
      .from("locations")
      .insert({
        customer_id: existingCustomerId,
        nickname: locationNickname,
        address_line1,
        city,
        zip,
        postal_code: zip,
        owner_user_id: canonicalOwnerUserId,
      })
      .select("id")
      .single();

    if (locationErr) throw locationErr;
    locationIdToUse = location.id;
  }

  const existingDuplicateId = await findExistingIntakeDuplicate({
    customerId: existingCustomerId,
    locationId: locationIdToUse,
    city,
    title: titleFinal,
    scheduledDate: scheduled_date,
    windowStart: window_start,
    windowEnd: window_end,
    permitNumber: permit_number,
    jobAddress: jobAddressRaw || null,
  });
  if (existingDuplicateId) {
    redirectToCreatedJob(existingDuplicateId, "job_already_created");
  }

  const canonicalSnapshot = await loadCanonicalJobSnapshot({
    customerId: existingCustomerId,
    locationId: locationIdToUse,
    fallback: {
      customer_first_name: customerFirstNameSnapshot,
      customer_last_name: customerLastNameSnapshot,
      customer_email: customerEmailSnapshot,
      customer_phone: customerPhoneSnapshot,
      job_address: jobAddressRaw || null,
      city,
    },
  });

  const created = await createJob({
    job_type: jobType,
    service_case_kind,
    service_visit_type,
    service_visit_reason,
    service_visit_outcome,
    project_type: projectType,
    job_address: canonicalSnapshot.job_address,
    customer_id: existingCustomerId,
    location_id: locationIdToUse,

    customer_first_name: canonicalSnapshot.customer_first_name,
    customer_last_name: canonicalSnapshot.customer_last_name,
    customer_email: canonicalSnapshot.customer_email,
    job_notes: jobNotesRaw || null,
    visit_scope_summary,
    visit_scope_items,

    title: titleFinal,
    city: canonicalSnapshot.city,
    scheduled_date,
    status,
    contractor_id: contractorIdFinal,
    permit_number,
    jurisdiction,
    permit_date,
    window_start,
    window_end,
    customer_phone: canonicalSnapshot.customer_phone,
    ops_status,

    billing_recipient: billingRecipientFinal,
    billing_name,
    billing_email,
    billing_phone,
    billing_address_line1,
    billing_address_line2,
    billing_city,
    billing_state,
    billing_zip,
  }, {
    serviceCaseWriteClient: canonicalWriteClient,
  });

  await postCreate(created.id, "customer_new_location");
  return;
}

// ---- Branch 3: new customer flow (duplicate-safe) ----
const { customerId, reused } = await findOrCreateCustomer({
  supabase: canonicalWriteClient,
  firstName: customerFirstNameRaw,
  lastName: customerLastNameRaw,
  phone: customerPhoneRaw,
  email: customerEmailRaw,
  ownerUserId: canonicalOwnerUserId,
});

let locationIdToUse: string;

const reusableLocation = await findReusableLocation(customerId);

if (reusableLocation?.id) {
  locationIdToUse = reusableLocation.id;
} else {
  const { data: location, error: locationErr } = await canonicalWriteClient
    .from("locations")
    .insert({
      customer_id: customerId,
      nickname: locationNickname,
      address_line1,
      city,
      zip,
      postal_code: zip,
      owner_user_id: canonicalOwnerUserId,
    })
    .select("id")
    .single();

  if (locationErr) throw locationErr;
  locationIdToUse = location.id;
}

const existingDuplicateId = await findExistingIntakeDuplicate({
  customerId,
  locationId: locationIdToUse,
  city,
  title: titleFinal,
  scheduledDate: scheduled_date,
  windowStart: window_start,
  windowEnd: window_end,
  permitNumber: permit_number,
  jobAddress: jobAddressRaw || null,
});
if (existingDuplicateId) {
  redirectToCreatedJob(existingDuplicateId, "job_already_created");
}

const canonicalSnapshot = await loadCanonicalJobSnapshot({
  customerId,
  locationId: locationIdToUse,
  fallback: {
    customer_first_name: customerFirstNameRaw || null,
    customer_last_name: customerLastNameRaw || null,
    customer_email: customerEmailRaw || null,
    customer_phone: customerPhoneRaw || null,
    job_address: jobAddressRaw || null,
    city,
  },
});

const created = await createJob({
  job_type: jobType,
  service_case_kind,
  service_visit_type,
  service_visit_reason,
  service_visit_outcome,
  project_type: projectType,
  job_address: canonicalSnapshot.job_address,
  customer_id: customerId,
  location_id: locationIdToUse,

  customer_first_name: canonicalSnapshot.customer_first_name,
  customer_last_name: canonicalSnapshot.customer_last_name,
  customer_email: canonicalSnapshot.customer_email,
  job_notes: jobNotesRaw || null,
  visit_scope_summary,
  visit_scope_items,

  title: titleFinal,
  city: canonicalSnapshot.city,
  scheduled_date,
  status,
  contractor_id: contractorIdFinal,
  permit_number,
  jurisdiction,
  permit_date,
  window_start,
  window_end,
  customer_phone: canonicalSnapshot.customer_phone,
  ops_status,

  billing_recipient: billingRecipientFinal,
  billing_name,
  billing_email,
  billing_phone,
  billing_address_line1,
  billing_address_line2,
  billing_city,
  billing_state,
  billing_zip,
}, {
  serviceCaseWriteClient: canonicalWriteClient,
});

const banner = reused ? "customer_reused" : "customer_created";
await postCreate(created.id, banner);
return;
}

/**
 * UPDATE: used by Edit Scheduling form on job detail page
 */
export async function advanceJobStatusFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  console.log("[ADVANCE_STATUS_ENTRY]", { jobId: id, ts: new Date().toISOString() });

  const supabase = await createClient();
  const { userId: actingUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
  });

  // ✅ Read true current status from DB (source of truth)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("status, on_the_way_at")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;

  const current = (job?.status || "open") as JobStatus;
  console.log("[ADVANCE_STATUS_DB_READ]", { jobId: id, current, on_the_way_at: job?.on_the_way_at ?? null });

  const nextMap: Record<JobStatus, JobStatus> = {
    open: "on_the_way",
    on_the_way: "in_process",
    in_process: "completed",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };

  const next = nextMap[current];
  console.log("[ADVANCE_STATUS_COMPUTED]", { jobId: id, current, next });

  // ECC guard:
  // do not allow status flow to move into completed unless at least one
  // completed ECC test run has a real result.
  if (next === "completed") {
    const { data: jt, error: jtErr } = await supabase
      .from("jobs")
      .select("job_type")
      .eq("id", id)
      .single();

    if (jtErr) throw jtErr;

    if ((jt?.job_type ?? "").toLowerCase() === "ecc") {
      const { data: runs, error: runErr } = await supabase
        .from("ecc_test_runs")
        .select("id, is_completed, computed_pass, override_pass")
        .eq("job_id", id)
        .eq("is_completed", true);

      if (runErr) throw runErr;

      const hasMeaningfulCompletedRun = (runs ?? []).some((r: any) => {
        if (!r?.is_completed) return false;
        if (r?.override_pass === true || r?.override_pass === false) return true;
        if (r?.computed_pass === true || r?.computed_pass === false) return true;
        return false;
      });

      if (!hasMeaningfulCompletedRun) {
        console.log("[ADVANCE_STATUS_REDIRECT]", { jobId: id, reason: "ecc_test_required", current, next });
        redirect(`/jobs/${id}?notice=ecc_test_required`);
      }
    }
  }

    // ✅ stamp only first time entering on_the_way
  if (next === "on_the_way" && !job?.on_the_way_at) {
    console.log("[ADVANCE_STATUS_BRANCH]", { jobId: id, branch: "on_the_way_stamp", current, next });
    const autoScheduleConfirmed =
      String(formData.get("auto_schedule_confirmed") || "").trim() === "1";

    const { data: scheduleSnapshot, error: scheduleErr } = await supabase
      .from("jobs")
      .select("scheduled_date, window_start, window_end")
      .eq("id", id)
      .single();

    if (scheduleErr) throw scheduleErr;

    const hasFullSchedule =
      !!scheduleSnapshot?.scheduled_date &&
      !!scheduleSnapshot?.window_start &&
      !!scheduleSnapshot?.window_end;

    const now = new Date();

    const toLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const toLocalTime = (d: Date) => {
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    };

    const plusTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (!hasFullSchedule && !autoScheduleConfirmed) {
      console.log("[ADVANCE_STATUS_REDIRECT]", { jobId: id, reason: "schedule_required", current, next, hasFullSchedule });
      redirect(`/jobs/${id}?tab=${String(formData.get("tab") || "info")}&schedule_required=1`);
    }

    // PH2-D: resolve acting internal user before any DB write.
    // Fails fast with an auth error if the session is not an active internal user.
    // PH2-D refinement: ensure staffing before status update so assignment
    // failures cannot leave the job advanced without attribution.
    const actingAssignment = await ensureActiveAssignmentForUser({
      supabase,
      jobId: id,
      userId: actingUserId,
      actorUserId: actingUserId,
    });

    const updatePayload: Record<string, any> = {
      status: "on_the_way",
      on_the_way_at: now.toISOString(),
    };

    if (!hasFullSchedule && autoScheduleConfirmed) {
      updatePayload.scheduled_date = toLocalDate(now);
      updatePayload.window_start = toLocalTime(now);
      updatePayload.window_end = toLocalTime(plusTwoHours);
    }

    const { data: onTheWayApplied, error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", current)
      .is("on_the_way_at", null)
      .select("id")
      .maybeSingle();

    if (updErr) throw updErr;

    console.log("[ADVANCE_STATUS_UPDATED]", { jobId: id, branch: "on_the_way_stamp", applied: !!onTheWayApplied?.id, returnedId: onTheWayApplied?.id ?? null });

    // Concurrency hardening: if another request already advanced this job,
    // do not emit duplicate transition events on this stale request.
    if (!onTheWayApplied?.id) {
      console.log("[ADVANCE_STATUS_REDIRECT]", { jobId: id, reason: "status_already_updated", branch: "on_the_way_stamp", current, next });
      revalidatePath(`/jobs/${id}`);
      revalidatePath(`/jobs`);
      revalidatePath(`/ops`);
      revalidatePath(`/portal`);
      revalidatePath(`/portal/jobs/${id}`);
      redirect(`/jobs/${id}?banner=status_already_updated`);
    }

    // Diagnostic re-read: confirm DB write persisted before event inserts.
    const { data: rereadOtw } = await supabase.from("jobs").select("status").eq("id", id).single();
    console.log("[ADVANCE_STATUS_REREAD]", { jobId: id, branch: "on_the_way_stamp", status_after_update: rereadOtw?.status ?? null });

    try {
      // Keep on_my_way close to user intent in event order.
      // assignment_added (if any) -> on_my_way -> schedule_updated (if any)
      await insertJobEvent({
        supabase,
        jobId: id,
        event_type: "on_my_way",
        meta: {
          ...buildMovementEventMeta({
            from: current,
            to: next,
            trigger: "field_action",
            sourceAction: "advance_job_status_from_form",
          }),
          auto_schedule_applied: !hasFullSchedule && autoScheduleConfirmed,
          actor_user_id: actingUserId,
          assignment_id: actingAssignment.id,
        },
        userId: actingUserId,
      });

      if (!hasFullSchedule && autoScheduleConfirmed) {
        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: "schedule_updated",
          meta: {
            before: {
              scheduled_date: scheduleSnapshot?.scheduled_date ?? null,
              window_start: scheduleSnapshot?.window_start ?? null,
              window_end: scheduleSnapshot?.window_end ?? null,
            },
            after: {
              scheduled_date: updatePayload.scheduled_date,
              window_start: updatePayload.window_start,
              window_end: updatePayload.window_end,
            },
            source: "auto_schedule_on_the_way",
          },
        });
      }
    } catch (ancillaryError) {
      console.error("[FIELD_STATUS_POST_UPDATE_FAILED]", {
        jobId: id,
        fromStatus: current,
        toStatus: next,
        stage: "on_the_way_post_update",
        error: ancillaryError instanceof Error ? ancillaryError.message : String(ancillaryError),
        stack: ancillaryError instanceof Error ? ancillaryError.stack : undefined,
      });
    }
    console.log("[ADVANCE_STATUS_OTW_BRANCH_END]", { jobId: id, note: "on_the_way branch completed — no redirect issued from this code path" });
  } else {
    console.log("[ADVANCE_STATUS_BRANCH]", { jobId: id, branch: "else", current, next });
    const updatePayload: Record<string, any> = { status: next };
    let completedJobType: string | null = null;
    let completedAt: string | null = null;
    let beforeOpsStatus: string | null = null;
    let beforeFieldComplete = false;
    let beforeFieldCompleteAt: string | null = null;

    // ✅ When field marks completed, push into Data Entry queue
    // When field marks completed, push into the correct Ops queue
    if (next === "completed") {
      const { data: jt, error: jtErr } = await supabase
        .from("jobs")
        .select("job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, scheduled_date, window_start, window_end")
        .eq("id", id)
        .single();

      if (jtErr) throw jtErr;

      const jobType = String(jt?.job_type ?? "").trim().toLowerCase();
      completedJobType = jobType;
      completedAt = new Date().toISOString();
      beforeOpsStatus = jt?.ops_status ?? null;
      beforeFieldComplete = Boolean(jt?.field_complete);
      beforeFieldCompleteAt = jt?.field_complete_at ?? null;

      if (jobType === "ecc") {
        updatePayload.field_complete = true;
        updatePayload.field_complete_at = completedAt;
      } else {
        updatePayload.field_complete = true;
        updatePayload.field_complete_at = completedAt;
        updatePayload.ops_status = "invoice_required";
      }
    }

    const { data: transitionApplied, error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", current)
      .select("id")
      .maybeSingle();

    if (updErr) throw updErr;

    console.log("[ADVANCE_STATUS_UPDATED]", { jobId: id, branch: "else", applied: !!transitionApplied?.id, returnedId: transitionApplied?.id ?? null });

    // Concurrency/no-op hardening: stale retries should not emit duplicate
    // lifecycle events when a parallel request already moved status forward.
    if (!transitionApplied?.id) {
      console.log("[ADVANCE_STATUS_REDIRECT]", { jobId: id, reason: "status_already_updated", branch: "else", current, next });
      revalidatePath(`/jobs/${id}`);
      revalidatePath(`/jobs`);
      revalidatePath(`/ops`);
      revalidatePath(`/portal`);
      revalidatePath(`/portal/jobs/${id}`);
      redirect(`/jobs/${id}?banner=status_already_updated`);
    }

    // Diagnostic re-read: confirm DB write persisted before post-update work.
    const { data: rereadElse } = await supabase.from("jobs").select("status").eq("id", id).single();
    console.log("[ADVANCE_STATUS_REREAD]", { jobId: id, branch: "else", status_after_update: rereadElse?.status ?? null });

    // ECC canonical resolution:
    // once the field lifecycle is marked complete, derive ops_status from ecc_test_runs
    if (next === "completed") {
      const { data: jt2, error: jt2Err } = await supabase
        .from("jobs")
        .select("job_type")
        .eq("id", id)
        .single();

      if (jt2Err) throw jt2Err;

      if ((jt2?.job_type ?? "").toLowerCase() === "ecc") {
        await evaluateEccOpsStatus(id);
      }
    }

    const lifecycleEventMap: Partial<Record<JobStatus, string>> = {
      on_the_way: "on_my_way",
      completed: "job_completed",
    };

    if (next === "in_process") {
      // PH2-E: person-level arrival event, additive to legacy visit-level start.
      // Order is intentional for downstream consumers: tech_arrived -> job_started.
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) throw userErr;

      const actingUserId = user?.id ?? null;

      let assignmentId: string | null = null;
      if (actingUserId) {
        const { data: activeAssignment, error: assignmentErr } = await supabase
          .from("job_assignments")
          .select("id")
          .eq("job_id", id)
          .eq("user_id", actingUserId)
          .eq("is_active", true)
          .maybeSingle();

        if (assignmentErr) throw assignmentErr;
        assignmentId = String(activeAssignment?.id ?? "").trim() || null;
      }

      const movementMeta = buildMovementEventMeta({
        from: current,
        to: next,
        trigger: "field_action",
        sourceAction: "advance_job_status_from_form",
      });

      const transitionMeta = {
        ...movementMeta,
        actor_user_id: actingUserId,
        ...(assignmentId ? { assignment_id: assignmentId } : {}),
      };

      try {
        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: "tech_arrived",
          meta: transitionMeta,
          userId: actingUserId,
        });

        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: "job_started",
          meta: transitionMeta,
          userId: actingUserId,
        });
      } catch (ancillaryError) {
        console.error("[FIELD_STATUS_POST_UPDATE_FAILED]", {
          jobId: id,
          fromStatus: current,
          toStatus: next,
          stage: "in_process_event_insert",
          error: ancillaryError instanceof Error ? ancillaryError.message : String(ancillaryError),
          stack: ancillaryError instanceof Error ? ancillaryError.stack : undefined,
        });
      }
    } else {
      const lifecycleEventType = lifecycleEventMap[next];

      if (lifecycleEventType) {
        if (lifecycleEventType === "job_completed") {
          const {
            data: { user },
            error: userErr,
          } = await supabase.auth.getUser();

          if (userErr) throw userErr;

          const actingUserId = user?.id ?? null;

          let assignmentId: string | null = null;
          if (actingUserId) {
            const { data: activeAssignment, error: assignmentErr } = await supabase
              .from("job_assignments")
              .select("id")
              .eq("job_id", id)
              .eq("user_id", actingUserId)
              .eq("is_active", true)
              .maybeSingle();

            if (assignmentErr) throw assignmentErr;
            assignmentId = String(activeAssignment?.id ?? "").trim() || null;
          }

          try {
            await insertJobEvent({
              supabase,
              jobId: id,
              event_type: lifecycleEventType,
              meta: {
                ...buildMovementEventMeta({
                  from: current,
                  to: next,
                  trigger: "field_action",
                  sourceAction: "advance_job_status_from_form",
                }),
                actor_user_id: actingUserId,
                ...(assignmentId ? { assignment_id: assignmentId } : {}),
              },
              userId: actingUserId,
            });

            if (completedJobType && completedJobType !== "ecc") {
              await insertJobEvent({
                supabase,
                jobId: id,
                event_type: "ops_update",
                meta: {
                  changes: [
                    { field: "status", from: current, to: next },
                    { field: "field_complete", from: beforeFieldComplete, to: true },
                    { field: "field_complete_at", from: beforeFieldCompleteAt, to: completedAt },
                    { field: "ops_status", from: beforeOpsStatus, to: "invoice_required" },
                  ],
                  source: "advance_job_status_from_form",
                  actor_user_id: actingUserId,
                  ...(assignmentId ? { assignment_id: assignmentId } : {}),
                },
                userId: actingUserId,
              });
            }
          } catch (ancillaryError) {
            console.error("[FIELD_STATUS_POST_UPDATE_FAILED]", {
              jobId: id,
              fromStatus: current,
              toStatus: next,
              stage: "job_completed_event_insert",
              error: ancillaryError instanceof Error ? ancillaryError.message : String(ancillaryError),
              stack: ancillaryError instanceof Error ? ancillaryError.stack : undefined,
            });
          }
        } else {
          try {
            await insertJobEvent({
              supabase,
              jobId: id,
              event_type: lifecycleEventType,
              meta: buildMovementEventMeta({
                from: current,
                to: next,
                trigger: "field_action",
                sourceAction: "advance_job_status_from_form",
              }),
            });
          } catch (ancillaryError) {
            console.error("[FIELD_STATUS_POST_UPDATE_FAILED]", {
              jobId: id,
              fromStatus: current,
              toStatus: next,
              stage: "lifecycle_event_insert",
              error: ancillaryError instanceof Error ? ancillaryError.message : String(ancillaryError),
              stack: ancillaryError instanceof Error ? ancillaryError.stack : undefined,
            });
          }
        }
      }
    }

    // Retest-specific lifecycle breadcrumb:
    // if this job is a linked retest child and it enters in_process,
    // log retest_started on BOTH the child and the parent.
    const { data: linkedJob, error: linkedErr } = await supabase
      .from("jobs")
      .select("parent_job_id")
      .eq("id", id)
      .maybeSingle();

    if (linkedErr) throw linkedErr;

    const parentJobId = String(linkedJob?.parent_job_id ?? "").trim();

    if (parentJobId && next === "in_process") {
      try {
        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: "retest_started",
          meta: { parent_job_id: parentJobId },
        });

        await insertJobEvent({
          supabase,
          jobId: parentJobId,
          event_type: "retest_started",
          meta: { child_job_id: id },
        });
      } catch (ancillaryError) {
        console.error("[FIELD_STATUS_POST_UPDATE_FAILED]", {
          jobId: id,
          fromStatus: current,
          toStatus: next,
          stage: "retest_started_event_insert",
          error: ancillaryError instanceof Error ? ancillaryError.message : String(ancillaryError),
          stack: ancillaryError instanceof Error ? ancillaryError.stack : undefined,
        });
      }
    }
  }

  console.log("[ADVANCE_STATUS_PREREVALIDATE]", { jobId: id, current, next });
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  console.log("[ADVANCE_STATUS_REDIRECT]", { jobId: id, reason: "status_updated", current, next });
  redirect(`/jobs/${id}?banner=status_updated&refresh=${Date.now()}`);
}

export async function revertOnTheWayFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();
  const tab = String(formData.get("tab") || "info").trim() || "info";

  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();

  const redirectToJob = (banner: string) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("banner", banner);
    redirect(`/jobs/${id}?${params.toString()}`);
  };

  const { userId: actingUserId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
    onUnauthorized: () => redirect(`/jobs/${id}?notice=not_authorized`),
  });

  const eligibility = await getOnTheWayUndoEligibilityInternal({
    supabase,
    jobId: id,
  });

  if (!eligibility.eligible || !eligibility.onMyWayEventId) {
    revalidatePath(`/jobs/${id}`);
    redirectToJob("on_the_way_revert_unavailable");
  }

  const { data: revertedJob, error: revertErr } = await supabase
    .from("jobs")
    .update({
      status: "open",
      on_the_way_at: null,
    })
    .eq("id", id)
    .eq("status", "on_the_way")
    .not("on_the_way_at", "is", null)
    .select("id")
    .maybeSingle();

  if (revertErr) throw revertErr;

  if (!revertedJob?.id) {
    revalidatePath(`/jobs/${id}`);
    redirectToJob("on_the_way_revert_unavailable");
  }

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "on_the_way_reverted",
    meta: {
      ...buildMovementEventMeta({
        from: "on_the_way",
        to: "open",
        trigger: "undo_action",
        sourceAction: "revert_on_the_way_from_form",
      }),
      actor_user_id: actingUserId,
      reverted_event_id: eligibility.onMyWayEventId,
    },
    userId: actingUserId,
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs`);
  revalidatePath(`/ops`);
  revalidatePath(`/calendar`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  redirectToJob("on_the_way_reverted");
}


export async function updateJobScheduleFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();

  const permitNumberRaw = String(formData.get("permit_number") || "").trim();
  const permitDateRaw = String(formData.get("permit_date") || "").trim();
  const jurisdictionRaw = String(formData.get("jurisdiction") || "").trim();
  const returnToRaw = String(formData.get("return_to") || "").trim();

  function redirectToScheduleTarget(banner: string) {
    if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
      const [pathOnly, searchRaw = ""] = returnToRaw.split("?");
      const search = new URLSearchParams(searchRaw);
      search.set("banner", banner);
      redirect(`${pathOnly}?${search.toString()}`);
    }

    redirect(`/jobs/${id}?banner=${banner}`);
  }

  await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
    onUnauthorized: () => redirectToScheduleTarget("not_authorized"),
  });

  // Read prior scheduling snapshot so we can log changes
  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "scheduled_date, window_start, window_end, ops_status, job_type, status, field_complete, permit_number, jurisdiction, permit_date, pending_info_reason, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", id)
    .single();

  if (beforeErr) throw beforeErr;

  // Check for explicit unschedule BEFORE validation to avoid crash on invalid form values
  const unscheduleRequested = String(formData.get("unschedule") || "").trim() === "1";

  // Canonical scheduling + ops_status logic (NO Date parsing)
  // SAFETY: Skip validation if unschedule is explicit; nulling is safe regardless of form values
  let derived;
  let scheduled_date: string | null;
  let window_start: string | null;
  let window_end: string | null;
  let ops_status: string;

  if (unscheduleRequested) {
    // Unschedule path: bypass validation, set all to null directly
    scheduled_date = null;
    window_start = null;
    window_end = null;
    ops_status = "need_to_schedule";
  } else {
    // Schedule path: validate form values
    derived = deriveScheduleAndOps(formData);
    scheduled_date = derived.scheduled_date;
    window_start = derived.window_start;
    window_end = derived.window_end;
    ops_status = derived.ops_status;
  }

  let next_ops_status = ops_status;
  const isUnscheduledAfterSave = !scheduled_date && !window_start && !window_end;

  // Policy: explicit Unschedule always returns the job to the call list.
  if (unscheduleRequested && isUnscheduledAfterSave) {
    next_ops_status = "need_to_schedule";
  }

  const isEccCompletedOrFieldComplete =
    String(before?.job_type ?? "").toLowerCase() === "ecc" &&
    (Boolean(before?.field_complete) || String(before?.status ?? "").toLowerCase() === "completed");

  if (isEccCompletedOrFieldComplete && next_ops_status === "scheduled") {
    next_ops_status = String(before?.ops_status ?? "").trim() || next_ops_status;
  }

  const isServiceJob = String(before?.job_type ?? "").toLowerCase() === "service";

  const permit_number = isServiceJob ? null : (permitNumberRaw || null);
  const jurisdiction = isServiceJob ? null : (jurisdictionRaw || null);
  const permit_date = isServiceJob ? null : (permitDateRaw || null);

  const didPermitFieldsChange =
    normalizeScheduleValue(before?.permit_number) !== normalizeScheduleValue(permit_number) ||
    normalizeScheduleValue(before?.jurisdiction) !== normalizeScheduleValue(jurisdiction) ||
    normalizeScheduleValue(before?.permit_date) !== normalizeScheduleValue(permit_date);

  const didScheduleFieldsChange =
    normalizeScheduleValue(before?.scheduled_date) !== normalizeScheduleValue(scheduled_date) ||
    normalizeScheduleValue(before?.window_start) !== normalizeScheduleValue(window_start) ||
    normalizeScheduleValue(before?.window_end) !== normalizeScheduleValue(window_end);

  if (!didScheduleFieldsChange && !didPermitFieldsChange) {
    revalidatePath(`/jobs/${id}`);
    revalidatePath(`/calendar`);
    redirectToScheduleTarget("schedule_already_saved");
  }

  const nextLifecycleStatus =
    unscheduleRequested && isUnscheduledAfterSave ? "open" : undefined;
  const nextOnTheWayAt =
    unscheduleRequested && isUnscheduledAfterSave ? null : undefined;

  await updateJob({
    id,
    scheduled_date,
    window_start,
    window_end,
    status: nextLifecycleStatus,
    on_the_way_at: nextOnTheWayAt,
    permit_number,
    jurisdiction,
    permit_date,
  });

  try {
    await evaluateJobOpsStatus(id);
  } catch {
    redirectToScheduleTarget("schedule_saved_ops_eval_failed");
  }

  const hadPendingInfoSignal =
    String(before?.ops_status ?? "").trim().toLowerCase() === "pending_info" ||
    String(before?.pending_info_reason ?? "").trim().length > 0;
  const hasPermitNumber = String(permit_number ?? "").trim().length > 0;

  if (hadPendingInfoSignal && hasPermitNumber) {
    await releasePendingInfoAndRecompute(id, "auto_release_on_permit_save");
  }

  const beforePermitNumber = String(before?.permit_number ?? "").trim();
  const afterPermitNumber = String(permit_number ?? "").trim();

  if (beforePermitNumber !== afterPermitNumber) {
    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "permit_info_updated",
      meta: {
        before: {
          permit_number: before?.permit_number ?? null,
          jurisdiction: before?.jurisdiction ?? null,
          permit_date: before?.permit_date ?? null,
        },
        after: {
          permit_number,
          jurisdiction,
          permit_date,
        },
      },
    });
  }

  const wasScheduled =
    !!before?.scheduled_date || !!before?.window_start || !!before?.window_end;
  const isScheduled = !!scheduled_date || !!window_start || !!window_end;
  const shouldAutoReleaseHold =
    String(before?.ops_status ?? "").trim().toLowerCase() === "on_hold" &&
    isScheduled &&
    !unscheduleRequested;
  const event_type = unscheduleRequested
    ? "unscheduled"
    : !wasScheduled && isScheduled
      ? "scheduled"
      : wasScheduled && !isScheduled
      ? "unscheduled"
      : "schedule_updated";

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type,
    meta: {
      before: {
        scheduled_date: before?.scheduled_date ?? null,
        window_start: before?.window_start ?? null,
        window_end: before?.window_end ?? null,
        ops_status: before?.ops_status ?? null,
        status: before?.status ?? null,
        permit_number: before?.permit_number ?? null,
        jurisdiction: before?.jurisdiction ?? null,
        permit_date: before?.permit_date ?? null,
      },
      after: {
        scheduled_date,
        window_start,
        window_end,
        ops_status: next_ops_status,
        status: nextLifecycleStatus ?? before?.status ?? null,
        on_the_way_at: nextOnTheWayAt,
        permit_number,
        jurisdiction,
        permit_date,
      },
    },
  });

  if (shouldAutoReleaseHold) {
    const { releaseAndReevaluate } = await import("@/lib/actions/job-ops-actions");
    await releaseAndReevaluate(id, "auto_release_on_schedule_save");
  }

  if (event_type === "scheduled") {
    await sendCustomerScheduledEmailForJob({ supabase, jobId: id });
    await sendContractorScheduledEmailForJob({ supabase, jobId: id });
  }

  if (event_type === "schedule_updated" && didScheduleFieldsChange && isScheduled) {
    const hasPriorContractorScheduleEmail = await hasOperationalEmailHistory({
      supabase,
      jobId: id,
      notificationType: "contractor_job_scheduled_email",
    });

    if (hasPriorContractorScheduleEmail) {
      await sendContractorScheduledEmailForJob({ supabase, jobId: id });
    }
  }

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/ops`);
  revalidatePath(`/calendar`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  redirectToScheduleTarget("schedule_saved");
}



export async function markJobFailedFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();
  await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
  });

  await updateJob({ id, status: "failed" });
  redirect(`/jobs/${id}`);
}

/**
 * UPDATE: used by Customer + Notes edit form on job detail page
 */
export async function updateJobCustomerFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();
  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();
  await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
  });

  const customer_first_name = String(formData.get("customer_first_name") || "").trim() || null;
  const customer_last_name = String(formData.get("customer_last_name") || "").trim() || null;
  const customer_email = String(formData.get("customer_email") || "").trim() || null;
  const customer_phone = String(formData.get("customer_phone") || "").trim() || null;
  const job_notes = String(formData.get("job_notes") || "").trim() || null;

  await updateJob({
    id,
    customer_first_name,
    customer_last_name,
    customer_email,
    customer_phone,
    job_notes,
  });

  redirect(`/jobs/${id}`);
}

// Job timeline event writers: public_note + internal_note
export async function addPublicNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(`/jobs/${jobId}?tab=${tab}&banner=note_add_failed`);
  }

  const supabase = await createClient();
  const { userId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  const { data: recentDuplicate, error: duplicateErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "public_note")
    .eq("user_id", userId)
    .contains("meta", { note })
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .maybeSingle();

  if (duplicateErr) throw duplicateErr;
  if (recentDuplicate?.id) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/ops`);
    redirect(`/jobs/${jobId}?tab=${tab}&banner=note_already_added`);
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "public_note",
    meta: { note },
    userId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=${tab}&banner=note_added`);
}

export async function addInternalNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";
  const context = String(formData.get("context") || "").trim() || null;
  const anchorEventId = String(formData.get("anchor_event_id") || "").trim() || null;
  const anchorEventType = String(formData.get("anchor_event_type") || "").trim() || null;

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(`/jobs/${jobId}?tab=${tab}&banner=note_add_failed`);
  }

  const supabase = await createClient();
  const { userId } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  const hasContextFields = !!(context || anchorEventId || anchorEventType);
  const meta = hasContextFields
    ? {
        note,
        ...(context ? { context } : {}),
        ...(anchorEventId ? { anchor_event_id: anchorEventId } : {}),
        ...(anchorEventType ? { anchor_event_type: anchorEventType } : {}),
      }
    : { note };

  const duplicateMeta: Record<string, unknown> = { note };
  if (context) duplicateMeta.context = context;
  if (anchorEventId) duplicateMeta.anchor_event_id = anchorEventId;
  if (anchorEventType) duplicateMeta.anchor_event_type = anchorEventType;

  const { data: recentDuplicate, error: duplicateErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "internal_note")
    .eq("user_id", userId)
    .contains("meta", duplicateMeta)
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .maybeSingle();

  if (duplicateErr) throw duplicateErr;

  const isFollowUpContext = context === "contractor_report_review";

  if (recentDuplicate?.id) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/ops`);
    redirect(
      `/jobs/${jobId}?tab=${tab}&banner=${
        isFollowUpContext ? "follow_up_note_already_added" : "note_already_added"
      }`
    );
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "internal_note",
    meta,
    userId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(
    `/jobs/${jobId}?tab=${tab}&banner=${isFollowUpContext ? "follow_up_note_added" : "note_added"}`
  );
}

export async function completeDataEntryFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const invoice = String(formData.get("invoice_number") || "").trim() || null;
  const completedAt = new Date().toISOString();

  const supabase = await createClient();
  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: id,
  });
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode === "internal_invoicing") {
    redirect(`/jobs/${id}?banner=internal_invoicing_billing_pending`);
  }

  async function recordPostDataEntryOpsProjectionChange(previousOpsStatus: unknown) {
    const { data: refreshedJob, error: refreshedJobErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", id)
      .single();

    if (refreshedJobErr) throw refreshedJobErr;

    const finalOpsStatus = refreshedJob?.ops_status ?? null;

    if (finalOpsStatus === (previousOpsStatus ?? null)) {
      return;
    }

    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "ops_update",
      meta: {
        source: "job_detail_data_entry_recompute",
        changes: [{ field: "ops_status", from: previousOpsStatus ?? null, to: finalOpsStatus }],
      },
      userId: actingUserId,
    });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, invoice_number, invoice_complete, data_entry_completed_at")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;


  // Service: data entry completion = invoice sent/recorded -> closed
  const jobType = String(job?.job_type ?? "").trim().toLowerCase();

// Service closes locally after successful invoice/data entry save.
// Only ECC stays in paperwork flow.
if (jobType !== "ecc") {
  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_number: invoice,
      invoice_complete: true,
      data_entry_completed_at: completedAt,
    })
    .eq("id", id);

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "ops_update",
    meta: {
      source: "job_detail_data_entry",
      changes: [
        { field: "invoice_number", from: job?.invoice_number ?? null, to: invoice },
        { field: "invoice_complete", from: !!job?.invoice_complete, to: true },
        { field: "data_entry_completed_at", from: job?.data_entry_completed_at ?? null, to: completedAt },
      ],
    },
    userId: actingUserId,
  });

  if (jobType === "service") {
    const previousOpsStatus = job?.ops_status ?? null;

    if (String(previousOpsStatus ?? "").trim().toLowerCase() !== "closed") {
      await forceSetOpsStatus(id, "closed");

      await insertJobEvent({
        supabase,
        jobId: id,
        event_type: "ops_update",
        meta: {
          source: "job_detail_data_entry_closeout",
          changes: [
            { field: "ops_status", from: previousOpsStatus, to: "closed" },
          ],
        },
        userId: actingUserId,
      });
    }

    redirect(`/jobs/${id}`);
  }

  await evaluateJobOpsStatus(id);
  await healStalePaperworkOpsStatus(id);
  await recordPostDataEntryOpsProjectionChange(job?.ops_status ?? null);

  redirect(`/jobs/${id}`);
}

  // ECC: data entry completion should NOT close the job
  // ECC must go: paperwork_required -> (paperwork complete) -> closed
  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_number: invoice,
      data_entry_completed_at: completedAt,
    })
    .eq("id", id);

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "ops_update",
    meta: {
      source: "job_detail_data_entry",
      changes: [
        { field: "invoice_number", from: job?.invoice_number ?? null, to: invoice },
        { field: "data_entry_completed_at", from: job?.data_entry_completed_at ?? null, to: completedAt },
      ],
    },
    userId: actingUserId,
  });

  await evaluateJobOpsStatus(id);
  await healStalePaperworkOpsStatus(id);
  await recordPostDataEntryOpsProjectionChange(job?.ops_status ?? null);

  redirect(`/jobs/${id}`);
}
// ✅ Create a Retest job linked to a parent (failed) job via jobs.parent_job_id
export async function createRetestJobFromForm(formData: FormData) {
  "use server";

  const copyEquipment = String(formData.get("copy_equipment") || "") === "1";
  const parentJobId = String(formData.get("parent_job_id") || "").trim();
  if (!parentJobId) throw new Error("Missing parent_job_id");

  const supabase = await createClient();
  await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: parentJobId,
  });

  // 1) Load parent job
  const { data: parentData, error: parentErr } = await supabase
    .from("jobs")
      .select(
      [
        "id",
        "status",
        "ops_status",
        "service_case_id",
        "job_type",
        "project_type",
        "title",
        "city",
        "customer_id",
        "location_id",
        "contractor_id",
        "permit_number",
        "customer_phone",
        "customer_first_name",
        "customer_last_name",
        "customer_email",
        "job_address",
        "billing_recipient",
        "billing_name",
        "billing_email",
        "billing_phone",
        "billing_address_line1",
        "billing_address_line2",
        "billing_city",
        "billing_state",
        "billing_zip",
      ].join(",")
    )
    .eq("id", parentJobId)
    .is("deleted_at", null)
    .single();

  if (parentErr) throw parentErr;
  const parent = parentData as any;

  const parentJobType = String(parent?.job_type ?? "").trim().toLowerCase();
  const parentOpsStatus = String(parent?.ops_status ?? "").trim().toLowerCase();

  if (parentJobType !== "ecc") {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_not_eligible`);
  }

  if (!["failed", "retest_needed", "pending_office_review"].includes(parentOpsStatus)) {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_not_eligible`);
  }

  const { data: activeRetestChild, error: activeChildErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("parent_job_id", parentJobId)
    .is("deleted_at", null)
    .neq("ops_status", "closed")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeChildErr) throw activeChildErr;

  if (activeRetestChild?.id) {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_already_exists`);
  }

  // 2) Create retest job (unscheduled by default)
  const retestTitle = `Retest — ${parent?.title ?? "Job"}`;

    const inheritedServiceCaseId =
    parent?.service_case_id
      ? String(parent.service_case_id)
      : await ensureServiceCaseForJob({
          supabase,
          jobId: parentJobId,
        });

  const child = await createJob({
    parent_job_id: parentJobId,
    service_case_id: inheritedServiceCaseId,

    job_type: parent?.job_type ?? "ecc",
    project_type: parent?.project_type ?? "alteration",

    title: retestTitle,
    city: parent?.city ?? "",

    customer_id: parent?.customer_id ?? null,
    location_id: parent?.location_id ?? null,
    contractor_id: parent?.contractor_id ?? null,

    scheduled_date: null,
    window_start: null,
    window_end: null,

    status: "open",
    ops_status: "need_to_schedule",

    permit_number: parent?.permit_number ?? null,
    customer_phone: parent?.customer_phone ?? null,
    customer_first_name: parent?.customer_first_name ?? null,
    customer_last_name: parent?.customer_last_name ?? null,
    customer_email: parent?.customer_email ?? null,
    job_address: parent?.job_address ?? null,

    billing_recipient: parent?.billing_recipient ?? null,
    billing_name: parent?.billing_name ?? null,
    billing_email: parent?.billing_email ?? null,
    billing_phone: parent?.billing_phone ?? null,
    billing_address_line1: parent?.billing_address_line1 ?? null,
    billing_address_line2: parent?.billing_address_line2 ?? null,
    billing_city: parent?.billing_city ?? null,
    billing_state: parent?.billing_state ?? null,
    billing_zip: parent?.billing_zip ?? null,
  });

      // 3) Timeline events on BOTH jobs
  try {
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_created",
      meta: { child_job_id: child.id },
    });

    await insertJobEvent({
      supabase,
      jobId: child.id,
      event_type: "retest_created",
      meta: { parent_job_id: parentJobId },
    });
  } catch (e) {
    console.error("retest_created job_events insert failed:", e);
  }

  

  // ✅ Optional: copy systems + equipment from original → retest
  if (copyEquipment) {
    // 1) Fetch parent systems
    const { data: parentSystems, error: sysErr } = await supabase
      .from("job_systems")
      .select("id, name, created_at")
      .eq("job_id", parentJobId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (sysErr) throw sysErr;

    // 2) Insert child systems (same names)
    const systemIdMap = new Map<string, string>(); // parentSystemId → childSystemId

    if (parentSystems?.length) {
      for (const parentSys of parentSystems) {
        const { data: newSystem, error: newSysErr } = await supabase
          .from("job_systems")
          .insert({
            job_id: child.id,
            name: parentSys?.name ?? "System",
          })
          .select("id")
          .single();

        if (newSysErr) throw newSysErr;

        if (parentSys?.id && newSystem?.id) {
          systemIdMap.set(String(parentSys.id), String(newSystem.id));
        }
      }
    }

    // 3) Fetch parent equipment
    const { data: parentEquip, error: eqErr } = await supabase
      .from("job_equipment")
      .select(
        [
          "equipment_role",
          "manufacturer",
          "model",
          "model_number",
          "serial",
          "tonnage",
          "refrigerant_type",
          "notes",
          "system_location",
          "system_id",
        ].join(",")
      )
      .eq("job_id", parentJobId);

    if (eqErr) throw eqErr;

    // 4) Insert child equipment (remap system_id)
    if (parentEquip?.length) {
      const insertEquip = parentEquip.map((e: any) => {
        const mappedSystemId =
          e.system_id ? systemIdMap.get(String(e.system_id)) ?? null : null;

        return {
          job_id: child.id,
          // equipment_role is NOT NULL in your schema; enforce a safe value
          equipment_role: String(e.equipment_role || "other"),
          manufacturer: e.manufacturer ?? null,
          model: e.model ?? null,
          model_number: e.model_number ?? null,
          serial: e.serial ?? null,
          tonnage: e.tonnage ?? null,
          refrigerant_type: e.refrigerant_type ?? null,
          notes: e.notes ?? null,
          system_location: e.system_location ?? null,
          // system_id is NOT NULL in your schema; only insert rows that have a mapped system_id
          system_id: mappedSystemId,
        };
      }).filter((row: any) => row.system_id); // enforce NOT NULL system_id

      if (insertEquip.length) {
        const { error: insEqErr } = await supabase
          .from("job_equipment")
          .insert(insertEquip);

        if (insEqErr) throw insEqErr;
      }
    }

    await insertJobEvent({
      supabase,
      jobId: child.id,
      event_type: "equipment_copied",
      meta: { from_job_id: parentJobId },
    });
  }

  revalidatePath(`/jobs/${parentJobId}`);
  revalidatePath(`/jobs/${child.id}`);
  revalidatePath(`/ops`);

  redirect(`/jobs/${child.id}?tab=ops`);
}

/**
 * CANCEL JOB: Sets status = "cancelled" and writes job_event
 * Used from job detail page to mark a job as cancelled
 */
export async function cancelJobFromForm(formData: FormData) {
  "use server";
  // Only accept job_id for safety
  const id = String(formData.get("job_id") || "").trim();
  if (!id) throw new Error("Job ID is required (job_id missing)");

  const supabase = await createClient();
  const { userId } = await requireInternalRole("admin", { supabase });

  // Read current job state
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, status, ops_status")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;
  if (!job) throw new Error("Job not found");

  const previousStatus = job.status;
  const previousOpsStatus = job.ops_status;

  // Update status to cancelled
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      status: "cancelled",
    })
    .eq("id", id);

  if (updateErr) throw updateErr;

  // Record the cancellation event
  const { error: eventErr } = await supabase
    .from("job_events")
    .insert({
      job_id: id,
      event_type: "job_cancelled",
      message: "Job cancelled",
      meta: {
        from_status: previousStatus,
        from_ops_status: previousOpsStatus,
        cancelled_at: new Date().toISOString(),
        user_id: userId,
      },
      user_id: userId,
    });

  if (eventErr) throw eventErr;

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs`);
  revalidatePath(`/ops`);
  revalidatePath(`/ops/field`);
  revalidatePath(`/calendar`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  redirect(`/jobs/${id}?banner=job_cancelled`);
}
