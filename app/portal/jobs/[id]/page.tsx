// app/portal/jobs/[id]/page
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requestRetestReadyFromPortal } from "@/lib/actions/job-actions";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";
import { createClient } from "@/lib/supabase/server";
import JobAttachments from "@/components/portal/JobAttachments";
import SubmitButton from "@/components/SubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  extractFailureReasons,
  finalRunPass,
  resolveContractorIssues,
} from "@/lib/portal/resolveContractorIssues";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { isPortalVisibleJob } from "@/lib/visibility/portal";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLA(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}

function titleCaseFromSnake(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "-";

  return v
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contractorSafeStatusLabel(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "-";

  if (v === "pending_info") return "Pending information";
  if (v === "on_hold") return "On hold";
  if (v === "pending_office_review") return "Under review";
  if (v === "paperwork_required") return "Final paperwork";
  if (v === "invoice_required") return "Final processing";
  if (v === "failed" || v === "retest_needed") return "Needs correction";
  if (v === "closed") return "Passed";
  if (v === "scheduled") return "Scheduled";
  if (v === "on_the_way") return "On the way";
  if (v === "in_process" || v === "in_progress") return "In progress";

  return titleCaseFromSnake(v);
}

function formatTimeLocal(value: string | null | undefined) {
  const s = String(value || "").slice(0, 5);
  return s || "-";
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(meta.note ?? meta.message ?? meta.caption ?? "").trim();
}

function getEventAttachmentCount(meta?: any) {
  if (!meta) return 0;
  const explicitCount = Number(meta.count ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  if (Array.isArray(meta.attachment_ids) && meta.attachment_ids.length > 0) return meta.attachment_ids.length;
  if (Array.isArray(meta.file_names) && meta.file_names.length > 0) return meta.file_names.length;
  if (typeof meta.file_name === "string" && meta.file_name.trim()) return 1;
  return 0;
}

function getEventAttachmentLabel(meta?: any) {
  const count = getEventAttachmentCount(meta);
  return count > 0 ? `${count} attachment${count === 1 ? "" : "s"}` : "";
}

function summarizePlainText(value?: string | null, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function readContractorFailureSummaryV1(meta: any) {
  const raw = meta?.contractor_failure_summary_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const whatFailed = String(raw.what_failed ?? "").trim();
  const nextStep = String(raw.next_step ?? "").trim();
  const safeSummary = String(raw.contractor_safe_summary ?? "").trim();
  const correctionLines = Array.isArray(raw.what_needs_correction)
    ? raw.what_needs_correction.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

  if (!whatFailed && correctionLines.length === 0 && !nextStep && !safeSummary) return null;

  return {
    what_failed: whatFailed,
    what_needs_correction: correctionLines,
    next_step: nextStep,
    contractor_safe_summary: safeSummary || null,
  };
}

function formatPortalTimelineLabel(type?: string | null, meta?: any) {
  if (type === "contractor_note") {
    return getEventAttachmentCount(meta) > 0 ? "Contractor response received" : "Contractor note received";
  }
  if (type === "contractor_correction_submission") return "Correction submission received";
  if (type === "attachment_added") return "Attachment received";
  if (type === "customer_attempt") return "Contact attempt logged";
  if (type === "retest_ready_requested") return "Retest ready requested";
  if (type === "contractor_report_sent") return "Contractor report shared";
  if (type === "status_changed") return `Status updated: ${contractorSafeStatusLabel(String(meta?.to ?? ""))}`;
  if (type === "job_failed") return "Result recorded: Failed";
  if (type === "job_passed") return "Result recorded: Passed";
  if (type === "job_created") return "Job created";
  return titleCaseFromSnake(type);
}

function formatPortalTimelineDetail(type?: string | null, meta?: any) {
  const noteSummary = summarizePlainText(getEventNoteText(meta), 160);
  const attachmentLabel = getEventAttachmentLabel(meta);

  if (type === "customer_attempt") {
    const method = summarizePlainText(String(meta?.method ?? "").replace(/_/g, " "), 40);
    const result = summarizePlainText(String(meta?.result ?? "").replace(/_/g, " "), 60);
    return [method, result].filter(Boolean).join(" - ");
  }

  if (["contractor_note", "contractor_correction_submission", "attachment_added"].includes(String(type ?? ""))) {
    if (noteSummary && attachmentLabel) return `${noteSummary} - ${attachmentLabel}`;
    if (noteSummary) return noteSummary;
    if (attachmentLabel) return `Included ${attachmentLabel}`;
  }

  if (type === "retest_ready_requested") {
    return "Contractor marked corrections complete and asked for retest review.";
  }

  if (type === "contractor_report_sent") {
    return "Shared with contractor for review and next steps.";
  }

  return "";
}

function buildAddressLines(opts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const line1 = [opts.address1, opts.address2]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const cityState = [String(opts.city ?? "").trim(), String(opts.state ?? "").trim()]
    .filter(Boolean)
    .join(", ");

  const line2 = [cityState, String(opts.zip ?? "").trim()].filter(Boolean).join(" ");

  return {
    line1: line1 || "",
    line2: line2 || "",
  };
}

function normalizeMessageForCompare(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

const portalPanelClass =
  "rounded-[26px] border border-slate-200/80 bg-white/96 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] dark:border-slate-800 dark:bg-slate-950/85 sm:p-6";
const portalInsetClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/55";
const portalPrimaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_28px_-20px_rgba(37,99,235,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const portalSecondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800";
const portalInputClass =
  "w-full rounded-xl border border-slate-300/80 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

function portalIssueTheme(group: string) {
  if (group === "failed") {
    return {
      badgeClass: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
      surfaceClass: "border-rose-200/80 bg-rose-50/75 dark:border-rose-800/70 dark:bg-rose-950/20",
      eyebrowClass: "text-rose-700 dark:text-rose-300",
      statusLabel: "Needs correction",
    };
  }

  if (group === "needs_info") {
    return {
      badgeClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
      surfaceClass: "border-amber-200/80 bg-amber-50/75 dark:border-amber-800/70 dark:bg-amber-950/20",
      eyebrowClass: "text-amber-700 dark:text-amber-300",
      statusLabel: "Need information from you",
    };
  }

  if (group === "in_progress") {
    return {
      badgeClass: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
      surfaceClass: "border-blue-200/80 bg-blue-50/70 dark:border-blue-800/70 dark:bg-blue-950/20",
      eyebrowClass: "text-blue-700 dark:text-blue-300",
      statusLabel: "In progress",
    };
  }

  return {
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    surfaceClass: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-800/70 dark:bg-emerald-950/20",
    eyebrowClass: "text-emerald-700 dark:text-emerald-300",
    statusLabel: "Passed",
  };
}

export default async function PortalJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: jobId } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const noteErrorRaw = sp.note_error;
  const noteError = Array.isArray(noteErrorRaw) ? noteErrorRaw[0] : noteErrorRaw;
  const bannerRaw = sp.banner;
  const banner = Array.isArray(bannerRaw) ? bannerRaw[0] : bannerRaw;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) redirect("/ops");

  const contractorName =
    (cu as any)?.contractors?.name ?? (cu?.contractor_id ? "Contractor" : "-");

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      `
      id, title, status, lifecycle_state, ops_status, city, job_address, location_id,
      customer_id, customer_first_name, customer_last_name, customer_phone,
      created_at, follow_up_date, scheduled_date, window_start, window_end,
      permit_number, jurisdiction, permit_date, pending_info_reason, next_action_note,
      parent_job_id, contractor_id, job_type,
      contractors:contractor_id ( owner_user_id ),
      locations:location_id ( address_line1, address_line2, city, state, zip ),
      customers:customer_id ( id, full_name, first_name, last_name, phone )
      `
    )
    .eq("id", jobId)
    .eq("contractor_id", cu.contractor_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) notFound();
  if (!isPortalVisibleJob(job as any)) {
    redirect("/portal/jobs?banner=job_no_longer_active");
  }

  const accountOwnerUserId = String((job as any)?.contractors?.owner_user_id ?? "").trim();
  const supportIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });
  const supportLabel = [supportIdentity.support_phone, supportIdentity.support_email].filter(Boolean).join(" • ");

  const rootJobId = (job as any)?.parent_job_id ?? jobId;

  const { data: jobChain, error: chainErr } = await supabase
    .from("jobs")
    .select("id, parent_job_id, ops_status")
    .eq("contractor_id", cu.contractor_id)
    .is("deleted_at", null)
    .or(`id.eq.${rootJobId},parent_job_id.eq.${rootJobId}`)
    .order("created_at", { ascending: true })
    .limit(20);

  if (chainErr) throw chainErr;

  const chainJobIds = (jobChain ?? []).map((j: any) => j.id);

  const SAFE_EVENT_TYPES = [
    "job_created",
    "customer_attempt",
    "contractor_note",
    "public_note",
    "contractor_correction_submission",
    "attachment_added",
    "retest_ready_requested",
    "job_failed",
    "job_passed",
    "status_changed",
    "contractor_report_sent",
  ];

  const { data: events, error: evErr } = await supabase
    .from("job_events")
    .select("job_id, created_at, event_type, meta")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .in("event_type", SAFE_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(300);

  if (evErr) throw evErr;

  const contractorSafeEvents = (events ?? []).filter((e: any) => {
    const type = String(e?.event_type ?? "");
    const meta = typeof e?.meta === "string" ? null : e?.meta;

    if (type === "attachment_added") {
      return String(meta?.source ?? "").toLowerCase() !== "internal";
    }

    if (type === "status_changed") {
      const to = String(meta?.to ?? "").toLowerCase();
      return ["failed", "pending_office_review", "retest_needed", "paperwork_required", "closed"].includes(to);
    }

    return true;
  });

  const allowedAttachmentIds = new Set<string>();
  for (const e of contractorSafeEvents) {
    const type = String(e?.event_type ?? "");
    const meta = typeof e?.meta === "string" ? null : e?.meta;

    if (!meta) continue;

    if (["contractor_note", "public_note", "contractor_correction_submission", "attachment_added"].includes(type)) {
      const ids = Array.isArray(meta.attachment_ids) ? meta.attachment_ids : [];
      for (const id of ids) {
        const s = String(id ?? "").trim();
        if (s) allowedAttachmentIds.add(s);
      }
    }
  }

  const raterNotes = contractorSafeEvents
    .filter((e: any) => String(e?.event_type ?? "") === "public_note")
    .map((e: any) => {
      const meta = typeof e.meta === "string" ? null : e.meta;
      return {
        created_at: e.created_at,
        note: String(meta?.note ?? "").trim(),
      };
    })
    .filter((n: any) => n.note);

  const contractorNotes = contractorSafeEvents
    .filter((e: any) =>
      ["contractor_note", "contractor_correction_submission"].includes(String(e?.event_type ?? ""))
    )
    .map((e: any) => {
      const meta = typeof e.meta === "string" ? null : e.meta;
      return {
        created_at: e.created_at,
        event_type: String(e?.event_type ?? ""),
        note: String(meta?.note ?? "").trim(),
      };
    })
    .filter((n: any) => n.note);

  const { data: attachments, error: attErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (attErr) throw attErr;

  const attachmentItems = await Promise.all(
    (attachments ?? []).map(async (a: any) => {
      const { data } = await supabase.storage
        .from(String(a.bucket))
        .createSignedUrl(String(a.storage_path), 60 * 10);

      return {
        ...a,
        signedUrl: data?.signedUrl ?? null,
      };
    })
  );

  const sharedAttachmentItems = attachmentItems.filter((a: any) =>
    allowedAttachmentIds.has(String(a.id ?? ""))
  );

  const retestReadyRequests = contractorSafeEvents.filter(
    (e: any) => String(e?.event_type ?? "") === "retest_ready_requested"
  );

  const hasRetestReadyRequest = retestReadyRequests.length > 0;

  const openRetestChild =
    (jobChain ?? []).find(
      (j: any) =>
        String(j.parent_job_id ?? "") === String(jobId) &&
        String((j as any).ops_status ?? "").toLowerCase() !== "closed"
    ) ?? null;

  const hasOpenRetestChild = !!openRetestChild;

  const { data: testRuns, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id, job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .order("created_at", { ascending: false })
    .limit(100);

  if (trErr) throw trErr;

  const latestCompletedRun = (testRuns ?? []).find((r: any) => r.is_completed) ?? null;

  const latestFailedRun =
    (testRuns ?? []).find((r: any) => r.is_completed && finalRunPass(r) === false) ?? null;

  const opsStatus = String((job as any)?.ops_status ?? "").toLowerCase();
  const isEccJob = String((job as any)?.job_type ?? "").trim().toLowerCase() === "ecc";
  const isPortalFailed = ["failed", "pending_office_review", "retest_needed"].includes(opsStatus);
  const canRequestRetestReady = isEccJob && opsStatus === "failed";

  const statusRun = isPortalFailed ? (latestFailedRun ?? latestCompletedRun) : latestCompletedRun;
  const topReasons = statusRun ? extractFailureReasons(statusRun) : [];

  const resolvedIssues = resolveContractorIssues({
    job: {
      id: String((job as any)?.id ?? ""),
      ops_status: (job as any)?.ops_status,
      pending_info_reason: (job as any)?.pending_info_reason,
      follow_up_date: (job as any)?.follow_up_date,
      next_action_note: (job as any)?.next_action_note,
      action_required_by: (job as any)?.action_required_by,
      scheduled_date: (job as any)?.scheduled_date,
      window_start: (job as any)?.window_start,
      window_end: (job as any)?.window_end,
    },
    failureReasons: topReasons,
    events: contractorSafeEvents,
    chain: {
      hasOpenRetestChild,
      hasRetestReadyRequest,
    },
  });

  const primaryIssue = resolvedIssues.primaryIssue;
  const secondaryIssues = resolvedIssues.secondaryIssues ?? [];

  const loc = Array.isArray((job as any)?.locations)
    ? (job as any).locations.find((location: any) => location) ?? null
    : (job as any)?.locations ?? null;

  const addressDisplay = buildAddressLines({
    address1:
      String(loc?.address_line1 ?? "").trim() || String((job as any)?.job_address ?? "").trim(),
    address2: String(loc?.address_line2 ?? "").trim(),
    city: String(loc?.city ?? "").trim() || String((job as any)?.city ?? "").trim(),
    state: String(loc?.state ?? "").trim(),
    zip: String(loc?.zip ?? "").trim(),
  });

  const customerName =
    String((job as any)?.customers?.full_name ?? "").trim() ||
    [
      String((job as any)?.customers?.first_name ?? "").trim(),
      String((job as any)?.customers?.last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") ||
    [String((job as any)?.customer_first_name ?? "").trim(), String((job as any)?.customer_last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ") ||
    "Customer";

  const customerPhone =
    String((job as any)?.customers?.phone ?? "").trim() || String((job as any)?.customer_phone ?? "").trim() || "-";

  const isPendingInfoOps = opsStatus === "pending_info";

  const pendingInfoReasonText = String((job as any)?.pending_info_reason ?? "").trim();
  const showPermitField =
    primaryIssue.group === "needs_info" && /permit/i.test(pendingInfoReasonText);

  const latestRaterNote = raterNotes.length > 0 ? raterNotes[0].note : "";

  const latestSentReportEvent = contractorSafeEvents.find(
    (e: any) =>
      String(e?.event_type ?? "") === "contractor_report_sent" &&
      String(e?.job_id ?? "") === String(jobId)
  );

  const latestSentReportMeta =
    latestSentReportEvent && typeof latestSentReportEvent.meta !== "string"
      ? latestSentReportEvent.meta
      : null;
  const latestSentFailureSummary = readContractorFailureSummaryV1(latestSentReportMeta);
  const latestSentReportAt = latestSentReportEvent?.created_at
    ? formatDateTimeLA(String(latestSentReportEvent.created_at))
    : "";
  const latestSentContractorNote = String(latestSentReportMeta?.contractor_note ?? "").trim();
  const useLatestReportSummaryForCurrentStatus =
    Boolean(latestSentFailureSummary) && ["failed", "retest_needed"].includes(opsStatus);
  const statusHeadline = useLatestReportSummaryForCurrentStatus
    ? latestSentFailureSummary?.what_failed || primaryIssue.headline
    : primaryIssue.headline;
  const statusExplanation = useLatestReportSummaryForCurrentStatus
    ? latestSentFailureSummary?.contractor_safe_summary || primaryIssue.explanation
    : primaryIssue.explanation;
  const statusDetailLines =
    useLatestReportSummaryForCurrentStatus && (latestSentFailureSummary?.what_needs_correction?.length ?? 0) > 0
      ? latestSentFailureSummary?.what_needs_correction
      : primaryIssue.detailLines;
  const rawStatusNextStep = useLatestReportSummaryForCurrentStatus
    ? latestSentFailureSummary?.next_step || resolvedIssues.nextStep
    : resolvedIssues.nextStep;
  const normalizedStatusNextStep = normalizeMessageForCompare(rawStatusNextStep);
  const normalizedStatusHeadline = normalizeMessageForCompare(statusHeadline);
  const normalizedStatusExplanation = normalizeMessageForCompare(statusExplanation);
  const normalizedStatusDetailLines = new Set(
    (statusDetailLines ?? []).map((line: string) => normalizeMessageForCompare(line)).filter(Boolean)
  );
  const showStatusNextStep = Boolean(normalizedStatusNextStep) &&
    normalizedStatusNextStep !== normalizedStatusHeadline &&
    normalizedStatusNextStep !== normalizedStatusExplanation &&
    !normalizedStatusDetailLines.has(normalizedStatusNextStep) &&
    (
      Boolean(latestSentFailureSummary?.next_step) ||
      !["pending_info", "failed", "retest_needed", "pending_office_review"].includes(opsStatus)
    );
  const statusNextStep = showStatusNextStep ? rawStatusNextStep : "";
  const issueTheme = portalIssueTheme(primaryIssue.group);
  const customerPhoneHref = customerPhone !== "-" && digitsOnly(customerPhone) ? `tel:${digitsOnly(customerPhone)}` : "";
  const heroStatusPreview = summarizePlainText(statusNextStep || statusExplanation || resolvedIssues.nextStep, 110);
  const serviceDatePrimary = (job as any).scheduled_date ? formatBusinessDateUS(String((job as any).scheduled_date)) : "Scheduling pending";
  const serviceDateSecondary = (job as any).window_start && (job as any).window_end
    ? `${formatTimeLocal((job as any).window_start)}-${formatTimeLocal((job as any).window_end)}`
    : (job as any).scheduled_date
    ? "Time window will be confirmed soon."
    : "We will share the service time once it is set.";
  const permitDisplayValue = String((job as any).permit_number ?? "").trim();
  const permitSupportText = permitDisplayValue ? "Permit reference on file." : "We still need the permit number for this job.";

  const timelineEvents = contractorSafeEvents.filter((e: any) => {
    const type = String(e?.event_type ?? "");
    return [
      "job_created",
      "customer_attempt",
      "contractor_note",
      "contractor_correction_submission",
      "attachment_added",
      "retest_ready_requested",
      "job_failed",
      "job_passed",
      "status_changed",
      "contractor_report_sent",
    ].includes(type);
  });

  async function addContractorNote(formData: FormData) {
    "use server";

    const nextJobId = String(formData.get("job_id") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (!nextJobId) {
      redirect("/portal/jobs?banner=invalid_request");
    }
    if (!note) {
      redirect(`/portal/jobs/${nextJobId}?note_error=empty_note`);
    }

    const nextSupabase = await createClient();

    const { data: nextUserData, error: userErr } = await nextSupabase.auth.getUser();
    if (userErr) {
      redirect(`/portal/jobs/${nextJobId}?note_error=save_failed`);
    }
    if (!nextUserData?.user) redirect("/login");

    // Ownership check: verify the submitted job belongs to the authenticated user's contractor.
    // Page-level fetch only protects the render path; this action is callable directly.
    const { data: nextCu, error: cuCheckErr } = await nextSupabase
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", nextUserData.user.id)
      .maybeSingle();

    if (cuCheckErr) {
      redirect(`/portal/jobs/${nextJobId}?note_error=save_failed`);
    }
    if (!nextCu?.contractor_id) {
      redirect(`/portal/jobs/${nextJobId}?note_error=not_allowed`);
    }

    const { data: ownedJob, error: jobCheckErr } = await nextSupabase
      .from("jobs")
      .select("id")
      .eq("id", nextJobId)
      .eq("contractor_id", nextCu.contractor_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobCheckErr) {
      redirect(`/portal/jobs/${nextJobId}?note_error=save_failed`);
    }
    if (!ownedJob?.id) {
      redirect(`/portal/jobs/${nextJobId}?note_error=not_allowed`);
    }

    // Idempotency guard: if the same actor submits the same note back-to-back,
    // keep only one canonical contractor_note event.
    const { data: recentDuplicate, error: dupErr } = await nextSupabase
      .from("job_events")
      .select("id")
      .eq("job_id", nextJobId)
      .eq("event_type", "contractor_note")
      .eq("user_id", nextUserData.user.id)
      .contains("meta", { note })
      .gte("created_at", new Date(Date.now() - 15_000).toISOString())
      .maybeSingle();

    if (dupErr) {
      redirect(`/portal/jobs/${nextJobId}?note_error=save_failed`);
    }
    if (recentDuplicate?.id) {
      revalidatePath(`/portal/jobs/${nextJobId}`);
      redirect(`/portal/jobs/${nextJobId}?banner=note_duplicate`);
    }

    const { error: insErr } = await nextSupabase.from("job_events").insert({
      job_id: nextJobId,
      event_type: "contractor_note",
      user_id: nextUserData.user.id,
      meta: { note },
    });

    if (insErr) {
      redirect(`/portal/jobs/${nextJobId}?note_error=save_failed`);
    }

    await insertInternalNotificationForEvent({
      supabase: nextSupabase,
      jobId: nextJobId,
      eventType: "contractor_note",
      actorUserId: nextUserData.user.id,
    });

    revalidatePath(`/portal/jobs/${nextJobId}`);
    redirect(`/portal/jobs/${nextJobId}?banner=note_saved`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7 text-gray-900 dark:text-gray-100">
      {banner === "job_created" ? (
        <FlashBanner type="success" message="Job created." />
      ) : null}

      {banner === "job_already_created" ? (
        <FlashBanner type="warning" message="Job already created." />
      ) : null}

      {banner === "note_saved" ? (
        <FlashBanner type="success" message="Saved." />
      ) : null}

      {banner === "note_duplicate" ? (
        <FlashBanner type="warning" message="This submission was already received." />
      ) : null}

      {banner === "retest_ready_requested" ? (
        <FlashBanner type="success" message="Submission received." />
      ) : null}

      {banner === "retest_ready_already_received" ? (
        <FlashBanner type="warning" message="This submission was already received." />
      ) : null}

      {banner === "invalid_request" ? (
        <FlashBanner type="warning" message="That action could not be completed. Please open the job again and try once more." />
      ) : null}

      <section className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_60%,rgba(239,246,255,0.68))] p-5 shadow-[0_24px_48px_-34px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(17,24,39,0.96)_62%,rgba(15,23,42,0.92))] sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <Link
            href="/portal"
            className={portalSecondaryButtonClass}
          >
            Back to portal
          </Link>
          <div className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${issueTheme.badgeClass}`}>
            {issueTheme.statusLabel}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 md:items-stretch">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{contractorName}</div>

            <div className="text-[clamp(1.7rem,4vw,2.35rem)] font-semibold tracking-[-0.03em] leading-tight text-slate-950 dark:text-slate-100">{customerName}</div>
            <div className="text-base font-semibold text-slate-700 dark:text-slate-300">{String((job as any).title ?? "Job")}</div>
            {heroStatusPreview ? (
              <div className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {heroStatusPreview}
              </div>
            ) : null}

            <div className="space-y-1.5">
              {addressDisplay.line1 ? (
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{addressDisplay.line1}</div>
              ) : null}
              {addressDisplay.line2 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">{addressDisplay.line2}</div>
              ) : null}
              {!addressDisplay.line1 && !addressDisplay.line2 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Address not available</div>
              ) : null}
            </div>
          </div>

          <div className="h-full w-full">
            <JobLocationPreview
              addressLine1={String(loc?.address_line1 ?? "").trim() || String((job as any)?.job_address ?? "").trim()}
              addressLine2={String(loc?.address_line2 ?? "").trim()}
              city={String(loc?.city ?? "").trim() || String((job as any)?.city ?? "").trim()}
              state={String(loc?.state ?? "").trim()}
              zip={String(loc?.zip ?? "").trim()}
            />
          </div>
        </div>

        <div className={`grid grid-cols-1 ${showPermitField ? "md:grid-cols-4" : "md:grid-cols-3"} gap-3 text-sm`}>
          <div className={portalInsetClass}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Customer Phone</div>
            <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{customerPhone}</div>
            {customerPhoneHref ? (
              <a href={customerPhoneHref} className={`mt-3 ${portalSecondaryButtonClass}`}>
                Call customer
              </a>
            ) : null}
          </div>

          <div className={`rounded-xl border p-4 ${issueTheme.surfaceClass}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${issueTheme.eyebrowClass}`}>Current Status</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-950 dark:text-slate-100">{primaryIssue.headline}</span>
              {isPendingInfoOps ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  More info needed
                </span>
              ) : null}
            </div>
            {heroStatusPreview ? (
              <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{heroStatusPreview}</div>
            ) : null}
          </div>

          <div className={portalInsetClass}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Service Date</div>
            <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {serviceDatePrimary}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{serviceDateSecondary}</div>
          </div>

          {showPermitField ? (
          <div className={portalInsetClass}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Permit Number</div>
              <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{permitDisplayValue || "Still needed"}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{permitSupportText}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={`${portalPanelClass} space-y-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Current status</div>
            <div className="mt-2 text-[1.55rem] font-semibold tracking-[-0.025em] text-slate-950 dark:text-slate-100">{statusHeadline}</div>
          </div>
          <div className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${issueTheme.badgeClass}`}>
            {issueTheme.statusLabel}
          </div>
        </div>
        {statusExplanation ? (
          <div className="max-w-3xl text-sm leading-7 text-slate-700 dark:text-slate-200">{statusExplanation}</div>
        ) : null}

        {(statusDetailLines ?? []).slice(0, 4).length > 0 ? (
          <div className={`${portalInsetClass} space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">What to address</div>
            {(statusDetailLines ?? []).slice(0, 4).map((reason: string, idx: number) => (
              <div key={`${reason}-${idx}`}>{reason}</div>
            ))}
          </div>
        ) : null}

        {statusNextStep ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-100">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">Next step</div>
            <div className="mt-1 font-medium leading-6">{statusNextStep}</div>
          </div>
        ) : null}

        {hasRetestReadyRequest ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
            Retest request received — we&apos;ll schedule it shortly.
          </div>
        ) : null}

        {latestRaterNote ? (
          <div className={portalInsetClass}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Additional Note</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This note is separate from the issue summary above.
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">{latestRaterNote}</div>
          </div>
        ) : null}
      </section>


      {latestSentReportMeta ? (
        <section className={`${portalPanelClass} space-y-3`}>
          <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Latest Contractor Report</div>

          <div className={`${portalInsetClass} text-sm space-y-2`}>
            <div>
              {latestSentReportAt
                ? `The latest contractor report was shared on ${latestSentReportAt}.`
                : "A contractor report was previously shared for this job."}
            </div>
            {latestSentFailureSummary ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {useLatestReportSummaryForCurrentStatus
                  ? "Current status above reflects the latest contractor report."
                  : "The latest contractor report remains available here for historical context."}
              </div>
            ) : null}
            {latestSentContractorNote ? (
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">Included Note</div>
                <div className="mt-1 whitespace-pre-wrap leading-6 text-slate-700 dark:text-slate-200">{latestSentContractorNote}</div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {secondaryIssues.length > 0 ? (
        <section className={`${portalPanelClass} space-y-4`}>
          <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Additional Blockers</div>
          <div className="space-y-2">
            {secondaryIssues.map((issue, idx) => (
              <div key={`${issue.group}-${idx}`} className={`${portalInsetClass} p-3.5`}>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{issue.headline}</div>
                {issue.explanation ? (
                  <div className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{issue.explanation}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${portalPanelClass} space-y-5`}>
        <div>
          <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Contractor Actions</div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Share updates, request review when corrections are complete, and keep the job record current.
          </div>
        </div>

        {canRequestRetestReady && !hasOpenRetestChild ? (
          <div className={`${portalInsetClass} space-y-3`}>
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">Request retest</div>
              <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Use this when the correction work is complete and the job is ready for internal review.
              </div>
            </div>
            {hasRetestReadyRequest ? (
              <div className="text-sm text-emerald-700 dark:text-emerald-300">
                Retest Ready has already been submitted.
              </div>
            ) : (
              <form action={requestRetestReadyFromPortal}>
                <input type="hidden" name="job_id" value={jobId} />
                <SubmitButton
                  loadingText="Submitting..."
                  className={portalPrimaryButtonClass}
                >
                  Retest Ready
                </SubmitButton>
              </form>
            )}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">Add contractor note</div>
            <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Share progress, context, or questions that should stay with the job record.
            </div>
          </div>
          {noteError === "empty_note" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-300">
              Please enter a note before sending.
            </div>
          ) : null}
          {noteError === "not_allowed" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-300">
              You do not have access to update this job.
            </div>
          ) : null}
          {noteError === "save_failed" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-300">
              We could not save your note. Please try again.
            </div>
          ) : null}
          <form action={addContractorNote} className="space-y-3">
            <input type="hidden" name="job_id" value={jobId} />
            <textarea
              name="note"
              rows={3}
              placeholder="Type your note here..."
              className={`${portalInputClass} resize-none`}
            />
            <SubmitButton loadingText="Saving..." className={`${portalPrimaryButtonClass} disabled:opacity-60 disabled:cursor-not-allowed`}>
              Save Note
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className={`${portalPanelClass} space-y-5`}>
        <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Notes</div>

        <div className={portalInsetClass}>
          <div className="text-sm font-medium text-slate-950 dark:text-slate-100">Rater / Inspector Notes</div>
          {raterNotes.length === 0 ? (
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">No notes yet.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {raterNotes.map((n: any, idx: number) => (
                <div key={`rater-${idx}`} className="rounded-lg border border-slate-200/80 bg-white px-3.5 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <div className="text-xs text-slate-500 dark:text-slate-300">
                    {n.created_at ? formatDateLA(String(n.created_at)) : "-"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={portalInsetClass}>
          <div className="text-sm font-medium text-slate-950 dark:text-slate-100">Contractor Notes</div>
          {contractorNotes.length === 0 ? (
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">No notes yet.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {contractorNotes.map((n: any, idx: number) => (
                <div key={`contractor-${idx}`} className="rounded-lg border border-slate-200/80 bg-white px-3.5 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <div className="text-xs text-slate-500 dark:text-slate-300">
                    {n.event_type === "contractor_correction_submission"
                      ? "Correction submission"
                      : "Contractor note"}
                    {" • "}
                    {n.created_at ? formatDateLA(String(n.created_at)) : "-"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={`${portalPanelClass} space-y-4`}>
        <div className="space-y-1">
          <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Photos &amp; Files</div>
          <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">Add photos or documents related to this job.</div>
        </div>
        <JobAttachments jobId={jobId} initialItems={sharedAttachmentItems} />
      </section>

      <section className={`${portalPanelClass} space-y-4`}>
        <div>
          <div className="text-base font-semibold text-slate-950 dark:text-slate-100">Timeline</div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">A simplified history of updates that are visible in the portal.</div>
        </div>

        {timelineEvents.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">No timeline events yet.</div>
        ) : (
          <div className="space-y-2">
            {timelineEvents.map((e: any, idx: number) => {
              const type = String(e?.event_type ?? "");
              const meta = typeof e.meta === "string" ? null : e.meta;

              const label =
                formatPortalTimelineLabel(type, meta);
              const detail = formatPortalTimelineDetail(type, meta);

              return (
                <div key={`${String(e.created_at)}-${idx}`} className={`${portalInsetClass} p-3.5`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-300">
                      {e.created_at ? formatDateTimeLA(String(e.created_at)) : "-"}
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-medium text-slate-950 dark:text-slate-100">{label}</div>

                  {detail ? (
                    <div className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{detail}</div>
                  ) : null}

                  {type === "customer_attempt" ? (
                    <div className="text-xs text-slate-500 dark:text-slate-300">
                      Operational contact history recorded for this job.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.98))] px-6 py-4 text-center text-sm leading-6 text-slate-600 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-950/85 dark:text-slate-300">
        If you need help, contact {supportIdentity.display_name}
        {supportLabel ? (
          <>
            : <b className="text-slate-950 dark:text-slate-100">{supportLabel}</b>
          </>
        ) : (
          "."
        )}
      </div>
    </div>
  );
}
