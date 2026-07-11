import Link from "next/link";
import { redirect } from "next/navigation";
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
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
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
  title: "Jobs & Visits",
  description: "See scheduled, completed, unassigned, and follow-up work in one list.",
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

export default async function JobsReportPage({
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
  const filters = parseJobVisitLedgerFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [ledger, filterOptions] = await Promise.all([
    listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
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
  const unassignedVisible = ledger.rows.filter((row) => row.primaryAssigneeDisplay === "-").length;
  const closeoutVisible = ledger.rows.filter((row) => row.closeoutQueue).length;
  const paperworkVisible = ledger.rows.filter((row) => row.paperworkRequired).length;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Jobs & visits"
        description="See scheduled, completed, unassigned, and follow-up work in one list."
        countSummary={`Showing ${ledger.rows.length} of ${ledger.totalCount} jobs`}
        truncatedNote={ledger.truncated ? `Page view is capped at ${JOB_VISIT_LEDGER_PAGE_LIMIT} items. Export includes up to ${JOB_VISIT_LEDGER_EXPORT_LIMIT} items.` : null}
        truthNote="Use this page to find work. Open a job to update schedule, assignment, closeout, or billing details."
      />

      <ReportCenterTabs current="jobs" />

      <ReportStatGrid>
        <ReportStatCard label="Jobs shown" value={ledger.rows.length} helperText="Jobs currently shown with the active filters." />
        <ReportStatCard label="Total matching jobs" value={ledger.totalCount} helperText="All matching jobs before the page cap." tone="blue" />
        <ReportStatCard label="Unassigned" value={unassignedVisible} helperText="Jobs with no assigned team member." tone="rose" />
        <ReportStatCard label="Needs closeout" value={closeoutVisible} helperText="Jobs currently marked for closeout follow-up." tone="emerald" />
        <ReportStatCard label="Paperwork needed" value={paperworkVisible} helperText="Jobs still showing paperwork requirements." />
      </ReportStatGrid>

      <ReportFilterPanel
        title="Find jobs"
        description="Narrow the list by date, status, contractor, team member, job type, or scope."
      >
        <form action="/reports/jobs" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Date field</span>
            <select name="date_field" defaultValue={filters.dateField} className={reportControlClass}>
              {JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS.map((option) => (
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
            <span className={reportLabelClass}>Status</span>
            <select name="ops_status" defaultValue={filters.opsStatus} className={reportControlClass}>
              <option value="">All statuses</option>
              {JOB_VISIT_LEDGER_OPS_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
            <span className={reportLabelClass}>Assigned team</span>
            <select name="assignee" defaultValue={filters.assigneeUserId} className={reportControlClass}>
              <option value="">All team members</option>
              <option value="unassigned">Unassigned</option>
              {filterOptions.assignees.map((assignee) => (
                <option key={assignee.user_id} value={assignee.user_id}>{assignee.display_name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Job type</span>
            <select name="job_type" defaultValue={filters.jobType} className={reportControlClass}>
              <option value="">All types</option>
              {JOB_VISIT_LEDGER_JOB_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Scope</span>
            <select name="scope" defaultValue={filters.scope} className={reportControlClass}>
              {JOB_VISIT_LEDGER_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Sort</span>
            <select name="sort" defaultValue={filters.sort} className={reportControlClass}>
              {JOB_VISIT_LEDGER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2 xl:col-span-2 xl:justify-end">
            <button type="submit" className={reportActionClass("primary")}>
              Apply filters
            </button>
            <Link href="/reports/jobs" className={reportActionClass()}>
              Reset
            </Link>
            <Link href={exportHref} className={reportActionClass()}>
              Export CSV
            </Link>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-600">Scope controls whether you are viewing active, historical, or all jobs. Date field controls which job date the From/To range uses (created, scheduled, or completed).</p>
      </ReportFilterPanel>

      <ReportTableShell note="Start with the job and assigned team, then check status, schedule, paperwork, invoice, and closeout needs.">
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
                  <td colSpan={16} className="px-4 py-12 text-center text-sm text-slate-500">
                    <div className="mx-auto max-w-md space-y-2">
                      <div className="font-semibold text-slate-700">No jobs found</div>
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
      </ReportTableShell>
    </div>
  );
}
