/* eslint-disable @typescript-eslint/no-explicit-any */
import type Stripe from "stripe";
import { autoSyncRecordedPaymentToQbo } from "@/lib/qbo/qbo-payment-auto-sync";
import { deliverInternalPaymentReceivedEmail } from "@/lib/payments/payment-received-email";
import { reconcileStripeSuccessfulPayment } from "@/lib/business/stripe-successful-payment-reconciliation";

export async function repairVerifiedStripePendingPayment(params: {
  admin: any;
  accountOwnerUserId: string;
  paymentId: string;
  stripe?: Stripe;
  syncQbo?: typeof autoSyncRecordedPaymentToQbo;
  sendReceipt?: typeof deliverInternalPaymentReceivedEmail;
}) {
  const result = await reconcileStripeSuccessfulPayment(params);
  const repaired = ["exact_paid_match_reconciled", "already_reconciled", "allocation_repaired"].includes(result.outcome);
  return {
    repaired,
    reason: result.outcome,
    paymentId: result.paymentId,
    qboSynced: result.qboStatus === "synced",
    receiptSent: repaired,
  } as const;
}
