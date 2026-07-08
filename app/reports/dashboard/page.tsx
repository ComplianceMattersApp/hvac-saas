import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileText,
  Gauge,
  LayoutDashboard,
  ListFilter,
  UsersRound,
} from "lucide-react";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  REPORT_CENTER_KPI_GRANULARITY_OPTIONS,
  parseReportCenterKpiFilters,
  type ReportCenterKpiFilters,
} from "@/lib/reports/kpi-foundation";
import { buildReportCenterDashboardReadModel } from "@/lib/reports/report-center-dashboard";

export const metadata = {
  title: "Priority Board",
  description: "A quick view of the work, billing, and follow-up areas that need attention.",
};

const DASHBOARD_SECTION_OPTIONS = [
  { value: "top-line", label: "Priority board" },
  { value: "operations", label: "Work flow" },
  { value: "closeout", label: "Closeout" },
  { value: "continuity", label: "Work history" },
  { value: "invoice", label: "Billing follow-up" },
  { value: "tech-workload", label: "Team load" },
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
    : (["top-line"] satisfies DashboardSectionKey[]);

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
  if (tone === "amber") return "border-rose-200 bg-rose-50/70";
  if (tone === "sky") return "border-blue-200 bg-blue-50/70";
  if (tone === "orange") return "border-red-200 bg-red-50/70";
  return "border-slate-200 bg-white";
}

function metricIconForLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("schedule")) return CalendarClock;
  if (normalized.includes("unassigned") || normalized.includes("tech")) return UsersRound;
  if (normalized.includes("closeout") || normalized.includes("paperwork")) return CheckCircle2;
  if (normalized.includes("invoice") || normalized.includes("billed") || normalized.includes("draft")) return FileText;
  if (normalized.includes("case") || normalized.includes("history") || normalized.includes("repeat")) return AlertTriangle;
  if (normalized.includes("completed") || normalized.includes("opened") || normalized.includes("created")) return BarChart3;
  return Gauge;
}

function actionLabelForMetric(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("schedule")) return "Schedule work";
  if (normalized.includes("unassigned")) return "Assign work";
  if (normalized.includes("closeout")) return "Clear closeout";
  if (normalized.includes("paperwork")) return "Review paperwork";
  if (normalized.includes("invoice")) return "Review invoices";
  if (normalized.includes("case") || normalized.includes("history") || normalized.includes("repeat")) return "Review work history";
  if (normalized.includes("completed") || normalized.includes("opened") || normalized.includes("created")) return "Open detail";
  return "Open report";
}

