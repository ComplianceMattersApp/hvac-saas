import Link from "next/link";

type Props = {
  current:
    | "jobs"
    | "service-cases"
    | "closeout"
    | "invoices"
    | "dashboard"
    | "kpis"
    | "time-clock"
    | "payments"
    | "deposits"
    | "failed-payments"
    | "payment-reconciliation";
};

const baseClass =
  "inline-flex items-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";

export default function ReportCenterTabs({ current }: Props) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.3)]">
      <Link
        href="/reports/dashboard"
        className={`${baseClass} ${
          current === "dashboard"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/reports/jobs"
        className={`${baseClass} ${
          current === "jobs"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Jobs Report
      </Link>
      <Link
        href="/reports/service-cases"
        className={`${baseClass} ${
          current === "service-cases"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Service Cases Report
      </Link>
      <Link
        href="/reports/closeout"
        className={`${baseClass} ${
          current === "closeout"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Closeout Report
      </Link>
      <Link
        href="/reports/time-clock"
        className={`${baseClass} ${
          current === "time-clock"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Time Clock Report
      </Link>
      <Link
        href="/reports/invoices"
        className={`${baseClass} ${
          current === "invoices"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Invoices Report
      </Link>
      <Link
        href="/reports/payments"
        className={`${baseClass} ${
          current === "payments"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Payments Register
      </Link>
      <Link
        href="/reports/deposits"
        title="Review Stripe settlement fees, net deposits, payout timing, and CSV exports."
        aria-label="Deposits - Review Stripe settlement fees, net deposits, payout timing, and CSV exports."
        className={`${baseClass} ${
          current === "deposits"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Deposits
      </Link>
      <Link
        href="/reports/payment-reconciliation"
        className={`${baseClass} ${
          current === "payment-reconciliation"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Confirm Payment
      </Link>
      <Link
        href="/reports/failed-payments"
        className={`${baseClass} ${
          current === "failed-payments"
            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
            : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
        }`}
      >
        Failed Payments Queue
      </Link>
    </div>
  );
}
