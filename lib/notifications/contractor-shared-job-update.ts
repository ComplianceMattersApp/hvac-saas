import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml, renderOperationalEmailLayout, resolveAppUrl } from "@/lib/email/layout";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { sendEmail } from "@/lib/email/sendEmail";
import { resolveContractorPortalRecipientEmails } from "@/lib/permits/permit-request-contractor-notifications";

export const CONTRACTOR_SHARED_JOB_UPDATE_EMAIL_TYPE = "contractor_shared_job_update_email";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function portalJobUrl(jobId: string) {
  const appUrl = clean(process.env.APP_URL) || clean(resolveAppUrl()) || clean(process.env.SITE_URL);
  if (!appUrl) return null;
  try {
    const parsed = new URL(appUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return `${appUrl.replace(/\/$/, "")}/portal/jobs/${jobId}`;
  } catch {
    return null;
  }
}

export async function notifyContractorOfSharedJobUpdate(params: {
  admin: SupabaseClient;
  accountOwnerUserId: string;
  jobId: string;
  eventId: string;
  note?: string | null;
  fileNames?: string[];
}): Promise<void> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const jobId = clean(params.jobId);
  const eventId = clean(params.eventId);
  if (!accountOwnerUserId || !jobId || !eventId) return;

  const { data: existing } = await params.admin
    .from("notifications")
    .select("id")
    .eq("notification_type", CONTRACTOR_SHARED_JOB_UPDATE_EMAIL_TYPE)
    .contains("payload", { event_id: eventId })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const { data: job, error: jobError } = await params.admin
    .from("jobs")
    .select("id, title, contractor_id")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jobError) throw jobError;
  const contractorId = clean((job as { contractor_id?: unknown } | null)?.contractor_id);
  if (!contractorId) return;

  const recipients = await resolveContractorPortalRecipientEmails({ admin: params.admin, contractorId });
  if (!recipients.length) return;

  const identity = await resolveOperationalTenantIdentity({
    supabase: params.admin,
    accountOwnerUserId,
  });
  const jobTitle = clean((job as { title?: unknown } | null)?.title) || "your job";
  const note = clean(params.note);
  const fileNames = (params.fileNames ?? []).map(clean).filter(Boolean);
  const subject = `${identity.displayName} shared an update for ${jobTitle}`;
  const portalUrl = portalJobUrl(jobId);
  const noteBlock = note
    ? `<div style="margin: 12px 0; border-left: 4px solid #2563eb; background: #f8fafc; padding: 12px 14px; color: #0f172a;">${escapeHtml(note)}</div>`
    : "";
  const filesBlock = fileNames.length
    ? `<div style="margin: 12px 0;"><div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569;">Shared attachments</div><ul style="margin: 6px 0 0; padding-left: 20px; color: #334155;">${fileNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul></div>`
    : "";
  const cta = portalUrl
    ? `<p style="margin: 16px 0 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:10px 14px;">View job update</a></p>`
    : "";
  const body = note || fileNames.length
    ? `${identity.displayName} shared new information with you.`
    : `${identity.displayName} shared an update with you.`;
  const html = renderOperationalEmailLayout({
    title: "A job update was shared with you",
    companyDisplayName: identity.displayName,
    companyLogoUrl: identity.logoUrl,
    supportEmail: identity.supportEmail,
    supportPhone: identity.supportPhone,
    bodyHtml: `<p style="color:#334155;">${escapeHtml(body)}</p><p style="font-weight:700;color:#0f172a;">${escapeHtml(jobTitle)}</p>${noteBlock}${filesBlock}${cta}`,
  });

  const { data: queued, error: queueError } = await params.admin
    .from("notifications")
    .insert({
      job_id: jobId,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: "contractor",
      recipient_ref: contractorId,
      channel: "email",
      notification_type: CONTRACTOR_SHARED_JOB_UPDATE_EMAIL_TYPE,
      subject,
      body,
      payload: { source: "job_events", event_id: eventId, contractor_id: contractorId, recipient_emails: recipients },
      status: "queued",
      sent_at: null,
    })
    .select("id")
    .single();
  if (queueError) throw queueError;

  const notificationId = clean((queued as { id?: unknown } | null)?.id);
  try {
    await sendEmail({ to: recipients, subject, html });
    if (notificationId) {
      await params.admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notificationId);
    }
  } catch (error) {
    if (notificationId) await params.admin.from("notifications").update({ status: "failed" }).eq("id", notificationId);
    console.error("contractor_shared_job_update_email_failed", {
      jobId,
      eventId,
      error: error instanceof Error ? error.message : "Unknown send error",
    });
  }
}
