import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveBillingModeByAccountOwnerId, resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import {
  INVOICE_LEDGER_COMMUNICATION_STATE_OPTIONS,
  INVOICE_LEDGER_DATE_FIELD_OPTIONS,
  INVOICE_LEDGER_EXPORT_LIMIT,
  INVOICE_LEDGER_PAGE_LIMIT,
  INVOICE_LEDGER_SORT_OPTIONS,
  INVOICE_LEDGER_SOURCE_TYPE_OPTIONS,
  INVOICE_LEDGER_STATUS_OPTIONS,
  buildInvoiceLedgerSearchParams,
  getInvoiceLedgerFilterOptions,
  listInvoiceLedgerRows,
  parseInvoiceLedgerFilters,
} from "@/lib/reports/invoice-ledger";

export const metadata = {
  title: "Invoices Report",
  description: "Internal billed-truth invoices report",
};

export default async function InvoiceLedgerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = parseInvoiceLedgerFilters(resolvedSearchParams);
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

  const [filterOptions, ledger] = usesInternalInvoicing
    ? await Promise.all([
        getInvoiceLedgerFilterOptions({
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
        }),
        listInvoiceLedgerRows({
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
          filters,
          limit: INVOICE_LEDGER_PAGE_LIMIT,
        }),
      ])
    : [{ customers: [], contractors: [] }, { rows: [], totalCount: 0, truncated: false }];

  const exportHref = `/reports/invoices/export?${buildInvoiceLedgerSearchParams(filters).toString()}`;

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 px-2 py-3 text-slate-900">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center</h1>
          <p className="mt-1 text-sm text-slate-600">Invoices Report</p>
        </div>
        <div className="max-w-[28rem] text-sm text-slate-600 md:text-right">
          {usesInternalInvoicing ? (
            <>
              <div>Showing {ledger.rows.length} of {ledger.totalCount} invoice rows</div>
              {ledger.truncated ? (
                <div className="text-xs text-slate-500">Page view is capped at {INVOICE_LEDGER_PAGE_LIMIT} rows. Export includes up to {INVOICE_LEDGER_EXPORT_LIMIT} rows.</div>
              ) : null}
            </>
          ) : (
            <div>External billing mode: no internal billed-truth invoices report is available for this company.</div>
          )}
        </div>
      </header>

      <ReportCenterTabs current="invoices" />

      {!usesInternalInvoicing ? (
        <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/80 p-6 shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">No internal invoices report in this billing mode</h2>
            <p className="text-sm leading-6 text-slate-600">
              This company is configured for external billing. The invoices report only shows real rows from the internal invoice domain, so this surface stays empty rather than inventing billed totals, open invoice counts, or payment-style finance signals.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/80 p-5 shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
            <form action="/reports/invoices" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Invoice status</span>
                <select name="status" defaultValue={filters.status} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All statuses</option>
                  {INVOICE_LEDGER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date field</span>
                <select name="date_field" defaultValue={filters.dateField} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {INVOICE_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">From</span>
                <input name="from" type="date" defaultValue={filters.fromDate} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">To</span>
                <input name="to" type="date" defaultValue={filters.toDate} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Customer</span>
                <select name="customer" defaultValue={filters.customerId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All customers</option>
                  {filterOptions.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Contractor</span>
                <select name="contractor" defaultValue={filters.contractorId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All contractors</option>
                  {filterOptions.contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Source type</span>
                <select name="source_type" defaultValue={filters.sourceType} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All source types</option>
                  {INVOICE_LEDGER_SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Communication state</span>
                <select name="communication_state" defaultValue={filters.communicationState} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All states</option>
                  {INVOICE_LEDGER_COMMUNICATION_STATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Sort</span>
                <select name="sort" defaultValue={filters.sort} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {INVOICE_LEDGER_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-end gap-2 xl:col-span-2 xl:justify-end">
                <button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                  Apply filters
                </button>
                <Link href="/reports/invoices" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                  Reset
                </Link>
                <Link href={exportHref} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                  Export CSV
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/90">
                  <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-3 py-3">Invoice Ref</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Job / Visit</th>
                    <th className="px-3 py-3">Service Case</th>
                    <th className="px-3 py-3">Contractor</th>
                    <th className="px-3 py-3">Invoice Date</th>
                    <th className="px-3 py-3">Issued</th>
                    <th className="px-3 py-3">Last Communication</th>
                    <th className="px-3 py-3">Recipient</th>
                    <th className="px-3 py-3">Comm State</th>
                    <th className="px-3 py-3">Subtotal</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3">Voided</th>
                    <th className="px-3 py-3">Amount Paid</th>
                    <th className="px-3 py-3">Balance Due</th>
                    <th className="px-3 py-3">Payment Status</th>
                    <th className="px-3 py-3">Last Payment</th>
                    <th className="px-3 py-3">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.length === 0 ? (
                    <tr>
                      <td colSpan={21} className="px-4 py-12 text-center text-sm text-slate-500">
                        <div className="mx-auto max-w-md space-y-2">
                          <div className="font-semibold text-slate-700">No invoices match the current filters</div>
                          <div className="text-xs leading-5 text-slate-500">Try widening the date range or clearing one of the invoice filters.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    ledger.rows.map((row) => (
                      <tr key={row.invoiceId} className="border-b border-slate-200/80 align-top transition-colors hover:bg-slate-50/60 last:border-b-0">
                        <td className="px-3 py-3">
                          {row.jobHref ? (
                            <Link href={row.jobHref} className="font-medium text-blue-700 hover:underline">
                              {row.invoiceNumber}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900">{row.invoiceNumber}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{row.invoiceStatusLabel}</td>
                        <td className="px-3 py-3 text-slate-700">{row.sourceTypeLabel}</td>
                        <td className="px-3 py-3 text-slate-700">{row.customerDisplay}</td>
                        <td className="px-3 py-3 text-slate-700"><div className="max-w-[16rem] text-xs leading-5">{row.locationDisplay}</div></td>
                        <td className="px-3 py-3">
                          {row.jobHref ? (
                            <Link href={row.jobHref} className="font-mono text-xs text-blue-700 hover:underline">{row.jobReference}</Link>
                          ) : (
                            <span className="font-mono text-xs text-slate-500">{row.jobReference}</span>
                          )}
                        </td>
                        <td className="px-3 py-3"><span className="font-mono text-xs text-slate-700">{row.serviceCaseReference}</span></td>
                        <td className="px-3 py-3 text-slate-700">{row.contractorDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.invoiceDateDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.issuedDateDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.lastCommunicationDateDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.recipientDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.communicationStateLabel}</td>
                        <td className="px-3 py-3 text-slate-700">{row.subtotalDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.totalDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.voidedDateDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.amountPaidDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.balanceDueDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.paymentStatusLabel}</td>
                        <td className="px-3 py-3 text-slate-700">{row.lastPaymentDateDisplay}</td>
                        <td className="px-3 py-3 text-slate-700">{row.paymentCountDisplay}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}