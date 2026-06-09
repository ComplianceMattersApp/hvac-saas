import Link from "next/link";

type JobSubpageContextHeaderProps = {
  workspaceLabel: string;
  workspaceTitle: string;
  customerName: string;
  jobTitle: string;
  addressLabel: string;
  appointmentLabel: string;
  jobTypeLabel: string;
  fieldStatusLabel: string;
  opsStatusLabel: string;
  fieldStatusKey: string;
  opsStatusKey: string;
  backHref: string;
  backLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  compactMobile?: boolean;
};

function fieldStatusTone(statusKey: string) {
  if (["completed"].includes(statusKey)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (["failed", "cancelled"].includes(statusKey)) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-blue-200 bg-blue-50 text-blue-800";
}

function workflowStatusTone(statusKey: string) {
  if (["invoice_required", "pending_info", "paperwork_required", "on_hold"].includes(statusKey)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (["failed", "pending_office_review", "retest_needed"].includes(statusKey)) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (["closed"].includes(statusKey)) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function JobSubpageContextHeader({
  workspaceLabel,
  workspaceTitle,
  customerName,
  jobTitle,
  addressLabel,
  appointmentLabel,
  jobTypeLabel,
  fieldStatusLabel,
  opsStatusLabel,
  fieldStatusKey,
  opsStatusKey,
  backHref,
  backLabel = "Back to Job",
  secondaryHref,
  secondaryLabel,
  compactMobile = false,
}: JobSubpageContextHeaderProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_-30px_rgba(15,23,42,0.28)] ${
        compactMobile ? "p-3.5 sm:p-5" : "p-4 sm:p-5"
      }`}
    >
      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between ${compactMobile ? "gap-3 sm:gap-4" : "gap-4"}`}>
        <div className={`min-w-0 ${compactMobile ? "space-y-1.5 sm:space-y-2.5" : "space-y-2.5"}`}>
          <div className={`${compactMobile ? "hidden sm:block" : ""} text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500`}>{workspaceLabel}</div>
          <h1 className={`${compactMobile ? "text-xl sm:text-2xl" : "text-2xl"} font-semibold tracking-tight text-slate-950`}>{workspaceTitle}</h1>
          <div className="text-sm font-semibold text-slate-800">{customerName}</div>
          <div className={`${compactMobile ? "hidden sm:block" : ""} text-sm text-slate-600`}>{jobTitle}</div>

          <div className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${compactMobile ? "pt-1 sm:pt-0" : ""}`}>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
              {jobTypeLabel}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 ${fieldStatusTone(fieldStatusKey)}`}>
              Field: {fieldStatusLabel}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 ${workflowStatusTone(opsStatusKey)}`}>
              Workflow: {opsStatusLabel}
            </span>
          </div>

          <div className="text-sm text-slate-600">{addressLabel}</div>
          <div className={`${compactMobile ? "hidden sm:block" : ""} text-sm text-slate-600`}>{appointmentLabel}</div>
        </div>

        <div className={`grid w-full gap-2 ${secondaryHref ? "grid-cols-2" : "grid-cols-1"} sm:w-auto sm:grid-flow-col sm:auto-cols-max`}>
          {secondaryHref ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              {secondaryLabel ?? "Back"}
            </Link>
          ) : null}
          <Link
            href={backHref}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
