import type { SupabaseClient } from "@supabase/supabase-js";

import { buildContractorPermitRequestStatusEmailHtml } from "@/lib/email/contractor-permit-request-status-email";
import { resolveAppUrl } from "@/lib/email/layout";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  getPermitRequestContractorStatusLabel,
  type PermitPostPermitRoute,
  type PermitRequestStatus,
} from "./permit-request-contracts";
import { buildPermitRequestReferenceCode } from "./permit-request-reference";

export const CONTRACTOR_PERMIT_REQUEST_STATUS_EMAIL_NOTIFICATION_TYPE =
  "contractor_permit_request_status_email";

export const CONTRACTOR_PERMIT_REQUEST_PORTAL_PATH = "/portal/permit-request";

/** Statuses worth telling the contractor about. */
export const CONTRACTOR_NOTIFIABLE_PERMIT_REQUEST_STATUSES = [
  "accepted_in_process",
  "on_hold_additional_info_needed",
  "permit_created",
  "not_needed",
] as const;

export type ContractorNotifiablePermitRequestStatus =
  (typeof CONTRACTOR_NOTIFIABLE_PERMIT_REQUEST_STATUSES)[number];

export function isContractorNotifiablePermitRequestStatus(
  value: unknown,
): value is ContractorNotifiablePermitRequestStatus {
  return CONTRACTOR_NOTIFIABLE_PERMIT_REQUEST_STATUSES.includes(
    String(value ?? "").trim() as ContractorNotifiablePermitRequestStatus,
  );
}

function normalizeText(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function resolvePortalUrl(): string | null {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    resolveAppUrl(),
    String(process.env.SITE_URL ?? "").trim(),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `${raw.replace(/\/$/, "")}${CONTRACTOR_PERMIT_REQUEST_PORTAL_PATH}`;
      }
    } catch {
      // Ignore malformed values and try the next candidate.
    }
  }

  return null;
}

export function buildContractorPermitStatusContent(input: {
  status: ContractorNotifiablePermitRequestStatus;
  referenceCode: string;
  companyDisplayName: string;
  postPermitRoute?: PermitPostPermitRoute | null;
  permitNumber?: string | null;
}) {
  const company = normalizeText(input.companyDisplayName) ?? "Compliance Matters";
  const statusLabel = getPermitRequestContractorStatusLabel({
    status: input.status as PermitRequestStatus,
    postPermitRoute: input.postPermitRoute ?? null,
  });

  if (input.status === "on_hold_additional_info_needed") {
    return {
      subject: `Action needed on permit request ${input.referenceCode}`,
      headline: "More information needed",
      message: `${company} needs additional information before they can continue with this permit request. Please contact them with the missing details.`,
      // Hold reason is an internal enum with no contractor-safe detail, so point
      // them at a person rather than inventing specifics.
      nextStep: `Reach out to ${company} directly so they can resume the permit.`,
      statusLabel,
    };
  }

  if (input.status === "permit_created") {
    const nextStep =
      input.postPermitRoute === "pending_install"
        ? "The permit is on file. Testing will be scheduled after the install is complete."
        : input.postPermitRoute === "ready_for_testing"
          ? "The permit is on file and this work is ready to be scheduled for testing."
          : null;

    return {
      subject: `Permit created for request ${input.referenceCode}`,
      headline: "Your permit has been created",
      message: `${company} completed the permit for this request.`,
      nextStep,
      statusLabel,
    };
  }

  if (input.status === "not_needed") {
    return {
      subject: `Permit request ${input.referenceCode} closed`,
      headline: "Permit request closed",
      message: `${company} reviewed this request and determined a permit is not needed. No further action is required.`,
      nextStep: null,
      statusLabel,
    };
  }

  return {
    subject: `Permit request ${input.referenceCode} is in progress`,
    headline: "Your permit request is in progress",
    message: `${company} accepted this permit request and started the permit process.`,
    nextStep: `${company} will let you know when the permit is created.`,
    statusLabel,
  };
}

/**
 * Email addresses for a contractor's portal users, falling back to the
 * contractor record's own address so a company without a portal login still
 * hears back.
 */
