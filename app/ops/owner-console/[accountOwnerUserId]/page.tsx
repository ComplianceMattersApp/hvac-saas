import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveAccountReadiness, type AccountReadinessSummary } from "@/lib/business/account-readiness";
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
import { resolveAccountEntitlement, type AccountEntitlementContext } from "@/lib/business/platform-entitlement";
import { accountScopeInList, resolveReportAccountContractorIds } from "@/lib/reports/report-account-scope";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type PageParams = Promise<{
  accountOwnerUserId?: string;
}>;

type HealthTone = "slate" | "emerald" | "blue" | "amber";

type AccountHealthSignal = {
  label: string;
  value: string;
  helper: string;
  tone: HealthTone;
};

type AccountTriageItem = {
  title: string;
  detail: string;
  tone: HealthTone;
};

type OperationalActivitySnapshot = {
  customerCount: number;
  latestCustomerAt: string | null;
  jobCount: number;
  latestJobAt: string | null;
  invoiceCount: number;
  issuedInvoiceCount: number;
  latestInvoiceAt: string | null;
};

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

function toValidDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysUntil(date: Date, now = new Date()) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date.getTime() - now.getTime()) / msPerDay);
}

function normalizeCount(value: unknown) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.trunc(count));
}

function latestTimestampFromRow(row: any, preferredKey: string, fallbackKey?: string) {
  const preferred = String(row?.[preferredKey] ?? "").trim();
  if (preferred) return preferred;
  const fallback = String(row?.[fallbackKey ?? ""] ?? "").trim();
  return fallback || null;
}

function formatLatestActivity(value: string | null) {
  const formatted = formatOwnerConsoleDate(value);
  return formatted === "-" ? "No activity yet" : `Latest: ${formatted}`;
}

