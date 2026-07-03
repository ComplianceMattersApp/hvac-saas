import type { ReactNode } from "react";
import Link from "next/link";

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
  tagsColumns?: 1 | 2;
  children?: ReactNode;
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
}: QueueCardProps) {
  return (
    <div
      id={id}
      data-ops-workspace-card-variant={variant}
      className={queueCardClassName(variant)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? (
            <Link href={href} className="text-[14px] font-semibold leading-5 text-blue-700 hover:text-blue-800 hover:underline">
              {title}
            </Link>
          ) : (
            <span className="text-[14px] font-semibold leading-5 text-slate-950">{title}</span>
          )}
          <div className="mt-0.5 text-[12.5px] leading-5 text-slate-700">{subtitle}</div>
        </div>
        {href ? (
          <Link href={href} className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]">
            {actionLabel}
          </Link>
        ) : null}
      </div>

      <div className={`mt-1.5 grid gap-1 text-[12px] leading-5 text-slate-600 ${tagsColumns === 2 ? "sm:grid-cols-2" : ""}`}>
        {tags.map((tag, index) => (
          <div key={index} className={tag.fullWidth ? "sm:col-span-2" : undefined}>
            <span className="font-medium text-slate-500">{tag.label}:</span> {tag.value}
            {tag.detail ? <div className="pl-[84px] text-slate-700">{tag.detail}</div> : null}
          </div>
        ))}
      </div>

      {children}
    </div>
  );
}
