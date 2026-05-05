
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formatWaitingStateReason,
  getActiveWaitingState,
  getPendingInfoSignal,
  getWaitingStateLabel,
  parseWaitingStateReason,
  parseWaitingStateType,
  resolveOpsStatus,
} from "@/lib/utils/ops-status";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { forceSetOpsStatus } from "@/lib/actions/ops-status";
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from "@/lib/actions/job-evaluator";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import {
  insertInternalNotificationForEvent,
} from "@/lib/actions/notification-actions";
import {
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { resolveAppUrl, renderSystemEmailLayout, escapeHtml } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { reconcileServiceCaseStatusAfterJobChange } from "@/lib/actions/service-case-reconciliation";
import {
  extractFailureDetails,
  extractFailureReasons,
  finalRunPass,
  type ContractorFailureDetail,
} from "@/lib/portal/resolveContractorIssues";
export type { ContractorFailureDetail } from "@/lib/portal/resolveContractorIssues";

const OPS_STATUSES = [
  "need_to_schedule",
  "scheduled",
  "pending_info",
  "pending_office_review",
  "on_hold",
  "failed",
  "retest_needed",
  "field_complete",
  "paperwork_required",
  "invoice_required",
  "closed",
] as const;

type OpsStatus = (typeof OPS_STATUSES)[number];

function isOpsStatus(value: unknown): value is OpsStatus {
  return typeof value === 'string' && (OPS_STATUSES as readonly string[]).includes(value);
}


const ACTION_REQUIRED_BY = ['rater', 'contractor', 'customer'] as const;
type ActionRequiredBy = (typeof ACTION_REQUIRED_BY)[number];

function isActionRequiredBy(value: unknown): value is ActionRequiredBy {
  return typeof value === 'string' && (ACTION_REQUIRED_BY as readonly string[]).includes(value);
}

type OpsSnapshot = {
  ops_status: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
};

function hasExplicitPendingInfo(snapshot: Pick<OpsSnapshot, "ops_status" | "pending_info_reason">): boolean {
  return (
    String(snapshot.ops_status ?? "").trim().toLowerCase() === "pending_info" ||
    typeof snapshot.pending_info_reason === "string" && snapshot.pending_info_reason.trim().length > 0
  );
}

function hasExplicitOnHold(snapshot: Pick<OpsSnapshot, "ops_status" | "on_hold_reason">): boolean {
  return (
    String(snapshot.ops_status ?? "").trim().toLowerCase() === "on_hold" ||
    (typeof snapshot.on_hold_reason === "string" && snapshot.on_hold_reason.trim().length > 0)
  );
}

async function requireInternalOpsAccessOrRedirect(
  supabase: any,
  userId: string,
  jobId: string,
) {
  try {
    const authz = await requireInternalUser({ supabase, userId });
    const scopedJob = await loadScopedInternalJobForMutation({
      accountOwnerUserId: authz.internalUser.account_owner_user_id,
      jobId,
      select: "id",
    });

    if (!scopedJob?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return authz;
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    throw error;
  }
}

async function requireOperationalJobOpsEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
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

async function recomputeOpsAfterCloseoutMutation(supabase: any, jobId: string): Promise<string | null> {
  await evaluateJobOpsStatus(jobId);
  await healStalePaperworkOpsStatus(jobId);

  const { data: refreshed, error: refreshedErr } = await supabase
    .from("jobs")
    .select("ops_status")
    .eq("id", jobId)
    .single();

  if (refreshedErr) throw new Error(refreshedErr.message);
  return refreshed?.ops_status ?? null;
}

type ContractorReportKind = "failed" | "pending_info";

export type ContractorReportPreview = {
  title: string;
  location_text: string;
  customer_name: string;
  contractor_name: string | null;
  default_recipient_email: string | null;
  service_date_text: string;
  reasons: string[];
  failure_details: ContractorFailureDetail[];
  next_step: string;
  body_text: string;
  contractor_failure_summary_v1: ContractorFailureSummaryV1;
};

type ContractorReportResolved = ContractorReportPreview & {
  report_kind: ContractorReportKind;
  ops_status: string;
};

export type ContractorFailureSummaryV1 = {
  version: 1;
  report_kind: ContractorReportKind;
  what_failed: string;
  what_needs_correction: string[];
  next_step: string;
  contractor_safe_summary: string | null;
};

function formatServiceDateText(job: any, failedRunCreatedAt?: string | null) {
  const scheduledDate = String(job?.scheduled_date ?? "").trim();
  const windowStart = String(job?.window_start ?? "").trim();
  const windowEnd = String(job?.window_end ?? "").trim();

  if (scheduledDate && windowStart && windowEnd) {
    return `${scheduledDate} ${windowStart.slice(0, 5)}-${windowEnd.slice(0, 5)}`;
  }

  if (scheduledDate) return scheduledDate;

  if (failedRunCreatedAt) {
    const d = new Date(failedRunCreatedAt);
    if (Number.isFinite(d.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    }
  }

  return "Service/Test date not available";
}

function formatLocationText(job: any) {
  const loc = Array.isArray(job?.locations)
    ? job.locations.find((x: any) => x) ?? null
    : job?.locations ?? null;

  const addressLine =
    String(loc?.address_line1 ?? "").trim() ||
    String(job?.job_address ?? "").trim();

  const city = String(loc?.city ?? "").trim() || String(job?.city ?? "").trim();
  const state = String(loc?.state ?? "").trim();
  const zip = String(loc?.zip ?? "").trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  if (addressLine && cityStateZip) return `${addressLine}, ${cityStateZip}`;
  if (addressLine) return addressLine;
  if (cityStateZip) return cityStateZip;
  return "Location not available";
}

function buildReportBody(args: {
  title: string;
  locationText: string;
  reasons: string[];
  failureDetails?: ContractorFailureDetail[];
  nextStep: string;
  contractorSummary?: string | null;
  contractorNote?: string | null;
}) {
  const summary = String(args.contractorSummary ?? "").trim();
  const note = String(args.contractorNote ?? "").trim();

  let contentBlock: string;
  if (args.failureDetails && args.failureDetails.length > 0) {
    contentBlock = args.failureDetails
      .map((d) => `${d.headline}\n${d.detail_lines.join("\n")}`)
      .join("\n\n");
  } else {
    const reasonLabel = args.reasons.length === 1 ? "Reason" : "Reasons";
    contentBlock = `${reasonLabel}:\n${args.reasons.map((r) => `- ${r}`).join("\n")}`;
  }

  const sections = [
    args.title,
    `Location: ${args.locationText}`,
    contentBlock,
    `Next Step:\n${args.nextStep}`,
  ];

  if (summary) sections.push(`Summary:\n${summary}`);
  if (note) sections.push(`Contractor Note:\n${note}`);

  return sections.join("\n\n");
}

function sanitizeContractorSummary(raw: unknown) {
  if (typeof raw !== "string") return null;
  const sanitized = raw.replace(/\u0000/g, "").trim();
  if (!sanitized) return null;
  return sanitized.slice(0, 2000);
}

function buildContractorFailureSummaryV1(args: {
  reportKind: ContractorReportKind;
  reasons: string[];
  nextStep: string;
  contractorSummary?: string | null;
}): ContractorFailureSummaryV1 {
  const whatFailed =
    args.reportKind === "failed"
      ? "One or more test checks did not pass."
      : "Additional information is required before the job can continue.";

  return {
    version: 1,
    report_kind: args.reportKind,
    what_failed: whatFailed,
    what_needs_correction: args.reasons,
    next_step: args.nextStep,
    contractor_safe_summary: sanitizeContractorSummary(args.contractorSummary),
  };
}

function buildContractorReportEmailHtml(args: {
  title: string;
  customerName: string;
  locationText: string;
  serviceDateText: string;
  contractorName: string | null;
  reasons: string[];
  failureDetails: ContractorFailureDetail[];
  nextStep: string;
  contractorSummary?: string | null;
  contractorNote?: string | null;
  portalJobUrl?: string | null;
  supportDisplayName: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
}) {
  const summary = String(args.contractorSummary ?? "").trim();
  const note = String(args.contractorNote ?? "").trim();
  const portalUrl = String(args.portalJobUrl ?? "").trim();
  const supportDetails = [args.supportPhone, args.supportEmail].filter(Boolean).join(" • ");
  const supportLine = supportDetails
    ? `${escapeHtml(args.supportDisplayName)} (${escapeHtml(supportDetails)})`
    : escapeHtml(args.supportDisplayName);

  const issuesHtml = args.failureDetails.length > 0
    ? args.failureDetails
        .map((detail) => {
          const lines = detail.detail_lines
            .map((line) => `<li style="margin: 0 0 4px 0;">${escapeHtml(line)}</li>`)
            .join("");
          return `
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 12px; margin: 0 0 10px 0;">
              <div style="margin: 0 0 6px 0; font-weight: 700; color: #0f172a;">${escapeHtml(detail.headline)}</div>
              <ul style="margin: 0; padding-left: 18px; color: #334155;">${lines}</ul>
            </div>
          `;
        })
        .join("")
    : `<ul style="margin: 0; padding-left: 18px; color: #334155;">${args.reasons
        .map((reason) => `<li style="margin: 0 0 4px 0;">${escapeHtml(reason)}</li>`)
        .join("")}</ul>`;

  const ctaSection = portalUrl
    ? `
      <p style="margin: 0 0 8px 0;">
        <a href="${escapeHtml(portalUrl)}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 6px; font-weight: 600;">Open Contractor Portal</a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #475569;">If the button does not open, copy and paste this link: ${escapeHtml(portalUrl)}</p>
    `
    : `
      <p style="margin: 16px 0 0 0;">Review and submit your response in the portal.</p>
      <p style="margin: 8px 0 0 0;">Please open your contractor portal to review and respond.</p>
    `;

  const summaryBlock = summary
    ? `<p style="margin: 14px 0 0 0;"><strong>Summary:</strong><br />${escapeHtml(summary).replace(/\n/g, "<br />")}</p>`
    : "";

  const noteBlock = note
    ? `<p style="margin: 14px 0 0 0;"><strong>Additional Note:</strong><br />${escapeHtml(note).replace(/\n/g, "<br />")}</p>`
    : "";

  return renderSystemEmailLayout({
    title: "ECC Test Report",
    centerHeader: true,
    logoWidthPx: 110,
    logoMarginBottomPx: 10,
    titleMarginBottomPx: 10,
    bodyHtml: `
      <p style="margin: 0 0 10px 0;"><strong>Status:</strong> Issues identified</p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #475569;">${escapeHtml(args.title)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 14px 0; border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 2px 0; color: #475569; width: 160px;">Customer</td><td style="padding: 2px 0; color: #0f172a; font-weight: 600;">${escapeHtml(args.customerName)}</td></tr>
        <tr><td style="padding: 2px 0; color: #475569;">Location</td><td style="padding: 2px 0; color: #0f172a; font-weight: 600;">${escapeHtml(args.locationText)}</td></tr>
        <tr><td style="padding: 2px 0; color: #475569;">Service / Test Date</td><td style="padding: 2px 0; color: #0f172a; font-weight: 600;">${escapeHtml(args.serviceDateText)}</td></tr>
        <tr><td style="padding: 2px 0; color: #475569;">Contractor</td><td style="padding: 2px 0; color: #0f172a; font-weight: 600;">${escapeHtml(args.contractorName ?? "Not assigned")}</td></tr>
      </table>
      <h3 style="margin: 0 0 10px 0; font-size: 16px; line-height: 1.4; color: #111827;">Issues Identified</h3>
      ${issuesHtml}
      <h3 style="margin: 14px 0 6px 0; font-size: 16px; line-height: 1.4; color: #111827;">Next Step</h3>
      <p style="margin: 0;">${escapeHtml(args.nextStep)}</p>
      ${summaryBlock}
      ${noteBlock}
      ${ctaSection}
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">Sent by ${escapeHtml(args.supportDisplayName)}.</p>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">Support: ${supportLine}</p>
    `,
  });
}

function buildContractorReportEmailText(args: {
  title: string;
  customerName: string;
  locationText: string;
  serviceDateText: string;
  contractorName: string | null;
  reasons: string[];
  failureDetails: ContractorFailureDetail[];
  nextStep: string;
  contractorSummary?: string | null;
  contractorNote?: string | null;
  portalJobUrl?: string | null;
  supportDisplayName: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
}) {
  const summary = String(args.contractorSummary ?? "").trim();
  const note = String(args.contractorNote ?? "").trim();
  const portalUrl = String(args.portalJobUrl ?? "").trim();
  const supportDetails = [args.supportPhone, args.supportEmail].filter(Boolean).join(" • ");
  const issueBlock = args.failureDetails.length > 0
    ? args.failureDetails
        .map((detail) => [detail.headline, ...detail.detail_lines.map((line) => `- ${line}`)].join("\n"))
        .join("\n\n")
    : args.reasons.map((reason) => `- ${reason}`).join("\n");

  const sections = [
    "ECC TEST REPORT",
    "Status: Issues identified",
    args.title,
    `Customer: ${args.customerName}`,
    `Location: ${args.locationText}`,
    `Service / Test Date: ${args.serviceDateText}`,
    `Contractor: ${args.contractorName ?? "Not assigned"}`,
    `Issues Identified:\n${issueBlock}`,
    `Next Step:\n${args.nextStep}`,
  ];

  if (summary) sections.push(`Summary:\n${summary}`);
  if (note) sections.push(`Additional Note:\n${note}`);
  if (portalUrl) {
    sections.push(`Open Contractor Portal:\n${portalUrl}`);
  } else {
    sections.push("Please open your contractor portal to review and respond.");
  }

  sections.push(`Sent by ${args.supportDisplayName}.`);
  if (supportDetails) {
    sections.push(`Support: ${supportDetails}`);
  }

  return sections.join("\n\n");
}

async function requireInternalUserOrThrow(supabase: any) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("Not authenticated");

  try {
    await requireInternalUser({ supabase, userId: user.id });
  } catch {
    throw new Error("Not authorized");
  }

  return user;
}

async function requireInternalScopedJobUserOrThrow(supabase: any, jobId: string) {
  const user = await requireInternalUserOrThrow(supabase);
  const authz = await requireInternalUser({ supabase, userId: user.id });
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
    jobId,
    select: "id",
  });

  if (!scopedJob?.id) {
    throw new Error("Not authorized");
  }

  return user;
}

