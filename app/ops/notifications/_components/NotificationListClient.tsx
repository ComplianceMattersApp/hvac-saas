"use client";

import type { NotificationRowForUI, ProposalEnrichment, JobEnrichment } from "@/lib/actions/notification-read-actions";
import {
  isContractorUpdateNotificationType,
} from "@/lib/notifications/internal-awareness";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";

type NotificationListClientProps = {
  notifications: NotificationRowForUI[];
  pendingReadId?: string | null;
  onMarkAsRead: (notificationId: string) => Promise<void>;
};

function isProposalNotificationType(value: string | null | undefined): boolean {
  const type = String(value ?? "").trim().toLowerCase();
  return (
    type === "contractor_intake_proposal_submitted" ||
    type === "internal_contractor_intake_proposal_email"
  );
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function proposalIdFromPayload(value: unknown): string | null {
  const payload = normalizePayload(value);
  const candidates = [
    payload.contractor_intake_submission_id,
    payload.contractorIntakeSubmissionId,
    payload.submission_id,
  ];

  for (const candidate of candidates) {
    const id = String(candidate ?? "").trim();
    if (id) return id;
  }

  return null;
}

function jobIdFromNotification(notif: NotificationRowForUI): string | null {
  const fromRow = String(notif.job_id ?? "").trim();
  if (fromRow) return fromRow;

  const payload = normalizePayload(notif.payload);
  const candidates = [payload.job_id, payload.jobId];

  for (const candidate of candidates) {
    const id = String(candidate ?? "").trim();
    if (id) return id;
  }

  return null;
}

function formatSubmittedAt(value: string) {
  const submittedAt = new Date(value);
  if (!Number.isFinite(submittedAt.getTime())) return null;
  return format(submittedAt, "MMM d, yyyy h:mm a");
}

const JOB_AWARE_EVENT_HEADLINES: Record<string, string> = {
  contractor_note: "Contractor note added",
  contractor_correction_submission: "Correction submission received",
  contractor_schedule_updated: "Contractor scheduling updated",
  contractor_job_created: "New contractor job submitted",
  retest_ready_requested: "Retest ready requested",
  internal_note_tag: "You were mentioned in an internal note",
  internal_job_assigned: "You were assigned to a job",
};

const JOB_AWARE_EVENT_HELPER_TEXT: Record<string, string> = {
  contractor_note: "Review contractor note and update next action if needed.",
  contractor_correction_submission: "Review submitted corrections and confirm disposition.",
  contractor_schedule_updated: "Confirm scheduling details and update dispatch plan.",
  contractor_job_created: "Review the submitted request and schedule next steps.",
  retest_ready_requested: "Confirm retest readiness and schedule follow-up.",
  internal_note_tag: "Open the job to review the internal note.",
  internal_job_assigned: "Open the job to review dispatch details and next steps.",
};

function isGenericContractorBody(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    "a contractor added a note.",
    "a contractor submitted corrections for review.",
    "a contractor submitted scheduling data with a new job.",
    "a contractor submitted a new job that needs internal review and scheduling.",
    "contractor requested retest readiness review.",
  ].includes(normalized);
}

function notificationTypeLabel(value?: string | null) {
  const key = String(value ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    contractor_report_sent: "Contractor Report Sent",
    retest_ready_requested: "Retest Ready Requested",
    contractor_job_created: "Contractor Job Submitted",
    contractor_note: "Contractor Note",
    contractor_correction_submission: "Correction Submission",
    contractor_schedule_updated: "Contractor Schedule Updated",
    internal_note_tag: "Internal Note Mention",
    internal_job_assigned: "Job Assigned",
    contractor_intake_proposal_submitted: "Intake Proposal",
    contractor_report_email: "Contractor Report Email",
    customer_job_scheduled_email: "Customer Scheduled Email",
    contractor_job_scheduled_email: "Contractor Scheduled Email",
    internal_contractor_job_intake_email: "Internal Intake Email",
    internal_contractor_intake_proposal_email: "Intake Proposal",
  };
  return labels[key] ?? "Notification";
}

// ---------------------------------------------------------------------------
// Job-aware notification card — event-type-driven headline, supporting context
// ---------------------------------------------------------------------------

type JobAwareNotificationCardProps = {
  notif: NotificationRowForUI;
  pendingReadId: string | null;
  onMarkAsRead: (id: string) => Promise<void>;
};

function isJobAwareNotificationType(value?: string | null) {
  const type = String(value ?? "").trim().toLowerCase();
  return Boolean(JOB_AWARE_EVENT_HEADLINES[type]);
}

