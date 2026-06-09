import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
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
  title: "Payments Register",
  description: "Read-only internal payments register from invoice payment truth",
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
      const { data: contractorUser, error: contractorError } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorError) throw contractorError;
      if (contractorUser?.contractor_id) redirect("/portal");
      redirect("/login");
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
        title="Payments Register"
        description="Read-only register view over current invoice-bound payment truth. Recorded and failed payment attempts are shown as separate lanes."
        countSummary={usesInternalInvoicing ? `Showing ${register.rows.length} of ${register.totalCount} payment rows` : "External billing mode"}
        truncatedNote={usesInternalInvoicing && register.truncated ? `Page view is capped at ${PAYMENTS_REGISTER_PAGE_LIMIT} rows.` : null}
        truthNote="Current source of truth is internal_invoice_payments. This slice is read-only and does not add payment mutations or allocation behavior."
      />

      <ReportCenterTabs current="payments" showDeposits />

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
        Payments Register shows collected payment truth. Confirm Payment shows reported payments awaiting verification. Failed Payments shows failed attempts needing review.
      </section>

      {!usesInternalInvoicing ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold text-slate-950">No payments register in this billing mode</h2>
            <p className="text-sm leading-6 text-slate-600">
              This company is configured for external billing. The register only shows rows from internal invoice payment truth and stays empty outside internal invoicing mode.
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
            <ReportStatCard label="Recorded total" value={totalRecordedDisplay} helperText="Sum of visible recorded rows only." tone="blue" />
            <ReportStatCard
              label="Failed attempts"
              value={viewSnapshot.failedAttemptsCount}
              helperText="Failed rows in current view/filter window; never counted as collected money."
              tone="rose"
            />
            <ReportStatCard
              label="Recent payments"
              value={`${viewSnapshot.recentRecordedCount} rows`}
              helperText={`Latest collected payments in the current view, up to 10 (${viewSnapshot.recentRecordedAmountDisplay}).`}
              tone="slate"
            />
            <ReportStatCard
              label="Method mix"
              value={recordedRows.length}
              helperText={`Recorded totals in current view by taxonomy: ${methodMixSummary}`}
              tone="slate"
            />
            <ReportStatCard label="Payments shown" value={register.rows.length} helperText="Payments matching the current filters." />
          </ReportStatGrid>

          <ReportFilterPanel
            title="Filter payments register"
            description="Narrow by payment status, method taxonomy, paid date range, or quick text search."
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

          <ReportTableShell note="Recorded payments and failed attempts are intentionally separated so failed rows never look like collected money.">
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Recorded payments</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/90">
                    <tr className={reportTableHeadClass}>
                      <th className="px-3 py-3">Paid Date</th>
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
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No recorded payments match current filters.</td>
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
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Failed attempts</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/90">
                    <tr className={reportTableHeadClass}>
                      <th className="px-3 py-3">Attempt Date</th>
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
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No failed attempts match current filters.</td>
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
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Other payment states</h3>
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
