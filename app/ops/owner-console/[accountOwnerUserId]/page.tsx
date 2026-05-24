import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import {
  formatBillingModeLabel,
  formatOwnerConsoleDate,
  formatProductModeLabel,
  formatStatusLabel,
  isHiddenTestAccountRow,
  isPlatformInternalAccountRow,
  loadPlatformOwnerDashboardModel,
  parseHiddenAccountEmails,
  parseInternalAccountEmails,
  type PlatformOwnerDashboardRow,
} from "@/lib/business/platform-owner-dashboard";
import { resolveAccountEntitlement } from "@/lib/business/platform-entitlement";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type PageParams = Promise<{
  accountOwnerUserId?: string;
}>;

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

function formatPlanKey(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Not Set";
  if (normalized === "starter") return "Starter";
  if (normalized === "professional") return "Professional";
  if (normalized === "enterprise") return "Enterprise";
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function DetailCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-1 text-xs text-slate-500">{props.helper}</p> : null}
    </div>
  );
}

function Badge(props: { children: ReactNode; tone: "slate" | "emerald" | "blue" | "amber" }) {
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-800",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-800",
  }[props.tone];

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${classes}`}>
      {props.children}
    </span>
  );
}

function resolveAccountBadges(params: {
  row: PlatformOwnerDashboardRow;
  hiddenEmails: Set<string>;
  internalEmails: Set<string>;
}) {
  const badges: { label: string; tone: "slate" | "emerald" | "blue" | "amber" }[] = [];

  if (isPlatformInternalAccountRow(params.row, params.internalEmails)) {
    badges.push({ label: "Platform / Internal", tone: "emerald" });
  }

  if (isHiddenTestAccountRow(params.row, params.hiddenEmails)) {
    badges.push({ label: "Hidden / Test", tone: "blue" });
  }

  if (!params.row.productMode) {
    badges.push({ label: "Product Not Set", tone: "amber" });
  }

  if (badges.length === 0) {
    badges.push({ label: "Customer Account", tone: "slate" });
  }

  return badges;
}

export default async function PlatformOwnerAccountSnapshotPage({ params }: { params: PageParams }) {
  await requirePlatformOwnerOrFailClosed();

  const rawParams = (await params) ?? {};
  const accountOwnerUserId = decodeURIComponent(
    String(rawParams.accountOwnerUserId ?? "").trim(),
  );

  if (!accountOwnerUserId) {
    notFound();
  }

  const admin = createAdminClient();
  const model = await loadPlatformOwnerDashboardModel({ admin });
  const row = model.rows.find((candidate) => candidate.accountOwnerUserId === accountOwnerUserId);

  if (!row) {
    notFound();
  }

  const hiddenEmails = parseHiddenAccountEmails(process.env);
  const internalEmails = parseInternalAccountEmails(process.env);
  const [readiness, entitlement] = await Promise.all([
    resolveAccountReadiness(accountOwnerUserId, admin),
    resolveAccountEntitlement(accountOwnerUserId, admin),
  ]);
  const badges = resolveAccountBadges({ row, hiddenEmails, internalEmails });
  const requiredReadinessItems = readiness.items.filter((item) => item.status !== "optional");
  const optionalReadinessItems = readiness.items.filter((item) => item.status === "optional");

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform Owner</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Account Support Snapshot</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Read-only owner support view. This page does not impersonate users, edit tenant data, start support sessions, or run tenant actions.
            </p>
          </div>
          <Link
            href="/ops/owner-console"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to Owner Console
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((badge) => (
                <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>
              ))}
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{row.company}</h2>
            <p className="mt-1 text-sm text-slate-500">Owner: {row.ownerName ?? "-"} · {row.ownerEmail ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Account owner user id</p>
            <p className="mt-1 break-all font-mono text-slate-800">{row.accountOwnerUserId}</p>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Account State</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label="Product" value={formatProductModeLabel({ row, internalEmails })} />
          <DetailCard label="Status" value={formatStatusLabel(row.entitlementStatus)} helper={`Trial ends: ${formatOwnerConsoleDate(row.trialEnd)}`} />
          <DetailCard label="Billing Mode" value={formatBillingModeLabel(row.billingMode)} />
          <DetailCard label="Users" value={`${row.activeUsers}/${row.totalUsers}`} helper="Active / total internal users" />
          <DetailCard label="Created" value={formatOwnerConsoleDate(row.createdAt)} />
          <DetailCard label="Updated" value={formatOwnerConsoleDate(row.updatedAt)} />
          <DetailCard label="Setup Invite" value={row.setupInviteState.replaceAll("_", " ")} />
          <DetailCard label="Operational Readiness" value={readiness.isOperationallyReady ? "Ready" : "Needs setup"} helper={`${readiness.completedRequiredCount}/${readiness.totalRequiredCount} required items complete`} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Readiness Checklist</h2>
          <p className="mt-1 text-sm text-slate-500">Existing account setup signals only. No support-side edits are available here.</p>

          <div className="mt-4 space-y-3">
            {requiredReadinessItems.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <Badge tone={item.status === "complete" ? "emerald" : "amber"}>
                    {item.status === "complete" ? "Complete" : "Needs setup"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>

          {optionalReadinessItems.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Optional Signals</p>
              <div className="mt-2 space-y-2">
                {optionalReadinessItems.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Entitlement & Billing Snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">Read-only subscription and entitlement signals. Raw Stripe identifiers are not shown.</p>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-slate-900">{formatPlanKey(entitlement.planKey)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Entitlement status</dt>
              <dd className="font-medium text-slate-900">{formatStatusLabel(entitlement.entitlementStatus)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Billing customer linked</dt>
              <dd className="font-medium text-slate-900">{yesNo(entitlement.billingCustomerLinked)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Subscription linked</dt>
              <dd className="font-medium text-slate-900">{yesNo(entitlement.billingSubscriptionLinked)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Subscription status</dt>
              <dd className="font-medium text-slate-900">{entitlement.billingSubscriptionStatus ?? "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Current period end</dt>
              <dd className="font-medium text-slate-900">{formatOwnerConsoleDate(entitlement.billingCurrentPeriodEnd?.toISOString() ?? null)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Cancel at period end</dt>
              <dd className="font-medium text-slate-900">{yesNo(entitlement.billingCancelAtPeriodEnd)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Internal comped</dt>
              <dd className="font-medium text-slate-900">{yesNo(entitlement.isInternalComped)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Seat limit</dt>
              <dd className="font-medium text-slate-900">{entitlement.seatLimit == null ? "Unlimited / not set" : entitlement.seatLimit}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
        <h2 className="font-semibold">Support boundary</h2>
        <p className="mt-1">
          This page is intentionally read-only. It does not grant tenant browsing, impersonation, support-side mutation, Stripe/QBO/SMS/customer portal actions, or direct production data repair.
        </p>
      </section>
    </div>
  );
}
