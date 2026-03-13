// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import { archiveJobFromForm } from "@/lib/actions/job-actions";
import {
  getContractors,
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

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
  releasePendingInfoAndRecomputeFromForm,
  markJobFieldCompleteFromForm,
  markCertsCompleteFromForm,
  markInvoiceCompleteFromForm,
  resolveFailureByCorrectionReviewFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

import ServiceStatusActions from "./_components/ServiceStatusActions";
import { displayDateLA } from "@/lib/utils/schedule-la";
import { JobFieldActionButton } from "./_components/JobFieldActionButton";

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

function getEventFileSummary(meta?: any) {
  if (!meta) return "";
  if (Array.isArray(meta.file_names) && meta.file_names.length > 0) {
    if (meta.file_names.length > 5) {
      return `${meta.file_names.slice(0, 5).join(", ")} + ${meta.file_names.length - 5} more`;
    }
    return meta.file_names.join(", ");
  }
  if (typeof meta.file_name === "string" && meta.file_name.trim()) {
    return meta.file_name.trim();
  }
  return "";
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

  const showEccNotice = notice === "ecc_test_required";

  const supabase = await createClient();
  const contractors = await getContractors();

    const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cu } = await supabase
    .from("contractor_users")
    .select("user_id")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const isContractorUser = !!cu;

  if (isContractorUser) {
    redirect(`/portal/jobs/${jobId}`);
  }

  const isInternalUser = !isContractorUser;

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
  .select("created_at, event_type, message, meta, user_id")
  .in("job_id", timelineJobIds.length ? timelineJobIds : [jobId])
  .order("created_at", { ascending: false })
  .limit(200);
if (tlErr) throw new Error(tlErr.message);

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

  return (
    <div className="p-6 max-w-3xl">

<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
    <Link
      href="/ops"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 font-medium text-gray-900 hover:bg-gray-50"
    >
      ← Back to Ops
    </Link>

    <span className="hidden sm:inline text-gray-500">/</span>

    {job.customer_id ? (
      <Link
        href={`/customers/${job.customer_id}`}
        className="hover:underline"
      >
        {customerName}
      </Link>
    ) : (
      <span>{customerName}</span>
    )}

    <span className="text-gray-400">/</span>

    <span className="font-medium text-gray-200">{job.title}</span>
  </div>

  <div className="flex flex-wrap items-center gap-2">
    <Link
      href="/calendar"
      className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
    >
      Calendar
    </Link>
  </div>
</div>
      {/* Header */}

      {/* Always-visible Top Actions */}

      {/* Closeout Actions (Internal Only) */}
    {showCloseoutRow && (
  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium text-gray-700">Closeout</div>

      <div className="flex items-center gap-2">
        {/* ECC only: Certs */}
          {canShowCertsButton && (
            <form action={markCertsCompleteFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                ✓ Certs Complete
              </button>
            </form>
          )}

        {canShowInvoiceButton && (
          <form action={markInvoiceCompleteFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              ✓ Invoice Complete
            </button>
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

      {sp?.banner === "customer_reused" && (
        <FlashBanner
          type="warning"
          message="Existing customer matched by phone — reused (no duplicate created)."
        />
      )}

      {sp?.banner === "customer_created" && (
        <FlashBanner
          type="success"
          message="New customer created and linked to this job."
        />
      )}

      {/* Job Header */}
        <div className="mb-4 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {job.title}
          </h1>

          <p className="text-sm text-gray-400 break-words">
            {serviceAddressDisplay}
          </p>
        </div>

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
          : ops === "scheduled"
            ? {
                title: "Job Completed — Awaiting Admin Closeout",
                body: "Field work is complete. This job will remain visible until paperwork and billing are finished.",
              }
          : ops === "need_to_schedule"
            ? {
                title: "Job completed — but still in Need to Schedule",
                body: "This job is marked completed, but ops status indicates scheduling is still needed. Review status flow.",
              }
          : {
              title: "Job completed — but compliance is not fully resolved",
              body: "Complete remaining ECC items (tests, paperwork, invoice/cert) to fully close out the job.",
            };
                    
      return (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 mt-3">
          <div className="text-sm font-semibold">{meta.title}</div>
          <div className="mt-1 text-sm">
            Current Ops Status: <span className="font-medium">{ops}</span>. {meta.body}
          </div>
        </div>
      );
    })() : null}

      {/* Control Bar: Tabs + Field Workflow */}
      <div className="mb-6 flex items-center justify-between">

        {/* Tabs */}
        <div className="flex items-center gap-2">
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

        {/* Field Workflow */}
        <div className="flex items-center">
          {!isFieldComplete ? (
            <JobFieldActionButton
              jobId={job.id}
              currentStatus={job.status}
              tab={tab}
              hasFullSchedule={hasFullSchedule}
            />
          ) : (
            <span className="inline-flex h-10 items-center rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white shadow-sm">
              ✓ Field Complete
            </span>
          )}
        </div>

      </div>

          {/* Tab-aware job context */}
     
          {tab === "info" ? (
          <div className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Job Overview</div>
                <div className="text-xs text-gray-500">
                  Core service, scheduling, and customer details.
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
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {customerName || "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Phone</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {customerPhone}
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

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Address</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 break-words">
                  {serviceAddressDisplay || "—"}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Scheduled</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {job.scheduled_date ? displayDateLA(String(job.scheduled_date)) : "—"}
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
                  className="rounded bg-gray-900 px-3 py-1 text-white"
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

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                    >
                      Save contractor
                    </button>
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

              <ServiceStatusActions jobId={jobId} />
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

            {job.job_notes ? (
              <div className="mt-5 border-t pt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Job Notes
                </div>
                <div className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                  {job.job_notes}
                </div>
              </div>
            ) : null}

            <div className="mt-6 rounded-lg border border-red-200 bg-white p-4 space-y-2">
              <div className="font-semibold text-red-700">Danger zone</div>
              <div className="text-sm text-gray-600">
                Archive hides this job across Ops, portal, and searches. This can be undone later (by clearing deleted_at).
              </div>

              <form action={archiveJobFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Archive Job
                </button>
              </form>
            </div>
          </div>
        ) : (

        <div className="mb-4 text-sm text-gray-300">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2">
            <div>
              <span className="text-gray-500">Field:</span>{" "}
              <span className="font-medium text-white">{formatStatus(job.status)}</span>
            </div>

            <div>
              <span className="text-gray-500">Ops:</span>{" "}
              <span className="font-medium text-white">
                {formatOpsStatusLabel(job.ops_status)}
              </span>
            </div>

            {customerName ? (
              <div>
                <span className="text-gray-500">Customer:</span>{" "}
                <span className="font-medium text-white">{customerName}</span>
              </div>
            ) : null}

            {job.scheduled_date ? (
              <div>
                <span className="text-gray-500">Scheduled:</span>{" "}
                <span className="font-medium text-white">
                  {displayDateLA(String(job.scheduled_date))}
                </span>
              </div>
            ) : null}

            {contractorName && contractorName !== "—" ? (
              <div>
                <span className="text-gray-500">Contractor:</span>{" "}
                <span className="font-medium text-white">{contractorName}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}


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
    
      <button
        type="submit"
        className="px-3 py-2 rounded border text-sm bg-black text-white"
      >
        Mark Data Entry Complete
      </button>
    </form>
  </div>
) : null}


    {/* Equipment */}
    <section className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Equipment</div>
          <div className="text-xs text-gray-500">
            Capture and review equipment tied to this job.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Status
        </div>
        <div className="mt-1 text-sm font-semibold text-gray-900">
          {job.job_equipment?.length
            ? `${job.job_equipment.length} item(s) captured`
            : "No equipment captured yet."}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${job.id}/info?f=equipment`}
          className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Capture Equipment
        </Link>
      </div>
    </section>

    {/* Tests */}
    <section className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Tests</div>
          <div className="text-xs text-gray-500">
            Capture and review ECC test results for this job.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Status
        </div>
        <div className="mt-1 text-sm font-semibold text-gray-900">
          {job.ecc_test_runs?.length
            ? `${job.ecc_test_runs.length} test run(s) recorded`
            : "No tests recorded yet."}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${job.id}/tests`}
          className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Go to Tests
        </Link>
      </div>
    </section>

    {/* Scheduling */}
    <div className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Scheduling</div>
          <div className="text-xs text-gray-500">
            Set date, arrival window, and permit info.
          </div>
        </div>
      </div>

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
          <button
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            type="submit"
          >
            Save Scheduling
          </button>

          <Link
            href="/ops"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Back to Ops
          </Link>
        </div>
      </form>
    </div>

        </>
      )}

      {/* TAB: OPS */}
      {tab === "ops" && (
        <>
          {/* Job Status (ops_status) */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Job Status</div>

  <form action={updateJobOpsFromForm} className="flex gap-2 items-end">
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

          <button className="px-3 py-2 rounded bg-black text-white text-sm" type="submit">
            Save
          </button>
        </form>

        {String(job.ops_status ?? "").toLowerCase() === "pending_info" ? (
          <form action={releasePendingInfoAndRecomputeFromForm} className="mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <button className="px-3 py-2 rounded border text-sm" type="submit">
              Release Pending Info
            </button>
          </form>
        ) : null}
      </div>

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
                          Open
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
        className="px-3 py-2 rounded bg-black text-white text-sm"
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
        className="px-3 py-2 rounded bg-black text-white text-sm"
      >
        Resolve Failure by Correction Review
      </button>
    </form>
  </div>
)}

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
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
      >
        Save shared note
      </button>
    </div>
  </form>

  <div className="space-y-3">
    {sharedNotes.length ? (
      sharedNotes.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);
        const fileSummary = getEventFileSummary(meta);

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
              {formatTimelineEvent(type, meta)}
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                {noteText}
              </div>
            ) : null}

            {fileSummary ? (
              <div className="mt-2 text-xs text-gray-600">
                Files: {fileSummary}
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
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
      >
        Save internal note
      </button>
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
<JobAttachmentsInternal
  jobId={job.id}
  initialItems={attachmentItems}
/>

{/* Timeline */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Timeline</div>

  <div className="space-y-2">
    {(timelineEvents ?? []).length ? (
      (timelineEvents ?? []).map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);
        const fileSummary = getEventFileSummary(meta);

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
          <div key={idx} className="rounded border p-3 text-sm bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-gray-600">{when}</div>
              <div className="text-xs text-gray-500">{icon}</div>
            </div>

            <div className="mt-2 font-medium">
              {formatTimelineEvent(type, meta, e?.message)}
            </div>

            {(type === "contractor_note" ||
              type === "public_note" ||
              type === "internal_note" ||
              type === "contractor_correction_submission") && noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                {noteText}
              </div>
            ) : null}

            {(type === "contractor_note" ||
              type === "public_note" ||
              type === "internal_note" ||
              type === "contractor_correction_submission") && fileSummary ? (
              <div className="mt-2 text-xs text-gray-600">
                Files: {fileSummary}
              </div>
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
      })
    ) : (
      <div className="text-sm text-gray-600">No timeline events yet.</div>
    )}
  </div>
</div>

          {/* Follow Up */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
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

              <button className="px-3 py-2 rounded bg-black text-white text-sm w-fit" type="submit">
                Save Follow Up
              </button>
            </form>
          </div>

          {/* Customer Follow-up Attempts */}
          {job.ops_status === "need_to_schedule" ? (
            <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
              <div className="text-sm font-semibold mb-2">Customer Follow-Up</div>

              <div className="text-xs text-gray-600 mb-3">
                Attempts: <span className="font-medium">{attemptCount}</span> • Last:{" "}
                <span className="font-medium">{lastAttemptLabel}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />

                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="no_answer" />
                  <SubmitButton className="px-3 py-2 rounded border text-sm">
                    Log Call (No Answer)
                  </SubmitButton>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />

                  <input type="hidden" name="method" value="text" />
                  <input type="hidden" name="result" value="sent" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Text (Sent)
                  </button>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="spoke" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Call (Spoke)
                  </button>
                  
                </form>
              </div>

              <div className="space-y-2">
                {last3Attempts.map((a: any, idx: number) => {
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
    <div key={idx} className="rounded border p-3 text-sm bg-white">
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
})}
              </div>
            </div>
          ) : null}
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
