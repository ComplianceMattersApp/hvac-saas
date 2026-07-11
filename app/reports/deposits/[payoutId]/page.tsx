import Link from "next/link";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import {
  ReportPageHeader,
  ReportStatCard,
  ReportStatGrid,
  ReportTableShell,
  reportActionClass,
  reportPageClass,
  reportTableHeadClass,
  reportTableRowClass,
} from "@/components/reports/ReportLedgerChrome";
import { getDepositDetailLedger, type DepositDetailSettlementRow } from "@/lib/reports/deposits-ledger";

export const metadata = {
  title: "Deposit Detail",
  description: "Review the online payments, fees, net amount, and payout timing behind this deposit group.",
};

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

function displayId(value: string | null | undefined) {
  return String(value ?? "").trim() || "-";
}

function titleCase(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Pending";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function rowStatusLabels(row: DepositDetailSettlementRow) {
  return row.needsReviewLabels.length ? row.needsReviewLabels : ["Clear"];
}

export default async function DepositDetailPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
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

  const resolvedParams = await params;
  const payoutGroupId = decodeURIComponent(String(resolvedParams.payoutId ?? "").trim());

  const [internalBusinessIdentity, detail] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    getDepositDetailLedger({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      payoutGroupId,
    }),
  ]);

  const totalsAreMixed = detail.summary.hasMultipleCurrencies;
  const pendingNoPayout = detail.groupKey === "pending:no-payout";

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Deposit Detail"
        description="Review the online payments, fees, net amount, and payout timing behind this deposit group."
        countSummary={detail.found ? `${detail.rows.length} payments in ${detail.payoutLabel}` : "Deposit group not found"}
        truthNote="Deposits help explain how online payments become bank deposits. Your invoices and payment records stay unchanged."
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/reports/deposits" className={reportActionClass()}>
          Back to Deposits
        </Link>
        <Link
          href={`/reports/deposits/export/detail?payout_group_id=${encodeURIComponent(payoutGroupId)}`}
          className={reportActionClass()}
        >
          Export Detail CSV
        </Link>
      </div>

      <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        This read-only detail view shows how fees and adjustments affect the net amount for this deposit group.
      </section>

      {pendingNoPayout ? (
        <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Pending payout / no payout assigned. This group does not imply a bank deposit has occurred.
        </section>
      ) : null}

      {!detail.found ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600 shadow-sm shadow-slate-950/5">
          No payments match this deposit group in your account. The page does not reveal whether the payout exists elsewhere.
        </section>
      ) : (
        <>
          {detail.warnings.length > 0 ? (
            <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              Mixed currencies are present. Combined totals are not authoritative until deposits can be reviewed by currency.
            </section>
          ) : null}

          <ReportStatGrid>
            <ReportStatCard
              label="Gross Collected"
              value={totalsAreMixed ? "Review by currency" : formatUsdCents(detail.summary.grossCollectedCents)}
              helperText="Online payments included in this deposit group."
              tone="emerald"
            />
            <ReportStatCard
              label="Fees & Adjustments"
              value={totalsAreMixed ? "Review by currency" : formatUsdCents(detail.summary.feesAndAdjustmentsCents)}
              helperText="Stripe fees, platform fees when present, and settlement adjustments."
              tone="blue"
            />
            <ReportStatCard
              label="Net Deposit"
              value={totalsAreMixed ? "Review by currency" : formatUsdCents(detail.summary.netDepositsCents)}
              helperText="Estimated amount moving toward bank deposit after fees and adjustments."
              tone="blue"
            />
            <ReportStatCard
              label="Payments"
              value={detail.summary.paymentCount}
              helperText="Payments included in this group."
              tone="slate"
            />
            <ReportStatCard
              label="Unmatched / Needs Review"
              value={detail.summary.unmatchedNeedsReviewCount}
              helperText="Payments that need review before they can be fully matched."
              tone={detail.summary.unmatchedNeedsReviewCount > 0 ? "rose" : "slate"}
            />
          </ReportStatGrid>

          <ReportTableShell note="Read-only deposit detail. No sync, refund, dispute, correction, or payment recording actions are available here.">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/90">
                <tr className={reportTableHeadClass}>
                  <th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Job / Test Reference</th>
                  <th className="px-3 py-3">Gross</th>
                  <th className="px-3 py-3">Fees & Adjustments</th>
                  <th className="px-3 py-3">Net</th>
                  <th className="px-3 py-3">Payment / Available Date</th>
                  <th className="px-3 py-3">Charge ID</th>
                  <th className="px-3 py-3">Payment Intent ID</th>
                  <th className="px-3 py-3">Balance Transaction ID</th>
                  <th className="px-3 py-3">Status / Needs Review</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((row) => (
                  <tr key={row.settlementId} className={reportTableRowClass}>
                    <td className="px-3 py-3 text-slate-700">{row.invoiceLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{row.customerName}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="font-mono text-xs">{row.jobReference}</div>
                      <div className="mt-1 max-w-[14rem] truncate text-xs text-slate-500">{row.jobTitle}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{formatUsdCents(row.grossCents)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatUsdCents(row.feesAndAdjustmentsCents)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatUsdCents(row.netCents)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div>{formatDate(row.paymentDate)}</div>
                      <div className="mt-1 text-xs text-slate-500">Available {formatDate(row.availableDate)}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{displayId(row.chargeId)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{displayId(row.paymentIntentId)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{displayId(row.balanceTransactionId)}</td>
                    <td className="px-3 py-3">
                      <div className="mb-2 text-xs font-semibold text-slate-700">{titleCase(row.syncStatus)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {rowStatusLabels(row).map((label) => (
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
                ))}
              </tbody>
            </table>
          </ReportTableShell>
        </>
      )}
    </div>
  );
}
