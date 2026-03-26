// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { getPendingInfoSignal } from "@/lib/utils/ops-status";
import ContractorReportPanel from "./_components/ContractorReportPanel";
import { resolveContractorResponseTracking } from "@/lib/portal/resolveContractorIssues";
import {
  getAssignableInternalUsers,
  getActiveJobAssignmentDisplayMap,
  resolveUserDisplayMap,
} from "@/lib/staffing/human-layer";

import JobAttachmentsInternal from "./_components/JobAttachmentsInternal";

function dateToDateInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  // New DB type: "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Legacy ISO (timestamptz)
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
  return date; // already "YYYY-MM-DD"
}

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  const s = String(time);
  return s.slice(0, 5); // "HH:MM"
}

function finalRunPass(run: any): boolean | null {
  if (!run) return null;
  return run.override_pass != null ? !!run.override_pass : !!run.computed_pass;
}


function timeToTimeInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  // ✅ New DB type: "HH:MM:SS" or "HH:MM"
  // e.g. "08:00:00" -> "08:00"
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.slice(0, 5);
  }

  // ✅ Legacy / mixed cases: ISO string
  // e.g. "2026-02-17T16:00:00.000Z"
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


type JobSearchParams = {
  tab?: "info" | "ops" | "tests";
  banner?: string;
  notice?: string;
  schedule_required?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

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

  if (jobError || !job) return notFound();

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

const { data: parentJob } = parentJobId
  ? await supabase
      .from("jobs")
      .select("id, title, status, ops_status, created_at")
      .eq("id", parentJobId)
      .maybeSingle()
  : { data: null };

const { data: childJobs, error: childErr } = await supabase
  .from("jobs")
  .select("id, title, status, ops_status, created_at")
  .eq("parent_job_id", retestRootId)
  .order("created_at", { ascending: false });

if (childErr) throw new Error(childErr.message);

// --- Service Chain (full case history) ---
const serviceCaseId = (job as any).service_case_id as string | null;

const { data: serviceChainJobs, error: serviceChainErr } = serviceCaseId
  ? await supabase
      .from("jobs")
      .select(
        "id, title, status, ops_status, created_at, scheduled_date, window_start, window_end, parent_job_id"
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
          "id, job_id, created_at, test_type, computed_pass, override_pass, is_completed"
        )
        .in("job_id", serviceChainJobIds)
        .eq("is_completed", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

if (serviceChainRunsErr) throw new Error(serviceChainRunsErr.message);

const latestServiceChainRunByJob = new Map<string, any>();

for (const run of serviceChainRuns ?? []) {
  // because we ordered newest first,
  // the first run we see for a job is the newest one
  if (!latestServiceChainRunByJob.has(run.job_id)) {
    latestServiceChainRunByJob.set(run.job_id, run);
  }
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

const { data: attachmentRows, error: attachmentErr } = await supabase
  .from("attachments")
  .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
  .eq("entity_type", "job")
  .eq("entity_id", jobId)
  .order("created_at", { ascending: false })
  .limit(200);

if (attachmentErr) throw new Error(attachmentErr.message);

const attachmentItems = await Promise.all(
  (attachmentRows ?? []).map(async (a: any) => {
    let signedUrl: string | null = null;

    if (a.bucket && a.storage_path) {
      const { data } = await supabase.storage
        .from(String(a.bucket))
        .createSignedUrl(String(a.storage_path), 60 * 60);

      signedUrl = data?.signedUrl ?? null;
    }

    return {
      ...a,
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

function formatOpsStatusLabel(value?: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return "—";

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

  if (v === "failed" || v === "retest_needed") {
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
  ["failed", "retest_needed"].includes(String(job.ops_status ?? ""));

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
  !job.invoice_complete && String(job.ops_status ?? "") !== "closed";

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

const pendingInfoSignal = getPendingInfoSignal({
  ops_status: job.ops_status,
  pending_info_reason: (job as any).pending_info_reason,
  follow_up_date: (job as any).follow_up_date,
  next_action_note: (job as any).next_action_note,
  action_required_by: (job as any).action_required_by,
});

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

const showRetestSection =
  ["failed", "retest_needed"].includes(String(job.ops_status ?? "")) ||
  !!parentJob ||
  (childJobs?.length ?? 0) > 0;

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
    <div key={key} className="rounded border p-3 text-sm bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-gray-600">{when}</div>
        <div className="text-xs text-gray-500">
          {a?.meta?.attempt_number ? `#${String(a.meta.attempt_number)}` : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
          <span>{methodIcon}</span>
          <span className="capitalize">{method || "—"}</span>
        </span>

        <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs">
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
    <div key={key} className="rounded border p-3 text-sm bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-gray-600">{when}</div>
        <div className="text-xs text-gray-500">{icon}</div>
      </div>

      <div className="mt-2 font-medium text-gray-900">
        {title}
      </div>

      {detailText ? (
        <div className="mt-1 text-sm text-gray-700">
          {detailText}
        </div>
      ) : null}

      {actorDisplayName ? (
        <div className="mt-1 text-xs text-gray-500">By {actorDisplayName}</div>
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
    <div className="w-full min-w-0 overflow-x-hidden p-6 max-w-3xl">

<div className="mb-4 space-y-2">
  <div>
    <Link
      href="/ops"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
    >
      ← Back to Ops
    </Link>
  </div>

  <div className="space-y-2">
    {job.customer_id ? (
      <Link
        href={`/customers/${job.customer_id}`}
        className="block text-3xl font-semibold tracking-tight text-gray-900 hover:underline"
      >
        {customerName}
      </Link>
    ) : (
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{customerName}</h1>
    )}

    <div className="text-xl font-semibold text-gray-900">{job.title}</div>

    <JobLocationPreview
      addressLine1={serviceAddressLine1}
      addressLine2={serviceAddressLine2}
      city={serviceCity}
      state={serviceState}
      zip={serviceZip}
    />

    <p className="text-sm text-gray-600 break-words">{serviceAddressDisplay}</p>

    <p className="text-sm text-gray-600">
      {telLink ? (
        <a href={telLink} className="hover:underline">
          {customerPhone}
        </a>
      ) : (
        customerPhone
      )}
      {contractorName && contractorName !== "—" ? ` • Contractor: ${contractorName}` : ""}
    </p>

    <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Assigned Team</div>
      {assignedTeam.length > 0 ? (
        <div className="mt-2 flex min-w-0 flex-wrap gap-2">
          {assignedTeam.map((assignee) => (
            <div
              key={`${assignee.job_id}-${assignee.user_id}`}
              className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800"
            >
              <span className="max-w-full break-words">{assignee.display_name}</span>
              {assignee.is_primary ? (
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
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
                    className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
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
                    className="rounded-full border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-sm text-gray-500">Unassigned</div>
      )}

      {isInternalUser ? (
        <form action={assignJobAssigneeFromForm} className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value={tab} />
          <select
            name="user_id"
            className="w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 sm:w-auto"
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

          <label className="inline-flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" name="make_primary" value="1" className="h-3.5 w-3.5" />
            Set as primary
          </label>

          <button
            type="submit"
            disabled={assignmentCandidates.length === 0}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Assign
          </button>
        </form>
      ) : null}
    </div>

    <div className="flex flex-wrap items-center gap-2 pt-1">
      <div className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700">
        <span className="font-medium">Field:</span>{" "}
        {formatStatus(job.status)}
      </div>

      <div className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700">
        <span className="font-medium">Ops:</span>{" "}
        {formatOpsStatusLabel(job.ops_status)}
      </div>

      {pendingInfoSignal ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
          Pending Info
        </div>
      ) : null}
    </div>

    <section className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Field Actions</div>
      <div className="mt-2 flex w-full flex-wrap items-stretch gap-2">
        {!isFieldComplete ? (
          <JobFieldActionButton
            jobId={job.id}
            currentStatus={job.status}
            tab={tab}
            hasFullSchedule={hasFullSchedule}
          />
        ) : (
          <span className="w-full min-h-10 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white shadow-sm sm:w-auto">
            ✓ Field Complete
          </span>
        )}
      </div>
    </section>
  </div>
</div>
      {/* Header */}

      {/* Always-visible Top Actions */}

      {/* Closeout Actions (Internal Only) */}
    {showCloseoutRow && (
  <div className="mt-3 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm font-medium text-gray-700">Closeout</div>

      <div className="flex flex-wrap items-center gap-2">
        {/* ECC only: Certs */}
          {canShowCertsButton && (
            <form action={markCertsCompleteFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton
                loadingText="Saving..."
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
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
              className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
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
          : ops === "pending_info"
            ? {
                title: "Job completed — pending information",
                body: "Some required info is still missing (ex: permit number, required fields, or notes). Add it to close out.",
              }
            : ops === "on_hold"
              ? {
                  title: "Job completed — on hold",
                  body: "This job is on hold and is not in the closeout work queue until the hold is cleared.",
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
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 mt-3">
          <div className="text-sm font-semibold">{meta.title}</div>
          <div className="mt-1 text-sm">
            Current Ops Status: <span className="font-medium">{ops}</span>. {meta.body}
          </div>
        </div>
      );
    })() : null}

      {/* Control Bar: Tabs */}
      <div className="mt-4 mb-6">

        <div className="flex w-full flex-wrap gap-2">
          <Link
            href={`/jobs/${job.id}?tab=info`}
            className={`inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition ${
              tab === "info"
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
            }`}
          >
            Info
          </Link>

          <Link
            href={`/jobs/${job.id}?tab=ops`}
            className={`inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition ${
              tab === "ops"
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
            }`}
          >
            Ops
          </Link>

          <Link
            href={`/jobs/${job.id}?tab=tests`}
            className={`inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition ${
              tab === "tests"
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
            }`}
          >
            Tests
          </Link>
        </div>

      </div>

          {/* Tab-aware job context */}
     
          {tab === "info" ? (
          <div className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Job Overview</div>
                <div className="text-xs text-gray-500">
                  Reference details for office and field context.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {formatStatus(job.status)}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Permit</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {job.permit_number || "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Jurisdiction</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {(job as any).jurisdiction || "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Permit Date</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {(job as any).permit_date
                    ? displayDateLA(String((job as any).permit_date))
                    : "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Scheduled</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {job.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Arrival Window</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {job.window_start && job.window_end
                    ? `${timeToTimeInput(job.window_start)} - ${timeToTimeInput(job.window_end)}`
                    : "—"}
                </div>
              </div>



              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Contractor</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {contractorName}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Job ID</div>
                <div className="mt-1 break-all font-mono text-xs text-gray-700">
                  {job.id}
                </div>
              </div>
            </div>

            <details className="w-full text-sm">
              <summary className="cursor-pointer text-gray-600 underline">
                Change job type
              </summary>

              <form
                action={updateJobTypeFromForm}
                className="mt-3 flex items-center gap-2"
              >
                <input type="hidden" name="job_id" value={job.id} />
                <p className="text-xs text-gray-500">
                  Current type: {job.job_type ?? "service"}
                </p>

                <select
                  name="job_type"
                  defaultValue={job.job_type ?? "service"}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="service">Service</option>
                  <option value="ecc">ECC</option>
                </select>

                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded bg-gray-900 px-3 py-1 text-white transition-colors hover:bg-black"
                >
                  Update
                </button>
              </form>
            </details>

            <div className="mt-4 flex flex-col gap-3">
              <details className="w-full text-sm">
                <summary className="cursor-pointer text-gray-600 underline">
                  Change contractor
                </summary>

                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                  <form action={updateJobContractorFromForm} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=info`} />

                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600">
                        Assigned contractor
                      </label>
                      <select
                        name="contractor_id"
                        defaultValue={job.contractor_id ?? ""}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                    >
                      Save contractor
                    </SubmitButton>
                  </form>
                </div>
              </details>

              {job.customer_id ? (
                <Link
                  href={`/customers/${job.customer_id}/edit`}
                  className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Edit Customer →
                </Link>
              ) : (
                <div className="text-xs text-red-600">
                  This job is not linked to a customer yet.
                </div>
              )}
            </div>

              <div className="mt-3 flex flex-wrap gap-2">

              {job.customer_id && (
                <Link
                  href={`/customers/${job.customer_id}`}
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  Open Customer
                </Link>
              )}

              {telLink && (
                <a
                  href={telLink}
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  📞 Call
                </a>
              )}

              {customerPhone !== "—" && (
                <a
                  href={`sms:${digitsOnly(customerPhone)}`}
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  💬 Text
                </a>
              )}

              {serviceMapsLink && (
                <a
                  href={serviceMapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  🧭 Navigate
                </a>
              )}

              {serviceCaseId ? (
                <a
                  href="#service-chain"
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  Service Case: {serviceCaseVisitCount} visit{serviceCaseVisitCount === 1 ? "" : "s"}
                </a>
              ) : null}
              

            </div>

            <details className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Admin archive controls
              </summary>

              <div className="mt-3 space-y-3">
                <div className="text-sm text-gray-600">
                  Archive hides this job across Ops, portal, and searches. This can be undone later (by clearing deleted_at).
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={archiveJobFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <SubmitButton
                      loadingText="Archiving..."
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Archive Job
                    </SubmitButton>
                  </form>

                  {!["completed", "failed", "cancelled"].includes(job.status) && (
                    <CancelJobButton jobId={job.id} />
                  )}
                </div>
              </div>
            </details>
          </div>
        ) : null}


      {/* TAB: INFO */}
      {tab === "info" && (
        <>
    
{["data_entry", "invoice_required"].includes(String(job.ops_status ?? "").toLowerCase()) ? (
  <div className="rounded-lg border bg-yellow-50 p-4 mt-6">
    <div className="font-semibold mb-2">
      Data Entry Required
    </div>

    <form action={completeDataEntryFromForm} className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="job_id" value={job.id} />

      
      <div className="flex flex-col">
        <label className="text-sm">Invoice # (optional)</label>
        <input
          name="invoice_number"
          className="rounded border px-3 py-2 text-sm"
        />
      </div>
    
      <SubmitButton
        loadingText="Saving..."
        className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded border text-sm bg-black text-white"
      >
        Mark Data Entry Complete
      </SubmitButton>
    </form>
  </div>
) : null}


    {/* Equipment */}
    <section className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Equipment</div>
          <div className="text-xs text-gray-500">
            Location-based equipment context for this job.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Status
        </div>
        <div className="mt-1 text-sm font-semibold text-gray-900">
          {equipmentSummaryLabel}
        </div>
      </div>

      {equipmentCount > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Condenser</div>
            <div className="font-medium text-gray-900">
              {outdoorEquipment
                ? `${outdoorEquipment.manufacturer ?? "—"} ${outdoorEquipment.model ?? ""}`.trim()
                : "—"}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Indoor Equipment</div>
            <div className="font-medium text-gray-900">
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
          className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {equipmentCount > 0 ? "View / Edit Equipment" : "Capture Equipment"}
        </Link>
      </div>
    </section>

        </>
      )}

      {/* TAB: OPS */}
      {tab === "ops" && (
        <>
          {/* Job Status (ops_status) */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Job Status</div>

  <form action={updateJobOpsFromForm} className="flex flex-col gap-2 sm:flex-row sm:items-end">
    <input type="hidden" name="job_id" value={job.id} />

    <div className="flex-1">
      <label className="block text-xs text-gray-600 mb-1">Ops Status</label>

      {!["need_to_schedule", "scheduled", "pending_info", "on_hold"].includes(
        String(job.ops_status ?? "")
      ) ? (
        <div className="mb-3 rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Current lifecycle state:{" "}
          <span className="font-medium">
            {formatOpsStatusLabel(job.ops_status)}
          </span>
        </div>
      ) : null}

      <select
        name="ops_status"
        defaultValue={
          ["need_to_schedule", "scheduled", "pending_info", "on_hold"].includes(
            String(job.ops_status ?? "")
          )
            ? String(job.ops_status)
            : "need_to_schedule"
        }
        className="w-full rounded border px-2 py-2 text-sm"
      >
        <option value="need_to_schedule">Need to Schedule</option>
        <option value="scheduled">Scheduled</option>
        <option value="pending_info">Pending Info</option>
        <option value="on_hold">On Hold</option>
      </select>

      <p className="mt-2 text-xs text-gray-500">
        Manual ops updates are limited to scheduling and follow-up states.
        Failed, retest, closeout, and closed states are set by workflow actions.
      </p>
          </div>

          <SubmitButton loadingText="Saving..." className="w-full inline-flex items-center justify-center min-h-10 px-3 py-2 rounded bg-black text-white text-sm sm:w-auto sm:shrink-0">
            Save
          </SubmitButton>
        </form>

        {canShowReleaseAndReevaluate ? (
          <form action={releaseAndReevaluateFromForm} className="mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton loadingText="Updating..." className="w-full inline-flex items-center justify-center min-h-10 px-3 py-2 rounded border text-sm bg-white hover:bg-gray-100 sm:w-auto">
              {String(job.ops_status ?? "").toLowerCase() === "pending_info"
                ? "Release Pending Info & Re-evaluate"
                : "Release & Re-evaluate"}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {/* Scheduling & Contact */}
      <div className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
        <div className="mb-4">
          <div className="text-base font-semibold">Scheduling & Contact</div>
          <div className="text-xs text-gray-500">
            Dispatch actions, contact outcomes, schedule, and follow-up in one workflow area.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Launch Actions</div>
            <div className="mt-2 text-sm font-semibold text-gray-900">{customerName}</div>
            <div className="text-sm text-gray-700">{customerPhone}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {telLink ? (
                <a
                  href={telLink}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100"
                >
                  Call
                </a>
              ) : null}

              {customerPhone !== "—" ? (
                <a
                  href={`sms:${digitsOnly(customerPhone)}`}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100"
                >
                  Text
                </a>
              ) : null}

              {serviceMapsLink ? (
                <a
                  href={serviceMapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100"
                >
                  Navigate
                </a>
              ) : null}

              {job.customer_id ? (
                <Link
                  href={`/customers/${job.customer_id}`}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100"
                >
                  Open Customer
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Logging Actions</div>
            <div className="mt-1 text-xs text-gray-500">
              Use these to record contact outcomes separately from Call/Text/Navigate launch actions.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <form action={logCustomerContactAttemptFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="method" value="call" />
                <input type="hidden" name="result" value="no_answer" />
                <SubmitButton loadingText="Logging..." className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded border text-sm bg-white hover:bg-gray-100">
                  Log Call (No Answer)
                </SubmitButton>
              </form>

              <form action={logCustomerContactAttemptFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="method" value="text" />
                <input type="hidden" name="result" value="sent" />
                <SubmitButton loadingText="Logging..." className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded border text-sm bg-white hover:bg-gray-100">
                  Log Text (Sent)
                </SubmitButton>
              </form>

              <form action={logCustomerContactAttemptFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="method" value="call" />
                <input type="hidden" name="result" value="spoke" />
                <SubmitButton loadingText="Logging..." className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded border text-sm bg-white hover:bg-gray-100">
                  Log Call (Spoke)
                </SubmitButton>
              </form>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              Attempts: <span className="font-medium">{attemptCount}</span> • Last: <span className="font-medium">{lastAttemptLabel}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold mb-3">Scheduling</div>

          <form action={updateJobScheduleFromForm} className="space-y-4">
            <input type="hidden" name="job_id" value={job.id} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  name="scheduled_date"
                  defaultValue={displayDateLA(job.scheduled_date)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                  Permit #
                </label>
                <input
                  name="permit_number"
                  defaultValue={job.permit_number ?? ""}
                  placeholder="Optional"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {job.job_type === "ecc" ? (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                      Jurisdiction
                    </label>
                    <input
                      name="jurisdiction"
                      defaultValue={(job as any).jurisdiction ?? ""}
                      placeholder="City or county permit office"
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                      Permit Date
                    </label>
                    <input
                      type="date"
                      name="permit_date"
                      defaultValue={(job as any).permit_date ?? ""}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                  Window Start
                </label>
                <input
                  type="time"
                  name="window_start"
                  defaultValue={timeToTimeInput(job.window_start)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
                />
                <div className="text-[11px] text-gray-500">Example: 08:00</div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                  Window End
                </label>
                <input
                  type="time"
                  name="window_end"
                  defaultValue={timeToTimeInput(job.window_end)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
                />
                <div className="text-[11px] text-gray-500">Example: 10:00</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <SubmitButton
                loadingText="Saving..."
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Save Scheduling
              </SubmitButton>

              {(job.scheduled_date || job.window_start || job.window_end) ? (
                <UnscheduleButton />
              ) : null}

              <Link
                href="/ops"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Back to Ops
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold mb-3">Follow Up</div>

          <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Action Required By</label>
                <select
                  name="action_required_by"
                  defaultValue={job.action_required_by ?? ""}
                  className="w-full rounded border px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="rater">Rater</option>
                  <option value="contractor">Contractor</option>
                  <option value="customer">Customer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Follow-up Date</label>
                <input
                  type="date"
                  name="follow_up_date"
                  defaultValue={job.follow_up_date ? dateToDateInput(String(job.follow_up_date)) : ""}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Pending Info Reason</label>
              <input
                name="pending_info_reason"
                defaultValue={job.pending_info_reason ?? ""}
                className="w-full rounded border px-2 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Next Action Note</label>
              <textarea
                name="next_action_note"
                defaultValue={job.next_action_note ?? ""}
                className="w-full rounded border px-2 py-2 text-sm"
                rows={4}
              />
            </div>

            <SubmitButton loadingText="Saving..." className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded bg-black text-white text-sm w-fit">
              Save Follow Up
            </SubmitButton>
          </form>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold mb-2">Customer Follow-Up History</div>

          {!attemptItems.length ? (
            <div className="text-sm text-gray-600">No contact attempts logged yet.</div>
          ) : (
            <div className="space-y-2">
              {contactPreviewItems.map((a: any, idx: number) => renderAttemptItem(a, `attempt-preview-${idx}`))}

              {contactOverflowItems.length > 0 ? (
                <details className="pt-1">
                  <summary className="cursor-pointer text-sm text-gray-700 underline">
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
      </div>

      <ServiceStatusActions jobId={jobId} />

      {job.job_notes ? (
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <div className="text-sm font-semibold mb-2">Job Notes</div>
          <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
            {job.job_notes}
          </div>
        </div>
      ) : null}

          <section id="service-chain" className="rounded-lg border p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Service Chain</h2>
              <p className="text-sm text-muted-foreground">
                Full visit history for this service case.
              </p>
            </div>

            {serviceCaseId ? (
              <div className="text-xs text-gray-500">
                Case: {serviceCaseId.slice(0, 8)}…
              </div>
            ) : null}
          </div>

          {!serviceCaseId ? (
            <div className="mt-3 text-sm text-gray-600">
              This job is not attached to a service case yet.
            </div>
          ) : !serviceChainJobs || serviceChainJobs.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              No visits found in this service case.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {serviceChainJobs.map((visit: any, idx: number) => {

                const latestRun = latestServiceChainRunByJob.get(visit.id) ?? null;
                const eccPass = finalRunPass(latestRun);
                const isCurrent = visit.id === jobId;
                const win =
                  visit.scheduled_date && visit.window_start && visit.window_end
                    ? `${formatTimeDisplay(visit.window_start)}–${formatTimeDisplay(visit.window_end)}`
                    : null;

                return (
                  <div
                    key={visit.id}
                    className={[
                      "rounded-lg border p-3",
                      isCurrent ? "border-black bg-gray-50" : "bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-600">
                            {idx === 0 ? "Original Visit" : `Retest ${idx}`}
                            {isCurrent && (
                              <span className="text-blue-600 dark:text-blue-400"> • Active</span>
                            )}
                          </div>
                          <span
                            className={[
                              "inline-flex rounded px-2 py-1 text-xs font-medium",
                              serviceChainBadgeClass(visit.ops_status, isCurrent),
                            ].join(" ")}
                          >
                            {formatOpsStatusLabel(visit.ops_status)}
                          </span>
                        </div>

                        <div className="mt-1 text-sm text-gray-800">
                          {visit.title ?? "Untitled Job"}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          Created:{" "}
                          {visit.created_at ? formatDateLAFromIso(String(visit.created_at)) : "—"}
                          {visit.scheduled_date ? ` • Scheduled: ${visit.scheduled_date}` : ""}
                          {win ? ` • ${win}` : ""}
                        </div>
                                              <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-500">ECC:</span>

                          {latestRun ? (
                            <span
                              className={[
                                "inline-flex rounded px-2 py-1 text-xs font-medium",
                                eccPass === true
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800",
                              ].join(" ")}
                            >
                              {eccPass === true ? "Passed" : "Failed"}
                            </span>
                          ) : (
                            <span className="inline-flex rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700">
                              No completed tests yet
                            </span>
                          )}

                          {latestRun?.test_type ? (
                            <span className="text-xs text-gray-500">
                              {String(latestRun.test_type)}
                            </span>
                          ) : null}

                          {latestRun?.created_at ? (
                            <span className="text-xs text-gray-500">
                              • {formatDateLAFromIso(String(latestRun.created_at))}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {!isCurrent ? (
                        <Link
                          href={`/jobs/${visit.id}?tab=ops`}
                          className="text-sm underline"
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
        </section>

          {/* Retest + Linked Jobs */}
{showRetestSection ? (
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Retest</div>

  {["failed", "retest_needed"].includes(String(job.ops_status ?? "")) ? (
    <form action={createRetestJobFromForm} className="mb-4">
      <input type="hidden" name="parent_job_id" value={job.id} />

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
          Copy equipment from original
        </label>

      <button
        type="submit"
        className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded bg-black text-white text-sm"
      >
        Create Retest Job
      </button>
    </form>
  ) : (
    <div className="text-sm text-gray-600 mb-4">
      Retest button appears when Ops Status is <span className="font-medium">Failed</span> or{" "}
      <span className="font-medium">Retest Needed</span>.
    </div>
  )}

  {parentJob ? (
    <div className="text-sm mb-3">
      <div className="text-xs text-gray-600 mb-1">Original Job</div>
      <Link className="underline" href={`/jobs/${parentJob.id}?tab=ops`}>
        {parentJob.title ?? parentJob.id}
      </Link>
      <div className="text-xs text-gray-600 mt-1">
        Status: {String(parentJob.status)} • Ops: {String(parentJob.ops_status ?? "—")}
      </div>
    </div>
  ) : null}

  <div className="text-sm">
    <div className="text-xs text-gray-600 mb-1">Retests</div>

    {childJobs?.length ? (
      <div className="space-y-2">
        {childJobs.map((cj: any) => (
          <div key={cj.id} className="rounded border p-3 text-sm">
            <Link className="underline" href={`/jobs/${cj.id}?tab=ops`}>
              {cj.title ?? cj.id}
            </Link>
            <div className="text-xs text-gray-600 mt-1">
              Status: {String(cj.status)} • Ops: {String(cj.ops_status ?? "—")}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-sm text-gray-600">No retests yet.</div>
    )}
  </div>
</div>
) : null}

{isInternalUser &&
 job.job_type === "ecc" &&
 ["failed", "retest_needed"].includes(String(job.ops_status ?? "")) && (
  <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
    <div className="text-sm font-semibold mb-3">Correction Review Resolution</div>

    <div className="text-sm text-gray-600 mb-3">
      Use this only when submitted correction notes/photos are sufficient to resolve the failure
      without sending a technician back out for a physical retest.
    </div>

    <form action={resolveFailureByCorrectionReviewFromForm} className="space-y-3">
      <input type="hidden" name="job_id" value={job.id} />

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Review Note (optional)
        </label>
        <textarea
          name="review_note"
          rows={3}
          placeholder="Explain why the failure was resolved by correction review..."
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center min-h-10 px-3 py-2 rounded bg-black text-white text-sm"
      >
        Resolve Failure by Correction Review
      </button>
    </form>
  </div>
) }

{isInternalUser && ["failed", "pending_info"].includes(String(job.ops_status ?? "")) ? (
  <>
    <ContractorReportPanel
      jobId={job.id}
      contractorResponseLabel={contractorResponseLabel}
      contractorResponseSubLabel={contractorResponseSubLabel}
    />

    <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
      <div className="text-sm font-semibold mb-1">Internal Follow-Up Note</div>
      <div className="text-xs text-gray-600 mb-3">
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
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />

        <div className="flex justify-end">
          <SubmitButton
            loadingText="Adding note..."
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            Save follow-up note
          </SubmitButton>
        </div>
      </form>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
          Report Follow-Up Notes
        </div>

        {reportFollowUpNotes.length ? (
          <div className="space-y-2">
            {reportFollowUpNotes.map((e: any, idx: number) => {
              const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
              const meta = e && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
              const noteText = getEventNoteText(meta);

              return (
                <div key={`report-follow-up-${String(e?.id ?? idx)}`} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-600">{when}</div>
                  {noteText ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                      {noteText}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-500">(No note text)</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No report follow-up notes yet.</div>
        )}
      </div>
    </div>
  </>
) : null}

{/* Shared Notes */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Shared Notes</div>

  <form action={addPublicNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add a note visible to the contractor..."
      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
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
          <div key={idx} className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-gray-600">{when}</div>
              <div className="text-xs font-medium text-gray-500">
                {type === "contractor_note"
                  ? "Contractor"
                  : type === "public_note"
                  ? "Internal (shared)"
                  : type === "contractor_correction_submission"
                  ? "Correction submission"
                  : "Shared"}
              </div>
            </div>

            <div className="mt-2 text-sm font-medium text-gray-900">
              {formatSharedHistoryHeading(type, meta)}
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                {noteText}
              </div>
            ) : null}

            {attachmentLabel ? (
              <div className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                {attachmentLabel}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className="text-sm text-gray-600">No shared notes yet.</div>
    )}
  </div>
</div>

{/* Internal Notes */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Internal Notes</div>

  <form action={addInternalNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add an internal note visible only to your team..."
      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
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
          <div key={idx} className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-600">{when}</div>

            <div className="mt-2 text-sm font-medium text-gray-900">
              Internal note
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                {noteText}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className="text-sm text-gray-600">No internal notes yet.</div>
    )}
  </div>
</div>

{/* Internal Attachments */}
<details className="rounded-lg border bg-white text-gray-900 mb-6">
  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
    Attachments ({attachmentItems.length})
  </summary>
  <div className="px-4 pb-4">
    <JobAttachmentsInternal
      jobId={job.id}
      initialItems={attachmentItems}
    />
  </div>
</details>

{/* Timeline */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-1">Timeline</div>
  <div className="text-xs text-gray-500 mb-3">
    Showing latest {Math.min(3, timelineItems.length)} of {timelineItems.length} event(s)
  </div>

  <div className="space-y-2">
    {timelineItems.length ? (
      <>
        {timelinePreviewItems.map((e: any, idx: number) =>
          renderTimelineItem(e, `timeline-preview-${idx}`)
        )}

        {timelineOverflowItems.length > 0 ? (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm text-gray-700 underline">
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
      <div className="text-sm text-gray-600">No timeline events yet.</div>
    )}
  </div>
</div>

        </>
      )}

      {/* TAB: TESTS */}
      {tab === "tests" && (
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <div className="text-sm font-semibold mb-2">Tests</div>
          <div className="text-sm text-gray-600 mb-3">
            {job.ecc_test_runs?.length ? (
              <span>{job.ecc_test_runs.length} test run(s) recorded.</span>
            ) : (
              <span>No tests recorded yet.</span>
            )}
          </div>

          <Link
            href={`/jobs/${job.id}/tests`}
            className="px-3 py-2 rounded bg-black text-white text-sm inline-block"
          >
            Go to Tests
          </Link>
        </div>
      )}
    </div>
  );
  
}
