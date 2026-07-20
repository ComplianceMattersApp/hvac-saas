import type Stripe from "stripe";
import { syncStripePaymentSettlementForPayment } from "@/lib/business/stripe-payment-settlements";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { createAdminClient } from "@/lib/supabase/server";

export type AutoSyncRecordedPaymentSettlementResult = {
  status: "synced" | "skipped" | "unmatched" | "failed";
  code: string;
  reason: string;
  settlementId: string | null;
};

/**
 * Best-effort webhook follow-up. Payment truth must already exist before this
 * runs; this function only reads that payment and writes settlement truth.
 */
export async function autoSyncRecordedPaymentSettlement(params: {
  paymentId: string;
  admin?: any;
  stripe?: Pick<Stripe, "charges" | "balanceTransactions" | "payouts">;
}): Promise<AutoSyncRecordedPaymentSettlementResult> {
  const paymentId = String(params.paymentId ?? "").trim();
  if (!paymentId) {
    return {
      status: "skipped",
      code: "missing_payment_id",
      reason: "A recorded payment id is required for automatic settlement sync.",
      settlementId: null,
    };
  }

  const admin = params.admin ?? createAdminClient();
  const { data: payment, error } = await admin
    .from("internal_invoice_payments")
    .select("id, account_owner_user_id, payment_status")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "Failed to load the recorded payment for settlement sync.");
  if (!payment?.id || payment.payment_status !== "recorded") {
    return {
      status: "skipped",
      code: "payment_not_recorded",
      reason: "Automatic settlement sync only runs after recorded payment truth exists.",
      settlementId: null,
    };
  }

  const accountOwnerUserId = String(payment.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) {
    return {
      status: "skipped",
      code: "missing_account_owner",
      reason: "The recorded payment is missing account scope.",
      settlementId: null,
    };
  }

  return syncStripePaymentSettlementForPayment({
    supabase: admin,
    stripe: params.stripe ?? getStripeServerClient(),
    accountOwnerUserId,
    internalInvoicePaymentId: paymentId,
  });
}
