import Link from "next/link";

import { jobAddressLine, titleCaseFromSnake } from "@/lib/ops/focused-queues";
import type { FieldQueueJob } from "@/lib/ops/field-queue";
import { smsHref, telHref } from "@/lib/ops/phone-links";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

export type FieldWorkSectionKey = "in_progress" | "today" | "overdue" | "upcoming";

export type FieldWorkJob = FieldQueueJob & {
  city?: string | null;
  job_address?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_phone?: string | null;
  contractors?: { name?: string | null } | null;
};

export type FieldWorkCardProps = {
  job: FieldWorkJob;
  internalBusinessDisplayName: string;
  sectionKey: string;
  sectionTitle: string;
  todayLA: string;
};

function customerName(job: FieldWorkJob): string {
  return (
    [String(job?.customer_first_name ?? "").trim(), String(job?.customer_last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ") || "Customer"
  );
}

function contractorName(job: FieldWorkJob, internalBusinessDisplayName: string): string {
  return String(job?.contractors?.name ?? "").trim() || internalBusinessDisplayName;
}

function mapsHref(parts: { address?: string | null; city?: string | null }): string {
  const query = [parts.address, parts.city]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

function formatStatus(value: unknown): string {
  return titleCaseFromSnake(String(value ?? "open"));
}

function daysBetween(fromDateLA: string, toDateLA: string): number {
  const from = Date.parse(`${fromDateLA}T00:00:00Z`);
  const to = Date.parse(`${toDateLA}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

function activityLabel(status: unknown): { label: string; className: string } {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "on_the_way") return { label: "On the way", className: "text-blue-700" };
  if (normalized === "in_process") return { label: "On site", className: "text-emerald-700" };
  return { label: formatStatus(status), className: "text-slate-600" };
}

/** Section-specific top-right detail: how late (overdue), current activity (active),
 * the day's window (today), or the target date (upcoming). */
function cardHighlight(
  sectionKey: string,
  job: FieldWorkJob,
  todayLA: string,
  windowLabel: string,
): { text: string; className: string } {
  if (sectionKey === "overdue") {
    const days = job?.scheduled_date ? daysBetween(String(job.scheduled_date), todayLA) : 0;
    const label = days > 0 ? `${days} day${days === 1 ? "" : "s"} late` : "Overdue";
    return { text: label, className: "text-rose-700" };
  }

  if (sectionKey === "in_progress") {
    const activity = activityLabel(job?.status);
    return { text: activity.label, className: activity.className };
  }

  if (sectionKey === "today") {
    return { text: windowLabel || "Today", className: "text-amber-700" };
  }

  return {
    text: job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "Schedule pending",
    className: "text-indigo-700",
  };
}

export function sectionVisualTone(key: string) {
  if (key === "in_progress") {
    return {
      border: "border-blue-200",
      bg: "bg-blue-50",
      text: "text-blue-800",
      dot: "bg-blue-500",
      card: "border-l-blue-500",
    };
  }

  if (key === "today") {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-800",
      dot: "bg-amber-500",
      card: "border-l-amber-500",
    };
  }

  if (key === "overdue") {
    return {
      border: "border-rose-200",
      bg: "bg-rose-50",
      text: "text-rose-800",
      dot: "bg-rose-500",
      card: "border-l-rose-500",
    };
  }

  if (key === "upcoming") {
    return {
      border: "border-indigo-200",
      bg: "bg-indigo-50",
      text: "text-indigo-800",
      dot: "bg-indigo-500",
      card: "border-l-indigo-500",
    };
  }

  // Defensive default: sectionVisualTone is exported for reuse beyond the
  // local My Work sections list, so an unrecognized key still renders.
  return {
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-700",
    dot: "bg-slate-400",
    card: "border-l-slate-400",
  };
}

export function FieldWorkCard({ job, internalBusinessDisplayName, sectionKey, sectionTitle, todayLA }: FieldWorkCardProps) {
  const phone = String(job?.customer_phone ?? "").trim();
  const navigateHref = mapsHref({
    address: job?.job_address,
    city: job?.city,
  });
  const sectionTone = sectionVisualTone(sectionKey);
  const scheduleLabel = job?.scheduled_date
    ? formatBusinessDateUS(String(job.scheduled_date))
    : "Schedule pending";
  const windowLabel =
    job?.window_start || job?.window_end
      ? displayWindowLA(job.window_start, job.window_end) || "Window pending"
      : "";
  const highlight = cardHighlight(sectionKey, job, todayLA, windowLabel);
  const stateChipLabel = sectionKey === "in_progress" ? formatStatus(job?.status) : sectionTitle;

  return (
    <div
      key={job.id}
      className={`rounded-lg border border-l-4 ${sectionTone.card} border-slate-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.42)]`}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/jobs/${job.id}?tab=ops`}
              className="text-base font-semibold tracking-tight text-slate-950 hover:text-blue-700 hover:underline"
            >
              {normalizeRetestLinkedJobTitle(job?.title) || "Untitled Job"}
            </Link>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${sectionTone.border} ${sectionTone.bg} ${sectionTone.text}`}
            >
              {stateChipLabel}
            </span>
          </div>
          <div className="text-sm font-medium text-slate-900">{customerName(job)}</div>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <div className="font-semibold uppercase tracking-[0.06em] text-slate-400">Scheduled</div>
              <div className="mt-0.5 text-slate-700">
                {scheduleLabel}
                {windowLabel ? ` · ${windowLabel}` : ""}
              </div>
            </div>
            <div>
              <div className="font-semibold uppercase tracking-[0.06em] text-slate-400">Contractor</div>
              <div className="mt-0.5 text-slate-700">{contractorName(job, internalBusinessDisplayName)}</div>
            </div>
            <div>
              <div className="font-semibold uppercase tracking-[0.06em] text-slate-400">Address</div>
              <div className="mt-0.5 text-slate-700">{jobAddressLine(job)}</div>
            </div>
          </div>
        </div>
        <div className={`shrink-0 text-sm font-semibold ${highlight.className}`}>{highlight.text}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:min-h-10"
        >
          Open Job
        </Link>
        {telHref(phone) ? (
          <a
            href={telHref(phone)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
          >
            Call
          </a>
        ) : null}
        {smsHref(phone) ? (
          <a
            href={smsHref(phone)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
          >
            Text
          </a>
        ) : null}
        {navigateHref ? (
          <a
            href={navigateHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
          >
            Navigate
          </a>
        ) : null}
      </div>
    </div>
  );
}
