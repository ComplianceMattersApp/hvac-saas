import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
  getInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalAttachmentJobForMutation } from "@/lib/auth/internal-attachment-scope";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";

import JobAttachmentsInternal from "../_components/JobAttachmentsInternal";

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

function formatAppointmentDate(value?: string | null) {
  if (!value) return "No appointment scheduled";
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatAppointmentTime(start?: string | null, end?: string | null, hasDate?: boolean) {
  if (start && end) return `${formatTimeDisplay(start)}-${formatTimeDisplay(end)}`;
  if (start) return `Starts ${formatTimeDisplay(start)}`;
  if (end) return `Ends ${formatTimeDisplay(end)}`;
  return hasDate ? "Time window TBD" : "No time window set";
}

function formatStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Unknown";

  const mapped: Record<string, string> = {
    open: "Open",
    on_the_way: "On The Way",
    in_process: "In Process",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  return mapped[normalized] ?? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOpsStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "No ops status";

  const mapped: Record<string, string> = {
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

  return mapped[normalized] ?? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatJobTypeLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Service";
  if (normalized === "ecc") return "ECC";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function JobAttachmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;

  if (!jobId) {
    throw new Error("Missing route param: id");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const internalUserData = await getInternalUser({ supabase, userId: user.id });

  if (!internalUserData) {
    const { data: contractorUser, error: contractorError } = await supabase
      .from("contractor_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (contractorError) throw contractorError;

    if (contractorUser) {
      redirect(`/portal/jobs/${jobId}`);
    }

    redirect("/login");
  }

  // Explicit same-account internal scoped-job preflight: deny before any attachment read or signed URL generation
  const scopedJob = await loadScopedInternalAttachmentJobForMutation({
    accountOwnerUserId: internalUserData.account_owner_user_id,
    jobId,
    select: "id, title, city, job_address, customer_first_name, customer_last_name, scheduled_date, window_start, window_end, job_type, status, ops_status",
  });

  if (!scopedJob?.id) {
    // Cross-account or job not found: deny before any attachment row read or signed URL generation
    return notFound();
  }

  const job = scopedJob;

  const { data: attachmentRows, error: attachmentErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (attachmentErr) throw new Error(attachmentErr.message);

  const attachmentAdmin = createAdminClient();

  const attachmentItems = await Promise.all(
    (attachmentRows ?? []).map(async (attachment: any) => {
      const bucket = String(attachment?.bucket ?? "").trim();
      const storagePath = String(attachment?.storage_path ?? "")
        .trim()
        .replace(/^\/+/, "");
      const contentType =
        typeof attachment?.content_type === "string" &&
        attachment.content_type.trim().length > 0
          ? attachment.content_type.trim()
          : null;

      let signedUrl: string | null = null;

      if (!bucket || !storagePath) {
        console.warn("Job attachment row missing bucket/storage_path", {
          jobId,
          attachmentId: String(attachment?.id ?? "").trim() || null,
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
            attachmentId: String(attachment?.id ?? "").trim() || null,
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
        ...attachment,
        bucket,
        storage_path: storagePath,
        content_type: contentType,
        signedUrl,
      };
    })
  );

  const customerName =
    [job.customer_first_name, job.customer_last_name]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ") || "Customer not set";

  const addressSummary = [job.job_address, job.city]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ") || "No service address set";

  const appointmentDateLabel = formatAppointmentDate(job.scheduled_date);
  const appointmentTimeLabel = formatAppointmentTime(
    job.window_start,
    job.window_end,
    !!job.scheduled_date
  );
  const jobTypeLabel = formatJobTypeLabel(job.job_type);
  const statusLabel = formatStatusLabel(job.status);
  const opsStatusLabel = formatOpsStatusLabel(job.ops_status);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Job Attachment Library
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-500">{customerName}</div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {normalizeRetestLinkedJobTitle(job.title) || `Job ${job.id}`}
            </h1>
            <div className="text-sm text-slate-600">
              {jobTypeLabel} • {addressSummary}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              Status: {statusLabel}
            </span>
            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
              Ops: {opsStatusLabel}
            </span>
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {attachmentItems.length} attachment{attachmentItems.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
        >
          Back to Job
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Service Location
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800">{addressSummary}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Appointment
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800">{appointmentDateLabel}</div>
          <div className="mt-1 text-sm text-slate-600">{appointmentTimeLabel}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
        Full attachment library for this job. Use Back to Job to return to the main workspace.
      </div>

      <JobAttachmentsInternal jobId={job.id} initialItems={attachmentItems} />
    </div>
  );
}