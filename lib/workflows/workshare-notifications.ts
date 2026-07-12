import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";

// New-work-arrival family (see lib/notifications/internal-awareness.ts).
export const WORKSHARE_REQUEST_RECEIVED_NOTIFICATION_TYPE = "workshare_request_received";

// Cross-account in-app awareness: when a contractor (sender) sends an ECC/HERS
// workshare request, notify the RECEIVER (rater) account that a request arrived.
// This is a genuinely cross-account write (actor = sender, recipient = receiver),
// so it uses the admin client and writes directly to the receiver's ledger —
// modeled on lib/estimates/estimate-proposal-approval-notification.ts. The
// request row itself proves the active connection (it passed the sender-scoped
// INSERT RLS), so the relationship is already trusted. Best-effort: callers
// should not fail the send if this throws.
export async function insertWorkshareRequestReceivedNotification(params: {
  admin: SupabaseClient;
  request: AccountWorkshareRequestRow;
}): Promise<void> {
  const { admin, request } = params;

  const recipientAccountOwnerUserId = String(request.receiver_account_id ?? "").trim();
  const senderAccountId = String(request.sender_account_id ?? "").trim();
  const requestId = String(request.id ?? "").trim();
  if (!recipientAccountOwnerUserId || !requestId) return;

  // Dedupe: at most one arrival notification per request.
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("account_owner_user_id", recipientAccountOwnerUserId)
    .eq("notification_type", WORKSHARE_REQUEST_RECEIVED_NOTIFICATION_TYPE)
    .eq("channel", "in_app")
    .contains("payload", { request_id: requestId })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const senderIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: senderAccountId,
    supabase: admin,
  });
  const senderName = senderIdentity.display_name || "A connected contractor";

  const customer = String(request.customer_name_snapshot ?? "").trim();
  const body = customer
    ? `${senderName} sent you an ECC/HERS testing request for ${customer}.`
    : `${senderName} sent you an ECC/HERS testing request.`;

  await admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: recipientAccountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: WORKSHARE_REQUEST_RECEIVED_NOTIFICATION_TYPE,
    subject: "New ECC/HERS request",
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      sender_account_id: senderAccountId,
    },
    status: "queued",
  });
}