async function resolveOperationalActivitySnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<OperationalActivitySnapshot> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const contractorIds = await resolveReportAccountContractorIds({
    supabase: params.supabase,
    accountOwnerUserId,
  });
  const scopedContractorIds = accountScopeInList(contractorIds);

  const [
    customerCountResult,
    latestCustomerResult,
    jobCountResult,
    latestJobResult,
    invoiceCountResult,
    issuedInvoiceCountResult,
    latestInvoiceResult,
  ] = await Promise.all([
    params.supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", accountOwnerUserId)
      .is("deleted_at", null),
    params.supabase
      .from("customers")
      .select("created_at")
      .eq("owner_user_id", accountOwnerUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    params.supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("contractor_id", scopedContractorIds),
    params.supabase
      .from("jobs")
      .select("created_at")
      .is("deleted_at", null)
      .in("contractor_id", scopedContractorIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    params.supabase
      .from("internal_invoices")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId),
    params.supabase
      .from("internal_invoices")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "issued"),
    params.supabase
      .from("internal_invoices")
      .select("created_at, issued_at")
      .eq("account_owner_user_id", accountOwnerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (customerCountResult.error) throw customerCountResult.error;
  if (latestCustomerResult.error) throw latestCustomerResult.error;
  if (jobCountResult.error) throw jobCountResult.error;
  if (latestJobResult.error) throw latestJobResult.error;
  if (invoiceCountResult.error) throw invoiceCountResult.error;
  if (issuedInvoiceCountResult.error) throw issuedInvoiceCountResult.error;
  if (latestInvoiceResult.error) throw latestInvoiceResult.error;

  return {
    customerCount: normalizeCount(customerCountResult.count),
    latestCustomerAt: latestTimestampFromRow(latestCustomerResult.data, "created_at"),
    jobCount: normalizeCount(jobCountResult.count),
    latestJobAt: latestTimestampFromRow(latestJobResult.data, "created_at"),
    invoiceCount: normalizeCount(invoiceCountResult.count),
    issuedInvoiceCount: normalizeCount(issuedInvoiceCountResult.count),
    latestInvoiceAt: latestTimestampFromRow(latestInvoiceResult.data, "issued_at", "created_at"),
  };
}

function resolveOverallHealth(params: {
  row: PlatformOwnerDashboardRow;
  readiness: AccountReadinessSummary;
  entitlement: AccountEntitlementContext;
}) : AccountHealthSignal {
  const status = String(params.row.entitlementStatus ?? params.entitlement.entitlementStatus ?? "").trim().toLowerCase();
  const trialEnd = toValidDate(params.row.trialEnd);
  const trialDaysRemaining = trialEnd ? daysUntil(trialEnd) : null;

  if (!params.readiness.isOperationallyReady) {
    return {
      label: "Overall Health",
      value: "Needs setup",
      helper: `${params.readiness.completedRequiredCount}/${params.readiness.totalRequiredCount} required setup items complete.`,
      tone: "amber",
    };
  }

  if (status && !["active", "trial", "grace"].includes(status)) {
    return {
      label: "Overall Health",
      value: "Inactive status",
      helper: `Current account status is ${formatStatusLabel(status)}.`,
      tone: "amber",
    };
  }

  if (params.row.activeUsers <= 0) {
    return {
      label: "Overall Health",
      value: "No active users",
      helper: "The account has no active internal users.",
      tone: "amber",
    };
  }

  if (status === "trial" && trialDaysRemaining != null && trialDaysRemaining <= 7) {
    return {
      label: "Overall Health",
      value: "Trial ending soon",
      helper: `Trial ends ${formatOwnerConsoleDate(params.row.trialEnd)}.`,
      tone: "amber",
    };
  }

  return {
    label: "Overall Health",
    value: "Looks ready",
    helper: "Core setup, status, and user signals look healthy.",
    tone: "emerald",
  };
}

function resolveBillingHealth(params: {
  row: PlatformOwnerDashboardRow;
  entitlement: AccountEntitlementContext;
}) : AccountHealthSignal {
  const status = String(params.row.entitlementStatus ?? params.entitlement.entitlementStatus ?? "").trim().toLowerCase();

  if (params.entitlement.isInternalComped) {
    return {
      label: "Billing Health",
      value: "Internal comped",
      helper: "Comped account signal is active; no tenant billing action shown here.",
      tone: "blue",
    };
  }

  if (params.entitlement.billingSubscriptionLinked) {
    return {
      label: "Billing Health",
      value: params.entitlement.billingSubscriptionStatus ?? "Linked",
      helper: `Subscription period ends ${formatOwnerConsoleDate(params.entitlement.billingCurrentPeriodEnd?.toISOString() ?? null)}.`,
      tone: "emerald",
    };
  }

  if (status === "trial") {
    return {
      label: "Billing Health",
      value: "Trial account",
      helper: "No subscription linkage is required while trial is active.",
      tone: "slate",
    };
  }

  return {
    label: "Billing Health",
    value: "Not linked",
    helper: "No platform subscription linkage is visible in this read-only snapshot.",
    tone: "amber",
  };
}

function resolveTrialHealth(row: PlatformOwnerDashboardRow): AccountHealthSignal {
  const trialEnd = toValidDate(row.trialEnd);
  const status = String(row.entitlementStatus ?? "").trim().toLowerCase();

  if (!trialEnd) {
    return {
      label: "Trial Signal",
      value: "No trial date",
      helper: "No trial end date is visible for this account.",
      tone: status === "trial" ? "amber" : "slate",
    };
  }

  const remainingDays = daysUntil(trialEnd);
  if (remainingDays < 0) {
    return {
      label: "Trial Signal",
      value: "Trial date passed",
      helper: `Trial ended ${formatOwnerConsoleDate(row.trialEnd)}.`,
      tone: "amber",
    };
  }

  if (remainingDays <= 7) {
    return {
      label: "Trial Signal",
      value: `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`,
      helper: `Trial ends ${formatOwnerConsoleDate(row.trialEnd)}.`,
      tone: "amber",
    };
  }

  return {
    label: "Trial Signal",
    value: `${remainingDays} days left`,
    helper: `Trial ends ${formatOwnerConsoleDate(row.trialEnd)}.`,
    tone: status === "trial" ? "emerald" : "slate",
  };
}

function resolveUserHealth(row: PlatformOwnerDashboardRow): AccountHealthSignal {
  if (row.activeUsers <= 0) {
    return {
      label: "User Health",
      value: "No active users",
      helper: `${row.totalUsers} total internal user${row.totalUsers === 1 ? "" : "s"} found.`,
      tone: "amber",
    };
  }

  return {
    label: "User Health",
    value: `${row.activeUsers}/${row.totalUsers} active`,
    helper: "Active internal user count is available for support triage.",
    tone: "emerald",
  };
}

function resolveAccountHealthSignals(params: {
  row: PlatformOwnerDashboardRow;
  readiness: AccountReadinessSummary;
  entitlement: AccountEntitlementContext;
}) {
  return [
    resolveOverallHealth(params),
    resolveBillingHealth(params),
    resolveTrialHealth(params.row),
    resolveUserHealth(params.row),
  ];
}

function resolveSupportNextChecks(params: {
  row: PlatformOwnerDashboardRow;
  readiness: AccountReadinessSummary;
  entitlement: AccountEntitlementContext;
  activitySnapshot: OperationalActivitySnapshot;
}) {
  const checks: AccountTriageItem[] = [];
  const status = String(params.row.entitlementStatus ?? params.entitlement.entitlementStatus ?? "").trim().toLowerCase();
  const trialEnd = toValidDate(params.row.trialEnd);
  const trialDaysRemaining = trialEnd ? daysUntil(trialEnd) : null;
  const billingMode = String(params.row.billingMode ?? "").trim().toLowerCase();

  for (const item of params.readiness.items) {
    if (item.status === "optional" || item.status === "complete") continue;
    checks.push({
      title: `Finish ${item.label}`,
      detail: item.description,
      tone: "amber",
    });
  }

  if (!params.row.productMode) {
    checks.push({
      title: "Confirm product mode",
      detail: "Product mode is not set, which can make support triage harder.",
      tone: "amber",
    });
  }

  if (params.activitySnapshot.customerCount === 0) {
    checks.push({
      title: "No customers yet",
      detail: "No customer records are visible for this account yet.",
      tone: "amber",
    });
  }

  if (params.activitySnapshot.jobCount === 0) {
    checks.push({
      title: "No jobs yet",
      detail: "No job records are visible for this account yet.",
      tone: "amber",
    });
  }

  if (billingMode === "internal_invoicing" && params.activitySnapshot.jobCount > 0 && params.activitySnapshot.invoiceCount === 0) {
    checks.push({
      title: "No internal invoices yet",
      detail: "This account uses internal invoicing, but no invoice records are visible yet.",
      tone: "amber",
    });
  }

  if (status && !["active", "trial", "grace"].includes(status)) {
    checks.push({
      title: "Review account status",
      detail: `Account status is ${formatStatusLabel(status)}. Confirm this is expected before troubleshooting workflow behavior.`,
      tone: "amber",
    });
  }

  if (status === "trial" && trialDaysRemaining != null && trialDaysRemaining <= 7) {
    checks.push({
      title: "Trial follow-up",
      detail: `Trial ends ${formatOwnerConsoleDate(params.row.trialEnd)}. Consider a friendly check-in if this is a real customer account.`,
      tone: "amber",
    });
  }

  if (!params.entitlement.billingSubscriptionLinked && status !== "trial" && !params.entitlement.isInternalComped) {
    checks.push({
      title: "Check platform billing linkage",
      detail: "No subscription linkage is visible for a non-trial, non-comped account.",
      tone: "amber",
    });
  }

  if (params.row.activeUsers <= 0) {
    checks.push({
      title: "Confirm active users",
      detail: "No active internal users are visible for this account.",
      tone: "amber",
    });
  }

  if (checks.length === 0) {
    checks.push({
      title: "No immediate setup checks",
      detail: "Core account health signals look ready. Continue with the customer-reported issue context.",
      tone: "emerald",
    });
  }

  return checks.slice(0, 6);
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

function Badge(props: { children: ReactNode; tone: HealthTone }) {
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

function HealthSignalCard(props: { signal: AccountHealthSignal }) {
  const borderClass = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50",
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
  }[props.signal.tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.signal.label}</p>
        <Badge tone={props.signal.tone}>{props.signal.tone === "emerald" ? "OK" : props.signal.tone === "amber" ? "Watch" : "Info"}</Badge>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.signal.value}</p>
      <p className="mt-1 text-xs text-slate-600">{props.signal.helper}</p>
    </div>
  );
}

function SupportNextCheckCard(props: { item: AccountTriageItem }) {
  const borderClass = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50",
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
  }[props.item.tone];

  return (
    <div className={`rounded-2xl border p-4 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-950">{props.item.title}</p>
        <Badge tone={props.item.tone}>{props.item.tone === "emerald" ? "Clear" : props.item.tone === "amber" ? "Check" : "Info"}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">{props.item.detail}</p>
    </div>
  );
}

function resolveAccountBadges(params: {
  row: PlatformOwnerDashboardRow;
  hiddenEmails: Set<string>;
  internalEmails: Set<string>;
}) {
  const badges: { label: string; tone: HealthTone }[] = [];

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
  const [readiness, entitlement, activitySnapshot] = await Promise.all([
    resolveAccountReadiness(accountOwnerUserId, admin),
    resolveAccountEntitlement(accountOwnerUserId, admin),
    resolveOperationalActivitySnapshot({ supabase: admin, accountOwnerUserId }),
  ]);
  const badges = resolveAccountBadges({ row, hiddenEmails, internalEmails });
  const healthSignals = resolveAccountHealthSignals({ row, readiness, entitlement });
  const supportNextChecks = resolveSupportNextChecks({ row, readiness, entitlement, activitySnapshot });
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
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Support Health</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {healthSignals.map((signal) => (
            <HealthSignalCard key={signal.label} signal={signal} />
          ))}
        </div>
      </section>

      <section id="support-next-checks" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Support Next Checks</h2>
            <p className="mt-1 text-sm text-slate-500">
              Read-only prompts from account setup, trial, billing, and user signals. These do not perform tenant actions.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {supportNextChecks.map((item) => (
            <SupportNextCheckCard key={`${item.title}-${item.detail}`} item={item} />
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Operational Activity</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label="Customers" value={String(activitySnapshot.customerCount)} helper={formatLatestActivity(activitySnapshot.latestCustomerAt)} />
          <DetailCard label="Jobs" value={String(activitySnapshot.jobCount)} helper={formatLatestActivity(activitySnapshot.latestJobAt)} />
          <DetailCard label="Invoices" value={String(activitySnapshot.invoiceCount)} helper={formatLatestActivity(activitySnapshot.latestInvoiceAt)} />
          <DetailCard label="Issued Invoices" value={String(activitySnapshot.issuedInvoiceCount)} helper="Issued invoice count only." />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Aggregate counts only. No customer, job, or invoice records are listed or opened from this support snapshot.
        </p>
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

          {readiness.isOperationallyReady ? (
            <div className="mt-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-emerald-900">Account setup complete</p>
                  <Badge tone="emerald">Complete</Badge>
                </div>
                <p className="mt-1 text-sm text-emerald-900">Required setup signals are complete.</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  {readiness.completedRequiredCount} of {readiness.totalRequiredCount} required items complete
                </p>
              </div>

              <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">View setup details</summary>
                <div className="mt-3 space-y-3">
                  {requiredReadinessItems.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4">
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
              </details>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                {requiredReadinessItems.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-2xl border p-4 ${
                      item.status === "complete"
                        ? "border-slate-200 bg-slate-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
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
            </>
          )}
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