async function resolveContractorReportForJob(params: {
  supabase: any;
  jobId: string;
}): Promise<ContractorReportResolved> {
  const { supabase, jobId } = params;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      ops_status,
      contractor_id,
      pending_info_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
      scheduled_date,
      window_start,
      window_end,
      customer_first_name,
      customer_last_name,
      city,
      job_address,
      locations:location_id (address_line1, city, state, zip),
      contractors:contractor_id (name, email)
      `
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job?.id) throw new Error("Job not found");

  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  const pendingInfoSignal = getPendingInfoSignal({
    pending_info_reason: (job as any)?.pending_info_reason,
    follow_up_date: (job as any)?.follow_up_date,
    next_action_note: (job as any)?.next_action_note,
    action_required_by: (job as any)?.action_required_by,
  });

  if (opsStatus !== "failed" && !pendingInfoSignal) {
    throw new Error("Contractor report is only available for failed or pending_info jobs");
  }

  const customerName =
    [String(job.customer_first_name ?? "").trim(), String(job.customer_last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ") || "Customer";

  const contractorName =
    String((job as any)?.contractors?.name ?? "").trim() || null;
  const defaultRecipientEmail =
    String((job as any)?.contractors?.email ?? "").trim().toLowerCase() || null;

  const locationText = formatLocationText(job);

  if (opsStatus === "failed") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("created_at, test_type, computed, computed_pass, override_pass, is_completed")
      .eq("job_id", jobId)
      .eq("is_completed", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsErr) throw new Error(runsErr.message);

    const failedRuns = (runs ?? []).filter((r: any) => finalRunPass(r) === false);
    const extractedReasons: string[] = failedRuns.flatMap((run: any) =>
      extractFailureReasons(run)
        .map((reason) => String(reason).trim())
        .filter(Boolean),
    );
    const reasons: string[] =
      extractedReasons.length > 0
        ? Array.from(new Set(extractedReasons))
        : ["Test failed. Please review and correct."];
    const failureDetails: ContractorFailureDetail[] = failedRuns.flatMap((run: any) =>
      extractFailureDetails(run),
    );
    const latestFailedRun = failedRuns[0] ?? null;

    const nextStep = "Review and submit your response in the portal.";
    const title = "FAILED TEST";
    const summary = buildContractorFailureSummaryV1({
      reportKind: "failed",
      reasons,
      nextStep,
      contractorSummary: null,
    });

    return {
      report_kind: "failed",
      ops_status: opsStatus,
      title,
      location_text: locationText,
      customer_name: customerName,
      contractor_name: contractorName,
      default_recipient_email: defaultRecipientEmail,
      service_date_text: formatServiceDateText(job, latestFailedRun?.created_at ?? null),
      reasons,
      failure_details: failureDetails,
      next_step: nextStep,
      contractor_failure_summary_v1: summary,
      body_text: buildReportBody({
        title,
        locationText,
        reasons,
        failureDetails,
        nextStep,
        contractorSummary: summary.contractor_safe_summary,
      }),
    };
  }

  const pendingReason = String(job.pending_info_reason ?? "").trim();
  const reasons =
    pendingReason.length > 0
      ? [pendingReason]
      : ["Additional information is required to proceed."];

  const nextStep = "Provide the missing information in the contractor portal.";
  const title = "INFORMATION NEEDED";
  const summary = buildContractorFailureSummaryV1({
    reportKind: "pending_info",
    reasons,
    nextStep,
    contractorSummary: null,
  });

  return {
    report_kind: "pending_info",
    ops_status: opsStatus,
    title,
    location_text: locationText,
    customer_name: customerName,
    contractor_name: contractorName,
    default_recipient_email: defaultRecipientEmail,
    service_date_text: formatServiceDateText(job),
    reasons,
    failure_details: [],
    next_step: nextStep,
    contractor_failure_summary_v1: summary,
    body_text: buildReportBody({
      title,
      locationText,
      reasons,
      nextStep,
      contractorSummary: summary.contractor_safe_summary,
    }),
  };
}

function sanitizeContractorNote(raw: unknown) {
  if (typeof raw !== "string") return null;
  const sanitized = raw.replace(/\u0000/g, "").trim();
  if (!sanitized) return null;
  return sanitized.slice(0, 4000);
}

export async function generateContractorReportPreview(input: {
  jobId: string;
}): Promise<ContractorReportPreview> {
  const supabase = await createClient();
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) throw new Error("Missing jobId");

  await requireInternalScopedJobUserOrThrow(supabase, jobId);
  const authz = await requireInternalUser({ supabase });

  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  const report = await resolveContractorReportForJob({ supabase, jobId });

  return {
    title: report.title,
    location_text: report.location_text,
    customer_name: report.customer_name,
    contractor_name: report.contractor_name,
    default_recipient_email: report.default_recipient_email,
    service_date_text: report.service_date_text,
    reasons: report.reasons,
    failure_details: report.failure_details,
    next_step: report.next_step,
    contractor_failure_summary_v1: report.contractor_failure_summary_v1,
    body_text: report.body_text,
  };
}

export async function sendContractorReport(input: {
  jobId: string;
  recipientEmail?: string | null;
  contractorSummary?: string | null;
  contractorNote?: string | null;
}): Promise<{ ok: true; alreadySent?: boolean }> {
  const supabase = await createClient();
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) throw new Error("Missing jobId");

  const user = await requireInternalScopedJobUserOrThrow(supabase, jobId);
  const authz = await requireInternalUser({ supabase, userId: user.id });

  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  const report = await resolveContractorReportForJob({ supabase, jobId });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, contractor_id, contractors:contractor_id ( email, owner_user_id )")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job?.id) throw new Error("Job not found");

  if (!job.contractor_id) {
    throw new Error("Cannot send contractor report: no contractor is assigned to this job.");
  }

  const contractorSummary = sanitizeContractorSummary(input.contractorSummary);
  const contractorNote = sanitizeContractorNote(input.contractorNote);
  const defaultRecipientEmail = String((job as any)?.contractors?.email ?? "").trim().toLowerCase();
  const submittedRecipientEmail = String(input.recipientEmail ?? "").trim().toLowerCase();
  const recipientEmail = submittedRecipientEmail || defaultRecipientEmail;

  if (!recipientEmail) {
    throw new Error("Cannot send contractor report email: recipient email is required.");
  }

  const isValidRecipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  if (!isValidRecipientEmail) {
    throw new Error("Cannot send contractor report email: recipient email is invalid.");
  }

  const recipientOverridden =
    submittedRecipientEmail.length > 0 && submittedRecipientEmail !== defaultRecipientEmail;

  const sentAtIso = new Date().toISOString();
  const contractorFailureSummary = buildContractorFailureSummaryV1({
    reportKind: report.report_kind,
    reasons: report.reasons,
    nextStep: report.next_step,
    contractorSummary,
  });

  const bodyText = buildReportBody({
    title: report.title,
    locationText: report.location_text,
    reasons: report.reasons,
    failureDetails: report.failure_details,
    nextStep: report.next_step,
    contractorSummary: contractorFailureSummary.contractor_safe_summary,
    contractorNote,
  });

  const { data: insertedEvent, error: eventErr } = await supabase
    .from("job_events")
    .insert({
      job_id: jobId,
      event_type: "contractor_report_sent",
      message: "Contractor report sent",
      meta: {
        report_kind: report.report_kind,
        report_version: 1,
        report_render_version: "contractor_failure_report_v2",
        sent_at_iso: sentAtIso,
        generated_from: {
          ops_status: report.ops_status,
        },
        customer_name: report.customer_name,
        location_text: report.location_text,
        contractor_name: report.contractor_name,
        recipient_email: recipientEmail,
        default_recipient_email: defaultRecipientEmail || null,
        recipient_overridden: recipientOverridden,
        service_date_text: report.service_date_text,
        reasons: report.reasons,
        failure_details: report.failure_details,
        contractor_failure_summary_v1: contractorFailureSummary,
        contractor_note: contractorNote,
        next_step: report.next_step,
        body_text: bodyText,
      },
      user_id: user.id,
    })
    .select("id")
    .single();

  if (eventErr) throw new Error(eventErr.message);
  const eventId = String(insertedEvent?.id ?? "").trim();
  if (!eventId) throw new Error("Failed to capture contractor_report_sent event id");

  const accountOwnerUserId = String((job as any)?.contractors?.owner_user_id ?? "").trim();
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });
  const supportDisplayName = internalBusinessIdentity.display_name;
  const supportPhone = internalBusinessIdentity.support_phone;
  const supportEmail = internalBusinessIdentity.support_email;
  const customerName = String(report.customer_name ?? "").trim() || "Customer";
  const jobAddress = String(report.location_text ?? "").trim() || "Location not available";
  const subjectContext = jobAddress !== "Location not available" ? jobAddress : customerName;
  const subject = `Action Requested: ECC Test Report for ${subjectContext}`;

  const appUrl = resolveAppUrl();
  const portalJobUrl = appUrl ? `${appUrl}/portal/jobs/${jobId}` : null;
  const emailHtml = buildContractorReportEmailHtml({
    title: report.title,
    customerName: report.customer_name,
    locationText: report.location_text,
    serviceDateText: report.service_date_text,
    contractorName: report.contractor_name,
    reasons: report.reasons,
    failureDetails: report.failure_details,
    nextStep: report.next_step,
    contractorSummary: contractorFailureSummary.contractor_safe_summary,
    contractorNote,
    portalJobUrl,
    supportDisplayName,
    supportPhone,
    supportEmail,
  });
  const emailText = buildContractorReportEmailText({
    title: report.title,
    customerName: report.customer_name,
    locationText: report.location_text,
    serviceDateText: report.service_date_text,
    contractorName: report.contractor_name,
    reasons: report.reasons,
    failureDetails: report.failure_details,
    nextStep: report.next_step,
    contractorSummary: contractorFailureSummary.contractor_safe_summary,
    contractorNote,
    portalJobUrl,
    supportDisplayName,
    supportPhone,
    supportEmail,
  });

  try {
    await sendEmail({
      to: recipientEmail,
      subject,
      html: emailHtml,
      text: emailText,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown transport error";
    throw new Error(`Failed to send contractor report email: ${errMessage}`);
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs`);
  revalidatePath(`/ops`);

  return { ok: true };
}

export async function resolveFailureByCorrectionReviewFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  const reviewNoteRaw = formData.get("review_note");

  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  const review_note =
    typeof reviewNoteRaw === "string" && reviewNoteRaw.trim()
      ? reviewNoteRaw.trim()
      : null;

  // Internal-only guard
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);

  // Current snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, certs_complete, invoice_complete")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job) throw new Error("Job not found");

  // Only meaningful on unresolved failed ECC jobs
  if ((job.job_type ?? "").toLowerCase() !== "ecc") {
    redirect(`/jobs/${jobId}?tab=ops`);
  }

  if (!["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""))) {
  redirect(`/jobs/${jobId}?tab=ops`);
  }
  const beforeOps = job.ops_status ?? null;

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ ops_status: "paperwork_required" })
    .eq("id", jobId);

  if (updErr) throw new Error(updErr.message);

  // Canonical narrative event
  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "failure_resolved_by_correction_review",
    meta: {
      from: beforeOps,
      to: "paperwork_required",
      review_note,
      source: "internal_review",
    },
    user_id: user.id,
  });

  if (eventErr) throw new Error(eventErr.message);

  // Optional ops_update companion for consistency with existing ops logs
  const { error: opsEventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Failure resolved by correction review",
    meta: {
      changes: [{ field: "ops_status", from: beforeOps, to: "paperwork_required" }],
      source: "job_detail_ops",
      review_note,
    },
    user_id: user.id,
  });

  if (opsEventErr) throw new Error(opsEventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function markCertsCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Server-side auth guard: contractors cannot close out jobs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  // Read current job snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end, data_entry_completed_at, service_case_id"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;

  if (job.ops_status === "failed" || job.ops_status === "retest_needed") {
  redirect(`/jobs/${jobId}?notice=failed_requires_retest`);
  }

    // ECC hardening:
  // even if ops_status drifts, certs cannot complete while any completed failed run exists
  if ((job.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("is_completed, computed_pass, override_pass")
      .eq("job_id", jobId);

    if (runsErr) throw new Error(runsErr.message);

    const hasFailedCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === false) return true;
      if (r?.override_pass === true) return false;
      return r?.computed_pass === false;
    });

    let hasCorrectionReviewResolution = false;
    if (hasFailedCompletedRun) {
      const { data: correctionResolutionEvent, error: correctionResolutionErr } = await supabase
        .from("job_events")
        .select("id")
        .eq("job_id", jobId)
        .eq("event_type", "failure_resolved_by_correction_review")
        .limit(1)
        .maybeSingle();

      if (correctionResolutionErr) throw new Error(correctionResolutionErr.message);
      hasCorrectionReviewResolution = Boolean(correctionResolutionEvent?.id);
    }

    if (hasFailedCompletedRun && !hasCorrectionReviewResolution) {
      redirect(`/jobs/${jobId}?notice=failed_requires_retest`);
    }
  }

  if (!job.field_complete) {
    redirect(`/jobs/${jobId}?notice=field_not_complete`);
  }

    // Mark certs complete and verify update
    const { data: updatedCertRow, error: updErr } = await supabase
      .from("jobs")
      .update({ certs_complete: true })
      .eq("id", jobId)
      .select("id, certs_complete")
      .maybeSingle();

    if (updErr) throw updErr;

    if (!updatedCertRow?.id || updatedCertRow.certs_complete !== true) {
      throw new Error("Certs complete update failed (no row updated).");
    }
    
  // Recompute ops_status using shared resolver
  let nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: true,
    invoice_complete: job.invoice_complete,
    current_ops_status: job.ops_status,
  });

  const { error: opsErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextOps })
    .eq("id", jobId);

  if (opsErr) throw opsErr;

  nextOps =
    (await recomputeOpsAfterCloseoutMutation(supabase, jobId)) ?? nextOps;

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Certs marked complete",
    meta: {
      changes: [
        { field: "certs_complete", from: !!job.certs_complete, to: true },
        { field: "ops_status", from: job.ops_status ?? null, to: nextOps },
      ],
    },
  });

  if (eventErr) throw eventErr;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}`);
}

export async function markInvoiceCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Server-side auth guard: contractors cannot close out jobs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  if (billingMode === "internal_invoicing") {
    redirect(`/jobs/${jobId}?banner=internal_invoicing_billing_pending`);
  }

  // Read current job snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end, data_entry_completed_at, service_case_id"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;

  if (!job.field_complete) {
    redirect(`/jobs/${jobId}?notice=field_not_complete`);
  }

  const completedAt = job.data_entry_completed_at ?? new Date().toISOString();

// Mark invoice complete and stamp closeout metadata consistently.
const { data: updatedInvoiceRow, error: updErr } = await supabase
  .from("jobs")
  .update({
    invoice_complete: true,
    ...(job.data_entry_completed_at ? {} : { data_entry_completed_at: completedAt }),
  })
  .eq("id", jobId)
  .select("id, invoice_complete, data_entry_completed_at")
  .maybeSingle();

if (updErr) throw updErr;

if (!updatedInvoiceRow?.id || updatedInvoiceRow.invoice_complete !== true) {
  throw new Error("Invoice complete update failed (no row updated).");
}

if (!job.data_entry_completed_at && !updatedInvoiceRow.data_entry_completed_at) {
  throw new Error("Data entry completion update failed (timestamp missing).");
}

  let nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: true,
    current_ops_status: job.ops_status,
  });

  // ECC guard:
  // failed/retest-needed jobs may still be invoiced, but invoice completion
  // should not auto-resolve the operational failure state.
  if ((job.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("is_completed, computed_pass, override_pass")
      .eq("job_id", jobId);

    if (runsErr) throw new Error(runsErr.message);

    const hasFailedCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === false) return true;
      if (r?.override_pass === true) return false;
      return r?.computed_pass === false;
    });

    if (hasFailedCompletedRun) {
      nextOps =
        job.ops_status === "retest_needed"
          ? "retest_needed"
          : "failed";
    }
  }

  const { error: opsErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextOps })
    .eq("id", jobId);

  if (opsErr) throw opsErr;

  nextOps =
    (await recomputeOpsAfterCloseoutMutation(supabase, jobId)) ?? nextOps;

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Invoice marked complete",
    meta: {
      changes: [
        { field: "invoice_complete", from: !!job.invoice_complete, to: true },
        ...(job.data_entry_completed_at
          ? []
          : [{ field: "data_entry_completed_at", from: job.data_entry_completed_at ?? null, to: completedAt }]),
        { field: "ops_status", from: job.ops_status ?? null, to: nextOps },
      ],
    },
  });

  if (eventErr) throw eventErr;

  if (String(job.job_type ?? "").trim().toLowerCase() === "service") {
    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: authz.internalUser.account_owner_user_id,
      serviceCaseId: job.service_case_id,
      triggerJobId: jobId,
      source: "mark_invoice_complete_from_form",
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}`);
}
export async function updateJobOpsDetailsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get('job_id');
  if (typeof jobId !== 'string' || !jobId) throw new Error('Missing job_id');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  const { data: beforeJob, error: beforeErr } = await supabase
    .from('jobs')
    .select('ops_status, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by')
    .eq('id', jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);

  const before: OpsSnapshot = {
    ops_status: beforeJob.ops_status ?? null,
    pending_info_reason: beforeJob.pending_info_reason ?? null,
    on_hold_reason: beforeJob.on_hold_reason ?? null,
    follow_up_date: beforeJob.follow_up_date ?? null,
    next_action_note: beforeJob.next_action_note ?? null,
    action_required_by: beforeJob.action_required_by ?? null,
  };
  const followUpDateRaw = formData.get('follow_up_date');
  const nextActionNoteRaw = formData.get('next_action_note');
  const actionRequiredByRaw = formData.get('action_required_by');

  const next_action_note =
    typeof nextActionNoteRaw === 'string' && nextActionNoteRaw.trim()
      ? nextActionNoteRaw.trim()
      : null;

  const follow_up_date =
    typeof followUpDateRaw === 'string' && followUpDateRaw.trim()
      ? followUpDateRaw.trim()
      : null;

  const action_required_by = isActionRequiredBy(actionRequiredByRaw) ? actionRequiredByRaw : null;

  const after: OpsSnapshot = {
    ...before,
    follow_up_date,
    next_action_note,
    action_required_by,
  };

  const changes = buildOpsChanges(before, after);
  if (changes.length === 0) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?tab=ops&banner=ops_details_already_saved`);
  }

  const { error: updateErr } = await supabase
    .from('jobs')
    .update({
      follow_up_date,
      next_action_note,
      action_required_by,
    })
    .eq('id', jobId);

  if (updateErr) throw new Error(updateErr.message);

  const { error: eventErr } = await supabase.from('job_events').insert({
    job_id: jobId,
    event_type: 'ops_update',
    message: 'Ops details updated',
    meta: { changes, source: 'job_detail' },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=ops&banner=ops_details_saved`);
}

