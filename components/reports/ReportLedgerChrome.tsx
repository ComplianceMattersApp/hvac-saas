import type { ReactNode } from "react";

export const reportPageClass = "mx-auto max-w-[1720px] space-y-5 px-3 py-4 text-slate-900 sm:px-5";
export const reportControlClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm shadow-slate-950/5 focus:outline-none focus:ring-2 focus:ring-slate-300";
export const reportLabelClass = "text-[11px] font-semibold uppercase text-slate-500";
export const reportCheckboxClass = "h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300";
export const reportTableHeadClass =
  "border-b border-slate-200 text-left text-[11px] font-semibold uppercase text-slate-500";
export const reportTableRowClass =
  "border-b border-slate-200/80 align-top transition-colors hover:bg-slate-50/70 last:border-b-0";

export function reportActionClass(variant: "primary" | "secondary" = "secondary") {
  if (variant === "primary") {
    return "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
  }

  return "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
}

export function ReportPageHeader({
  businessName,
  title,
  description,
  truthNote,
  countSummary,
  truncatedNote,
}: {
  businessName: string;
  title: string;
  description: string;
  truthNote: string;
  countSummary: string;
  truncatedNote?: string | null;
}) {
  return (
    <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className={reportLabelClass}>{businessName}</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600 lg:max-w-[30rem]">
          <div className="font-semibold text-slate-900">{countSummary}</div>
          {truncatedNote ? <div className="mt-1 text-xs leading-5 text-slate-500">{truncatedNote}</div> : null}
          <div className="mt-2 text-xs leading-5 text-slate-500">{truthNote}</div>
        </div>
      </div>
    </header>
  );
}

export function ReportStatGrid({ children }: { children: ReactNode }) {
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function ReportStatCard({
  label,
  value,
  helperText,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helperText: string;
  tone?: "slate" | "blue" | "rose" | "emerald";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white";

  return (
    <article className={`rounded-lg border p-4 shadow-sm shadow-slate-950/5 ${toneClass}`}>
      <div className={reportLabelClass}>{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helperText}</p>
    </article>
  );
}

export function ReportFilterPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ReportTableShell({
  note,
  children,
}: {
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
      {note ? (
        <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {note}
        </p>
      ) : null}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
