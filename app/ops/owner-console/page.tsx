import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import {
  formatBillingModeLabel,
  formatOwnerConsoleDate,
  formatProductModeLabel,
  formatStatusLabel,
  filterPlatformOwnerDashboardRows,
  isHiddenTestAccountRow,
  isPlatformInternalAccountRow,
  loadPlatformOwnerDashboardModel,
  parseHiddenAccountEmails,
  parseInternalAccountEmails,
  summarizePlatformOwnerDashboardRows,
  type PlatformOwnerConsoleView,
  type PlatformOwnerDashboardRow,
} from "@/lib/business/platform-owner-dashboard";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type OwnerConsoleProductFilter = "all" | "hvac_service" | "ecc_hers" | "hybrid" | "not_set";
type OwnerConsoleStatusFilter = "all" | "active" | "trial" | "grace" | "expired" | "suspended" | "cancelled" | "not_set";

async function requirePlatformOwnerOrFailClosed() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) redirect("/login");

  const allowlisted = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowlisted) {
    notFound();
  }
}

function SummaryCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{props.value}</p>
    </div>
  );
}

function firstSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function normalizeForSearch(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveView(value: string | undefined): PlatformOwnerConsoleView {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "inactive") return "inactive";
  if (normalized === "platform") return "platform";
  if (normalized === "all") return "all";
  if (normalized === "hidden") return "hidden";
  return "current";
}

function resolveProductFilter(value: string | undefined): OwnerConsoleProductFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hvac_service") return "hvac_service";
  if (normalized === "ecc_hers") return "ecc_hers";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "not_set") return "not_set";
  return "all";
}

function resolveStatusFilter(value: string | undefined): OwnerConsoleStatusFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "trial") return "trial";
  if (normalized === "grace") return "grace";
  if (normalized === "expired") return "expired";
  if (normalized === "suspended") return "suspended";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "not_set") return "not_set";
  return "all";
}

function ownerEmailDomain(row: PlatformOwnerDashboardRow) {
  const email = String(row.ownerEmail ?? "").trim().toLowerCase();
  const atIndex = email.indexOf("@");
  if (atIndex < 0 || atIndex === email.length - 1) return "";
  return email.slice(atIndex + 1);
}

function rowMatchesQuery(params: {
  row: PlatformOwnerDashboardRow;
  query: string;
  internalEmails: Set<string>;
}) {
  const query = normalizeForSearch(params.query);
  if (!query) return true;

  const row = params.row;
  const haystack = [
    row.company,
    row.ownerName,
    row.ownerEmail,
    ownerEmailDomain(row),
    row.accountOwnerUserId,
    formatProductModeLabel({ row, internalEmails: params.internalEmails }),
    formatStatusLabel(row.entitlementStatus),
    formatBillingModeLabel(row.billingMode),
    row.setupInviteState,
  ]
    .map(normalizeForSearch)
    .filter(Boolean)
    .join(" ");

  return haystack.includes(query);
}

function rowMatchesSelectedAccount(row: PlatformOwnerDashboardRow, selectedAccountOwnerId: string) {
  const selected = String(selectedAccountOwnerId ?? "").trim();
  if (!selected) return true;
  return row.accountOwnerUserId === selected;
}

function rowMatchesProduct(row: PlatformOwnerDashboardRow, product: OwnerConsoleProductFilter) {
  if (product === "all") return true;
  if (product === "not_set") return !row.productMode;
  return row.productMode === product;
}

function rowMatchesStatus(row: PlatformOwnerDashboardRow, status: OwnerConsoleStatusFilter) {
  if (status === "all") return true;
  const normalizedStatus = normalizeForSearch(row.entitlementStatus) || "not_set";
  return normalizedStatus === status;
}

function filterRowsForOwnerSearch(params: {
  rows: PlatformOwnerDashboardRow[];
  query: string;
  selectedAccountOwnerId: string;
  product: OwnerConsoleProductFilter;
  status: OwnerConsoleStatusFilter;
  internalEmails: Set<string>;
}) {
  return params.rows.filter((row) =>
    rowMatchesSelectedAccount(row, params.selectedAccountOwnerId) &&
    rowMatchesQuery({ row, query: params.query, internalEmails: params.internalEmails }) &&
    rowMatchesProduct(row, params.product) &&
    rowMatchesStatus(row, params.status),
  );
}