function JobAwareNotificationCard({
  notif,
  pendingReadId,
  onMarkAsRead,
}: JobAwareNotificationCardProps) {
  const type = String(notif.notification_type ?? "").trim().toLowerCase();
  const headline =
    JOB_AWARE_EVENT_HEADLINES[type] ??
    notificationTypeLabel(notif.notification_type);
  const helperText = JOB_AWARE_EVENT_HELPER_TEXT[type] ?? null;
  const jobId = jobIdFromNotification(notif);
  const jobHref =
    jobId && type === "internal_note_tag"
      ? `/jobs/${jobId}?tab=ops#internal-notes`
      : jobId && type === "internal_job_assigned"
      ? `/jobs/${jobId}?tab=ops`
      : jobId
      ? `/jobs/${jobId}`
      : null;

  // Body text is shown only as a small secondary preview, not as the main message
  const rawBodyPreview = notif.body
    ? notif.body.length > 120
      ? notif.body.slice(0, 120) + "\u2026"
      : notif.body
    : null;
  const bodyPreview =
    type !== "internal_note_tag" &&
    rawBodyPreview &&
    rawBodyPreview.trim() !== helperText?.trim() &&
    !isGenericContractorBody(rawBodyPreview)
      ? rawBodyPreview
      : null;

  const jobEnrichment = notif.job_enrichment ?? null;
  const identityLine = [
    jobEnrichment?.customer_name,
    jobEnrichment?.contractor_name,
    jobEnrichment?.city,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-white transition ${
        notif.is_unread ? "border-blue-200 shadow-sm" : "border-slate-200 opacity-80"
      }`}
    >
      {notif.is_unread && (
        <div className="absolute left-0 top-0 h-full w-[3px] bg-blue-500" aria-hidden="true" />
      )}

      <div className={`flex items-start justify-between gap-4 px-4 py-3.5 ${notif.is_unread ? "pl-5" : ""}`}>
        <div className="min-w-0 flex-1">
          {/* Headline row: event type drives the copy */}
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h3
              className={`text-sm font-semibold leading-snug ${
                notif.is_unread ? "text-slate-900" : "text-slate-600"
              }`}
            >
              {headline}
            </h3>
            {notif.is_unread && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                New
              </span>
            )}
          </div>

          {jobEnrichment?.job_title && (
            <p className="mb-1 text-sm font-medium text-slate-800">{jobEnrichment.job_title}</p>
          )}
          {identityLine && (
            <p className="mb-2 text-[13px] text-slate-500">{identityLine}</p>
          )}

          {/* Secondary preview: restrained, not the main message */}
          {helperText && (
            <p className="mb-1.5 text-[13px] text-slate-500">
              {helperText}
            </p>
          )}
          {bodyPreview && (
            <p className="mb-2 text-[13px] italic text-slate-400">
              {bodyPreview}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {notificationTypeLabel(notif.notification_type)}
            </span>
            <span className="text-[12px] text-slate-400">
              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {jobHref && (
            <Link
              href={jobHref}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {type === "internal_note_tag" ? "Open job" : "View job"}
            </Link>
          )}
          {notif.is_unread && (
            <button
              onClick={() => void onMarkAsRead(notif.id)}
              disabled={pendingReadId === notif.id}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingReadId === notif.id ? "Saving..." : "Mark read"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal card — enriched, premium layout
// ---------------------------------------------------------------------------

type ProposalCardProps = {
  notif: NotificationRowForUI;
  enrichment: ProposalEnrichment | null | undefined;
  proposalId: string | null;
  pendingReadId: string | null;
  onMarkAsRead: (id: string) => Promise<void>;
};

function ProposalCard({
  notif,
  enrichment,
  proposalId,
  pendingReadId,
  onMarkAsRead,
}: ProposalCardProps) {
  const contractorName = String(enrichment?.contractor_name ?? "").trim();
  const customerName = String(enrichment?.customer_name ?? "").trim() || "Customer not provided";
  const locationSummary =
    String(enrichment?.location_nickname ?? "").trim() ||
    String(enrichment?.address_summary ?? "").trim() ||
    "Location not provided";
  const requestSummary =
    [enrichment?.job_type_label, enrichment?.project_type_label]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" / ") || "Contractor-submitted work request";
  const headline = contractorName
    ? `New proposal from ${contractorName}`
    : "New intake proposal awaiting review";

  const submittedAtLabel = formatSubmittedAt(notif.created_at);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white transition ${
        notif.is_unread
          ? "border-blue-200 shadow-sm shadow-blue-50"
          : "border-slate-200 opacity-75"
      }`}
    >
      {notif.is_unread && (
        <div className="absolute left-0 top-0 h-full w-[3px] bg-blue-500" aria-hidden="true" />
      )}

      <div className={`flex items-start justify-between gap-4 px-5 py-4 ${notif.is_unread ? "pl-6" : ""}`}>
        {/* ── Left column ── */}
        <div className="min-w-0 flex-1">

          {/* Headline row */}
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className={`text-[15px] font-semibold leading-snug tracking-tight ${notif.is_unread ? "text-slate-900" : "text-slate-600"}`}>
              {headline}
            </h3>
            {notif.is_unread && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-blue-700">
                New
              </span>
            )}
          </div>

          {/* Key context block */}
          <div className="mb-2.5 space-y-1">
            <p className="text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contractor </span>
              <span className="font-medium">{contractorName || "Contractor not specified"}</span>
            </p>
            <p className="text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer </span>
              <span className="font-medium">{customerName}</span>
            </p>
            <p className="text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Location </span>
              <span>{locationSummary}</span>
            </p>
            <p className="text-[13px] text-slate-500">{requestSummary}</p>
          </div>

          {/* Notes preview */}
          {enrichment?.notes_preview && (
            <p className="mb-2.5 line-clamp-2 text-[13px] italic text-slate-400">
              &ldquo;{enrichment.notes_preview}&rdquo;
            </p>
          )}

          {/* Secondary metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Intake Proposal
            </span>
            {enrichment?.has_permit_details && (
              <span className="text-[11px] text-slate-400">Permit provided</span>
            )}
            {enrichment?.has_notes && (
              <span className="text-[11px] text-slate-400">Notes included</span>
            )}
            <span className="text-[12px] text-slate-400">
              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
              {submittedAtLabel ? ` | ${submittedAtLabel}` : ""}
            </span>
          </div>
        </div>

        {/* ── Right column: actions ── */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {proposalId && (
            <Link
              href={`/ops/admin/contractor-intake-submissions/${proposalId}`}
              className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Review proposal
            </Link>
          )}
          {notif.is_unread && (
            <button
              onClick={() => void onMarkAsRead(notif.id)}
              disabled={pendingReadId === notif.id}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingReadId === notif.id ? "Saving..." : "Mark read"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic card — polished but not over-designed
// ---------------------------------------------------------------------------

type GenericCardProps = {
  notif: NotificationRowForUI;
  pendingReadId: string | null;
  onMarkAsRead: (id: string) => Promise<void>;
};

function GenericCard({ notif, pendingReadId, onMarkAsRead }: GenericCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-white transition ${
        notif.is_unread ? "border-blue-200 shadow-sm" : "border-slate-200 opacity-80"
      }`}
    >
      {notif.is_unread && (
        <div className="absolute left-0 top-0 h-full w-[3px] bg-blue-500" aria-hidden="true" />
      )}

      <div className={`flex items-start justify-between gap-4 px-4 py-3.5 ${notif.is_unread ? "pl-5" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className={`truncate text-sm font-semibold leading-snug ${notif.is_unread ? "text-slate-900" : "text-slate-600"}`}>
              {notif.subject || notif.notification_type}
            </h3>
            {notif.is_unread && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                New
              </span>
            )}
          </div>

          {notif.body && (
            <p className="mb-2 line-clamp-2 text-sm text-slate-500">
              {notif.body}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {notificationTypeLabel(notif.notification_type)}
            </span>
            <span className="text-[12px] text-slate-400">
              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {notif.job_id && (
            <Link
              href={`/jobs/${notif.job_id}`}
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              View job
            </Link>
          )}
          {notif.is_unread && (
            <button
              onClick={() => void onMarkAsRead(notif.id)}
              disabled={pendingReadId === notif.id}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingReadId === notif.id ? "Saving..." : "Mark read"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function NotificationListClient({
  notifications,
  pendingReadId = null,
  onMarkAsRead,
}: NotificationListClientProps) {
  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p className="text-base font-semibold text-slate-800">No notifications</p>
        <p className="mt-1 text-sm text-slate-500">You are all caught up right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notif) => {
        const proposalId = proposalIdFromPayload(notif.payload);

        if (isProposalNotificationType(notif.notification_type)) {
          return (
            <ProposalCard
              key={notif.id}
              notif={notif}
              enrichment={notif.proposal_enrichment}
              proposalId={proposalId}
              pendingReadId={pendingReadId}
              onMarkAsRead={onMarkAsRead}
            />
          );
        }

        if (
          isContractorUpdateNotificationType(notif.notification_type) ||
          isJobAwareNotificationType(notif.notification_type)
        ) {
          return (
            <JobAwareNotificationCard
              key={notif.id}
              notif={notif}
              pendingReadId={pendingReadId}
              onMarkAsRead={onMarkAsRead}
            />
          );
        }

        return (
          <GenericCard
            key={notif.id}
            notif={notif}
            pendingReadId={pendingReadId}
            onMarkAsRead={onMarkAsRead}
          />
        );
      })}
    </div>
  );
}
