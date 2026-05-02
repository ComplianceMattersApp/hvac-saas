"use server";

// lib/estimates/estimate-communication.ts
// Compliance Matters: Estimate V1H — communication send-attempt truth.
// Internal-only. Account-owner scoped.
//
// Non-goals: customer approval flow, public token, PDF generation, delivery
//            tracking, customer read access, contractor write access.
//
// attempt_status meanings:
//   blocked   = ENABLE_ESTIMATE_EMAIL_SEND is off; no provider call was made
//   attempted = provider call was made (intermediate; resolves to accepted/failed)
//   accepted  = provider accepted the message (NOT delivered or read)
//   failed    = provider returned an error

import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { isEstimatesEnabled, isEstimateEmailSendEnabled } from "@/lib/estimates/estimate-exposure";
import { sendEmail } from "@/lib/email/sendEmail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EstimateCommunicationAttemptStatus =
  | "blocked"
  | "attempted"
  | "accepted"
  | "failed";

export type EstimateCommunicationRow = {
  id: string;
  estimate_id: string;
  account_owner_user_id: string;
  initiated_by_user_id: string;
  recipient_email_snapshot: string;
  subject_snapshot: string;
  body_template_key: string;
  provider_name: string | null;
  provider_message_id: string | null;
  attempt_status: EstimateCommunicationAttemptStatus;
  attempt_error: string | null;
  attempted_at: string;
  created_at: string;
};

export type SendEstimateCommunicationParams = {
  estimateId: string;
  recipientEmail: string;
};

export type SendEstimateCommunicationResult =
  | {
      success: true;
      communicationId: string;
      attemptStatus: EstimateCommunicationAttemptStatus;
    }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Send estimate communication
// ---------------------------------------------------------------------------

export async function sendEstimateCommunication(
  params: SendEstimateCommunicationParams
): Promise<SendEstimateCommunicationResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return { success: false, error: "estimate_id is required." };

  const recipientEmail = String(params.recipientEmail ?? "").trim().toLowerCase();
  if (!recipientEmail) return { success: false, error: "recipient_email is required." };

  // Basic email format validation (boundary check only)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { success: false, error: "recipient_email is not a valid email address." };
  }

  // Load and scope-check the estimate
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, title, estimate_number, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  // V1H: only draft or sent estimates support a send attempt
  if (estimate.status !== "draft" && estimate.status !== "sent") {
    return {
      success: false,
      error: "Send attempt is only available for draft or sent estimates.",
    };
  }

  const subjectSnapshot = `Estimate ${estimate.estimate_number}: ${estimate.title}`;
  const bodyTemplateKey = "estimate_send_v1h";
  const featureEnabled = isEstimateEmailSendEnabled();

  let attemptStatus: EstimateCommunicationAttemptStatus = "blocked";
  let attemptError: string | null = null;
  let providerName: string | null = null;
  let providerMessageId: string | null = null;

  if (featureEnabled) {
    providerName = "resend";
    try {
      const htmlBody = buildEstimateEmailHtml({
        estimateNumber: estimate.estimate_number,
        title: estimate.title,
      });
      const result = await sendEmail({
        to: recipientEmail,
        subject: subjectSnapshot,
        html: htmlBody,
      });
      providerMessageId =
        (result.data as { id?: string } | null | undefined)?.id ?? null;
      attemptStatus = "accepted";
    } catch (err) {
      attemptStatus = "failed";
      attemptError = err instanceof Error ? err.message : String(err);
    }
  }

  // Always write the communication record regardless of send outcome
  const { data: commRow, error: insertErr } = await supabase
    .from("estimate_communications")
    .insert({
      estimate_id: estimateId,
      account_owner_user_id: accountOwnerUserId,
      initiated_by_user_id: userId,
      recipient_email_snapshot: recipientEmail,
      subject_snapshot: subjectSnapshot,
      body_template_key: bodyTemplateKey,
      provider_name: providerName,
      provider_message_id: providerMessageId,
      attempt_status: attemptStatus,
      attempt_error: attemptError,
    })
    .select("id")
    .single();

  if (insertErr || !commRow?.id) {
    return {
      success: false,
      error: insertErr?.message ?? "Failed to record communication attempt.",
    };
  }

  // Append event record for audit trail
  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_send_attempted",
    meta: {
      attempt_status: attemptStatus,
      recipient_email_snapshot: recipientEmail,
      communication_id: commRow.id,
    },
    user_id: userId,
  });

  return { success: true, communicationId: commRow.id, attemptStatus };
}

// ---------------------------------------------------------------------------
// Email HTML template — minimal, internal-only, V1H
// ---------------------------------------------------------------------------

function buildEstimateEmailHtml(params: {
  estimateNumber: string;
  title: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /></head>
<body style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 13px; color: #64748b; margin: 0 0 12px;">Internal estimate communication — V1H</p>
  <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 6px;">${escapeHtml(params.title)}</h1>
  <p style="font-size: 13px; color: #64748b; margin: 0 0 24px;">Estimate ${escapeHtml(params.estimateNumber)}</p>
  <p style="font-size: 12px; color: #94a3b8; margin: 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
    This is a V1H internal send attempt. No customer approval, PDF, or invoice was created from this action.
    Accepted by provider does not mean delivered or read.
  </p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
