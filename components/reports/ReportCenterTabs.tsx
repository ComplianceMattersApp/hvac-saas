import Link from "next/link";
import type { ReactNode } from "react";

type ReportCenterKey =
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

type Props = {
  current: ReportCenterKey;
  showDeposits?: boolean;
};

const baseClass =
  "inline-flex items-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";

function tabClass(isCurrent: boolean) {
  return `${baseClass} ${
    isCurrent
      ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.45)]"
      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
  }`;
}

function ReportLink({
  href,
  current,
  active,
  children,
}: {
  href: string;
  current: ReportCenterKey;
  active: ReportCenterKey;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={tabClass(current === active)}>
      {children}
    </Link>
  );
}

export default function ReportCenterTabs({ current, showDeposits = false }: Props) {
  const advancedCurrent = [
    "dashboard",
    "deposits",
    "service-cases",
    "time-clock",
    "failed-payments",
    "payment-reconciliation",
    "kpis",
  ].includes(current);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.3)]">
      <ReportLink href="/reports/invoices?view=open" current={current} active="invoices">
        Open Invoices
      </ReportLink>
      <ReportLink href="/reports/jobs" current={current} active="jobs">
        Jobs
      </ReportLink>
      <ReportLink href="/reports/closeout" current={current} active="closeout">
        Closeout
      </ReportLink>
      <ReportLink href="/reports/payments" current={current} active="payments">
        Payments Received
      </ReportLink>

      <details className="relative">
        <summary className={`${tabClass(advancedCurrent)} cursor-pointer list-none`}>
          Advanced / More
        </summary>
        <div className="absolute left-0 z-20 mt-2 grid min-w-64 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-950/10">
          <Link href="/reports/dashboard" className={tabClass(current === "dashboard")}>Priority Board</Link>
          {showDeposits ? (
            <Link
              href="/reports/deposits"
              title="Review Stripe fees, net deposits, payout timing, and CSV exports."
              aria-label="Deposits - Review Stripe fees, net deposits, payout timing, and CSV exports."
              className={tabClass(current === "deposits")}
            >
              Deposits
            </Link>
          ) : null}
          <Link href="/reports/service-cases" className={tabClass(current === "service-cases")}>Work History</Link>
          <Link href="/reports/time-clock" className={tabClass(current === "time-clock")}>Time Clock</Link>
          <Link href="/reports/failed-payments" className={tabClass(current === "failed-payments")}>Failed Payments</Link>
          <Link href="/reports/payment-reconciliation" className={tabClass(current === "payment-reconciliation")}>Confirm Payment</Link>
          <Link href="/reports/kpis" className={tabClass(current === "kpis")}>KPI Reference</Link>
        </div>
      </details>
    </div>
  );
}
