import Link from "next/link";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import DepositsSyncPanel from "@/components/reports/DepositsSyncPanel";
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
  getDepositDetailExportRows,
  getDepositsLedgerSummary,
  type DepositDetailSettlementRow,
  type DepositsLedgerPayoutRow,
} from "@/lib/reports/deposits-ledger";
import { getDepositsReconciliationStatus } from "@/lib/reports/deposits-reconciliation-status";

export const metadata = {
  title: "Bank Deposits",
  description: "Trace invoice payments through processing fees to expected Stripe bank deposits.",
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

function defaultSyncDates() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function normalizeOption<T extends ReadonlyArray<{ value: string }>>(value: unknown, options: T) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return options.some((option) => option.value === normalized) ? normalized : "";
}

function buildExportSearch(filters: {
  dateFrom: string;
  dateTo: string;
  payoutStatus: string;
  syncStatus: string;
}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.payoutStatus) params.set("payout_status", filters.payoutStatus);
  if (filters.syncStatus) params.set("sync_status", filters.syncStatus);
  return params.toString();
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

function invoicePaymentDepositStatus(row: DepositDetailSettlementRow) {
  if (row.needsReview || row.syncStatus === "failed") return "Needs review";
  if (!row.payoutId) return "Waiting for Stripe";
  const status = String(row.payoutStatus ?? "").toLowerCase();
  if (status === "paid" || status === "complete") return "Paid by Stripe";
  if (status === "in_transit") return "In transit";
  if (status === "pending") return "Scheduled";
  if (status === "failed" || status === "canceled") return "Needs review";
  return "Waiting for Stripe";
}