function clearFiltersHref(view: PlatformOwnerConsoleView) {
  if (view === "current") return "/ops/owner-console";
  return `/ops/owner-console?view=${encodeURIComponent(view)}`;
}

function formatAccountDropdownLabel(row: PlatformOwnerDashboardRow) {
  const ownerEmail = String(row.ownerEmail ?? "").trim();
  if (ownerEmail) return `${row.company} — ${ownerEmail}`;
  return row.company;
}

const VIEW_META: Record<
  PlatformOwnerConsoleView,
  { label: string; description: string }
> = {
  current: {
    label: "Current",
    description: "Active, trial, and grace accounts",
  },
  inactive: {
    label: "Inactive / Cancelled",
    description: "Expired, suspended, and cancelled accounts",
  },
  platform: {
    label: "Platform / Internal",
    description: "Compliance Matters owner/internal accounts",
  },
  all: {
    label: "All",
    description: "All account states including hidden and platform/internal",
  },
  hidden: {
    label: "Hidden / Test",
    description: "Accounts suppressed from default counts via env config",
  },
};

export default async function PlatformOwnerConsolePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOwnerOrFailClosed();

  const admin = createAdminClient();
  const model = await loadPlatformOwnerDashboardModel({ admin });
  const hiddenEmails = parseHiddenAccountEmails(process.env);
  const internalEmails = parseInternalAccountEmails(process.env);
  const searchParams = (props.searchParams ? await props.searchParams : {}) ?? {};
  const view = resolveView(firstSearchParamValue(searchParams, "view"));
  const accountQuery = firstSearchParamValue(searchParams, "q");
  const selectedAccountOwnerId = firstSearchParamValue(searchParams, "account");
  const productFilter = resolveProductFilter(firstSearchParamValue(searchParams, "product"));
  const statusFilter = resolveStatusFilter(firstSearchParamValue(searchParams, "status"));
  const viewRows = filterPlatformOwnerDashboardRows({
    rows: model.rows,
    view,
    hiddenEmails,
    internalEmails,
  });
  const filteredRows = filterRowsForOwnerSearch({
    rows: viewRows,
    query: accountQuery,
    selectedAccountOwnerId,
    product: productFilter,
    status: statusFilter,
    internalEmails,
  });
  const viewSummary = summarizePlatformOwnerDashboardRows({
    rows: viewRows,
    allRows: model.rows,
    hiddenEmails,
    internalEmails,
  });
  const hasActiveFilters = Boolean(
    accountQuery || selectedAccountOwnerId || productFilter !== "all" || statusFilter !== "all",
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 text-slate-900 sm:p-6">

      {/* Header */}
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform Owner</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Owner Console</h1>
            <p className="mt-1 text-sm text-slate-500">
              Read-only platform-wide account overview. No tenant mutation actions.
            </p>
          </div>
        </div>
      </section>

      {/* View switcher */}
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(VIEW_META) as PlatformOwnerConsoleView[]).map((candidate) => {
              const selected = candidate === view;
              return (
                <a
                  key={candidate}
                  href={candidate === "current" ? "/ops/owner-console" : `/ops/owner-console?view=${candidate}`}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  aria-current={selected ? "page" : undefined}
                >
                  {VIEW_META[candidate].label}
                </a>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{VIEW_META[view].description}</p>
        </div>
      </section>

      {/* Search and filters */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <form action="/ops/owner-console" method="get" className="grid gap-3 xl:grid-cols-[1fr_1fr_170px_170px_auto] xl:items-end">
          <input type="hidden" name="view" value={view} />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Find account</span>
            <input
              name="q"
              defaultValue={accountQuery}
              placeholder="Company, owner email, domain, account id..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Account dropdown</span>
            <select
              name="account"
              defaultValue={selectedAccountOwnerId}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500"
            >
              <option value="">All accounts in this view</option>
              {viewRows.map((row) => (
                <option key={row.accountOwnerUserId} value={row.accountOwnerUserId}>
                  {formatAccountDropdownLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Product</span>
            <select
              name="product"
              defaultValue={productFilter}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500"
            >
              <option value="all">All products</option>
              <option value="hvac_service">Service</option>
              <option value="ecc_hers">ECC</option>
              <option value="hybrid">Hybrid</option>
              <option value="not_set">Not Set</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</span>
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="grace">Grace</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
              <option value="not_set">Not Set</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Search
            </button>
            {hasActiveFilters ? (
              <Link
                href={clearFiltersHref(view)}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Showing {filteredRows.length} of {viewRows.length} account{viewRows.length === 1 ? "" : "s"} in this view.
        </p>
      </section>

      {/* Compact helper notes */}
      <div className="space-y-1.5">
        {view === "current" && viewSummary.hiddenInactiveCancelledAccounts > 0 ? (
          <p className="text-xs text-slate-500">
            {viewSummary.hiddenInactiveCancelledAccounts} inactive/cancelled account(s) excluded from this view. Use <strong>Inactive</strong> to inspect.
          </p>
        ) : null}
        {view === "current" && viewSummary.hiddenTestAccounts > 0 ? (
          <p className="text-xs text-slate-500">
            {viewSummary.hiddenTestAccounts} hidden/test account(s) excluded from default counts. Use <strong>Hidden / Test</strong> to inspect.
          </p>
        ) : null}
        {view === "current" && internalEmails.size > 0 ? (
          <p className="text-xs text-slate-500">
            Platform/internal accounts are excluded from customer account counts.
          </p>
        ) : null}
      </div>

      {/* Account Overview — primary cards */}
      <section>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Account Overview</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Customer Accounts" value={viewSummary.displayedCustomerAccounts} />
          <SummaryCard label="Trial Accounts" value={viewSummary.displayedTrialAccounts} />
          <SummaryCard label="Platform / Internal" value={viewSummary.displayedPlatformInternalAccounts} />
          <SummaryCard label="Hidden / Test" value={viewSummary.hiddenTestAccounts} />
        </div>
      </section>

      {/* Product Mix — secondary, smaller */}
      <section>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Product Mix</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { label: "Service", value: viewSummary.displayedHvacServiceAccounts },
              { label: "ECC", value: viewSummary.displayedEccAccounts },
              { label: "Hybrid", value: viewSummary.displayedHybridAccounts },
              { label: "Not Set", value: viewSummary.displayedUnknownModeAccounts },
            ] as { label: string; value: number }[]
          ).map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5"
            >
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <span className="text-sm font-semibold text-slate-900">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Accounts table */}
      <section>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          Accounts{filteredRows.length > 0 ? ` — ${filteredRows.length}` : ""}
        </p>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="w-[24%] px-4 py-3 font-semibold">Company</th>
                  <th className="w-[22%] px-4 py-3 font-semibold">Owner</th>
                  <th className="w-[13%] px-4 py-3 font-semibold">Product</th>
                  <th className="w-[16%] px-4 py-3 font-semibold">Status</th>
                  <th className="w-[8%] px-4 py-3 font-semibold">Users</th>
                  <th className="w-[9%] px-4 py-3 font-semibold">Created</th>
                  <th className="w-[8%] px-4 py-3 font-semibold text-slate-400">Billing</th>
                  <th className="px-4 py-3 font-semibold text-slate-400">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRows.map((row) => {
                  const isHidden = isHiddenTestAccountRow(row, hiddenEmails);
                  const isInternal = isPlatformInternalAccountRow(row, internalEmails);
                  return (
                    <tr key={row.accountOwnerUserId} className="align-top">
                      <td className="px-4 py-3">
                        <div className="max-w-[240px] truncate font-medium text-slate-900" title={row.company}>
                          {row.company}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {isInternal ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Platform
                            </span>
                          ) : null}
                          {isHidden ? (
                            <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              Test
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="max-w-[220px] truncate font-medium" title={row.ownerName ?? "-"}>
                          {row.ownerName ?? "-"}
                        </div>
                        <div className="max-w-[220px] truncate text-xs text-slate-400" title={row.ownerEmail ?? "-"}>
                          {row.ownerEmail ?? "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatProductModeLabel({ row, internalEmails })}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium">{formatStatusLabel(row.entitlementStatus)}</div>
                        <div className="text-xs text-slate-400">Trial ends: {formatOwnerConsoleDate(row.trialEnd)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {row.activeUsers}/{row.totalUsers}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {formatOwnerConsoleDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatBillingModeLabel(row.billingMode)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/ops/owner-console/${encodeURIComponent(row.accountOwnerUserId)}`}
                          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View Snapshot
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      {hasActiveFilters ? "No accounts match these filters." : "No accounts in this view."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
