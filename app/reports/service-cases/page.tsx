import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import {
  SERVICE_CASE_CONTINUITY_DATE_FIELD_OPTIONS,
  SERVICE_CASE_CONTINUITY_EXPORT_LIMIT,
  SERVICE_CASE_CONTINUITY_KIND_OPTIONS,
  SERVICE_CASE_CONTINUITY_PAGE_LIMIT,
  SERVICE_CASE_CONTINUITY_SORT_OPTIONS,
  SERVICE_CASE_CONTINUITY_STATUS_OPTIONS,
  buildServiceCaseContinuitySearchParams,
  getServiceCaseContinuityFilterOptions,
  listServiceCaseContinuityRows,
  parseServiceCaseContinuityFilters,
} from "@/lib/reports/service-case-continuity";

export const metadata = {
  title: "Service Cases Report",
  description: "Internal service cases report",
};

export default async function ServiceCaseContinuityPage({
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
  const filters = parseServiceCaseContinuityFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [ledger, filterOptions] = await Promise.all([
    listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      filters,
      internalBusinessDisplayName: internalBusinessIdentity.display_name,
      limit: SERVICE_CASE_CONTINUITY_PAGE_LIMIT,
    }),
    getServiceCaseContinuityFilterOptions({ supabase }),
  ]);

  const exportHref = `/reports/service-cases/export?${buildServiceCaseContinuitySearchParams(filters).toString()}`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-2 py-3 text-slate-900">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center</h1>
          <p className="mt-1 text-sm text-slate-600">Service Cases Report</p>
        </div>
        <div className="max-w-[24rem] text-sm text-slate-600 md:text-right">
          <div>Showing {ledger.rows.length} of {ledger.totalCount} service cases</div>
          {ledger.truncated ? (
            <div className="text-xs text-slate-500">Page view is capped at {SERVICE_CASE_CONTINUITY_PAGE_LIMIT} rows. Export includes up to {SERVICE_CASE_CONTINUITY_EXPORT_LIMIT} rows.</div>
          ) : null}
        </div>
      </header>

      <ReportCenterTabs current="service-cases" />

      <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/80 p-5 shadow-[0_20px_34px_-32px_rgba(15,23,42,0.35)]">
        <form action="/reports/service-cases" method="get" className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_0.85fr_0.9fr_0.9fr_auto]">
            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Case status</span>
              <select name="case_status" defaultValue={filters.caseStatus} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">All statuses</option>
                {SERVICE_CASE_CONTINUITY_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Case kind</span>
              <select name="case_kind" defaultValue={filters.caseKind} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">All kinds</option>
                {SERVICE_CASE_CONTINUITY_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date field</span>
              <select name="date_field" defaultValue={filters.dateField} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                {SERVICE_CASE_CONTINUITY_DATE_FIELD_OPTIONS.map((option) => (
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

            <div className="grid gap-2 xl:mt-6">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" name="repeat_only" value="1" defaultChecked={filters.repeatOnly} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300" />
                <span>Multiple visits only</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" name="active_repeat_visits" value="1" defaultChecked={Boolean(filters.activeRepeatOnly)} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300" />
                <span>Active repeat visits only</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 md:grid-cols-2 lg:min-w-[32rem] lg:grid-cols-[1.2fr_0.9fr]">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Contractor</span>
                <select name="contractor" defaultValue={filters.contractorId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">Any linked contractor</option>
                  {filterOptions.contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Sort</span>
                <select name="sort" defaultValue={filters.sort} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {SERVICE_CASE_CONTINUITY_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            <button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Apply filters
            </button>
            <Link href="/reports/service-cases" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
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
                <th className="px-3 py-3">Case Ref</th>
                <th className="px-3 py-3">Case Problem Summary</th>
                <th className="px-3 py-3">Kind</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Latest Contractor</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Resolved</th>
                <th className="px-3 py-3">Resolved By Job</th>
                <th className="px-3 py-3">Visit Count</th>
                <th className="px-3 py-3">Latest Visit</th>
                <th className="px-3 py-3">Latest Visit Ops</th>
                <th className="px-3 py-3">Latest Assigned Tech</th>
                <th className="px-3 py-3">Open Linked Visits</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-sm text-slate-500">
                    <div className="mx-auto max-w-md space-y-2">
                      <div className="font-semibold text-slate-700">No service cases match the current filters</div>
                      <div className="text-xs leading-5 text-slate-500">Try widening the date range or clearing one of the case filters.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                ledger.rows.map((row) => (
                  <tr key={row.serviceCaseId} className="border-b border-slate-200/80 align-top transition-colors hover:bg-slate-50/60 last:border-b-0">
                    <td className="px-3 py-3">
                      <Link href={row.serviceCaseHref} className="font-medium text-blue-700 hover:underline" title={row.serviceCaseId}>
                        <span className="font-mono text-xs">{row.serviceCaseReference}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[20rem] text-slate-900">{row.problemSummary}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.caseKindLabel}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">{row.caseStatusLabel}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.customerDisplay}</td>
                    <td className="px-3 py-3 text-slate-700"><div className="max-w-[16rem] text-xs leading-5">{row.locationDisplay}</div></td>
                    <td className="px-3 py-3 text-slate-700">{row.latestContractorDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.createdDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.resolvedDateDisplay}</td>
                    <td className="px-3 py-3">
                      {row.resolvedByJobHref ? (
                        <Link href={row.resolvedByJobHref} className="font-mono text-xs text-blue-700 hover:underline">{row.resolvedByJobReference}</Link>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.visitCount}</td>
                    <td className="px-3 py-3 text-slate-700">{row.latestVisitDateDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.latestVisitOpsStatusLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{row.latestAssignedTechDisplay}</td>
                    <td className="px-3 py-3 text-slate-700">{row.activeLinkedVisitCount}</td>
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