import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
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
  title: "Closeout Report",
  description: "Internal closeout report",
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
  const filters = parseCloseoutFollowUpLedgerFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [ledger, filterOptions] = await Promise.all([
    listCloseoutFollowUpLedgerRows({
      supabase,
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

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 px-2 py-3 text-slate-900">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center</h1>
          <p className="mt-1 text-sm text-slate-600">Closeout Report</p>
        </div>
        <div className="max-w-[24rem] text-sm text-slate-600 md:text-right">
          <div>Showing {ledger.rows.length} of {ledger.totalCount} visit rows</div>
          {ledger.truncated ? (
            <div className="text-xs text-slate-500">Page view is capped at {CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT} rows. Export includes up to {CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT} rows.</div>
          ) : null}
        </div>
      </header>

      <ReportCenterTabs current="closeout" />

      <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/80 p-5 shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
        <form action="/reports/closeout" method="get" className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_1fr_0.9fr_0.9fr_0.9fr]">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="closeout_only" value="1" defaultChecked={filters.closeoutOnly} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300" />
              <span>Closeout queue only</span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="paperwork_only" value="1" defaultChecked={filters.paperworkOnly} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300" />
              <span>Paperwork required</span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 xl:mt-6">
              <input type="checkbox" name="invoice_only" value="1" defaultChecked={filters.invoiceOnly} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300" />
              <span>Invoice required</span>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Ops status</span>
              <select name="ops_status" defaultValue={filters.opsStatus} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">All statuses</option>
                {CLOSEOUT_FOLLOW_UP_LEDGER_OPS_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date field</span>
              <select name="date_field" defaultValue={filters.dateField} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                {CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
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
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:min-w-[60rem]">
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
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Assigned tech</span>
                <select name="assignee" defaultValue={filters.assigneeUserId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All assignees</option>
                  {filterOptions.assignees.map((assignee) => (
                    <option key={assignee.user_id} value={assignee.user_id}>{assignee.display_name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Scope</span>
                <select name="scope" defaultValue={filters.scope} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Sort</span>
                <select name="sort" defaultValue={filters.sort} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:justify-end">
              <button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                Apply filters
              </button>
              <Link href="/reports/closeout" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                Reset
              </Link>
              <Link href={exportHref} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                Export CSV
              </Link>
            </div>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-3 py-3">Job Ref</th>
                <th className="px-3 py-3">Visit</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Contractor</th>
                <th className="px-3 py-3">Assigned Tech</th>
                <th className="px-3 py-3">Ops Status</th>
                <th className="px-3 py-3">Lifecycle Status</th>
                <th className="px-3 py-3">Service Case</th>
                <th className="px-3 py-3">Scheduled</th>
                <th className="px-3 py-3">Field Complete</th>
                <th className="px-3 py-3">Follow-up</th>
                <th className="px-3 py-3">Paperwork</th>
                <th className="px-3 py-3">Invoice Needed</th>
                <th className="px-3 py-3">Closeout Needed</th>
                <th className="px-3 py-3">Aging</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-12 text-center text-sm text-slate-500">
                    <div className="mx-auto max-w-md space-y-2">
                      <div className="font-semibold text-slate-700">No closeout rows match the current filters</div>
                      <div className="text-xs leading-5 text-slate-500">Try widening the date range or clearing one of the closeout filters.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                ledger.rows.map((row) => (
                  <tr key={row.jobId} className="border-b border-slate-200/80 align-top transition-colors hover:bg-slate-50/60 last:border-b-0">
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
        </div>
      </section>
    </div>
  );
}