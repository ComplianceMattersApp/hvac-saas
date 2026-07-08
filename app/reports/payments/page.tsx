import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import {
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import {
  ReportFilterPanel,
  ReportPageHeader,
  ReportStatCard,
  ReportStatGrid,
  ReportTableShell,
  reportActionClass,
  reportControlClass,
  reportLabelClass,
  reportPageClass,
  reportTableHeadClass,
  reportTableRowClass,
} from "@/components/reports/ReportLedgerChrome";
import {
  PAYMENTS_REGISTER_METHOD_OPTIONS,
  PAYMENTS_REGISTER_PAGE_LIMIT,
  PAYMENTS_REGISTER_STATUS_OPTIONS,
  buildPaymentsRegisterViewSnapshot,
  buildPaymentsRegisterSearchParams,
  listPaymentsRegisterRows,
  parsePaymentsRegisterFilters,
  readPaymentsRegisterHeadlineSnapshot,
} from "@/lib/reports/payments-register";

export const metadata = {
  title: "Payments Received",
  description: "Payments recorded in the app, with failed attempts kept separate.",
};

export default async function PaymentsRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/login",
        }),
      );
    }
    throw error;
  }

  requireFinancialRegisterAccessOrRedirect({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: "/reports/invoices?banner=not_authorized",
  });

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = parsePaymentsRegisterFilters(resolvedSearchParams);

  const [internalBusinessIdentity, billingMode] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    resolveBillingModeByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
  ]);

  const usesInternalInvoicing = billingMode === "internal_invoicing";

  const [register, headlineSnapshot] = usesInternalInvoicing
    ? await Promise.all([
        listPaymentsRegisterRows({
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
          filters,
          limit: PAYMENTS_REGISTER_PAGE_LIMIT,
        }),
        readPaymentsRegisterHeadlineSnapshot({
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
        }),
      ])
    : [
        { rows: [], totalCount: 0, truncated: false },
        {
          receivedThisMonthCents: 0,
          receivedThisMonthDisplay: "$0.00",
          receivedLast30DaysCents: 0,
          receivedLast30DaysDisplay: "$0.00",
        },
      ];

  const recordedRows = register.rows.filter((row) => row.status === "recorded");
  const failedRows = register.rows.filter((row) => row.status === "failed");
  const otherRows = register.rows.filter((row) => row.status !== "recorded" && row.status !== "failed");

  const totalRecordedCents = recordedRows.reduce((sum, row) => sum + row.amountCents, 0);

  const totalRecordedDisplay = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalRecordedCents / 100);

  const viewSnapshot = buildPaymentsRegisterViewSnapshot({ rows: register.rows, recentLimit: 10 });
  const methodMixSummary = viewSnapshot.methodMix
    .map((row) => `${row.methodLabel}: ${row.amountDisplay}`)
    .join(" | ");

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Payments received"
        description="Payments recorded in the app, with failed attempts kept separate."
        countSummary={usesInternalInvoicing ? `Showing ${register.rows.length} of ${register.totalCount} payments` : "External billing mode"}
        truncatedNote={usesInternalInvoicing && register.truncated ? `Page view is capped at ${PAYMENTS_REGISTER_PAGE_LIMIT} payments.` : null}
        truthNote="This page is view-only. Failed attempts do not count as money received."
      />

      <ReportCenterTabs current="payments" showDeposits />

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
        Open Invoices shows who still owes money. Payments Received shows money already recorded. Confirm Payment is for field-reported payments that still need review.
      </section>

      {!usesInternalInvoicing ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold text-slate-950">No app payments to show</h2>
            <p className="text-sm leading-6 text-slate-600">
              This account tracks billing outside the app, so payment history is not recorded here.
            </p>
          </div>
        </section>
      ) : (
        <>
          <ReportStatGrid>
            <ReportStatCard
              label="Received this month"
              value={headlineSnapshot.receivedThisMonthDisplay}
              helperText="Recorded payments only. Current calendar month; not filter-dependent."
              tone="emerald"
            />
            <ReportStatCard
              label="Received last 30 days"
              value={headlineSnapshot.receivedLast30DaysDisplay}
              helperText="Recorded payments only. Rolling 30-day snapshot; not filter-dependent."
              tone="blue"
            />
            <ReportStatCard label="Total shown" value={totalRecordedDisplay} helperText="Sum of payments shown in the current view." tone="blue" />
            <ReportStatCard
              label="Failed attempts"
              value={viewSnapshot.failedAttemptsCount}
              helperText="Failed attempts in the current view; never counted as collected money."
              tone="rose"
            />
            <ReportStatCard
              label="Recent received"
              value={`${viewSnapshot.recentRecordedCount} payments`}
              helperText={`Latest received payments in the current view, up to 10 (${viewSnapshot.recentRecordedAmountDisplay}).`}
              tone="slate"
            />
            <ReportStatCard
              label="Payment methods"
              value={recordedRows.length}
              helperText={`Received totals in current view by method: ${methodMixSummary}`}
              tone="slate"
            />
            <ReportStatCard label="Payments shown" value={register.rows.length} helperText="Payments matching the current filters." />
          </ReportStatGrid>

          <ReportFilterPanel
            title="Find payments"
            description="Narrow by payment status, method, paid date, invoice, customer, job, or reference."
          >
            <form action="/reports/payments" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Payment status</span>
                <select name="status" defaultValue={filters.status} className={reportControlClass}>
                  <option value="">All statuses</option>
                  {PAYMENTS_REGISTER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Method</span>
                <select name="method" defaultValue={filters.method} className={reportControlClass}>
                  <option value="">All methods</option>
                  {PAYMENTS_REGISTER_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>From</span>
                <input name="from" type="date" defaultValue={filters.fromDate} className={reportControlClass} />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>To</span>
                <input name="to" type="date" defaultValue={filters.toDate} className={reportControlClass} />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Search</span>
                <input
                  name="q"
                  type="text"
                  defaultValue={filters.query}
                  placeholder="Invoice, customer, job, reference"
                  className={reportControlClass}
                />
              </label>

              <div className="flex flex-wrap items-end gap-2 xl:col-span-5 xl:justify-end">
                <button type="submit" className={reportActionClass("primary")}>Apply filters</button>
                <Link href="/reports/payments" className={reportActionClass()}>Reset</Link>
                <Link
                  href={`/reports/payments/export?${buildPaymentsRegisterSearchParams(filters).toString()}`}
                  className={reportActionClass()}
                  download
                >
                  Export CSV
                </Link>
              </div>
            </form>
          </ReportFilterPanel>

          <ReportTableShell note="Recorded payments are money received. Failed attempts are shown separately and do not count as collected.">
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Money received</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/90">
                    <tr className={reportTableHeadClass}>
                      <th className="px-3 py-3">Date paid</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Invoice</th>
                      <th className="px-3 py-3">Job</th>
                      <th className="px-3 py-3">Reference</th>
                      <th className="px-3 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordedRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No payments found. Try widening the date range or clearing a filter.</td>
                      </tr>
                    ) : (
                      recordedRows.map((row) => (
                        <tr key={row.paymentId} className={reportTableRowClass}>
                          <td className="px-3 py-3 text-slate-700">{row.paidAtDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.amountDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.methodLabel}</td>
                          <td className="px-3 py-3 text-slate-700">{row.customerHref ? <Link href={row.customerHref} className="text-blue-700 hover:underline">{row.customerName}</Link> : row.customerName}</td>
                          <td className="px-3 py-3 text-slate-700">{row.invoiceHref ? <Link href={row.invoiceHref} className="text-blue-700 hover:underline">{row.invoiceNumber}</Link> : row.invoiceNumber}</td>
                          <td className="px-3 py-3 text-slate-700">{row.jobHref ? <Link href={row.jobHref} className="font-mono text-xs text-blue-700 hover:underline">{row.jobReference}</Link> : <span className="font-mono text-xs text-slate-500">{row.jobReference}</span>}</td>
                          <td className="px-3 py-3 text-slate-700">{row.reference}</td>
                          <td className="px-3 py-3 text-slate-700"><div className="max-w-[20rem] truncate">{row.notes}</div></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Failed payment attempts</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/90">
                    <tr className={reportTableHeadClass}>
                      <th className="px-3 py-3">Attempt date</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Invoice</th>
                      <th className="px-3 py-3">Job</th>
                      <th className="px-3 py-3">Reference</th>
                      <th className="px-3 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No failed attempts found. Try widening the date range or clearing a filter.</td>
                      </tr>
                    ) : (
                      failedRows.map((row) => (
                        <tr key={row.paymentId} className={reportTableRowClass}>
                          <td className="px-3 py-3 text-slate-700">{row.paidAtDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.amountDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.methodLabel}</td>
                          <td className="px-3 py-3 text-slate-700">{row.customerHref ? <Link href={row.customerHref} className="text-blue-700 hover:underline">{row.customerName}</Link> : row.customerName}</td>
                          <td className="px-3 py-3 text-slate-700">{row.invoiceHref ? <Link href={row.invoiceHref} className="text-blue-700 hover:underline">{row.invoiceNumber}</Link> : row.invoiceNumber}</td>
                          <td className="px-3 py-3 text-slate-700">{row.jobHref ? <Link href={row.jobHref} className="font-mono text-xs text-blue-700 hover:underline">{row.jobReference}</Link> : <span className="font-mono text-xs text-slate-500">{row.jobReference}</span>}</td>
                          <td className="px-3 py-3 text-slate-700">{row.reference}</td>
                          <td className="px-3 py-3 text-slate-700"><div className="max-w-[20rem] truncate">{row.notes}</div></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              {otherRows.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Other payment records</h3>
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50/90">
                      <tr className={reportTableHeadClass}>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Amount</th>
                        <th className="px-3 py-3">Method</th>
                        <th className="px-3 py-3">Invoice</th>
                        <th className="px-3 py-3">Job</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherRows.map((row) => (
                        <tr key={row.paymentId} className={reportTableRowClass}>
                          <td className="px-3 py-3 text-slate-700">{row.paidAtDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.statusLabel}</td>
                          <td className="px-3 py-3 text-slate-700">{row.amountDisplay}</td>
                          <td className="px-3 py-3 text-slate-700">{row.methodLabel}</td>
                          <td className="px-3 py-3 text-slate-700">{row.invoiceHref ? <Link href={row.invoiceHref} className="text-blue-700 hover:underline">{row.invoiceNumber}</Link> : row.invoiceNumber}</td>
                          <td className="px-3 py-3 text-slate-700">{row.jobHref ? <Link href={row.jobHref} className="font-mono text-xs text-blue-700 hover:underline">{row.jobReference}</Link> : <span className="font-mono text-xs text-slate-500">{row.jobReference}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </div>
          </ReportTableShell>
        </>
      )}
    </div>
  );
}
