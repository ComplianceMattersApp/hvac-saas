import { beginPublicInvoiceCheckout } from "@/lib/actions/public-invoice-payment-actions";
import {
  resolveJobBlocksOnlineInvoicePayment,
  resolveInvoiceCollectedPaymentSummary,
  verifyTenantInvoicePaymentLinkToken,
} from "@/lib/business/internal-invoice-payments";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { createAdminClient } from "@/lib/supabase/server";

type PaymentLinkState = "paid" | "changed" | "inactive";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

function PaymentLinkMessage({ state }: { state: PaymentLinkState }) {
  const copy = state === "paid"
    ? { heading: "Invoice already paid", body: "No payment is needed for this invoice." }
    : state === "changed"
      ? { heading: "Invoice balance changed", body: "Please request an updated payment link." }
      : { heading: "This payment link is no longer active.", body: "Please contact the company if you believe a balance is still due." };

  return (
    <PublicShell>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Invoice payment</div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{copy.heading}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>
    </PublicShell>
  );
}

export default async function TenantInvoicePaymentLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const payload = verifyTenantInvoicePaymentLinkToken(token);
  if (!payload) return <PaymentLinkMessage state="inactive" />;

  const supabase = createAdminClient();
  const { data: invoice, error } = await supabase
    .from("internal_invoices")
    .select("id, account_owner_user_id, job_id, invoice_display_number, invoice_number, status, total_cents, billing_name")
    .eq("id", payload.invoiceId)
    .eq("account_owner_user_id", payload.accountOwnerUserId)
    .eq("job_id", payload.jobId)
    .maybeSingle();

  if (error || !invoice?.id || String(invoice.status ?? "").trim().toLowerCase() !== "issued") {
    return <PaymentLinkMessage state="inactive" />;
  }
  if (await resolveJobBlocksOnlineInvoicePayment({ accountOwnerUserId: payload.accountOwnerUserId, jobId: payload.jobId, supabase })) {
    return <PaymentLinkMessage state="paid" />;
  }

  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(payload.accountOwnerUserId, payload.invoiceId, supabase);
  if (paymentSummary.balanceDueCents <= 0) return <PaymentLinkMessage state="paid" />;
  if (paymentSummary.balanceDueCents !== payload.balanceDueCents) return <PaymentLinkMessage state="changed" />;

  const business = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: payload.accountOwnerUserId,
    supabase,
  });
  const invoiceNumber = String(invoice.invoice_display_number ?? invoice.invoice_number ?? "").trim();
  const billingName = String(invoice.billing_name ?? "").trim() || "Billing recipient";
  const checkoutUnavailable = String(Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout ?? "") === "unavailable";

  return (
    <PublicShell>
      <header className="border-b border-slate-200 pb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Secure invoice payment</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{business.display_name}</h1>
        <p className="mt-2 text-sm text-slate-600">Review the invoice balance before continuing to secure card checkout.</p>
      </header>

      {checkoutUnavailable ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online checkout is temporarily unavailable. No payment was submitted. Please try again or contact {business.display_name}.
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid gap-4 bg-slate-50 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice</div>
            <div className="mt-1 font-semibold text-slate-950">#{invoiceNumber}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</div>
            <div className="mt-1 font-semibold text-slate-950">{billingName}</div>
          </div>
        </div>
        <dl className="divide-y divide-slate-200 px-4 sm:px-5">
          <div className="flex items-center justify-between gap-4 py-4 text-sm"><dt className="text-slate-600">Invoice total</dt><dd className="font-medium text-slate-950">{money(paymentSummary.invoiceTotalCents)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-4 text-sm"><dt className="text-slate-600">Payments received</dt><dd className="font-medium text-slate-950">{money(paymentSummary.amountPaidCents)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-4"><dt className="font-semibold text-slate-950">Balance due</dt><dd className="text-xl font-semibold text-slate-950">{money(paymentSummary.balanceDueCents)}</dd></div>
        </dl>
      </section>

      <form action={beginPublicInvoiceCheckout} className="mt-6">
        <input type="hidden" name="payment_token" value={token} />
        <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
          Pay {money(paymentSummary.balanceDueCents)} securely
        </button>
      </form>
      <p className="mt-3 text-center text-xs leading-5 text-slate-500">Card details are entered securely with Stripe. Opening this page does not submit a payment.</p>
      {business.support_email || business.support_phone ? (
        <p className="mt-5 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Questions? Contact {business.support_email ?? business.support_phone}.
        </p>
      ) : null}
    </PublicShell>
  );
}