export async function releasePendingInfoAndRecompute(jobId: string, source = "manual_release_pending_info"): Promise<string | null> {
  const supabase = await createClient();

  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, ops_status, field_complete, certs_complete, invoice_complete, scheduled_date, window_start, window_end, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);
  if (!before?.id) throw new Error("Job not found");

  const hasPendingInfoState = hasExplicitPendingInfo({
    ops_status: before.ops_status ?? null,
    pending_info_reason: before.pending_info_reason ?? null,
  });

  if (!hasPendingInfoState) return before.ops_status ?? null;

  const currentOps = String(before.ops_status ?? "").trim().toLowerCase();
  const releasable = new Set([
    "pending_info",
    "on_hold",
    "failed",
    "retest_needed",
    "paperwork_required",
    "invoice_required",
  ]);

  if (!releasable.has(currentOps)) {
    const beforeSnapshot: OpsSnapshot = {
      ops_status: before.ops_status ?? null,
      pending_info_reason: before.pending_info_reason ?? null,
      on_hold_reason: before.on_hold_reason ?? null,
      follow_up_date: before.follow_up_date ?? null,
      next_action_note: before.next_action_note ?? null,
      action_required_by: before.action_required_by ?? null,
    };

    const afterSnapshot: OpsSnapshot = {
      ...beforeSnapshot,
      pending_info_reason: null,
    };

    const changes = buildOpsChanges(beforeSnapshot, afterSnapshot);

    const { error: clearErr } = await supabase
      .from("jobs")
      .update({
        pending_info_reason: null,
      })
      .eq("id", jobId);

    if (clearErr) throw new Error(clearErr.message);

    if (changes.length > 0) {
      const { error: eventErr } = await supabase.from("job_events").insert({
        job_id: jobId,
        event_type: "ops_update",
        message: "Pending info signal cleared",
        meta: {
          changes,
          source,
          release_from: before.ops_status ?? null,
          release_to: before.ops_status ?? null,
          signal_only_clear: true,
        },
      });

      if (eventErr) throw new Error(eventErr.message);
    }

    return before.ops_status ?? null;
  }

  return releaseAndReevaluate(jobId, source);
}

