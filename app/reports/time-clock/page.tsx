
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
import { isInternalAccessError } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { createClient } from "@/lib/supabase/server";
import {
  TIME_CLOCK_REPORT_EXPORT_LIMIT,
  TIME_CLOCK_REPORT_PAGE_LIMIT,
  TIME_CLOCK_REPORT_STATUS_OPTIONS,
  buildTimeClockReportSearchParams,
  getTimeClockReportFilterOptions,
  listTimeClockReportEntriesForAccount,
  parseTimeClockReportFilters,
  requireAdminReportActor,
} from "@/lib/reports/time-clock-report";

export const metadata = {
  title: "Time Clock Report",
  description: "Administrative time entry history report",
};

export default async function TimeClockReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireAdminReportActor>>["internalUser"];
  try {
    ({ internalUser } = await requireAdminReportActor({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: contractorUser, error: contractorError } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorError) throw contractorError;
      if (contractorUser?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = parseTimeClockReportFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [report, filterOptions] = await Promise.all([
    listTimeClockReportEntriesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      filters,
      limit: TIME_CLOCK_REPORT_PAGE_LIMIT,
    }),
    getTimeClockReportFilterOptions({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
  ]);

  const exportHref = `/reports/time-clock/export?${buildTimeClockReportSearchParams(filters).toString()}`;
  const adjustedVisible = report.rows.filter((row) => row.adjusted).length;
  const openVisible = report.rows.filter((row) => row.statusLabel === "Open").length;
  const reviewVisible = report.rows.filter((row) => row.statusLabel === "Needs review").length;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Time Clock Report"
        description="Historical visibility for internal time entries with optional CSV export. This surface is not payroll, wages, overtime, or approval workflow."
        countSummary={`Showing ${report.rows.length} of ${report.totalCount} time entries`}
        truncatedNote={report.truncated ? `Page view is capped at ${TIME_CLOCK_REPORT_PAGE_LIMIT} rows. Export includes up to ${TIME_CLOCK_REPORT_EXPORT_LIMIT} rows.` : null}
        truthNote="Time entries come from the durable internal time-entry ledger. This report is historical visibility only and does not calculate payroll or overtime."
      />

      <ReportCenterTabs current="time-clock" />

      <ReportStatGrid>
        <ReportStatCard label="Visible rows" value={report.rows.length} helperText="Rows currently rendered with the active filters." />
        <ReportStatCard label="Adjusted visible" value={adjustedVisible} helperText="Visible entries with an adjustment marker or correction metadata." tone="blue" />
        <ReportStatCard label="Open visible" value={openVisible} helperText="Visible entries still showing an open status." tone="rose" />
        <ReportStatCard label="Needs review visible" value={reviewVisible} helperText="Visible entries currently marked for review." tone="emerald" />
      </ReportStatGrid>

      <ReportFilterPanel
        title="Filter time entries"
        description="Use date range, employee, and status to narrow the historical time-entry ledger."
      >
        <form action="/reports/time-clock" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>From</span>
            <input name="from" type="date" defaultValue={filters.fromDate} className={reportControlClass} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>To</span>
            <input name="to" type="date" defaultValue={filters.toDate} className={reportControlClass} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Employee</span>
            <select name="internal_user_id" defaultValue={filters.internalUserId} className={reportControlClass}>
              <option value="">All team members</option>
              {filterOptions.internalUsers.map((userOption) => (
                <option key={userOption.userId} value={userOption.userId}>{userOption.displayName}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Status</span>
            <select name="status" defaultValue={filters.status} className={reportControlClass}>
              <option value="">All statuses</option>
              {TIME_CLOCK_REPORT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            <button type="submit" className={reportActionClass("primary")}>Apply filters</button>
            <Link href="/reports/time-clock" className={reportActionClass()}>Reset</Link>
            <Link href={exportHref} className={reportActionClass()}>Export CSV</Link>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-600">Historical visibility only. Entries remain durable; this page does not delete, reset, approve, or calculate wages.</p>
      </ReportFilterPanel>

      <ReportTableShell note="Scan left to right: employee and status first, then entry timing, then duration and adjustment history.">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/90">
            <tr className={reportTableHeadClass}>
              <th className="px-3 py-3">Employee</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Clock in</th>
              <th className="px-3 py-3">Lunch start</th>
              <th className="px-3 py-3">Lunch end</th>
              <th className="px-3 py-3">Clock out</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Adjusted</th>
              <th className="px-3 py-3">Adjustment reason</th>
              <th className="px-3 py-3">Adjusted by</th>
              <th className="px-3 py-3">Adjusted at</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500">
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="font-semibold text-slate-700">No time entries match the current filters</div>
                    <div className="text-xs leading-5 text-slate-500">Adjust the filters above or reset the report to broaden the historical view.</div>
                  </div>
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.entryId} className={reportTableRowClass}>
                  <td className="px-3 py-3 text-slate-700">{row.employeeDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.statusLabel}</td>
                  <td className="px-3 py-3 text-slate-700">{row.clockInDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.lunchStartDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.lunchEndDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.clockOutDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.durationDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.adjusted ? "Yes" : "No"}</td>
                  <td className="px-3 py-3 text-slate-700"><div className="max-w-[18rem] whitespace-pre-wrap text-xs leading-5">{row.adjustmentReason || "-"}</div></td>
                  <td className="px-3 py-3 text-slate-700">{row.adjustedByDisplay}</td>
                  <td className="px-3 py-3 text-slate-700">{row.adjustedAtDisplay}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportTableShell>
    </div>
  );
}