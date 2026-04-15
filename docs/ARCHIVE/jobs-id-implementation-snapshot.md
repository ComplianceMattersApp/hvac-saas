# /jobs/[id] Implementation Snapshot

Generated: 2026-03-26

## Route: app/jobs/[id]/page.tsx
```tsx
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
    
{job.ops_status === "data_entry" ? (
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

```

## Directly Rendered Child: components/SubmitButton.tsx
```tsx
"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className,
  loadingText,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loadingText?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || !!disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`inline-flex min-h-11 items-center justify-center transition-colors ${className ?? ""} ${
        isDisabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"
      }`}
      {...props}
    >
      {pending ? loadingText ?? "Saving..." : children}
    </button>
  );
}
```

## Directly Rendered Child: components/ui/FlashBanner.tsx
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback from "@/components/ui/ActionFeedback";

export default function FlashBanner({
  type,
  message,
}: {
  type: "success" | "warning" | "error";
  message: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("banner");
      router.replace(url.pathname + url.search, { scroll: false });
    }, 4000);

    return () => clearTimeout(t);
  }, [router]);

  return <ActionFeedback type={type} message={message} className="mb-4" />;
}
```

## Directly Rendered Child: components/jobs/JobLocationPreview.tsx
```tsx
type JobLocationPreviewProps = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  className?: string;
};

type StreetViewMetadataResponse = {
  status?: string;
};

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean);
}

function buildAddressDisplay(props: JobLocationPreviewProps) {
  const locality = compact([
    props.city,
    compact([props.state, props.zip]).join(" "),
  ]).join(", ");

  const parts = compact([
    props.addressLine1,
    props.addressLine2,
    locality,
  ]);

  return parts.join(", ");
}

function buildMapsSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildMapsDirectionsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

async function hasStreetView(address: string, apiKey: string) {
  const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?size=640x360&location=${encodeURIComponent(address)}&source=outdoor&key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(metadataUrl, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) return false;

    const data = (await response.json()) as StreetViewMetadataResponse;
    return data.status === "OK";
  } catch {
    return false;
  }
}

export default async function JobLocationPreview(props: JobLocationPreviewProps) {
  const addressDisplay = buildAddressDisplay(props);

  if (!addressDisplay) {
    return (
      <div className={props.className}>
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-center text-sm font-medium text-slate-600">
          Location preview unavailable
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Add a full service address to enable property preview and map actions.
        </p>
      </div>
    );
  }

  const mapsSearchUrl = buildMapsSearchUrl(addressDisplay);
  const mapsDirectionsUrl = buildMapsDirectionsUrl(addressDisplay);
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim();

  let imageUrl: string | null = null;
  let imageAlt = `Location preview for ${addressDisplay}`;

  if (apiKey) {
    const streetViewAvailable = await hasStreetView(addressDisplay, apiKey);

    imageUrl = streetViewAvailable
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${encodeURIComponent(addressDisplay)}&source=outdoor&fov=80&pitch=0&key=${encodeURIComponent(apiKey)}`
      : `https://maps.googleapis.com/maps/api/staticmap?size=640x360&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(addressDisplay)}&key=${encodeURIComponent(apiKey)}`;

    imageAlt = streetViewAvailable
      ? `Street View preview for ${addressDisplay}`
      : `Static map preview for ${addressDisplay}`;
  }

  return (
    <div className={props.className}>
      <a
        href={mapsSearchUrl}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm transition hover:border-slate-300"
        aria-label={`Open ${addressDisplay} in Google Maps`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            className="aspect-[16/9] w-full object-cover transition duration-200 group-hover:scale-[1.01]"
          />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center px-4 text-center text-sm font-medium text-slate-600">
            Location preview unavailable
          </div>
        )}
      </a>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={mapsDirectionsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Navigate
        </a>
        <a
          href={mapsSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Open in Maps
        </a>
      </div>
    </div>
  );
}
```

## Directly Rendered Child: components/jobs/CancelJobButton.tsx
```tsx
"use client";

import { cancelJobFromForm } from "@/lib/actions/job-actions";

export default function CancelJobButton({ jobId }: { jobId: string }) {
  return (
    <form
      action={cancelJobFromForm}
      className="min-w-[9.5rem] flex-1 sm:w-auto sm:min-w-0 sm:flex-none"
      onSubmit={(e) => {
        if (!window.confirm("Cancel this job? This action cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <button
        type="submit"
        className="w-full min-h-10 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 hover:bg-red-100 sm:w-auto"
      >
        📋 Cancel Job (Admin)
      </button>
    </form>
  );
}

```

## Directly Rendered Child: app/jobs/[id]/_components/ServiceStatusActions.tsx
```tsx
// app/jobs/[id]/_components/ServiceStatusActions.tsx

import { markServiceComplete, markInvoiceSent } from "@/lib/actions/service-actions";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

export default async function ServiceStatusActions({ jobId }: { jobId: string }) {
  const supabase = await createClient();

  // Read the job so we only show these controls for Service jobs
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, invoice_number")
    .eq("id", jobId)
    .single();

  if (error) {
    // Fail soft: don't break the job page
    return (
      <div className="rounded-xl border p-4 text-sm">
        Could not load job for service actions.
      </div>
    );
  }

  if (job.job_type !== "service") return null;

  // Bind server actions to this jobId (so the form submit passes the id)
  const completeAction = markServiceComplete.bind(null, jobId);
  const invoiceSentAction = markInvoiceSent.bind(null, jobId);

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Service Closeout</h2>
          <p className="mt-1 text-xs text-neutral-600">
            These update <b>ops_status</b> and do not affect the Tests page.
          </p>
          <div className="mt-2 text-xs">
            Current ops_status: <b>{job.ops_status}</b>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <form action={completeAction}>
          <SubmitButton
            loadingText="Updating..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            Mark Service Complete → Invoice Required
          </SubmitButton>
        </form>

        <form action={invoiceSentAction}>
          <SubmitButton
            loadingText="Updating..."
            className="w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Mark Invoice Sent → Closed
          </SubmitButton>
        </form>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Note: manual locks (<b>pending_info</b>, <b>on_hold</b>) will prevent automation from overwriting.
      </p>
    </section>
  );
}

```

## Directly Rendered Child: app/jobs/[id]/_components/JobFieldActionButton.tsx
```tsx
"use client";

import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import { useFormStatus } from "react-dom";

type JobFieldActionButtonProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  hasFullSchedule: boolean;
};

function FieldActionSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
        className="w-full min-h-11 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Updating..." : label}
    </button>
  );
}

