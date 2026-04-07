// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import { archiveJobFromForm } from "@/lib/actions/job-actions";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  getContractors,
  assignJobAssigneeFromForm,
  setPrimaryJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  updateJobCustomerFromForm,
  updateJobContractorFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  updateJobTypeFromForm,
  completeDataEntryFromForm,
  type JobStatus,
  createRetestJobFromForm,
  addPublicNoteFromForm,
  addInternalNoteFromForm,
  getOnTheWayUndoEligibility,
  revertOnTheWayFromForm,
} from "@/lib/actions/job-actions";
import CancelJobButton from "@/components/jobs/CancelJobButton";

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
  releaseAndReevaluateFromForm,
  markJobFieldCompleteFromForm,
  markCertsCompleteFromForm,
  markInvoiceCompleteFromForm,
  resolveFailureByCorrectionReviewFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

import ServiceStatusActions from "./_components/ServiceStatusActions";
import { displayDateLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { JobFieldActionButton } from "./_components/JobFieldActionButton";
import UnscheduleButton from "./_components/UnscheduleButton";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import ContractorReportPanel from "./_components/ContractorReportPanel";
import { resolveContractorResponseTracking } from "@/lib/portal/resolveContractorIssues";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  getAssignableInternalUsers,
  getActiveJobAssignmentDisplayMap,
  resolveUserDisplayMap,
} from "@/lib/staffing/human-layer";

import JobAttachmentsInternal from "./_components/JobAttachmentsInternal";
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from "@/lib/actions/job-evaluator";

function dateToDateInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}


function formatDateLAFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLAFromIso(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

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


function formatDateDisplay(date?: string | null) {
  if (!date) return "";
  return date;
}

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  const s = String(time);
  return s.slice(0, 5);
}

function finalRunPass(run: any): boolean | null {
  if (!run) return null;
  return run.override_pass != null ? !!run.override_pass : !!run.computed_pass;
}

function isFailedFamilyOpsStatus(value?: string | null) {
  return ["failed", "retest_needed", "pending_office_review"].includes(
    String(value ?? "").toLowerCase()
  );
}

function serviceChainVisitLabel(visit: any, idx: number) {
  if (idx === 0 && !visit?.parent_job_id) return "Original visit";
  if (visit?.parent_job_id) return "Retest visit";
  return `Visit ${idx + 1}`;
}


function timeToTimeInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.slice(0, 5);
  }

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(
    meta.note ??
      meta.message ??
      meta.caption ??
      ""
  ).trim();
}

