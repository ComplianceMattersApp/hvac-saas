import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
  listMaintenanceAgreementDrilldownForAccount,
  type MaintenanceAgreementDrilldownFilter,
} from "@/lib/maintenance-agreements/read-model";
import {
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateLifecycleStatus,
  type MaintenanceAgreementTemplateRow,
} from "@/lib/maintenance-agreements/template-read-model";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export const metadata = { title: "Service Plans" };

const FILTERS: Array<{ value: MaintenanceAgreementDrilldownFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "due_1_7_days", label: "Due in 1-7 Days" },
  { value: "due_8_30_days", label: "Due in 8-30 Days" },
  { value: "not_scheduled", label: "Not Scheduled" },
  { value: "inactive", label: "Inactive" },
];

function isDrilldownFilter(value: unknown): value is MaintenanceAgreementDrilldownFilter {
  return (
    typeof value === "string" &&
    FILTERS.some((filter) => filter.value === value)
  );
}

function formatYmd(value: string | null) {
  if (!value) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function normalizeTypeKeyPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function daysBetweenYmd(startYmd: string, endYmd: string | null) {
  if (!endYmd) return null;
  const start = Date.parse(`${startYmd}T00:00:00Z`);
  const end = Date.parse(`${endYmd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86_400_000);
}

function titleCase(value: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "-";
  return cleaned
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dueStateClass(value: string) {
  if (value === "overdue") return "bg-rose-100 text-rose-700";
  if (value === "due_today") return "bg-amber-100 text-amber-700";
  if (value === "upcoming") return "bg-blue-100 text-blue-700";
  if (value === "not_scheduled") return "bg-slate-100 text-slate-700";
  return "bg-slate-200 text-slate-600";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-100 text-emerald-700";
  if (value === "draft") return "bg-slate-100 text-slate-700";
  if (value === "paused") return "bg-amber-100 text-amber-700";
  if (value === "expired") return "bg-zinc-200 text-zinc-700";
  if (value === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function countReviewClass(value: string) {
  if (value === "eligible_for_count_review") return "bg-amber-100 text-amber-800";
  if (value === "counted") return "bg-emerald-100 text-emerald-700";
  if (value === "excluded" || value === "reversed") return "bg-slate-200 text-slate-700";
  if (value === "not_eligible") return "bg-rose-100 text-rose-700";
  return "bg-blue-100 text-blue-700";
}

function formatCountReviewLabel(value: string) {
  if (value === "eligible_for_count_review") return "Eligible for count review";
  if (value === "not_eligible") return "Not eligible";
  return titleCase(value);
}

function parseSingleQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function normalizeTemplateStatus(value: string): MaintenanceAgreementTemplateLifecycleStatus {
  return value === "archived" ? "archived" : "active";
}

function formatTemplateItems(items: unknown[]) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return JSON.stringify(items, null, 2);
}

function getPlanTypeGroup(row: ServicePlanDrilldownRow) {
  const agreementType = String(row.agreement_type ?? "").trim();
  if (agreementType) {
    return {
      key: normalizeTypeKeyPart(agreementType) || "other",
      label: titleCase(agreementType),
      source: "Type",
    };
  }

  const templateName = String(row.source_template_name_snapshot ?? "").trim();
  if (templateName) {
    return {
      key: normalizeTypeKeyPart(row.source_template_id ?? templateName) || "other",
      label: templateName,
      source: "Template",
    };
  }

  return {
    key: "other",
    label: "Other",
    source: "Type",
  };
}

function buildServicePlansHref(options?: {
  filter?: string;
  q?: string;
  typeKey?: string;
  page?: number;
  banner?: string;
  message?: string;
}) {
  const params = new URLSearchParams();
  const filter = String(options?.filter ?? "").trim();
  const q = String(options?.q ?? "").trim();
  const typeKey = String(options?.typeKey ?? "").trim();
  const page = Number(options?.page ?? 1);
  const banner = String(options?.banner ?? "").trim();
  const message = String(options?.message ?? "").trim();

  if (filter && filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);
  if (typeKey) params.set("type", typeKey);
  if (Number.isFinite(page) && page > 1) params.set("page", String(Math.floor(page)));
  if (banner) params.set("banner", banner);
  if (message) params.set("message", message);

  const query = params.toString();
  return query ? `/service-plans?${query}` : "/service-plans";
}

function isTemplateStoreUnavailableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  if (message.includes("maintenance_agreement_templates")) return true;
  if (code === "42P01") return true;
  return false;
}

type ServicePlanDrilldownRow = Awaited<
  ReturnType<typeof listMaintenanceAgreementDrilldownForAccount>
>["rows"][number];

function getCountReviewBadges(row: ServicePlanDrilldownRow) {
  const summary = row.visit_count_review;
  return [
    { key: "eligible_for_count_review", count: summary.eligible_for_count_review_links },
    { key: "linked", count: summary.linked_links },
    { key: "counted", count: summary.counted_links },
    { key: "excluded", count: summary.excluded_links },
    { key: "reversed", count: summary.reversed_links },
    { key: "not_eligible", count: summary.not_eligible_links },
  ].filter((item) => item.count > 0);
}

function buildCustomerPlanHref(row: ServicePlanDrilldownRow) {
  const agreementId = String(row.id ?? "").trim();
  const customerId = String(row.customer_id ?? "").trim();
  const hash = `maintenance-agreement-${agreementId}`;
  return `/customers/${encodeURIComponent(customerId)}?tab=service-plans&maFocus=${encodeURIComponent(agreementId)}#${hash}`;
}

export default async function ServicePlansPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    const result = await requireInternalUser({ supabase, userId: userData.user.id });
    internalUser = result.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isMaintenanceAgreementsEnabled()) {
    redirect("/ops");
  }

  const sp = (await searchParams) ?? {};
  const rawFilter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const selectedFilter = isDrilldownFilter(rawFilter) ? rawFilter : "all";
  const searchQuery = parseSingleQueryParam(sp.q);
  const selectedTypeKey = parseSingleQueryParam(sp.type);
  const requestedPage = Number.parseInt(parseSingleQueryParam(sp.page), 10);
  const pageSize = 25;
  const pageCount = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  let templateStoreUnavailable = false;
  let templateRows: MaintenanceAgreementTemplateRow[] = [];
  try {
    templateRows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      includeArchived: true,
      limit: 500,
    });
  } catch (error) {
    if (isTemplateStoreUnavailableError(error)) {
      templateStoreUnavailable = true;
      templateRows = [];
    } else {
      throw error;
    }
  }

  const activeTemplates = templateRows.filter((row) => normalizeTemplateStatus(row.lifecycle_status) === "active");
  const archivedTemplates = templateRows.filter((row) => normalizeTemplateStatus(row.lifecycle_status) === "archived");

  const result = await listMaintenanceAgreementDrilldownForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    today: null,
    filter: selectedFilter,
    limit: 250,
  });
  const overviewResult = selectedFilter === "all"
    ? result
    : await listMaintenanceAgreementDrilldownForAccount({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        today: null,
        filter: "all",
        limit: 250,
      });
  const overviewRows = overviewResult.rows;
  const planTypeGroups = Array.from(overviewRows.reduce((groups, row) => {
    const group = getPlanTypeGroup(row);
    const bucket = groups.get(group.key) ?? {
      key: group.key,
      label: group.label,
      source: group.source,
      total: 0,
      active: 0,
      overdue: 0,
      dueSoon: 0,
      needsAttention: 0,
    };
    const daysUntil = daysBetweenYmd(overviewResult.as_of_date, row.next_due_date);
    const dueSoon = daysUntil !== null && daysUntil >= 1 && daysUntil <= 30;
    const needsAttention =
      row.due_state === "overdue" ||
      row.due_state === "due_today" ||
      row.due_state === "not_scheduled" ||
      row.visit_count_review.eligible_for_count_review_links > 0 ||
      row.visit_count_review.not_eligible_links > 0;

    bucket.total += 1;
    if (row.status === "active") bucket.active += 1;
    if (row.due_state === "overdue") bucket.overdue += 1;
    if (dueSoon) bucket.dueSoon += 1;
    if (needsAttention) bucket.needsAttention += 1;
    groups.set(group.key, bucket);
    return groups;
  }, new Map<string, {
    key: string;
    label: string;
    source: string;
    total: number;
    active: number;
    overdue: number;
    dueSoon: number;
    needsAttention: number;
  }>()).values()).sort((a, b) => b.active - a.active || b.total - a.total || a.label.localeCompare(b.label));
  const activeTypeGroup = planTypeGroups.find((group) => group.key === selectedTypeKey) ?? null;
  const typeFilteredRows = activeTypeGroup
    ? result.rows.filter((row) => getPlanTypeGroup(row).key === activeTypeGroup.key)
    : result.rows;
  const normalizedSearchQuery = searchQuery.toLowerCase();
  const visibleRows = normalizedSearchQuery
    ? typeFilteredRows.filter((row) => [
        row.agreement_name,
        row.customer_display_name,
        row.primary_location_display,
        row.status,
        row.due_state,
        row.next_due_date,
        getPlanTypeGroup(row).label,
      ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearchQuery)))
    : typeFilteredRows;
  const activePlanCount = overviewRows.filter((row) => row.status === "active").length;
  const overduePlanCount = overviewRows.filter((row) => row.due_state === "overdue").length;
  const dueTodayPlanCount = overviewRows.filter((row) => row.due_state === "due_today").length;
  const dueNextSevenPlanCount = overviewRows.filter((row) => {
    const daysUntil = daysBetweenYmd(overviewResult.as_of_date, row.next_due_date);
    return daysUntil !== null && daysUntil >= 1 && daysUntil <= 7;
  }).length;
  const dueNextThirtyPlanCount = overviewRows.filter((row) => {
    const daysUntil = daysBetweenYmd(overviewResult.as_of_date, row.next_due_date);
    return daysUntil !== null && daysUntil >= 1 && daysUntil <= 30;
  }).length;
  const notScheduledPlanCount = overviewRows.filter((row) => row.due_state === "not_scheduled").length;
  const countReviewPlanCount = overviewRows.filter((row) => row.visit_count_review.eligible_for_count_review_links > 0 || row.visit_count_review.not_eligible_links > 0).length;
  const attentionRows = overviewRows.filter((row) => (
    row.due_state === "overdue" ||
    row.due_state === "due_today" ||
    row.due_state === "not_scheduled" ||
    row.visit_count_review.eligible_for_count_review_links > 0 ||
    row.visit_count_review.not_eligible_links > 0
  )).slice(0, 6);
  const upcomingRows = overviewRows.filter((row) => row.due_state === "upcoming" && row.next_due_date).slice(0, 6);
  const overviewCards = [
    { label: "Active Plans", value: activePlanCount },
    { label: "Overdue", value: overduePlanCount },
    { label: "Due Today", value: dueTodayPlanCount },
    { label: "Due Next 7 Days", value: dueNextSevenPlanCount },
    { label: "Due Next 30 Days", value: dueNextThirtyPlanCount },
    { label: "Needs Attention", value: notScheduledPlanCount + countReviewPlanCount },
    { label: "Templates Active", value: activeTemplates.length },
  ];
  const visibleNeedsAttentionCount = visibleRows.filter((row) => (
    row.due_state === "overdue" ||
    row.due_state === "due_today" ||
    row.due_state === "not_scheduled" ||
    row.visit_count_review.eligible_for_count_review_links > 0 ||
    row.visit_count_review.not_eligible_links > 0
  )).length;
  const visibleDueSoonCount = visibleRows.filter((row) => {
    const daysUntil = daysBetweenYmd(result.as_of_date, row.next_due_date);
    return daysUntil !== null && daysUntil >= 1 && daysUntil <= 30;
  }).length;
  const visibleActiveCount = visibleRows.filter((row) => row.status === "active").length;
  const visibleInactiveCount = visibleRows.length - visibleActiveCount;
  const clampedVisibleCount = Math.min(visibleRows.length, pageCount * pageSize);
  const pagedRows = visibleRows.slice(0, clampedVisibleCount);
  const hasMoreRows = clampedVisibleCount < visibleRows.length;
  const showingLabel = visibleRows.length <= pageSize
    ? `Showing ${visibleRows.length} plan${visibleRows.length === 1 ? "" : "s"}`
    : `Showing 1-${clampedVisibleCount} of ${visibleRows.length} plans`;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 text-slate-900 sm:space-y-5 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <Link
              href="/ops"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span aria-hidden="true">&larr;</span> Back to Ops
            </Link>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-950">Service Plans</h1>
            <p className="mt-1 text-sm text-slate-600">
              Track recurring service agreements, upcoming visits, and plan templates.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Customer plans are managed from each customer record. Templates standardize future assignments.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">As Of</div>
            <div className="text-sm font-semibold text-slate-800">{result.as_of_date}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            Review plan health here, then open the customer record when a plan needs direct management.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{card.value}</div>
            </div>
          ))}
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Service Plan Types</h2>
              <p className="mt-1 text-xs text-slate-600">
                Select a type to review matching customer plans.
              </p>
            </div>
            {activeTypeGroup ? (
              <Link
                href={buildServicePlansHref({ filter: selectedFilter, q: searchQuery })}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                Clear Type
              </Link>
            ) : null}
          </div>

          {activeTypeGroup ? (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Showing type: <span className="font-semibold">{activeTypeGroup.label}</span>
            </div>
          ) : null}

          {planTypeGroups.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No service plan types yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
              {planTypeGroups.map((group) => {
                const active = activeTypeGroup?.key === group.key;
                return (
                  <Link
                    key={group.key}
                    href={buildServicePlansHref({ filter: selectedFilter, q: searchQuery, typeKey: group.key })}
                    className={`grid gap-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${
                      active
                        ? "bg-blue-50"
                        : "bg-white hover:bg-slate-50"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-950">{group.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{group.active} active</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {group.total} plan{group.total === 1 ? "" : "s"}
                    </div>
                    <div className="flex flex-wrap justify-start gap-1 sm:justify-end">
                      {group.needsAttention > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {group.needsAttention} needs attention
                        </span>
                      ) : null}
                      {group.dueSoon > 0 ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                          {group.dueSoon} due soon
                        </span>
                      ) : null}
                      {group.overdue > 0 ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                          {group.overdue} overdue
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-amber-950">Plans Needing Attention</h2>
                <p className="mt-1 text-xs text-amber-900/80">Overdue, due today, not scheduled, or waiting on count review.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">{attentionRows.length}</span>
            </div>
            {attentionRows.length === 0 ? (
              <p className="mt-3 text-sm text-amber-900/80">No plans need attention right now.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {attentionRows.map((row) => (
                  <Link
                    key={row.id}
                    href={buildCustomerPlanHref(row)}
                    className="block rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm transition-colors hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <span className="font-semibold text-slate-950">{row.agreement_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {row.customer_display_name} - {titleCase(row.due_state)} - {formatYmd(row.next_due_date)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-blue-950">Upcoming Service Plans</h2>
                <p className="mt-1 text-xs text-blue-900/80">A quick look at scheduled plans coming up next.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-900">{upcomingRows.length}</span>
            </div>
            {upcomingRows.length === 0 ? (
              <p className="mt-3 text-sm text-blue-900/80">No upcoming plans are scheduled yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {upcomingRows.map((row) => (
                  <Link
                    key={row.id}
                    href={buildCustomerPlanHref(row)}
                    className="block rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    <span className="font-semibold text-slate-950">{row.agreement_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {row.customer_display_name} - Next due {formatYmd(row.next_due_date)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

      </section>

      {templateStoreUnavailable ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Template storage is not available in this environment yet. Run the latest migrations to enable template management.
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_18px_34px_-30px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Customer Service Plans</h2>
          <p className="mt-1 text-sm text-slate-600">Detail view for the selected type, status, and search filters.</p>
          {activeTypeGroup ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <span>Showing type: <span className="font-semibold">{activeTypeGroup.label}</span></span>
              <Link
                href={buildServicePlansHref({ filter: selectedFilter, q: searchQuery })}
                className="inline-flex rounded-md border border-blue-200 bg-white px-2 py-1 font-semibold text-blue-900 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                Clear Type
              </Link>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Needs Attention {visibleNeedsAttentionCount}</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">Due Soon {visibleDueSoonCount}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Active {visibleActiveCount}</span>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">Inactive {visibleInactiveCount}</span>
          </div>
        </div>

        <div className="border-b border-slate-200 px-4 py-3">
          <form action="/service-plans" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            {selectedFilter !== "all" ? <input type="hidden" name="filter" value={selectedFilter} /> : null}
            {activeTypeGroup ? <input type="hidden" name="type" value={activeTypeGroup.key} /> : null}
            <label className="text-sm font-medium text-slate-700">
              Search service plans
              <input
                name="q"
                defaultValue={searchQuery}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Customer, plan name, location, status, or due date"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-slate-700 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                Search
              </button>
              {searchQuery ? (
                <Link
                  href={buildServicePlansHref({ filter: selectedFilter, typeKey: activeTypeGroup?.key })}
                  className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const active = filter.value === selectedFilter;
              return (
                <Link
                  key={filter.value}
                  href={buildServicePlansHref({ filter: filter.value, q: searchQuery, typeKey: activeTypeGroup?.key })}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-[background-color,border-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                    active
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {showingLabel}{searchQuery ? ` matching "${searchQuery}"` : ""}. Customer plans are managed from each customer record.
          </div>
        </div>

        {pagedRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-600">
            No service plans match this type and filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Primary Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due State</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Visit Count Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.map((row) => {
                  const countReviewBadges = getCountReviewBadges(row);
                  return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={buildCustomerPlanHref(row)}
                        className="font-semibold text-slate-900 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {row.agreement_name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(row.frequency)} - {titleCase(row.agreement_type)}
                      </div>
                      <div className="mt-2">
                        <Link
                          href={buildCustomerPlanHref(row)}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-[background-color,border-color,color] hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          Open Customer Plan
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${encodeURIComponent(row.customer_id)}?tab=service-plans`}
                        className="font-semibold text-slate-800 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {row.customer_display_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.primary_location_display ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                        {titleCase(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dueStateClass(row.due_state)}`}>
                        {titleCase(row.due_state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatYmd(row.next_due_date)}</td>
                    <td className="px-4 py-3">
                      {countReviewBadges.length === 0 ? (
                        <span className="text-xs font-medium text-slate-400">No linked visits</span>
                      ) : (
                        <div className="flex max-w-[260px] flex-wrap gap-1.5">
                          {countReviewBadges.map((item) => (
                            <span
                              key={item.key}
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${countReviewClass(item.key)}`}
                            >
                              {formatCountReviewLabel(item.key)} {item.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasMoreRows ? (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <Link
              href={buildServicePlansHref({
                filter: selectedFilter,
                q: searchQuery,
                typeKey: activeTypeGroup?.key,
                page: pageCount + 1,
              })}
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Load More
            </Link>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Templates</h2>
            <p className="mt-1 text-sm text-slate-600">
              Setup and maintain reusable Service Plan templates in a dedicated workspace.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Templates</div>
            <div className="text-sm font-semibold text-slate-800">
              {activeTemplates.length} active / {archivedTemplates.length} archived
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/service-plans/templates"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-slate-700 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Manage Templates
          </Link>
          <Link
            href="/service-plans/templates#create-template-form"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Create Template
          </Link>
        </div>
      </section>

    </div>
  );
}
