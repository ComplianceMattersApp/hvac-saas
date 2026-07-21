import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { inspectStaleStripePendingPayments } from "@/lib/business/stripe-pending-payment-inspector";
import { reportPageClass } from "@/components/reports/ReportLedgerChrome";
import { closeAbandonedStripeSessionFromForm, repairStripePendingPaymentFromForm } from "@/lib/actions/stripe-pending-payment-repair-actions";
import SubmitButton from "@/components/SubmitButton";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function tone(diagnosis: string) {
  if (diagnosis === "succeeded_match") return "border-amber-300 bg-amber-50 text-amber-950";
  if (diagnosis === "metadata_mismatch" || diagnosis === "amount_mismatch" || diagnosis === "retrieve_error") return "border-rose-300 bg-rose-50 text-rose-950";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default async function StripeReconciliationPage({ searchParams }: { searchParams: Promise<{ inspect?: string; repair?: string; cleanup?: string }> }) {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) redirect("/login");
  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });
  requireFinancialRegisterAccessOrRedirect({ actorUserId: user.id, internalUser, resourceAccountOwnerUserId: internalUser.account_owner_user_id, redirectTo: "/reports/invoices?banner=not_authorized" });
  const query = await searchParams;
  const shouldInspect = query.inspect === "1";
  const items = shouldInspect ? await inspectStaleStripePendingPayments({ admin: supabase, accountOwnerUserId: internalUser.account_owner_user_id }) : [];

  return <div className={reportPageClass}>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Read-only financial diagnostic</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">Stripe pending-payment inspector</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Advanced fallback for payments awaiting reconciliation for more than 15 minutes. Exact confirmed matches are normally recovered automatically; this view is for exceptional review.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/reports/payments" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Back to Payments</Link>
        <Link href="/reports/stripe-reconciliation?inspect=1" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Run read-only inspection</Link>
      </div>
    </div>
    {query.repair ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Repair result: {query.repair.replaceAll("_", " ")}</div> : null}
    {query.cleanup ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Cleanup result: {query.cleanup.replaceAll("_", " ")}</div> : null}
    {shouldInspect ? <section className="space-y-3">
      <div className="text-sm font-semibold text-slate-900">{items.length} stale pending session{items.length === 1 ? "" : "s"} inspected</div>
      {items.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No stale Stripe pending rows were found.</div> : items.map((item) => <article key={item.paymentId} className={`rounded-xl border p-4 ${tone(item.diagnosis)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">Invoice {item.invoiceNumber} · {item.billingName}</div><div className="mt-1 text-xs">Session …{item.checkoutSessionSuffix}{item.paymentIntentSuffix ? ` · Intent …${item.paymentIntentSuffix}` : ""}{item.chargeSuffix ? ` · Charge …${item.chargeSuffix}` : ""}</div></div><div className="font-semibold">{money(item.amountCents)}</div></div>
        <div className="mt-3 text-sm font-semibold">{item.diagnosis.replaceAll("_", " ")}</div><div className="mt-1 text-sm">{item.detail}</div>
        <div className="mt-3 flex flex-wrap items-end gap-4"><Link href={`/jobs/${item.jobId}/invoice?invoice_id=${encodeURIComponent(item.invoiceId)}#invoice-workspace`} className="text-sm font-semibold underline">Open invoice workspace</Link>
        {item.diagnosis === "succeeded_match" ? <form action={repairStripePendingPaymentFromForm} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-white/80 p-3">
          <input type="hidden" name="payment_id" value={item.paymentId} />
          <input type="hidden" name="confirm_repair" value="yes" />
          <span className="text-xs font-semibold">Stripe payment confirmed; EveryStep will re-check every safety condition.</span>
          <SubmitButton loadingText="Reconciling…" className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">Reconcile confirmed payment</SubmitButton>
        </form> : null}</div>
        {item.diagnosis === "still_open" ? <form action={closeAbandonedStripeSessionFromForm} className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-white/80 p-3">
          <input type="hidden" name="payment_id" value={item.paymentId} />
          <label className="flex items-center gap-2 text-xs font-semibold"><input required type="checkbox" name="confirm_close" value="yes" />I verified another payment was recorded for this invoice.</label>
          <SubmitButton loadingText="Closing…" className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white">Close abandoned session</SubmitButton>
        </form> : null}
      </article>)}
    </section> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Inspection runs only when requested. No Stripe API lookup has been made.</div>}
  </div>;
}
