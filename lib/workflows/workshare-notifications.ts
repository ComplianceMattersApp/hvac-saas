import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveInternalOpsRecipientEmails } from "@/lib/notifications/internal-email-recipients";
import { sendEmail } from "@/lib/email/sendEmail";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";

// New-work-arrival family (see lib/notifications/internal-awareness.ts).
export const WORKSHARE_REQUEST_RECEIVED_NOTIFICATION_TYPE = "workshare_request_received";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Best-effort email echo of a workshare in-app signal to the account's admin/office
// recipients. §11.7: workshare arrivals/outcomes are inbound external awareness,
// so an email alert is appropriate. Isolated so an email failure never affects the
// in-app notification that already succeeded.
async function sendWorkshareEmail(params: {
  admin: SupabaseClient;
  accountOwnerUserId: string;
  subject: string;
  body: string;
}): Promise<void> {
  try {
    const recipients = await resolveInternalOpsRecipientEmails({
      admin: params.admin,
      accountOwnerUserId: params.accountOwnerUserId,
    });
    if (recipients.length === 0) return;
    await sendEmail({
      to: recipients,
      subject: params.subject,
      html: `<p>${escapeHtml(params.body)}</p>`,
      text: params.body,
    });
  } catch {
    // best-effort — the in-app notification is the source of truth.
  }
}

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
  const subject = "New ECC/HERS request";
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
    subject,
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      sender_account_id: senderAccountId,
    },
    status: "queued",
  });

  await sendWorkshareEmail({ admin, accountOwnerUserId: recipientAccountOwnerUserId, subject, body });
}

export const WORKSHARE_REQUEST_ACCEPTED_NOTIFICATION_TYPE = "workshare_request_accepted";
export const WORKSHARE_REQUEST_DECLINED_NOTIFICATION_TYPE = "workshare_request_declined";

// D2b: cross-account outcome signal in the other direction. When the receiver
// (rater) accepts or declines, notify the SENDER (contractor) account that their
// outbound request was decided. Reuses the same admin-client cross-account write
// as the arrival notification (actor = receiver, recipient = sender). Deduped by
// request_id + decision; best-effort — callers must not fail the decision if
// this throws.
export async function insertWorkshareRequestDecisionNotification(params: {
  admin: SupabaseClient;
  request: AccountWorkshareRequestRow;
  decision: "accepted" | "declined";
}): Promise<void> {
  const { admin, request, decision } = params;

  const recipientAccountOwnerUserId = String(request.sender_account_id ?? "").trim();
  const receiverAccountId = String(request.receiver_account_id ?? "").trim();
  const requestId = String(request.id ?? "").trim();
  const sourceJobId = String(request.source_job_id ?? "").trim();
  if (!recipientAccountOwnerUserId || !requestId) return;

  const notificationType =
    decision === "accepted"
      ? WORKSHARE_REQUEST_ACCEPTED_NOTIFICATION_TYPE
      : WORKSHARE_REQUEST_DECLINED_NOTIFICATION_TYPE;

  // Dedupe: one outcome notification per (request, decision).
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("account_owner_user_id", recipientAccountOwnerUserId)
    .eq("notification_type", notificationType)
    .eq("channel", "in_app")
    .contains("payload", { request_id: requestId })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const raterIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: receiverAccountId,
    supabase: admin,
  });
  const raterName = raterIdentity.display_name || "The rater";

  const customer = String(request.customer_name_snapshot ?? "").trim();
  const forCustomer = customer ? ` for ${customer}` : "";
  const reason = String(request.decline_reason ?? "").trim();

  const subject =
    decision === "accepted" ? "ECC/HERS request accepted" : "ECC/HERS request declined";
  const body =
    decision === "accepted"
      ? `${raterName} accepted your ECC/HERS request${forCustomer}.`
      : `${raterName} declined your ECC/HERS request${forCustomer}.${reason ? ` Reason: ${reason}` : ""}`;

  await admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: recipientAccountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: notificationType,
    subject,
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      receiver_account_id: receiverAccountId,
      source_job_id: sourceJobId,
      decision,
    },
    status: "queued",
  });

  await sendWorkshareEmail({ admin, accountOwnerUserId: recipientAccountOwnerUserId, subject, body });
}

export const WORKSHARE_REQUEST_PASSED_NOTIFICATION_TYPE = "workshare_request_passed";
export const WORKSHARE_REQUEST_FAILED_NOTIFICATION_TYPE = "workshare_request_failed";

