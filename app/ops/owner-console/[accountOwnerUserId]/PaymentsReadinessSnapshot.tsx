import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { createAdminClient } from "@/lib/supabase/server";

function formatDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Not Started";
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function PaymentsCard(props: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 break-words text-base font-semibold text-slate-950">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

export default async function PaymentsReadinessSnapshot({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Customer Payments</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Stripe Connect readiness</h2>
            <p className="mt-1 text-sm text-slate-500">
              Read-only tenant payment readiness signals. This does not create payment links, refresh Stripe, expose raw Stripe IDs, or change tenant payment state.
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            readiness.isReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}>
            {readiness.isReady ? "Ready" : "Not ready"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PaymentsCard
            label="Connected Account"
            value={readiness.connectedAccountId ? "Connected" : "Not connected"}
            helper="Shows whether a tenant Stripe account is linked, without displaying the Stripe account id."
          />
          <PaymentsCard
            label="Onboarding"
            value={formatStatus(readiness.onboardingStatus)}
            helper="Tenant Stripe onboarding status stored on the company profile."
          />
          <PaymentsCard
            label="Charges Enabled"
            value={yesNo(readiness.chargesEnabled)}
            helper="Whether Stripe reports this tenant can accept charges."
          />
          <PaymentsCard
            label="Payouts Enabled"
            value={yesNo(readiness.payoutsEnabled)}
            helper="Whether Stripe reports this tenant can receive payouts."
          />
          <PaymentsCard
            label="Details Submitted"
            value={yesNo(readiness.detailsSubmitted)}
            helper="Whether Stripe onboarding details have been submitted."
          />
          <PaymentsCard
            label="Disabled Reason"
            value={readiness.disabledReason ? formatStatus(readiness.disabledReason) : "None visible"}
            helper="Stored Stripe disabled reason, if any."
          />
          <PaymentsCard
            label="Last Synced"
            value={formatDate(readiness.lastSyncedAt)}
            helper="Last stored Stripe Connect readiness sync time."
          />
          <PaymentsCard
            label="Payment Links"
            value={readiness.isReady ? "Eligible" : "Blocked"}
            helper="Eligibility signal only; no payment links are created here."
          />
        </div>
      </section>
    </div>
  );
}