export function JobFieldActionButton({
  jobId,
  currentStatus,
  tab,
  hasFullSchedule,
}: JobFieldActionButtonProps) {
  const isDone = ["completed", "failed", "cancelled"].includes(currentStatus);

  const label =
    currentStatus === "open"
      ? "On the way"
      : currentStatus === "on_the_way"
      ? "In progress"
      : currentStatus === "in_process"
      ? "Job completed"
      : "—";

  if (isDone) {
    return (
        <span className="w-full min-h-10 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white shadow-sm sm:w-auto">
        ✓ Field visit complete
      </span>
    );
  }

  return (
    <form
      className="min-w-[9.5rem] flex-1 sm:w-auto sm:min-w-0 sm:flex-none"
      action={advanceJobStatusFromForm}
      onSubmit={(e) => {
        const needsScheduleConfirm = currentStatus === "open" && !hasFullSchedule;
        if (!needsScheduleConfirm) return;

        const confirmed = window.confirm(
          "This job is missing a full schedule. Press OK to auto-fill today with a 2-hour window starting now and continue to On the way."
        );

        if (!confirmed) {
          e.preventDefault();
          return;
        }

        const form = e.currentTarget;
        const hidden = form.querySelector(
          'input[name="auto_schedule_confirmed"]'
        ) as HTMLInputElement | null;

        if (hidden) hidden.value = "1";
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="current_status" value={currentStatus} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="auto_schedule_confirmed" value="0" />

      <FieldActionSubmitButton label={label} />
    </form>
  );
}
```

## Directly Rendered Child: app/jobs/[id]/_components/UnscheduleButton.tsx
```tsx
"use client";

import { useFormStatus } from "react-dom";

type UnscheduleButtonProps = {
  className?: string;
};

export default function UnscheduleButton({ className }: UnscheduleButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className={
        className ??
        "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
      }
      type="submit"
      name="unschedule"
      value="1"
      onClick={(e) => {
        const ok = window.confirm("Remove this job from the schedule?");
        if (!ok) e.preventDefault();
      }}
    >
      {pending ? "Updating..." : "Unschedule"}
    </button>
  );
}

```

## Directly Rendered Child: app/jobs/[id]/_components/ContractorReportPanel.tsx
```tsx
"use client";

import { useState, useTransition } from "react";
import {
  generateContractorReportPreview,
  sendContractorReport,
  type ContractorReportPreview,
} from "@/lib/actions/job-ops-actions";
import ActionFeedback from "@/components/ui/ActionFeedback";

function contractorReportErrorMessage(action: "generate" | "send") {
  return action === "generate" ? "Could not prepare report." : "Could not send report.";
}

export default function ContractorReportPanel({
  jobId,
  contractorResponseLabel,
  contractorResponseSubLabel,
}: {
  jobId: string;
  contractorResponseLabel?: string | null;
  contractorResponseSubLabel?: string | null;
}) {
  const [preview, setPreview] = useState<ContractorReportPreview | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [contractorNote, setContractorNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"generate" | "send" | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSend = !!preview && !isPending && !sent;

  function onGenerate() {
    setError(null);
    setSuccess(null);
    setLastAction("generate");

    startTransition(async () => {
      try {
        const nextPreview = await generateContractorReportPreview({ jobId });
        setPreview(nextPreview);
        setIsExpanded(true);
        setSent(false);
      } catch (e) {
        console.error("generateContractorReportPreview failed", e);
        setPreview(null);
        setIsExpanded(false);
        setError(contractorReportErrorMessage("generate"));
      } finally {
        setLastAction(null);
      }
    });
  }

  function onSend() {
    if (!preview) return;

    setError(null);
    setSuccess(null);
    setLastAction("send");

    startTransition(async () => {
      try {
        const result = await sendContractorReport({
          jobId,
          contractorNote,
        });

        setSuccess(result.alreadySent ? "This was already sent." : "Report sent.");
        setIsExpanded(false);
        setSent(true);
      } catch (e) {
        console.error("sendContractorReport failed", e);
        setError(contractorReportErrorMessage("send"));
      } finally {
        setLastAction(null);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
      <div className="text-sm font-semibold mb-3">Contractor Report</div>

      {contractorResponseLabel ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-800">
            {contractorResponseLabel}
          </span>
          {contractorResponseSubLabel ? (
            <span className="text-xs text-gray-500">{contractorResponseSubLabel}</span>
          ) : null}
        </div>
      ) : null}

      <ActionFeedback type="error" message={error} className="mb-3" />
      <ActionFeedback type="success" message={success} className="mb-3" />

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {isPending && lastAction === "generate" ? "Generating..." : "Generate Contractor Report"}
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sent
            ? "Sent ✓"
            : isPending && lastAction === "send"
            ? "Sending..."
            : "Send to Contractor"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-600">Report Type</div>
                <div className="font-medium text-gray-900">{preview.title}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {preview.reasons.length} reason{preview.reasons.length === 1 ? "" : "s"} • {preview.service_date_text}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="px-2 py-1 rounded border text-xs bg-white hover:bg-gray-50"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>

          {!isExpanded ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Preview is collapsed. Expand to review details, edit contractor note, and send.
            </div>
          ) : null}

          {isExpanded ? (
            <>
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="text-xs text-gray-600 mb-2">Generated Summary</div>

                <div><span className="font-medium">Customer:</span> {preview.customer_name}</div>
                <div><span className="font-medium">Location:</span> {preview.location_text}</div>
                <div><span className="font-medium">Contractor:</span> {preview.contractor_name ?? "Not assigned"}</div>
                <div><span className="font-medium">Service/Test Date:</span> {preview.service_date_text}</div>

                <div className="mt-2">
                  <div className="font-medium">Reasons</div>
                  <ul className="list-disc pl-5">
                    {preview.reasons.map((reason, idx) => (
                      <li key={`${reason}-${idx}`}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-2"><span className="font-medium">Next Step:</span> {preview.next_step}</div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Contractor Note</label>
                <textarea
                  value={contractorNote}
                  onChange={(e) => setContractorNote(e.target.value)}
                  rows={4}
                  placeholder="Optional contractor-facing note"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="text-xs text-gray-600 mb-1">Email-ready Body Preview</div>
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{preview.body_text}</pre>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          Generate a report preview from current job data. Preview is ephemeral and is not saved.
        </div>
      )}
    </div>
  );
}

```

## Directly Rendered Child: app/jobs/[id]/_components/JobAttachmentsInternal.tsx
```tsx
"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  shareJobAttachmentToContractor,
} from "@/lib/actions/attachment-actions";

type Item = {
  id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
  signedUrl: string | null;
};

export default function JobAttachmentsInternal({
  jobId,
  initialItems,
}: {
  jobId: string;
  initialItems: Item[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharedAttachmentIds, setSharedAttachmentIds] = useState<Set<string>>(
    () => new Set()
  );

  const hasFiles = files.length > 0;
  const canAct = !isPending && hasFiles;

  function openPicker() {
    setError(null);
    setOk(null);
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    e.target.value = "";
  }

  async function uploadOne(file: File) {
    const tok = await createJobAttachmentUploadToken({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      caption: caption.trim() || undefined,
    });

    const { error: upErr } = await supabase.storage
      .from(tok.bucket)
      .uploadToSignedUrl(tok.path, tok.token, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (upErr) throw new Error(upErr.message);
    return (tok as { attachmentId?: string | null }).attachmentId ?? null;
  }

  async function uploadInternal() {
    setError(null);
    setOk(null);

    startTransition(async () => {
      try {
        const uploadedIds: string[] = [];

        for (const f of files) {
          const id = await uploadOne(f);
          if (id) uploadedIds.push(id);
        }

        const fileNames = files.map((f) => f.name);
        const count = fileNames.length;
        const trimmed = note.trim();

        // Single summary event for the whole batch
        const { error: evErr } = await supabase.from("job_events").insert({
          job_id: jobId,
          event_type: "attachment_added",
          meta: {
            source: "internal",
            count,
            note: trimmed || null,
            caption: caption.trim() || null,
            attachment_ids: uploadedIds,
            file_names: fileNames,
          },
        });

        if (evErr) throw new Error(evErr.message);

        setFiles([]);
        setCaption("");
        setNote("");
        setOk(`Uploaded ${count} attachment${count === 1 ? "" : "s"}.`);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  async function shareToContractor(attachment: Item) {
    if (sharedAttachmentIds.has(attachment.id)) return;

    setError(null);
    setOk(null);
    setSharingId(attachment.id);

    try {
      await shareJobAttachmentToContractor({
        jobId,
        attachmentId: attachment.id,
      });

      setSharedAttachmentIds((prev) => new Set(prev).add(attachment.id));
      setOk(`Shared "${attachment.file_name}" to contractor.`);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Share failed");
    } finally {
      setSharingId(null);
    }
  }

  return (
    <div className="rounded-lg border bg-white text-gray-900 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm font-semibold">Attachments</div>
        <div className="text-xs text-gray-500">
          {initialItems?.length ?? 0} files
        </div>
      </div>

      <div className="p-4 space-y-4">
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={onPickFiles}
          className="hidden"
          disabled={isPending}
        />

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {ok ? <div className="text-sm text-emerald-700">{ok}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Choose Files
          </button>

          <div className="text-xs text-gray-700">
            {hasFiles
              ? `Selected: ${files.length} file${files.length === 1 ? "" : "s"}`
              : "No files selected"}
          </div>
        </div>

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption (e.g., gauges, nameplate, permit photo)"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          disabled={isPending}
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for this upload batch..."
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          rows={3}
          disabled={isPending}
        />

        <button
          type="button"
          onClick={uploadInternal}
          disabled={!canAct}
          className="inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload Files"}
        </button>

        <div className="pt-2 border-t border-gray-200">
          {!initialItems || initialItems.length === 0 ? (
        <div className="text-sm text-gray-700">No files uploaded yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {initialItems.map((a) => {
                const isImage =
                  !!a.content_type &&
                  a.content_type.toLowerCase().startsWith("image/");
                const hasThumb = isImage && !!a.signedUrl;
                const isShared = sharedAttachmentIds.has(a.id);

                return (
                  <div
                    key={a.id}
                    className="rounded-lg border bg-gray-50 overflow-hidden"
                  >
                    {hasThumb ? (
                      <a href={a.signedUrl!} target="_blank" rel="noreferrer">
                        <img
                          src={a.signedUrl!}
                          alt={a.file_name}
                          className="w-full h-40 object-cover bg-black/5"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-40 flex items-center justify-center text-xs text-gray-500 bg-white/40">
                        {a.content_type ? a.content_type : "file"}
                      </div>
                    )}

                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {a.file_name}
                        </div>
                        <div className="text-xs text-gray-600">
                          {a.caption ? a.caption : "—"}
                        </div>

                        <button
                          type="button"
                          onClick={() => shareToContractor(a)}
                          disabled={isPending || sharingId === a.id || isShared}
                          className="mt-2 inline-flex min-h-11 items-center px-3 rounded-md border text-xs font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          {isShared
                            ? "Shared ✓"
                            : sharingId === a.id
                            ? "Sharing..."
                            : "Share to Contractor"}
                        </button>
                      </div>

                      {a.signedUrl ? (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-gray-50 transition whitespace-nowrap"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-500">
                          (no link)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Tests Entry Path: app/jobs/[id]/tests/page.tsx
```tsx
// app/jobs/[id]/tests/page
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markRefrigerantChargeExemptFromForm } from "@/lib/actions/job-actions";
import { resolveEccScenario } from "@/lib/ecc/scenario-resolver";
import Link from "next/link";
import PrintButton from "@/components/ui/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import EccLivePreview from "@/components/jobs/EccLivePreview";

import {
  completeEccTestRunFromForm,
  addEccTestRunFromForm,
  deleteEccTestRunFromForm,
  saveDuctLeakageDataFromForm,
  saveAirflowDataFromForm,
  saveRefrigerantChargeDataFromForm,
  saveEccTestOverrideFromForm,
  saveAndCompleteDuctLeakageFromForm,
  saveAndCompleteAirflowFromForm,
  saveAndCompleteRefrigerantChargeFromForm,
} from "@/lib/actions/job-actions";

import {
  getActiveManualAddTests,
  getTestDefinition,
  type EccTestType,
} from "@/lib/ecc/test-registry";
import {
  getRequiredTestsForSystem,
  normalizeProjectTypeToRuleProfile,
  isPackageSystem,
} from "@/lib/ecc/rule-profiles";
import { equipmentRoleLabel } from "@/lib/utils/equipment-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

function getEffectiveResultLabel(t: any) {
  if (t.override_pass === true) return "PASS (override)";
  if (t.override_pass === false) return "FAIL (override)";
  if (t.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (t.computed_pass === true) return "PASS";
  if (t.computed_pass === false) return "FAIL";
  return "Not computed";
}

function getEffectiveResultState(run: any): "pass" | "fail" | "unknown" {
  if (!run) return "unknown";
  if (run.override_pass === true) return "pass";
  if (run.override_pass === false) return "fail";
  if (run.computed_pass === true) return "pass";
  if (run.computed_pass === false) return "fail";
  return "unknown";
}

function getPrimaryEquipment(systemEquipment: any[]) {
  return (
    systemEquipment.find((eq) => eq.component_type?.startsWith("package")) ??
    systemEquipment.find((eq) => eq.equipment_role === "condenser") ??
    systemEquipment.find((eq) => eq.equipment_role === "air_handler") ??
    systemEquipment.find((eq) => eq.equipment_role === "furnace") ??
    systemEquipment[0] ??
    null
  );
}

function getTestDisplayLabel(testType: string, packageSystem: boolean) {
  const baseLabel = getTestDefinition(testType)?.shortLabel ?? testType;

  if (packageSystem && testType === "refrigerant_charge") {
    return `${baseLabel} — Not Required (Package Unit)`;
  }

  return baseLabel;
}

function getRequiredTestStatusForSystem(job: any, systemId: string, testType: EccTestType) {
  const run = pickRunForSystem(job, testType, systemId);
  const runDataKeys = run?.data && typeof run.data === "object" ? Object.keys(run.data).length : 0;

  if (!run) {
    return {
      state: "required" as const,
      label: "Required",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      run,
    };
  }

  if (run.override_pass === true) {
    return {
      state: "pass_override" as const,
      label: "Pass (override)",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      run,
    };
  }

  if (run.override_pass === false) {
    return {
      state: "fail_override" as const,
      label: "Fail (override)",
      tone: "border-red-200 bg-red-50 text-red-700",
      run,
    };
  }

  if (run.is_completed !== true) {
    return {
      state: runDataKeys > 0 ? ("saved" as const) : ("open" as const),
      label: runDataKeys > 0 ? "Saved" : "Open",
      tone:
        runDataKeys > 0
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-100 text-slate-700",
      run,
    };
  }

  if (run.computed_pass === true) {
    return {
      state: "pass" as const,
      label: "Pass",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      run,
    };
  }

  if (run.computed_pass === false) {
    return {
      state: "fail" as const,
      label: "Fail",
      tone: "border-red-200 bg-red-50 text-red-700",
      run,
    };
  }

  return {
    state: "unknown" as const,
    label: "Not computed",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    run,
  };
}

function pickRunForSystem(job: any, testType: string, systemId: string) {
  const runs = (job?.ecc_test_runs ?? []).filter(
    (r: any) => r.test_type === testType && String(r.system_id ?? "") === String(systemId)
  );

  // newest first
  runs.sort((a: any, b: any) => {
    const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bt - at;
  });

  // prefer an incomplete run if one exists
  const active = runs.find((r: any) => r.is_completed !== true);
  return active ?? runs[0] ?? null;
}

function pickLatestRunForSystem(job: any, testType: string, systemId: string) {
  const runs = (job?.ecc_test_runs ?? [])
    .filter(
      (r: any) => r.test_type === testType && String(r.system_id ?? "") === String(systemId)
    )
    .sort((a: any, b: any) => {
      const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
      const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
      return bt - at;
    });

  const completed = runs.find((r: any) => r.is_completed === true);
  return completed ?? runs[0] ?? null;
}

function fmtValue(value: unknown, unit?: string) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    const rendered = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit ? `${rendered} ${unit}` : rendered;
  }
  const rendered = String(value).trim();
  if (!rendered) return "—";
  return unit ? `${rendered} ${unit}` : rendered;
}

function fallbackText(value: unknown) {
  const rendered = String(value ?? "").trim();
  return rendered || "—";
}

function equipmentSummaryLine(eq: any) {
  const rawType = String(eq?.equipment_role ?? eq?.component_type ?? "").trim();
  const equipmentType = rawType ? equipmentRoleLabel(rawType) : "—";
  const model = fallbackText(eq?.model);
  const serial = fallbackText(eq?.serial);
  return `${equipmentType} | Model: ${model} | Serial: ${serial}`;
}

function canonicalId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function aggregateField(items: any[], getter: (item: any) => unknown) {
  const values = Array.from(
    new Set(
      items
        .map((item) => String(getter(item) ?? "").trim())
        .filter(Boolean)
    )
  );

  return values.length ? values.join("; ") : "—";
}

function normalizeToken(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function equipmentKindTokens(eq: any) {
  return [normalizeToken(eq?.equipment_role), normalizeToken(eq?.component_type)]
    .map((token) => token.replace(/[\s-]+/g, "_"))
    .filter(Boolean);
}

function isPackageEquipment(eq: any) {
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token === "package_unit" ||
      token === "pack_unit" ||
      token === "package_gas_electric" ||
      token === "package_heat_pump" ||
      token.includes("package")
  );
}

function isOutdoorEquipment(eq: any) {
  if (isPackageEquipment(eq)) return true;
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token.includes("outdoor") ||
      token.includes("condenser") ||
      token.includes("heat_pump") ||
      token.includes("heat pump") ||
      token.includes("compressor")
  );
}

function isIndoorEquipment(eq: any) {
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token.includes("indoor") ||
      token.includes("air_handler") ||
      token.includes("air handler") ||
      token.includes("furnace") ||
      token.includes("evaporator") ||
      token.includes("coil") ||
      token.includes("fan_coil") ||
      token.includes("fan coil")
  );
}

function exceptionReasonLabel(run: any) {
  const reason = String(run?.data?.charge_exempt_reason ?? "").trim().toLowerCase();
  if (reason === "package_unit") return "Package Unit";
  if (reason === "conditions_not_met") return "Weather";

  const overrideReason = String(run?.override_reason ?? "").toLowerCase();
  if (overrideReason.includes("package unit")) return "Package Unit";
  if (overrideReason.includes("weather") || overrideReason.includes("conditions not met")) return "Weather";

  return "—";
}

function includesFailure(computed: any, needle: string) {
  const failures = Array.isArray(computed?.failures) ? computed.failures : [];
  return failures.some((f: any) => String(f ?? "").toLowerCase().includes(needle.toLowerCase()));
}

function includesBlocked(computed: any, needle: string) {
  const blocked = Array.isArray(computed?.blocked) ? computed.blocked : [];
  return blocked.some((b: any) => String(b ?? "").toLowerCase().includes(needle.toLowerCase()));
}

function outdoorQualificationStatus(run: any) {
  const computed = run?.computed ?? {};
  if (includesBlocked(computed, "outdoor temp below")) {
    return "Not Qualified";
  }

  const outdoor = run?.data?.outdoor_temp_f;
  if (outdoor != null && outdoor !== "") {
    return "Qualified";
  }

  return "Unknown";
}

function refrigerantComplianceF(run: any) {
  const computed = run?.computed ?? {};
  if (includesBlocked(computed, "indoor temp below") || includesBlocked(computed, "outdoor temp below")) {
    return "Not compliant (temperature qualification not met)";
  }
  if (includesFailure(computed, "subcool")) {
    return "Not compliant (subcool outside allowed tolerance)";
  }

  const measured = computed?.measured_subcool_f;
  const target = run?.data?.target_subcool_f;
  if (measured != null && target != null) {
    return "Compliant (subcool within stored tolerance check)";
  }

  return "Insufficient data for compliance determination";
}

function refrigerantRequirementResultG(run: any) {
  const computed = run?.computed ?? {};
  if (includesFailure(computed, "superheat")) return "Failed ECC superheat requirement";

  const measured = computed?.measured_superheat_f;
  if (measured != null) return "Passed ECC superheat requirement";

  return "Insufficient data for ECC superheat requirement";
}

function refrigerantComplianceG(run: any) {
  const computed = run?.computed ?? {};
  if (includesFailure(computed, "superheat")) {
    return "Not compliant (superheat threshold exceeded)";
  }

  const measured = computed?.measured_superheat_f;
  if (measured != null) {
    return "Compliant (superheat within stored ECC threshold)";
  }

  return "Insufficient data for compliance determination";
}

export default async function JobTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ t?: string; s?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const focused = String(sp.t ?? "").trim();
  const selectedSystemIdFromQuery = String(sp.s ?? "").trim();
  const notice = String(sp.notice ?? "").trim();

  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      parent_job_id,
      job_address,
      city,
      job_type,
      project_type,
      permit_number,
      contractor_id,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      locations:location_id (
        address_line1,
        city,
        state,
        zip
      ),
      job_systems (
        id,
        name,
        created_at
      ),
      job_equipment (
        id,
        system_id,
        component_type,
        equipment_role,
        system_location,
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
        system_id,
        equipment_id,
        system_key,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at,
        is_completed,
        visit_id
      )
    `
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  if (!job) return notFound();

  const contractorId = String(job.contractor_id ?? "").trim();
  let contractorName = "—";

  if (contractorId) {
    const { data: contractor, error: contractorError } = await supabase
      .from("contractors")
      .select("name")
      .eq("id", contractorId)
      .maybeSingle();

    if (contractorError) throw contractorError;
    contractorName = fallbackText(contractor?.name);
  }

  const customerName =
    [job.customer_first_name, job.customer_last_name]
      .map((value: unknown) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ") || "—";

  const locationSnapshot = Array.isArray((job as any)?.locations)
    ? ((job as any).locations.find((row: any) => row) ?? null)
    : ((job as any)?.locations ?? null);
  const reportAddress =
    String(locationSnapshot?.address_line1 ?? "").trim() ||
    String(job.job_address ?? "").trim();
  const reportCityStateZip = [
    String(locationSnapshot?.city ?? "").trim() || String(job.city ?? "").trim(),
    [String(locationSnapshot?.state ?? "").trim(), String(locationSnapshot?.zip ?? "").trim()]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const projectTypeLabel = String(job.project_type ?? "")
    .trim()
    .replaceAll("_", " ");

  const systems = (job.job_systems ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const at = new Date(a?.created_at ?? 0).getTime();
      const bt = new Date(b?.created_at ?? 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    });

  const equipmentBySystemId = new Map<string, any[]>();
  for (const eq of job.job_equipment ?? []) {
    const sid = canonicalId(eq?.system_id);
    if (!sid) continue;
    const rows = equipmentBySystemId.get(sid) ?? [];
    rows.push(eq);
    equipmentBySystemId.set(sid, rows);
  }

  const selectedSystemId =
    selectedSystemIdFromQuery &&
    systems.some((sys: any) => String(sys.id) === String(selectedSystemIdFromQuery))
      ? selectedSystemIdFromQuery
      : systems.length
      ? String(systems[0].id)
      : "";

  const selectedSystemMeta = systems.find(
    (sys: any) => String(sys.id) === String(selectedSystemId)
  );
  const selectedSystemName = selectedSystemMeta?.name ?? "Selected system";

  const parentJobId = String((job as any)?.parent_job_id ?? "").trim();
  const isRetestChild = Boolean(parentJobId);

  const parentJob = isRetestChild
    ? (
        await supabase
          .from("jobs")
          .select(
            `
            id,
            title,
            job_systems (
              id,
              name,
              created_at
            ),
            ecc_test_runs (
              id,
              test_type,
              system_id,
              equipment_id,
              system_key,
              data,
              computed,
              computed_pass,
              override_pass,
              override_reason,
              created_at,
              updated_at,
              is_completed,
              visit_id
            )
          `
          )
          .eq("id", parentJobId)
          .maybeSingle()
      ).data
    : null;

  const parentSystems = (parentJob?.job_systems ?? []) as any[];
  const parentSystemIdByName = new Map<string, string>();
  for (const parentSystem of parentSystems) {
    const key = canonicalId(parentSystem?.name);
    const value = String(parentSystem?.id ?? "").trim();
    if (!key || !value || parentSystemIdByName.has(key)) continue;
    parentSystemIdByName.set(key, value);
  }

  const matchedParentSystemId = parentSystemIdByName.get(canonicalId(selectedSystemName)) ?? "";

  const pickParentRunForSelectedSystem = (testType: EccTestType) => {
    if (!parentJob || !matchedParentSystemId) return null;
    return pickLatestRunForSystem(parentJob, testType, matchedParentSystemId);
  };

  const parentRunDL = pickParentRunForSelectedSystem("duct_leakage");
  const parentRunAF = pickParentRunForSelectedSystem("airflow");
  const parentRunRC = pickParentRunForSelectedSystem("refrigerant_charge");

  const runDL = selectedSystemId ? pickRunForSystem(job, "duct_leakage", selectedSystemId) : null;
  const runAF = selectedSystemId ? pickRunForSystem(job, "airflow", selectedSystemId) : null;
  const runRC = selectedSystemId ? pickRunForSystem(job, "refrigerant_charge", selectedSystemId) : null;
  const ductSaveFormId = runDL ? `duct-save-${runDL.id}` : "";
  const ductOverrideFormId = runDL ? `duct-override-${runDL.id}` : "";
  const ductDeleteFormId = runDL ? `duct-delete-${runDL.id}` : "";
  const airflowSaveFormId = runAF ? `airflow-save-${runAF.id}` : "";
  const rcSaveFormId = runRC ? `rc-save-${runRC.id}` : "";

  const normalizedProfile = normalizeProjectTypeToRuleProfile(job.project_type);
  const manualAddTests = getActiveManualAddTests();
  const allowedFocusedTypes = new Set<string>([
    ...manualAddTests.map((t) => String(t.code)),
    "custom",
  ]);
  const focusedType = allowedFocusedTypes.has(focused)
    ? (focused as EccTestType | "custom")
    : "";

  const selectedSystemEquipment =
    equipmentBySystemId.get(canonicalId(selectedSystemId)) ?? [];

  const scenarioResult = resolveEccScenario({
  projectType: job.project_type,
  systemEquipment: selectedSystemEquipment,
});

  const suggestedTests = scenarioResult.suggestedTests;
  const scenarioCode = scenarioResult.scenario;
  const scenarioNotes = scenarioResult.notes;
  const isPlanDrivenNewConstruction = scenarioCode === "new_construction_plan_driven";

  const baselineRequiredTests = suggestedTests
    .filter((t) => t.required)
    .map((t) => t.testType);

  const parentRequiredOutcomes = new Map<EccTestType, "pass" | "fail" | "unknown">();
  for (const testType of baselineRequiredTests) {
    const parentRun = pickParentRunForSelectedSystem(testType as EccTestType);
    parentRequiredOutcomes.set(testType as EccTestType, getEffectiveResultState(parentRun));
  }

  const carriedForwardPassedTypes = isRetestChild
    ? baselineRequiredTests.filter(
        (testType) => parentRequiredOutcomes.get(testType as EccTestType) === "pass"
      )
    : [];

  const requiredTests = isRetestChild
    ? baselineRequiredTests.filter(
        (testType) => parentRequiredOutcomes.get(testType as EccTestType) !== "pass"
      )
    : baselineRequiredTests;

  const systemRunTestTypes = selectedSystemId
    ? Array.from(
        new Set(
          (job.ecc_test_runs ?? [])
            .filter((r: any) => String(r.system_id ?? "") === String(selectedSystemId))
            .map((r: any) => String(r.test_type ?? "").trim())
            .filter((testType) => Boolean(testType) && Boolean(getTestDefinition(testType)))
        )
      )
    : [];

  const visibleTestTypes = Array.from(
    new Set([...(requiredTests as string[]), ...systemRunTestTypes, ...carriedForwardPassedTypes])
  ) as EccTestType[];

  const focusedCustomTestType =
    focusedType &&
    focusedType !== "custom" &&
    focusedType !== "duct_leakage" &&
    focusedType !== "airflow" &&
    focusedType !== "refrigerant_charge"
      ? (focusedType as EccTestType)
      : null;

  const focusedCustomRun =
    selectedSystemId && focusedCustomTestType
      ? pickRunForSystem(job, focusedCustomTestType, selectedSystemId)
      : null;

  const packageSystem = isPackageSystem(selectedSystemEquipment);

const primaryEquipment =
  selectedSystemEquipment.find((eq: any) => isPackageEquipment(eq)) ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "condenser") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "air_handler") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "furnace") ??
  selectedSystemEquipment[0] ??
  null;

const fallbackTonnageEquipment =
  selectedSystemEquipment.find((eq: any) => eq?.tonnage != null && String(eq.tonnage).trim() !== "") ?? null;

const defaultSystemTonnage =
  primaryEquipment?.tonnage != null && primaryEquipment?.tonnage !== ""
    ? primaryEquipment.tonnage
    : fallbackTonnageEquipment?.tonnage != null && String(fallbackTonnageEquipment.tonnage).trim() !== ""
    ? fallbackTonnageEquipment.tonnage
    : "";

  const carriedForwardDL = !runDL && carriedForwardPassedTypes.includes("duct_leakage");
  const carriedForwardAF = !runAF && carriedForwardPassedTypes.includes("airflow");
  const carriedForwardRC = !runRC && carriedForwardPassedTypes.includes("refrigerant_charge");

  const parentFailedComparisonRows = (baselineRequiredTests as EccTestType[])
    .map((testType) => ({
      testType,
      run: pickParentRunForSelectedSystem(testType),
    }))
    .filter((row) => getEffectiveResultState(row.run) === "fail");

  const equipmentReferenceItems = selectedSystemEquipment
    .slice()
    .sort((a: any, b: any) => {
      const at = new Date(a?.created_at ?? 0).getTime();
      const bt = new Date(b?.created_at ?? 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    })
    .slice(0, 3);

  function effectiveResult(run: any): "pass" | "fail" | "unknown" {
    if (!run) return "unknown";
    if (run.override_pass === true) return "pass";
    if (run.override_pass === false) return "fail";
    if (run.computed_pass === true) return "pass";
    if (run.computed_pass === false) return "fail";
    return "unknown";
  }

  function statusLabel(run: any) {
    if (!run) return "Not added";
    if (run.is_completed === true) return "Completed";
    return "In progress";
  }

  const baseHref = `/jobs/${job.id}/tests`;
  const withS = (t?: string, s?: string) => {
    const q = new URLSearchParams();

    const sys = String((s ?? selectedSystemId) ?? "").trim();

    if (t) q.set("t", t);
    if (sys) q.set("s", sys); // ✅ only set if non-empty

    const qs = q.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const systemSummaries = systems.map((sys: any) => {
    const systemId = canonicalId(sys.id);
    const systemEquipment = (equipmentBySystemId.get(systemId) ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const at = new Date(a?.created_at ?? 0).getTime();
        const bt = new Date(b?.created_at ?? 0).getTime();
        if (at !== bt) return at - bt;
        return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
      });

    const runAirflow = pickLatestRunForSystem(job, "airflow", systemId);
    const runDuct = pickLatestRunForSystem(job, "duct_leakage", systemId);
    const runRefrigerant = pickLatestRunForSystem(job, "refrigerant_charge", systemId);

    const packageSystem = isPackageSystem(systemEquipment);
    const packageEquipment = systemEquipment.filter((eq: any) => isPackageEquipment(eq));

    const outdoorEquipment = systemEquipment.filter((eq: any) => isOutdoorEquipment(eq));
    const indoorEquipment = systemEquipment.filter((eq: any) => isIndoorEquipment(eq));
    const otherEquipment = packageSystem
      ? systemEquipment.filter((eq: any) => !isPackageEquipment(eq))
      : systemEquipment.filter((eq: any) => !isOutdoorEquipment(eq) && !isIndoorEquipment(eq));

    const systemLocations = Array.from(
      new Set(
        systemEquipment
          .map((eq: any) => String(eq?.system_location ?? "").trim())
          .filter(Boolean)
      )
    );

    return {
      systemId,
      systemName: String(sys.name ?? "System").trim() || "System",
      runAirflow,
      runDuct,
      runRefrigerant,
      packageSystem,
      packageEquipment,
      indoorEquipment,
      outdoorEquipment,
      otherEquipment,
      hasEquipment: systemEquipment.length > 0,
      systemLocationLabel: systemLocations.length ? systemLocations.join("; ") : "—",
    };
  });

    return (
      <div className="w-full min-w-0 overflow-x-hidden p-6 max-w-3xl space-y-4 print:max-w-none print:p-0">
          {notice === "rc_exempt_reason_required" && (
      <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Select <span className="font-semibold">Package unit</span> or{" "}
        <span className="font-semibold">Conditions not met</span> before marking
        refrigerant charge exempt.
      </div>
    )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="min-w-0">
          <div className="text-sm text-slate-700">Job Tests</div>
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <div className="text-sm text-slate-700">{job.city ?? "—"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="completion-report-toggle" className="cursor-pointer px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50">
            View Completion Report
          </label>
          <PrintButton className="px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50" />
          <Link href={`/jobs/${job.id}`} className="px-3 py-2 rounded border text-sm">
            ← Back to Job
          </Link>
        </div>
      </div>

      <input id="completion-report-toggle" type="checkbox" className="peer sr-only" />
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
        Completion report is collapsed by default to keep test entry focused.
        <label htmlFor="completion-report-toggle" className="ml-1 cursor-pointer font-medium text-slate-900 underline">
          Expand report
        </label>
      </div>

      <div className="hidden space-y-4 peer-checked:block print:block">
      <div className="hidden border-b border-slate-400 pb-2 print:block">
        <h1 className="text-lg font-bold text-slate-950">Compliance Matters Test Results</h1>
      </div>
      <section className="rounded-lg border border-slate-400 bg-white p-5 space-y-4 text-slate-900 print:rounded-none print:border-slate-500 print:p-3 print:space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950 print:text-base">Customer / Job Info</h2>
          <p className="text-sm text-slate-700 print:text-xs">Who and where for this CHEERS packet.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-x-6 print:gap-y-2">
          <div className="space-y-3 print:space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Customer Name</div>
              <div className="text-sm font-medium text-slate-950">{customerName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Address</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportAddress)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(job.customer_phone)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Email</div>
              <div className="text-sm font-medium text-slate-950 break-all">{fallbackText(job.customer_email)}</div>
            </div>
          </div>

          <div className="space-y-3 print:space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Contractor Attached To</div>
              <div className="text-sm font-medium text-slate-950">{contractorName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">City / State / ZIP</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportCityStateZip)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Permit Number</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(job.permit_number)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Jurisdiction</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText((job as any).jurisdiction)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Permit Date</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText((job as any).permit_date ? formatBusinessDateUS((job as any).permit_date) : null)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Project Type</div>
              <div className="text-sm font-medium capitalize text-slate-950">{fallbackText(projectTypeLabel)}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="cheers-fast-view" className="rounded-lg border border-slate-400 bg-slate-50 p-5 space-y-5 text-slate-900 print:border-0 print:bg-white print:p-0 print:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-950 print:text-base">Results</h2>
            <p className="text-sm text-slate-700 print:text-xs">Read-only summary from ECC canonical test data, grouped by system.</p>
          </div>
        </div>

        {systemSummaries.length === 0 ? (
          <div className="text-sm text-slate-700">No systems available yet.</div>
        ) : (
          <div className="space-y-5 print:space-y-4">
            {systemSummaries.map((sys, index) => {
              const rcData = sys.runRefrigerant?.data ?? {};
              const rcComputed = sys.runRefrigerant?.computed ?? {};
              const isRefrigerantException =
                Boolean(sys.runRefrigerant?.data?.charge_exempt) ||
                Boolean(sys.runRefrigerant?.data?.charge_exempt_reason) ||
                String(sys.runRefrigerant?.computed?.status ?? "").toLowerCase() === "exempt";
              const shouldForcePrintBreak =
                index > 0 && Boolean(sys.runRefrigerant) && !isRefrigerantException;

              return (
                <div key={sys.systemId} className={`break-inside-avoid rounded-md border border-slate-300 bg-white p-4 space-y-4 shadow-sm print:rounded-none print:border-slate-500 print:p-3 print:space-y-3 print:shadow-none ${shouldForcePrintBreak ? "print:break-before-page" : ""}`}>
                  <div className="text-sm font-bold text-slate-950 print:text-[13px]">{sys.systemName}</div>

                  <div className="grid gap-3 text-sm text-slate-900 print:gap-2 print:text-[12px]">
                    <div>
                      <span className="font-semibold text-slate-950">System:</span> {fallbackText(sys.systemLocationLabel)}
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Equipment Summary:</span>
                      {sys.hasEquipment ? (
                        <div className="mt-1 space-y-1 text-slate-800 print:text-slate-950">
                          {sys.packageSystem ? (
                            <>
                              <div className="font-semibold text-slate-900">Package Unit</div>
                              {sys.packageEquipment.length > 0 ? (
                                sys.packageEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `package-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-semibold text-slate-900">Condenser</div>
                              {sys.outdoorEquipment.length > 0 ? (
                                sys.outdoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `outdoor-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}

                              <div className="font-semibold text-slate-900 pt-1 print:pt-0.5">Indoor Equipment</div>
                              {sys.indoorEquipment.length > 0 ? (
                                sys.indoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `indoor-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}
                            </>
                          )}

                          {sys.otherEquipment.length > 0 ? (
                            <>
                              <div className="font-semibold text-slate-900 pt-1 print:pt-0.5">Other Equipment</div>
                              {sys.otherEquipment.map((eq: any, index: number) => (
                                <div key={String(eq?.id ?? `other-${sys.systemId}-${index}`)}>
                                  {index + 1}. {equipmentSummaryLine(eq)}
                                </div>
                              ))}
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-slate-900">Equipment not located</div>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Airflow Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        <div>Measured Airflow: {fmtValue(sys.runAirflow?.data?.measured_total_cfm, "CFM")}</div>
                        <div>Result: {sys.runAirflow ? getEffectiveResultLabel(sys.runAirflow) : "No run"}</div>
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Duct Leakage Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        <div>Entered duct leakage value: {fmtValue(sys.runDuct?.data?.measured_duct_leakage_cfm, "CFM")}</div>
                        <div>Result: {sys.runDuct ? getEffectiveResultLabel(sys.runDuct) : "No run"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-300 bg-slate-100 p-3 space-y-3 print:rounded-none print:border-slate-400 print:bg-white print:p-2.5 print:space-y-2">
                    <div className="text-sm font-bold text-slate-950 print:text-[13px]">Refrigerant Charge — Full Detailed Result</div>

                    {!sys.runRefrigerant ? (
                      <div className="text-sm text-slate-700 print:text-[12px]">No refrigerant charge run found for this system.</div>
                    ) : isRefrigerantException ? (
                      <div className="text-sm text-slate-800 space-y-1 print:text-[12px]">
                        <div>Result: Exception</div>
                        <div>Reason: {exceptionReasonLabel(sys.runRefrigerant)}</div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1 text-sm text-slate-900 print:text-[12px]">
                          <div className="font-semibold text-slate-950">F. Data Collection and Calculations</div>
                          <ol className="list-decimal pl-5 space-y-1">
                            <li>Lowest Return Air Dry Bulb Temperature: {fmtValue(rcData.lowest_return_air_db_f, "°F")}</li>
                            <li>Measured Condenser Air Entering Dry-Bulb Temperature: {fmtValue(rcData.condenser_air_entering_db_f, "°F")}</li>
                            <li>Outdoor Temperature Qualification Status: {outdoorQualificationStatus(sys.runRefrigerant)}</li>
                            <li>Measured Liquid Line Temperature: {fmtValue(rcData.liquid_line_temp_f, "°F")}</li>
                            <li>Measured Liquid Line Pressure: {fmtValue(rcData.liquid_line_pressure_psig, "psig")}</li>
                            <li>Condenser Saturation Temperature: {fmtValue(rcData.condenser_sat_temp_f, "°F")}</li>
                            <li>Measured Subcooling: {fmtValue(rcComputed.measured_subcool_f, "°F")}</li>
                            <li>Target Subcooling from Manufacturer: {fmtValue(rcData.target_subcool_f, "°F")}</li>
                            <li>Compliance Statement: {refrigerantComplianceF(sys.runRefrigerant)}</li>
                          </ol>
                        </div>

                        <div className="space-y-1 text-sm text-slate-900 print:text-[12px]">
                          <div className="font-semibold text-slate-950">G. Metering Device Verification</div>
                          <ol className="list-decimal pl-5 space-y-1">
                            <li>Measured Suction Line Temperature: {fmtValue(rcData.suction_line_temp_f, "°F")}</li>
                            <li>Measured Suction Line Pressure: {fmtValue(rcData.suction_line_pressure_psig, "psig")}</li>
                            <li>Evaporator Saturation Temperature: {fmtValue(rcData.evaporator_sat_temp_f, "°F")}</li>
                            <li>Measured Superheat: {fmtValue(rcComputed.measured_superheat_f, "°F")}</li>
                            <li>ECC requirement result: {refrigerantRequirementResultG(sys.runRefrigerant)}</li>
                            <li>Manufacturer specification statement: Superheat manufacturer target is not stored in canonical ECC run data; evaluation uses the configured ECC threshold in computed rules.</li>
                            <li>Compliance Statement: {refrigerantComplianceG(sys.runRefrigerant)}</li>
                          </ol>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      </div>

      <section className="min-w-0 rounded-lg border p-4 space-y-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">ECC Tests</h2>
          <p className="text-sm text-muted-foreground">
            Capture tests in any order. “Save” stores readings; “Complete” locks the test for the visit workflow.
          </p>
        </div>

        {/* System selector */}
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold mb-1 text-gray-900">Select Location</div>

          <div className="flex flex-wrap gap-2 pt-1">
            {systems.map((sys: any) => {
              const isActive = String(sys.id) === String(selectedSystemId);
              return (
                <Link
                  key={sys.id}
                  href={withS(focusedType || undefined, String(sys.id))}
                  className={`rounded-full border px-3 py-2 text-sm ${
                    isActive ? "bg-gray-900 text-white" : "bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {sys.name}
                </Link>
              );
            })}
          </div>

          {!systems.length ? (
            <div className="text-sm text-muted-foreground">
              No systems/locations exist yet. Add equipment on the Job Info page first (systems are created from
              locations).
            </div>
          ) : null}
        </div>
        {false && (
  <div className="rounded-lg border bg-white p-4">
        {/* Test pills */}
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-semibold mb-3 text-gray-900">ECC Tests</div>

          {!selectedSystemId ? (
            <div className="text-sm text-muted-foreground">Select a system to begin.</div>
          ) : (
            <div className="grid gap-2">
              {[
                { key: "duct_leakage", label: "Duct Leakage", run: runDL },
                { key: "airflow", label: "Airflow", run: runAF },
                { key: "refrigerant_charge", label: "Refrigerant Charge", run: runRC },
              ].map((x) => {
                const open = focusedType === x.key;
                const res = effectiveResult(x.run);
                const badge = res === "pass" ? "PASS" : res === "fail" ? "FAIL" : "—";

                const tone =
                  res === "pass"
                    ? "border-green-300 bg-green-50"
                    : res === "fail"
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 bg-white";

                return (
                  <Link
                    key={x.key}
                    href={open ? withS(undefined) : withS(x.key)}
                    className={`w-full rounded border px-4 py-3 flex items-center justify-between hover:bg-gray-50 ${
                      open ? "ring-2 ring-gray-300" : ""
                    } ${tone}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{x.label}</div>
                      <div className="text-xs text-muted-foreground">{statusLabel(x.run)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs rounded border bg-white px-2 py-1">{badge}</span>
                      <span className="text-xs">{x.run?.is_completed === true ? "✅" : ""}</span>
                      <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
                  </div>
)}

                {selectedSystemId ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Required and active tests</div>
                <div className="text-xs text-muted-foreground">
                  Unified lifecycle list for this system:{" "}
                  <span className="font-medium">
                    {normalizedProfile === "alteration"
                      ? "Alteration"
                      : normalizedProfile === "new_prescriptive"
                      ? "New Prescriptive"
                      : "Other / Custom"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {systems.find((s: any) => String(s.id) === String(selectedSystemId))?.name ?? "Selected system"}
              </div>
            </div>

            {visibleTestTypes.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {isPlanDrivenNewConstruction
                  ? "New Construction is currently plan-driven/custom. No default required tests are preloaded yet. Use Add Test to build the custom set."
                  : "No default required tests for this profile. Use Add Test to build the custom set."}
                <div className="text-xs text-muted-foreground">
                  Required for this project type:{" "}
                  <span className="font-medium">
                    {normalizedProfile === "alteration"
                      ? "Alteration"
                      : normalizedProfile === "new_prescriptive"
                      ? "New Prescriptive"
                      : "Other / Custom"}
                  </span>
                  {packageSystem ? (
                    <span> · Package system: refrigerant charge excluded</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleTestTypes.map((testType: EccTestType) => {
  const status = getRequiredTestStatusForSystem(job, selectedSystemId, testType);
  const parentRun = pickParentRunForSelectedSystem(testType);
  const parentOutcome = getEffectiveResultState(parentRun);
  const carriedForward = isRetestChild && !status.run && parentOutcome === "pass";
  const testHref = `/jobs/${job.id}/tests?s=${selectedSystemId}&t=${testType}`;
  const isRequired = requiredTests.includes(testType);

  return (
    <div
      key={testType}
      className="flex min-w-0 flex-col gap-3 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="font-medium">
          {getTestDisplayLabel(testType, packageSystem)}
          {carriedForward ? (
            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Carried Forward
            </span>
          ) : isRequired ? (
            <span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Required
            </span>
          ) : (
            <span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Added
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {carriedForward
            ? "Passed on parent visit; no retest entry required"
            : status.state === "required"
            ? "Required test is not started yet"
            : status.state === "open"
            ? "Run opened and ready for readings"
            : status.state === "saved"
            ? "Readings saved, waiting for completion"
            : status.state === "pass_override"
            ? "Completed with pass override"
            : status.state === "fail_override"
            ? "Completed with fail override"
            : status.state === "pass"
            ? "Completed and passed"
            : status.state === "fail"
            ? "Completed and failed"
            : "Tracked on this system"}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {carriedForward ? (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            No retest needed
          </span>
        ) : status.state === "required" ? (
          <form action={addEccTestRunFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="system_id" value={selectedSystemId} />
            <input type="hidden" name="test_type" value={testType} />
            <SubmitButton loadingText="Starting..." className="rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-50">
              Start Test
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={testHref}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            Open Workspace
          </Link>
        )}

        <div
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            carriedForward ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status.tone
          }`}
        >
          {carriedForward ? "Pass (parent)" : status.label}
        </div>
      </div>
    </div>
  );
})}
              </div>
            )}

            {isRetestChild && parentFailedComparisonRows.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-800">Parent Failed Results (Read-only)</div>
                {parentFailedComparisonRows.map((row) => (
                  <div key={`parent-failed-${row.testType}`} className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <div className="font-medium text-slate-900">{getTestDisplayLabel(row.testType, packageSystem)}</div>
                    <div>Result on parent: {getEffectiveResultLabel(row.run)}</div>
                    <div>
                      Updated: {row.run?.updated_at ? new Date(row.run.updated_at).toLocaleString() : "—"}
                    </div>
                    {row.run?.data?.notes ? (
                      <div className="break-words">Notes: {String(row.run.data.notes)}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {scenarioNotes.length > 0 ? (
              <div className="grid gap-2 pt-1">
                {scenarioNotes.map((note) => (
                  <div
                    key={note}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    {note}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Scenario: {scenarioCode.replaceAll("_", " ")}
            </div>
          </div>
        ) : null}

        {selectedSystemId ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Equipment Reference</div>
            <div className="text-sm font-medium text-slate-900">System: {selectedSystemName}</div>
            {equipmentReferenceItems.length > 0 ? (
              <div className="space-y-1 text-xs text-slate-700">
                {equipmentReferenceItems.map((eq: any, index: number) => (
                  <div key={String(eq?.id ?? `${selectedSystemId}-ref-${index}`)} className="break-words">
                    {equipmentSummaryLine(eq)}
                  </div>
                ))}
                {selectedSystemEquipment.length > equipmentReferenceItems.length ? (
                  <div className="text-slate-600">+{selectedSystemEquipment.length - equipmentReferenceItems.length} more item(s)</div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-slate-600">No equipment linked to this system yet.</div>
            )}
            <div className="text-xs text-slate-700">
              Suggested tonnage default: <span className="font-medium">{fmtValue(defaultSystemTonnage, "ton")}</span>
            </div>
          </div>
        ) : null}

        {/* Add Test panel */}
        {selectedSystemId && focusedType === "custom" ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="text-sm font-semibold">Add Test</div>

            <form action={addEccTestRunFromForm} className="grid gap-3">
              <input type="hidden" name="job_id" value={job.id} />

              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="system_id">
                  Location
                </label>

                <select
                  id="system_id"
                  name="system_id"
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue={selectedSystemId}
                  required
                >
                  <option value="" disabled>
                    Select location…
                  </option>

                  {systems.map((sys: any) => (
                    <option key={sys.id} value={sys.id}>
                      {sys.name}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-muted-foreground">
                  This ties the new test run to a specific system/location.
                </div>
              </div>

              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="test_type">
                  Test Type
                </label>
                <select
                  id="test_type"
                  name="test_type"
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Select a test
                  </option>

                  {manualAddTests.map((test) => (
                    <option key={test.code} value={test.code}>
                      {test.label}
                    </option>
                  ))}
                </select>
              </div>

              <SubmitButton loadingText="Adding..." className="w-fit rounded-md bg-black px-4 py-2 text-white">
                Add Test
              </SubmitButton>
            </form>
          </div>
        ) : null}

                {/* Add Test pill */}
        {selectedSystemId ? (
          <Link
            href={focusedType === "custom" ? withS(undefined) : withS("custom")}
            className={`w-full rounded px-4 py-3 flex items-center justify-between border ${
              focusedType === "custom"
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-900 hover:bg-gray-50"
            }`}
          >
            <div className="font-medium">Add Test</div>
            <span className="text-xs">{focusedType === "custom" ? "▲" : "▼"}</span>
          </Link>
        ) : (
          <div className="w-full rounded border px-4 py-3 text-sm text-muted-foreground">
            Select a system first to add tests.
          </div>
        )}

        {focusedCustomTestType ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  {getTestDisplayLabel(focusedCustomTestType, packageSystem)}
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {focusedCustomRun ? getEffectiveResultLabel(focusedCustomRun) : "Not started"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {focusedCustomRun?.updated_at
                  ? new Date(focusedCustomRun.updated_at).toLocaleString()
                  : null}
              </div>
            </div>

            {!focusedCustomRun ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value={focusedCustomTestType} />
                <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                  Create Run
                </SubmitButton>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2 items-center border-t pt-3">
                <form action={completeEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={focusedCustomRun.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded border text-sm"
                    disabled={!!focusedCustomRun.is_completed}
                  >
                    {focusedCustomRun.is_completed ? "Completed ✅" : "Complete Test"}
                  </button>
                </form>

                <form action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={focusedCustomRun.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm">
                    Delete
                  </button>
                </form>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              This ad hoc test is tracked for this system. Detailed data entry for this test type is not configured yet.
            </div>
          </div>
        ) : null}

        {/* =========================
            DUCT LEAKAGE
            ========================= */}
        {focusedType === "duct_leakage" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Duct Leakage</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runDL
                    ? getEffectiveResultLabel(runDL)
                    : carriedForwardDL
                    ? `PASS (carried from parent${parentRunDL ? ` · ${getEffectiveResultLabel(parentRunDL)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runDL?.updated_at ? new Date(runDL.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Suggested tonnage: {fmtValue(defaultSystemTonnage, "ton")}</div>
            </div>

            {!runDL ? (
              carriedForwardDL ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunDL)}
                    {parentRunDL?.updated_at ? ` · Updated ${new Date(parentRunDL.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="duct_leakage" />

                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Duct Leakage Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form
                  id={ductSaveFormId}
                  action={saveAndCompleteDuctLeakageFromForm}
                  className="grid gap-3 border-t pt-3"
                >
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runDL.id} />
                  <input type="hidden" name="project_type" value={job.project_type} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-ton-${runDL.id}`}>
                        System Tonnage (auto-filled from equipment if available)
                      </label>
                      <input
                        id={`dl-ton-${runDL.id}`}
                        name="tonnage"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.tonnage ?? defaultSystemTonnage}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-meas-${runDL.id}`}>
                        Measured Duct Leakage (CFM)
                      </label>
                      <input
                        id={`dl-meas-${runDL.id}`}
                        name="measured_duct_leakage_cfm"
                        type="number"
                        step="1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.measured_duct_leakage_cfm ?? ""}
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`dl-notes-${runDL.id}`}>
                        Notes (optional)
                      </label>
                      <input
                        id={`dl-notes-${runDL.id}`}
                        name="notes"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.notes ?? ""}
                      />
                    </div>
                  </div>
                </form>

                <EccLivePreview mode="duct_leakage" formId={ductSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="text-sm text-muted-foreground rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div>
                    Max Allowed: {runDL.computed?.max_leakage_cfm ?? "—"} CFM
                  </div>
                  <div>Measured: {runDL.data?.measured_duct_leakage_cfm ?? "—"} CFM</div>
                </div>

                <div className="text-sm font-semibold text-slate-900">Override (Optional)</div>
                <form
                  id={ductOverrideFormId}
                  action={saveEccTestOverrideFromForm}
                  className="grid gap-3 border-t pt-3"
                >
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runDL.id} />
                    <input type="hidden" name="system_id" value={selectedSystemId} />
                    <input type="hidden" name="test_type" value="duct_leakage" />



                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ovr-${runDL.id}`}>
                        Manual Override
                      </label>
                      <select
                        id={`ovr-${runDL.id}`}
                        name="override"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={
                          runDL.override_pass === true ? "pass" : runDL.override_pass === false ? "fail" : "none"
                        }
                      >
                        <option value="none">None</option>
                        <option value="pass">Smoke Test (Pass)</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ovr-reason-${runDL.id}`}>
                        Override Reason (required if override set)
                      </label>
                      <input
                        id={`ovr-reason-${runDL.id}`}
                        name="override_reason"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.override_reason ?? ""}
                        placeholder="Explain why you're overriding the computed result..."
                      />
                    </div>
                  </div>
                </form>

                <form id={ductDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runDL.id} />
                </form>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runDL.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={ductSaveFormId}
                    loadingText="Saving..."
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Save
                  </SubmitButton>
                  <SubmitButton
                    form={ductSaveFormId}
                    loadingText="Saving & completing..."
                    className="inline-flex min-h-10 items-center rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    {runDL.is_completed ? "Save Changes" : "Save & Complete Test"}
                  </SubmitButton>
                  <button
                    type="submit"
                    form={ductDeleteFormId}
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>

              </>
            )}
          </div>
        ) : null}

        {/* =========================
            AIRFLOW
            ========================= */}
        {focusedType === "airflow" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Airflow</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runAF
                    ? getEffectiveResultLabel(runAF)
                    : carriedForwardAF
                    ? `PASS (carried from parent${parentRunAF ? ` · ${getEffectiveResultLabel(parentRunAF)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runAF?.updated_at ? new Date(runAF.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Suggested tonnage: {fmtValue(defaultSystemTonnage, "ton")}</div>
            </div>

            {!runAF ? (
              carriedForwardAF ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunAF)}
                    {parentRunAF?.updated_at ? ` · Updated ${new Date(parentRunAF.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="airflow" />
                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Airflow Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
              <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
              <form
                id={airflowSaveFormId}
                action={saveAndCompleteAirflowFromForm}
                className="grid gap-3 border-t pt-3"
              >
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="test_run_id" value={runAF.id} />
                <input type="hidden" name="project_type" value={job.project_type} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-ton-${runAF.id}`}>
                      System Tonnage (auto-filled from equipment if available)
                    </label>
                    <input
                      id={`af-ton-${runAF.id}`}
                      name="tonnage"
                      type="number"
                      step="0.1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.tonnage ?? defaultSystemTonnage}
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-meas-${runAF.id}`}>
                      Measured Total Airflow (CFM)
                    </label>
                    <input
                      id={`af-meas-${runAF.id}`}
                      name="measured_total_cfm"
                      type="number"
                      step="1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.measured_total_cfm ?? ""}
                    />
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`af-notes-${runAF.id}`}>
                      Notes (optional)
                    </label>
                    <input
                      id={`af-notes-${runAF.id}`}
                      name="notes"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.notes ?? ""}
                    />
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <div className="text-sm font-semibold text-slate-900">Override (Optional)</div>
                    <div className="text-xs text-slate-600">Use only when manual pass override is required.</div>
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-override-${runAF.id}`}>
                      Airflow Override Pass
                    </label>
                    <select
                      id={`af-override-${runAF.id}`}
                      name="airflow_override_pass"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.override_pass === true ? "true" : "false"}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes — Mark as Pass</option>
                    </select>
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`af-override-reason-${runAF.id}`}>
                      Override Reason
                    </label>
                    <textarea
                      id={`af-override-reason-${runAF.id}`}
                      name="airflow_override_reason"
                      rows={3}
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.override_pass === true ? runAF.override_reason ?? "" : ""}
                      placeholder="Required only when override pass is used"
                    />
                  </div>
                </div>

                <SubmitButton loadingText="Saving & completing..." className="w-fit rounded-md bg-black px-4 py-2 text-white">
                  Save & Complete Test
                </SubmitButton>
              </form>

                <EccLivePreview mode="airflow" formId={airflowSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Required Total Airflow: {fmtValue(runAF.computed?.required_total_cfm, "CFM")}</div>
                  <div>Measured Total Airflow: {fmtValue(runAF.data?.measured_total_cfm, "CFM")}</div>
                </div>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runAF.is_completed && "✅ Test completed"}
                  </span>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runAF.id} />
                    <button type="submit" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50">
                      Delete
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            REFRIGERANT CHARGE
            ========================= */}
        {focusedType === "refrigerant_charge" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Refrigerant Charge</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runRC
                    ? getEffectiveResultLabel(runRC)
                    : carriedForwardRC
                    ? `PASS (carried from parent${parentRunRC ? ` · ${getEffectiveResultLabel(parentRunRC)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runRC?.updated_at ? new Date(runRC.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Refrigerant type on run: {fallbackText(runRC?.data?.refrigerant_type)}</div>
            </div>

            {!runRC ? (
              carriedForwardRC ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunRC)}
                    {parentRunRC?.updated_at ? ` · Updated ${new Date(parentRunRC.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="refrigerant_charge" />
                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Refrigerant Charge Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form
                  id={rcSaveFormId}
                  action={saveAndCompleteRefrigerantChargeFromForm}
                  className="grid gap-3 border-t pt-3"
                >
                  {/* ✅ critical: system_id must be included or server redirect can produce &s= */}
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runRC.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`lrdb-${runRC.id}`}>
                        Lowest Return Air Dry Bulb (°F)
                      </label>
                      <input
                        id={`lrdb-${runRC.id}`}
                        name="lowest_return_air_db_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.lowest_return_air_db_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tcondb-${runRC.id}`}>
                        Condenser Air Entering DB (°F)
                      </label>
                      <input
                        id={`tcondb-${runRC.id}`}
                        name="condenser_air_entering_db_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.condenser_air_entering_db_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`out-${runRC.id}`}>
                        Outdoor Temp (°F)
                      </label>
                      <input
                        id={`out-${runRC.id}`}
                        name="outdoor_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.outdoor_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ref-${runRC.id}`}>
                        Refrigerant Type
                      </label>
                      <select
                        id={`ref-${runRC.id}`}
                        name="refrigerant_type"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.refrigerant_type ?? ""}
                      >
                        <option value="">Select</option>
                        <option value="R-410A">R-410A</option>
                        <option value="R-32">R-32</option>
                        <option value="R-454B">R-454B</option>
                        <option value="R-22">R-22</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`llt-${runRC.id}`}>
                        Liquid Line Temp (°F)
                      </label>
                      <input
                        id={`llt-${runRC.id}`}
                        name="liquid_line_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.liquid_line_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`llp-${runRC.id}`}>
                        Liquid Line Pressure (psig)
                      </label>
                      <input
                        id={`llp-${runRC.id}`}
                        name="liquid_line_pressure_psig"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.liquid_line_pressure_psig ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tcsat-${runRC.id}`}>
                        Condenser Saturation Temp (°F)
                      </label>
                      <input
                        id={`tcsat-${runRC.id}`}
                        name="condenser_sat_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.condenser_sat_temp_f ?? ""}
                      />
                    </div>


                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tsc-${runRC.id}`}>
                        Target Subcool (°F)
                      </label>
                      <input
                        id={`tsc-${runRC.id}`}
                        name="target_subcool_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.target_subcool_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`suctt-${runRC.id}`}>
                        Suction Line Temp (°F)
                      </label>
                      <input
                        id={`suctt-${runRC.id}`}
                        name="suction_line_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.suction_line_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`suctp-${runRC.id}`}>
                        Suction Line Pressure (psig)
                      </label>
                      <input
                        id={`suctp-${runRC.id}`}
                        name="suction_line_pressure_psig"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.suction_line_pressure_psig ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tesat-${runRC.id}`}>
                        Evaporator Saturation Temp (°F)
                      </label>
                      <input
                        id={`tesat-${runRC.id}`}
                        name="evaporator_sat_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.evaporator_sat_temp_f ?? ""}
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        id={`fd-${runRC.id}`}
                        name="filter_drier_installed"
                        type="checkbox"
                        defaultChecked={!!runRC.data?.filter_drier_installed}
                      />
                      <label className="text-sm font-medium" htmlFor={`fd-${runRC.id}`}>
                        Filter drier installed
                      </label>
                    </div>
                  </div>

                  <SubmitButton loadingText="Saving & completing..." className="w-fit rounded-md bg-black px-4 py-2 text-white">
                    Save & Complete Test
                  </SubmitButton>
                </form>

                <EccLivePreview mode="refrigerant_charge" formId={rcSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Measured Subcool: {fmtValue(runRC.computed?.measured_subcool_f, "°F")}</div>
                  <div>Measured Superheat: {fmtValue(runRC.computed?.measured_superheat_f, "°F")}</div>
                  <div>Status: {fallbackText(runRC.computed?.status)}</div>
                </div>
                
                <div className="text-sm font-semibold text-slate-900">Override (Optional)</div>
                <form action={markRefrigerantChargeExemptFromForm} className="rounded-md border p-3 mt-3 sm:col-span-2">
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={runRC.id} />
  <input type="hidden" name="system_id" value={selectedSystemId} />

  <div className="text-sm font-semibold mb-2">Charge Verification Override (if applicable)</div>

  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      name="rc_exempt_package_unit"
      defaultChecked={runRC.data?.charge_exempt_reason === "package_unit"}
    />
    Package unit — charge verification not required
  </label>

  <label className="flex items-center gap-2 text-sm mt-2">
    <input
      type="checkbox"
      name="rc_exempt_conditions"
      defaultChecked={runRC.data?.charge_exempt_reason === "conditions_not_met"}
    />
    Conditions not met / weather — override charge verification
  </label>

  <div className="mt-2">
    <label className="block text-xs mb-1">Override details (optional)</label>
    <input
      name="rc_override_details"
      className="w-full rounded-md border px-3 py-2 text-sm"
      defaultValue={runRC.data?.charge_exempt_details ?? ""}
      placeholder='Example: "Outdoor temp 48°F" or "Rain / unsafe roof access"'
    />
  </div>

  <div className="mt-3">
    <SubmitButton loadingText="Saving..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
      Mark Exempt (Pass)
    </SubmitButton>
  </div>
</form>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runRC.is_completed && "✅ Test completed"}
                  </span>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runRC.id} />
                    <button type="submit" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50">
                      Delete
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

```
