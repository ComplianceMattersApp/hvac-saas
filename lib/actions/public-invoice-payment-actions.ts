"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import {
  createTenantInvoiceCheckoutSession,
  resolveInvoiceCollectedPaymentSummary,
  verifyTenantInvoicePaymentLinkToken,
} from "@/lib/business/internal-invoice-payments";

export async function beginPublicInvoiceCheckout(formData: FormData) {
  const token = String(formData.get("payment_token") ?? "").trim();
  const payload = verifyTenantInvoicePaymentLinkToken(token);
  if (!payload) redirect("/payments/checkout-complete?status=invalid");

  const supabase = createAdminClient();
  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    payload.accountOwnerUserId,
    payload.invoiceId,
    supabase,
  );

  if (paymentSummary.balanceDueCents <= 0) {
    redirect(`/payments/invoice/${encodeURIComponent(token)}`);
  }
  if (paymentSummary.balanceDueCents !== payload.balanceDueCents) {
    redirect(`/payments/invoice/${encodeURIComponent(token)}`);
  }

  let checkoutUrl: string;
  try {
    const checkout = await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: payload.accountOwnerUserId,
      jobId: payload.jobId,
      invoiceId: payload.invoiceId,
      paymentLinkToken: token,
      supabase,
    });
    checkoutUrl = checkout.checkoutSessionUrl;
  } catch {
    redirect(`/payments/invoice/${encodeURIComponent(token)}?checkout=unavailable`);
  }

  redirect(checkoutUrl);
}
