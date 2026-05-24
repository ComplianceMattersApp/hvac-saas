import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import {
  formatBillingModeLabel,
  formatOwnerConsoleDate,
  formatProductModeLabel,
  formatStatusLabel,
  loadPlatformOwnerDashboardModel,
  parseInternalAccountEmails,
} from "@/lib/business/platform-owner-dashboard";
import { resolveAccountEntitlement } from "@/lib/business/platform-entitlement";
import { getInternalBusinessProfileByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { createAdminClient } from "@/lib/supabase/server";

function firstCheckLabel(params: {
  readinessReady: boolean;
  activeUsers: number;
  entitlementStatus: string | null;
  paymentsReady: boolean;
}) {
  const status = String(params.entitlementStatus ?? "").trim().toLowerCase();

  if (!params.readinessReady) return "Finish setup/readiness items";
  if (params.activeUsers <= 0) return "Confirm active users";
  if (status && !["active", "trial", "grace"].includes(status)) return "Review account status";
  if (!params.paymentsReady) return "Review payment readiness if customer payments are needed";
  return "Ask for the customer-reported issue context";
}

function SummaryFact(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 break-words text-base font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-1 text-xs text-slate-500">{props.helper}</p> : null}
    </div>
  );
}

export default async function SupportCallSummarySnapshot({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const model = await loadPlatformOwnerDashboardModel({ admin });
  const row = model.rows.find((candidate) => candidate.accountOwnerUserId === accountOwnerUserId);

  if (!row) return null;

  const internalEmails = parseInternalAccountEmails(process.env);
  const [readiness, entitlement, profile, payments] = await Promise.all([
    resolveAccountReadiness(accountOwnerUserId, admin),
    resolveAccountEntitlement(accountOwnerUserId, admin),
    getInternalBusinessProfileByAccountOwnerId({ accountOwnerUserId, supabase: admin }),
    resolveTenantStripeConnectReadiness(accountOwnerUserId, admin),
  ]);
  const firstCheck = firstCheckLabel({
    readinessReady: readiness.isOperationallyReady,
    activeUsers: row.activeUsers,
    entitlementStatus: row.entitlementStatus ?? entitlement.entitlementStatus,
    paymentsReady: payments.isReady,
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Support Call Summary</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Quick account facts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Copy-friendly read-only summary for owner-led support calls. No actions are performed from this section.
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            readiness.isOperationallyReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}>
            {readiness.isOperationallyReady ? "Ready" : "Needs setup"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryFact label="Account" value={row.company} helper={row.ownerEmail ?? "No owner email visible"} />
          <SummaryFact label="Product / Status" value={formatProductModeLabel({ row, internalEmails })} helper={formatStatusLabel(row.entitlementStatus)} />
          <SummaryFact label="First Check" value={firstCheck} helper={`${readiness.completedRequiredCount}/${readiness.totalRequiredCount} required setup items complete`} />
          <SummaryFact label="Users" value={`${row.activeUsers}/${row.totalUsers} active`} helper="Active / total internal users" />
          <SummaryFact label="Trial End" value={formatOwnerConsoleDate(row.trialEnd)} helper="Current stored trial end date" />
          <SummaryFact label="Billing Mode" value={formatBillingModeLabel(row.billingMode)} helper={entitlement.billingSubscriptionLinked ? "Platform subscription linked" : "No subscription link visible"} />
          <SummaryFact label="Customer Payments" value={payments.isReady ? "Ready" : "Not ready"} helper={payments.lastSyncedAt ? `Last synced ${formatOwnerConsoleDate(payments.lastSyncedAt)}` : "No sync date visible"} />
          <SummaryFact label="Tenant Support" value={profile?.support_email ?? "Email not set"} helper={profile?.support_phone ?? "Phone not set"} />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Copy-friendly note</p>
          <p className="mt-1">
            {row.company} · {formatProductModeLabel({ row, internalEmails })} · {formatStatusLabel(row.entitlementStatus)} · Users {row.activeUsers}/{row.totalUsers} · Setup {readiness.completedRequiredCount}/{readiness.totalRequiredCount} · Payments {payments.isReady ? "ready" : "not ready"}.
          </p>
        </div>
      </section>
    </div>
  );
}
