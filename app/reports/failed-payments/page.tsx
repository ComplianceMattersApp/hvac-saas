import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import {
  ReportPageHeader,
  ReportStatCard,
  ReportStatGrid,
  ReportTableShell,
  reportPageClass,
  reportTableHeadClass,
  reportTableRowClass,
} from "@/components/reports/ReportLedgerChrome";

export const metadata = {
  title: "Failed Payments",
  description: "Failed payment attempts that need review before anyone retries or contacts the customer.",
};

function formatUsdFromCents(cents: number | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatFailureCategoryLabel(category: string | null | undefined) {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (normalized === "payment_declined") return "Declined";
  if (normalized === "authentication_required") return "Requires action";
  if (normalized === "precondition_blocked") return "Blocked precondition";
  return "Unknown failure";
}

function formatRecommendedActionLabel(action: string | null | undefined) {
  const normalized = String(action ?? "").trim().toLowerCase();
  if (normalized === "review_payment_method") return "Review payment method";
  if (normalized === "request_customer_authentication") return "Request customer authentication";
  if (normalized === "fix_payment_setup") return "Fix payment setup";
  if (normalized === "retry_after_review") return "Review before retry";
  return "No action available";
}

function formatAttemptDate(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export default async function FailedPaymentReconciliationPage() {
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
    redirectTo: "/reports/invoices?banner=not_authorized",
  });

  const [internalBusinessIdentity, queue] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    loadFailedPaymentReconciliationItems({
      admin: supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 250,
    }),
  ]);

  const items = queue.items;

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Failed Payments"
        description="Failed attempts are not collected payments. Review the invoice workspace before retrying or contacting the customer."
        countSummary={`Open failed payments: ${queue.summary.openCount}`}
        truthNote="This queue is for attention only. Failed attempts do not count as money received."
      />

      <ReportCenterTabs current="failed-payments" />

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
        Failed Payments shows failed attempts needing review. Payments Received shows money already recorded. Confirm Payment shows reported payments awaiting verification.
      </section>

      <ReportStatGrid>
        <ReportStatCard label="Open failed payments" value={queue.summary.openCount} helperText="Unresolved scheduled autopay failures needing operator review." tone="rose" />
        <ReportStatCard label="Balance at risk" value={formatUsdFromCents(queue.summary.totalBalanceDueCents)} helperText="Balance due from invoice and payment records." tone="blue" />
        <ReportStatCard label="Declined" value={queue.summary.declinedCount} helperText="Decline failures awaiting human review." tone="rose" />
        <ReportStatCard label="Requires action" value={queue.summary.requiresActionCount} helperText="Authentication/customer action required failures." tone="blue" />
        <ReportStatCard label="Blocked/precondition" value={queue.summary.blockedPreconditionCount} helperText="Setup/precondition blockers preventing collection attempts." tone="slate" />
        <ReportStatCard label="Retry eligible" value={queue.summary.retryEligibleCount} helperText="Queue visibility only. Retry controls are intentionally not exposed here." tone="slate" />
      </ReportStatGrid>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm shadow-slate-950/5">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <div>
            <span className="font-semibold text-slate-900">Oldest open:</span>{" "}
            {formatAttemptDate(queue.summary.oldestOpenedAt)}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Newest open:</span>{" "}
            {formatAttemptDate(queue.summary.newestOpenedAt)}
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          This queue shows unresolved failed attempts, not full payment history.
        </div>
      </section>

      <ReportTableShell note="Queue actions are read-only. Use invoice workspace links for investigation; payment history stays on Payments Received.">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">No failed payments need attention.</div>
            <div className="mt-1">
              Failed attempts may still appear on Payments Received as payment history.
            </div>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr className={reportTableHeadClass}>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Balance Due</th>
                <th className="px-3 py-3">Failure Category</th>
                <th className="px-3 py-3">Failure Reason</th>
                <th className="px-3 py-3">Last Attempt</th>
                <th className="px-3 py-3">Retry Eligible</th>
                <th className="px-3 py-3">Recommended Action</th>
                <th className="px-3 py-3">Links</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const invoiceWorkspaceHref = item.jobId ? `/jobs/${item.jobId}/invoice` : null;
                const customerHref = item.customerId ? `/customers/${item.customerId}` : null;
                const jobHref = item.jobId ? `/jobs/${item.jobId}` : null;

                return (
                  <tr key={item.attemptId} className={reportTableRowClass}>
                    <td className="px-3 py-3 text-slate-700">{item.customerDisplayName || "Customer"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.invoiceNumber || item.invoiceId}</td>
                    <td className="px-3 py-3 text-slate-700">{formatUsdFromCents(item.balanceDueCents)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatFailureCategoryLabel(item.failureCategory)}</td>
                    <td className="px-3 py-3 text-slate-700">{item.failureMessage || item.failureCode || item.attemptStatus}</td>
                    <td className="px-3 py-3 text-slate-700">{formatAttemptDate(item.lastAttemptAt)}</td>
                    <td className="px-3 py-3 text-slate-700">{item.retryEligible ? "Yes" : "No"}</td>
                    <td className="px-3 py-3 text-slate-700">{formatRecommendedActionLabel(item.recommendedAction)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="flex flex-wrap gap-2">
                        {invoiceWorkspaceHref ? (
                          <Link href={invoiceWorkspaceHref} className="text-blue-700 hover:underline">Open invoice workspace</Link>
                        ) : null}
                        {customerHref ? (
                          <Link href={customerHref} className="text-blue-700 hover:underline">Open customer</Link>
                        ) : null}
                        {jobHref ? (
                          <Link href={jobHref} className="text-blue-700 hover:underline">Open job</Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ReportTableShell>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm shadow-slate-950/5">
        This queue does not contact Stripe or change invoices, payments, visits, or follow-up dates.
      </section>
    </div>
  );
}