export async function releaseAndReevaluate(
  jobId: string,
  source = "manual_release_and_reevaluate"
): Promise<string | null> {
  const supabase = await createClient();

  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, ops_status, field_complete, certs_complete, invoice_complete, scheduled_date, window_start, window_end, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);
  if (!before?.id) throw new Error("Job not found");

  const currentOps = String(before.ops_status ?? "").trim().toLowerCase();
  const releasable = new Set([
    "pending_info",
    "on_hold",
    "failed",
    "retest_needed",
    "paperwork_required",
    "invoice_required",
  ]);

  if (!releasable.has(currentOps)) return before.ops_status ?? null;

  const hasOnHoldState = hasExplicitOnHold({
    ops_status: before.ops_status ?? null,
    on_hold_reason: before.on_hold_reason ?? null,
  });

  const isEcc = String(before.job_type ?? "").trim().toLowerCase() === "ecc";
  const isFieldCompleteOrCompleted =
    Boolean(before.field_complete) ||
    String(before.status ?? "").trim().toLowerCase() === "completed";
  const hasSchedule =
    Boolean(before.scheduled_date) ||
    Boolean(before.window_start) ||
    Boolean(before.window_end);

  const shouldSetCompletedLifecycle =
    Boolean(before.field_complete) &&
    String(before.status ?? "").trim().toLowerCase() !== "completed";

  let nextOps: string | null = null;

  if (isEcc && isFieldCompleteOrCompleted) {
    const neutralOps = hasSchedule ? "scheduled" : "need_to_schedule";

    const releasePatch: Record<string, any> = {
      ops_status: neutralOps,
      pending_info_reason: null,
      on_hold_reason: hasOnHoldState ? null : before.on_hold_reason ?? null,
    };

    if (shouldSetCompletedLifecycle) {
      releasePatch.status = "completed";
    }

    const { error: releaseErr } = await supabase
      .from("jobs")
      .update(releasePatch)
      .eq("id", jobId);

    if (releaseErr) throw new Error(releaseErr.message);

    await evaluateEccOpsStatus(jobId);
    await healStalePaperworkOpsStatus(jobId);

    const { data: afterEcc, error: afterEccErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", jobId)
      .single();

    if (afterEccErr) throw new Error(afterEccErr.message);
    nextOps = afterEcc?.ops_status ?? null;
  } else {
    nextOps = resolveOpsStatus({
      status: shouldSetCompletedLifecycle ? "completed" : before.status,
      job_type: before.job_type,
      scheduled_date: before.scheduled_date,
      window_start: before.window_start,
      window_end: before.window_end,
      field_complete: before.field_complete,
      certs_complete: before.certs_complete,
      invoice_complete: before.invoice_complete,
      current_ops_status: before.ops_status,
    });

    const releasePatch: Record<string, any> = {
      ops_status: nextOps,
      pending_info_reason: null,
      on_hold_reason: hasOnHoldState ? null : before.on_hold_reason ?? null,
    };

    if (shouldSetCompletedLifecycle) {
      releasePatch.status = "completed";
    }

    const { error: upErr } = await supabase
      .from("jobs")
      .update(releasePatch)
      .eq("id", jobId);

    if (upErr) throw new Error(upErr.message);
  }

  const changes = buildOpsChanges(
    {
      ops_status: before.ops_status ?? null,
      pending_info_reason: before.pending_info_reason ?? null,
      on_hold_reason: before.on_hold_reason ?? null,
      follow_up_date: before.follow_up_date ?? null,
      next_action_note: before.next_action_note ?? null,
      action_required_by: before.action_required_by ?? null,
    },
    {
      ops_status: nextOps,
      pending_info_reason: null,
      on_hold_reason: hasOnHoldState ? null : before.on_hold_reason ?? null,
      follow_up_date: before.follow_up_date ?? null,
      next_action_note: before.next_action_note ?? null,
      action_required_by: before.action_required_by ?? null,
    }
  );

  const previousWaitingState = getActiveWaitingState({
    ops_status: before.ops_status ?? null,
    pending_info_reason: before.pending_info_reason ?? null,
    on_hold_reason: before.on_hold_reason ?? null,
  });

  if (changes.length > 0) {
    const { error: eventErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "ops_update",
      message: "Released and re-evaluated",
      meta: {
        changes,
        source,
        blocker_action: "cleared",
        ...(previousWaitingState?.parsed
          ? {
              previous_blocker_type: previousWaitingState.blockerType,
              previous_blocker_reason: previousWaitingState.blockerReason,
            }
          : {}),
        release_from: before.ops_status ?? null,
        release_to: nextOps,
        lifecycle_normalized: shouldSetCompletedLifecycle,
      },
    });

    if (eventErr) throw new Error(eventErr.message);
  }

  return nextOps;
}

export async function releasePendingInfoAndRecomputeFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  await releasePendingInfoAndRecompute(jobId, "manual_release_pending_info");

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function releaseAndReevaluateFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  await releaseAndReevaluate(jobId, "job_detail");

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function updateJobOpsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  const interruptStateRaw = formData.get("interrupt_state");
  const opsStatusRaw = formData.get("ops_status");
  const statusReasonRaw = formData.get("status_reason");
  const waitingStateTypeRaw = formData.get("waiting_state_type");
  const waitingOtherReasonRaw = formData.get("waiting_other_reason");

  if (typeof jobId !== "string" || !jobId) {
    throw new Error("Missing job_id");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });

  const statusReason =
    typeof statusReasonRaw === "string" && statusReasonRaw.trim()
      ? statusReasonRaw.trim()
      : null;

  const waitingStateType = parseWaitingStateType(waitingStateTypeRaw);
  const waitingOtherReason =
    typeof waitingOtherReasonRaw === "string" && waitingOtherReasonRaw.trim()
      ? waitingOtherReasonRaw.trim()
      : null;

  type InterruptState = "pending_info" | "on_hold" | "waiting";
  const normalizedInterruptState = String(interruptStateRaw ?? "").trim().toLowerCase();
  const normalizedOpsStatus = String(opsStatusRaw ?? "").trim().toLowerCase();

  const interruptState: InterruptState | null =
    normalizedInterruptState === "pending_info" ||
    normalizedInterruptState === "on_hold" ||
    normalizedInterruptState === "waiting"
      ? normalizedInterruptState
      : waitingStateType
        ? "waiting"
        : normalizedOpsStatus === "pending_info" || normalizedOpsStatus === "on_hold"
          ? normalizedOpsStatus
          : null;

  if (!interruptState) {
    redirect(`/jobs/${jobId}?tab=ops&banner=interrupt_state_required`);
  }

  let nextOpsStatus: "pending_info" | "on_hold";
  let blockerReason = "";
  let blockerReasonParsed: ReturnType<typeof parseWaitingStateReason> = null;
  let blockerTypeForMeta: string = interruptState;
  let blockerReasonForMeta: string = statusReason ?? "";

  if (interruptState === "pending_info" || interruptState === "on_hold") {
    if (!statusReason) {
      const banner = interruptState === "pending_info"
        ? "pending_info_reason_required"
        : "on_hold_reason_required";
      redirect(`/jobs/${jobId}?tab=ops&banner=${banner}`);
    }

    nextOpsStatus = interruptState;
    blockerReason = statusReason;
  } else {
    if (!waitingStateType) {
      redirect(`/jobs/${jobId}?tab=ops&banner=waiting_reason_required`);
    }

    if (waitingStateType === "other" && !waitingOtherReason) {
      redirect(`/jobs/${jobId}?tab=ops&banner=waiting_other_reason_required`);
    }

    const waitingReasonBody = waitingStateType === "other"
      ? (waitingOtherReason ?? "")
      : getWaitingStateLabel(waitingStateType);

    blockerReason = formatWaitingStateReason(waitingStateType, waitingReasonBody);
    blockerReasonParsed = parseWaitingStateReason(blockerReason);
    blockerTypeForMeta = blockerReasonParsed?.blockerType ?? waitingStateType;
    blockerReasonForMeta = blockerReasonParsed?.blockerReason ?? waitingReasonBody;

    // Preserve legacy callers that still post ops_status=on_hold with waiting-state fields.
    nextOpsStatus = normalizedOpsStatus === "on_hold" ? "on_hold" : "pending_info";
  }

  // BEFORE
  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "ops_status, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);

  const before: OpsSnapshot = {
    ops_status: beforeJob.ops_status ?? null,
    pending_info_reason: beforeJob.pending_info_reason ?? null,
    on_hold_reason: beforeJob.on_hold_reason ?? null,
    follow_up_date: beforeJob.follow_up_date ?? null,
    next_action_note: beforeJob.next_action_note ?? null,
    action_required_by: beforeJob.action_required_by ?? null,
  };

  const hadActiveWaitingState = Boolean(
    getActiveWaitingState({
      ops_status: before.ops_status,
      pending_info_reason: before.pending_info_reason,
      on_hold_reason: before.on_hold_reason,
    })
  );

  const after: OpsSnapshot = {
    ...before,
    ops_status: nextOpsStatus,
    pending_info_reason: nextOpsStatus === "pending_info" ? blockerReason : null,
    on_hold_reason: nextOpsStatus === "on_hold" ? blockerReason : null,
  };

  const changes = buildOpsChanges(before, after);
  if (changes.length === 0) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?tab=ops&banner=ops_status_already_saved`);
  }

  // UPDATE
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      ops_status: nextOpsStatus,
      pending_info_reason: nextOpsStatus === "pending_info" ? blockerReason : null,
      on_hold_reason: nextOpsStatus === "on_hold" ? blockerReason : null,
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // LOG
  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Ops status updated",
    meta: {
      changes,
      source: "job_detail",
      manual_allowed: true,
      blocker_action: hadActiveWaitingState ? "updated" : "set",
      blocker_type: blockerTypeForMeta,
      blocker_reason: blockerReasonForMeta,
      ...(before.action_required_by
        ? { action_required_by: before.action_required_by }
        : {}),
      ...(before.follow_up_date
        ? { follow_up_date: before.follow_up_date }
        : {}),
      ...(String(before.next_action_note ?? "").trim()
        ? { next_action_note: String(before.next_action_note).trim() }
        : {}),
    },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops&banner=ops_status_saved`);
}

