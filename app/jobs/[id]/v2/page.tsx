// app/jobs/[id]/v2/page — Desktop Job Detail V2
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import {
  resolveJobDetailActor,
  loadScopedInternalJobDetailReadBoundaryOutcome,
} from "@/lib/actions/internal-job-detail-read-boundary";
import {
  getContractors,
  archiveJobFromForm,
  createNextServiceVisitFromForm,
  createCallbackVisitFromForm,
  updateJobScheduleFromForm,
  addInternalNoteFromForm,
  addPublicNoteFromForm,
  updateJobVisitScopeFromForm,
  updateJobTitleFromForm,
  changeJobServiceLocationFromForm,
  confirmEccRetestReadyFromForm,
  scheduleRetestNowFromForm,
  createRetestJobFromForm,
} from "@/lib/actions/job-actions";
import {
  markJobFieldCompleteFromForm,
  markJobPartsNeededFromForm,
  markJobApprovalNeededFromForm,
  markJobUnableToCompleteFromForm,
  markServicePartOrderedFromForm,
  markServicePartArrivedFromForm,
  markServiceApprovalReceivedFromForm,
  markEccPermitAvailableFromForm,
  markCertsCompleteFromForm,
  markInvoiceCompleteFromForm,
  releaseAndReevaluateFromForm,
  updateJobOpsDetailsFromForm,
  updateJobOpsFromForm,
} from "@/lib/actions/job-ops-actions";
import { createInternalInvoiceDraftFromForm } from "@/lib/actions/internal-invoice-actions";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { formatRecentAttemptDateTime } from "@/lib/ops/recent-attempt-display";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import DeferredAddAssigneeForm from "../_components/DeferredAddAssigneeForm";
import ChangeServiceLocationForm from "../_components/ChangeServiceLocationForm";
import { getCloseoutNeeds } from "@/lib/utils/closeout";
import { getActiveWaitingState } from "@/lib/utils/ops-status";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { getInternalBusinessProfileByAccountOwnerId, resolveBillingModeByAccountOwnerId, resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveProductModeForAccountOwnerId } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";
import { buildReviewAskLinks } from "@/lib/utils/review-ask-links";
import { buildJobBillingStateReadModel, normalizeJobBillingDisposition } from "@/lib/business/job-billing-state";
import { listJobEquipmentLabelPhotoImages } from "@/lib/jobs/refrigerant-charge-evidence";
import { sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";
import { formatJobDisplayReference } from "@/lib/utils/display-references";
import { buildEquipmentIdentityLabel } from "@/lib/utils/equipment-summary";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import { displayTimeLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { isValidEccPermitNumber } from "@/lib/ecc/permit-needed";
import DeferredTimelineBody from "../_components/DeferredTimelineBody";
import DeferredInternalNotesBody from "../_components/DeferredInternalNotesBody";
import DeferredServiceChainPanelBody from "../_components/DeferredServiceChainPanelBody";
import DeferredJobAttachmentsInternal from "../_components/DeferredJobAttachmentsInternal";
import ContractorReportPanel from "../_components/ContractorReportPanel";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import CancelJobButton from "@/components/jobs/CancelJobButton";

import {
  listAccountWorkshareConnectionsForAccount,
} from "@/lib/workflows/account-workshare-connections-read";
import {
  listAccountWorkshareRequestsForSourceJob,
  getWorkshareRequestForReceivingJob,
} from "@/lib/workflows/account-workshare-requests-read";
import { resolveWorkshareSenderCompanyNames } from "@/lib/workflows/workshare-sender-identity";
import EccHersRequestSection from "./_components/EccHersRequestSection";
import ReceiverWorksharePanel from "./_components/ReceiverWorksharePanel";

import ScrollSpyNav, { type NavItem } from "./_components/ScrollSpyNav";
import AlertBanner from "./_components/AlertBanner";
import FinishOutcomeCards from "./_components/FinishOutcomeCards";
import RecordsTabs, { type RecordTab } from "./_components/RecordsTabs";
import SchedulePanel from "./_components/SchedulePanel";
import NoteComposer from "./_components/NoteComposer";
import PermitForm from "./_components/PermitForm";
import InterruptionHub from "./_components/InterruptionHub";
import FieldStatusAdvanceForm from "./_components/FieldStatusAdvanceForm";

// ─── types ────────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>;

// ─── design tokens (verbatim from spec) ───────────────────────────────────────

const DESKTOP_STICKY_HEADER_OFFSET = "72px";
const DESKTOP_SECTION_SCROLL_MARGIN_TOP = "88px";

const S = {
  mono: "var(--font-geist-mono), monospace",
  sectionLabel: {
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "11px",
    letterSpacing: "0.11em",
    textTransform: "uppercase" as const,
    color: "oklch(0.42 0.025 262)",
    fontWeight: 700,
  },
  fieldLabel: {
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "oklch(0.48 0.02 262)",
    fontWeight: 700,
    marginBottom: "7px",
  },
  fieldValue: {
    fontSize: "14.5px",
    lineHeight: 1.55,
    color: "oklch(0.33 0.02 262)",
  },
  hairline: { borderTop: "1px solid oklch(0.88 0.008 250)" },
  rowRule: { borderBottom: "1px solid oklch(0.92 0.006 250)" },
  section: {
    padding: "30px 0",
    borderTop: "1px solid oklch(0.88 0.008 250)",
    scrollMarginTop: DESKTOP_SECTION_SCROLL_MARGIN_TOP,
  },
  primaryBtn: {
    height: "42px",
    borderRadius: "10px",
    border: "none",
    background: "oklch(0.55 0.17 255)",
    color: "#fff",
    fontSize: "13.5px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 1px 2px rgba(40,80,180,0.25)",
    width: "100%",
    display: "block",
  },
  outlineBtn: (active = false) => ({
    height: "38px",
    padding: "0 16px",
    borderRadius: "9px",
    border: `1px solid ${active ? "oklch(0.85 0.04 255)" : "oklch(0.9 0.006 250)"}`,
    background: active ? "oklch(0.97 0.02 255)" : "#fff",
    color: active ? "oklch(0.45 0.14 255)" : "oklch(0.32 0.02 262)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  }),
  contactBtn: {
    height: "36px",
    padding: "0 18px",
    borderRadius: "9px",
    border: "1px solid oklch(0.9 0.006 250)",
    background: "oklch(0.98 0.003 250)",
    fontSize: "12.5px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    color: "oklch(0.32 0.02 262)",
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v.trim() : "";
}

function formatStandardTimeLA(value?: string | null): string {
  const time = displayTimeLA(value);
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;

  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  const standardHour = hour % 12 || 12;
  return `${standardHour}:${minute} ${period}`;
}

function formatStandardWindowLA(start?: string | null, end?: string | null): string {
  const startText = formatStandardTimeLA(start);
  const endText = formatStandardTimeLA(end);
  if (!startText && !endText) return "";
  if (startText && endText) return `${startText} - ${endText}`;
  return startText || endText;
}

type StatusPill = {
  label: string;
  bg: string;
  fg: string;
  dot: string;
};

function deriveStatusPill(
  status: string,
  opsStatus: string,
  hasScheduledAppointment = false,
): StatusPill {
  if (status === "cancelled")
    return { label: "CANCELLED", bg: "oklch(0.96 0.004 250)", fg: "oklch(0.55 0.015 262)", dot: "oklch(0.7 0.02 262)" };
  if (status === "on_the_way")
    return { label: "ON THE WAY", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (status === "in_process")
    return { label: "IN PROGRESS · ON SITE", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (opsStatus === "scheduled" || hasScheduledAppointment)
    return { label: "SCHEDULED", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (opsStatus === "need_to_schedule" || (!status || status === "open"))
    return { label: "NEEDS SCHEDULE", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "pending_info")
    return { label: "PENDING INFO", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "on_hold")
    return { label: "ON HOLD", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "failed" || status === "failed")
    return { label: "FAILED", bg: "oklch(0.96 0.04 25)", fg: "oklch(0.5 0.12 25)", dot: "oklch(0.58 0.18 25)" };
  if (opsStatus === "retest_needed")
    return { label: "RETEST NEEDED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "invoice_required")
    return { label: "INVOICE REQUIRED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "paperwork_required")
    return { label: "PAPERWORK REQUIRED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "closed" || status === "completed")
    return { label: "CLOSED", bg: "oklch(0.95 0.04 150)", fg: "oklch(0.45 0.13 150)", dot: "oklch(0.58 0.13 150)" };
  return { label: "IN PROGRESS", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
}

type FieldStepState = "done" | "now" | "todo";

function deriveFieldSteps(status: string, fieldComplete: boolean): [FieldStepState, FieldStepState, FieldStepState] {
  if (fieldComplete || status === "completed" || status === "cancelled") return ["done", "done", "done"];
  if (status === "in_process") return ["done", "done", "now"];
  if (status === "on_the_way") return ["now", "todo", "todo"];
  return ["now", "todo", "todo"];
}

function deriveBlockers(job: {
  status: string;
  ops_status: string;
  scheduled_date: string | null;
  window_start: string | null;
  field_complete: boolean | null;
  certs_complete: boolean | null;
  invoice_complete: boolean | null;
  job_type: string;
  permit_number: string | null;
  ecc_test_runs: Array<{ is_completed: boolean | null }>;
}): string[] {
  const blockers: string[] = [];
  const isScheduled = Boolean(job.scheduled_date || job.window_start);
  const fieldComplete = Boolean(job.field_complete);

  if (!fieldComplete && !isScheduled) blockers.push("Not scheduled");
  if (!fieldComplete && isScheduled && job.status !== "on_the_way" && job.status !== "in_process")
    blockers.push("Visit not started");

  const isEcc = job.job_type === "ecc";
  if (isEcc && !isValidEccPermitNumber(job.permit_number)) blockers.push("No permit number");

  if (isEcc) {
    const completedRuns = job.ecc_test_runs.filter((r) => r.is_completed).length;
    if (completedRuns === 0) blockers.push("0 tests complete");
  }

  if (!Boolean(job.invoice_complete)) blockers.push("Invoice not resolved");

  return blockers;
}

function formatVisitScopeTotal(items: ReturnType<typeof sanitizeVisitScopeItems>): string {
  const total = items.reduce((sum, item) => sum + (item.expected_unit_price ?? 0), 0);
  if (total === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatBillingRecipientMethod(input: {
  billingRecipient: unknown;
  billingName: unknown;
  contractorName: string | null;
  customerName: string;
}) {
  const billingRecipient = String(input.billingRecipient ?? "").trim().toLowerCase();
  const billingName = String(input.billingName ?? "").trim();

  if (billingRecipient === "contractor") {
    return input.contractorName ? `Contractor - ${input.contractorName}` : "Contractor";
  }

  if (billingRecipient === "other") {
    return billingName ? `Other - ${billingName}` : "Other";
  }

  if (billingRecipient === "customer" || !billingRecipient) {
    return input.customerName ? `Customer - ${input.customerName}` : "Customer";
  }

  return billingName || billingRecipient;
}

// ─── Supabase select ───────────────────────────────────────────────────────────

const JOB_V2_SELECT = `
  id, title, status, ops_status,
  job_type, service_visit_reason, service_visit_outcome,
  visit_scope_summary, visit_scope_items,
  customer_id, location_id, service_case_id, parent_job_id,
  contractor_id,
  job_display_number,
  customer_first_name, customer_last_name, customer_email, customer_phone,
  scheduled_date, window_start, window_end,
  field_complete, certs_complete, invoice_complete,
  pending_info_reason, on_hold_reason,
  follow_up_date, next_action_note, action_required_by, ops_board_failure_note,
  permit_number, jurisdiction, permit_date,
  billing_recipient, billing_name,
  billing_disposition,
  job_notes,
  created_at, deleted_at,
  locations:location_id (
    id, nickname, label, address_line1, address_line2, city, state, zip
  ),
  ecc_test_runs (
    id, test_type, is_completed, computed_pass, override_pass, created_at
  ),
  job_equipment (
    id,
    equipment_role,
    component_type,
    system_location,
    manufacturer,
    model,
    serial,
    tonnage,
    refrigerant_type,
    notes,
    created_at
  )
`;

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function JobDetailV2Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;
  const sp = (await searchParams) ?? {};
  const bannerMessage = param(sp, "banner");

  // ── timing (JOB_DETAIL_TIMING_DEBUG) ────────────────────────────────────────
  // Duration-only instrumentation mirroring the v1 [job-detail-timing] shape.
  // v2 is the permanent job-detail route; v1's harness only ran on the retired
  // page, so real traffic produced no timings. timedPhase re-throws the original
  // error untouched (behavior-preserving) and is a no-op passthrough when the
  // flag is off.
  const timingEnabled = process.env.JOB_DETAIL_TIMING_DEBUG === "true";
  const renderStartMs = Date.now();
  const phaseDurationsMs: Record<string, number> = {};
  const timedPhase = async <T,>(phaseName: string, factory: () => PromiseLike<T>): Promise<T> => {
    if (!timingEnabled) return factory();
    const startMs = Date.now();
    try {
      return await factory();
    } finally {
      phaseDurationsMs[phaseName] = Date.now() - startMs;
    }
  };

  // ── auth ──────────────────────────────────────────────────────────────────

  let supabase = await createClient();
  // Shared, request-scoped user resolution — a cache hit against the getUser the
  // root layout already resolved for this request (dedupes the round-trip).
  const user = await timedPhase("authGetUser", () => getRequestUser());
  if (!user) redirect("/login");

  const actorResolution = await timedPhase("actorRoleResolution", () =>
    resolveJobDetailActor({ supabase, userId: user.id }),
  );
  if (actorResolution.kind === "contractor") redirect(`/portal/jobs/${jobId}`);
  if (actorResolution.kind === "unauthorized") redirect("/login");

  const internalUser = actorResolution.internalUser;
  const accountOwnerUserId = internalUser.account_owner_user_id;
  const internalRole = String(internalUser.role ?? "").toLowerCase();
  const isAdmin = internalRole === "admin";

  // check for dual-role contractor shadow membership
  const { data: shadowMembership, error: shadowMembershipError } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (shadowMembershipError) throw shadowMembershipError;

  const hasShadowMembership = Boolean(shadowMembership?.contractor_id);

  // same-account boundary check
  const scopedOutcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
    accountOwnerUserId,
    jobId,
  });
  if (scopedOutcome.status !== "ok") return notFound();

  if (hasShadowMembership) supabase = createAdminClient();

  // ── main job query ─────────────────────────────────────────────────────────

  const { data: job, error: jobError } = await timedPhase("mainJobRead", () =>
    supabase
      .from("jobs")
      .select(JOB_V2_SELECT)
      .eq("id", jobId)
      .single(),
  );

  if (jobError) throw jobError;
  if (!job) return notFound();
  if (job.deleted_at) redirect("/ops?saved=job_archived");

  const timelineScopeJobIds = [jobId, job.parent_job_id].filter(Boolean) as string[];

  // ── supplemental queries ──────────────────────────────────────────────────

  const [
    assignmentMap,
    contractorRows,
    { data: customerLocationsRaw, error: customerLocationsError },
    billingMode,
    { data: primaryInvoiceRaw, error: primaryInvoiceError },
    contactAttemptsResult,
    attachmentCountResult,
    timelineCountResult,
    businessProfile,
    workshareConnections,
    workshareRequests,
    productMode,
    activeRetestChild,
  ] = await timedPhase("supplementalReads", () => Promise.all([
    getActiveJobAssignmentDisplayMap({ jobIds: [jobId], supabase }),
    job.contractor_id
      ? getContractors(accountOwnerUserId)
      : Promise.resolve([] as Array<{ id: string; name: string | null }>),
    job.customer_id
      ? supabase
          .from("locations")
          .select("id, address_line1, city, state, zip, postal_code")
          .eq("customer_id", job.customer_id)
          .eq("owner_user_id", accountOwnerUserId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    resolveBillingModeByAccountOwnerId({ supabase, accountOwnerUserId }),
    supabase
      .from("internal_invoices")
      .select("id, status, invoice_display_number, invoice_number, issued_at, total_cents")
      .eq("job_id", jobId)
      .eq("invoice_kind", "primary")
      .neq("status", "void")
      .maybeSingle(),
    supabase
      .from("job_events")
      .select("created_at", { count: "exact" })
      .eq("job_id", jobId)
      .eq("event_type", "customer_attempt")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "job")
      .eq("entity_id", jobId),
    supabase
      .from("job_events")
      .select("id", { count: "exact", head: true })
      .in("job_id", timelineScopeJobIds),
    getInternalBusinessProfileByAccountOwnerId({ supabase, accountOwnerUserId }),
    listAccountWorkshareConnectionsForAccount(supabase, accountOwnerUserId, {
      serviceType: "ecc_hers",
      statuses: ["active"],
      limit: 100,
    }),
    listAccountWorkshareRequestsForSourceJob(supabase, accountOwnerUserId, jobId),
    resolveProductModeForAccountOwnerId({ supabase, accountOwnerUserId }),
    // active linked retest child (mirrors legacy job detail): only ECC parents, at most one live child
    (async () => {
      if (String(job.job_type ?? "").trim().toLowerCase() !== "ecc" || job.parent_job_id) return null;
      const { data, error } = await supabase
        .from("jobs")
        .select("id, status, ops_status, scheduled_date, window_start, window_end")
        .eq("parent_job_id", jobId)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    })(),
  ]));

  if (customerLocationsError) throw customerLocationsError;
  if (primaryInvoiceError) throw primaryInvoiceError;
  if (contactAttemptsResult.error) throw contactAttemptsResult.error;
  if (attachmentCountResult.error) throw attachmentCountResult.error;
  if (timelineCountResult.error) throw timelineCountResult.error;

  const customerLocations: Array<{ id: string; label: string }> = (customerLocationsRaw ?? []).map(
    (loc: any) => ({
      id: String(loc.id),
      label: [loc.address_line1, loc.city, loc.state, loc.zip ?? loc.postal_code]
        .map((v: any) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ") || "Unknown address",
    }),
  );

  const assignedTeam = assignmentMap[jobId] ?? [];
  const attachmentCount = Number(attachmentCountResult.count ?? 0);
  const timelineCount = Number(timelineCountResult.count ?? 0);
  const contractor = job.contractor_id
    ? (contractorRows as Array<{ id: string; name?: string | null }>).find(
        (c) => c.id === job.contractor_id,
      )
    : null;
  const contractorName = contractor
    ? String(contractor.name ?? "").trim() || null
    : null;
  const contractorDisplayName = contractorName || "Retail";
  const hasAssignedContractor = Boolean(job.contractor_id);

  // ── derived display values ────────────────────────────────────────────────

  const status = String(job.status ?? "").toLowerCase();
  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  const jobType = String(job.job_type ?? "").toLowerCase();
  const isServiceJob = jobType === "service";
  const isEccJob = jobType === "ecc";
  const fieldComplete = Boolean(job.field_complete);
  const certsComplete = Boolean(job.certs_complete);

  // ── billing state ─────────────────────────────────────────────────────────
  const billingDisposition = normalizeJobBillingDisposition((job as any).billing_disposition ?? null);
  const billingState = buildJobBillingStateReadModel({
    billingMode,
    invoiceComplete: job.invoice_complete,
    internalInvoice: primaryInvoiceRaw
      ? {
          status: primaryInvoiceRaw.status,
          invoice_number: primaryInvoiceRaw.invoice_number ?? null,
          issued_at: primaryInvoiceRaw.issued_at ?? null,
        }
      : null,
    billingDisposition: (job as any).billing_disposition ?? null,
  });
  const billedTruthSatisfied = billingState.billedTruthSatisfied;

  // invoice display helpers
  const invoiceCents = Number(primaryInvoiceRaw?.total_cents ?? 0);
  const invoiceTotalFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoiceCents / 100);
  const invoiceDisplayRef = primaryInvoiceRaw?.invoice_display_number
    ? `Invoice #${primaryInvoiceRaw.invoice_display_number}`
    : "Invoice";

  const isFieldActive = status === "in_process";
  const isEnRoute = status === "on_the_way";
  const visitStarted = isFieldActive || isEnRoute;
  const isTerminal = fieldComplete || status === "completed" || status === "cancelled";
  const hasScheduledAppointment = Boolean(job.scheduled_date || job.window_start || job.window_end);
  const hasFullSchedule = Boolean(job.scheduled_date && job.window_start && job.window_end);
  const scheduledAppointmentDateText = formatBusinessDateUS(job.scheduled_date);
  const scheduledAppointmentWindowText = formatStandardWindowLA(job.window_start, job.window_end);
  const scheduledAppointmentText = [
    scheduledAppointmentDateText,
    scheduledAppointmentWindowText,
  ].filter(Boolean).join(" - ");

  const statusPill = deriveStatusPill(status, opsStatus, hasScheduledAppointment);
  const fieldSteps = deriveFieldSteps(status, fieldComplete);

  const visitScopeItems = sanitizeVisitScopeItems(job.visit_scope_items);
  const invoiceTotal = formatVisitScopeTotal(visitScopeItems);

  type LocationRow = {
    id: string; nickname: string | null; label: string | null;
    address_line1: string | null; address_line2: string | null;
    city: string | null; state: string | null; zip: string | null;
  };
  const rawLoc = (job as any).locations;
  const location: LocationRow | null = Array.isArray(rawLoc)
    ? (rawLoc.find((l: unknown) => l) ?? null)
    : (rawLoc ?? null);

  const customerFullName = [
    formatPersonNamePart(job.customer_first_name),
    formatPersonNamePart(job.customer_last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "Customer";
  const billingRecipientMethodLabel = formatBillingRecipientMethod({
    billingRecipient: (job as any).billing_recipient,
    billingName: (job as any).billing_name,
    contractorName,
    customerName: customerFullName,
  });

  // Lane 4 — Google review ask (field-complete trigger + per-account review URL)
  const googleReviewUrl = businessProfile?.google_review_url ?? null;
  const canShowReviewAsk =
    fieldComplete && Boolean(googleReviewUrl) && status !== "cancelled";
  const reviewAskLinks = canShowReviewAsk && googleReviewUrl
    ? buildReviewAskLinks({
        customerFirstName: job.customer_first_name ?? null,
        customerEmail: job.customer_email ?? null,
        customerPhone: job.customer_phone ?? null,
        googleReviewUrl,
        businessName: String(businessProfile?.display_name ?? "").trim() || "our team",
      })
    : null;
  const reviewAskMailtoHref = reviewAskLinks?.mailtoHref ?? null;
  const reviewAskSmsHref = reviewAskLinks?.smsHref ?? null;

  const jobDisplayRef = formatJobDisplayReference({ jobDisplayNumber: job.job_display_number, jobId: job.id });

  // closeout blockers
  const blockers = deriveBlockers({
    status,
    ops_status: opsStatus,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: billedTruthSatisfied,
    job_type: jobType,
    permit_number: job.permit_number,
    ecc_test_runs: (job.ecc_test_runs ?? []) as Array<{ is_completed: boolean | null }>,
  });

  // waiting state
  const waitingState = getActiveWaitingState({
    ops_status: opsStatus,
    pending_info_reason: job.pending_info_reason,
    on_hold_reason: job.on_hold_reason,
  });

  // service chain IDs for deferred components
  const serviceCaseId = job.service_case_id as string | null;
  const parentJobId = job.parent_job_id as string | null;
  const timelineJobIds = timelineScopeJobIds;
  const hasDirectNarrativeChain = Boolean(parentJobId);

  // ECC/HERS workshare send surface (P1-C on v2). Only this account's active
  // sender-side ecc_hers connections make the section available.
  const activeRaterWorkshareConnections = (workshareConnections ?? []).filter(
    (row) => row.sender_account_id === accountOwnerUserId,
  );
  const hasActiveRaterWorkshareConnection = activeRaterWorkshareConnections.length > 0;
  // Label each rater by their real company name. Prefer the name captured on the
  // connection invite; otherwise resolve the rater account's business identity
  // (RLS-scoped to them, so use the service-role client) — never fall back to an id.
  const workshareLabelAdmin = activeRaterWorkshareConnections.length > 0 ? createAdminClient() : null;
  const workshareConnectionOptions = await Promise.all(
    activeRaterWorkshareConnections.map(async (row) => {
      const inviteName = String(row.invite_company_name ?? "").trim();
      let label = inviteName;
      if (!label && workshareLabelAdmin) {
        const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
          accountOwnerUserId: row.receiver_account_id,
          supabase: workshareLabelAdmin,
        });
        label = String(identity.display_name ?? "").trim();
      }
      return { id: row.id, label: label || "Connected rater" };
    }),
  );

  // Company names for the sent-request list (so it never shows a rater account id).
  const workshareRaterNameById: Record<string, string> = {};
  {
    const requestReceivers = Array.from(
      new Set((workshareRequests ?? []).map((r) => String(r.receiver_account_id ?? "").trim()).filter(Boolean)),
    );
    if (requestReceivers.length > 0) {
      const raterAdmin = workshareLabelAdmin ?? createAdminClient();
      await Promise.all(
        requestReceivers.map(async (receiverId) => {
          const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
            accountOwnerUserId: receiverId,
            supabase: raterAdmin,
          });
          workshareRaterNameById[receiverId] = String(identity.display_name ?? "").trim() || "Connected rater";
        }),
      );
    }
  }

  // Receiver side: is THIS job a workshare receiving job (created from an accepted
  // request)? If so, surface the partner panel with the contractor context.
  const receiverWorkshareRequest = await getWorkshareRequestForReceivingJob(supabase, accountOwnerUserId, jobId);
  let receiverWorkshareSenderName = "Connected contractor";
  let receiverWorkshareCurrentResult: "passed" | "failed" | null = null;
  if (receiverWorkshareRequest) {
    const senderNames = await resolveWorkshareSenderCompanyNames([receiverWorkshareRequest]);
    receiverWorkshareSenderName =
      senderNames.get(String(receiverWorkshareRequest.sender_account_id ?? "").trim()) || "Connected contractor";
    // Live ECC result of this receiving job (rater sends it manually).
    const receiverOps = String(job.ops_status ?? "").toLowerCase();
    receiverWorkshareCurrentResult =
      receiverOps === "failed"
        ? "failed"
        : ["paperwork_required", "invoice_required", "certs_complete", "closed"].includes(receiverOps)
          ? "passed"
          : null;
  }

  // brief fields
  const visitReasonText = String(job.service_visit_reason ?? job.title ?? "").trim();
  const jobTitleText = String(job.title ?? "").trim();
  const workSummaryText = String(job.visit_scope_summary ?? "").trim();
  const workshareDefaultScope =
    workSummaryText
    || visitScopeItems
        .filter((item) => item.kind === "primary")
        .map((item) => item.title)
        .filter(Boolean)
        .join("\n");
  const startedFromPermitWorkflow = /^Created from permit request\b/i.test(String(job.job_notes ?? "").trim());
  const workSummaryPlaceholder = isTerminal
    ? "Visit submitted — no summary captured."
    : visitStarted
      ? "On site — work in progress."
      : "Pending field visit — no work items captured yet.";

  // ECC test run counts
  const eccRuns = (job.ecc_test_runs ?? []) as Array<{ is_completed: boolean | null; computed_pass: boolean | null; override_pass: boolean | null }>;
  const completedEccRuns = eccRuns.filter((r) => r.is_completed).length;
  const hasFailedEccRun = eccRuns.some((r) => r.is_completed && r.computed_pass === false);
  const hasCompletedEccTest = eccRuns.some((r) => r.is_completed);

  // closeout needs + shortcut derivations
  const isFailedUnresolved = isEccJob && ["failed", "retest_needed", "pending_office_review"].includes(opsStatus);
  const failedReasonBannerNote = String((job as any).ops_board_failure_note ?? "").replace(/\s+/g, " ").trim();
  const canShowEccFailedReasonBanner = isEccJob && ["failed", "retest_needed", "pending_office_review"].includes(opsStatus);
  const failedReasonBannerText = failedReasonBannerNote
    ? `Failed Test - ${failedReasonBannerNote}`
    : "Failed Test";
  const canShowContractorReportPanel = hasAssignedContractor && ["failed", "pending_info"].includes(opsStatus);

  // ── ECC retest bridge (ported from legacy job detail) ──────────────────────
  // Everyone reaching this page is internal (contractors were redirected above),
  // so we gate on the product surface + job type + ops status only.
  const retestSurfaceEnabled = resolveProductSurfaceProfile(productMode).surfaces.retest;
  const hasActiveRetestChild = Boolean((activeRetestChild as any)?.id);
  const showConfirmRetestReady =
    retestSurfaceEnabled &&
    isEccJob &&
    !hasActiveRetestChild &&
    ["failed", "pending_office_review"].includes(opsStatus);
  const showScheduleRetest =
    retestSurfaceEnabled &&
    isEccJob &&
    !hasActiveRetestChild &&
    opsStatus === "retest_needed";
  const closeoutNeeds = getCloseoutNeeds({
    field_complete: job.field_complete,
    job_type: job.job_type,
    ops_status: job.ops_status,
    permit_number: job.permit_number,
    invoice_complete: billedTruthSatisfied,
    certs_complete: job.certs_complete,
  });
  const canShowCertsButton =
    isEccJob &&
    !certsComplete &&
    !isFailedUnresolved &&
    isValidEccPermitNumber(job.permit_number);
  const canShowInvoiceButton =
    isEccJob &&
    !billedTruthSatisfied &&
    billingState.lightweightBillingAllowed &&
    opsStatus !== "closed";
  const createEstimateFromJobHref = (() => {
    if (!isEstimatesEnabled() || !job.customer_id || !job.location_id || !job.id) return null;
    const params = new URLSearchParams({
      customer_id: String(job.customer_id),
      location_id: String(job.location_id),
      origin_job_id: String(job.id),
    });
    if (serviceCaseId) params.set("service_case_id", String(serviceCaseId));
    return `/estimates/new?${params.toString()}`;
  })();
  const addServicePlanHref =
    isMaintenanceAgreementsEnabled() && job.customer_id
      ? `/customers/${job.customer_id}?tab=service-plans`
      : null;
  const canCreateReturnVisit = isServiceJob;
  const canCreateCallbackVisit = isServiceJob && (fieldComplete || status === "completed" || opsStatus === "closed");
  const followUpDateValue = String(job.follow_up_date ?? "").trim();
  const followUpNoteValue = String(job.next_action_note ?? "").trim();
  const followUpOwnerValue = String(job.action_required_by ?? "").trim();
  const todayBusinessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const hasFollowUpReminder = Boolean(followUpDateValue || followUpNoteValue || followUpOwnerValue);
  const followUpReminderStatus = followUpDateValue
    ? followUpDateValue <= todayBusinessDate
      ? "Due now in Operations Follow Ups"
      : `Visible in Operations Follow Ups; due ${formatBusinessDateUS(followUpDateValue)}`
    : "No reminder date set";

  // contact attempts
  const contactAttemptCount = Number(contactAttemptsResult.count ?? 0);
  const latestAttemptAt = contactAttemptsResult.data?.[0]?.created_at ?? null;
  const contactAttemptLabel = contactAttemptCount > 0
    ? `${contactAttemptCount} attempt${contactAttemptCount === 1 ? "" : "s"}${latestAttemptAt ? ` · last ${formatRecentAttemptDateTime(String(latestAttemptAt))}` : ""}`
    : "No attempts yet";

  // next action sentence (drives the rail NEXT ACTION group)
  const nextActionSentence = (() => {
    if (status === "cancelled") return "This job has been cancelled.";
    if (!fieldComplete) {
      if (status === "in_process") return "Visit in progress — finish and submit when work is done.";
      if (status === "on_the_way") return "Tech is en route — mark on site when arrived.";
      if (hasScheduledAppointment) return `Scheduled ${scheduledAppointmentText}. Mark on the way when the tech is heading out.`;
      return "Schedule and dispatch to start this job.";
    }
    if (isFailedUnresolved) {
      if (opsStatus === "pending_office_review") return "Field complete - pending office review.";
      return "Field complete - pending closeout.";
    }
    if (closeoutNeeds.needsCerts && closeoutNeeds.needsInvoice) return "Field work complete — send certs and invoice to close this job.";
    if (closeoutNeeds.needsCerts) return "Field work complete — send certs to close this job.";
    if (closeoutNeeds.needsInvoice) return "Invoice needed — send to close out billing.";
    return "All done — this job is fully closed out.";
  })();

  // equipment rows
  const baseEquipmentRows = ((job as any).job_equipment ?? []) as Array<{
    id: string;
    equipment_role: string | null;
    component_type: string | null;
    system_location: string | null;
    manufacturer: string | null;
    model: string | null;
    serial: string | null;
    tonnage: number | null;
    refrigerant_type: string | null;
    notes: string | null;
  }>;
  const equipmentLabelPhotoAttachments = baseEquipmentRows.length
    ? await listJobEquipmentLabelPhotoImages({
        supabase,
        admin: createAdminClient(),
        jobId,
        equipmentIds: baseEquipmentRows.map((equipment) => String(equipment.id)),
        limit: 100,
      })
    : [];
  const equipmentIdsWithLabelPhoto = new Set(
    equipmentLabelPhotoAttachments
      .map((attachment) => String(attachment.equipmentId ?? "").trim())
      .filter(Boolean),
  );
  const equipmentRows = baseEquipmentRows.map((equipment) => ({
    ...equipment,
    has_label_photo_evidence: equipmentIdsWithLabelPhoto.has(String(equipment.id)),
  }));

  // return URL for actions
  const returnTo = `/jobs/${jobId}/v2`;

  const renderCloseoutBillingAction = (
    buttonStyle: React.CSSProperties,
    options?: { secondary?: boolean },
  ) => {
    if (!fieldComplete || !closeoutNeeds.needsInvoice) return null;

    const commonStyle: React.CSSProperties = {
      ...buttonStyle,
      width: options?.secondary ? "100%" : buttonStyle.width,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      textDecoration: "none",
    };

    if (billingState.internalInvoicePanelEnabled) {
      if (primaryInvoiceRaw) {
        return (
          <Link href={`/jobs/${jobId}/invoice#invoice-workspace`} style={commonStyle}>
            Continue Invoice
          </Link>
        );
      }

      return (
        <form action={createInternalInvoiceDraftFromForm}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="return_to" value={`/jobs/${jobId}/invoice#invoice-workspace`} />
          <input type="hidden" name="auto_import_visit_scope_items" value="1" />
          <ImmediateSubmitButton pendingText="Starting..." className="" style={commonStyle}>
            Create Invoice
          </ImmediateSubmitButton>
        </form>
      );
    }

    if (!canShowInvoiceButton) return null;

    return (
      <form action={markInvoiceCompleteFromForm}>
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <ImmediateSubmitButton pendingText="Saving..." className="" style={commonStyle}>
          External Billing Complete
        </ImmediateSubmitButton>
      </form>
    );
  };

  // nav items
  const navItems: NavItem[] = [
    { id: "brief", label: "Job Brief" },
    { id: "people", label: "People & Place" },
    { id: "notes", label: "Job Memory" },
    { id: "field", label: "Field & Finish" },
    { id: "equipment", label: "Equipment" },
    { id: "billing", label: "Work & Billing" },
    { id: "followup", label: "Follow-Up & Chain" },
    ...(hasActiveRaterWorkshareConnection ? [{ id: "workshare", label: "ECC/HERS Request" }] : []),
    ...(receiverWorkshareRequest ? [{ id: "workshare-partner", label: "Workshare" }] : []),
    ...(isEccJob ? [{ id: "compliance", label: "Compliance" }] : []),
    { id: "records", label: "Records" },
  ];

  // ── render ─────────────────────────────────────────────────────────────────

  if (timingEnabled) {
    console.info(
      "[job-detail-timing]",
      JSON.stringify({
        jobId,
        route: "v2",
        phasesMs: {
          authGetUser: phaseDurationsMs.authGetUser ?? 0,
          actorRoleResolution: phaseDurationsMs.actorRoleResolution ?? 0,
          mainJobRead: phaseDurationsMs.mainJobRead ?? 0,
          supplementalReads: phaseDurationsMs.supplementalReads ?? 0,
          totalServerRenderBeforeResponse: Date.now() - renderStartMs,
        },
      }),
    );
  }

  return (
    <div style={{ background: "oklch(0.975 0.004 250)", minHeight: "100vh" }}>
    <div
      style={{
        maxWidth: "1300px",
        margin: "0 auto",
        padding: "0 28px",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 290px",
        gap: "32px",
        alignItems: "start",
        minHeight: 0,
        color: "oklch(0.27 0.02 262)",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* ── LEFT: continuous sheet ─────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid oklch(0.86 0.01 250)",
          borderRadius: "16px",
          margin: "0 0 64px",
          padding: "0 40px",
          minWidth: 0,
        }}
      >
        {/* alert / feedback strip */}
        {bannerMessage ? <AlertBanner slug={bannerMessage} /> : null}

        {/* header band */}
        <div style={{ padding: "32px 0 28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "24px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: S.mono,
                  letterSpacing: "0.06em",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "oklch(0.55 0.015 262)",
                  marginBottom: "9px",
                }}
              >
                <Link href="/ops" style={{ color: "oklch(0.55 0.17 255)", textDecoration: "none" }}>
                  Ops
                </Link>
                {" "}/ Jobs / <span style={{ color: "oklch(0.4 0.02 262)" }}>{jobDisplayRef}</span>
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "28px",
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  color: "oklch(0.27 0.02 262)",
                }}
              >
                {job.title}
              </h1>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px", marginTop: "12px" }}>
                {isEccJob ? (
                  <span
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10.5px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      background: "oklch(0.95 0.03 255)",
                      color: "oklch(0.5 0.13 255)",
                    }}
                  >
                    ECC
                  </span>
                ) : null}
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "10.5px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "4px 9px",
                    borderRadius: "6px",
                    background: statusPill.bg,
                    color: statusPill.fg,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: statusPill.dot,
                      flexShrink: 0,
                    }}
                  />
                  {statusPill.label}
                </span>
                {startedFromPermitWorkflow ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: "1px solid oklch(0.84 0.06 255)",
                      background: "oklch(0.96 0.025 255)",
                      color: "oklch(0.43 0.13 255)",
                      fontFamily: S.mono,
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Permit Workflow
                  </span>
                ) : null}
              </div>
            </div>
            {hasScheduledAppointment ? (
              <span
                style={{
                  display: "block",
                  minWidth: "190px",
                  maxWidth: "250px",
                  flex: "0 0 auto",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.86 0.01 250)",
                  background: "oklch(0.99 0.002 250)",
                  padding: "10px 12px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: S.mono,
                    fontSize: "9.5px",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "oklch(0.48 0.02 262)",
                    marginBottom: "5px",
                  }}
                >
                  Appointment
                </span>
                {scheduledAppointmentDateText ? (
                  <span
                    style={{
                      display: "block",
                      fontSize: "13.5px",
                      lineHeight: 1.25,
                      fontWeight: 750,
                      color: "oklch(0.28 0.018 262)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {scheduledAppointmentDateText}
                  </span>
                ) : null}
                {scheduledAppointmentWindowText ? (
                  <span
                    style={{
                      display: "block",
                      marginTop: scheduledAppointmentDateText ? "3px" : 0,
                      fontSize: "13px",
                      lineHeight: 1.25,
                      fontWeight: 700,
                      color: "oklch(0.34 0.02 262)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {scheduledAppointmentWindowText}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── JOB BRIEF ─────────────────────────────────────────────────────── */}
        <section
          id="brief"
          data-jobsection="brief"
          style={S.section}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "20px" }}>Job Brief</div>
          {/* Job Title / Visit Reason / Contractor / Billing */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 48px" }}>
            <div>
              <div style={S.fieldLabel}>Job Title</div>
              <form action={updateJobTitleFromForm} style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="tab" value="info" />
                <input type="hidden" name="return_to" value={`${returnTo}#brief`} />
                <input
                  name="title"
                  defaultValue={jobTitleText}
                  required
                  maxLength={200}
                  style={{ width: "100%", minHeight: "38px", borderRadius: "9px", border: "1px solid oklch(0.86 0.008 250)", padding: "8px 10px", font: "inherit" }}
                />
                <button type="submit" style={{ ...S.outlineBtn(false), justifySelf: "start" }}>Save Job Title</button>
              </form>
            </div>
            <div>
              <div style={S.fieldLabel}>Visit Reason</div>
              <div style={S.fieldValue}>{visitReasonText || "—"}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Contractor</div>
              <div style={S.fieldValue}>{contractorDisplayName}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Billing</div>
              <div style={{ ...S.fieldValue, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span>{billingRecipientMethodLabel}</span>
                {billedTruthSatisfied ? (
                  <span
                    style={{
                      fontFamily: S.mono,
                      fontSize: "9px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "oklch(0.95 0.04 150)",
                      color: "oklch(0.45 0.13 150)",
                    }}
                  >
                    COMPLETE
                  </span>
                ) : billingDisposition === "externally_billed" ? (
                  <span
                    style={{
                      fontFamily: S.mono,
                      fontSize: "9px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "oklch(0.96 0.05 75)",
                      color: "oklch(0.48 0.12 65)",
                    }}
                  >
                    EXTERNAL
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {/* full-width Work Summary */}
          <div
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid oklch(0.93 0.005 250)",
            }}
          >
            <div style={S.fieldLabel}>Work Summary</div>
            <form action={updateJobVisitScopeFromForm} style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="tab" value="info" />
              <input type="hidden" name="return_to" value={`${returnTo}#brief`} />
              <input
                type="hidden"
                name="visit_scope_items_json"
                value={JSON.stringify(visitScopeItems)}
              />
              <textarea
                name="visit_scope_summary"
                defaultValue={workSummaryText}
                placeholder={workSummaryPlaceholder}
                rows={3}
                maxLength={600}
                style={{
                  width: "100%",
                  minHeight: "78px",
                  resize: "vertical",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.86 0.018 250)",
                  background: "#fff",
                  color: "oklch(0.27 0.02 262)",
                  fontSize: "13.5px",
                  lineHeight: 1.55,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  style={{
                    height: "34px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid oklch(0.85 0.04 255)",
                    background: "oklch(0.97 0.02 255)",
                    color: "oklch(0.45 0.14 255)",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Save Summary
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── PEOPLE & PLACE ────────────────────────────────────────────────── */}
        <section
          id="people"
          data-jobsection="people"
          style={S.section}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "20px" }}>People &amp; Place</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "40px" }}>

            {/* left: customer + team */}
            <div>
              <div style={{ fontSize: "19px", fontWeight: 700 }}>{customerFullName}</div>
              <div
                style={{
                  fontFamily: S.mono,
                  fontSize: "12.5px",
                  color: "oklch(0.33 0.02 262)",
                  marginTop: "4px",
                }}
              >
                {[job.customer_phone, job.customer_email].filter(Boolean).join(" · ") || "No contact info"}
              </div>

              {/* direct contact buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                {job.customer_phone ? (
                  <a
                    href={`tel:${job.customer_phone}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Call
                  </a>
                ) : null}
                {job.customer_phone ? (
                  <a
                    href={`sms:${job.customer_phone}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Text
                  </a>
                ) : null}
                {job.customer_email ? (
                  <a
                    href={`mailto:${job.customer_email}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Email
                  </a>
                ) : null}
              </div>

              {/* contact logging row */}
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  paddingBottom: "16px",
                  ...S.hairline,
                  borderBottom: "1px solid oklch(0.93 0.005 250)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "oklch(0.48 0.02 262)",
                    fontWeight: 700,
                  }}
                >
                  Contact Logging
                  <span style={{ fontWeight: 400, letterSpacing: "0", textTransform: "none", fontSize: "11px", color: "oklch(0.58 0.015 262)", marginLeft: "6px" }}>
                    {contactAttemptLabel}
                  </span>
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["No Answer", "Sent Text", "Reached"] as const).map((label) => {
                    const resultMap = {
                      "No Answer": "no_answer",
                      "Sent Text": "sent_text",
                      Reached: "reached",
                    } as const;
                    const methodMap = {
                      "No Answer": "call",
                      "Sent Text": "text",
                      Reached: "call",
                    } as const;
                    return (
                      <form key={label} action={logCustomerContactAttemptFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="method" value={methodMap[label]} />
                        <input type="hidden" name="result" value={resultMap[label]} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="success_banner" value="contact_attempt_logged" />
                        <ImmediateSubmitButton
                          pendingText="…"
                          className=""
                          style={{
                            height: "32px",
                            padding: "0 12px",
                            borderRadius: "8px",
                            border: "1px solid oklch(0.9 0.006 250)",
                            background: "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            color: "oklch(0.4 0.02 262)",
                          } as React.CSSProperties}
                        >
                          {label}
                        </ImmediateSubmitButton>
                      </form>
                    );
                  })}
                </div>
              </div>

              {/* assigned team */}
              <div style={{ marginTop: "22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                  }}
                >
                  <div style={S.fieldLabel}>Assigned team</div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  {assignedTeam.map((member) => (
                    <div
                      key={member.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        padding: "7px 12px 7px 8px",
                        borderRadius: "30px",
                        background: "oklch(0.985 0.003 250)",
                        border: "1px solid oklch(0.93 0.005 250)",
                      }}
                    >
                      <span
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          background: "oklch(0.95 0.02 255)",
                          color: "oklch(0.45 0.12 255)",
                          fontSize: "11px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(member.display_name)}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>
                        {formatPersonNamePart(member.display_name)}
                      </span>
                      {member.is_primary ? (
                        <span
                          style={{
                            fontFamily: S.mono,
                            fontSize: "9px",
                            fontWeight: 600,
                            color: "oklch(0.55 0.14 150)",
                            letterSpacing: "0.04em",
                          }}
                        >
                          PRIMARY
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              <Suspense fallback={null}>
                <DeferredAddAssigneeForm
                  jobId={jobId}
                  tab="info"
                  assignedTeam={assignedTeam}
                  returnTo={returnTo}
                />
              </Suspense>
              </div>
            </div>

            {/* right: map + address */}
            <div>
              {location ? (
                <Suspense
                  fallback={
                    <div
                      style={{
                        height: "172px",
                        borderRadius: "12px",
                        background: "oklch(0.95 0.004 250)",
                      }}
                    />
                  }
                >
                  <JobLocationPreview
                    addressLine1={location.address_line1}
                    addressLine2={location.address_line2}
                    city={location.city}
                    state={location.state}
                    zip={location.zip}
                    showAddressOverlay
                    showAddressFooter={false}
                  />
                </Suspense>
              ) : (
                <div
                  style={{
                    height: "172px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background:
                      "repeating-linear-gradient(135deg, oklch(0.93 0.01 250) 0 14px, oklch(0.95 0.008 250) 14px 28px)",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "10px",
                      left: "10px",
                      fontFamily: S.mono,
                      fontSize: "9.5px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      color: "oklch(0.42 0.025 262)",
                      background: "rgba(255,255,255,0.85)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    No location linked
                  </span>
                </div>
              )}
              {customerLocations.length > 1 ? (
                <div style={{ marginTop: "10px" }}>
                  <ChangeServiceLocationForm
                    action={changeJobServiceLocationFromForm}
                    currentLocationId={location?.id ?? ""}
                    jobId={jobId}
                    locations={customerLocations}
                    returnTo={returnTo}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── JOB MEMORY (notes hub) ────────────────────────────────────────── */}
        <section
          id="notes"
          data-jobsection="notes"
          style={S.section}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <div style={S.sectionLabel}>Job Memory</div>
            <a
              href="#records"
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                textDecoration: "none",
              }}
            >
              View full timeline →
            </a>
          </div>

          {/* note composer */}
          <div style={{ marginBottom: "18px" }}>
            <NoteComposer
              jobId={jobId}
              returnTo={returnTo}
              internalAction={addInternalNoteFromForm}
              publicAction={addPublicNoteFromForm}
            />
          </div>

          {/* notes feed — deferred */}
          <Suspense
            fallback={
              <div
                style={{
                  padding: "20px 0",
                  fontSize: "13px",
                  color: "oklch(0.62 0.015 262)",
                }}
              >
                Loading notes…
              </div>
            }
          >
            <DeferredInternalNotesBody
              jobId={jobId}
              timelineJobIds={timelineJobIds}
              hasDirectNarrativeChain={hasDirectNarrativeChain}
              emptyStateClassName="text-sm text-slate-500"
              noteEventTypes={["internal_note", "public_note", "contractor_note"]}
            />
          </Suspense>
        </section>

        {/* ── FIELD & FINISH ────────────────────────────────────────────────── */}
        <section
          id="field"
          data-jobsection="field"
          style={S.section}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}
          >
            <div style={S.sectionLabel}>Field &amp; Finish</div>
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.06em",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                background: "oklch(0.96 0.025 255)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              EVERYSTEP
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "oklch(0.33 0.02 262)", marginBottom: "18px" }}>
            {isTerminal
              ? "All field steps complete — visit outcome was submitted."
              : visitStarted
                ? "Tech is on site. When the work is done, submit an outcome below — it routes the job from here."
                : "This visit hasn't started yet. Field status moves through these steps — the finish outcomes open at the end."}
          </div>

          {/* status track: 3 cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: "10px",
              marginBottom: "20px",
            }}
          >
            {(
              [
                { title: "On the Way", detail: isTerminal ? "Tech arrived on site" : isEnRoute ? "En route to the site" : visitStarted ? "Tech departed for the site" : "Tech heads out once scheduled" },
                { title: "On Site & Working", detail: isTerminal ? "Work captured on site" : isFieldActive ? "Notes, photos, work items captured" : "Capture notes, photos, work items" },
                { title: "Finish & Report", detail: isTerminal ? "EveryStep outcome submitted" : "Submit an EveryStep outcome" },
              ] as const
            ).map((step, i) => {
              const state = fieldSteps[i];
              const isNow = state === "now";
              const isDone = state === "done";
              const tagText = isDone ? `STEP ${i + 1} · DONE` : isNow ? `STEP ${i + 1} · NOW` : `STEP ${i + 1}`;
              const tagColor = isNow
                ? "oklch(0.5 0.13 255)"
                : isDone
                  ? "oklch(0.5 0.13 150)"
                  : "oklch(0.62 0.015 262)";
              const cardStyle = isNow
                ? {
                    padding: "14px",
                    borderRadius: "11px",
                    border: "1px solid oklch(0.85 0.04 255)",
                    background: "oklch(0.97 0.02 255)",
                  }
                : isDone
                  ? {
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.88 0.05 150)",
                      background: "oklch(0.98 0.025 150)",
                    }
                  : {
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.93 0.005 250)",
                    };

              return (
                <div key={i} style={cardStyle}>
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: tagColor,
                    }}
                  >
                    {tagText}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      marginTop: "6px",
                      color: state === "todo" ? "oklch(0.45 0.02 262)" : "oklch(0.27 0.02 262)",
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "3px",
                      color: isNow ? "oklch(0.5 0.015 262)" : "oklch(0.6 0.015 262)",
                    }}
                  >
                    {step.detail}
                  </div>
                </div>
              );
            })}
          </div>

          {/* finish outcomes: interactive when in_process, locked when not */}
          {isFieldActive ? (
            <FinishOutcomeCards
              jobId={jobId}
              returnTo={returnTo}
              completeAction={markJobFieldCompleteFromForm}
              partsAction={markJobPartsNeededFromForm}
              approvalAction={markJobApprovalNeededFromForm}
              unableAction={markJobUnableToCompleteFromForm}
            />
          ) : !fieldComplete ? (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  background: "oklch(0.96 0.004 250)",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "9.5px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "oklch(0.55 0.015 262)",
                    border: "1px solid oklch(0.88 0.006 250)",
                    padding: "3px 7px",
                    borderRadius: "5px",
                  }}
                >
                  LOCKED
                </span>
                <span style={{ fontSize: "12.5px", color: "oklch(0.5 0.015 262)" }}>
                  Finish outcomes unlock at Step 3, once the visit is in progress.
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: "10px",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              >
                {[
                  { label: "Work Completed", desc: "Ready for closeout & billing.", tone: "oklch(0.58 0.13 150)" },
                  { label: "Parts Needed", desc: "Flag a return, tie to next visit.", tone: "oklch(0.66 0.14 68)" },
                  { label: "Approval Needed", desc: "Customer must approve to continue.", tone: "oklch(0.66 0.14 68)" },
                  { label: "Unable to Complete", desc: "Needs an office decision.", tone: "oklch(0.58 0.18 25)" },
                ].map((o) => (
                  <div
                    key={o.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.92 0.006 250)",
                      background: "#fff",
                    }}
                  >
                    <span
                      style={{
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: o.tone,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        color: "oklch(0.27 0.02 262)",
                        marginTop: "8px",
                      }}
                    >
                      {o.label}
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.4,
                        color: "oklch(0.5 0.015 262)",
                        marginTop: "4px",
                      }}
                    >
                      {o.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "11px",
                background: "oklch(0.95 0.04 150)",
                border: "1px solid oklch(0.88 0.05 150)",
                fontSize: "13.5px",
                fontWeight: 600,
                color: "oklch(0.45 0.13 150)",
              }}
            >
              Field work complete — visit submitted.
            </div>
          )}
        </section>

        {/* ── EQUIPMENT ─────────────────────────────────────────────────────── */}
        <section
          id="equipment"
          data-jobsection="equipment"
          style={S.section}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={S.sectionLabel}>Equipment</div>
            <Link
              href={`/jobs/${jobId}/info?f=equipment`}
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                textDecoration: "none",
              }}
            >
              Manage →
            </Link>
          </div>
          {equipmentRows.length > 0 ? (
            <div
              style={{
                border: "1px solid oklch(0.93 0.005 250)",
                borderRadius: "11px",
                overflow: "hidden",
              }}
            >
              {equipmentRows.map((eq) => {
                const roleLabel = String(eq.equipment_role ?? eq.component_type ?? "")
                  .replace(/_/g, " ")
                  .trim();
                const makeModel = buildEquipmentIdentityLabel(eq);
                return (
                  <div
                    key={eq.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "13px 16px",
                      ...S.rowRule,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{makeModel}</div>
                      {eq.system_location ? (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "oklch(0.55 0.015 262)",
                            marginTop: "1px",
                          }}
                        >
                          {eq.system_location}
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        gap: "6px",
                        flexShrink: 0,
                      }}
                    >
                      {equipmentIdsWithLabelPhoto.has(String(eq.id)) ? (
                        <span
                          style={{
                            fontFamily: S.mono,
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: "oklch(0.95 0.045 150)",
                            color: "oklch(0.42 0.11 150)",
                            textTransform: "uppercase",
                          }}
                        >
                          Photo captured
                        </span>
                      ) : null}
                      {roleLabel ? (
                      <span
                        style={{
                          fontFamily: S.mono,
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "5px",
                          background: "oklch(0.96 0.004 250)",
                          color: "oklch(0.55 0.015 262)",
                          textTransform: "capitalize",
                          flexShrink: 0,
                        }}
                      >
                        {roleLabel}
                      </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: "22px",
                textAlign: "center",
                border: "1px dashed oklch(0.88 0.006 250)",
                borderRadius: "11px",
                color: "oklch(0.55 0.015 262)",
                fontSize: "13px",
              }}
            >
              No equipment records — add equipment to track system inventory.
            </div>
          )}
        </section>

        {/* ── WORK & BILLING ────────────────────────────────────────────────── */}
        <section
          id="billing"
          data-jobsection="billing"
          style={S.section}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <div style={S.sectionLabel}>Work &amp; Billing</div>
          </div>

          {/* work items */}
          {visitScopeItems.length > 0 ? (
            <div style={{ marginBottom: "20px" }}>
              {visitScopeItems.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "13px 0",
                    ...S.rowRule,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{item.title}</div>
                    {item.details ? (
                      <div
                        style={{
                          fontFamily: S.mono,
                          fontSize: "11px",
                          color: "oklch(0.6 0.015 262)",
                          marginTop: "2px",
                        }}
                      >
                        {item.details}
                      </div>
                    ) : null}
                  </div>
                  {visitStarted ? (
                    <span
                      style={{
                        fontFamily: S.mono,
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 9px",
                        borderRadius: "6px",
                        background: "oklch(0.95 0.04 150)",
                        color: "oklch(0.45 0.13 150)",
                      }}
                    >
                      Captured
                    </span>
                  ) : null}
                  {item.expected_unit_price != null ? (
                    <span
                      style={{
                        fontFamily: S.mono,
                        fontSize: "14px",
                        fontWeight: 600,
                        width: "78px",
                        textAlign: "right",
                      }}
                    >
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                        item.expected_unit_price,
                      )}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "22px",
                textAlign: "center",
                border: "1px dashed oklch(0.88 0.006 250)",
                borderRadius: "11px",
                color: "oklch(0.55 0.015 262)",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              No work items yet — add work performed, then price it before invoicing.
            </div>
          )}

          {/* closeout readiness */}
          <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>Closeout readiness</div>
          <div
            style={{
              border: "1px solid oklch(0.93 0.005 250)",
              borderRadius: "11px",
              overflow: "hidden",
              marginBottom: "20px",
            }}
          >
            {[
              {
                label: "Field work complete",
                detail: fieldComplete
                  ? "Tech submitted visit outcome"
                  : visitStarted
                    ? "Tech on site, finishing now"
                    : "Visit not yet finished in the field",
                dot: fieldComplete
                  ? "oklch(0.58 0.13 150)"
                  : visitStarted
                    ? "oklch(0.55 0.17 255)"
                    : "oklch(0.66 0.14 68)",
                value: fieldComplete ? "Done" : visitStarted ? "On site" : "Pending",
                valueBg: fieldComplete
                  ? "oklch(0.95 0.04 150)"
                  : visitStarted
                    ? "oklch(0.96 0.025 255)"
                    : "oklch(0.96 0.05 75)",
                valueFg: fieldComplete
                  ? "oklch(0.45 0.13 150)"
                  : visitStarted
                    ? "oklch(0.5 0.13 255)"
                    : "oklch(0.5 0.12 65)",
              },
              ...(isEccJob
                ? [
                    {
                      label: "Certs / compliance",
                      detail: certsComplete ? "Certificates sent" : "Certificate still open",
                      dot: certsComplete ? "oklch(0.58 0.13 150)" : "oklch(0.66 0.14 68)",
                      value: certsComplete ? "Done" : "Open",
                      valueBg: certsComplete ? "oklch(0.95 0.04 150)" : "oklch(0.96 0.05 75)",
                      valueFg: certsComplete ? "oklch(0.45 0.13 150)" : "oklch(0.5 0.12 65)",
                    },
                  ]
                : []),
              {
                label: "Billing resolved",
                detail: billedTruthSatisfied
                  ? (billingDisposition === "no_charge"
                      ? "Marked no-charge"
                      : billingDisposition === "externally_billed"
                        ? "Marked externally billed"
                        : billingState.internalInvoiceStatus === "issued"
                          ? "Invoice issued"
                          : "Invoice closed")
                  : (billingState.internalInvoiceStatus === "draft"
                      ? "Draft invoice in progress"
                      : "No invoice issued or external mark"),
                dot: billedTruthSatisfied
                  ? "oklch(0.58 0.13 150)"
                  : billingState.internalInvoiceStatus === "draft"
                    ? "oklch(0.66 0.14 68)"
                    : "oklch(0.7 0.02 262)",
                value: billedTruthSatisfied
                  ? "Done"
                  : billingState.internalInvoiceStatus === "draft"
                    ? "Draft"
                    : "Open",
                valueBg: billedTruthSatisfied
                  ? "oklch(0.95 0.04 150)"
                  : billingState.internalInvoiceStatus === "draft"
                    ? "oklch(0.97 0.045 75)"
                    : "oklch(0.96 0.004 250)",
                valueFg: billedTruthSatisfied
                  ? "oklch(0.45 0.13 150)"
                  : billingState.internalInvoiceStatus === "draft"
                    ? "oklch(0.5 0.1 65)"
                    : "oklch(0.55 0.015 262)",
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "13px 16px",
                  ...S.rowRule,
                }}
              >
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: row.dot,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)", marginTop: "1px" }}>
                    {row.detail}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "4px 9px",
                    borderRadius: "6px",
                    background: row.valueBg,
                    color: row.valueFg,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* invoice bar — state-derived; must agree with Closeout "Billing resolved" row above */}
          {billingDisposition ? (
            // externally_billed or no_charge — resolved, no further action
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px 20px",
                borderRadius: "11px",
                border: "1px solid oklch(0.88 0.05 150)",
                background: "oklch(0.97 0.025 150)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "oklch(0.58 0.13 150)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "13.5px", fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>
                {billingDisposition === "no_charge"
                  ? "Marked no-charge — no billing action needed."
                  : "Marked externally billed — billing recorded outside EveryStep."}
              </span>
            </div>
          ) : billingState.internalInvoiceStatus === "issued" ? (
            // issued invoice — view only, no create/external buttons
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={S.fieldLabel}>{invoiceDisplayRef} · Issued</div>
                <div style={{ fontFamily: S.mono, fontSize: "26px", fontWeight: 600, color: "oklch(0.45 0.13 150)", marginTop: "2px" }}>
                  {invoiceTotalFormatted}
                </div>
              </div>
              <Link
                href={`/jobs/${jobId}/invoice#invoice-workspace`}
                style={{
                  height: "42px",
                  padding: "0 18px",
                  borderRadius: "10px",
                  border: "1px solid oklch(0.88 0.05 150)",
                  background: "oklch(0.97 0.025 150)",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  color: "oklch(0.45 0.13 150)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                View Invoice
              </Link>
            </div>
          ) : billingState.internalInvoiceStatus === "draft" ? (
            // draft invoice — continue, no create/external buttons
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={S.fieldLabel}>Draft invoice</div>
                <div style={{ fontFamily: S.mono, fontSize: "26px", fontWeight: 600, marginTop: "2px" }}>
                  {invoiceTotalFormatted}
                </div>
              </div>
              <Link
                href={`/jobs/${jobId}/invoice#invoice-workspace`}
                style={{
                  height: "42px",
                  padding: "0 22px",
                  borderRadius: "10px",
                  border: "none",
                  background: "oklch(0.27 0.02 262)",
                  color: "#fff",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Continue Invoice
              </Link>
            </div>
          ) : (
            // unresolved — full action bar (missing invoice or void → actionable again)
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={S.fieldLabel}>Ready to invoice</div>
                <div style={{ fontFamily: S.mono, fontSize: "26px", fontWeight: 600, marginTop: "2px" }}>
                  {invoiceTotal}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {billingState.usesInternalInvoicing ? (
                  <form action={createInternalInvoiceDraftFromForm}>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="return_to" value={`/jobs/${jobId}/invoice#invoice-workspace`} />
                    <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                    <ImmediateSubmitButton
                      pendingText="Starting..."
                      className=""
                      style={{
                        height: "42px",
                        padding: "0 22px",
                        borderRadius: "10px",
                        border: "none",
                        background: "oklch(0.27 0.02 262)",
                        color: "#fff",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      Create Invoice
                    </ImmediateSubmitButton>
                  </form>
                ) : canShowInvoiceButton ? (
                  <form action={markInvoiceCompleteFromForm}>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <ImmediateSubmitButton
                      pendingText="Saving..."
                      className=""
                      style={{
                        height: "42px",
                        padding: "0 18px",
                        borderRadius: "10px",
                        border: "none",
                        background: "oklch(0.27 0.02 262)",
                        color: "#fff",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      External Billing Complete
                    </ImmediateSubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* ── FOLLOW-UP & SERVICE CHAIN ─────────────────────────────────────── */}
        <section
          id="followup"
          data-jobsection="followup"
          style={S.section}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}
          >
            <div style={S.sectionLabel}>Follow-Up &amp; Service Chain</div>
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.06em",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                background: "oklch(0.96 0.025 255)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              EVERYSTEP
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "40px" }}>
            {/* schedule a next visit */}
            <div>
              <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>Schedule a next visit</div>
              {canCreateReturnVisit || canCreateCallbackVisit ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  {canCreateReturnVisit ? (
                    <form action={createNextServiceVisitFromForm} style={{ flex: 1 }}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input
                        type="hidden"
                        name="next_visit_reason"
                        value={String(job.service_visit_reason ?? job.title ?? "").trim()}
                      />
                      <ImmediateSubmitButton
                        pendingText="Creating…"
                        className=""
                        style={{ ...(S.outlineBtn(true) as React.CSSProperties), width: "100%", justifyContent: "center" } as React.CSSProperties}
                      >
                        Return Visit
                      </ImmediateSubmitButton>
                    </form>
                  ) : null}
                  {canCreateCallbackVisit ? (
                    <form action={createCallbackVisitFromForm} style={{ flex: 1 }}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input
                        type="hidden"
                        name="callback_visit_reason"
                        value={String(job.service_visit_reason ?? job.title ?? "").trim()}
                      />
                      <ImmediateSubmitButton
                        pendingText="Creating…"
                        className=""
                        style={{ ...(S.outlineBtn(false) as React.CSSProperties), width: "100%", justifyContent: "center" } as React.CSSProperties}
                      >
                        Callback
                      </ImmediateSubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    padding: "11px 13px",
                    borderRadius: "9px",
                    border: "1px solid oklch(0.92 0.006 250)",
                    background: "oklch(0.98 0.003 250)",
                    fontSize: "12.5px",
                    lineHeight: 1.45,
                    color: "oklch(0.55 0.015 262)",
                  }}
                >
                  No service follow-up actions available for this job.
                </div>
              )}
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "oklch(0.55 0.015 262)",
                  marginTop: "12px",
                }}
              >
                A <strong style={{ color: "oklch(0.4 0.02 262)" }}>return</strong> continues
                unresolved service work.
                {canCreateCallbackVisit ? (
                  <>
                    {" "}A{" "}
                    <strong style={{ color: "oklch(0.4 0.02 262)" }}>callback</strong> opens a new
                    issue after completion.
                  </>
                ) : null}
              </div>
            </div>

            {/* EveryStep sync — interruption hub */}
            <div>
              <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>EveryStep sync</div>
              {waitingState !== null ? (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "11px",
                    border: "1px solid oklch(0.88 0.05 75)",
                    background: "oklch(0.97 0.03 75)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      color: "oklch(0.42 0.12 65)",
                      marginBottom: "6px",
                    }}
                  >
                    Active hold — {waitingState.blockerLabel}
                  </div>
                  <div
                    style={{ fontSize: "13px", fontWeight: 600, color: "oklch(0.4 0.02 262)" }}
                  >
                    {waitingState.blockerReason}
                  </div>
                  {waitingState.blockerType === "waiting_on_part" ? (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <form action={markServicePartOrderedFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                          Mark Part Ordered
                        </ImmediateSubmitButton>
                      </form>
                      <form action={markServicePartArrivedFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                          Mark Part Arrived
                        </ImmediateSubmitButton>
                      </form>
                    </div>
                  ) : waitingState.blockerType === "waiting_on_customer_approval" ? (
                    <form action={markServiceApprovalReceivedFromForm} style={{ marginTop: "12px" }}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                        Mark Approval Received
                      </ImmediateSubmitButton>
                    </form>
                  ) : null}
                  {/* Release / resume */}
                  <div
                    style={{
                      marginTop: "14px",
                      paddingTop: "12px",
                      borderTop: "1px solid oklch(0.88 0.1 70)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)" }}>
                      Resume job when hold is resolved.
                    </span>
                    <form action={releaseAndReevaluateFromForm}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ImmediateSubmitButton
                        pendingText="Releasing…"
                        className=""
                        style={{
                          height: "30px",
                          padding: "0 14px",
                          borderRadius: "7px",
                          border: "1px solid oklch(0.72 0.15 70)",
                          background: "#fff",
                          color: "oklch(0.5 0.12 65)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        } as React.CSSProperties}
                      >
                        Release Hold
                      </ImmediateSubmitButton>
                    </form>
                  </div>
                </div>
              ) : opsStatus === "on_hold" && String(job.on_hold_reason ?? "").trim() ? (
                // on_hold with unstructured reason (parseWaitingStateReason returned null)
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "11px",
                    border: "1px solid oklch(0.88 0.05 75)",
                    background: "oklch(0.97 0.03 75)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: "oklch(0.5 0.12 65)",
                      marginBottom: "6px",
                    }}
                  >
                    On Hold
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "oklch(0.4 0.02 262)" }}>
                    {String(job.on_hold_reason ?? "").trim()}
                  </div>
                  <div
                    style={{
                      marginTop: "14px",
                      paddingTop: "12px",
                      borderTop: "1px solid oklch(0.88 0.1 70)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)" }}>
                      Resume job when hold is resolved.
                    </span>
                    <form action={releaseAndReevaluateFromForm}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ImmediateSubmitButton
                        pendingText="Releasing…"
                        className=""
                        style={{
                          height: "30px",
                          padding: "0 14px",
                          borderRadius: "7px",
                          border: "1px solid oklch(0.72 0.15 70)",
                          background: "#fff",
                          color: "oklch(0.5 0.12 65)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        } as React.CSSProperties}
                      >
                        Release Hold
                      </ImmediateSubmitButton>
                    </form>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "9.5px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "oklch(0.46 0.025 262)",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      background: "oklch(0.97 0.004 250)",
                      border: "1px solid oklch(0.92 0.006 250)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "12px",
                    }}
                  >
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "oklch(0.72 0.015 262)", flexShrink: 0 }} />
                    No active hold
                  </div>
                  <InterruptionHub
                    jobId={jobId}
                    returnTo={returnTo}
                    action={updateJobOpsFromForm}
                  />
                </div>
              )}
            </div>
          </div>

          {canShowContractorReportPanel ? (
            <div style={{ marginTop: "24px" }}>
              <ContractorReportPanel jobId={jobId} />
            </div>
          ) : null}

          {/* follow-up reminder metadata */}
          <div style={{ marginTop: "24px", paddingTop: "22px", borderTop: "1px solid oklch(0.93 0.005 250)" }}>
            <div style={{ ...S.fieldLabel, marginBottom: "14px" }}>Follow-up reminder</div>
            <div
              style={{
                marginBottom: "14px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: hasFollowUpReminder
                  ? "1px solid oklch(0.85 0.06 255)"
                  : "1px solid oklch(0.92 0.006 250)",
                background: hasFollowUpReminder ? "oklch(0.97 0.02 255)" : "oklch(0.98 0.003 250)",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: hasFollowUpReminder ? "oklch(0.42 0.12 255)" : "oklch(0.55 0.015 262)",
                }}
              >
                {followUpReminderStatus}
              </div>
              <div style={{ marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: "oklch(0.48 0.02 262)" }}>
                {hasFollowUpReminder
                  ? "This is an internal reminder. It stays visible in Operations Follow Ups and highlights as the date approaches."
                  : "Add a date and reminder note when someone should come back to this job later."}
              </div>
            </div>
            <form action={updateJobOpsDetailsFromForm}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <div style={S.fieldLabel}>Action Required By</div>
                  <select
                    name="action_required_by"
                    defaultValue={String(job.action_required_by ?? "")}
                    style={{
                      width: "100%",
                      height: "34px",
                      borderRadius: "8px",
                      border: "1px solid oklch(0.88 0.006 250)",
                      padding: "0 10px",
                      fontSize: "12.5px",
                      fontFamily: "inherit",
                      color: "oklch(0.33 0.02 262)",
                      background: "#fff",
                      appearance: "auto",
                    } as React.CSSProperties}
                  >
                    <option value="">—</option>
                    <option value="rater">Rater</option>
                    <option value="contractor">Contractor</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>
                <div>
                <div style={S.fieldLabel}>Reminder Date</div>
                  <input
                    type="date"
                    name="follow_up_date"
                    defaultValue={String(job.follow_up_date ?? "")}
                    style={{
                      width: "100%",
                      height: "34px",
                      borderRadius: "8px",
                      border: "1px solid oklch(0.88 0.006 250)",
                      padding: "0 10px",
                      fontSize: "12.5px",
                      fontFamily: "inherit",
                      color: "oklch(0.33 0.02 262)",
                      background: "#fff",
                      boxSizing: "border-box",
                    } as React.CSSProperties}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "10px" }}>
                <div style={S.fieldLabel}>Reminder Note</div>
                <textarea
                  name="next_action_note"
                  defaultValue={String(job.next_action_note ?? "")}
                  rows={3}
                  placeholder="What should the office remember to do later?"
                  style={{
                    width: "100%",
                    borderRadius: "8px",
                    border: "1px solid oklch(0.88 0.006 250)",
                    padding: "8px 10px",
                    fontSize: "12.5px",
                    fontFamily: "inherit",
                    color: "oklch(0.33 0.02 262)",
                    background: "#fff",
                    resize: "vertical",
                    boxSizing: "border-box",
                  } as React.CSSProperties}
                />
              </div>
              <button
                type="submit"
                style={{
                  height: "34px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.85 0.04 255)",
                  background: "oklch(0.97 0.02 255)",
                  color: "oklch(0.45 0.14 255)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Save Reminder
              </button>
            </form>
          </div>

          {/* service chain */}
          <div style={{ marginTop: "24px" }}>
            <div style={{ ...S.fieldLabel, marginBottom: "12px" }}>Service chain</div>
            {/* current job node */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span
                style={{
                  fontFamily: S.mono,
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  padding: "5px 12px",
                  borderRadius: "20px",
                  background: "oklch(0.27 0.02 262)",
                  color: "#fff",
                }}
              >
                THIS JOB · {jobDisplayRef}
              </span>
              {serviceCaseId ? (
                <span style={{ fontSize: "13px", color: "oklch(0.65 0.015 262)" }}>↓</span>
              ) : null}
            </div>
            <Suspense
              fallback={
                <div
                  style={{
                    padding: "13px 0",
                    fontSize: "13px",
                    color: "oklch(0.62 0.015 262)",
                    ...S.rowRule,
                  }}
                >
                  Loading service chain…
                </div>
              }
            >
              {serviceCaseId ? (
                <DeferredServiceChainPanelBody
                  currentJobId={jobId}
                  accountOwnerUserId={accountOwnerUserId}
                  serviceCaseId={serviceCaseId}
                  emptyStateClassName="text-sm text-slate-500 py-3"
                />
              ) : (
                <div style={{ fontSize: "13px", color: "oklch(0.62 0.015 262)", padding: "3px 0" }}>
                  No service chain linked
                </div>
              )}
            </Suspense>
          </div>
        </section>

        {/* ── ECC/HERS WORK REQUEST (active sender connection only) ─────────── */}
        {hasActiveRaterWorkshareConnection ? (
          <EccHersRequestSection
            jobId={jobId}
            returnTo={returnTo}
            connections={workshareConnectionOptions}
            requests={workshareRequests ?? []}
            defaultScope={workshareDefaultScope}
            notice={param(sp, "notice")}
            raterNameById={workshareRaterNameById}
          />
        ) : null}

        {/* ── WORKSHARE PARTNER (receiver side of an accepted request) ─────── */}
        {receiverWorkshareRequest ? (
          <ReceiverWorksharePanel
            request={receiverWorkshareRequest}
            senderCompanyName={receiverWorkshareSenderName}
            receivingJobId={jobId}
            currentResult={receiverWorkshareCurrentResult}
          />
        ) : null}

        {/* ── ECC & COMPLIANCE (ECC jobs only) ─────────────────────────────── */}
        {isEccJob ? (
          <section
            id="compliance"
            data-jobsection="compliance"
            style={S.section}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}
            >
              <div style={S.sectionLabel}>ECC &amp; Compliance</div>
            </div>
            <div
              style={{
                border: "1px solid oklch(0.93 0.005 250)",
                borderRadius: "11px",
                overflow: "hidden",
              }}
            >
              {[
                {
                  label: "Permit number",
                  value: isValidEccPermitNumber(job.permit_number) ? String(job.permit_number) : "Missing",
                  isOk: isValidEccPermitNumber(job.permit_number),
                },
                {
                  label: "Tests complete",
                  value: completedEccRuns > 0 ? `${completedEccRuns} run${completedEccRuns !== 1 ? "s" : ""}` : "0 runs",
                  isOk: completedEccRuns > 0,
                },
                {
                  label: "Certs sent",
                  value: certsComplete ? "Sent" : "Not yet",
                  isOk: certsComplete,
                },
                ...(opsStatus === "retest_needed" || hasFailedEccRun
                  ? [{
                      label: "Retest",
                      value: opsStatus === "retest_needed" ? "Required" : "N/A",
                      isOk: opsStatus !== "retest_needed",
                    }]
                  : []),
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    ...S.rowRule,
                  }}
                >
                  <span
                    style={{ fontSize: "13.5px", fontWeight: 500, color: "oklch(0.38 0.02 262)" }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontFamily: S.mono,
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "4px 9px",
                      borderRadius: "6px",
                      background: row.isOk ? "oklch(0.96 0.004 250)" : "oklch(0.96 0.05 75)",
                      color: row.isOk ? "oklch(0.55 0.015 262)" : "oklch(0.5 0.12 65)",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <Link
                href={`/jobs/${jobId}/tests`}
                style={{
                  height: "38px",
                  padding: "0 18px",
                  borderRadius: "9px",
                  border: "none",
                  background: "oklch(0.55 0.17 255)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Open Tests Workspace
              </Link>
              <PermitForm
                jobId={jobId}
                returnTo={returnTo}
                currentPermitNumber={isValidEccPermitNumber(job.permit_number) ? String(job.permit_number) : null}
                action={markEccPermitAvailableFromForm}
              />
            </div>

            {showConfirmRetestReady ? (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  borderRadius: "11px",
                  border: "1px solid oklch(0.85 0.06 65)",
                  background: "oklch(0.98 0.02 75)",
                }}
              >
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "oklch(0.42 0.12 55)" }}>
                  Confirm Retest Ready
                </div>
                <p style={{ marginTop: "5px", fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.5 0.06 60)" }}>
                  Confirm the corrections are done so this job is ready for another ECC test visit. This moves
                  it into retest scheduling.
                </p>
                <form action={confirmEccRetestReadyFromForm} style={{ marginTop: "12px" }}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <ImmediateSubmitButton
                    pendingText="Confirming…"
                    className=""
                    style={{ ...(S.outlineBtn(true) as React.CSSProperties) } as React.CSSProperties}
                  >
                    Confirm Retest Ready
                  </ImmediateSubmitButton>
                </form>
              </div>
            ) : null}

            {showScheduleRetest ? (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  borderRadius: "11px",
                  border: "1px solid oklch(0.85 0.06 65)",
                  background: "oklch(0.98 0.02 75)",
                }}
              >
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "oklch(0.42 0.12 55)" }}>
                  Schedule Retest
                </div>
                <p style={{ marginTop: "5px", fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.5 0.06 60)" }}>
                  Schedule a linked retest visit now, or move it to the scheduling queue.
                </p>
                <form
                  action={scheduleRetestNowFromForm}
                  style={{
                    marginTop: "12px",
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid oklch(0.9 0.02 75)",
                    background: "#fff",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <input type="hidden" name="parent_job_id" value={jobId} />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "oklch(0.34 0.02 262)" }}>
                    <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
                    <span>Copy equipment from original</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "10px" }}>
                    <label style={{ ...(S.fieldLabel as React.CSSProperties), display: "grid", gap: "5px", marginBottom: 0 }}>
                      Date
                      <input
                        type="date"
                        name="scheduled_date"
                        required
                        style={{
                          height: "38px",
                          borderRadius: "9px",
                          border: "1px solid oklch(0.9 0.006 250)",
                          padding: "0 10px",
                          fontSize: "13px",
                          fontFamily: "inherit",
                          fontWeight: 400,
                          color: "oklch(0.3 0.02 262)",
                        }}
                      />
                    </label>
                    <label style={{ ...(S.fieldLabel as React.CSSProperties), display: "grid", gap: "5px", marginBottom: 0 }}>
                      Start
                      <input
                        type="time"
                        name="window_start"
                        style={{
                          height: "38px",
                          borderRadius: "9px",
                          border: "1px solid oklch(0.9 0.006 250)",
                          padding: "0 10px",
                          fontSize: "13px",
                          fontFamily: "inherit",
                          fontWeight: 400,
                          color: "oklch(0.3 0.02 262)",
                        }}
                      />
                    </label>
                    <label style={{ ...(S.fieldLabel as React.CSSProperties), display: "grid", gap: "5px", marginBottom: 0 }}>
                      End
                      <input
                        type="time"
                        name="window_end"
                        style={{
                          height: "38px",
                          borderRadius: "9px",
                          border: "1px solid oklch(0.9 0.006 250)",
                          padding: "0 10px",
                          fontSize: "13px",
                          fontFamily: "inherit",
                          fontWeight: 400,
                          color: "oklch(0.3 0.02 262)",
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <ImmediateSubmitButton
                      pendingText="Scheduling…"
                      className=""
                      style={{ ...(S.outlineBtn(true) as React.CSSProperties) } as React.CSSProperties}
                    >
                      Schedule Retest Now
                    </ImmediateSubmitButton>
                    <ImmediateSubmitButton
                      formNoValidate
                      formAction={async (formData: FormData) => {
                        "use server";
                        await createRetestJobFromForm(formData);
                      }}
                      pendingText="Creating…"
                      className=""
                      style={{ ...(S.outlineBtn(false) as React.CSSProperties) } as React.CSSProperties}
                    >
                      Move to Needs Scheduling
                    </ImmediateSubmitButton>
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── RECORDS ───────────────────────────────────────────────────────── */}
        <section
          id="records"
          data-jobsection="records"
          style={{ ...S.section, paddingBottom: "36px" }}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "16px" }}>Records</div>
          <RecordsTabs
            tabs={
              [
                {
                  id: "timeline",
                  label: "Timeline",
                  count: String(timelineCount),
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading timeline…
                        </div>
                      }
                    >
                      <DeferredTimelineBody
                        jobId={jobId}
                        timelineJobIds={timelineJobIds}
                        hasDirectNarrativeChain={hasDirectNarrativeChain}
                        emptyStateClassName="text-sm text-slate-500 py-3"
                        jobSummary={{
                          id: jobId,
                          status: status,
                          ops_status: opsStatus,
                          field_complete: job.field_complete,
                          scheduled_date: job.scheduled_date,
                          window_start: job.window_start,
                          window_end: job.window_end,
                        }}
                      />
                    </Suspense>
                  ),
                },
                {
                  id: "attachments",
                  label: "Attachments",
                  count: String(attachmentCount),
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading attachments…
                        </div>
                      }
                    >
                      <DeferredJobAttachmentsInternal
                        jobId={jobId}
                        accountOwnerUserId={accountOwnerUserId}
                      />
                    </Suspense>
                  ),
                },
                {
                  id: "equipment",
                  label: "Equipment",
                  count: `${equipmentRows.length}`,
                  content: (
                    <div style={{ padding: "4px 0" }}>
                      {equipmentRows.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {equipmentRows.map((eq) => (
                            <div
                              key={eq.id}
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "13px",
                                color: "oklch(0.38 0.02 262)",
                              }}
                            >
                              <span>
                                {buildEquipmentIdentityLabel(eq)}
                                {eq.system_location ? ` — ${eq.system_location}` : ""}
                              </span>
                              {equipmentIdsWithLabelPhoto.has(String(eq.id)) ? (
                                <span
                                  style={{
                                    fontFamily: S.mono,
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    background: "oklch(0.95 0.045 150)",
                                    color: "oklch(0.42 0.11 150)",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Photo captured
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          No equipment records.
                        </div>
                      )}
                      <div style={{ marginTop: "12px" }}>
                        <Link
                          href={`/jobs/${jobId}/info?f=equipment`}
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "oklch(0.5 0.13 255)",
                            textDecoration: "none",
                          }}
                        >
                          Manage equipment →
                        </Link>
                      </div>
                    </div>
                  ),
                } satisfies RecordTab,
                {
                  id: "permit",
                  label: "Permit",
                  count: isValidEccPermitNumber(job.permit_number)
                    ? String(job.permit_number)
                    : "Not added",
                  content: (() => {
                    const hasPermit = isValidEccPermitNumber(job.permit_number);
                    const permitNumber = hasPermit ? String(job.permit_number) : null;
                    const jurisdiction = String(job.jurisdiction ?? "").trim() || null;
                    const permitDate = String(job.permit_date ?? "").trim() || null;

                    const rows: Array<{ label: string; value: string | null }> = [
                      { label: "Permit number", value: permitNumber },
                      { label: "Jurisdiction", value: jurisdiction },
                      { label: "Issue date", value: permitDate ? formatBusinessDateUS(permitDate) : null },
                    ];

                    return (
                      <div style={{ padding: "4px 0" }}>
                        {hasPermit ? (
                          <div
                            style={{
                              border: "1px solid oklch(0.93 0.005 250)",
                              borderRadius: "11px",
                              overflow: "hidden",
                            }}
                          >
                            {rows.map((row) => (
                              <div
                                key={row.label}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "12px 16px",
                                  ...S.rowRule,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "oklch(0.45 0.02 262)",
                                  }}
                                >
                                  {row.label}
                                </span>
                                <span
                                  style={{
                                    fontFamily: S.mono,
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: row.value ? "oklch(0.33 0.02 262)" : "oklch(0.65 0.015 262)",
                                  }}
                                >
                                  {row.value ?? "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "oklch(0.62 0.015 262)",
                              padding: "3px 0",
                            }}
                          >
                            No permit on record.
                            {isEccJob ? (
                              <>
                                {" "}
                                <Link
                                  href={`/jobs/${jobId}/tests`}
                                  style={{
                                    color: "oklch(0.5 0.13 255)",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                  }}
                                >
                                  Add via ECC workspace →
                                </Link>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })(),
                } satisfies RecordTab,
                ...(isEccJob
                  ? [
                      {
                        id: "ecc",
                        label: "ECC",
                        count: `${completedEccRuns} runs`,
                        content: (
                          <div style={{ padding: "4px 0" }}>
                            <Link
                              href={`/jobs/${jobId}/tests`}
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "oklch(0.5 0.13 255)",
                                textDecoration: "none",
                              }}
                            >
                              Open Tests Workspace →
                            </Link>
                          </div>
                        ),
                      } satisfies RecordTab,
                    ]
                  : []),
                {
                  id: "chain",
                  label: "Service Chain",
                  count: serviceCaseId ? "linked" : "—",
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading chain…
                        </div>
                      }
                    >
                      {serviceCaseId ? (
                        <DeferredServiceChainPanelBody
                          currentJobId={jobId}
                          accountOwnerUserId={accountOwnerUserId}
                          serviceCaseId={serviceCaseId}
                          emptyStateClassName="text-sm text-slate-500 py-3"
                        />
                      ) : (
                        <div style={{ fontSize: "13px", color: "oklch(0.62 0.015 262)", padding: "3px 0" }}>
                          No service chain linked
                        </div>
                      )}
                    </Suspense>
                  ),
                },
              ] satisfies RecordTab[]
            }
          />
        </section>
      </div>

      {/* ── RIGHT: command rail ────────────────────────────────────────────── */}
      <aside
        style={{
          position: "sticky",
          top: DESKTOP_STICKY_HEADER_OFFSET,
          alignSelf: "start",
          display: "flex",
          flexDirection: "column",
          padding: "24px 0",
          height: `calc(100dvh - ${DESKTOP_STICKY_HEADER_OFFSET} - 16px)`,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: "0 0 auto", minWidth: 0 }}>
        {canShowEccFailedReasonBanner ? (
          <details
            id="failed-reason-banner"
            style={{
              marginTop: "14px",
              padding: "12px",
              borderRadius: "11px",
              border: "1px solid oklch(0.88 0.08 20)",
              background: "oklch(0.97 0.025 20)",
              color: "oklch(0.38 0.09 20)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: S.mono,
                    fontSize: "9.5px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "oklch(0.42 0.12 20)",
                  }}
                >
                  Failed Reason
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: "5px",
                    fontSize: "13px",
                    lineHeight: 1.45,
                    fontWeight: 700,
                    color: "oklch(0.31 0.08 20)",
                  }}
                >
                  {failedReasonBannerText}
                </span>
              </span>
              <span
                style={{
                  flexShrink: 0,
                  borderRadius: "999px",
                  border: "1px solid oklch(0.84 0.075 20)",
                  background: "rgba(255,255,255,0.76)",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "oklch(0.42 0.12 20)",
                }}
              >
                Edit
              </span>
            </summary>
            <form action={updateJobOpsDetailsFromForm} style={{ marginTop: "12px" }}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="return_to" value={`${returnTo}#failed-reason-banner`} />
              <div style={{ ...S.fieldLabel, color: "oklch(0.45 0.11 20)", marginBottom: "7px" }}>
                Failed reason banner
              </div>
              <textarea
                name="ops_board_failure_note"
                defaultValue={String((job as any).ops_board_failure_note ?? "")}
                maxLength={240}
                rows={3}
                placeholder="Waiting on correction photos"
                style={{
                  width: "100%",
                  minHeight: "74px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.84 0.075 20)",
                  padding: "8px 10px",
                  fontSize: "12.5px",
                  fontFamily: "inherit",
                  color: "oklch(0.33 0.02 262)",
                  background: "#fff",
                  resize: "vertical",
                  boxSizing: "border-box",
                } as React.CSSProperties}
              />
              <div
                style={{
                  marginTop: "6px",
                  fontSize: "11.5px",
                  lineHeight: 1.45,
                  color: "oklch(0.42 0.08 20)",
                }}
              >
                Shown on internal Failed queue cards for quick review.
              </div>
              <ImmediateSubmitButton
                pendingText="Saving..."
                className=""
                style={{
                  marginTop: "10px",
                  height: "32px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.84 0.075 20)",
                  background: "#fff",
                  color: "oklch(0.38 0.1 20)",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                } as React.CSSProperties}
              >
                Save Failed Reason
              </ImmediateSubmitButton>
            </form>
          </details>
        ) : null}

        {/* NEXT ACTION group */}
        <div
          style={{
            marginTop: "18px",
            paddingBottom: "18px",
            borderBottom: "1px solid oklch(0.88 0.008 250)",
          }}
        >
          {/* amber label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "oklch(0.72 0.15 70)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "oklch(0.42 0.12 65)",
              }}
            >
              Next Action
            </span>
          </div>
          {/* plain-language sentence */}
          <div
            style={{
              fontSize: "13.5px",
              lineHeight: 1.5,
              color: "oklch(0.32 0.02 262)",
              fontWeight: 500,
              marginBottom: "14px",
            }}
          >
            {nextActionSentence}
          </div>
          {/* stacked action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {/* Primary button */}
            {!isTerminal ? (
              <FieldStatusAdvanceForm
                jobId={jobId}
                returnTo={returnTo}
                currentStatus={status}
                hasFullSchedule={hasFullSchedule}
                buttonStyle={S.primaryBtn as React.CSSProperties}
              >
                {status === "in_process"
                  ? "Finish Visit"
                  : status === "on_the_way"
                    ? "Mark On Site"
                    : "Mark On the Way"}
              </FieldStatusAdvanceForm>
            ) : fieldComplete && closeoutNeeds.needsCerts && canShowCertsButton ? (
              <form action={markCertsCompleteFromForm}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="return_to" value={returnTo} />
                <ImmediateSubmitButton
                  pendingText="Saving…"
                  className=""
                  style={{
                    ...(S.primaryBtn as React.CSSProperties),
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  Certs were sent
                </ImmediateSubmitButton>
              </form>
            ) : fieldComplete && closeoutNeeds.needsInvoice && (billingState.internalInvoicePanelEnabled || canShowInvoiceButton) ? (
              renderCloseoutBillingAction(S.primaryBtn as React.CSSProperties)
            ) : fieldComplete ? (
              <div
                style={{
                  padding: "9px 13px",
                  borderRadius: "9px",
                  border: isFailedUnresolved
                    ? "1px solid oklch(0.88 0.05 75)"
                    : "1px solid oklch(0.88 0.06 150)",
                  background: isFailedUnresolved
                    ? "oklch(0.97 0.025 75)"
                    : "oklch(0.97 0.03 150)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: isFailedUnresolved
                    ? "oklch(0.42 0.09 75)"
                    : "oklch(0.42 0.1 150)",
                  textAlign: "center",
                }}
              >
                {isFailedUnresolved
                  ? "Field Complete - Pending"
                  : closeoutNeeds.needsInvoice || closeoutNeeds.needsCerts
                  ? "Field Complete"
                  : "Closed out"}
              </div>
            ) : null}
            {/* Secondary button */}
            {!isTerminal ? (
              <SchedulePanel
                jobId={jobId}
                returnTo={returnTo}
                scheduledDate={String(job.scheduled_date ?? "")}
                windowStart={String(job.window_start ?? "")}
                windowEnd={String(job.window_end ?? "")}
                status={String(job.status ?? "")}
                action={updateJobScheduleFromForm}
              />
            ) : fieldComplete && closeoutNeeds.needsCerts && canShowCertsButton && closeoutNeeds.needsInvoice && (billingState.internalInvoicePanelEnabled || canShowInvoiceButton) ? (
              renderCloseoutBillingAction(S.outlineBtn(false) as React.CSSProperties, { secondary: true })
            ) : null}
          </div>
        </div>

        {/* jump nav — scroll-spy */}
        </div>

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            minWidth: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            paddingBottom: "8px",
          }}
        >
        <ScrollSpyNav items={navItems} />

        {/* blockers */}
        {blockers.length > 0 ? (
          <div
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid oklch(0.88 0.008 250)",
            }}
          >
            <div
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "oklch(0.42 0.12 65)",
                marginBottom: "12px",
              }}
            >
              {blockers.length} item{blockers.length === 1 ? "" : "s"} block closeout
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {blockers.map((b) => (
                <div
                  key={b}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "oklch(0.36 0.025 262)",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "oklch(0.72 0.15 70)",
                      flexShrink: 0,
                    }}
                  />
                  {b}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* quick links */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "18px",
            borderTop: "1px solid oklch(0.88 0.008 250)",
          }}
        >
          <div
            style={{
              fontFamily: S.mono,
              fontSize: "9.5px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "oklch(0.46 0.025 262)",
              marginBottom: "6px",
            }}
          >
            Quick Links
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(
              [
                { href: `/customers/${job.customer_id}`, label: "Open Customer", show: Boolean(job.customer_id) },
                { href: createEstimateFromJobHref ?? "", label: "Create Estimate", show: Boolean(createEstimateFromJobHref) },
                { href: addServicePlanHref ?? "", label: "Add Service Plan", show: Boolean(addServicePlanHref) },
                { href: `/jobs/${jobId}/tests`, label: "Open Tests Workspace", show: isEccJob && fieldComplete },
                { href: `/jobs/${jobId}/tests?t=completion_report`, label: "Completion Report", show: isEccJob && hasCompletedEccTest },
              ] as Array<{ href: string; label: string; show: boolean }>
            )
              .filter((item) => item.show)
              .map(({ href, label }) => (
                <Link
                  key={label}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "oklch(0.34 0.025 262)",
                    textDecoration: "none",
                    borderBottom: "1px solid oklch(0.95 0.004 250)",
                  }}
                >
                  {label}
                  <span style={{ fontSize: "11px", color: "oklch(0.65 0.015 262)", flexShrink: 0 }}>↗</span>
                </Link>
              ))}
            {canShowReviewAsk && reviewAskMailtoHref ? (
              <a
                href={reviewAskMailtoHref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "oklch(0.55 0.13 70)",
                  textDecoration: "none",
                  borderBottom: "1px solid oklch(0.95 0.004 250)",
                }}
              >
                Email Review Request
                <span style={{ fontSize: "11px", color: "oklch(0.7 0.1 70)", flexShrink: 0 }}>✉</span>
              </a>
            ) : null}
            {canShowReviewAsk && reviewAskSmsHref ? (
              <a
                href={reviewAskSmsHref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "oklch(0.55 0.13 70)",
                  textDecoration: "none",
                  borderBottom: "1px solid oklch(0.95 0.004 250)",
                }}
              >
                Text Review Request
                <span style={{ fontSize: "11px", color: "oklch(0.7 0.1 70)", flexShrink: 0 }}>↗</span>
              </a>
            ) : null}
          </div>
        </div>

        {isAdmin ? (
          <details
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid oklch(0.88 0.008 250)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                fontFamily: S.mono,
                fontSize: "9.5px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "oklch(0.46 0.13 25)",
              }}
            >
              Danger Zone
            </summary>
            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gap: "10px",
                borderRadius: "11px",
                border: "1px solid oklch(0.9 0.04 25)",
                background: "oklch(0.98 0.012 25)",
                padding: "12px",
              }}
            >
              <div style={{ fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.42 0.05 25)" }}>
                Archive hides this job across Ops, portal, and searches. Cancel keeps the job visible as cancelled.
              </div>
              <form action={archiveJobFromForm}>
                <input type="hidden" name="job_id" value={jobId} />
                <button
                  type="submit"
                  style={{
                    minHeight: "38px",
                    width: "100%",
                    borderRadius: "9px",
                    border: "1px solid oklch(0.72 0.16 25)",
                    background: "oklch(0.58 0.18 25)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Archive Job
                </button>
              </form>
              {!["completed", "failed", "cancelled"].includes(status) ? (
                <CancelJobButton jobId={jobId} />
              ) : null}
            </div>
          </details>
        ) : null}
        </div>
      </aside>
    </div>
    </div>
  );
}
