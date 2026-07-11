import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import {
  ReportFilterPanel,
  ReportPageHeader,
  ReportStatCard,
  ReportStatGrid,
  ReportTableShell,
  reportActionClass,
  reportCheckboxClass,
  reportControlClass,
  reportLabelClass,
  reportPageClass,
  reportTableHeadClass,
  reportTableRowClass,
} from "@/components/reports/ReportLedgerChrome";
import {
  CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS,
  CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT,
  CLOSEOUT_FOLLOW_UP_LEDGER_OPS_STATUS_OPTIONS,
  CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT,
  CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS,
  CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS,
  buildCloseoutFollowUpLedgerSearchParams,
  getCloseoutFollowUpLedgerFilterOptions,
  listCloseoutFollowUpLedgerRows,
  parseCloseoutFollowUpLedgerFilters,
} from "@/lib/reports/closeout-follow-up-ledger";

export const metadata = {
  title: "Closeout Follow-up",
  description: "Find completed work that still needs paperwork, invoice action, or final review.",
};

function booleanPill(value: boolean, trueLabel: string) {
  return value ? (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      {trueLabel}
    </span>
  ) : (
    <span className="text-xs text-slate-400">-</span>
  );
}

export default async function CloseoutFollowUpLedgerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getRequestUser();
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

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = parseCloseoutFollowUpLedgerFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [ledger, filterOptions] = await Promise.all([
    listCloseoutFollowUpLedgerRows({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      filters,
      internalBusinessDisplayName: internalBusinessIdentity.display_name,
      limit: CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT,
    }),
    getCloseoutFollowUpLedgerFilterOptions({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
  ]);

  const exportHref = `/reports/closeout/export?${buildCloseoutFollowUpLedgerSearchParams(filters).toString()}`;
  const closeoutVisible = ledger.rows.filter((row) => row.closeoutQueue).length;
  const paperworkVisible = ledger.rows.filter((row) => row.paperworkRequired).length;
  const invoiceVisible = ledger.rows.filter((row) => row.invoiceRequired).length;
  const agingSevenPlusVisible = ledger.rows.filter((row) => Number(row.agingDays ?? 0) >= 7).length;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Closeout follow-up"
        description="Find completed work that still needs paperwork, invoice action, or final review."
        countSummary={`Showing ${ledger.rows.length} of ${ledger.totalCount} closeout items`}
        truncatedNote={ledger.truncated ? `Page view is capped at ${CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT} items. Export includes up to ${CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT} items.` : null}
        truthNote="Use this page to clear follow-up. Open the job to finish paperwork, invoicing, or closeout steps."
      />

      <ReportCenterTabs current="closeout" />

      <ReportStatGrid>
        <ReportStatCard label="Items shown" value={ledger.rows.length} helperText="Closeout items currently shown with the active filters." />
        <ReportStatCard label="Needs final review" value={closeoutVisible} helperText="Jobs still in closeout follow-up." tone="rose" />
        <ReportStatCard label="Needs invoice" value={invoiceVisible} helperText="Jobs still waiting on invoice action." tone="blue" />
        <ReportStatCard label="7+ days waiting" value={agingSevenPlusVisible} helperText="Follow-up items waiting seven days or more." tone="rose" />
        <ReportStatCard label="Needs paperwork" value={paperworkVisible} helperText="Jobs still showing paperwork requirements." />
      </ReportStatGrid>

      <ReportFilterPanel
        title="Find closeout work"
        description="Narrow the list by closeout need, paperwork, invoice status, contractor, team member, date, or status."
      >
        <form action="/reports/closeout" method="get" className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_1fr_0.9fr_0.9fr_0.9fr]">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="closeout_only" value="1" defaultChecked={filters.closeoutOnly} className={reportCheckboxClass} />
              <span>Needs final review only</span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="paperwork_only" value="1" defaultChecked={filters.paperworkOnly} className={reportCheckboxClass} />
              <span>Needs paperwork</span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="invoice_only" value="1" defaultChecked={filters.invoiceOnly} className={reportCheckboxClass} />
              <span>Needs invoice</span>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className={reportLabelClass}>Status</span>
              <select name="ops_status" defaultValue={filters.opsStatus} className={reportControlClass}>
                <option value="">All statuses</option>
                {CLOSEOUT_FOLLOW_UP_LEDGER_OPS_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className={reportLabelClass}>Date field</span>
              <select name="date_field" defaultValue={filters.dateField} className={reportControlClass}>
                {CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
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
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:min-w-[60rem]">
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
                <span className={reportLabelClass}>Assigned team</span>
                <select name="assignee" defaultValue={filters.assigneeUserId} className={reportControlClass}>
                  <option value="">All assignees</option>
                  {filterOptions.assignees.map((assignee) => (
                    <option key={assignee.user_id} value={assignee.user_id}>{assignee.display_name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Scope</span>
                <select name="scope" defaultValue={filters.scope} className={reportControlClass}>
                  {CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className={reportLabelClass}>Sort</span>
                <select name="sort" defaultValue={filters.sort} className={reportControlClass}>
                  {CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:justify-end">
              <button type="submit" className={reportActionClass("primary")}>
                Apply filters
              </button>
              <Link href="/reports/closeout" className={reportActionClass()}>
                Reset
              </Link>
              <Link href={exportHref} className={reportActionClass()}>
                Export CSV
              </Link>
            </div>
          </div>
        </form>
        <p className="text-xs leading-5 text-slate-600">Scope controls whether you are viewing active backlog, historical, or all closeout work. Date field controls which closeout milestone date the From/To range filters.</p>
      </ReportFilterPanel>

      <ReportTableShell note="Start with the job, then check what is blocking closeout and how long it has been waiting.">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr className={reportTableHeadClass}>
                <th className="px-3 py-3">Job</th>
                <th className="px-3 py-3">Visit</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Contractor</th>
                <th className="px-3 py-3">Assigned team</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Work History</th>
                <th className="px-3 py-3">Scheduled</th>
                <th className="px-3 py-3">Completed</th>
                <th className="px-3 py-3">Follow-up</th>
                <th className="px-3 py-3">Paperwork</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Closeout</th>
                <th className="px-3 py-3">Days waiting</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-12 text-center text-sm text-slate-500">
                    <div className="mx-auto max-w-md space-y-2">
                      <div className="font-semibold text-slate-700">No closeout work found</div>
                      <div className="text-xs leading-5 text-slate-500">Try widening the date range or clearing a filter.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                ledger.rows.map((row) => (
                  <tr key={row.jobId} className={reportTableRowClass}>
                    <td className="px-3 py-3">
                      <Link href={row.jobHref} className="font-medium text-blue-700 hover:underline" title={row.jobId}>
                        <span className="font-mono text-xs">{row.jobReference}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[18rem]">
                        <div className="font-medium text-slate-900">{row.displayTitle}</div>
                        {row.visitReason ? (
                          <div className="mt-1 text-xs leading-5 text-slate-500">{row.visitReason}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.jobTypeLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{row.customerDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="max-w-[16rem] text-xs leading-5">{row.locationDisplay}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.contractorDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.primaryAssigneeDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.opsStatusLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{row.lifecycleStatusLabel}</td>
                    <td className="px-3 py-3 text-slate-700"><span className="font-mono text-xs">{row.serviceCaseReference}</span></td>
                    <td className="px-3 py-3 text-slate-700">{row.scheduledDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.fieldCompleteDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="max-w-[14rem] space-y-0.5 text-xs leading-5">
                        {row.followUpDateDisplay !== "-" ? <div>Due {row.followUpDateDisplay}</div> : null}
                        {row.actionRequiredByLabel !== "-" ? <div>Owner: {row.actionRequiredByLabel}</div> : null}
                        {row.nextActionPreview !== "-" ? <div className="text-slate-500">{row.nextActionPreview}</div> : null}
                        {row.followUpDateDisplay === "-" && row.actionRequiredByLabel === "-" && row.nextActionPreview === "-" ? (
                          <div className="text-slate-400">No follow-up set</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{booleanPill(row.paperworkRequired, "Required")}</td>
                    <td className="px-3 py-3">{booleanPill(row.invoiceRequired, "Required")}</td>
                    <td className="px-3 py-3">{booleanPill(row.closeoutQueue, "In queue")}</td>
                    <td className="px-3 py-3 text-slate-700">{row.agingDays == null ? <span className="text-xs text-slate-400">-</span> : row.agingDays}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </ReportTableShell>
    </div>
  );
}