function getEventAttachmentCount(meta?: any) {
  if (!meta) return 0;
  const explicitCount = Number(meta.count ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  if (Array.isArray(meta.attachment_ids) && meta.attachment_ids.length > 0) {
    return meta.attachment_ids.length;
  }
  if (Array.isArray(meta.file_names) && meta.file_names.length > 0) {
    return meta.file_names.length;
  }
  if (typeof meta.file_name === "string" && meta.file_name.trim()) {
    return 1;
  }
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

function formatSharedHistoryHeading(type?: string | null, meta?: any) {
  const attachmentLabel = getEventAttachmentLabel(meta);

  if (type === "public_note") {
    return attachmentLabel ? "Update shared with contractor" : "Note shared with contractor";
  }
  if (type === "contractor_note") {
    return attachmentLabel ? "Contractor response received" : "Contractor note received";
  }
  if (type === "contractor_correction_submission") {
    return "Correction submission received";
  }

  return formatTimelineEvent(type, meta);
}

function formatTimelineDetail(type?: string | null, meta?: any, message?: string | null) {
  const noteSummary = summarizePlainText(getEventNoteText(meta), 160);
  const attachmentLabel = getEventAttachmentLabel(meta);
  const cleanMessage = summarizePlainText(message, 160);

  if (type === "customer_attempt") {
    const method = summarizePlainText(String(meta?.method ?? "").replace(/_/g, " "), 40);
    const result = summarizePlainText(String(meta?.result ?? "").replace(/_/g, " "), 60);
    return [method, result].filter(Boolean).join(" - ");
  }

  if (type === "status_changed") {
    const from = summarizePlainText(String(meta?.from ?? "").replace(/_/g, " "), 40);
    const to = summarizePlainText(String(meta?.to ?? "").replace(/_/g, " "), 40);
    if (from && to) return `${from} -> ${to}`;
    return to || from || cleanMessage;
  }

  if (type === "attachment_added") {
    const actor =
      meta?.source === "internal"
        ? "Internal upload"
        : meta?.source === "contractor"
        ? "Contractor upload"
        : "Upload";
    if (attachmentLabel && noteSummary) return `${actor} - ${attachmentLabel} - ${noteSummary}`;
    if (attachmentLabel) return `${actor} - ${attachmentLabel}`;
    return noteSummary || cleanMessage;
  }

  if (["public_note", "contractor_note", "internal_note", "contractor_correction_submission"].includes(String(type ?? ""))) {
    if (noteSummary && attachmentLabel) return `${noteSummary} - ${attachmentLabel}`;
    if (noteSummary) return noteSummary;
    if (attachmentLabel) return `Included ${attachmentLabel}`;
    return "";
  }

  return cleanMessage;
}



function formatTimelineEvent(type?: string | null, meta?: any, message?: string | null) {
  const eventType = String(type ?? "");
  if (eventType === "attachment_added") {
  const count = Number(
    meta?.count ??
      meta?.attachment_ids?.length ??
      meta?.file_names?.length ??
      0
  );

  const actor =
    meta?.source === "internal"
      ? "Internal user"
      : meta?.source === "contractor"
      ? "Contractor"
      : "User";

  return `${actor} uploaded ${count} attachment${count === 1 ? "" : "s"}`;
}

 const map: Record<string, string> = {
  job_created: "Job created",
  intake_submitted: "Intake submitted",
  scheduled: "Job scheduled",
  unscheduled: "Schedule removed",
  schedule_updated:
    meta?.source === "auto_schedule_on_the_way"
      ? "Schedule auto-filled from field action"
      : "Schedule updated",

  on_my_way: "Technician marked On the Way",
  on_the_way_reverted: "On the Way was reverted",
  job_started: "Technician started work",
  job_completed: "Technician completed the visit",

  job_failed: "Job failed",
  job_passed: "Job passed",

  retest_created: "Retest created",
  retest_scheduled: "Retest scheduled",
  retest_started: "Retest started",
  retest_passed: "Retest passed",
  retest_failed: "Retest failed",
  failure_resolved_by_correction_review: "Failure resolved by correction review",

  customer_attempt: "Customer contact attempt",
  status_changed: "Status changed",

  contractor_note: "Contractor note added",
  contractor_correction_submission: "Contractor submitted corrections",
  ops_update: "Ops updated",
};

if (eventType === "ops_update") {
  return String(
    message ??
    meta?.message ??
    meta?.note ??
    "Ops updated"
  ).trim();
}

return map[eventType] ?? eventType.replaceAll("_", " ");

}


function formatStatus(status?: string | null) {
  const s = (status ?? "").toString();
  const map: Record<JobStatus, string> = {
    open: "Open",
    on_the_way: "On The Way",
    in_process: "In Process",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return (map as any)[s] ?? (s ? s : "—");
}

function nextStatusLabel(status?: string | null) {
  const s = (status ?? "open") as JobStatus;
  const nextMap: Record<JobStatus, string> = {
    open: "On The Way",
    on_the_way: "In Process",
    in_process: "Completed",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return nextMap[s] ?? "—";
}

function CollapsibleHeader(props: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  const { title, subtitle, meta } = props;
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-0.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden
          className="disclosure-icon mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white/80 text-[9px] text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform duration-150 group-open:rotate-90"
        >
          ▶
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="text-[14.5px] font-semibold tracking-[-0.02em] text-slate-950">{title}</div>
          {subtitle ? <div className="mt-1 max-w-[42rem] text-[11.5px] leading-[1.45] text-slate-500">{subtitle}</div> : null}
        </div>
      </div>
      {meta ? <div className="mt-0.5 shrink-0 rounded-lg border border-slate-200/70 bg-slate-50/72 px-2.5 py-[0.3125rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{meta}</div> : null}
    </div>
  );
}

function truncateSummaryText(value: string, maxLength = 84) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}


type JobSearchParams = {
  tab?: "info" | "ops" | "tests";
  banner?: string;
  notice?: string;
  schedule_required?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const workspacePanelClass =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.28)]";
const workspaceSectionClass = `${workspacePanelClass} p-5 sm:p-6`;
const workspaceInsetClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3";
const workspaceSubtleCardClass =
  "rounded-xl border border-slate-200/80 bg-white/88 px-4 py-3";
const workspaceFieldLabelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const workspaceInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";
const workspaceTextareaClass = `${workspaceInputClass} min-h-[7rem]`;
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const compactSecondaryButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:min-h-10 sm:px-4";
const darkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";
const infoChipClass =
  "inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700";
const compactUtilityButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/78 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-300 hover:bg-white hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const compactWorkspaceActionButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-200/90 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-[0_10px_22px_-20px_rgba(37,99,235,0.35)] transition-[border-color,background-color,box-shadow,transform,color] hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950 hover:shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const workspaceDetailsClass =
  `${workspaceSectionClass} group text-gray-900 transition-shadow duration-150 hover:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.32)] [&[open]_.disclosure-icon]:rotate-90`;
const workspaceDetailsDividerClass = "mt-3 border-t border-slate-200/90 pt-4";
const workspaceSoftCardClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/72 p-4";
const workspaceEmptyStateClass =
  "rounded-lg border border-dashed border-slate-300 bg-slate-50/72 px-4 py-4 text-sm text-slate-600";
const workspaceUtilityControlClass =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;

  if (!jobId) {
    throw new Error("Missing route param: id");
  }

  const sp: SearchParams = (searchParams ? await searchParams : {}) ?? {};

  const tabRaw = sp.tab;
  const tab =
    Array.isArray(tabRaw)
      ? tabRaw[0]
      : typeof tabRaw === "string"
      ? tabRaw
      : "info";

  const noticeRaw = sp.notice;
  const notice =
    Array.isArray(noticeRaw)
      ? noticeRaw[0]
      : typeof noticeRaw === "string"
      ? noticeRaw
      : "";

  const bannerRaw = sp.banner;
  const banner =
    Array.isArray(bannerRaw)
      ? bannerRaw[0]
      : typeof bannerRaw === "string"
      ? bannerRaw
      : "";

  const showEccNotice = notice === "ecc_test_required";

  const supabase = await createClient();
  const contractors = await getContractors();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let isInternalUser = false;

  try {
    await requireInternalUser({ supabase, userId: user.id });
    isInternalUser = true;
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;

      if (cu) {
        redirect(`/portal/jobs/${jobId}`);
      }

      redirect("/login");
    }

    throw error;
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      customer_id,
       service_case_id,
      job_type,
      project_type,
      id,
      parent_job_id,
      title,
      city,
      job_address,
      status,
      scheduled_date,
      created_at,
      contractor_id,
      ops_status,
      field_complete,
      certs_complete,
      invoice_complete,
      invoice_number,
      pending_info_reason,
      on_hold_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
      permit_number,
      jurisdiction,
      permit_date,
      window_start,
      window_end,
      customer_phone,
      on_the_way_at,
      customer_first_name,
      customer_last_name,
      customer_email,
      job_notes,
      billing_recipient,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2, 
      billing_city,
      billing_state,
      billing_zip,
      locations:location_id (
        id,
        address_line1,
        address_line2,
        city,
        state,
        zip
      ),
      job_equipment (
        id,
        equipment_role,
        manufacturer,
        model,
        serial,
        tonnage,
        heating_capacity_kbtu,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `)
    .eq("id", jobId)

    .single();

  if (jobError) throw jobError;
  if (!job) return notFound();

  const looksStalePaperworkStatus =
    String(job.ops_status ?? "").toLowerCase() === "paperwork_required" &&
    Boolean(job.field_complete) &&
    Boolean(job.certs_complete) &&
    Boolean(job.invoice_complete);

  if (looksStalePaperworkStatus) {
    await evaluateJobOpsStatus(jobId);
    await healStalePaperworkOpsStatus(jobId);

    const { data: healedRow, error: healedErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", jobId)
      .single();

    if (!healedErr && healedRow?.ops_status != null) {
      job.ops_status = healedRow.ops_status;
    }
  }

  const activeAssignmentDisplayMap = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: [String(job.id ?? jobId)],
  });

  const assignedTeam =
    activeAssignmentDisplayMap[String(job.id ?? jobId)] ?? [];

  const assignableInternalUsers = isInternalUser
    ? await getAssignableInternalUsers({ supabase })
    : [];

  const assignedUserIds = new Set(
    assignedTeam
      .map((row) => String(row.user_id ?? "").trim())
      .filter(Boolean),
  );

  const assignmentCandidates = assignableInternalUsers.filter(
    (row) => !assignedUserIds.has(String(row.user_id ?? "").trim()),
  );

  // --- Linked Jobs (Parent + Children) ---
const parentJobId = (job as any).parent_job_id as string | null;
const retestRootId = parentJobId ?? jobId;

// --- Service Chain (full case history) ---
const serviceCaseId = (job as any).service_case_id as string | null;

const { data: serviceChainJobs, error: serviceChainErr } = serviceCaseId
  ? await supabase
      .from("jobs")
      .select(
        "id, title, status, ops_status, job_type, created_at, scheduled_date, window_start, window_end, parent_job_id"
      )
      .eq("service_case_id", serviceCaseId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50)
  : { data: [], error: null };

if (serviceChainErr) throw new Error(serviceChainErr.message);

const serviceChainJobIds = (serviceChainJobs ?? []).map((j: any) => j.id);

const { data: serviceChainRuns, error: serviceChainRunsErr } =
  serviceChainJobIds.length > 0
    ? await supabase
        .from("ecc_test_runs")
        .select(
          "id, job_id, created_at, test_type, computed, computed_pass, override_pass, is_completed"
        )
        .in("job_id", serviceChainJobIds)
        .eq("is_completed", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

if (serviceChainRunsErr) throw new Error(serviceChainRunsErr.message);

const latestServiceChainRunByJob = new Map<string, any>();
const latestFailedServiceChainRunByJob = new Map<string, any>();

for (const run of serviceChainRuns ?? []) {
  // because we ordered newest first,
  // the first run we see for a job is the newest one
  const rowJobId = String(run.job_id ?? "").trim();
  if (!rowJobId) continue;
  if (!latestServiceChainRunByJob.has(rowJobId)) {
    latestServiceChainRunByJob.set(rowJobId, run);
  }
  if (finalRunPass(run) === false && !latestFailedServiceChainRunByJob.has(rowJobId)) {
    latestFailedServiceChainRunByJob.set(rowJobId, run);
  }
}

const serviceChainFailureReasonByJob = new Map<string, string>();
for (const [rowJobId, run] of latestFailedServiceChainRunByJob.entries()) {
  const primaryReason = String(extractFailureReasons(run)[0] ?? "").trim();
  if (primaryReason) serviceChainFailureReasonByJob.set(rowJobId, primaryReason);
}

const { data: timelineJobs, error: timelineJobsErr } = await supabase
  .from("jobs")
  .select("id")
  .is("deleted_at", null)
  .or(`id.eq.${retestRootId},parent_job_id.eq.${retestRootId}`)
  .limit(50);

if (timelineJobsErr) throw new Error(timelineJobsErr.message);

const timelineJobIds = (timelineJobs ?? []).map((j: any) => String(j.id ?? "")).filter(Boolean);

// --- Unified Timeline (job_events) ---
const { data: timelineEvents, error: tlErr } = await supabase
  .from("job_events")
  .select("id, job_id, created_at, event_type, message, meta, user_id")
  .in("job_id", timelineJobIds.length ? timelineJobIds : [jobId])
  .order("created_at", { ascending: false })
  .limit(200);
if (tlErr) throw new Error(tlErr.message);

const timelineActorIds = Array.from(
  new Set(
    (timelineEvents ?? [])
      .flatMap((e: any) => {
        const meta = e?.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
        return [
          String(e?.user_id ?? "").trim(),
          String(meta?.actor_user_id ?? "").trim(),
        ];
      })
      .filter(Boolean),
  ),
);

const actorDisplayMap = await resolveUserDisplayMap({
  supabase,
  userIds: timelineActorIds,
});

const eventsForCurrentJob = (timelineEvents ?? []).filter(
  (e: any) => String(e?.job_id ?? "") === String(job.id ?? "")
);

const latestContractorReportEvent = eventsForCurrentJob.find(
  (e: any) => String(e?.event_type ?? "") === "contractor_report_sent"
);

const latestContractorReportEventId = String(latestContractorReportEvent?.id ?? "").trim();

const contractorResponseTracking = resolveContractorResponseTracking(eventsForCurrentJob as any[]);

const contractorResponseLabel = contractorResponseTracking.latestReportSentAt
  ? contractorResponseTracking.waitingOnContractor
    ? "Waiting on contractor"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "note"
    ? "Contractor responded"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "correction"
    ? "Correction submitted"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "retest"
    ? "Retest requested"
    : contractorResponseTracking.hasContractorResponse
    ? "Contractor responded"
    : null
  : null;

const contractorResponseSubLabel =
  contractorResponseTracking.latestReportSentAt &&
  contractorResponseTracking.hasContractorResponse &&
  contractorResponseTracking.awaitingInternalReview
    ? "Awaiting internal review"
    : null;

const onTheWayUndoEligibility = await getOnTheWayUndoEligibility(jobId);

const { data: attachmentRows, error: attachmentErr } = await supabase
  .from("attachments")
  .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
  .eq("entity_type", "job")
  .eq("entity_id", jobId)
  .order("created_at", { ascending: false })
  .limit(200);

if (attachmentErr) throw new Error(attachmentErr.message);

const attachmentAdmin = createAdminClient();

const attachmentItems = await Promise.all(
  (attachmentRows ?? []).map(async (a: any) => {
    const bucket = String(a?.bucket ?? "").trim();
    const storagePath = String(a?.storage_path ?? "").trim().replace(/^\/+/, "");
    const contentType =
      typeof a?.content_type === "string" && a.content_type.trim().length > 0
        ? a.content_type.trim()
        : null;

    let signedUrl: string | null = null;

    if (!bucket || !storagePath) {
      console.warn("Job attachment row missing bucket/storage_path", {
        jobId,
        attachmentId: String(a?.id ?? "").trim() || null,
        bucket: bucket || null,
        storagePath: storagePath || null,
        contentType,
      });
    } else {
      const { data, error: signErr } = await attachmentAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60);

      if (signErr || !data?.signedUrl) {
        console.warn("Job attachment signing failed", {
          jobId,
          attachmentId: String(a?.id ?? "").trim() || null,
          bucket,
          storagePath,
          contentType,
          error: signErr?.message ?? "missing_signed_url",
        });
      } else {
        signedUrl = data.signedUrl;
      }
    }

    return {
      ...a,
      bucket,
      storage_path: storagePath,
      content_type: contentType,
      signedUrl,
    };
  })
);

  const sharedNotes = (timelineEvents ?? []).filter((e: any) =>
    ["contractor_note", "public_note", "contractor_correction_submission"].includes(
      String(e?.event_type ?? "")
    )
  );

  const internalNotes = (timelineEvents ?? []).filter(
    (e: any) => String(e?.event_type ?? "") === "internal_note"
  );

  const reportFollowUpContextNotes = internalNotes.filter((e: any) => {
    const meta = e && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
    return String(meta?.context ?? "") === "contractor_report_review";
  });

  const anchoredReportFollowUpNotes = latestContractorReportEventId
    ? reportFollowUpContextNotes.filter((e: any) => {
        const meta = e && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
        return String(meta?.anchor_event_id ?? "").trim() === latestContractorReportEventId;
      })
    : [];

  const reportFollowUpNotes =
    anchoredReportFollowUpNotes.length > 0
      ? anchoredReportFollowUpNotes
      : reportFollowUpContextNotes;

  const { data: customerAttempts, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta, user_id")
    .eq("job_id", jobId)

    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: false })
    .limit(200);

  if (attemptsErr) throw new Error(attemptsErr.message);

const contractorId = job.contractor_id ?? null;
const customerId = job.customer_id ?? null;

const { data: contractorBilling } = contractorId
  ? await supabase
      .from("contractors")
      .select(
        "id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", contractorId)
      .maybeSingle()
  : { data: null };

const { data: customerBilling } = customerId
  ? await supabase
      .from("customers")
      .select(
        "id, full_name, first_name, last_name, phone, email, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", customerId)
      .maybeSingle()
  : { data: null };


  const attemptCount = customerAttempts?.length ?? 0;
  const lastAttemptIso =
    customerAttempts?.[0]?.created_at ? String(customerAttempts[0].created_at) : null;

  const lastAttemptLabel = lastAttemptIso ? formatDateLAFromIso(lastAttemptIso) : "—";
  const last3Attempts = (customerAttempts ?? []).slice(0, 25);

  const customerName =
  (customerBilling?.full_name ||
    [customerBilling?.first_name, customerBilling?.last_name].filter(Boolean).join(" ").trim() ||
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ").trim() ||
    "—");

const customerPhone =
  customerBilling?.phone ?? job.customer_phone ?? "—";

const customerEmail =
  customerBilling?.email ?? job.customer_email ?? "—";

  const contractorName =
    contractors?.find((c: any) => c.id === job.contractor_id)?.name ?? "—";

  const firstNonEmpty = (...values: Array<unknown>) => {
    for (const v of values) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return null;
  };

  const serviceLocation = Array.isArray((job as any).locations)
    ? (job as any).locations.find((location: any) => location) ?? null
    : (job as any).locations ?? null;

  const serviceAddressLine1 =
    firstNonEmpty(
      serviceLocation?.address_line1,
      (job as any).address_line1,
      job.job_address
    );

  const serviceAddressLine2 =
    firstNonEmpty(
      serviceLocation?.address_line2,
      (job as any).address_line2
    );

  const serviceCity =
    firstNonEmpty(
      serviceLocation?.city,
      job.city
    );

  const serviceState =
    firstNonEmpty(
      serviceLocation?.state,
      (job as any).state
    );

  const serviceZip =
    firstNonEmpty(
      serviceLocation?.zip,
      (job as any).zip
    );

  const serviceAddressParts = [
    serviceAddressLine1,
    serviceAddressLine2,
    [serviceCity, serviceState, serviceZip].filter(Boolean).join(" "),
  ].filter((x) => String(x ?? "").trim().length > 0);

  const serviceAddressDisplay =
    serviceAddressParts.length > 0 ? serviceAddressParts.join(", ") : "No address set";

    const hasFullSchedule =
    !!job.scheduled_date &&
    !!job.window_start &&
    !!job.window_end;

  const appointmentDateLabel = job.scheduled_date
    ? formatBusinessDateUS(String(job.scheduled_date))
    : "No appointment scheduled";
  const appointmentTimeLabel =
    job.window_start && job.window_end
      ? `${formatTimeDisplay(job.window_start)}–${formatTimeDisplay(job.window_end)}`
      : job.window_start
      ? `Starts ${formatTimeDisplay(job.window_start)}`
      : job.window_end
      ? `Ends ${formatTimeDisplay(job.window_end)}`
      : job.scheduled_date
      ? "Time window TBD"
      : "Use the schedule controls below to assign a visit time.";

function formatOpsStatusLabel(value?: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return "—";

  const labelMap: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    on_the_way: "On the Way",
    in_process: "In Progress",
    pending_info: "Pending Info",
    pending_office_review: "Pending Office Review",
    on_hold: "On Hold",
    failed: "Failed",
    retest_needed: "Retest Needed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  const mapped = labelMap[v.toLowerCase()];
  if (mapped) return mapped;

  return v
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function serviceChainBadgeClass(opsStatus?: string | null, isCurrent?: boolean) {
  const v = String(opsStatus ?? "").toLowerCase();

  if (isCurrent) {
    return "bg-black text-white";
  }

  if (v === "failed" || v === "retest_needed" || v === "pending_office_review") {
    return "bg-red-100 text-red-800";
  }

  if (v === "pending_info") {
    return "bg-amber-100 text-amber-800";
  }

  if (v === "scheduled" || v === "ready") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (v === "paperwork_required" || v === "invoice_required" || v === "field_complete") {
    return "bg-blue-100 text-blue-800";
  }

  if (v === "closed") {
    return "bg-gray-200 text-gray-800";
  }

  return "bg-gray-100 text-gray-700";
}
    
function formatBillingAddress(a: {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
}) {
  const line1 = a.billing_address_line1 ?? "";
  const line2 = a.billing_address_line2 ?? "";
  const city = a.billing_city ?? "";
  const state = a.billing_state ?? "";
  const zip = a.billing_zip ?? "";

  const parts = [
    line1,
    line2,
    [city, state, zip].filter(Boolean).join(" "),
  ].filter((x) => String(x || "").trim().length > 0);

  return parts;
}

const recipient = (job.billing_recipient ?? "").trim();

let billingSourceLabel = "Not set";
let billing = {
  billing_name: null as string | null,
  billing_email: null as string | null,
  billing_phone: null as string | null,
  billing_address_line1: null as string | null,
  billing_address_line2: null as string | null,
  billing_city: null as string | null,
  billing_state: null as string | null,
  billing_zip: null as string | null,
};

if (recipient === "contractor") {
  billingSourceLabel = "Contractor";
  billing = {
    billing_name: contractorBilling?.billing_name ?? contractorBilling?.name ?? null,
    billing_email: contractorBilling?.billing_email ?? null,
    billing_phone: contractorBilling?.billing_phone ?? null,
    billing_address_line1: contractorBilling?.billing_address_line1 ?? null,
    billing_address_line2: contractorBilling?.billing_address_line2 ?? null,
    billing_city: contractorBilling?.billing_city ?? null,
    billing_state: contractorBilling?.billing_state ?? null,
    billing_zip: contractorBilling?.billing_zip ?? null,
  };
} else if (recipient === "customer") {
  billingSourceLabel = "Customer";
  billing = {
    billing_name: customerBilling?.billing_name ?? customerBilling?.full_name ?? null,
    billing_email: customerBilling?.billing_email ?? null,
    billing_phone: customerBilling?.billing_phone ?? null,
    billing_address_line1: customerBilling?.billing_address_line1 ?? null,
    billing_address_line2: customerBilling?.billing_address_line2 ?? null,
    billing_city: customerBilling?.billing_city ?? null,
    billing_state: customerBilling?.billing_state ?? null,
    billing_zip: customerBilling?.billing_zip ?? null,
  };
} else if (recipient === "other") {
  billingSourceLabel = "Other (job override)";
  billing = {
    billing_name: job.billing_name ?? null,
    billing_email: job.billing_email ?? null,
    billing_phone: job.billing_phone ?? null,
    billing_address_line1: job.billing_address_line1 ?? null,
    billing_address_line2: job.billing_address_line2 ?? null,
    billing_city: job.billing_city ?? null,
    billing_state: job.billing_state ?? null,
    billing_zip: job.billing_zip ?? null,
  };
}

const isFieldComplete = !!job.field_complete;

const isFailedUnresolved =
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));

const isAdminComplete =
  (job.job_type === "service" && job.invoice_complete) ||
  (job.job_type === "ecc" && job.invoice_complete && job.certs_complete);

const closeoutNeeds = getCloseoutNeeds(job);
const isCloseoutPending = isInCloseoutQueue(job);

const canShowCertsButton =
  job.job_type === "ecc" &&
  !job.certs_complete &&
  !isFailedUnresolved;

const canShowInvoiceButton =
  job.job_type === "ecc" &&
  !job.invoice_complete &&
  String(job.ops_status ?? "") !== "closed";

const showCloseoutRow =
  isInternalUser &&
  job.status === "completed" &&
  isFieldComplete &&
  !isAdminComplete &&
  (
    !isFailedUnresolved
      ? (canShowCertsButton || canShowInvoiceButton)
      : canShowInvoiceButton
  );

const canShowReleaseAndReevaluate = [
  "pending_info",
  "on_hold",
  "failed",
  "retest_needed",
  "paperwork_required",
  "invoice_required",
].includes(String(job.ops_status ?? "").toLowerCase());

const currentOpsStatus = String(job.ops_status ?? "").toLowerCase();
const pendingInfoReasonText = String((job as any).pending_info_reason ?? "").trim();
const onHoldReasonText = String((job as any).on_hold_reason ?? "").trim();
const explicitPendingInfoActive = currentOpsStatus === "pending_info";
const onHoldActive = currentOpsStatus === "on_hold";
const actionablePendingInfo = explicitPendingInfoActive;
const hasFollowUpReminder =
  Boolean((job as any).follow_up_date) ||
  Boolean(String((job as any).next_action_note ?? "").trim()) ||
  Boolean(String((job as any).action_required_by ?? "").trim());
const currentStatusReasonLabel = explicitPendingInfoActive
  ? "Pending Info blocker"
  : onHoldActive
  ? "On Hold reason"
  : null;
const currentStatusReasonText = explicitPendingInfoActive
  ? pendingInfoReasonText
  : onHoldActive
  ? onHoldReasonText
  : "";

const locationId = serviceLocation?.id ?? null;

const digitsOnly = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

const telLink =
  customerPhone !== "—" && digitsOnly(customerPhone)
    ? `tel:${digitsOnly(customerPhone)}`
    : "";

const serviceMapsLink =
  serviceAddressDisplay && serviceAddressDisplay !== "No address set"
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(serviceAddressDisplay)}`
    : "";

const permitNumber = String(job.permit_number ?? "").trim();
const permitJurisdiction = String((job as any).jurisdiction ?? "").trim();
const permitDateValue = String((job as any).permit_date ?? "").trim();
const permitDateLabel = permitDateValue ? displayDateLA(permitDateValue) : "";
const permitDetailCount = Number(Boolean(permitNumber)) + Number(Boolean(permitJurisdiction)) + Number(Boolean(permitDateValue));
const hasPermitDetails = permitDetailCount > 0;

const serviceCaseVisitCount = serviceChainJobs?.length ?? 0;
const equipmentItems = Array.isArray(job.job_equipment) ? job.job_equipment : [];
const equipmentCount = equipmentItems.length;
const outdoorEquipment = equipmentItems.find((eq: any) => {
  const role = String(eq?.equipment_role ?? "").toLowerCase();
  return role.includes("condenser") || role.includes("outdoor") || role.includes("package");
});
const indoorEquipment = equipmentItems.find((eq: any) => {
  const role = String(eq?.equipment_role ?? "").toLowerCase();
  return role.includes("air_handler") || role.includes("furnace") || role.includes("indoor") || role.includes("coil");
});
const equipmentSummaryLabel =
  equipmentCount > 0
    ? `${equipmentCount} item(s) linked to this job`
    : "No equipment on file yet.";

const timelineItems = timelineEvents ?? [];
const timelinePreviewItems = timelineItems.slice(0, 3);
const timelineOverflowItems = timelineItems.slice(3);

const attemptItems = customerAttempts ?? [];
const contactPreviewItems = attemptItems.slice(0, 3);
const contactOverflowItems = attemptItems.slice(3);
const followUpOwnerLabel = String((job as any).action_required_by ?? "").trim();
const followUpDateValue = String((job as any).follow_up_date ?? "").trim();
const followUpDateSummary = followUpDateValue ? displayDateLA(followUpDateValue) : "";
const nextActionPreview = truncateSummaryText(String((job as any).next_action_note ?? ""), 78);
const jobStatusSummaryText = explicitPendingInfoActive
  ? `Pending Info${pendingInfoReasonText ? ` • ${truncateSummaryText(pendingInfoReasonText, 72)}` : ""}`
  : onHoldActive
  ? `On Hold${onHoldReasonText ? ` • ${truncateSummaryText(onHoldReasonText, 72)}` : ""}`
  : `Current lifecycle: ${formatOpsStatusLabel(job.ops_status)}`;
const followUpSummaryText = hasFollowUpReminder
  ? [
      followUpOwnerLabel ? `For ${followUpOwnerLabel}` : null,
      followUpDateSummary ? `Due ${followUpDateSummary}` : null,
      nextActionPreview || null,
    ]
      .filter(Boolean)
      .join(" • ")
  : "No follow-up reminder set yet.";
const followUpHistorySummaryText = attemptItems.length
  ? `Last contact logged ${lastAttemptLabel}.`
  : "No contact attempts logged yet.";
const serviceChainSummaryText = serviceCaseId
  ? "Visit history across the linked service case."
  : "No linked service case yet.";
const eccSummaryText = job.ecc_test_runs?.length
  ? "Recorded test history with direct workspace access."
  : "No ECC runs recorded yet.";
const latestSharedNoteAt = sharedNotes[0]?.created_at ? formatDateLAFromIso(String(sharedNotes[0].created_at)) : "";
const latestInternalNoteAt = internalNotes[0]?.created_at ? formatDateLAFromIso(String(internalNotes[0].created_at)) : "";
const latestTimelineAt = timelineItems[0]?.created_at ? formatDateTimeLAFromIso(String(timelineItems[0].created_at)) : "";
const sharedNotesSummaryText = latestSharedNoteAt
  ? `Latest shared activity ${latestSharedNoteAt}.`
  : "No shared note activity yet.";
const internalNotesSummaryText = latestInternalNoteAt
  ? `Latest internal note ${latestInternalNoteAt}.`
  : "No internal note activity yet.";
const timelineSummaryText = latestTimelineAt
  ? `Latest activity ${latestTimelineAt}.`
  : "No activity recorded yet.";

const showRetestSection =
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));
const showCorrectionReviewResolution =
  isInternalUser &&
  job.job_type === "ecc" &&
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));
const failureResolutionSummaryText = showRetestSection && showCorrectionReviewResolution
  ? "Choose between retest creation and correction review resolution."
  : showRetestSection
  ? "Create a retest visit when a physical return is required."
  : "Resolve this failure through correction review only when a return visit is not needed.";