export async function resolveContractorPortalRecipientEmails(params: {
  admin: SupabaseClient;
  contractorId: string;
}): Promise<string[]> {
  const contractorId = normalizeText(params.contractorId);
  if (!contractorId) return [];

  const emails: string[] = [];

  const { data: membershipRows } = await params.admin
    .from("contractor_users")
    .select("user_id")
    .eq("contractor_id", contractorId)
    .limit(50);

  const userIds = Array.from(
    new Set(
      (Array.isArray(membershipRows) ? membershipRows : [])
        .map((row) => normalizeText((row as { user_id?: unknown }).user_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (userIds.length > 0) {
    const { data: profileRows } = await params.admin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    for (const row of Array.isArray(profileRows) ? profileRows : []) {
      const email = normalizeText((row as { email?: unknown }).email)?.toLowerCase();
      if (email && email.includes("@")) emails.push(email);
    }
  }

  const { data: contractorRow } = await params.admin
    .from("contractors")
    .select("email")
    .eq("id", contractorId)
    .maybeSingle();

  const contractorEmail = normalizeText(
    (contractorRow as { email?: unknown } | null)?.email,
  )?.toLowerCase();
  if (contractorEmail && contractorEmail.includes("@")) emails.push(contractorEmail);

  return Array.from(new Set(emails));
}

/**
 * Tell the contractor their permit request moved. Best-effort by contract: the
 * internal transition has already been committed when this runs, so a delivery
 * failure is logged and swallowed rather than rolling back real ops work.
 */
export async function notifyContractorPermitRequestStatusChange(params: {
  admin: SupabaseClient;
  permitRequestId: string;
  accountOwnerUserId: string;
  contractorId: string;
  status: PermitRequestStatus;
  postPermitRoute?: PermitPostPermitRoute | null;
  permitNumber?: string | null;
  requestSummary?: string | null;
}): Promise<void> {
  const permitRequestId = normalizeText(params.permitRequestId);
  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  const contractorId = normalizeText(params.contractorId);

  if (!permitRequestId || !accountOwnerUserId || !contractorId) return;
  if (!isContractorNotifiablePermitRequestStatus(params.status)) return;

  const recipients = await resolveContractorPortalRecipientEmails({
    admin: params.admin,
    contractorId,
  });

  if (recipients.length === 0) {
    console.error("permit_request_contractor_status_email_no_recipients", {
      permitRequestId,
      contractorId,
    });
    return;
  }

  const tenantIdentity = await resolveOperationalTenantIdentity({
    supabase: params.admin,
    accountOwnerUserId,
  });

  const referenceCode = buildPermitRequestReferenceCode(permitRequestId);
  const content = buildContractorPermitStatusContent({
    status: params.status,
    referenceCode,
    companyDisplayName: tenantIdentity.displayName,
    postPermitRoute: params.postPermitRoute ?? null,
    permitNumber: normalizeText(params.permitNumber),
  });

  const html = buildContractorPermitRequestStatusEmailHtml({
    headline: content.headline,
    message: content.message,
    statusLabel: content.statusLabel,
    referenceCode,
    requestSummary: normalizeText(params.requestSummary),
    permitNumber: normalizeText(params.permitNumber),
    nextStep: content.nextStep,
    portalUrl: resolvePortalUrl(),
    companyDisplayName: tenantIdentity.displayName,
    companyLogoUrl: tenantIdentity.logoUrl,
    supportPhone: tenantIdentity.supportPhone,
    supportEmail: tenantIdentity.supportEmail,
  });

  // Ledger row first so a provider failure leaves a trace. recipient_type
  // 'contractor' keeps this out of the internal notification list.
  const { data: queued } = await params.admin
    .from("notifications")
    .insert({
      job_id: null,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: "contractor",
      recipient_ref: contractorId,
      channel: "email",
      notification_type: CONTRACTOR_PERMIT_REQUEST_STATUS_EMAIL_NOTIFICATION_TYPE,
      subject: content.subject,
      body: content.message,
      payload: {
        source: "permit_requests",
        permit_request_id: permitRequestId,
        permit_request_reference: referenceCode,
        contractor_id: contractorId,
        status: params.status,
        recipient_emails: recipients,
      },
      status: "queued",
      sent_at: null,
    })
    .select("id")
    .single();

  const notificationId = normalizeText((queued as { id?: unknown } | null)?.id);

  try {
    await sendEmail({ to: recipients, subject: content.subject, html });

    if (notificationId) {
      await params.admin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", notificationId);
    }
  } catch (error) {
    if (notificationId) {
      await params.admin
        .from("notifications")
        .update({ status: "failed" })
        .eq("id", notificationId);
    }

    console.error("permit_request_contractor_status_email_send_failed", {
      permitRequestId,
      status: params.status,
      error: error instanceof Error ? error.message : "Unknown send error",
    });
  }
}
