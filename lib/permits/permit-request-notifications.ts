import type { SupabaseClient } from "@supabase/supabase-js";

import { buildInternalPermitRequestAlertEmailHtml } from "@/lib/email/operational-permit-request-alert-email";
import { resolveAppUrl } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";
import { resolveInternalOpsRecipientEmails } from "@/lib/notifications/internal-email-recipients";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import {
  buildPermitRequestReferenceCode,
  PERMIT_REQUEST_QUEUE_PATH,
} from "./permit-request-reference";

// New-work-arrival family (see lib/notifications/internal-awareness.ts).
export const PERMIT_REQUEST_RECEIVED_NOTIFICATION_TYPE = "permit_request_received";

// Email delivery ledger row. Hidden from the notification list so the in-app
// signal above is the single visible card per request.
export const PERMIT_REQUEST_RECEIVED_EMAIL_NOTIFICATION_TYPE = "internal_permit_request_email";

export { PERMIT_REQUEST_QUEUE_PATH };

const NOTE_PREVIEW_MAX_LENGTH = 160;

function normalizeText(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildNotePreview(note: string | null) {
  if (!note) return null;
  const collapsed = note.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > NOTE_PREVIEW_MAX_LENGTH
    ? `${collapsed.slice(0, NOTE_PREVIEW_MAX_LENGTH)}…`
    : collapsed;
}

function resolvePermitAlertAppUrl(): string | null {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    resolveAppUrl(),
    String(process.env.SITE_URL ?? "").trim(),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return raw.replace(/\/$/, "");
      }
    } catch {
      // Ignore malformed values and try the next candidate.
    }
  }

  return null;
}

export function buildPermitRequestAlertContent(input: {
  contractorName: string | null;
  referenceCode: string;
  attachmentCount: number;
  note: string | null;
}) {
  const contractorName = normalizeText(input.contractorName) ?? "A contractor";
  const fileLabel = `${input.attachmentCount} ${input.attachmentCount === 1 ? "file" : "files"}`;
  const notePreview = buildNotePreview(normalizeText(input.note));

  const subject = `New permit request from ${contractorName}`;
  const body = [
    `${contractorName} sent a permit request (${input.referenceCode}) with ${fileLabel}.`,
    notePreview,
  ]
    .filter(Boolean)
    .join(" ");

  return { subject, body, contractorName, notePreview };
}

async function resolveContractorName(params: {
  admin: SupabaseClient;
  contractorId: string;
}): Promise<string | null> {
  const { data, error } = await params.admin
    .from("contractors")
    .select("name")
    .eq("id", params.contractorId)
    .maybeSingle();

  if (error) return null;
  return normalizeText((data as { name?: unknown } | null)?.name);
}

async function sendInternalPermitRequestAlertEmail(params: {
  admin: SupabaseClient;
  permitRequestId: string;
  accountOwnerUserId: string;
  referenceCode: string;
  contractorName: string;
  attachmentCount: number;
  note: string | null;
  subject: string;
}): Promise<void> {
  const dedupeKey = `${PERMIT_REQUEST_RECEIVED_EMAIL_NOTIFICATION_TYPE}:${params.permitRequestId}:initial_submission`;

  const { data: existing } = await params.admin
    .from("notifications")
    .select("id")
    .eq("channel", "email")
    .eq("notification_type", PERMIT_REQUEST_RECEIVED_EMAIL_NOTIFICATION_TYPE)
    .contains("payload", { dedupe_key: dedupeKey })
    .in("status", ["queued", "sent"])
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const recipientEmails = await resolveInternalOpsRecipientEmails({
    admin: params.admin,
    accountOwnerUserId: params.accountOwnerUserId,
  });

  if (recipientEmails.length === 0) {
    console.error("permit_request_alert_email_no_recipients", {
      permitRequestId: params.permitRequestId,
      accountOwnerUserId: params.accountOwnerUserId,
    });
    return;
  }

  const appUrl = resolvePermitAlertAppUrl();
  const permitQueueUrl = appUrl ? `${appUrl}${PERMIT_REQUEST_QUEUE_PATH}` : null;
  const tenantIdentity = await resolveOperationalTenantIdentity({
    supabase: params.admin,
    accountOwnerUserId: params.accountOwnerUserId,
  });

  const submittedAtText = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const html = buildInternalPermitRequestAlertEmailHtml({
    contractorName: params.contractorName,
    referenceCode: params.referenceCode,
    attachmentCount: params.attachmentCount,
    submittedAtText,
    contractorNote: params.note,
    permitQueueUrl,
    companyDisplayName: tenantIdentity.displayName,
    companyLogoUrl: tenantIdentity.logoUrl,
    supportPhone: tenantIdentity.supportPhone,
    supportEmail: tenantIdentity.supportEmail,
  });

  // Queue the ledger row before sending so a provider failure is recorded
  // rather than lost.
  const { data: queued, error: queueErr } = await params.admin
    .from("notifications")
    .insert({
      job_id: null,
      account_owner_user_id: params.accountOwnerUserId,
      recipient_type: "internal",
      recipient_ref: null,
      channel: "email",
      notification_type: PERMIT_REQUEST_RECEIVED_EMAIL_NOTIFICATION_TYPE,
      subject: params.subject,
      body: "Internal ops/admin alert for a contractor-submitted permit request.",
      payload: {
        source: "permit_requests",
        dedupe_key: dedupeKey,
        permit_request_id: params.permitRequestId,
        permit_request_reference: params.referenceCode,
        contractor_name: params.contractorName,
        attachment_count: params.attachmentCount,
      },
      status: "queued",
      sent_at: null,
    })
    .select("id")
    .single();

  if (queueErr) throw queueErr;

  const notificationId = String((queued as { id?: unknown } | null)?.id ?? "").trim();

  try {
    await sendEmail({ to: recipientEmails, subject: params.subject, html });

    if (notificationId) {
      await params.admin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", notificationId);
    }
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : "Unknown send error";

    if (notificationId) {
      await params.admin
        .from("notifications")
        .update({ status: "failed" })
        .eq("id", notificationId);
    }

    console.error("permit_request_alert_email_send_failed", {
      permitRequestId: params.permitRequestId,
      errorDetail,
    });

    throw error;
  }
}

