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
  type ReportCenterKpiFilters,
} from "@/lib/reports/kpi-foundation";
import { buildReportCenterDashboardReadModel } from "@/lib/reports/report-center-dashboard";

export const metadata = {
  title: "Dashboard",
  description: "Internal business dashboard for workload, closeout, continuity, and billed visibility",
};

const DASHBOARD_SECTION_OPTIONS = [
  { value: "top-line", label: "Top line" },
  { value: "operations", label: "Operations" },
  { value: "closeout", label: "Closeout / Admin" },
  { value: "continuity", label: "Service Cases" },
  { value: "invoice", label: "Invoices" },
  { value: "tech-workload", label: "Tech workload" },
] as const;

type DashboardSectionKey = (typeof DASHBOARD_SECTION_OPTIONS)[number]["value"];
type DashboardDensity = "comfortable" | "compact";

type DashboardViewState = {
  visibleSections: DashboardSectionKey[];
  density: DashboardDensity;
};

function readMultiParam(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
) {
  if (source instanceof URLSearchParams) {
    return source.getAll(key);
  }

  const value = source[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function parseDashboardViewState(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
): DashboardViewState {
  const requestedSections = readMultiParam(source, "section")
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value): value is DashboardSectionKey =>
      DASHBOARD_SECTION_OPTIONS.some((option) => option.value === value),
    );

  const visibleSections = requestedSections.length
    ? Array.from(new Set(requestedSections))
    : DASHBOARD_SECTION_OPTIONS.map((option) => option.value);

  const densityValue = source instanceof URLSearchParams
    ? source.get("density")
    : Array.isArray(source.density)
      ? source.density[0]
      : source.density;

  return {
    visibleSections,
    density: String(densityValue ?? "").trim().toLowerCase() === "compact" ? "compact" : "comfortable",
  };
}

function buildDashboardSearchParams(filters: ReportCenterKpiFilters, viewState: DashboardViewState) {
  const params = buildReportCenterKpiSearchParams(filters);

  if (viewState.density === "compact") {
    params.set("density", "compact");
  }

  const defaultSections = DASHBOARD_SECTION_OPTIONS.map((option) => option.value);
  const normalizedSections = Array.from(new Set(viewState.visibleSections));
  const usesDefaultSections =
    normalizedSections.length === defaultSections.length &&
    defaultSections.every((section) => normalizedSections.includes(section));

  if (!usesDefaultSections) {
    for (const section of normalizedSections) {
      params.append("section", section);
    }
  }

  return params;
}

function hasVisibleSection(viewState: DashboardViewState, section: DashboardSectionKey) {
  return viewState.visibleSections.includes(section);
}

function buildRangeParams(filters: ReportCenterKpiFilters) {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  return params;
}

function buildOperationsLedgerHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  params.set("scope", "all");
  return `/reports/jobs?${params.toString()}`;
}

function buildOperationsExportHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  params.set("scope", "all");
  return `/reports/job-visit-ledger/export?${params.toString()}`;
}

function buildCloseoutLedgerHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  return `/reports/closeout?${params.toString()}`;
}

function buildCloseoutExportHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  return `/reports/closeout/export?${params.toString()}`;
}

function buildContinuityLedgerHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  return `/reports/service-cases?${params.toString()}`;
}

function buildContinuityExportHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  return `/reports/service-cases/export?${params.toString()}`;
}

function buildTechWorkloadExportHref(filters: ReportCenterKpiFilters) {
  const params = buildRangeParams(filters);
  return `/reports/dashboard/export/tech-workload?${params.toString()}`;
}

function densityClasses(density: DashboardDensity) {
  if (density === "compact") {
    return {
      card: "p-3",
      section: "p-3",
      topCard: "p-4",
      sectionGap: "space-y-4",
    };
  }

  return {
    card: "p-4",
      section: "p-5",
      topCard: "p-5",
      sectionGap: "space-y-5",
  };
}

function toneClass(tone?: "slate" | "emerald" | "amber" | "sky" | "orange") {
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50/60";
  if (tone === "amber") return "border-amber-200 bg-amber-50/70";
  if (tone === "sky") return "border-sky-200 bg-sky-50/70";
  if (tone === "orange") return "border-orange-200 bg-orange-50/70";
  return "border-slate-300/80 bg-white";
}