// P1-F.1: cross-account outcome return. When the rater's receiving job finishes
// ECC testing (pass/fail), notify the SENDER (contractor) so they can proceed to
// final inspection (pass) or corrections (fail). Same admin-client cross-account
// pattern; deduped by request_id + outcome; best-effort.
export async function insertWorkshareRequestOutcomeNotification(params: {
  admin: SupabaseClient;
  request: AccountWorkshareRequestRow;
  outcome: "passed" | "failed";
}): Promise<void> {
  const { admin, request, outcome } = params;

  const recipientAccountOwnerUserId = String(request.sender_account_id ?? "").trim();
  const receiverAccountId = String(request.receiver_account_id ?? "").trim();
  const requestId = String(request.id ?? "").trim();
  const sourceJobId = String(request.source_job_id ?? "").trim();
  if (!recipientAccountOwnerUserId || !requestId) return;

  const notificationType =
    outcome === "passed"
      ? WORKSHARE_REQUEST_PASSED_NOTIFICATION_TYPE
      : WORKSHARE_REQUEST_FAILED_NOTIFICATION_TYPE;

  // Dedupe: one outcome notification per (request, outcome).
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("account_owner_user_id", recipientAccountOwnerUserId)
    .eq("notification_type", notificationType)
    .eq("channel", "in_app")
    .contains("payload", { request_id: requestId })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const raterIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: receiverAccountId,
    supabase: admin,
  });
  const raterName = raterIdentity.display_name || "The rater";

  const customer = String(request.customer_name_snapshot ?? "").trim();
  const forCustomer = customer ? ` for ${customer}` : "";

  const subject =
    outcome === "passed" ? "ECC/HERS test passed" : "ECC/HERS test failed";
  const body =
    outcome === "passed"
      ? `${raterName} completed ECC/HERS testing${forCustomer}: PASSED. You can proceed to the final inspection.`
      : `${raterName} completed ECC/HERS testing${forCustomer}: FAILED. Corrections are needed before a retest.`;

  await admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: recipientAccountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: notificationType,
    subject,
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      receiver_account_id: receiverAccountId,
      source_job_id: sourceJobId,
      outcome,
    },
    status: "queued",
  });

  await sendWorkshareEmail({ admin, accountOwnerUserId: recipientAccountOwnerUserId, subject, body });
}

export const WORKSHARE_RETEST_REQUESTED_NOTIFICATION_TYPE = "workshare_retest_requested";
export const WORKSHARE_REQUEST_NOTE_NOTIFICATION_TYPE = "workshare_request_note";

// P1-F.3: the contractor (sender) asks the rater (receiver) for a retest after a
// fail. Notifies the RECEIVER, carrying the corrections note so the rater knows
// what changed (no assumptions). Links to the rater's receiving job.
export async function insertWorkshareRetestRequestedNotification(params: {
  admin: SupabaseClient;
  request: AccountWorkshareRequestRow;
}): Promise<void> {
  const { admin, request } = params;

  const recipientAccountOwnerUserId = String(request.receiver_account_id ?? "").trim();
  const senderAccountId = String(request.sender_account_id ?? "").trim();
  const requestId = String(request.id ?? "").trim();
  const receivingJobId = String(request.receiving_job_id ?? "").trim();
  if (!recipientAccountOwnerUserId || !requestId) return;

  const senderIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: senderAccountId,
    supabase: admin,
  });
  const senderName = senderIdentity.display_name || "A connected contractor";

  const customer = String(request.customer_name_snapshot ?? "").trim();
  const forCustomer = customer ? ` for ${customer}` : "";
  const note = String(request.retest_note ?? "").trim();

  const subject = "ECC/HERS retest requested";
  const body = `${senderName} requested a retest${forCustomer}.${note ? ` What was corrected: ${note}` : ""}`;

  await admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: recipientAccountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: WORKSHARE_RETEST_REQUESTED_NOTIFICATION_TYPE,
    subject,
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      sender_account_id: senderAccountId,
      receiving_job_id: receivingJobId,
    },
    status: "queued",
  });

  await sendWorkshareEmail({ admin, accountOwnerUserId: recipientAccountOwnerUserId, subject, body });
}

// P1-F.3: the rater (receiver) sends a free-text note to the contractor alongside
// the outcome (e.g. "passed after the duct fix"). Notifies the SENDER; links to
// their source job.
export async function insertWorkshareOutcomeNoteNotification(params: {
  admin: SupabaseClient;
  request: AccountWorkshareRequestRow;
}): Promise<void> {
  const { admin, request } = params;

  const recipientAccountOwnerUserId = String(request.sender_account_id ?? "").trim();
  const receiverAccountId = String(request.receiver_account_id ?? "").trim();
  const requestId = String(request.id ?? "").trim();
  const sourceJobId = String(request.source_job_id ?? "").trim();
  const note = String(request.outcome_note ?? "").trim();
  if (!recipientAccountOwnerUserId || !requestId || !note) return;

  const raterIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    accountOwnerUserId: receiverAccountId,
    supabase: admin,
  });
  const raterName = raterIdentity.display_name || "The rater";

  const subject = "Note from your ECC/HERS rater";
  const body = `${raterName}: ${note}`;

  await admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: recipientAccountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: WORKSHARE_REQUEST_NOTE_NOTIFICATION_TYPE,
    subject,
    body,
    payload: {
      source: "account_workshare",
      request_id: requestId,
      receiver_account_id: receiverAccountId,
      source_job_id: sourceJobId,
    },
    status: "queued",
  });

  await sendWorkshareEmail({ admin, accountOwnerUserId: recipientAccountOwnerUserId, subject, body });
}