const failureResolutionPathCount = Number(showRetestSection) + Number(showCorrectionReviewResolution);

const renderAttemptItem = (a: any, key: string) => {
  const method = a?.meta?.method ? String(a.meta.method) : "";
  const result = a?.meta?.result ? String(a.meta.result) : "";
  const when = a?.created_at ? formatDateTimeLAFromIso(String(a.created_at)) : "—";

  const methodIcon = method === "text" ? "💬" : method === "call" ? "📞" : "📝";
  const resultLabel =
    result === "no_answer" ? "No Answer" :
    result === "sent" ? "Sent" :
    result === "spoke" ? "Spoke" :
    (result || "—");

  return (
    <div key={key} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">{when}</div>
        <div className="text-xs text-slate-400">
          {a?.meta?.attempt_number ? `#${String(a.meta.attempt_number)}` : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={infoChipClass}>
          <span>{methodIcon}</span>
          <span className="capitalize">{method || "—"}</span>
        </span>

        <span className={infoChipClass}>
          {resultLabel}
        </span>
      </div>
    </div>
  );
};

const renderTimelineItem = (e: any, key: string) => {
  const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
  const type = String(e?.event_type ?? "");
  const meta = e?.meta ?? {};
  const actorUserId = String(meta?.actor_user_id ?? e?.user_id ?? "").trim();
  const actorDisplayName = actorUserId ? actorDisplayMap[actorUserId] ?? "User" : "";
  const detailText = formatTimelineDetail(type, meta, e?.message);
  const title = ["public_note", "contractor_note", "contractor_correction_submission"].includes(type)
    ? formatSharedHistoryHeading(type, meta)
    : formatTimelineEvent(type, meta, e?.message);

  const icon =
    type === "job_created" ? "🆕" :
    type === "intake_submitted" ? "📥" :
    type === "retest_created" ? "🔁" :
    type === "customer_attempt" ? "📞" :
    type === "status_changed" ? "🔄" :
    type === "on_my_way" ? "🚗" :
    type === "on_the_way_reverted" ? "↩️" :
    type === "job_started" ? "🛠️" :
    type === "job_completed" ? "🏁" :
    type === "job_failed" ? "❌" :
    type === "job_passed" ? "✅" :
    type === "scheduled" ? "📅" :
    type === "unscheduled" ? "🗓️" :
    type === "retest_scheduled" ? "📅" :
    type === "retest_started" ? "🛠️" :
    type === "retest_passed" ? "✅" :
    type === "retest_failed" ? "❌" :
    type === "schedule_updated" ? "🕒" :
    type === "contractor_note" ? "💬" :
    type === "public_note" ? "💬" :
    type === "internal_note" ? "📝" :
    type === "failure_resolved_by_correction_review" ? "✅" :
    type === "contractor_correction_submission" ? "📎" :
    "📝";

  return (
    <div key={key} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">{when}</div>
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-500">{icon}</div>
      </div>

      <div className="mt-2 font-medium text-slate-950">
        {title}
      </div>

      {detailText ? (
        <div className="mt-1 text-sm leading-6 text-slate-700">
          {detailText}
        </div>
      ) : null}

      {actorDisplayName ? (
        <div className="mt-1 text-xs text-slate-500">By {actorDisplayName}</div>
      ) : null}

      {type === "retest_created" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View linked retest
          </Link>
        </div>
      ) : null}

      {type === "retest_created" && meta?.parent_job_id ? (
        <div className="mt-1 text-sm">
          Original:{" "}
          <Link className="underline" href={`/jobs/${String(meta.parent_job_id)}?tab=ops`}>
            View original job
          </Link>
        </div>
      ) : null}

      {type === "retest_passed" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Resolved by retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_scheduled" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest scheduled:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_started" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Active retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_failed" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest failed again:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}
    </div>
  );
};

  return (
    <div className="mx-auto w-full min-w-0 max-w-[88rem] space-y-5 overflow-x-hidden p-4 sm:p-6">

<section className={`${workspaceSectionClass} mb-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] shadow-[0_20px_44px_-34px_rgba(15,23,42,0.26)]`}>
  <div className="mb-4 border-b border-slate-200/80 pb-4">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      <span>Job Workspace</span>
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/88 px-2.5 py-1 text-[10px] tracking-[0.12em] text-slate-500 shadow-[0_8px_18px_-22px_rgba(15,23,42,0.2)]">
        <span className="text-slate-400">ID</span>
        <span className="font-mono text-[11px] text-slate-700">{job.id}</span>
      </span>
    </div>

    <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-[clamp(1.35rem,2vw,1.85rem)] font-semibold tracking-[-0.02em] text-slate-950">
          {normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">
          Single-job control center for scheduling, field progress, closeout, and record history.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5 xl:w-auto xl:min-w-[24rem] xl:items-end">
        {!isFieldComplete ? (
          <div className="flex w-full flex-col items-start gap-2 xl:items-end">
            <div className="flex w-full flex-wrap justify-start gap-2 xl:justify-end">
              <JobFieldActionButton
                jobId={job.id}
                currentStatus={job.status}
                tab={tab}
                hasFullSchedule={hasFullSchedule}
              />

              {onTheWayUndoEligibility.eligible ? (
                <form action={revertOnTheWayFromForm} className="w-full sm:w-auto">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <SubmitButton
                    loadingText="Undoing..."
                    className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 active:translate-y-[0.5px] sm:w-auto"
                  >
                    Undo On the Way
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            {onTheWayUndoEligibility.eligible ? (
              <div className="text-xs text-slate-500 xl:text-right">
                Available only until any later job activity occurs.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full justify-start xl:justify-end">
            <span className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(37,99,235,0.55)]">
              Field Complete
            </span>
          </div>
        )}

        <div className="flex w-full flex-wrap gap-2 xl:justify-end">
          <Link
            href="/ops"
            className={compactUtilityButtonClass}
          >
            Back to Ops
          </Link>

          {job.customer_id ? (
            <Link
              href={`/customers/${job.customer_id}`}
              className={compactUtilityButtonClass}
            >
              Open Customer
            </Link>
          ) : null}

          {job.job_type === "ecc" ? (
            <Link
              href={`/jobs/${job.id}/tests`}
              className={compactWorkspaceActionButtonClass}
            >
              Open Tests Workspace
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  </div>

  <div className={`${workspaceInsetClass} mb-4 border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]`}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-center">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Appointment</div>
        <div className="mt-1 text-[1.32rem] font-semibold tracking-[-0.02em] text-slate-950">{appointmentDateLabel}</div>
        <div className="mt-1 text-sm leading-6 text-slate-600">{appointmentTimeLabel}</div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/76 px-3.5 py-3 shadow-[0_12px_28px_-30px_rgba(15,23,42,0.3)] backdrop-blur-[2px]">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Schedule</div>
            <div className={`mt-1 text-[15px] font-semibold tracking-[-0.01em] ${job.scheduled_date ? "text-emerald-800" : "text-slate-700"}`}>
              {job.scheduled_date ? "Scheduled" : "Unscheduled"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Time Window</div>
            <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-800">
              {job.scheduled_date ? (hasFullSchedule ? "Confirmed" : "Pending") : "Not set"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Field</div>
            <div className={`mt-1 text-[15px] font-semibold tracking-[-0.01em] ${isFieldComplete ? "text-emerald-800" : "text-blue-700"}`}>
              {formatStatus(job.status)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ops</div>
            <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-800">{formatOpsStatusLabel(job.ops_status)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className={`mb-4 grid items-stretch gap-4${job.job_type === "ecc" ? " xl:grid-cols-[minmax(300px,0.94fr)_minmax(420px,1.22fr)_minmax(250px,0.74fr)]" : " xl:grid-cols-[minmax(320px,0.96fr)_minmax(440px,1.28fr)]"}`}>
    {/* Left: customer / contact info */}
    <div className={`${workspaceSubtleCardClass} border-slate-200/70 bg-white/92 p-4 sm:p-5`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {(job.job_type ? String(job.job_type).toUpperCase() : "SERVICE")}
        {serviceCity ? ` • ${serviceCity}` : ""}
      </div>

      {job.customer_id ? (
        <Link
          href={`/customers/${job.customer_id}`}
          className="mt-2 block text-[1.55rem] font-semibold tracking-[-0.02em] text-slate-950 hover:underline"
        >
          {customerName}
        </Link>
      ) : (
        <h1 className="mt-2 text-[1.55rem] font-semibold tracking-[-0.02em] text-slate-950">{customerName}</h1>
      )}

      <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-200/70 pt-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Contractor</div>
          <div className="mt-1 font-semibold text-slate-800">{contractorName}</div>
        </div>
        {customerPhone !== "—" ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Phone</div>
            <div className="mt-1 font-semibold text-slate-800">{customerPhone}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 sm:gap-1.5 lg:gap-2">
        {telLink ? (
          <a
            href={telLink}
            className={compactSecondaryButtonClass}
          >
            Call
          </a>
        ) : null}

        {customerPhone !== "—" ? (
          <a
            href={`sms:${digitsOnly(customerPhone)}`}
            className={compactSecondaryButtonClass}
          >
            Text
          </a>
        ) : null}

        {serviceMapsLink ? (
          <a
            href={serviceMapsLink}
            target="_blank"
            rel="noreferrer"
            className={compactSecondaryButtonClass}
          >
            Open Map
          </a>
        ) : null}
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contact Logging</div>
        <div className="flex flex-wrap gap-2">
          <form action={logCustomerContactAttemptFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="method" value="call" />
            <input type="hidden" name="result" value="no_answer" />
            <SubmitButton loadingText="..." className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              No Answer
            </SubmitButton>
          </form>

          <form action={logCustomerContactAttemptFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="method" value="text" />
            <input type="hidden" name="result" value="sent" />
            <SubmitButton loadingText="..." className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Sent Text
            </SubmitButton>
          </form>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          {attemptCount} attempt{attemptCount === 1 ? "" : "s"} • last: {lastAttemptLabel}
        </div>
      </div>
    </div>

    {/* Center: destination panel */}
    <div className="relative flex min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)]">
      <div className="absolute left-3 top-3 z-10">
        <div className="rounded-full border border-white/70 bg-white/76 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.3)] backdrop-blur-sm">
          Service Location
        </div>
      </div>
      <div className="w-full flex-1 overflow-hidden bg-slate-100">
        <JobLocationPreview
          addressLine1={serviceAddressLine1}
          addressLine2={serviceAddressLine2}
          city={serviceCity}
          state={serviceState}
          zip={serviceZip}
          showAddressFooter
          className="flex h-full flex-col [&>div:last-child]:!mt-auto [&>div:last-child]:pt-3"
        />
      </div>
    </div>

    {/* Right: ECC permit reference panel (ECC only) */}
    {job.job_type === "ecc" ? (
      <div className={`${workspaceSubtleCardClass} border-slate-200/70 p-4 sm:p-5 ${hasPermitDetails ? "bg-white/92" : "bg-slate-50/88"}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Permit</div>
            <div className="mt-1 text-sm text-slate-600">
              {hasPermitDetails
                ? `${permitDetailCount} of 3 reference field${permitDetailCount === 1 ? "" : "s"} available`
                : "Permit information pending"}
            </div>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            ECC
          </span>
        </div>

        {hasPermitDetails ? (
          <div className="space-y-2.5">
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Permit #</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitNumber || "Not added"}</div>
            </div>
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Jurisdiction</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitJurisdiction || "Not added"}</div>
            </div>
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Permit Date</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitDateLabel || "Not added"}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/90 px-4 py-4 text-sm text-slate-600">
            No permit details recorded yet.
          </div>
        )}
      </div>
    ) : null}
  </div>

  <div className="mt-3.5 grid gap-3 xl:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.3fr)] xl:items-start">
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/78 px-4 py-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.28)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Immediate Context</div>
      <div className="mt-2 text-sm leading-6 text-slate-700">
        Field status <span className="font-semibold text-slate-900">{formatStatus(job.status)}</span>. Ops status <span className="font-semibold text-slate-900">{formatOpsStatusLabel(job.ops_status)}</span>.
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        {actionablePendingInfo ? <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">Pending Info</span> : null}
        {onHoldActive ? <span className="inline-flex rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-slate-800">On Hold</span> : null}
        {hasFollowUpReminder ? <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">Follow Up Set</span> : null}
      </div>

      {currentStatusReasonLabel ? (
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/92 px-3.5 py-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{currentStatusReasonLabel}:</span>{" "}
          {currentStatusReasonText || "Reason not set."}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-500">
          {hasFollowUpReminder ? "Follow-up planning is already on file for this job." : "No immediate blocker is active on this job right now."}
        </div>
      )}
    </div>

    <div className="rounded-xl border border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned Team</div>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{assignedTeam.length > 0 ? `${assignedTeam.length} assigned` : "Awaiting assignment"}</div>
      </div>
      {assignedTeam.length > 0 ? (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {assignedTeam.map((assignee) => (
            <div
              key={`${assignee.job_id}-${assignee.user_id}`}
              className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-sm text-slate-800 shadow-[0_8px_20px_-24px_rgba(15,23,42,0.22)]"
            >
              <span className="max-w-full break-words">{assignee.display_name}</span>
              {assignee.is_primary ? (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Primary
                </span>
              ) : null}

              {isInternalUser && !assignee.is_primary ? (
                <form action={setPrimaryJobAssigneeFromForm} className="shrink-0">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="user_id" value={assignee.user_id} />
                  <input type="hidden" name="tab" value={tab} />
                  <button
                    type="submit"
                    className={workspaceUtilityControlClass}
                  >
                    Make Primary
                  </button>
                </form>
              ) : null}

              {isInternalUser ? (
                <form action={removeJobAssigneeFromForm} className="shrink-0">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="user_id" value={assignee.user_id} />
                  <input type="hidden" name="tab" value={tab} />
                  <button
                    type="submit"
                    className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className={`mt-3 ${workspaceEmptyStateClass}`}>
          No team assigned yet.
        </div>
      )}

      {isInternalUser ? (
        <form action={assignJobAssigneeFromForm} className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value={tab} />
          <select
            name="user_id"
            className={`${workspaceInputClass} w-full min-w-0 sm:w-auto sm:min-w-[14rem]`}
            required
            defaultValue=""
            disabled={assignmentCandidates.length === 0}
          >
            <option value="" disabled>
              {assignmentCandidates.length === 0 ? "No available assignees" : "Select assignee"}
            </option>
            {assignmentCandidates.map((candidate) => (
              <option key={candidate.user_id} value={candidate.user_id}>
                {candidate.display_name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input type="checkbox" name="make_primary" value="1" className="h-3.5 w-3.5" />
            Set as primary
          </label>

          <button
            type="submit"
            disabled={assignmentCandidates.length === 0}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Assign
          </button>
        </form>
      ) : null}
    </div>
  </div>
</section>
      {/* Header */}

      {/* Always-visible Top Actions */}

      {/* Closeout Actions (Internal Only) */}
    {showCloseoutRow && (
      <div className="mt-3 min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.35)]">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm font-medium text-gray-700">Closeout</div>

      <div className="flex flex-wrap items-center gap-2">
        {/* ECC only: Certs */}
          {canShowCertsButton && (
            <form action={markCertsCompleteFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton
                loadingText="Saving..."
                className={darkButtonClass}
              >
                ✓ Certs Complete
              </SubmitButton>
            </form>
          )}

        {canShowInvoiceButton && (
          <form action={markInvoiceCompleteFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton
              loadingText="Saving..."
              className={darkButtonClass}
            >
              ✓ Invoice Complete
            </SubmitButton>
          </form>
        )}

        {/* Done state */}
        {((job.job_type === "service" && job.invoice_complete) ||
          (job.job_type === "ecc" && job.invoice_complete && job.certs_complete)) && (
          <span className="text-sm font-semibold text-green-700">Admin Complete</span>
        )}
      </div>
    </div>
  </div>
)}

      {/* ✅ Friendly guard-rail message (shows after redirect) */}
      {showEccNotice && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-semibold">One step missing</div>
          <div className="mt-1">
            This is an <span className="font-semibold">ECC</span> job. Go to the{" "}
            <span className="font-semibold">Tests</span> tab and complete at least{" "}
            <span className="font-semibold">one ECC test run</span> before marking{" "}
            <span className="font-semibold">Field Work Complete</span>.
          </div>
        </div>
      )}

      {banner === "job_created" && (
        <FlashBanner
          type="success"
          message="Job created."
        />
      )}

      {banner === "job_already_created" && (
        <FlashBanner
          type="warning"
          message="Job already created."
        />
      )}

      {banner === "schedule_saved" && (
        <FlashBanner
          type="success"
          message="Schedule updated."
        />
      )}

      {banner === "schedule_already_saved" && (
        <FlashBanner
          type="warning"
          message="Schedule was already up to date."
        />
      )}

      {banner === "status_updated" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "on_the_way_reverted" && (
        <FlashBanner
          type="success"
          message="On the Way was reverted."
        />
      )}

      {banner === "on_the_way_revert_unavailable" && (
        <FlashBanner
          type="warning"
          message="Undo On the Way is no longer available for this job."
        />
      )}

      {banner === "status_already_updated" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "service_closeout_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "service_closeout_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "service_closeout_locked" && (
        <FlashBanner
          type="warning"
          message="Could not save changes."
        />
      )}

      {banner === "note_added" && (
        <FlashBanner
          type="success"
          message="Note added."
        />
      )}

      {banner === "follow_up_note_added" && (
        <FlashBanner
          type="success"
          message="Follow-up note added."
        />
      )}

      {banner === "note_already_added" && (
        <FlashBanner
          type="warning"
          message="Note already added."
        />
      )}

      {banner === "follow_up_note_already_added" && (
        <FlashBanner
          type="warning"
          message="Note already added."
        />
      )}

      {banner === "note_add_failed" && (
        <FlashBanner
          type="error"
          message="Could not add note."
        />
      )}

      {banner === "ops_details_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "ops_details_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "ops_status_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "ops_status_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "pending_info_reason_required" && (
        <FlashBanner
          type="warning"
          message="Pending Info reason is required."
        />
      )}

      {banner === "on_hold_reason_required" && (
        <FlashBanner
          type="warning"
          message="On Hold reason is required."
        />
      )}

      {banner === "contact_attempt_logged" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "customer_reused" && (
        <FlashBanner
          type="warning"
          message="Existing customer matched by phone — reused (no duplicate created)."
        />
      )}

      {banner === "customer_created" && (
        <FlashBanner
          type="success"
          message="New customer created and linked to this job."
        />
      )}

      {banner === "assignment_added" && (
        <FlashBanner
          type="success"
          message="Team member assigned to this job."
        />
      )}

      {banner === "assignment_added_primary" && (
        <FlashBanner
          type="success"
          message="Team member assigned and set as primary."
        />
      )}

      {banner === "assignment_primary_set" && (
        <FlashBanner
          type="success"
          message="Primary assignee updated."
        />
      )}

      {banner === "assignment_removed" && (
        <FlashBanner
          type="success"
          message="Assignee removed from this job."
        />
      )}

      {banner === "contractor_updated" && (
        <FlashBanner
          type="success"
          message="Contractor assignment updated."
        />
      )}

      {banner === "contractor_unchanged" && (
        <FlashBanner
          type="warning"
          message="Contractor assignment was unchanged."
        />
      )}

      {banner === "contractor_update_failed" && (
        <FlashBanner
          type="warning"
          message="Unable to update contractor assignment. Please try again or contact support if it continues."
        />
      )}

      {banner === "job_cancelled" && (
        <FlashBanner
          type="success"
          message="Job cancelled successfully. This job is no longer in active queues."
        />
      )}

      {sp?.schedule_required === "1" && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This job is missing a full schedule. If you continue, the system will auto-fill today with a
          2-hour window starting now.
        </div>
      )}  

      {job.status === "completed" && job.ops_status !== "closed" ? (() => {
      const ops = job.ops_status;

    const meta =
      ((job.job_type === "service" && job.invoice_complete) ||
        (job.job_type === "ecc" && job.invoice_complete && job.certs_complete))
        ? {
            title: "Admin Complete",
            body: "Field work, paperwork, and billing are complete for this job.",
          }
        : ops === "failed"
          ? {
              title: "Visit completed — failure still unresolved",
              body: "The field visit is complete, but this failed result still needs either correction review approval or a linked retest before certs can be completed.",
            }
          : ops === "retest_needed"
            ? {
                title: "Visit completed — retest required",
                body: "The original failed visit is complete. A physical retest is still required before certification can move forward.",
              }
          : isCloseoutPending
            ? {
                title: "Job completed — closeout still in progress",
                body: closeoutNeeds.needsInvoice && closeoutNeeds.needsCerts
                  ? "Field work is complete. Invoice and certs are still pending, so the job remains in closeout until both are finished."
                  : closeoutNeeds.needsCerts
                    ? "Field work is complete. Certs are still pending, so the job remains in closeout until closeout paperwork is finished."
                    : "Field work is complete. Invoice is still pending, so the job remains in closeout until billing is finished.",
              }
          : ops === "paperwork_required"
            ? {
                title: "Job completed — paperwork still required",
                body: "Upload/attach required documents (invoice/cert) to fully close out the job.",
              }
          : actionablePendingInfo
            ? {
                title: "Job completed — pending information",
                body: pendingInfoReasonText
                  ? `Blocker: ${pendingInfoReasonText}`
                  : "Some required info is still missing before closeout can finish.",
              }
            : ops === "on_hold"
              ? {
                  title: "Job completed — on hold",
                  body: onHoldReasonText
                    ? `Hold reason: ${onHoldReasonText}`
                    : "This job is on hold and is not in the closeout work queue until the hold is cleared.",
                }
          : ops === "need_to_schedule"
            ? {
                title: "Job completed — but still in Need to Schedule",
                body: "This job is marked completed, but ops status indicates scheduling is still needed. Review status flow.",
              }
          : job.job_type === "ecc"
            ? {
                title: "Job completed — but compliance is not fully resolved",
                body: "Complete remaining ECC items (tests, paperwork, invoice/cert) to fully close out the job.",
              }
            : null;

      if (!meta) return null;
                    
      return (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-amber-900">
          <div className="text-sm font-semibold">{meta.title}</div>
          <div className="mt-1 text-sm">
            Current Ops Status: <span className="font-medium">{formatOpsStatusLabel(ops)}</span>. {meta.body}
          </div>
        </div>
      );
    })() : null}

      {/* Single-workspace context (tab query preserved for compatibility) */}
     
          <details className={`${workspaceDetailsClass} mb-6`}>
            <summary className="cursor-pointer list-none">
              <CollapsibleHeader
                title="Edit Job"
                subtitle="All editable controls for this job."
              />
            </summary>

            <div className={workspaceDetailsDividerClass}>
              <div className={`${workspaceInsetClass} p-4`}>
                <div className="mb-3 text-sm font-semibold text-slate-900">Scheduling</div>

                <form action={updateJobScheduleFromForm} className="space-y-4">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="permit_number" value={job.permit_number ?? ""} />
                  <input type="hidden" name="jurisdiction" value={(job as any).jurisdiction ?? ""} />
                  <input type="hidden" name="permit_date" value={(job as any).permit_date ?? ""} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        name="scheduled_date"
                        defaultValue={displayDateLA(job.scheduled_date)}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Window Start
                      </label>
                      <input
                        type="time"
                        name="window_start"
                        defaultValue={timeToTimeInput(job.window_start)}
                        className={workspaceInputClass}
                      />
                      <div className="text-[11px] text-gray-500">08:00</div>
                    </div>

                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Window End
                      </label>
                      <input
                        type="time"
                        name="window_end"
                        defaultValue={timeToTimeInput(job.window_end)}
                        className={workspaceInputClass}
                      />
                      <div className="text-[11px] text-gray-500">10:00</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <SubmitButton
                      loadingText="Saving..."
                      className={primaryButtonClass}
                    >
                      Save Scheduling
                    </SubmitButton>

                    {(job.scheduled_date || job.window_start || job.window_end) ? (
                      <UnscheduleButton />
                    ) : null}

                    <Link
                      href="/ops"
                      className={secondaryButtonClass}
                    >
                      Back to Ops
                    </Link>
                  </div>
                </form>
              </div>

              {job.job_type === "ecc" ? (
                <details
                  open
                  className="group mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90"
                >
                    <summary className="cursor-pointer list-none">
                      <CollapsibleHeader
                        title="Permit & Compliance"
                        subtitle="ECC permit fields and jurisdiction details."
                      />
                    </summary>
                    <form action={updateJobScheduleFromForm} className="mt-3 space-y-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="scheduled_date" value={displayDateLA(job.scheduled_date) ?? ""} />
                      <input type="hidden" name="window_start" value={timeToTimeInput(job.window_start) ?? ""} />
                      <input type="hidden" name="window_end" value={timeToTimeInput(job.window_end) ?? ""} />

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Permit #</label>
                          <input
                            name="permit_number"
                            defaultValue={job.permit_number ?? ""}
                            placeholder="Optional"
                            className={workspaceInputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Jurisdiction</label>
                          <input
                            name="jurisdiction"
                            defaultValue={(job as any).jurisdiction ?? ""}
                            placeholder="City or county permit office"
                            className={workspaceInputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Permit Date</label>
                          <input
                            type="date"
                            name="permit_date"
                            defaultValue={(job as any).permit_date ?? ""}
                            className={workspaceInputClass}
                          />
                        </div>
                      </div>

                      <SubmitButton
                        loadingText="Saving..."
                        className={primaryButtonClass}
                      >
                        Save Permit Info
                      </SubmitButton>
                    </form>
                </details>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                  <summary className="cursor-pointer list-none">
                    <CollapsibleHeader
                      title="Change Job Type"
                      subtitle="Switch between service and ECC workflows."
                    />
                  </summary>

                  <form
                    action={updateJobTypeFromForm}
                    className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <input type="hidden" name="job_id" value={job.id} />
                    <p className="text-xs text-slate-600">
                      Current type: {job.job_type ?? "service"}
                    </p>

                    <select
                      name="job_type"
                      defaultValue={job.job_type ?? "service"}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="service">Service</option>
                      <option value="ecc">ECC</option>
                    </select>

                    <button
                      type="submit"
                      className={primaryButtonClass}
                    >
                      Update
                    </button>
                  </form>
                </details>

                <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                  <summary className="cursor-pointer list-none">
                    <CollapsibleHeader
                      title="Change Contractor"
                      subtitle="Reassign job ownership to a different contractor."
                    />
                  </summary>

                  <div className="mt-3">
                    <form action={updateJobContractorFromForm} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value="info" />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=info`} />

                      <div className="flex-1">
                        <label className={workspaceFieldLabelClass}>
                          Assigned contractor
                        </label>
                        <select
                          name="contractor_id"
                          defaultValue={job.contractor_id ?? ""}
                          className={workspaceInputClass}
                        >
                          <option value="">— No contractor —</option>
                          {(contractors ?? []).map((contractor: any) => (
                            <option key={contractor.id} value={contractor.id}>
                              {contractor.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <SubmitButton
                        loadingText="Saving..."
                        className={secondaryButtonClass}
                      >
                        Save contractor
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </div>

              <details className="group mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                <summary className="cursor-pointer list-none">
                  <CollapsibleHeader
                    title="Admin Archive Controls"
                    subtitle="Archive or cancel this job with admin-only actions."
                  />
                </summary>

                <div className="mt-3 space-y-3">
                  <div className="text-sm leading-6 text-slate-600">
                    Archive hides this job across Ops, portal, and searches. This can be undone later (by clearing deleted_at).
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={archiveJobFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <SubmitButton
                        loadingText="Archiving..."
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                      >
                        Archive Job
                      </SubmitButton>
                    </form>

                    {!['completed', 'failed', 'cancelled'].includes(job.status) && (
                      <CancelJobButton jobId={job.id} />
                    )}
                  </div>
                </div>
              </details>
            </div>
          </details>


      {/* Info workspace */}

    
{["data_entry", "invoice_required"].includes(String(job.ops_status ?? "").toLowerCase()) ? (
  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-[0_12px_24px_-22px_rgba(180,83,9,0.35)]">
    <div className="mb-2 font-semibold">
      Data Entry Required
    </div>

    <form action={completeDataEntryFromForm} className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="job_id" value={job.id} />

      
      <div className="flex flex-col">
        <label className="mb-1 text-sm font-medium text-amber-900">Invoice # (optional)</label>
        <input
          name="invoice_number"
          defaultValue={String(job.invoice_number ?? "")}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </div>
    
      <SubmitButton
        loadingText="Saving..."
        className={darkButtonClass}
      >
        Mark Data Entry Complete
      </SubmitButton>
    </form>
  </div>
) : null}


  <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.92fr)] xl:items-start">
  <div className="order-2 flex flex-col gap-5 xl:order-2">
    {/* Equipment */}
  <details open={equipmentCount === 0} className={`${workspaceDetailsClass} xl:order-2`}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Equipment"
          subtitle={equipmentSummaryLabel}
          meta={`${equipmentCount} item${equipmentCount === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={workspaceDetailsDividerClass}>

      <div className={workspaceInsetClass}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Status
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-950">
          {equipmentSummaryLabel}
        </div>
      </div>

      {equipmentCount > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Condenser</div>
            <div className="mt-1 font-medium text-slate-900">
              {outdoorEquipment
                ? `${outdoorEquipment.manufacturer ?? "—"} ${outdoorEquipment.model ?? ""}`.trim()
                : "—"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Indoor Equipment</div>
            <div className="mt-1 font-medium text-slate-900">
              {indoorEquipment
                ? `${indoorEquipment.manufacturer ?? "—"} ${indoorEquipment.model ?? ""}`.trim()
                : "—"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${job.id}/info?f=equipment`}
          className={darkButtonClass}
        >
          {equipmentCount > 0 ? "View / Edit Equipment" : "Capture Equipment"}
        </Link>
      </div>
      </div>
    </details>

    {/* Attachments - moved up from bottom */}
    <details className={workspaceDetailsClass}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Attachments"
          subtitle={attachmentItems.length ? "Uploaded files and shareable job records." : "No job files uploaded yet."}
          meta={`${attachmentItems.length} item${attachmentItems.length === 1 ? "" : "s"}`}
        />
      </summary>
      <div className={`${workspaceDetailsDividerClass} px-0 pb-0`}>
        <div className="mb-3 flex items-center justify-end">
          <Link
            href={`/jobs/${job.id}/attachments`}
            className={secondaryButtonClass}
          >
            View All Attachments
          </Link>
        </div>
        <JobAttachmentsInternal
          jobId={job.id}
          initialItems={attachmentItems}
        />
      </div>
    </details>

    <details className={workspaceDetailsClass}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Follow-Up History"
          subtitle={followUpHistorySummaryText}
          meta={`${attemptItems.length} attempt${attemptItems.length === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={`${workspaceDetailsDividerClass} rounded-xl border border-slate-200/80 bg-white/96 p-4`}>
        {!attemptItems.length ? (
          <div className={workspaceEmptyStateClass}>
            No contact attempts logged yet.
          </div>
        ) : (
          <div className="space-y-2">
            {contactPreviewItems.map((a: any, idx: number) => renderAttemptItem(a, `attempt-preview-${idx}`))}

            {contactOverflowItems.length > 0 ? (
              <details className="pt-1">
                <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
                  Show all attempts ({attemptItems.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {contactOverflowItems.map((a: any, idx: number) =>
                    renderAttemptItem(a, `attempt-overflow-${idx}`)
                  )}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </details>



  <details id="service-chain" className={`${workspaceDetailsClass} xl:order-1`}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Service Chain"
          subtitle={serviceChainSummaryText}
          meta={`${serviceCaseVisitCount} visit${serviceCaseVisitCount === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={workspaceDetailsDividerClass}>
        {serviceCaseId ? (
          <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Case: {serviceCaseId.slice(0, 8)}…
          </div>
        ) : null}

        {!serviceCaseId ? (
          <div className={workspaceEmptyStateClass}>
            This job is not attached to a service case yet.
          </div>
        ) : !serviceChainJobs || serviceChainJobs.length === 0 ? (
          <div className={workspaceEmptyStateClass}>
            No visits found in this service case.
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
            {serviceChainJobs.map((visit: any, idx: number) => {
              const visitId = String(visit.id ?? "").trim();
              const isCurrent = visit.id === jobId;
              const visitLabel = serviceChainVisitLabel(visit, idx);
              const failureReason = serviceChainFailureReasonByJob.get(visitId) ?? "";
              const win =
                visit.scheduled_date && visit.window_start && visit.window_end
                  ? `${formatTimeDisplay(visit.window_start)}–${formatTimeDisplay(visit.window_end)}`
                  : null;

              return (
                <div
                  key={visit.id}
                  className={[
                    "rounded-xl border p-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]",
                    isCurrent ? "border-slate-900/90 bg-slate-50" : "border-slate-200/80 bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-950">
                          {visitLabel}
                          {isCurrent && (
                            <span className="text-blue-600"> • Active</span>
                          )}
                        </div>
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                            serviceChainBadgeClass(visit.ops_status, isCurrent),
                          ].join(" ")}
                        >
                          {formatOpsStatusLabel(visit.ops_status)}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-slate-800">
                        {normalizeRetestLinkedJobTitle(visit.title) || "Untitled Job"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Created:{" "}
                        {visit.created_at ? formatDateLAFromIso(String(visit.created_at)) : "—"}
                        {visit.scheduled_date ? ` • Scheduled: ${visit.scheduled_date}` : ""}
                        {win ? ` • ${win}` : ""}
                      </div>
                      {isFailedFamilyOpsStatus(visit.ops_status) && failureReason ? (
                        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
                          <span className="font-semibold uppercase tracking-[0.08em] text-rose-700">Reason:</span>{" "}
                          {failureReason}
                        </div>
                      ) : null}
                    </div>

                    {!isCurrent ? (
                      <Link
                        href={`/jobs/${visit.id}?tab=ops`}
                        className="text-sm font-medium text-blue-700 underline decoration-blue-200 underline-offset-4"
                      >
                        View Job
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>

      {job.job_type === "ecc" ? (
      <details className={`${workspaceDetailsClass} xl:order-3`}>
        <summary className="cursor-pointer list-none">
          <CollapsibleHeader
            title="ECC Summary"
            subtitle={eccSummaryText}
            meta={`${job.ecc_test_runs?.length ?? 0} run${(job.ecc_test_runs?.length ?? 0) === 1 ? "" : "s"}`}
          />
        </summary>

        <div className={workspaceDetailsDividerClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className={`${job.ecc_test_runs?.length ? "rounded-xl border border-slate-200/80 bg-white/96" : workspaceEmptyStateClass} px-4 py-4 text-sm text-slate-600 sm:flex-1`}>
              {job.ecc_test_runs?.length ? (
                <span>{job.ecc_test_runs.length} test run(s) recorded.</span>
              ) : (
                <span>No tests recorded yet.</span>
              )}
            </div>

            <Link
              href={`/jobs/${job.id}/tests`}
              className={darkButtonClass}
            >
              Open Tests Workspace
            </Link>
          </div>
        </div>
      </details>
      ) : null}
    </div>

    <div className="order-1 space-y-6 xl:order-1">
      {/* Unified operations workspace */}
<div className="space-y-5">
          {/* Job Status (ops_status) */}
<details className={workspaceDetailsClass}>
  <summary className="cursor-pointer list-none">
    <CollapsibleHeader
      title="Job Status"
      subtitle={jobStatusSummaryText}
    />
  </summary>

  <div className={workspaceDetailsDividerClass}>

  <form action={updateJobOpsFromForm} className="flex flex-col gap-3 sm:gap-2 sm:flex-row sm:items-end sm:flex-wrap">
    <input type="hidden" name="job_id" value={job.id} />

    <div className="flex-1 min-w-xs">
      <label className={workspaceFieldLabelClass}>Ops Status</label>

      {!["need_to_schedule", "scheduled", "pending_info", "on_hold"].includes(
        String(job.ops_status ?? "")
      ) ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-3 text-sm font-medium text-slate-900">
          Current lifecycle state:{" "}
          <span>
            {formatOpsStatusLabel(job.ops_status)}
          </span>
        </div>
      ) : null}

      <select
        name="ops_status"
        defaultValue={explicitPendingInfoActive ? "pending_info" : "on_hold"}
        className={workspaceInputClass}
      >
        <option value="pending_info">Pending Info</option>
        <option value="on_hold">On Hold</option>
      </select>

      <p className="mt-2 text-xs leading-5 text-slate-600">
        Choose the status-change type here. Use the reason field below for either a Pending Info blocker or an On Hold pause reason. Follow Up stays separate for reminders and next actions.
      </p>

      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">Status Reason</label>
        <textarea
          name="status_reason"
          defaultValue={explicitPendingInfoActive ? pendingInfoReasonText : onHoldReasonText}
          className="min-h-[7rem] w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          rows={3}
          placeholder="If Pending Info is selected, describe the blocker. If On Hold is selected, describe why the job is paused."
        />
        <p className="mt-2 text-xs text-amber-900/80">
          Required for both Pending Info and On Hold. It will be stored against the selected status only.
        </p>
      </div>
    </div>

    <SubmitButton loadingText="Saving..." className={`${primaryButtonClass} sm:shrink-0`}>
      Save
    </SubmitButton>
  </form>

  {(String(job.ops_status ?? "").toLowerCase() === "on_hold" || explicitPendingInfoActive) ? (
    <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700">
      <div className="font-semibold text-slate-900">Current Status Detail</div>
      <div className="mt-1">
        {explicitPendingInfoActive
          ? (pendingInfoReasonText
              ? `Pending Info blocker: ${pendingInfoReasonText}`
              : "Pending Info is active. Add the missing blocker detail if needed.")
          : (onHoldReasonText
              ? `On Hold reason: ${onHoldReasonText}`
              : "On Hold is active. Add the pause reason if needed.")}
      </div>
    </div>
  ) : null}

        {canShowReleaseAndReevaluate ? (
          <form action={releaseAndReevaluateFromForm} className="mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton loadingText="Updating..." className={`w-full ${secondaryButtonClass} sm:w-auto`}>
              {String(job.ops_status ?? "").toLowerCase() === "pending_info"
                ? "Release Pending Info & Re-evaluate"
                : "Release & Re-evaluate"}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {job.job_notes ? (
        <div className={`${workspacePanelClass} p-4 text-gray-900`}>
          <div className="mb-2 text-sm font-semibold text-slate-950">Job Notes</div>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-800">
            {job.job_notes}
          </div>
        </div>
      ) : null}
</details>

      {/* Section A: Follow Up (Active Edit Area) */}
      <details className={workspaceDetailsClass}>
        <summary className="cursor-pointer list-none">
          <CollapsibleHeader
            title="Follow Up"
            subtitle={followUpSummaryText}
          />
        </summary>

        <div className={workspaceDetailsDividerClass}>
          <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4">

          {hasFollowUpReminder ? (
            <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs leading-5 text-slate-600">
              Follow Up stays separate from Pending Info. Use this area for reminder ownership, due date, and next-action notes.
            </div>
          ) : null}

          <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={workspaceFieldLabelClass}>Action Required By</label>
                <select
                  name="action_required_by"
                  defaultValue={job.action_required_by ?? ""}
                  className={workspaceInputClass}
                >
                  <option value="">—</option>
                  <option value="rater">Rater</option>
                  <option value="contractor">Contractor</option>
                  <option value="customer">Customer</option>
                </select>
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Follow-up Date</label>
                <input
                  type="date"
                  name="follow_up_date"
                  defaultValue={job.follow_up_date ? dateToDateInput(String(job.follow_up_date)) : ""}
                  className={workspaceInputClass}
                />
              </div>
            </div>

            <div>
              <label className={workspaceFieldLabelClass}>Next Action Note</label>
              <textarea
                name="next_action_note"
                defaultValue={job.next_action_note ?? ""}
                className={workspaceTextareaClass}
                rows={4}
              />
            </div>

            <SubmitButton loadingText="Saving..." className={`${darkButtonClass} w-fit`}>
              Save Follow Up
            </SubmitButton>
          </form>
        </div>
      </div>
      </details>

 </div>

          {/* Failure Resolution */}
{(showRetestSection || showCorrectionReviewResolution) ? (
<details className={`${workspaceDetailsClass} mb-5`}>
  <summary className="cursor-pointer list-none">
    <CollapsibleHeader
      title="Failure Resolution"
      subtitle={failureResolutionSummaryText}
      meta={`${failureResolutionPathCount} path${failureResolutionPathCount === 1 ? "" : "s"} available`}
    />
  </summary>

  <div className={workspaceDetailsDividerClass}>
  <div className={`grid gap-4${showRetestSection && showCorrectionReviewResolution ? " lg:grid-cols-2" : ""}`}>
    {showRetestSection ? (
      <div className={workspaceSoftCardClass}>
        <div className="mb-2 text-sm font-semibold text-slate-950">Create Retest Job</div>
        <div className="mb-3 text-sm leading-6 text-slate-600">
          Create a new retest visit when this failure requires a physical return visit.
        </div>

        <form action={createRetestJobFromForm} className="space-y-3">
          <input type="hidden" name="parent_job_id" value={job.id} />

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
            Copy equipment from original
          </label>

          <button
            type="submit"
            className={darkButtonClass}
          >
            Create Retest Job
          </button>
        </form>
      </div>
    ) : null}

    {showCorrectionReviewResolution ? (
      <div className={workspaceSoftCardClass}>
        <div className="mb-2 text-sm font-semibold text-slate-950">Resolve by Correction Review</div>
        <div className="mb-3 text-sm leading-6 text-slate-600">
          Use this only when submitted correction notes/photos are sufficient to resolve the failure without sending a technician back out for a physical retest.
        </div>

        <form action={resolveFailureByCorrectionReviewFromForm} className="space-y-3">
          <input type="hidden" name="job_id" value={job.id} />

          <div>
            <label className={workspaceFieldLabelClass}>
              Review Note (optional)
            </label>
            <textarea
              name="review_note"
              rows={3}
              placeholder="Explain why the failure was resolved by correction review..."
              className={workspaceTextareaClass}
            />
          </div>

          <button
            type="submit"
            className={darkButtonClass}
          >
            Resolve Failure by Correction Review
          </button>
        </form>
      </div>
    ) : null}
  </div>
</div>
</details>
) : null}

{isInternalUser && ["failed", "pending_info"].includes(String(job.ops_status ?? "")) ? (
  <>
    <ContractorReportPanel
      jobId={job.id}
      contractorResponseLabel={contractorResponseLabel}
      contractorResponseSubLabel={contractorResponseSubLabel}
    />

    <div className={`${workspacePanelClass} mb-5 p-4 text-gray-900`}>
      <div className="mb-1 text-sm font-semibold text-slate-950">Internal Follow-Up Note</div>
      <div className="mb-3 text-xs leading-5 text-slate-600">
        Internal-only note tied to contractor report/review activity.
      </div>

      <form action={addInternalNoteFromForm} className="space-y-3">
        <input type="hidden" name="job_id" value={job.id} />
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="context" value="contractor_report_review" />
        <input type="hidden" name="anchor_event_type" value="contractor_report_sent" />
        <input
          type="hidden"
          name="anchor_event_id"
          value={latestContractorReportEventId}
        />

        <textarea
          name="note"
          rows={3}
          placeholder="Add an internal follow-up note for this contractor report..."
          className={workspaceTextareaClass}
        />

        <div className="flex justify-end">
          <SubmitButton
            loadingText="Adding note..."
            className={secondaryButtonClass}
          >
            Save follow-up note
          </SubmitButton>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Report Follow-Up Notes
        </div>

        {reportFollowUpNotes.length ? (
          <div className="space-y-2">
            {reportFollowUpNotes.map((e: any, idx: number) => {
              const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
              const meta = e && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
              const noteText = getEventNoteText(meta);

              return (
                <div key={`report-follow-up-${String(e?.id ?? idx)}`} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <div className="text-xs text-slate-500">{when}</div>
                  {noteText ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {noteText}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">(No note text)</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={workspaceEmptyStateClass}>No report follow-up notes yet.</div>
        )}
      </div>
    </div>
  </>
) : null}

    <section className="mt-2 space-y-4">
      <div className="space-y-4">
        {/* Shared Notes */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader title="Shared Notes" subtitle={sharedNotesSummaryText} meta={`${sharedNotes.length} note${sharedNotes.length === 1 ? "" : "s"}`} />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>

  <form action={addPublicNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add a note visible to the contractor..."
      className={workspaceTextareaClass}
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className={secondaryButtonClass}
      >
        Save shared note
      </SubmitButton>
    </div>
  </form>

  <div className="space-y-3">
    {sharedNotes.length ? (
      sharedNotes.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);
        const attachmentLabel = getEventAttachmentLabel(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-slate-500">{when}</div>
              <div className="text-xs font-medium text-slate-500">
                {type === "contractor_note"
                  ? "Contractor"
                  : type === "public_note"
                  ? "Internal (shared)"
                  : type === "contractor_correction_submission"
                  ? "Correction submission"
                  : "Shared"}
              </div>
            </div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              {formatSharedHistoryHeading(type, meta)}
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}

            {attachmentLabel ? (
              <div className="mt-2 inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {attachmentLabel}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className={workspaceEmptyStateClass}>No shared notes yet.</div>
    )}
  </div>
          </div>
        </details>

        {/* Internal Notes */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader title="Internal Notes" subtitle={internalNotesSummaryText} meta={`${internalNotes.length} note${internalNotes.length === 1 ? "" : "s"}`} />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>

  <form action={addInternalNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add an internal note visible only to your team..."
      className={workspaceTextareaClass}
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className={secondaryButtonClass}
      >
        Save internal note
      </SubmitButton>
    </div>
  </form>

  <div className="space-y-3">
    {internalNotes.length ? (
      internalNotes.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="text-xs text-slate-500">{when}</div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              Internal note
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className={workspaceEmptyStateClass}>No internal notes yet.</div>
    )}
  </div>
          </div>
        </details>

        {/* Timeline - Activity/History */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader
              title="Timeline"
              subtitle={timelineSummaryText}
              meta={`${timelineItems.length} event(s)`}
            />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>
    {timelineItems.length ? (
      <>
        {timelinePreviewItems.map((e: any, idx: number) =>
          renderTimelineItem(e, `timeline-preview-${idx}`)
        )}

        {timelineOverflowItems.length > 0 ? (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
              Show all timeline entries ({timelineItems.length})
            </summary>
            <div className="mt-2 space-y-2">
              {timelineOverflowItems.map((e: any, idx: number) =>
                renderTimelineItem(e, `timeline-overflow-${idx}`)
              )}
            </div>
          </details>
        ) : null}
      </>
    ) : (
      <div className={workspaceEmptyStateClass}>No timeline events yet.</div>
    )}
          </div>
        </details>
      </div>
    </section>
    </div>
  </div>
  </div>
  );
  
}
