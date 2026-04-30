
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveOpsStatus } from "@/lib/utils/ops-status";
import { getPendingInfoSignal } from "@/lib/utils/ops-status";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { forceSetOpsStatus } from "@/lib/actions/ops-status";
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from "@/lib/actions/job-evaluator";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import {
  findExistingContractorReportEmailDelivery,
  insertContractorReportEmailDeliveryNotification,
  insertInternalNotificationForEvent,
  markContractorReportEmailDeliveryNotification,
} from "@/lib/actions/notification-actions";
import {
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { resolveAppUrl, renderSystemEmailLayout, escapeHtml } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";
import { buildMovementEventMeta } from "@/lib/actions/job-event-meta";
import { extractFailureReasons, finalRunPass } from "@/lib/portal/resolveContractorIssues";

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
  service_date_text: string;
  reasons: string[];
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
  nextStep: string;
  contractorSummary?: string | null;
  contractorNote?: string | null;
}) {
  const reasonLabel = args.reasons.length === 1 ? "Reason" : "Reasons";
  const reasonsBlock = args.reasons.map((r) => `- ${r}`).join("\n");
  const summary = String(args.contractorSummary ?? "").trim();
  const note = String(args.contractorNote ?? "").trim();

  const sections = [
    args.title,
    `Location: ${args.locationText}`,
    `${reasonLabel}:\n${reasonsBlock}`,
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
  bodyText: string;
  portalJobUrl?: string | null;
  supportDisplayName: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
}) {
  const bodyHtml = escapeHtml(args.bodyText).replace(/\n/g, "<br />");
  const portalUrl = String(args.portalJobUrl ?? "").trim();
  const supportDetails = [args.supportPhone, args.supportEmail].filter(Boolean).join(" • ");
  const supportLine = supportDetails
    ? `${escapeHtml(args.supportDisplayName)} (${escapeHtml(supportDetails)})`
    : escapeHtml(args.supportDisplayName);

  const portalSection = portalUrl
    ? `<p style="margin-top:16px;">Open your job in the portal: <a href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a></p>`
    : "";

  return renderSystemEmailLayout({
    title: `${args.supportDisplayName} Report`,
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Please review and address the report details below.</p>
      <div style="white-space: normal;">${bodyHtml}</div>
      ${portalSection}
      <p style="margin: 16px 0 0 0;">If you need help, contact ${supportLine}.</p>
    `,
  });
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
      contractors:contractor_id (name)
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

  const locationText = formatLocationText(job);

  if (opsStatus === "failed") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("created_at, computed, computed_pass, override_pass, is_completed")
      .eq("job_id", jobId)
      .eq("is_completed", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsErr) throw new Error(runsErr.message);

    const failedRun = (runs ?? []).find((r: any) => finalRunPass(r) === false) ?? null;
    const extracted = failedRun ? extractFailureReasons(failedRun) : [];
    const reasons =
      extracted.length > 0
        ? extracted
        : ["Test failed. Please review and correct."];

    const nextStep = "Correct the issue and submit your response in the contractor portal.";
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
      service_date_text: formatServiceDateText(job, failedRun?.created_at ?? null),
      reasons,
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
    service_date_text: formatServiceDateText(job),
    reasons,
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
  const report = await resolveContractorReportForJob({ supabase, jobId });

  return {
    title: report.title,
    location_text: report.location_text,
    customer_name: report.customer_name,
    contractor_name: report.contractor_name,
    service_date_text: report.service_date_text,
    reasons: report.reasons,
    next_step: report.next_step,
    contractor_failure_summary_v1: report.contractor_failure_summary_v1,
    body_text: report.body_text,
  };
}

export async function sendContractorReport(input: {
  jobId: string;
  contractorSummary?: string | null;
  contractorNote?: string | null;
}): Promise<{ ok: true; alreadySent?: boolean }> {
  const supabase = await createClient();
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) throw new Error("Missing jobId");

  const user = await requireInternalScopedJobUserOrThrow(supabase, jobId);
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
        sent_at_iso: sentAtIso,
        generated_from: {
          ops_status: report.ops_status,
        },
        customer_name: report.customer_name,
        location_text: report.location_text,
        contractor_name: report.contractor_name,
        service_date_text: report.service_date_text,
        reasons: report.reasons,
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

  await insertInternalNotificationForEvent({
    supabase,
    jobId,
    eventType: "contractor_report_sent",
    actorUserId: user.id,
  });

  const contractorEmail = String((job as any)?.contractors?.email ?? "").trim().toLowerCase();
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
  const subject = `${supportDisplayName} Report – ${customerName} – ${jobAddress}`;

  if (!contractorEmail) {
    await insertContractorReportEmailDeliveryNotification({
      supabase,
      jobId,
      contractorId: String(job.contractor_id ?? "").trim() || null,
      recipientEmail: null,
      eventId,
      dedupeKey: null,
      subject,
      body: "Contractor report email was not sent because contractor email is missing.",
      status: "failed",
      errorDetail: "missing_contractor_email",
    });

    throw new Error("Cannot send contractor report email: contractor email is missing.");
  }

  const dedupeKey = `email:contractor_report:${eventId}:${contractorEmail}`;
  const existingDelivery = await findExistingContractorReportEmailDelivery({
    supabase,
    dedupeKey,
  });

  const appUrl = resolveAppUrl();
  const portalJobUrl = appUrl ? `${appUrl}/portal/jobs/${jobId}` : null;
  const emailHtml = buildContractorReportEmailHtml({
    bodyText: bodyText,
    portalJobUrl,
    supportDisplayName,
    supportPhone,
    supportEmail,
  });

  if (!existingDelivery?.id) {
    const deliveryRow = await insertContractorReportEmailDeliveryNotification({
      supabase,
      jobId,
      contractorId: String(job.contractor_id ?? "").trim() || null,
      recipientEmail: contractorEmail,
      eventId,
      dedupeKey,
      subject,
      body: bodyText,
      status: "queued",
    });

    try {
      await sendEmail({
        to: contractorEmail,
        subject,
        html: emailHtml,
      });

      await markContractorReportEmailDeliveryNotification({
        supabase,
        notificationId: deliveryRow.id,
        status: "sent",
      });
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : "Unknown transport error";

      await markContractorReportEmailDeliveryNotification({
        supabase,
        notificationId: deliveryRow.id,
        status: "failed",
        errorDetail: errMessage,
      });

      throw new Error(`Failed to send contractor report email: ${errMessage}`);
    }
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
  await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);

  // Read current job snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end, data_entry_completed_at"
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
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end, data_entry_completed_at"
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

  if (changes.length > 0) {
    const { error: eventErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "ops_update",
      message: "Released and re-evaluated",
      meta: {
        changes,
        source,
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

  await releaseAndReevaluate(jobId, "manual_release_and_reevaluate");

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function updateJobOpsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  const opsStatusRaw = formData.get("ops_status");
  const statusReasonRaw = formData.get("status_reason");

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

  if (typeof opsStatusRaw !== "string" || !opsStatusRaw.trim()) {
    throw new Error("Missing ops_status");
  }

  const allowedManualOpsStatuses = [
    "pending_info",
    "on_hold",
  ] as const;

  const isAllowedManualOpsStatus = (
    value: string
  ): value is (typeof allowedManualOpsStatuses)[number] =>
    allowedManualOpsStatuses.includes(
      value as (typeof allowedManualOpsStatuses)[number]
    );

  if (!isAllowedManualOpsStatus(opsStatusRaw)) {
    const banner = encodeURIComponent("Select On Hold or Pending Info");
    redirect(`/jobs/${jobId}?tab=ops&banner=${banner}`);
  }

  const statusReason =
    typeof statusReasonRaw === "string" && statusReasonRaw.trim()
      ? statusReasonRaw.trim()
      : null;

  if (!statusReason) {
    const banner = opsStatusRaw === "pending_info"
      ? "pending_info_reason_required"
      : "on_hold_reason_required";
    redirect(`/jobs/${jobId}?tab=ops&banner=${banner}`);
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

  const nextOpsStatus = opsStatusRaw;

  const after: OpsSnapshot = {
    ...before,
    ops_status: nextOpsStatus,
    pending_info_reason: nextOpsStatus === "pending_info" ? statusReason : null,
    on_hold_reason: nextOpsStatus === "on_hold" ? statusReason : null,
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
      pending_info_reason: nextOpsStatus === "pending_info" ? statusReason : null,
      on_hold_reason: nextOpsStatus === "on_hold" ? statusReason : null,
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