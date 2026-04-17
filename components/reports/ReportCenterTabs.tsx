import Link from "next/link";

type Props = {
  current: "jobs" | "service-cases" | "closeout" | "dashboard" | "kpis";
};

const baseClass =
  "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";

export default function ReportCenterTabs({ current }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/reports"
        className={`${baseClass} ${
          current === "jobs"
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Job / Visit Ledger
      </Link>
      <Link
        href="/reports/service-cases"
        className={`${baseClass} ${
          current === "service-cases"
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Service Case Continuity
      </Link>
      <Link
        href="/reports/closeout"
        className={`${baseClass} ${
          current === "closeout"
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Closeout / Follow-up
      </Link>
      <Link
        href="/reports/dashboard"
        className={`${baseClass} ${
          current === "dashboard"
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/reports/kpis"
        className={`${baseClass} ${
          current === "kpis"
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        KPI Validation
      </Link>
    </div>
  );
}