export async function markJobFieldCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const authz = await requireInternalOpsAccessOrRedirect(
    supabase,
    user.id,
    jobId,
  );
  await requireOperationalJobOpsEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: authz.internalUser.account_owner_user_id,
  });
  const actingUserId = authz.userId;

  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, ops_status, field_complete, field_complete_at, scheduled_date, window_start, window_end, certs_complete, invoice_complete"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);
  if (!beforeJob?.id) throw new Error("Job not found");

  const beforeOps = beforeJob.ops_status ?? null;
  const beforeFieldComplete = Boolean(beforeJob.field_complete ?? false);

  console.error("[FIELD_COMPLETE]", {
    jobId,
    before_status: beforeJob.status ?? null,
    before_ops_status: beforeOps,
    before_field_complete: beforeFieldComplete,
    job_type: beforeJob.job_type ?? null,
  });

  // ECC guard rail:
  // require at least one completed run with a real result before field completion
  if ((beforeJob.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runErr } = await supabase
      .from("ecc_test_runs")
      .select("id, is_completed, computed_pass, override_pass")
      .eq("job_id", jobId)
      .eq("is_completed", true);

    if (runErr) throw new Error(runErr.message);

    const hasMeaningfulCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === true || r?.override_pass === false) return true;
      if (r?.computed_pass === true || r?.computed_pass === false) return true;
      return false;
    });

    if (!hasMeaningfulCompletedRun) {
      revalidatePath(`/jobs/${jobId}`);
      redirect(`/jobs/${jobId}?notice=ecc_test_required`);
    }
  }

  // Idempotent: already field-complete
  if (beforeFieldComplete) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}`);
  }

  // First mark the field lifecycle complete.
  // For non-ECC jobs, also compute next ops here.
  let nextOps = resolveOpsStatus({
    status: "completed",
    job_type: beforeJob.job_type ?? null,
    scheduled_date: beforeJob.scheduled_date ?? null,
    window_start: beforeJob.window_start ?? null,
    window_end: beforeJob.window_end ?? null,
    field_complete: true,
    certs_complete: beforeJob.certs_complete ?? false,
    invoice_complete: beforeJob.invoice_complete ?? false,
    current_ops_status: beforeJob.ops_status ?? null,
  });

  const isEccJob = (beforeJob.job_type ?? "").toLowerCase() === "ecc";

  const baseUpdate: Record<string, any> = {
    status: "completed",
    field_complete: true,
    field_complete_at: new Date().toISOString(),
  };

  // Non-ECC keeps local resolver behavior
  if (!isEccJob) {
    baseUpdate.ops_status = nextOps;
  }

  const { error: updateErr } = await supabase
    .from("jobs")
    .update(baseUpdate)
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // ECC jobs: hand canonical ops resolution back to evaluateEccOpsStatus(jobId)
  if (isEccJob) {
    console.error("[FIELD_COMPLETE]", {
      jobId,
      phase: "before_ecc_eval",
      attempted_next_status: "paperwork_required",
      before_ops_status: beforeOps,
    });

    await evaluateEccOpsStatus(jobId);

    const { data: afterJob, error: afterErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", jobId)
      .single();

    if (afterErr) throw new Error(afterErr.message);
    nextOps = afterJob?.ops_status ?? null;

    console.error("[FIELD_COMPLETE]", {
      jobId,
      phase: "after_ecc_eval",
      final_ops_status: nextOps,
    });
  }

  nextOps =
    (await recomputeOpsAfterCloseoutMutation(supabase, jobId)) ?? nextOps;

  let assignmentId: string | null = null;
  if (actingUserId) {
    const { data: activeAssignment, error: assignmentErr } = await supabase
      .from("job_assignments")
      .select("id")
      .eq("job_id", jobId)
      .eq("user_id", actingUserId)
      .eq("is_active", true)
      .maybeSingle();

    if (assignmentErr) throw new Error(assignmentErr.message);
    assignmentId = String(activeAssignment?.id ?? "").trim() || null;
  }

  const completionMeta = {
    ...buildMovementEventMeta({
      from: beforeJob.status ?? "in_process",
      to: "completed",
      trigger: "ops_action",
      sourceAction: "mark_job_field_complete_from_form",
    }),
    actor_user_id: actingUserId,
    ...(assignmentId ? { assignment_id: assignmentId } : {}),
  };

  // PH2-F duplicate protection: if this path is reached after status was already
  // completed elsewhere, skip emitting a second job_completed event.
  if (beforeJob.status !== "completed") {
    const { error: completionEventErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "job_completed",
      meta: completionMeta,
      user_id: actingUserId,
    });

    if (completionEventErr) throw new Error(completionEventErr.message);
  }

  const changes = [
    { field: "status", from: beforeJob.status ?? null, to: "completed" },
    { field: "field_complete", from: beforeFieldComplete, to: true },
    { field: "ops_status", from: beforeOps, to: nextOps },
  ];

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Field work marked complete",
    meta: {
      changes,
      source: "job_detail_top_action",
      ...completionMeta,
    },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?banner=field_complete`);
}