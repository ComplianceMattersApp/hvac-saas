import Link from "next/link";
import { redirect } from "next/navigation";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS,
  JOB_VISIT_LEDGER_EXPORT_LIMIT,
  JOB_VISIT_LEDGER_JOB_TYPE_OPTIONS,
  JOB_VISIT_LEDGER_OPS_STATUS_OPTIONS,
  JOB_VISIT_LEDGER_PAGE_LIMIT,
  JOB_VISIT_LEDGER_SCOPE_OPTIONS,
  JOB_VISIT_LEDGER_SORT_OPTIONS,
  buildJobVisitLedgerSearchParams,
  getJobVisitLedgerFilterOptions,
  listJobVisitLedgerRows,
  parseJobVisitLedgerFilters,
} from "@/lib/reports/job-visit-ledger";

export const metadata = {
  title: "Reports",
  description: "Internal report center",
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

export default async function ReportsPage({
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

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = parseJobVisitLedgerFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [ledger, filterOptions] = await Promise.all([
    listJobVisitLedgerRows({
      supabase,
      filters,
      internalBusinessDisplayName: internalBusinessIdentity.display_name,
      limit: JOB_VISIT_LEDGER_PAGE_LIMIT,
    }),
    getJobVisitLedgerFilterOptions({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
  ]);

  const exportHref = `/reports/job-visit-ledger/export?${buildJobVisitLedgerSearchParams(filters).toString()}`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-1 py-2 text-slate-900">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center</h1>
          <p className="mt-1 text-sm text-slate-600">Job / Visit Ledger</p>
        </div>
        <div className="text-sm text-slate-600">
          <div>
            Showing {ledger.rows.length} of {ledger.totalCount} visit rows
          </div>
          {ledger.truncated ? (
            <div className="text-xs text-slate-500">Page view is capped at {JOB_VISIT_LEDGER_PAGE_LIMIT} rows. Export includes up to {JOB_VISIT_LEDGER_EXPORT_LIMIT} rows.</div>
          ) : null}
        </div>
      </header>

      <ReportCenterTabs current="jobs" />

      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.2)]">
        <form action="/reports" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date field</span>
            <select name="date_field" defaultValue={filters.dateField} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              {JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Ops status</span>
            <select name="ops_status" defaultValue={filters.opsStatus} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">All statuses</option>
              {JOB_VISIT_LEDGER_OPS_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Assigned tech</span>
            <select name="assignee" defaultValue={filters.assigneeUserId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">All assignees</option>
              {filterOptions.assignees.map((assignee) => (
                <option key={assignee.user_id} value={assignee.user_id}>{assignee.display_name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Job type</span>
            <select name="job_type" defaultValue={filters.jobType} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">All types</option>
              {JOB_VISIT_LEDGER_JOB_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Scope</span>
            <select name="scope" defaultValue={filters.scope} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              {JOB_VISIT_LEDGER_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Sort</span>
            <select name="sort" defaultValue={filters.sort} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
              {JOB_VISIT_LEDGER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2 xl:col-span-2">
            <button type="submit" className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Apply filters
            </button>
            <Link href="/reports" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Reset
            </Link>
            <Link href={exportHref} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Export CSV
            </Link>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_14px_30px_-28px_rgba(15,23,42,0.2)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-3 py-3">Job Ref</th>
                <th className="px-3 py-3">Visit</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Contractor</th>
                <th className="px-3 py-3">Assigned Tech</th>
                <th className="px-3 py-3">Ops Status</th>
                <th className="px-3 py-3">Lifecycle</th>
                <th className="px-3 py-3">Service Case</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Scheduled</th>
                <th className="px-3 py-3">Completed</th>
                <th className="px-3 py-3">Paperwork</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Closeout</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-sm text-slate-500">
                    No visit rows match the current filters.
                  </td>
                </tr>
              ) : (
                ledger.rows.map((row) => (
                  <tr key={row.jobId} className="border-b border-slate-200/80 align-top last:border-b-0">
                    <td className="px-3 py-3">
                      <Link href={row.jobHref} className="font-medium text-blue-700 hover:underline" title={row.jobId}>
                        <span className="font-mono text-xs">{row.jobReference}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[20rem]">
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
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.opsStatusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.lifecycleStatusLabel}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs text-slate-600">{row.serviceCaseReference}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.createdDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.scheduledDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.completedDateDisplay}</td>
                    <td className="px-3 py-3">{booleanPill(row.paperworkRequired, "Required")}</td>
                    <td className="px-3 py-3">{booleanPill(row.invoiceRequired, "Required")}</td>
                    <td className="px-3 py-3">{booleanPill(row.closeoutQueue, "In queue")}</td>
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