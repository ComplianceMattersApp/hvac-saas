import Link from "next/link";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { createClient } from "@/lib/supabase/server";
import {
  ReportFilterPanel,
  ReportPageHeader,
  ReportStatCard,
  ReportStatGrid,
  ReportTableShell,
  reportActionClass,
  reportControlClass,
  reportLabelClass,
  reportPageClass,
  reportTableHeadClass,
  reportTableRowClass,
} from "@/components/reports/ReportLedgerChrome";
import {
  depositDetailHrefForGroup,
  getDepositsLedgerSummary,
  type DepositsLedgerPayoutRow,
} from "@/lib/reports/deposits-ledger";

export const metadata = {
  title: "Deposits",
  description: "Read-only Stripe settlement and payout reconciliation",
};

const PAYOUT_STATUS_OPTIONS = [
  { value: "", label: "All payout statuses" },
  { value: "paid", label: "Paid" },
  { value: "complete", label: "Complete" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In transit" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
] as const;

const SYNC_STATUS_OPTIONS = [
  { value: "", label: "All sync statuses" },
  { value: "synced", label: "Synced" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "unmatched", label: "Unmatched" },
  { value: "skipped", label: "Skipped" },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(source: SearchParams, key: string) {
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDate(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeOption<T extends ReadonlyArray<{ value: string }>>(value: unknown, options: T) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return options.some((option) => option.value === normalized) ? normalized : "";
}

function formatUsdCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(value ?? 0) || 0) / 100);
}

function formatDate(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Pending";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildReviewLabels(row: DepositsLedgerPayoutRow) {
  const labels: string[] = [];

  if (row.needsReview) labels.push("Needs Review");
  if (row.groupKey === "unmatched" || row.unmatchedCount > 0) labels.push("Unmatched");
  if (row.pendingSyncCount > 0) labels.push("Pending Sync");
  if (row.failedSyncCount > 0) labels.push("Sync Failed");

  return labels.length ? Array.from(new Set(labels)) : ["Clear"];
}

