import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import {
  createTenantInvoiceCheckoutSession,
  resolveJobBlocksOnlineInvoicePayment,
  resolveInvoiceCollectedPaymentSummary,
  verifyTenantInvoicePaymentLinkToken,
} from "@/lib/business/internal-invoice-payments";

type PaymentLinkState = "paid" | "changed" | "inactive";

function PaymentLinkMessage({ state }: { state: PaymentLinkState }) {
  const copy =
    state === "paid"
      ? {
          heading: "Invoice already paid",
          body: "No payment is needed for this invoice.",
        }
      : state === "changed"
        ? {
            heading: "Invoice balance changed",
            body: "Please request an updated payment link.",
          }
        : {
            heading: "This payment link is no longer active.",
            body: "Please contact the company if you believe a balance is still due.",
          };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Invoice payment
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{copy.heading}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>
      </div>
    </div>
  );
}

export default async function TenantInvoicePaymentLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyTenantInvoicePaymentLinkToken(token);

  if (!payload) {
    return <PaymentLinkMessage state="inactive" />;
  }

  const supabase = createAdminClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("internal_invoices")
    .select("id, account_owner_user_id, job_id, status, total_cents")
    .eq("id", payload.invoiceId)
    .eq("account_owner_user_id", payload.accountOwnerUserId)
    .eq("job_id", payload.jobId)
    .maybeSingle();

  if (invoiceError || !invoice?.id || String(invoice.status ?? "").trim().toLowerCase() !== "issued") {
    return <PaymentLinkMessage state="inactive" />;
  }

  const jobBlocksOnlinePayment = await resolveJobBlocksOnlineInvoicePayment({
    accountOwnerUserId: payload.accountOwnerUserId,
    jobId: payload.jobId,
    supabase,
  });

  if (jobBlocksOnlinePayment) {
    return <PaymentLinkMessage state="paid" />;
  }

  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    payload.accountOwnerUserId,
    payload.invoiceId,
    supabase,
  );

  if (paymentSummary.balanceDueCents <= 0) {
    return <PaymentLinkMessage state="paid" />;
  }

  if (paymentSummary.balanceDueCents !== payload.balanceDueCents) {
    return <PaymentLinkMessage state="changed" />;
  }

  let checkoutSessionUrl: string | null = null;
  try {
    const checkoutSession = await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: payload.accountOwnerUserId,
      jobId: payload.jobId,
      invoiceId: payload.invoiceId,
      supabase,
    });
    checkoutSessionUrl = checkoutSession.checkoutSessionUrl;
  } catch {
    return <PaymentLinkMessage state="inactive" />;
  }

  if (!checkoutSessionUrl) {
    return <PaymentLinkMessage state="inactive" />;
  }

  redirect(checkoutSessionUrl);
}
