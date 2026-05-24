import {
  getInternalBusinessProfileByAccountOwnerId,
  resolveInternalBusinessProfileLogoUrl,
} from "@/lib/business/internal-business-profile";
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

function formatBillingMode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "internal_invoicing") return "Internal Invoicing";
  return "External Billing";
}

function SnapshotCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 break-words text-base font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-1 text-xs text-slate-500">{props.helper}</p> : null}
    </div>
  );
}

export default async function CompanyProfileSnapshot({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const profile = await getInternalBusinessProfileByAccountOwnerId({
    accountOwnerUserId,
    supabase: admin,
  });
  const logoUrl = profile?.logo_url
    ? await resolveInternalBusinessProfileLogoUrl({ logoUrl: profile.logo_url, expiresIn: 60 * 10 })
    : null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Company Profile</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Read-only company contact snapshot</h2>
            <p className="mt-1 text-sm text-slate-500">
              Customer-facing company, support, logo, and invoice-mode signals. No profile edits are available here.
            </p>
          </div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-14 max-w-[180px] rounded-xl border border-slate-200 bg-white object-contain p-2"
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
              No logo visible
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SnapshotCard
            label="Display Name"
            value={profile?.display_name ?? "Not set"}
            helper="Name shown on customer-facing surfaces."
          />
          <SnapshotCard
            label="Support Email"
            value={profile?.support_email ?? "Not set"}
            helper="Customer-facing support email."
          />
          <SnapshotCard
            label="Support Phone"
            value={profile?.support_phone ?? "Not set"}
            helper="Customer-facing support phone."
          />
          <SnapshotCard
            label="Invoice Mode"
            value={formatBillingMode(profile?.billing_mode)}
            helper="Current tenant billing/invoice posture."
          />
          <SnapshotCard
            label="Logo"
            value={profile?.logo_url ? "Configured" : "Not set"}
            helper="Read-only logo signal."
          />
          <SnapshotCard
            label="Profile Created"
            value={formatDate(profile?.created_at)}
          />
          <SnapshotCard
            label="Profile Updated"
            value={formatDate(profile?.updated_at)}
          />
          <SnapshotCard
            label="Profile Row"
            value={profile ? "Found" : "Missing"}
            helper="Missing profile may explain incomplete setup signals."
          />
        </div>
      </section>
    </div>
  );
}