function actionLinkClass(variant: "primary" | "secondary" = "secondary") {
  if (variant === "primary") {
    return "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-950 bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
  }

  return "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
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
  const Icon = metricIconForLabel(label);

  return (
    <article className={`rounded-lg border ${classes.topCard} shadow-sm shadow-slate-950/5 ${toneClass(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
          <div className="mt-2 text-4xl font-semibold text-slate-950">{value}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/80 text-slate-700 shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{helperText}</p>
      {href ? (
        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <Link href={href} className="inline-flex text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800">
            {actionLabelForMetric(label)}
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
  const Icon = metricIconForLabel(label);

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${classes.card} shadow-sm shadow-slate-950/5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helperText}</p>
      {href ? (
        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <Link href={href} className="inline-flex text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800">
            {actionLabelForMetric(label)}
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
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No trend data in this range.</div>;
  }

  const maxValue = Math.max(
    ...points.flatMap((point) => [point.primaryValue, point.secondaryValue]),
    0,
  );

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${classes.card} shadow-sm shadow-slate-950/5`}>
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
                <div className="w-4 rounded-t-sm bg-slate-400" style={{ height: primaryHeight }} title={`${primaryLabel}: ${point.primaryValue}`} />
                <div className="w-4 rounded-t-sm bg-sky-500" style={{ height: secondaryHeight }} title={`${secondaryLabel}: ${point.secondaryValue}`} />
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
    <div className={`rounded-lg border border-slate-200 bg-white ${classes.card}`}>
      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            No job mix data in this view.
          </div>
        ) : null}
        {rows.map((row) => {
          const openWidth = maxValue > 0 ? `${Math.max(8, Math.round((row.openCount / maxValue) * 100))}%` : "8%";
          const completedWidth = maxValue > 0 ? `${Math.max(8, Math.round((row.completedCount / maxValue) * 100))}%` : "8%";
          return (
            <div key={row.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-950">{row.label}</div>
                <div className="text-xs text-slate-500">Open {row.openCount} / Completed {row.completedCount}</div>
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
    <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-slate-500" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950">Team load</h2>
          </div>
          <p className="text-sm text-slate-600">Current assignment load and the open work that may need redispatch.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={exportHref} className={actionLinkClass()}>
            Export CSV
          </Link>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            No assigned open visits are available for the current view.
          </div>
        ) : null}
        {rows.map((row) => {
          const width = maxAssigned > 0 ? `${Math.max(10, Math.round((row.assignedOpenVisits / maxAssigned) * 100))}%` : "10%";
          return (
            <div key={row.userId} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">{row.techName}</div>
                  <div className="mt-1 text-xs text-slate-500">Assigned open visits {row.assignedOpenVisits} / Closeout backlog {row.closeoutBacklog}</div>
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

      <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-slate-700">
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
  const filters = parseReportCenterKpiFilters(resolvedSearchParams);
  const viewState = parseDashboardViewState(resolvedSearchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const canViewDepositsReport = canViewFinancialRegister({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
  });

  const dashboard = await buildReportCenterDashboardReadModel({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    filters,
    canViewFinancialReports: canViewDepositsReport,
  });
  const operationsLedgerHref = buildOperationsLedgerHref(filters);
  const operationsExportHref = buildOperationsExportHref(filters);
  const closeoutLedgerHref = buildCloseoutLedgerHref(filters);
  const closeoutExportHref = buildCloseoutExportHref(filters);
  const continuityLedgerHref = buildContinuityLedgerHref(filters);
  const continuityExportHref = buildContinuityExportHref(filters);
  const techWorkloadExportHref = buildTechWorkloadExportHref(filters);
  const classes = densityClasses(viewState.density);

  return (
    <div className={`mx-auto max-w-[1680px] ${classes.sectionGap} px-3 py-4 text-slate-900 sm:px-5`}>
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                {internalBusinessIdentity.display_name}
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Priority board</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                A quick view of the work, billing, and follow-up areas that need attention.
              </p>
            </div>
          </div>
        </div>
      </header>

      <ReportCenterTabs current="dashboard" showDeposits={canViewDepositsReport} />

      <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
        <form action="/reports/dashboard" method="get" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ListFilter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Range and sections
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-3 xl:flex-1 xl:min-w-[44rem]">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Granularity</span>
                <select name="granularity" defaultValue={filters.granularity} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {REPORT_CENTER_KPI_GRANULARITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase text-slate-500">From</span>
                <input name="from" type="date" defaultValue={filters.fromDate} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase text-slate-500">To</span>
                <input name="to" type="date" defaultValue={filters.toDate} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
              <button type="submit" className={actionLinkClass("primary")}>
                Apply range
              </button>
              <Link href="/reports/dashboard" className={actionLinkClass()}>
                Reset
              </Link>
            </div>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50/80">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-900">
              View controls
            </summary>
            <div className="grid gap-3 border-t border-slate-200 px-3 py-3 lg:grid-cols-[minmax(11rem,13rem)_minmax(0,1fr)] lg:items-start">
              <label className="grid gap-1 text-sm text-slate-700">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Density</span>
                <select name="density" defaultValue={viewState.density} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <fieldset className="space-y-2">
                <legend className="text-[11px] font-semibold uppercase text-slate-500">Visible sections</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
            </div>
          </details>
        </form>
      </section>

      {hasVisibleSection(viewState, "top-line") ? (
        <section className="space-y-3">
          <header>
            <h2 className="text-lg font-semibold text-slate-950">Priority board</h2>
            <p className="mt-1 text-sm text-slate-600">The first cards are the ones most likely to change what dispatch, admin, or management does next.</p>
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
          <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-slate-950">Work flow</h2>
                </div>
                <p className="text-sm text-slate-600">Current workload, scheduling pressure, and completed work for the selected period.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={operationsLedgerHref} className={actionLinkClass()}>
                    Open jobs report
                </Link>
                <Link href={operationsExportHref} className={actionLinkClass()}>
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
              <div className="mb-3 text-sm font-semibold text-slate-950">Jobs created vs completed</div>
              <TrendBars points={dashboard.operations.trend} primaryLabel="Created" secondaryLabel="Completed" density={viewState.density} />
            </div>
          </section>

          <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
            <header className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-slate-950">Job mix</h2>
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
            <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    <h2 className="text-lg font-semibold text-slate-950">Closeout</h2>
                  </div>
                  <p className="text-sm text-slate-600">Office follow-up sitting between field completion and operational close.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link href={closeoutLedgerHref} className={actionLinkClass()}>
                    Open closeout report
                  </Link>
                  <Link href={closeoutExportHref} className={actionLinkClass()}>
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
            <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    <h2 className="text-lg font-semibold text-slate-950">Work history</h2>
                  </div>
                  <p className="text-sm text-slate-600">Open follow-up, repeat-visit risk, and resolved work across the selected period.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link href={continuityLedgerHref} className={actionLinkClass()}>
                    Open work history
                  </Link>
                  <Link href={continuityExportHref} className={actionLinkClass()}>
                    Export work history CSV
                  </Link>
                </div>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {dashboard.continuity.cards.map((card) => (
                  <SectionMetricCard key={card.label} {...card} density={viewState.density} />
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-3 text-sm font-semibold text-slate-950">Issues opened vs resolved</div>
                <TrendBars points={dashboard.continuity.trend} primaryLabel="Opened" secondaryLabel="Resolved" density={viewState.density} />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {(hasVisibleSection(viewState, "invoice") || hasVisibleSection(viewState, "tech-workload")) ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          {hasVisibleSection(viewState, "invoice") ? (
            <section className={`rounded-lg border border-slate-200 bg-white ${classes.section} shadow-sm shadow-slate-950/5`}>
              <header className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-slate-950">Billing follow-up</h2>
                </div>
                <p className="text-sm text-slate-600">Invoices and payments that need follow-up.</p>
                <p className="text-sm text-slate-600">This page does not collect payment.</p>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Link
                  href="/reports/invoices"
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <div className="text-sm font-semibold text-slate-950">Open invoices</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Review who still owes money, balances, billing status, and exportable invoice records.
                  </p>
                </Link>
                <Link
                  href="/reports/payments"
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <div className="text-sm font-semibold text-slate-950">Payments received</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Review money already recorded, payment methods, invoice matching, and CSV exports.
                  </p>
                </Link>
                {canViewDepositsReport ? (
                  <Link
                    href="/reports/deposits"
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    <div className="text-sm font-semibold text-slate-950">Deposits</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Review Stripe fees, net deposits, payout timing, and CSV exports.
                    </p>
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {dashboard.invoiceVisibility.cards.map((card) => (
                  <SectionMetricCard key={card.label} {...card} density={viewState.density} />
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
                {dashboard.invoiceVisibility.note} Use Open Invoices for review and export.
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
