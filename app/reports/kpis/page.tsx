import Link from "next/link";
import { redirect } from "next/navigation";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  REPORT_CENTER_KPI_GRANULARITY_OPTIONS,
  buildReportCenterKpiSearchParams,
  parseReportCenterKpiFilters,
  type ReportCenterKpiFamilyReadModel,
} from "@/lib/reports/kpi-foundation";
import { listReportCenterKpiFamilies } from "@/lib/reports/report-center-kpis";

export const metadata = {
  title: "KPI Reference",
  description: "Internal KPI reference and definition surface",
};

const PRIORITY_ORDER = {
  primary: 0,
  secondary: 1,
  supporting: 2,
  deferred: 3,
} as const;

function priorityBadgeClass(priority: "primary" | "secondary" | "supporting" | "deferred") {
  if (priority === "primary") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (priority === "secondary") return "border-sky-200 bg-sky-50 text-sky-700";
  if (priority === "supporting") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function priorityLabel(priority: "primary" | "secondary" | "supporting" | "deferred") {
  if (priority === "primary") return "Primary";
  if (priority === "secondary") return "Secondary";
  if (priority === "supporting") return "Supporting";
  return "Deferred";
}

function modeBadgeClass(mode: "bucketed" | "snapshot") {
  return mode === "bucketed"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function FamilySection({ family }: { family: ReportCenterKpiFamilyReadModel }) {
  const metrics = [...family.metrics].sort(
    (left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority],
  );
  const counts = {
    primary: metrics.filter((metric) => metric.priority === "primary").length,
    secondary: metrics.filter((metric) => metric.priority === "secondary").length,
    supporting: metrics.filter((metric) => metric.priority === "supporting").length,
    deferred: metrics.filter((metric) => metric.priority === "deferred").length,
  };

  return (
    <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/50 p-5 shadow-[0_16px_30px_-32px_rgba(15,23,42,0.28)]">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">{family.familyLabel}</h2>
          <p className="mt-1 text-sm text-slate-600">{family.familyDescription}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{counts.primary} primary</span>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{counts.secondary} secondary</span>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{counts.supporting} supporting</span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">{counts.deferred} deferred</span>
          </div>
        </div>
        <p className="max-w-[44rem] text-xs leading-5 text-slate-500">{family.sourceSummary}</p>
      </header>

      <div className="mt-4 overflow-x-auto rounded-[20px] border border-slate-200/90 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <th className="px-3 py-3">KPI</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Current Value</th>
              <th className="px-3 py-3">Mode</th>
              <th className="px-3 py-3">Dashboard Use</th>
              <th className="px-3 py-3">Definition</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.key} className="border-b border-slate-200/80 align-top transition-colors hover:bg-slate-50/60 last:border-b-0">
                <td className="px-3 py-3 text-slate-900">
                  <div className="font-medium">{metric.label}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(metric.priority)}`}>
                    {priorityLabel(metric.priority)}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700">{metric.currentValue}</td>
                <td className="px-3 py-3 text-slate-700">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${modeBadgeClass(metric.mode)}`}>
                    {metric.mode === "bucketed" ? "Bucketed" : "Snapshot"}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <div className="max-w-[15rem] text-xs leading-5">{metric.dashboardRole}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <details className="min-w-[22rem] rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      View definition
                    </summary>
                    <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
                      <div>
                        <div className="font-semibold uppercase tracking-[0.08em] text-slate-500">Why it matters</div>
                        <p className="mt-1">{metric.priorityReason}</p>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <div className="font-semibold uppercase tracking-[0.08em] text-slate-500">Source</div>
                          <p className="mt-1">{metric.source}</p>
                        </div>
                        <div>
                          <div className="font-semibold uppercase tracking-[0.08em] text-slate-500">Bucket Rule</div>
                          <p className="mt-1">{metric.bucketRule}</p>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold uppercase tracking-[0.08em] text-slate-500">Derivation</div>
                        <p className="mt-1">{metric.derivation}</p>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4 rounded-[20px] border border-slate-200 bg-white/80 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
          Bucket checks
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Family-level bucket values stay available for technical review, but are kept out of the default KPI triage view.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[18px] border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-3 py-3">Bucket</th>
                {family.bucketColumns.map((column) => (
                  <th key={column.key} className="px-3 py-3">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {family.bucketRows.map((row) => (
                <tr key={row.bucketKey} className="border-b border-slate-200/80 transition-colors hover:bg-slate-50/50 last:border-b-0">
                  <td className="px-3 py-3 font-medium text-slate-900">{row.bucketLabel}</td>
                  {family.bucketColumns.map((column) => (
                    <td key={column.key} className="px-3 py-3 text-slate-700">{row.values[column.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default async function ReportCenterKpiPage({
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
  const filters = parseReportCenterKpiFilters(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const [operational, continuity] = await listReportCenterKpiFamilies({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    filters,
  });

  const resetHref = "/reports/kpis";
  const shareHref = `/reports/kpis?${buildReportCenterKpiSearchParams(filters).toString()}`;

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 px-2 py-3 text-slate-900">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center</h1>
          <p className="mt-1 text-sm text-slate-600">KPI Reference</p>
        </div>
        <div className="max-w-[34rem] text-sm leading-6 text-slate-500 md:text-right">
          Reference surface for KPI definitions, ranking, source mapping, and bucket behavior. This page stays explicit on purpose.
        </div>
      </header>

      <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/75 p-4 text-sm text-slate-700 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.2)]">
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Primary = likely first dashboard row</span>
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">Secondary = useful, but not top billing</span>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">Supporting = report or drill context</span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700">Deferred = technically honest, not dashboard-prominent yet</span>
        </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Use this page to inspect how a metric is calculated and whether it belongs on the dashboard. Use the Dashboard for the plain-language operational view.
          </p>
      </section>

      <ReportCenterTabs current="kpis" />

      <section className="rounded-[24px] border border-slate-200/90 bg-slate-50/80 p-5 shadow-[0_16px_30px_-32px_rgba(15,23,42,0.28)]">
        <form action="/reports/kpis" method="get" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 md:grid-cols-3 lg:min-w-[46rem]">
            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Granularity</span>
              <select name="granularity" defaultValue={filters.granularity} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                {REPORT_CENTER_KPI_GRANULARITY_OPTIONS.map((option) => (
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

          <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            <button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Apply range
            </button>
            <Link href={resetHref} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Reset
            </Link>
            <Link href={shareHref} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Copyable URL
            </Link>
          </div>
        </form>
      </section>

      <FamilySection family={operational} />
      <FamilySection family={continuity} />
    </div>
  );
}