export default async function DepositsReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: contractorUser, error: contractorError } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorError) throw contractorError;
      if (contractorUser?.contractor_id) redirect("/portal");
      redirect("/login");
    }
    throw error;
  }

  requireFinancialRegisterAccessOrRedirect({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: "/reports/invoices?banner=not_authorized",
  });

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const filters = {
    dateFrom: normalizeDate(firstParam(resolvedSearchParams, "from")),
    dateTo: normalizeDate(firstParam(resolvedSearchParams, "to")),
    payoutStatus: normalizeOption(firstParam(resolvedSearchParams, "payout_status"), PAYOUT_STATUS_OPTIONS),
    syncStatus: normalizeOption(firstParam(resolvedSearchParams, "sync_status"), SYNC_STATUS_OPTIONS),
  };

  const [internalBusinessIdentity, depositsLedger] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    getDepositsLedgerSummary({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      payoutStatus: filters.payoutStatus as any,
      syncStatus: filters.syncStatus as any,
    }),
  ]);

  const hasRows = depositsLedger.rows.length > 0;
  const summary = depositsLedger.summary;
  const totalsAreMixed = summary.hasMultipleCurrencies;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Deposits"
        description="Deposit reconciliation explains how Stripe-settled payments become bank deposits. Invoice paid/balance remains controlled by payment webhook and allocation truth."
        countSummary={hasRows ? `Showing ${depositsLedger.rows.length} deposit groups` : "No settlement data synced yet"}
        truthNote="Payments Register shows gross payment event truth. Deposits explain Stripe settlement and payout timing. Settlement rows do not change invoice paid/balance."
      />

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Stripe Dashboard remains the fallback for fee, net, and payout verification until settlement sync and deposit reporting are smoke-tested.
      </section>

      {depositsLedger.warnings.length > 0 ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
          Mixed currencies are present. Combined totals are not authoritative until deposits can be reviewed by currency.
        </section>
      ) : null}

      <ReportFilterPanel
        title="Filter deposits"
        description="Narrow settlement rows by payout or available date, payout status, and sync status."
      >
        <form action="/reports/deposits" method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Date from</span>
            <input name="from" type="date" defaultValue={filters.dateFrom} className={reportControlClass} />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Date to</span>
            <input name="to" type="date" defaultValue={filters.dateTo} className={reportControlClass} />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Payout status</span>
            <select name="payout_status" defaultValue={filters.payoutStatus} className={reportControlClass}>
              {PAYOUT_STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            <span className={reportLabelClass}>Sync status</span>
            <select name="sync_status" defaultValue={filters.syncStatus} className={reportControlClass}>
              {SYNC_STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2 xl:col-span-4 xl:justify-end">
            <button type="submit" className={reportActionClass("primary")}>
              Apply filters
            </button>
            <Link href="/reports/deposits" className={reportActionClass()}>
              Reset
            </Link>
          </div>
        </form>
      </ReportFilterPanel>

      <ReportStatGrid>
        <ReportStatCard
          label="Gross Collected"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.grossCollectedCents)}
          helperText="Synced payment-kind settlement rows only."
          tone="emerald"
        />
        <ReportStatCard
          label="Fees & Adjustments"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.feesAndAdjustmentsCents)}
          helperText="Stored Stripe fees, proven platform fees, and proven settlement adjustments."
          tone="blue"
        />
        <ReportStatCard
          label="Net Deposits"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.netDepositsCents)}
          helperText="Stored net settlement amounts. Gross Collected minus Fees & Adjustments equals Net Deposits."
          tone="blue"
        />
        <ReportStatCard
          label="Pending Payouts"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.pendingPayoutsCents)}
          helperText="Synced net amounts not yet tied to a paid or complete payout."
          tone="slate"
        />
        <ReportStatCard
          label="Unmatched / Needs Review"
          value={summary.unmatchedNeedsReviewCount}
          helperText="Unmatched, failed, pending, or incomplete settlement rows remain visible for review."
          tone={summary.unmatchedNeedsReviewCount > 0 ? "rose" : "slate"}
        />
      </ReportStatGrid>

      <ReportTableShell note="This read-only report groups existing settlement rows by payout identity. Open a group to inspect the included settlement rows.">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/90">
            <tr className={reportTableHeadClass}>
              <th className="px-3 py-3">Payout / Deposit</th>
              <th className="px-3 py-3">Arrival Date</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Gross Collected</th>
              <th className="px-3 py-3">Fees & Adjustments</th>
              <th className="px-3 py-3">Net Deposit</th>
              <th className="px-3 py-3">Payments</th>
              <th className="px-3 py-3">Needs Review</th>
            </tr>
          </thead>
          <tbody>
            {!hasRows ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="font-semibold text-slate-700">No settlement data synced yet.</div>
                    <div className="text-xs leading-5 text-slate-500">
                      Stripe Dashboard remains the fallback until settlement sync is run and verified.
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              depositsLedger.rows.map((row) => {
                const reviewLabels = buildReviewLabels(row);
                return (
                  <tr key={row.groupKey} className={reportTableRowClass}>
                    <td className="px-3 py-3">
                      <Link href={depositDetailHrefForGroup(row)} className="font-medium text-blue-700 hover:underline">
                        {row.payoutLabel}
                      </Link>
                      <div className="mt-1 font-mono text-[11px] text-slate-500">{row.groupKey}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{formatDate(row.payoutArrivalDate)}</td>
                    <td className="px-3 py-3 text-slate-700">{statusLabel(row.payoutStatus)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.grossCollectedCents)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.feesAndAdjustmentsCents)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.netDepositsCents)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.paymentCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {reviewLabels.map((label) => (
                          <span
                            key={label}
                            className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                              label === "Clear"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ReportTableShell>
    </div>
  );
}