function SummaryCard({
  label,
  value,
  helperText,
  href,
  tone,
  density,
}: {
  label: string;
  value: string;
  helperText: string;
  href?: string | null;
  tone?: "slate" | "emerald" | "amber" | "sky" | "orange";
  density: DashboardDensity;
}) {
  const classes = densityClasses(density);

  return (
    <article className={`rounded-[24px] border ${classes.topCard} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.26)] ${toneClass(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helperText}</p>
      {href ? (
        <div className="mt-4 border-t border-slate-200/80 pt-4 text-sm">
          <Link href={href} className="font-semibold text-blue-700 transition-colors hover:text-blue-800">
            View report
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function SectionMetricCard({
  label,
  value,
  helperText,
  href,
  density,
}: {
  label: string;
  value: string;
  helperText: string;
  href?: string | null;
  density: DashboardDensity;
}) {
  const classes = densityClasses(density);

  return (
    <div className={`rounded-[20px] border border-slate-200 bg-white ${classes.card} shadow-[0_14px_28px_-30px_rgba(15,23,42,0.24)]`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helperText}</p>
      {href ? (
        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <Link href={href} className="inline-flex text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800">
            Open report
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function TrendBars({
  points,
  primaryLabel,
  secondaryLabel,
  density,
}: {
  points: Array<{ label: string; primaryValue: number; secondaryValue: number }>;
  primaryLabel: string;
  secondaryLabel: string;
  density: DashboardDensity;
}) {
  const classes = densityClasses(density);

  if (!points.length) {
    return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No trend data in this range.</div>;
  }

  const maxValue = Math.max(
    ...points.flatMap((point) => [point.primaryValue, point.secondaryValue]),
    0,
  );

  return (
    <div className={`rounded-[20px] border border-slate-200 bg-white ${classes.card} shadow-[0_14px_28px_-30px_rgba(15,23,42,0.2)]`}>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />{primaryLabel}</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />{secondaryLabel}</span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-3 overflow-x-auto pb-2">
        {points.map((point) => {
          const primaryHeight = maxValue > 0 ? Math.max(10, Math.round((point.primaryValue / maxValue) * 120)) : 10;
          const secondaryHeight = maxValue > 0 ? Math.max(10, Math.round((point.secondaryValue / maxValue) * 120)) : 10;
          return (
            <div key={point.label} className="flex min-w-[52px] flex-1 flex-col items-center gap-2">
              <div className="flex h-32 items-end gap-1">
                <div className="w-4 rounded-t bg-slate-400" style={{ height: primaryHeight }} title={`${primaryLabel}: ${point.primaryValue}`} />
                <div className="w-4 rounded-t bg-sky-500" style={{ height: secondaryHeight }} title={`${secondaryLabel}: ${point.secondaryValue}`} />
              </div>
              <div className="text-center text-[11px] leading-4 text-slate-500">{point.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DistributionRows({
  rows,
  density,
}: {
  rows: Array<{
    key: string;
    label: string;
    openCount: number;
    completedCount: number;
    openHref: string | null;
    completedHref: string | null;
  }>;
  density: DashboardDensity;
}) {
  const classes = densityClasses(density);
  const maxValue = Math.max(...rows.flatMap((row) => [row.openCount, row.completedCount]), 0);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${classes.card}`}>
      <div className="space-y-4">
        {rows.map((row) => {
          const openWidth = maxValue > 0 ? `${Math.max(8, Math.round((row.openCount / maxValue) * 100))}%` : "8%";
          const completedWidth = maxValue > 0 ? `${Math.max(8, Math.round((row.completedCount / maxValue) * 100))}%` : "8%";
          return (
            <div key={row.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-950">{row.label}</div>
                <div className="text-xs text-slate-500">Open {row.openCount} • Completed {row.completedCount}</div>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <span>Open work</span>
                    {row.openHref ? <Link href={row.openHref} className="font-semibold text-blue-700 hover:text-blue-800">View jobs</Link> : null}
                  </div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-500" style={{ width: openWidth }} /></div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <span>Completed this period</span>
                    {row.completedHref ? <Link href={row.completedHref} className="font-semibold text-blue-700 hover:text-blue-800">View jobs</Link> : null}
                  </div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-sky-500" style={{ width: completedWidth }} /></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TechWorkloadRows({
  rows,
  note,
  unassignedOpenVisits,
  density,
  exportHref,
}: {
  rows: Array<{
    userId: string;
    techName: string;
    assignedOpenVisits: number;
    closeoutBacklog: number;
    openHref: string;
    closeoutHref: string;
  }>;
  note: string;
  unassignedOpenVisits: number;
  density: DashboardDensity;
  exportHref: string;
}) {
  const classes = densityClasses(density);
  const maxAssigned = Math.max(...rows.map((row) => row.assignedOpenVisits), 0);

  return (
    <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Tech workload</h2>
          <p className="text-sm text-slate-600">Current assignment load and how much of it is already sitting in closeout.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={exportHref} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            Export CSV
          </Link>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const width = maxAssigned > 0 ? `${Math.max(10, Math.round((row.assignedOpenVisits / maxAssigned) * 100))}%` : "10%";
          return (
            <div key={row.userId} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">{row.techName}</div>
                  <div className="mt-1 text-xs text-slate-500">Assigned open visits {row.assignedOpenVisits} • Closeout backlog {row.closeoutBacklog}</div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link href={row.openHref} className="font-semibold text-blue-700 hover:text-blue-800">View jobs</Link>
                  <Link href={row.closeoutHref} className="font-semibold text-blue-700 hover:text-blue-800">View closeout</Link>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-slate-900" style={{ width }} /></div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50/70 p-4 text-sm text-slate-700">
        <div className="font-semibold text-slate-950">Unassigned open visits: {unassignedOpenVisits}</div>
        <p className="mt-1 leading-6">{note}</p>
      </div>
    </section>
  );
}

export default async function ReportCenterDashboardPage({
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
  const viewState = parseDashboardViewState(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const dashboard = await buildReportCenterDashboardReadModel({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    filters,
  });
  const dashboardSearchParams = buildDashboardSearchParams(filters, viewState);
  const shareHref = `/reports/dashboard?${dashboardSearchParams.toString()}`;
  const operationsLedgerHref = buildOperationsLedgerHref(filters);
  const operationsExportHref = buildOperationsExportHref(filters);
  const closeoutLedgerHref = buildCloseoutLedgerHref(filters);
  const closeoutExportHref = buildCloseoutExportHref(filters);
  const continuityLedgerHref = buildContinuityLedgerHref(filters);
  const continuityExportHref = buildContinuityExportHref(filters);
  const techWorkloadExportHref = buildTechWorkloadExportHref(filters);
  const classes = densityClasses(viewState.density);

  return (
    <div className={`mx-auto max-w-[1680px] ${classes.sectionGap} px-2 py-3 text-slate-900`}>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {internalBusinessIdentity.display_name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Report Center Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Jobs, workload, closeout, service cases, and billed activity.</p>
        </div>
        <div className="max-w-[34rem] text-sm leading-6 text-slate-600 md:text-right">
          Built from the current report surfaces and billed truth already on file. Operations, service cases, and invoices stay separate.
        </div>
      </header>

      <ReportCenterTabs current="dashboard" />

      <section className={`rounded-[24px] border border-slate-200/90 bg-slate-50/80 ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
        <form action="/reports/dashboard" method="get" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
            <Link href="/reports/dashboard" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Reset
            </Link>
            <Link href={shareHref} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
              Copyable URL
            </Link>
          </div>

          <div className="w-full lg:max-w-[34rem]">
            <details className="rounded-[20px] border border-slate-200 bg-white/80 p-3.5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                View controls
              </summary>
              <div className="mt-3 space-y-3">
                <label className="grid gap-1 text-sm text-slate-700 md:max-w-[12rem]">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Density</span>
                  <select name="density" defaultValue={viewState.density} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                </label>
                <fieldset className="space-y-2">
                  <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Visible sections</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DASHBOARD_SECTION_OPTIONS.map((option) => (
                      <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="section"
                          value={option.value}
                          defaultChecked={hasVisibleSection(viewState, option.value)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                  Internal reference only. {" "}
                  <Link href={`/reports/kpis?${buildReportCenterKpiSearchParams(filters).toString()}`} className="font-semibold text-slate-700 underline underline-offset-2 transition-colors hover:text-slate-900">
                    Open KPI Reference
                  </Link>
                </div>
              </div>
            </details>
          </div>
        </form>
      </section>

      {hasVisibleSection(viewState, "top-line") ? (
        <section className="space-y-3">
          <header>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Top line</h2>
            <p className="mt-1 text-sm text-slate-600">A quick read on workload, closeout pressure, service cases, and billed activity in the selected range.</p>
          </header>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.topCards.map((card) => (
              <SummaryCard key={card.label} {...card} density={viewState.density} />
            ))}
          </div>
        </section>
      ) : null}

      {hasVisibleSection(viewState, "operations") ? (
        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Operations</h2>
                <p className="text-sm text-slate-600">Current workload, scheduling pressure, and visit throughput for the selected period.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={operationsLedgerHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Open jobs report
                </Link>
                <Link href={operationsExportHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Export jobs report CSV
                </Link>
              </div>
            </header>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {dashboard.operations.cards.map((card) => (
                <SectionMetricCard key={card.label} {...card} density={viewState.density} />
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-3 text-sm font-semibold text-slate-950">Visits created vs completed</div>
              <TrendBars points={dashboard.operations.trend} primaryLabel="Created" secondaryLabel="Completed" density={viewState.density} />
            </div>
          </section>

          <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
            <header className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Job mix</h2>
              <p className="text-sm text-slate-600">How current open work and completed work are splitting across job types.</p>
            </header>
            <div className="mt-4">
              <DistributionRows rows={dashboard.operations.jobTypeSlices} density={viewState.density} />
            </div>
          </section>
        </div>
      ) : null}

      {(hasVisibleSection(viewState, "closeout") || hasVisibleSection(viewState, "continuity")) ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {hasVisibleSection(viewState, "closeout") ? (
            <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">Closeout / Admin</h2>
                  <p className="text-sm text-slate-600">Office follow-up sitting between field completion and operational close.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link href={closeoutLedgerHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Open closeout report
                  </Link>
                  <Link href={closeoutExportHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Export closeout report CSV
                  </Link>
                </div>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {dashboard.closeout.cards.map((card) => (
                  <SectionMetricCard key={card.label} {...card} density={viewState.density} />
                ))}
              </div>
            </section>
          ) : null}

          {hasVisibleSection(viewState, "continuity") ? (
            <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">Service Cases</h2>
                  <p className="text-sm text-slate-600">Open case pressure, repeat-visit risk, and resolution flow across the selected period.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link href={continuityLedgerHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Open service cases report
                  </Link>
                  <Link href={continuityExportHref} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                    Export service cases CSV
                  </Link>
                </div>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {dashboard.continuity.cards.map((card) => (
                  <SectionMetricCard key={card.label} {...card} density={viewState.density} />
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-3 text-sm font-semibold text-slate-950">Cases opened vs resolved</div>
                <TrendBars points={dashboard.continuity.trend} primaryLabel="Opened" secondaryLabel="Resolved" density={viewState.density} />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {(hasVisibleSection(viewState, "invoice") || hasVisibleSection(viewState, "tech-workload")) ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          {hasVisibleSection(viewState, "invoice") ? (
            <section className={`rounded-[24px] border border-slate-200/90 bg-white ${classes.section} shadow-[0_18px_32px_-30px_rgba(15,23,42,0.3)]`}>
              <header className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Invoices</h2>
                <p className="text-sm text-slate-600">Billed truth only where internal invoices already support it honestly.</p>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {dashboard.invoiceVisibility.cards.map((card) => (
                  <SectionMetricCard key={card.label} {...card} density={viewState.density} />
                ))}
              </div>
              <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
                {dashboard.invoiceVisibility.note} Use the dedicated invoice report for drill and export.
              </div>
            </section>
          ) : null}

          {hasVisibleSection(viewState, "tech-workload") ? (
            <TechWorkloadRows
              rows={dashboard.techWorkload.rows}
              note={dashboard.techWorkload.note}
              unassignedOpenVisits={dashboard.techWorkload.unassignedOpenVisits}
              density={viewState.density}
              exportHref={techWorkloadExportHref}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}