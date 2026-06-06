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
} from "@/components/reports/ReportLedgerChrome";
import SubmitButton from "@/components/SubmitButton";

export const metadata = {
  title: "Confirm Payment",
  description: "Review field-reported cash, check, and other payments before they count as collected.",
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
  if (normalized === "reported") return "Needs confirmation";
  if (normalized === "under_review") return "In review";
  if (normalized === "needs_correction") return "Needs info";
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
        title="Confirm Payment"
        description="Review cash, check, or other payments reported from the field before they count as collected."
        countSummary={`Needs confirmation: ${queue.summary.openCount}`}
        truthNote="Verify only after confirming the money was received. Rejecting does not record payment."
      />

      <ReportCenterTabs current="payment-reconciliation" />

      <ReportStatGrid>
        <ReportStatCard
          label="Needs confirmation"
          value={queue.summary.openCount}
          helperText="Reported payments awaiting office confirmation."
          tone="slate"
        />
        <ReportStatCard
          label="In review"
          value={queue.summary.underReviewCount}
          helperText="Payments already being checked by the office."
          tone="blue"
        />
        <ReportStatCard
          label="Needs info"
          value={queue.summary.needsCorrectionCount}
          helperText="Reports needing more context before confirmation."
          tone="rose"
        />
        <ReportStatCard
          label="Reported total"
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
          Verify only after confirming the money was received. Rejecting does not record payment.
        </div>
      </section>

      <ReportTableShell note="Reported amount only. Not collected-money truth yet. Correction and void actions are not enabled yet.">
        {queue.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">No payments need confirmation.</div>
            <div className="mt-1">When field users report check, cash, or other collection, open items will appear here.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {queue.items.map((item) => (
              <article key={item.reportId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                        {formatStatusLabel(item.status)}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {item.invoiceReference}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div>
                        <div className="text-base font-semibold text-slate-950">{item.customerDisplayName || "Customer"}</div>
                        <div className="mt-1 text-sm text-slate-600">{item.jobReference}{item.jobTitle ? ` - ${item.jobTitle}` : ""}</div>
                        {item.locationLabel ? <div className="mt-1 text-xs text-slate-500">{item.locationLabel}</div> : null}
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:min-w-48 md:text-right">
                        <div className="text-2xl font-semibold text-slate-950">{formatUsdFromCents(item.amountCents)}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatMethodLabel(item.paymentMethod)}</div>
                        <div className="mt-1 text-xs text-slate-500">Reported amount only. Not collected-money truth yet.</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Reported by</div>
                        <div className="mt-1 font-medium text-slate-900">{item.reportedByDisplayName}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Reported time</div>
                        <div className="mt-1 font-medium text-slate-900">{formatDate(item.reportedAt)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Reference / check number</div>
                        <div className="mt-1 font-medium text-slate-900">{item.reference || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Note</div>
                        <div className="mt-1 font-medium text-slate-900">{item.note || "-"}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                      <Link href={item.links.invoiceWorkspaceHref} className="font-semibold text-blue-700 hover:underline">
                        Open invoice
                      </Link>
                      <Link href={item.links.jobHref} className="font-semibold text-blue-700 hover:underline">
                        Open job
                      </Link>
                      {item.links.customerHref ? (
                        <Link href={item.links.customerHref} className="font-semibold text-blue-700 hover:underline">
                          Open customer
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs lg:w-80">
                    {item.reportedByUserId === user.id ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                        Reporter cannot verify their own report.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <form action={verifyFieldPaymentCollectionReportFromForm} className="space-y-2 rounded-md border border-emerald-200 bg-white p-3">
                          <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                          <input type="hidden" name="report_id" value={item.reportId} />
                          <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                          <input type="hidden" name="job_id" value={item.jobId} />
                          <input type="hidden" name="tab" value="info" />
                          <input type="hidden" name="return_to" value="/reports/payment-reconciliation" />
                          <label className="block">
                            <span className="mb-1 block font-semibold text-slate-900">Confirmation note</span>
                            <input
                              name="verification_note"
                              type="text"
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                              placeholder="Optional office confirmation details"
                            />
                          </label>
                          <div className="text-[11px] leading-4 text-slate-600">Verify only after confirming the money was received.</div>
                          <SubmitButton
                            className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            loadingText="Verifying..."
                          >
                            Verify
                          </SubmitButton>
                        </form>
                        <form action={rejectFieldPaymentCollectionReportFromForm} className="space-y-2 rounded-md border border-rose-200 bg-white p-3">
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
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                              placeholder="Required"
                            />
                          </label>
                          <div className="text-[11px] leading-4 text-slate-600">Rejecting does not record payment.</div>
                          <SubmitButton
                            className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                            loadingText="Rejecting..."
                          >
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                    <div className="mt-3 text-[11px] leading-4 text-slate-500">Correction and void actions are not enabled yet.</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </ReportTableShell>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm shadow-slate-950/5">
        Verification records final payment truth through existing internal invoice payment actions. Rejection writes no payment truth. Correction and void actions are not enabled yet.
      </section>
    </div>
  );
}
