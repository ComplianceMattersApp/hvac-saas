import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import {
  filterPlatformOwnerDashboardRows,
  isHiddenTestAccountRow,
  loadPlatformOwnerDashboardModel,
  parseHiddenAccountEmails,
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
  all: {
    label: "All",
    description: "All account states including hidden test accounts",
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
  const searchParams = (props.searchParams ? await props.searchParams : {}) ?? {};
  const view = resolveView(
    typeof searchParams.view === "string" ? searchParams.view : undefined,
  );
  const filteredRows = filterPlatformOwnerDashboardRows({ rows: model.rows, view, hiddenEmails });
  const viewSummary = summarizePlatformOwnerDashboardRows({
    rows: filteredRows,
    allRows: model.rows,
    hiddenEmails,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform Owner</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-950">Owner Console</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Read-only platform-wide signup and account visibility. This is not the Support Console and exposes no tenant mutation actions.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Default view emphasizes current operating accounts. Inactive/cancelled accounts remain available in a separate filter.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <p className="text-xs text-slate-600">{VIEW_META[view].description}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Displayed Accounts" value={viewSummary.displayedAccounts} />
        <SummaryCard label="HVAC Service" value={viewSummary.displayedHvacServiceAccounts} />
        <SummaryCard label="ECC" value={viewSummary.displayedEccAccounts} />
        <SummaryCard label="Hybrid" value={viewSummary.displayedHybridAccounts} />
        <SummaryCard label="Unknown Mode" value={viewSummary.displayedUnknownModeAccounts} />
        <SummaryCard label="Trial" value={viewSummary.displayedTrialAccounts} />
        <SummaryCard label="Current (Active/Trial/Grace)" value={viewSummary.displayedActiveAccounts} />
        <SummaryCard label="Displayed Internal Users" value={viewSummary.displayedInternalUsers} />
        <SummaryCard
          label="Displayed Active Users"
          value={viewSummary.displayedActiveInternalUsers}
        />
      </section>

      {view === "current" && viewSummary.hiddenInactiveCancelledAccounts > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {viewSummary.hiddenInactiveCancelledAccounts} inactive/cancelled account(s) are hidden from default headline counts.
        </p>
      ) : null}

      {view === "current" && viewSummary.hiddenTestAccounts > 0 ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-900">
          {viewSummary.hiddenTestAccounts} test/internal account(s) are suppressed from default counts via{" "}
          <code className="font-mono">PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS</code>. Use the{" "}
          <strong>Hidden / Test</strong> view to inspect them.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="w-[19%] px-4 py-3 font-semibold">Company</th>
                <th className="w-[21%] px-4 py-3 font-semibold">Owner</th>
                <th className="w-[9%] px-4 py-3 font-semibold">Product Mode</th>
                <th className="w-[9%] px-4 py-3 font-semibold">Billing Mode</th>
                <th className="px-4 py-3 font-semibold">Entitlement</th>
                <th className="w-[9%] px-4 py-3 font-semibold">Users</th>
                <th className="w-[11%] px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Setup/Invite</th>
                <th className="px-4 py-3 font-semibold">Owner User ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRows.map((row) => {
                const isHidden = isHiddenTestAccountRow(row, hiddenEmails);
                return (
                <tr key={row.accountOwnerUserId} className="align-top">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="max-w-[260px] truncate" title={row.company}>
                      {row.company}
                    </div>
                    {isHidden ? (
                      <span className="mt-0.5 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                        Hidden / test
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="max-w-[280px] truncate" title={row.ownerName ?? "-"}>
                      {row.ownerName ?? "-"}
                    </div>
                    <div className="max-w-[280px] truncate text-xs text-slate-500" title={row.ownerEmail ?? "-"}>
                      {row.ownerEmail ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.productMode ?? "null"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.billingMode ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.entitlementStatus ?? "-"}</div>
                    <div className="text-xs text-slate-500">Plan: {row.planKey ?? "-"}</div>
                    <div className="text-xs text-slate-500">Trial end: {row.trialEnd ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.activeUsers} active / {row.totalUsers} total
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <span className="block max-w-[180px] truncate" title={row.createdAt ?? "-"}>
                      {row.createdAt ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.setupInviteState}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    <span className="block max-w-[210px] truncate" title={row.accountOwnerUserId}>
                      {row.accountOwnerUserId}
                    </span>
                  </td>
                </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    No accounts in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
