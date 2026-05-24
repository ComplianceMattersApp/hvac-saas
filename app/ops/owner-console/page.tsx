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
} from "@/lib/business/platform-owner-dashboard";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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

function resolveView(value: string | undefined): PlatformOwnerConsoleView {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "inactive") return "inactive";
  if (normalized === "platform") return "platform";
  if (normalized === "all") return "all";
  if (normalized === "hidden") return "hidden";
  return "current";
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
  const view = resolveView(
    typeof searchParams.view === "string" ? searchParams.view : undefined,
  );
  const filteredRows = filterPlatformOwnerDashboardRows({
    rows: model.rows,
    view,
    hiddenEmails,
    internalEmails,
  });
  const viewSummary = summarizePlatformOwnerDashboardRows({
    rows: filteredRows,
    allRows: model.rows,
    hiddenEmails,
    internalEmails,
  });

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
              { label: "HVAC Service", value: viewSummary.displayedHvacServiceAccounts },
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
                      No accounts in this view.
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
