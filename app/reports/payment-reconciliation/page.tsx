import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  rejectFieldPaymentCollectionReportFromForm,
  verifyFieldPaymentCollectionReportFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
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
import SubmitButton from "@/components/SubmitButton";

export const metadata = {
  title: "Payment Reconciliation",
  description: "Read-only queue for field-reported non-card payment verification work",
};

function formatUsdFromCents(cents: number | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatMethodLabel(method: string | null | undefined) {
  const normalized = String(method ?? "").trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "check") return "Check";
  if (normalized === "other") return "Other";
  return "Unknown";
}

function formatStatusLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "reported") return "Reported";
  if (normalized === "under_review") return "Under Review";
  if (normalized === "needs_correction") return "Needs Correction";
  return "Open";
}

function formatDate(value: string | null | undefined) {
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

export default async function PaymentReconciliationPage() {
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

  const explicitFieldBillingCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
    supabase: supabase as any,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: internalUser.user_id,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const canAccessQueue =
    canViewFinancialRegister({
      actorUserId: user.id,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    }) || fieldBillingCapabilities.can_verify_non_card_collection;

  if (!canAccessQueue) {
    redirect("/reports/invoices?banner=not_authorized");
  }

  const [internalBusinessIdentity, queue] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    listFieldPaymentCollectionReportsForReconciliation({
      admin: supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 250,
    }),
  ]);

  return (
    <div className={reportPageClass}>
      <ReportPageHeader
        businessName={internalBusinessIdentity.display_name}
        title="Payment Reconciliation"
        description="Field-reported payments need office verification before they count as collected."
        countSummary={`Open field payment reports: ${queue.summary.openCount}`}
        truthNote="Card payments are confirmed by Stripe. Check, cash, and other field reports stay here until verified. Verification records this as final payment truth. Rejecting does not record payment."
      />

      <ReportCenterTabs current="payment-reconciliation" />

      <ReportStatGrid>
        <ReportStatCard
          label="Open reports"
          value={queue.summary.openCount}
          helperText="Field collection reports awaiting reconciliation."
          tone="slate"
        />
        <ReportStatCard
          label="Reported"
          value={queue.summary.reportedCount}
          helperText="New reports not yet reviewed."
          tone="blue"
        />
        <ReportStatCard
          label="Under review"
          value={queue.summary.underReviewCount}
          helperText="Reports currently in office review."
          tone="slate"
        />
        <ReportStatCard
          label="Needs correction"
          value={queue.summary.needsCorrectionCount}
          helperText="Reports needing follow-up context."
          tone="rose"
        />
        <ReportStatCard
          label="Total reported amount"
          value={formatUsdFromCents(queue.summary.totalReportedAmountCents)}
          helperText="Reported amount only. Not collected-money truth yet."
          tone="slate"
        />
      </ReportStatGrid>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm shadow-slate-950/5">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <div>
            <span className="font-semibold text-slate-900">Oldest open:</span> {formatDate(queue.summary.oldestReportedAt)}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Newest open:</span> {formatDate(queue.summary.newestReportedAt)}
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          Use Verify only after the office confirms this check, cash, or other payment was received.
        </div>
      </section>

      <ReportTableShell note="Verify converts the report to final payment truth. Reject leaves no payment truth. Correction and void actions are not enabled in this slice.">
        {queue.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">No field payment reports need reconciliation.</div>
            <div className="mt-1">When field users report check, cash, or other collection, open items will appear here.</div>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr className={reportTableHeadClass}>
                <th className="px-3 py-3">Customer / Job</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Reported By</th>
                <th className="px-3 py-3">Reported At</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Note</th>
                <th className="px-3 py-3">Links</th>
                <th className="px-3 py-3">Verification</th>
              </tr>
            </thead>
            <tbody>
              {queue.items.map((item) => (
                <tr key={item.reportId} className={reportTableRowClass}>
                  <td className="px-3 py-3 text-slate-700">
                    <div className="font-semibold text-slate-900">{item.customerDisplayName || "Customer"}</div>
                    <div className="text-xs text-slate-600">{item.jobReference}</div>
                    {item.jobTitle ? <div className="text-xs text-slate-600">{item.jobTitle}</div> : null}
                    {item.locationLabel ? <div className="text-xs text-slate-500">{item.locationLabel}</div> : null}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{item.invoiceReference}</td>
                  <td className="px-3 py-3 text-slate-700">{formatMethodLabel(item.paymentMethod)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatUsdFromCents(item.amountCents)}</td>
                  <td className="px-3 py-3 text-slate-700">{item.reference || "-"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.reportedByDisplayName}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDate(item.reportedAt)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatStatusLabel(item.status)}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <div className="max-w-[20rem] truncate">{item.note || "-"}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <div className="flex flex-wrap gap-2">
                      <Link href={item.links.invoiceWorkspaceHref} className="text-blue-700 hover:underline">
                        Open invoice workspace
                      </Link>
                      <Link href={item.links.jobHref} className="text-blue-700 hover:underline">
                        Open job
                      </Link>
                      {item.links.customerHref ? (
                        <Link href={item.links.customerHref} className="text-blue-700 hover:underline">
                          Open customer
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {item.reportedByUserId === user.id ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
                        Reporter cannot verify their own report.
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]">
                        <form action={verifyFieldPaymentCollectionReportFromForm} className="space-y-2">
                          <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                          <input type="hidden" name="report_id" value={item.reportId} />
                          <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                          <input type="hidden" name="job_id" value={item.jobId} />
                          <input type="hidden" name="tab" value="info" />
                          <input type="hidden" name="return_to" value="/reports/payment-reconciliation" />
                          <label className="block">
                            <span className="mb-1 block font-semibold text-slate-900">Verification note</span>
                            <input
                              name="verification_note"
                              type="text"
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                              placeholder="Optional office confirmation details"
                            />
                          </label>
                          <SubmitButton
                            className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            loadingText="Verifying..."
                          >
                            Verify
                          </SubmitButton>
                        </form>
                        <form action={rejectFieldPaymentCollectionReportFromForm} className="space-y-2">
                          <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                          <input type="hidden" name="report_id" value={item.reportId} />
                          <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                          <input type="hidden" name="job_id" value={item.jobId} />
                          <input type="hidden" name="tab" value="info" />
                          <input type="hidden" name="return_to" value="/reports/payment-reconciliation" />
                          <label className="block">
                            <span className="mb-1 block font-semibold text-slate-900">Rejection reason</span>
                            <input
                              name="rejection_reason"
                              type="text"
                              required
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                              placeholder="Required"
                            />
                          </label>
                          <SubmitButton
                            className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            loadingText="Rejecting..."
                          >
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportTableShell>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm shadow-slate-950/5">
        Verification records final payment truth through existing internal invoice payment actions. Rejection writes no payment truth. No correction/void actions are enabled in this slice.
      </section>
    </div>
  );
}