export default async function DepositsReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/login",
        }),
      );
    }
    throw error;
  }

  requireFinancialRegisterAccessOrRedirect({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: "/reports/dashboard?banner=not_authorized",
  });

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const defaults = defaultSyncDates();
  const filters = {
    dateFrom: normalizeDate(firstParam(resolvedSearchParams, "from")) || defaults.from,
    dateTo: normalizeDate(firstParam(resolvedSearchParams, "to")) || defaults.to,
    payoutStatus: normalizeOption(firstParam(resolvedSearchParams, "payout_status"), PAYOUT_STATUS_OPTIONS),
    syncStatus: normalizeOption(firstParam(resolvedSearchParams, "sync_status"), SYNC_STATUS_OPTIONS),
  };

  const [internalBusinessIdentity, depositsLedger, invoicePayments] = await Promise.all([
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
    getDepositDetailExportRows({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      payoutStatus: filters.payoutStatus as any,
      syncStatus: filters.syncStatus as any,
    }),
  ]);
  const reconciliation = await getDepositsReconciliationStatus({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    payoutStatus: filters.payoutStatus,
    syncStatus: filters.syncStatus,
    filteredSettlementRows: depositsLedger.rows.length,
  });

  const hasRows = depositsLedger.rows.length > 0;
  const summary = depositsLedger.summary;
  const totalsAreMixed = summary.hasMultipleCurrencies;
  const exportSearch = buildExportSearch(filters);
  const exportSuffix = exportSearch ? `?${exportSearch}` : "";

  return (
    <div className={reportPageClass}>
      <ReportCenterTabs current="deposits" showDeposits />

      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Bank deposits"
        description="See what customers paid, processing fees, expected bank amounts, and the Stripe deposits that contain each invoice payment."
        countSummary={hasRows ? `Showing ${depositsLedger.rows.length} deposit groups` : "No deposits to review yet"}
        truthNote="Use this report to explain the lump-sum Stripe deposit shown by your bank. Your bank or accounting feed remains the final record of what actually arrived."
      />

      <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        Follow each online invoice payment from the amount paid, through proven deductions, to the Stripe deposit expected in your bank.
      </section>

      <DepositsSyncPanel
        accountOwnerUserId={internalUser.account_owner_user_id}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
      />

      <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Reconciliation status</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <span>{reconciliation.recordedStripePayments} recorded Stripe payments</span>
          <span>{reconciliation.syncedSettlements} settlement records synced</span>
          <span>{reconciliation.awaitingSync} awaiting settlement sync</span>
          <span>{reconciliation.pendingPayout} pending payout</span>
          <span>{reconciliation.syncFailures} sync failures</span>
        </div>
      </section>

      {depositsLedger.warnings.length > 0 ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
          Mixed currencies are present. Combined totals are not authoritative until deposits can be reviewed by currency.
        </section>
      ) : null}

      <ReportFilterPanel
        title="Filter deposits"
        description="Narrow deposits by payout or available date, payout status, and sync status."
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
            <Link href={`/reports/deposits/export/summary${exportSuffix}`} className={reportActionClass()}>
              Export Summary CSV
            </Link>
            <Link href={`/reports/deposits/export/detail${exportSuffix}`} className={reportActionClass()}>
              Export Detail CSV
            </Link>
          </div>
        </form>
      </ReportFilterPanel>

      <ReportStatGrid>
        <ReportStatCard
          label="Gross Collected"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.grossCollectedCents)}
          helperText="Online payments included in this report."
          tone="emerald"
        />
        <ReportStatCard
          label="Fees & Adjustments"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.feesAndAdjustmentsCents)}
          helperText="Stripe fees, platform fees when present, and settlement adjustments."
          tone="blue"
        />
        <ReportStatCard
          label="Net Deposits"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.netDepositsCents)}
          helperText="Estimated amount moving toward bank deposit after fees and adjustments."
          tone="blue"
        />
        <ReportStatCard
          label="Pending Payouts"
          value={totalsAreMixed ? "Review by currency" : formatUsdCents(summary.pendingPayoutsCents)}
          helperText="Net amounts that have not been tied to a completed payout yet."
          tone="slate"
        />
        <ReportStatCard
          label="Unmatched / Needs Review"
          value={summary.unmatchedNeedsReviewCount}
          helperText="Payments that need review before they can be fully matched."
          tone={summary.unmatchedNeedsReviewCount > 0 ? "rose" : "slate"}
        />
      </ReportStatGrid>

      <ReportTableShell note="Invoice-payment view. An invoice may appear more than once when it was paid in installments. Amounts come only from synced Stripe settlement records.">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Invoice payment breakdown</h2>
          <p className="mt-1 text-xs text-slate-600">See what was paid, what Stripe deducted, and what amount is expected in the bank.</p>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/90">
            <tr className={reportTableHeadClass}>
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Payment date</th>
              <th className="px-3 py-3">Amount paid</th>
              <th className="px-3 py-3">Processing fee</th>
              <th className="px-3 py-3">Other proven deductions</th>
              <th className="px-3 py-3">Expected in bank</th>
              <th className="px-3 py-3">Deposit date</th>
              <th className="px-3 py-3">Deposit status</th>
            </tr>
          </thead>
          <tbody>
            {invoicePayments.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">No synced invoice payments match this date range and filters.</td></tr>
            ) : invoicePayments.map((row) => {
              const invoiceHref = row.jobId && row.invoiceId ? `/jobs/${encodeURIComponent(row.jobId)}/invoice` : null;
              return (
                <tr key={row.settlementId} className={reportTableRowClass}>
                  <td className="px-3 py-3">{invoiceHref ? <Link href={invoiceHref} className="font-medium text-blue-700 hover:underline">{row.invoiceLabel}</Link> : <span className="text-slate-700">{row.invoiceLabel}</span>}</td>
                  <td className="px-3 py-3 text-slate-700">{row.customerName}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDate(row.paymentDate)}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{formatUsdCents(row.grossCents)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatUsdCents(row.stripeFeeCents)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatUsdCents(row.platformFeeCents)}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{formatUsdCents(row.netCents)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDate(row.payoutArrivalDate)}</td>
                  <td className="px-3 py-3"><Link href={row.payoutHref} className="font-medium text-blue-700 hover:underline">{invoicePaymentDepositStatus(row)}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ReportTableShell>

      <ReportTableShell note="Supporting breakdown only. Compare the expected Stripe deposit with the lump-sum transaction shown by your bank or accounting feed.">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Stripe deposits</h2>
          <p className="mt-1 text-xs text-slate-600">Each deposit explains the lump sum: customer payments minus proven fees and deductions equals the expected bank deposit.</p>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/90">
            <tr className={reportTableHeadClass}>
              <th className="px-3 py-3">Payout / Deposit</th>
              <th className="px-3 py-3">Arrival Date</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Customer Payments</th>
              <th className="px-3 py-3">Processing Fees</th>
              <th className="px-3 py-3">Other Deductions</th>
              <th className="px-3 py-3">Expected Bank Deposit</th>
              <th className="px-3 py-3">Payments</th>
              <th className="px-3 py-3">Needs Review</th>
            </tr>
          </thead>
          <tbody>
            {!hasRows ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="font-semibold text-slate-700">
                      {reconciliation.recordedStripePayments === 0
                        ? "No recorded online payments were found for this date range."
                        : reconciliation.settlementsInRange > 0
                          ? "No deposit records match the current filters."
                          : "Online payments are awaiting Stripe deposit sync."}
                    </div>
                    <div className="text-xs leading-5 text-slate-500">
                      {reconciliation.recordedStripePayments === 0
                        ? "Change the date range to review a different period."
                        : reconciliation.settlementsInRange > 0
                          ? "Reset the filters to review all settlement records."
                          : "Online payments exist, but their Stripe deposit details have not been synced yet. Preview the sync above to review what will be imported."}
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
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.processingFeesCents)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.otherDeductionsCents)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.hasMultipleCurrencies ? "Review by currency" : formatUsdCents(row.netDepositsCents)}
                      {!row.hasMultipleCurrencies ? (
                        <div className="mt-1 whitespace-nowrap text-[11px] text-slate-500">
                          {formatUsdCents(row.grossCollectedCents)} − {formatUsdCents(row.processingFeesCents + row.otherDeductionsCents)} = {formatUsdCents(row.netDepositsCents)}
                        </div>
                      ) : null}
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
