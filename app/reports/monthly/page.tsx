import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveBillingModeByAccountOwnerId, resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import { ReportFilterPanel, ReportPageHeader, reportActionClass, reportControlClass, reportLabelClass, reportPageClass } from "@/components/reports/ReportLedgerChrome";
import { getMonthlyOverview } from "@/lib/reports/monthly-overview";

export const metadata = {
  title: "Monthly Overview",
  description: "Billed, received, deposited, outstanding, and completed-job performance for the month.",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function change(value: number | null, label: string) {
  if (value == null) return `No ${label.toLowerCase()} baseline`;
  if (value === 0) return `Even with ${label.toLowerCase()}`;
  return `${value > 0 ? "+" : ""}${value}% vs ${label.toLowerCase()}`;
}

function MetricCard({ label, value, explanation, href, accent = "slate", comparison }: {
  label: string; value: string; explanation: string; href: string; accent?: "slate" | "blue" | "emerald" | "amber"; comparison?: string;
}) {
  const tones = { slate: "border-slate-200", blue: "border-blue-200 bg-blue-50/50", emerald: "border-emerald-200 bg-emerald-50/50", amber: "border-amber-200 bg-amber-50/50" };
  return <Link href={href} className={`rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[accent]}`}>
    <div className={reportLabelClass}>{label}</div>
    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
    {comparison ? <div className="mt-2 text-xs font-semibold text-slate-700">{comparison}</div> : null}
    <p className="mt-3 text-sm leading-6 text-slate-600">{explanation}</p>
    <div className="mt-4 text-sm font-semibold text-blue-700">Open details →</div>
  </Link>;
}

export default async function MonthlyOverviewPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) redirect("/login");
  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) redirect(await resolveInternalAccessErrorRedirectPath({ supabase, user, fallbackPath: "/login" }));
    throw error;
  }
  requireFinancialRegisterAccessOrRedirect({ actorUserId: user.id, internalUser, resourceAccountOwnerUserId: internalUser.account_owner_user_id, redirectTo: "/reports/invoices?banner=not_authorized" });
  const resolved = (searchParams ? await searchParams : {}) ?? {};
  const requestedMonth = Array.isArray(resolved.month) ? resolved.month[0] : resolved.month;
  const [identity, billingMode, model] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({ supabase, accountOwnerUserId: internalUser.account_owner_user_id }),
    resolveBillingModeByAccountOwnerId({ supabase, accountOwnerUserId: internalUser.account_owner_user_id }),
    getMonthlyOverview({ supabase, accountOwnerUserId: internalUser.account_owner_user_id, month: requestedMonth }),
  ]);
  if (billingMode !== "internal_invoicing") redirect("/reports/invoices?banner=not_available");
  const rangeParams = new URLSearchParams({ from: model.range.fromDate, to: model.range.toDate });
  const paymentsHref = `/reports/payments?${rangeParams}`;
  const invoicesHref = `/reports/invoices?view=all&date_field=issued&${rangeParams}`;
  const jobsHref = `/reports/jobs?date_field=completed&scope=all&${rangeParams}`;
  const depositsHref = `/reports/deposits?date_from=${model.range.fromDate}&date_to=${model.range.toDate}`;
  const maxDaily = Math.max(1, ...model.trend.map((row) => row.receivedCents));

  return <div className={reportPageClass}>
    <ReportPageHeader businessName={identity.display_name} title="Monthly overview" description="Understand what was billed, what customers paid, what Stripe sent toward the bank, what remains owed, and how much work was completed." countSummary={model.monthLabel} truthNote="Each number keeps its own source of truth. Billed, received, deposited, and outstanding are never treated as interchangeable." />
    <ReportCenterTabs current="monthly" showDeposits />
    <ReportFilterPanel title="Choose a month" description="The current month runs through today. Completed months show the full calendar month.">
      <form className="flex flex-wrap items-end gap-3">
        <label><span className={`mb-1 block ${reportLabelClass}`}>Month</span><input className={reportControlClass} type="month" name="month" defaultValue={model.month} /></label>
        <button className={reportActionClass("primary")} type="submit">View month</button>
        <Link className={reportActionClass("secondary")} href="/reports/monthly">Current month</Link>
      </form>
    </ReportFilterPanel>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Billed" value={money(model.billedCents)} explanation="Issued invoice totals dated in this month. This is not the same as cash received." href={invoicesHref} accent="blue" />
      <MetricCard label="Received" value={money(model.receivedCents)} explanation="Recorded customer payments received during this month, across supported payment methods." href={paymentsHref} accent="emerald" comparison={change(model.receivedChangePercent, model.comparisonLabel)} />
      <MetricCard label="Deposited" value={money(model.depositedCents)} explanation="Proven Stripe net settlement amounts expected at the bank after fees and deductions." href={depositsHref} />
      <MetricCard label="Outstanding now" value={money(model.outstandingCents)} explanation="Current unpaid balance across all issued invoices. This is a today balance, not a monthly total." href="/reports/invoices?view=open" accent="amber" />
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className={reportLabelClass}>Payments received by day</div><h2 className="mt-1 text-lg font-semibold text-slate-950">{model.monthLabel} income rhythm</h2></div><Link href={paymentsHref} className="text-sm font-semibold text-blue-700">Review payments</Link></div>
        <div className="mt-6 flex h-48 items-end gap-1" aria-label="Daily payments received chart">
          {model.trend.map((point) => <div key={point.day} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`Day ${point.day}: ${money(point.receivedCents)}`}>
            <div className="w-full rounded-t bg-emerald-500 transition group-hover:bg-emerald-600" style={{ height: `${Math.max(point.receivedCents ? 4 : 1, Math.round((point.receivedCents / maxDaily) * 160))}px` }} />
            {(point.day === 1 || point.day === model.trend.length || point.day % 5 === 0) ? <span className="text-[9px] text-slate-500">{point.day}</span> : <span className="h-3" />}
          </div>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">Daily bars use payment received dates. Hover a bar for its amount.</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className={reportLabelClass}>Completed jobs</div><div className="mt-2 text-5xl font-semibold text-slate-950">{model.completedJobs}</div>
        <div className="mt-2 text-sm font-semibold text-slate-700">{change(model.completedJobsChangePercent, model.comparisonLabel)}</div>
        <p className="mt-4 text-sm leading-6 text-slate-600">Jobs marked field-complete during the selected month.</p>
        <div className="mt-5 border-t border-slate-200 pt-4"><div className={reportLabelClass}>Received per completed job</div><div className="mt-1 text-2xl font-semibold text-slate-950">{model.averageReceivedPerCompletedJobCents == null ? "—" : money(model.averageReceivedPerCompletedJobCents)}</div><p className="mt-2 text-xs leading-5 text-slate-500">A directional ratio, not invoice-level job profitability. Payments may relate to work completed in another month.</p></div>
        <Link href={jobsHref} className="mt-5 inline-flex text-sm font-semibold text-blue-700">Review completed jobs →</Link>
      </article>
    </section>
  </div>;
}
