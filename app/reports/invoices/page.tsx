import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveBillingModeByAccountOwnerId, resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
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
  const issuedVisible = ledger.rows.filter((row) => row.invoiceStatusLabel.toLowerCase() === "issued").length;
  const draftVisible = ledger.rows.filter((row) => row.invoiceStatusLabel.toLowerCase() === "draft").length;
  const balanceVisible = ledger.rows.filter((row) => row.balanceDueDisplay !== "$0").length;
  const paidVisible = ledger.rows.filter((row) => row.paymentStatusLabel.toLowerCase() === "paid").length;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Invoices report"
        description="Billed-truth invoice ledger for internal invoices, communication state, issued totals, and recorded payment tracking."
        countSummary={usesInternalInvoicing ? `Showing ${ledger.rows.length} of ${ledger.totalCount} invoice rows` : "External billing mode"}
        truncatedNote={usesInternalInvoicing && ledger.truncated ? `Page view is capped at ${INVOICE_LEDGER_PAGE_LIMIT} rows. Export includes up to ${INVOICE_LEDGER_EXPORT_LIMIT} rows.` : null}
        truthNote="This report shows internal invoice truth only. Recorded payments are tracking fields; no card processing or customer payment execution happens here."
      />

      <ReportCenterTabs current="invoices" />

      {!usesInternalInvoicing ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold text-slate-950">No internal invoices report in this billing mode</h2>
            <p className="text-sm leading-6 text-slate-600">
              This company is configured for external billing. The invoices report only shows real rows from the internal invoice domain, so this surface stays empty rather than inventing billed totals, open invoice counts, or payment-style finance signals.
            </p>
          </div>
        </section>
      ) : (
        <>
          <ReportStatGrid>
            <ReportStatCard label="Visible invoices" value={ledger.rows.length} helperText="Invoice rows currently rendered with the active filters." />
            <ReportStatCard label="Issued visible" value={issuedVisible} helperText="Visible invoices already marked issued." tone="emerald" />
            <ReportStatCard label="Draft visible" value={draftVisible} helperText="Visible invoices still prepared but unissued." tone="blue" />
            <ReportStatCard label="Balance visible" value={balanceVisible} helperText="Visible invoices with a non-zero tracked balance." tone="rose" />
            <ReportStatCard label="Paid visible" value={paidVisible} helperText="Visible invoices marked paid by recorded payment entries." />
          </ReportStatGrid>

          <ReportFilterPanel
            title="Filter invoice rows"
            description="Narrow internal invoice truth by status, customer, contractor, source type, communication state, date field, and sort order."
          >
            <form action="/reports/invoices" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Invoice status</span>
                <select name="status" defaultValue={filters.status} className={reportControlClass}>
                  <option value="">All statuses</option>
                  {INVOICE_LEDGER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Date field</span>
                <select name="date_field" defaultValue={filters.dateField} className={reportControlClass}>
                  {INVOICE_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
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
                <span className={reportLabelClass}>Customer</span>
                <select name="customer" defaultValue={filters.customerId} className={reportControlClass}>
                  <option value="">All customers</option>
                  {filterOptions.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Contractor</span>
                <select name="contractor" defaultValue={filters.contractorId} className={reportControlClass}>
                  <option value="">All contractors</option>
                  {filterOptions.contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Source type</span>
                <select name="source_type" defaultValue={filters.sourceType} className={reportControlClass}>
                  <option value="">All source types</option>
                  {INVOICE_LEDGER_SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Communication state</span>
                <select name="communication_state" defaultValue={filters.communicationState} className={reportControlClass}>
                  <option value="">All states</option>
                  {INVOICE_LEDGER_COMMUNICATION_STATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Sort</span>
                <select name="sort" defaultValue={filters.sort} className={reportControlClass}>
                  {INVOICE_LEDGER_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-end gap-2 xl:col-span-2 xl:justify-end">
                <button type="submit" className={reportActionClass("primary")}>
                  Apply filters
                </button>
                <Link href="/reports/invoices" className={reportActionClass()}>
                  Reset
                </Link>
                <Link href={exportHref} className={reportActionClass()}>
                  Export CSV
                </Link>
              </div>
            </form>
          </ReportFilterPanel>

          <ReportTableShell note="Scan left to right: invoice and visit identity first, communication status next, then billed totals and recorded payment tracking fields.">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/90">
                  <tr className={reportTableHeadClass}>
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
                    <th className="px-3 py-3">Send Status</th>
                    <th className="px-3 py-3">Subtotal</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3">Voided</th>
                    <th className="px-3 py-3">Amount Paid</th>
                    <th className="px-3 py-3">Balance Due</th>
                    <th className="px-3 py-3">Payment Status</th>
                    <th className="px-3 py-3">Last Payment</th>
                    <th className="px-3 py-3">Payment Count</th>
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
                      <tr key={row.invoiceId} className={reportTableRowClass}>
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
          </ReportTableShell>
        </>
      )}
    </div>
  );
}
