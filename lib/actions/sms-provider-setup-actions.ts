"use server";

import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Admin provider-setup actions for SMS (account-scoped, tenant-generic).
 *
 * These manage the rows the sandbox send path gates on:
 * - sms_provider_configurations (twilio/sandbox row + sandbox send gate)
 * - sms_sender_identities
 * - sms_sandbox_test_recipients
 *
 * Writes go through the admin client because these tables are SELECT-only
 * under RLS; every write is scoped to the acting admin's account. Nothing here
 * enables live SMS — live activation remains a separate, later gate.
 */

const COMMUNICATIONS_PATH = "/ops/admin/communications";

function withNotice(notice: string): string {
  return `${COMMUNICATIONS_PATH}?notice=${encodeURIComponent(notice)}`;
}

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function normalizePhoneE164(value: unknown): string | null {
  const raw = asTrimmed(value);
  if (!raw) return null;

  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");

  if (compact.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

async function requireAdminContext(): Promise<{
  accountOwnerUserId: string;
  actingUserId: string;
}> {
  const supabase = await createClient();
  try {
    const ctx = await requireInternalRole("admin", { supabase });
    return {
      accountOwnerUserId: asTrimmed(ctx.internalUser.account_owner_user_id),
      actingUserId: asTrimmed(ctx.internalUser.user_id),
    };
  } catch {
    redirect(withNotice("admin_required"));
  }
}

async function readSandboxProviderConfigRow(params: {
  admin: any;
  accountOwnerUserId: string;
}): Promise<{ id: string; defaultMessagingServiceRef: string | null } | null> {
  const response = await params.admin
    .from("sms_provider_configurations")
    .select("id, default_messaging_service_ref")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("provider_name", "twilio")
    .eq("provider_environment", "sandbox")
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  const id = asTrimmed(response?.data?.id);
  if (!id) {
    return null;
  }

  return {
    id,
    defaultMessagingServiceRef: asTrimmed(response?.data?.default_messaging_service_ref) || null,
  };
}

export async function saveSmsSandboxProviderConfigFromForm(formData: FormData): Promise<void> {
  const { accountOwnerUserId, actingUserId } = await requireAdminContext();

  const messagingServiceRef = asTrimmed(formData.get("messaging_service_ref"));
  const providerAccountRef = asTrimmed(formData.get("provider_account_ref"));

  // Refs only, never credentials. Reject whitespace-containing values outright.
  if (!messagingServiceRef || /\s/.test(messagingServiceRef) || messagingServiceRef.length > 64) {
    redirect(withNotice("provider_config_invalid"));
  }
  if (providerAccountRef && (/\s/.test(providerAccountRef) || providerAccountRef.length > 64)) {
    redirect(withNotice("provider_config_invalid"));
  }

  const admin = createAdminClient();

  try {
    const existing = await readSandboxProviderConfigRow({ admin, accountOwnerUserId });

    if (existing) {
      const response = await admin
        .from("sms_provider_configurations")
        .update({
          default_messaging_service_ref: messagingServiceRef,
          provider_account_ref: providerAccountRef || null,
          readiness_status: "ready_for_sandbox",
          status_callback_readiness: "ready",
          inbound_webhook_readiness: "ready",
          updated_by_user_id: actingUserId,
        })
        .eq("id", existing.id)
        .eq("account_owner_user_id", accountOwnerUserId);

      if (response?.error) {
        throw response.error;
      }
    } else {
      const response = await admin.from("sms_provider_configurations").insert({
        account_owner_user_id: accountOwnerUserId,
        provider_name: "twilio",
        provider_environment: "sandbox",
        default_messaging_service_ref: messagingServiceRef,
        provider_account_ref: providerAccountRef || null,
        readiness_status: "ready_for_sandbox",
        activation_status: "disabled",
        status_callback_readiness: "ready",
        inbound_webhook_readiness: "ready",
        created_by_user_id: actingUserId,
        updated_by_user_id: actingUserId,
      });

      if (response?.error) {
        throw response.error;
      }
    }
  } catch {
    redirect(withNotice("provider_config_save_failed"));
  }

  redirect(withNotice("provider_config_saved"));
}

export async function setSmsSandboxSendGateFromForm(formData: FormData): Promise<void> {
  const { accountOwnerUserId, actingUserId } = await requireAdminContext();

  const enable = asTrimmed(formData.get("enable")) === "true";

  const admin = createAdminClient();

  try {
    const existing = await readSandboxProviderConfigRow({ admin, accountOwnerUserId });
    if (!existing) {
      redirect(withNotice("provider_config_missing"));
    }

    const now = new Date().toISOString();
    const response = await admin
      .from("sms_provider_configurations")
      .update(
        enable
          ? {
              sandbox_send_enabled: true,
              sandbox_send_enabled_at: now,
              sandbox_send_enabled_by_user_id: actingUserId,
              sandbox_send_disabled_reason: null,
              updated_by_user_id: actingUserId,
            }
          : {
              sandbox_send_enabled: false,
              sandbox_send_disabled_reason: "admin_disabled",
              updated_by_user_id: actingUserId,
            },
      )
      .eq("id", existing.id)
      .eq("account_owner_user_id", accountOwnerUserId);

    if (response?.error) {
      throw response.error;
    }
  } catch (error) {
    // redirect() throws internally; let those bubble.
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    redirect(withNotice("sandbox_gate_update_failed"));
  }

  redirect(withNotice(enable ? "sandbox_gate_enabled" : "sandbox_gate_disabled"));
}

export async function saveSmsSenderIdentityFromForm(formData: FormData): Promise<void> {
  const { accountOwnerUserId, actingUserId } = await requireAdminContext();

  const displayLabel = asTrimmed(formData.get("sender_display_label")).slice(0, 120);
  const phoneE164 = normalizePhoneE164(formData.get("phone"));
  const messagingServiceRef = asTrimmed(formData.get("messaging_service_ref"));
  const providerCampaignRef = asTrimmed(formData.get("provider_campaign_ref"));
  const verifiedWithProvider = asTrimmed(formData.get("verified_with_provider")) === "true";

  if (!displayLabel || !phoneE164) {
    redirect(withNotice("sender_identity_invalid"));
  }
  if (messagingServiceRef && (/\s/.test(messagingServiceRef) || messagingServiceRef.length > 64)) {
    redirect(withNotice("sender_identity_invalid"));
  }
  if (providerCampaignRef && (/\s/.test(providerCampaignRef) || providerCampaignRef.length > 64)) {
    redirect(withNotice("sender_identity_invalid"));
  }

  const admin = createAdminClient();

  try {
    const config = await readSandboxProviderConfigRow({ admin, accountOwnerUserId });
    if (!config) {
      redirect(withNotice("provider_config_missing"));
    }

    const phoneLast4 = phoneE164.replace(/\D/g, "").slice(-4);

    // Sender belongs to the sandbox provider config: inherit its Messaging
    // Service ref when the form doesn't supply one, so the readiness read model
    // (which requires at least one provider ref) counts this sender as
    // configured.
    const values = {
      sender_type: "long_code",
      sender_display_label: displayLabel,
      phone_e164: phoneE164,
      phone_last4: phoneLast4,
      messaging_service_ref: messagingServiceRef || config.defaultMessagingServiceRef,
      registration_type: "a2p_10dlc",
      provider_campaign_ref: providerCampaignRef || null,
      verification_status: verifiedWithProvider ? "verified" : "pending_verification",
      activation_status: verifiedWithProvider ? "active" : "disabled",
      updated_by_user_id: actingUserId,
    };

    const existingResponse = await admin
      .from("sms_sender_identities")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_configuration_id", config.id)
      .limit(1);

    if (existingResponse?.error) {
      throw existingResponse.error;
    }

    const existingRows = Array.isArray(existingResponse?.data) ? existingResponse.data : [];
    const existingId = asTrimmed(existingRows[0]?.id);

    if (existingId) {
      const response = await admin
        .from("sms_sender_identities")
        .update(values)
        .eq("id", existingId)
        .eq("account_owner_user_id", accountOwnerUserId);

      if (response?.error) {
        throw response.error;
      }
    } else {
      const response = await admin.from("sms_sender_identities").insert({
        account_owner_user_id: accountOwnerUserId,
        provider_configuration_id: config.id,
        created_by_user_id: actingUserId,
        ...values,
      });

      if (response?.error) {
        throw response.error;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    redirect(withNotice("sender_identity_save_failed"));
  }

  redirect(withNotice("sender_identity_saved"));
}

export async function addSmsSandboxTestRecipientFromForm(formData: FormData): Promise<void> {
  const { accountOwnerUserId, actingUserId } = await requireAdminContext();

  const phoneE164 = normalizePhoneE164(formData.get("phone"));
  const phoneLabel = asTrimmed(formData.get("phone_label")).slice(0, 120);

  if (!phoneE164) {
    redirect(withNotice("test_recipient_invalid"));
  }

  const admin = createAdminClient();

  try {
    const response = await admin.from("sms_sandbox_test_recipients").insert({
      account_owner_user_id: accountOwnerUserId,
      phone_e164: phoneE164,
      phone_label: phoneLabel || null,
      is_active: true,
      verified_at: new Date().toISOString(),
      verified_by_user_id: actingUserId,
    });

    if (response?.error) {
      if (asTrimmed((response.error as any)?.code) === "23505") {
        redirect(withNotice("test_recipient_exists"));
      }
      throw response.error;
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    redirect(withNotice("test_recipient_add_failed"));
  }

  redirect(withNotice("test_recipient_added"));
}

export async function deactivateSmsSandboxTestRecipientFromForm(formData: FormData): Promise<void> {
  const { accountOwnerUserId } = await requireAdminContext();

  const testRecipientId = asTrimmed(formData.get("test_recipient_id"));
  if (!testRecipientId) {
    redirect(withNotice("test_recipient_invalid"));
  }

  const admin = createAdminClient();

  try {
    const response = await admin
      .from("sms_sandbox_test_recipients")
      .update({ is_active: false })
      .eq("id", testRecipientId)
      .eq("account_owner_user_id", accountOwnerUserId);

    if (response?.error) {
      throw response.error;
    }
  } catch {
    redirect(withNotice("test_recipient_update_failed"));
  }

  redirect(withNotice("test_recipient_deactivated"));
}
