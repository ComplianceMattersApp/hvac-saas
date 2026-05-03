import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";

type DeferredTimelineBodyProps = {
  jobId: string;
  timelineJobIds: string[];
  hasDirectNarrativeChain: boolean;
  emptyStateClassName: string;
};

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

function getEventAttachmentCount(meta?: any) {
  const metadataCount = Number(meta?.attachment_count ?? meta?.count ?? meta?.attachments_count);
  if (Number.isFinite(metadataCount) && metadataCount > 0) {
    return Math.trunc(metadataCount);
  }

  const attachmentIdsCount = Array.isArray(meta?.attachment_ids)
    ? Number(meta.attachment_ids.length)
    : NaN;
  if (Number.isFinite(attachmentIdsCount) && attachmentIdsCount > 0) {
    return Math.trunc(attachmentIdsCount);
  }

  const fileNamesCount = Array.isArray(meta?.file_names)
    ? Number(meta.file_names.length)
    : NaN;
  if (Number.isFinite(fileNamesCount) && fileNamesCount > 0) {
    return Math.trunc(fileNamesCount);
  }

  if (typeof meta?.file_name === "string" && meta.file_name.trim()) {
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
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(meta.note ?? meta.message ?? meta.caption ?? "").trim();
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

  if (["internal_invoice_drafted", "internal_invoice_issued", "internal_invoice_voided"].includes(String(type ?? ""))) {
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    const totalDisplay = summarizePlainText(String(meta?.total_display ?? ""), 24);
    const voidReason = summarizePlainText(String(meta?.void_reason ?? ""), 120);
    return [invoiceNumber, totalDisplay, voidReason].filter(Boolean).join(" - ");
  }

  if (["internal_invoice_email_sent", "internal_invoice_email_resent", "internal_invoice_email_failed"].includes(String(type ?? ""))) {
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    const recipientEmail = summarizePlainText(String(meta?.recipient_email ?? ""), 72);
    const errorDetail = summarizePlainText(String(meta?.error_detail ?? ""), 120);
    return [invoiceNumber, recipientEmail, errorDetail].filter(Boolean).join(" - ");
  }

  if (type === "payment_recorded") {
    const amountDisplay = summarizePlainText(String(meta?.amount_display ?? ""), 24);
    const paymentMethod = summarizePlainText(String(meta?.payment_method ?? "").replace(/_/g, " "), 48);
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    return [amountDisplay ? `$${amountDisplay}` : "", paymentMethod, invoiceNumber].filter(Boolean).join(" - ");
  }

  if (type === "companion_scope_promoted") {
    const itemTitle = summarizePlainText(String(meta?.source_item_title ?? ""), 80);
    return itemTitle ? `${itemTitle} - promoted into its own Service job` : "Companion scope promoted into its own Service job";
  }

  if (type === "created_from_companion_scope") {
    const itemTitle = summarizePlainText(String(meta?.source_item_title ?? ""), 80);
    return itemTitle ? `${itemTitle} - created from ECC companion scope` : "Created from ECC companion scope";
  }

  return cleanMessage;
}

function formatTimelineEvent(type?: string | null, meta?: any, message?: string | null) {
  const eventType = String(type ?? "");
  if (eventType === "attachment_added") {
    const count = Number(
      meta?.count ?? meta?.attachment_ids?.length ?? meta?.file_names?.length ?? 0,
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
    internal_invoice_drafted: "Internal invoice drafted",
    internal_invoice_issued: "Internal invoice issued",
    internal_invoice_voided: "Internal invoice voided",
    internal_invoice_email_sent: "Internal invoice emailed",
    internal_invoice_email_resent: "Internal invoice emailed again",
    internal_invoice_email_failed: "Internal invoice email failed",
    payment_recorded: "Payment recorded",
    companion_scope_promoted: "Companion scope promoted",
    created_from_companion_scope: "Service job created from companion scope",
  };

  if (eventType === "ops_update") {
    return String(message ?? meta?.message ?? meta?.note ?? "Ops updated").trim();
  }

  return map[eventType] ?? eventType.replaceAll("_", " ");
}

function renderTimelineItem(e: any, key: string, actorDisplayMap: Record<string, string>) {
  const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "-";
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
    type === "internal_invoice_drafted" ? "🧾" :
    type === "internal_invoice_issued" ? "🧾" :
    type === "internal_invoice_voided" ? "⛔" :
    type === "internal_invoice_email_sent" ? "✉️" :
    type === "internal_invoice_email_resent" ? "📨" :
    type === "internal_invoice_email_failed" ? "⚠️" :
    type === "payment_recorded" ? "💵" :
    type === "companion_scope_promoted" ? "🔀" :
    type === "created_from_companion_scope" ? "🧰" :
    type === "failure_resolved_by_correction_review" ? "✅" :
    type === "contractor_correction_submission" ? "📎" :
    "📝";

  return (
    <div key={key} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">{when}</div>
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-500">{icon}</div>
      </div>

      <div className="mt-2 font-medium text-slate-950">{title}</div>

      {detailText ? (
        <div className="mt-1 text-sm leading-6 text-slate-700">{detailText}</div>
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

      {type === "companion_scope_promoted" && meta?.promoted_service_job_id ? (
        <div className="mt-1 text-sm">
          Service follow-up:{" "}
          <Link className="underline" href={`/jobs/${String(meta.promoted_service_job_id)}?tab=info`}>
            View service job
          </Link>
        </div>
      ) : null}

      {type === "created_from_companion_scope" && meta?.source_job_id ? (
        <div className="mt-1 text-sm">
          Source ECC job:{" "}
          <Link className="underline" href={`/jobs/${String(meta.source_job_id)}?tab=info`}>
            View source job
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default async function DeferredTimelineBody({
  jobId,
  timelineJobIds,
  hasDirectNarrativeChain,
  emptyStateClassName,
}: DeferredTimelineBodyProps) {
  const supabase = await createClient();

  const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

  const { data: timelineEvents, error: timelineErr } = await supabase
    .from("job_events")
    .select("id, job_id, created_at, event_type, message, meta, user_id")
    .in("job_id", narrativeScopeJobIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (timelineErr) throw new Error(timelineErr.message);

  const timelineItems = timelineEvents ?? [];
  const timelinePreviewItems = timelineItems.slice(0, 3);
  const timelineOverflowItems = timelineItems.slice(3);

  if (!timelineItems.length) {
    return (
      <div className={emptyStateClassName}>
        {hasDirectNarrativeChain
          ? "No timeline events in this direct retest chain yet."
          : "No timeline events yet."}
      </div>
    );
  }

  const timelineActorIds = Array.from(
    new Set(
      timelineItems
        .flatMap((e: any) => {
          const meta = e?.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
          return [String(e?.user_id ?? "").trim(), String(meta?.actor_user_id ?? "").trim()];
        })
        .filter(Boolean),
    ),
  );

  const actorDisplayMap = await resolveUserDisplayMap({
    supabase,
    userIds: timelineActorIds,
  });

  return (
    <>
      {timelinePreviewItems.map((e: any, idx: number) =>
        renderTimelineItem(e, `timeline-preview-${idx}`, actorDisplayMap),
      )}

      {timelineOverflowItems.length > 0 ? (
        <details className="pt-1">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
            Show all timeline entries ({timelineItems.length})
          </summary>
          <div className="mt-2 space-y-2">
            {timelineOverflowItems.map((e: any, idx: number) =>
              renderTimelineItem(e, `timeline-overflow-${idx}`, actorDisplayMap),
            )}
          </div>
        </details>
      ) : null}
    </>
  );
}
