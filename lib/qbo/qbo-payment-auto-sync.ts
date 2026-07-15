import { createAdminClient } from "@/lib/supabase/server";
import { getQboAvailability } from "./qbo-env";
import { syncPaymentToQbo } from "./qbo-payment-sync";

export async function autoSyncRecordedPaymentToQbo(params: {
  accountOwnerUserId: string;
  paymentId: string;
}): Promise<void> {
  try {
    if (!getQboAvailability().available) return;
    await syncPaymentToQbo({
      supabase: createAdminClient(),
      accountOwnerUserId: params.accountOwnerUserId,
      paymentId: params.paymentId,
    });
  } catch {
    // QBO is downstream and must never block recording payment truth.
  }
}