/**
 * Alert the internal ops/admin team that a contractor submitted a permit
 * request: one in-app notification plus one email.
 *
 * The contractor's submission already succeeded by the time this runs, so
 * every failure here is logged and swallowed — an alert problem must never
 * cost the request. Deduped per permit request so a retry cannot double-alert.
 */
export async function notifyInternalPermitRequestReceived(params: {
  admin: SupabaseClient;
  permitRequestId: string;
  accountOwnerUserId: string;
  contractorId: string;
  submittedByUserId: string;
  attachmentCount: number;
  note?: string | null;
}): Promise<void> {
  const permitRequestId = String(params.permitRequestId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!permitRequestId || !accountOwnerUserId) return;

  const note = normalizeText(params.note);
  const referenceCode = buildPermitRequestReferenceCode(permitRequestId);

  const { data: existing } = await params.admin
    .from("notifications")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("notification_type", PERMIT_REQUEST_RECEIVED_NOTIFICATION_TYPE)
    .eq("channel", "in_app")
    .contains("payload", { permit_request_id: permitRequestId })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const contractorName = await resolveContractorName({
    admin: params.admin,
    contractorId: String(params.contractorId ?? "").trim(),
  });

  const content = buildPermitRequestAlertContent({
    contractorName,
    referenceCode,
    attachmentCount: params.attachmentCount,
    note,
  });

  const { error: insertErr } = await params.admin.from("notifications").insert({
    job_id: null,
    account_owner_user_id: accountOwnerUserId,
    recipient_type: "internal",
    recipient_ref: null,
    channel: "in_app",
    notification_type: PERMIT_REQUEST_RECEIVED_NOTIFICATION_TYPE,
    subject: content.subject,
    body: content.body,
    payload: {
      source: "permit_requests",
      permit_request_id: permitRequestId,
      permit_request_reference: referenceCode,
      contractor_id: String(params.contractorId ?? "").trim() || null,
      submitted_by_user_id: String(params.submittedByUserId ?? "").trim() || null,
      account_owner_user_id: accountOwnerUserId,
      attachment_count: params.attachmentCount,
      contractor_name: content.contractorName,
      note_preview: content.notePreview,
    },
    status: "queued",
  });

  if (insertErr) {
    console.error("permit_request_alert_in_app_insert_failed", {
      permitRequestId,
      error: insertErr instanceof Error ? insertErr.message : String(insertErr),
    });
  }

  // Email is a separate best-effort channel: a Resend outage must not discard
  // the in-app signal that already landed.
  try {
    await sendInternalPermitRequestAlertEmail({
      admin: params.admin,
      permitRequestId,
      accountOwnerUserId,
      referenceCode,
      contractorName: content.contractorName,
      attachmentCount: params.attachmentCount,
      note,
      subject: content.subject,
    });
  } catch {
    // Already logged with detail inside the sender.
  }
}
