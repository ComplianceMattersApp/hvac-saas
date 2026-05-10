import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { loadPlatformOwnerDashboardModel } from "@/lib/business/platform-owner-dashboard";
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

export default async function PlatformOwnerConsolePage() {
  await requirePlatformOwnerOrFailClosed();

  const admin = createAdminClient();
  const model = await loadPlatformOwnerDashboardModel({ admin });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform Owner</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-950">Owner Console</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Read-only platform-wide signup and account visibility. This is not the Support Console and exposes no tenant mutation actions.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Accounts" value={model.summary.totalAccounts} />
        <SummaryCard label="HVAC Service" value={model.summary.hvacServiceAccounts} />
        <SummaryCard label="ECC" value={model.summary.eccAccounts} />
        <SummaryCard label="Hybrid" value={model.summary.hybridAccounts} />
        <SummaryCard label="Unknown Mode" value={model.summary.unknownModeAccounts} />
        <SummaryCard label="Trial" value={model.summary.trialAccounts} />
        <SummaryCard label="Active" value={model.summary.activeAccounts} />
        <SummaryCard
          label="Expired/Suspended/Cancelled"
          value={model.summary.expiredSuspendedCancelledAccounts}
        />
        <SummaryCard label="Total Internal Users" value={model.summary.totalInternalUsers} />
        <SummaryCard label="Active Internal Users" value={model.summary.activeInternalUsers} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Owner User ID</th>
                <th className="px-4 py-3 font-semibold">Product Mode</th>
                <th className="px-4 py-3 font-semibold">Billing</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Entitlement</th>
                <th className="px-4 py-3 font-semibold">Trial End</th>
                <th className="px-4 py-3 font-semibold">Users</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold">Setup/Invite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {model.rows.map((row) => (
                <tr key={row.accountOwnerUserId} className="align-top">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.company}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.ownerName ?? "-"}</div>
                    <div className="text-xs text-slate-500">{row.ownerEmail ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.accountOwnerUserId}</td>
                  <td className="px-4 py-3 text-slate-700">{row.productMode ?? "null"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.billingMode ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.planKey ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.entitlementStatus ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.trialEnd ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.activeUsers} active / {row.totalUsers} total
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.createdAt ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.updatedAt ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.setupInviteState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
