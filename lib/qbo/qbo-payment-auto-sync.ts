import { createAdminClient } from "@/lib/supabase/server";
import { getQboAvailability } from "./qbo-env";
import { syncPaymentToQbo } from "./qbo-payment-sync";

export async function autoSyncRecordedPaymentToQbo(params: {
  accountOwnerUserId?: string | null;
  paymentId: string;
}) {
  try {
    if (!getQboAvailability().available) return null;
    const admin = createAdminClient();
    let accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
    if (!accountOwnerUserId) {
      const { data: payment, error } = await admin
        .from("internal_invoice_payments")
        .select("account_owner_user_id")
        .eq("id", params.paymentId)
        .maybeSingle();
      if (error || !payment?.account_owner_user_id) return null;
      accountOwnerUserId = String(payment.account_owner_user_id).trim();
    }
    if (!accountOwnerUserId) return null;
    return await syncPaymentToQbo({
      supabase: admin,
      accountOwnerUserId,
      paymentId: params.paymentId,
    });
  } catch {
    // QBO is downstream and must never block recording payment truth.
    return null;
  }
}
