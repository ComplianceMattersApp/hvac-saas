import type { ReactNode } from "react";
import Link from "next/link";

export type QueueCardTone = "rose" | "amber" | "slate" | "green";

export type QueueCardStateChip = {
  label: string;
  tone: QueueCardTone;
};

export type QueueCardTag = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  fullWidth?: boolean;
};

export type QueueCardProps = {
  id?: string;
  variant?: string;
  title: string;
  href?: string;
  subtitle: ReactNode;
  tags: QueueCardTag[];
  actionLabel?: string;
  tagsColumns?: 1 | 2 | 4;
  children?: ReactNode;
  /** Overrides the tone derived from `variant` for the left status spine and default chip coloring. */
  tone?: QueueCardTone;
  /** Semantic badges rendered next to the title (e.g. "Failed ECC", "Unassigned"). */
  stateChips?: QueueCardStateChip[];
  /** Precomputed "In queue Nd" text; color follows `ageDays` thresholds when provided. */
  ageLabel?: string;
  /** Days since entering the queue; drives amber (>14d) / rose (>30d) age-chip coloring. */
  ageDays?: number | null;
  /** Free-text failure/reason note, pulled out into a highlighted callout when present. */
  quote?: string;
};

function queueCardClassName(variant?: string) {
  if (variant === "follow-up-overdue" || variant === "follow-up-due") {
    return "rounded-xl border border-red-300 bg-red-50/80 px-3 py-2 shadow-[0_10px_26px_-24px_rgba(185,28,28,0.65)]";
  }

  if (variant === "follow-up-soon" || variant === "follow-up-unscheduled") {
    return "rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 shadow-[0_10px_26px_-24px_rgba(180,83,9,0.55)]";
  }

  if (variant === "follow-up-future") {
    return "rounded-xl border border-slate-200 bg-white px-3 py-2";
  }

  return "rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2";
}

function variantTone(variant?: string): QueueCardTone {
  if (variant === "follow-up-overdue" || variant === "follow-up-due") return "rose";
  if (variant === "follow-up-soon" || variant === "follow-up-unscheduled") return "amber";
  return "slate";
}

const SPINE_TONE_CLASS: Record<QueueCardTone, string> = {
  rose: "border-l-4 border-l-rose-500",
  amber: "border-l-4 border-l-amber-500",
  slate: "border-l-4 border-l-slate-300",
  green: "border-l-4 border-l-emerald-500",
};

const CHIP_TONE_CLASS: Record<QueueCardTone, string> = {
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function ageChipTone(ageDays?: number | null): QueueCardTone {
  if (ageDays == null) return "slate";
  if (ageDays > 30) return "rose";
  if (ageDays > 14) return "amber";
  return "slate";
}

export default function QueueCard({
  id,
  variant,
  title,
  href,
  subtitle,
  tags,
  actionLabel = "Open Job",
  tagsColumns = 1,
  children,
  tone,
  stateChips,
  ageLabel,
  ageDays,
  quote,
}: QueueCardProps) {
  const resolvedTone = tone ?? variantTone(variant);

  return (
    <div
      id={id}
      data-ops-workspace-card-variant={variant}
      className={`${queueCardClassName(variant)} ${SPINE_TONE_CLASS[resolvedTone]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {href ? (
              <Link href={href} className="text-[14px] font-semibold leading-5 text-blue-700 hover:text-blue-800 hover:underline">
                {title}
              </Link>
            ) : (
              <span className="text-[14px] font-semibold leading-5 text-slate-950">{title}</span>
            )}
            {stateChips?.map((chip, index) => (
              <span
                key={`${chip.label}-${index}`}
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${CHIP_TONE_CLASS[chip.tone]}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-5 text-slate-700">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          {ageLabel ? (
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP_TONE_CLASS[ageChipTone(ageDays)]}`}
            >
              {ageLabel}
            </span>
          ) : null}
          {href ? (
            <Link href={href} className="inline-flex items-center rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {quote ? (
        <div className="mt-1.5 rounded-lg border border-rose-100 bg-rose-50/70 px-2.5 py-1.5 text-[12.5px] italic leading-5 text-rose-900">
          &ldquo;{quote}&rdquo;
        </div>
      ) : null}

      <div
        className={`mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px] leading-5 ${
          tagsColumns === 4 ? "sm:grid-cols-4" : tagsColumns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"
        }`}
      >
        {tags.map((tag, index) => (
          <div key={index} className={tag.fullWidth ? "col-span-2 sm:col-span-full" : undefined}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">{tag.label}</div>
            <div className="mt-0.5 text-[12.5px] text-slate-800">{tag.value}</div>
            {tag.detail ? <div className="mt-0.5 text-slate-600">{tag.detail}</div> : null}
          </div>
        ))}
      </div>

      {children}
    </div>
  );
}
