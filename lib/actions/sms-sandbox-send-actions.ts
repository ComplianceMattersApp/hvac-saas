"use server";

import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { resolveSmsSandboxProviderConfig } from "@/lib/communications/sms-provider-config-resolver";
import { readSmsSandboxTestRecipientForPhone } from "@/lib/communications/sms-sandbox-test-recipient-read";
import {
  sendTwilioSandboxMessage,
  TwilioMessageError,
} from "@/lib/communications/twilio-messages-client";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const COMMUNICATIONS_PATH = "/ops/admin/communications";

function withNotice(path: string, notice: string): string {
  return `${path}?notice=${encodeURIComponent(notice)}`;
}

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

type SupabaseLike = {
  from(table: string): any;
};

type DeliveryRow = {
  id: string;
  account_owner_user_id: string;
  sms_message_intent_id: string;
  provider_name: string;
  provider_status: string;
  provider_message_id: string | null;
};

type IntentRow = {
  id: string;
  account_owner_user_id: string;
  message_class: string;
  decision_outcome: string;
  job_event_id: string | null;
  recipient_phone_snapshot: string | null;
  message_body_snapshot: string | null;
  template_key: string | null;
  template_version: string | number | null;
};

async function readScopedDelivery(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  deliveryId: string;
}): Promise<DeliveryRow | null> {
  const response = await params.supabase
    .from("sms_provider_deliveries")
    .select("id, account_owner_user_id, sms_message_intent_id, provider_name, provider_status, provider_message_id")
    .eq("id", params.deliveryId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return (response?.data as DeliveryRow | null) ?? null;
}

async function readScopedIntent(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  intentId: string;
}): Promise<IntentRow | null> {
  const response = await params.supabase
    .from("sms_message_intents")
    .select(
      "id, account_owner_user_id, message_class, decision_outcome, job_event_id, recipient_phone_snapshot, message_body_snapshot, template_key, template_version",
    )
    .eq("id", params.intentId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return (response?.data as IntentRow | null) ?? null;
}

function isDeliveryAlreadySubmitted(delivery: DeliveryRow): boolean {
  const providerStatus = asTrimmed(delivery.provider_status).toLowerCase();
  if (providerStatus !== "not_submitted") {
    return true;
  }

  return asTrimmed(delivery.provider_message_id).length > 0;
}

function isIntentReadyForDryRun(intent: IntentRow): boolean {
  if (asTrimmed(intent.message_class) !== "on_the_way") {
    return false;
  }

  if (asTrimmed(intent.decision_outcome) !== "ready_for_provider") {
    return false;
  }

  if (!asTrimmed(intent.job_event_id)) {
    return false;
  }

  if (!asTrimmed(intent.recipient_phone_snapshot)) {
    return false;
  }

  if (!asTrimmed(intent.message_body_snapshot)) {
    return false;
  }

  if (asTrimmed(intent.template_key) !== "on_the_way") {
    return false;
  }

  if (!asTrimmed(intent.template_version)) {
    return false;
  }

  return true;
}

export async function reserveSmsSandboxDeliveryDryRunFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  let accountOwnerUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    accountOwnerUserId = asTrimmed(ctx.internalUser.account_owner_user_id);
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "admin_required"));
  }

  const deliveryId = asTrimmed(formData.get("delivery_id"));
  if (!deliveryId) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_missing"));
  }

  const admin = createAdminClient();

  let delivery: DeliveryRow | null;
  try {
    delivery = await readScopedDelivery({
      supabase: admin,
      accountOwnerUserId,
      deliveryId,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!delivery) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_not_found"));
  }

  if (asTrimmed(delivery.provider_name).toLowerCase() !== "twilio") {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_not_ready"));
  }

  if (isDeliveryAlreadySubmitted(delivery)) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_already_submitted"));
  }

  const intentId = asTrimmed(delivery.sms_message_intent_id);
  if (!intentId) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_intent_not_ready"));
  }

  let intent: IntentRow | null;
  try {
    intent = await readScopedIntent({
      supabase: admin,
      accountOwnerUserId,
      intentId,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!intent || !isIntentReadyForDryRun(intent)) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_intent_not_ready"));
  }

  let providerConfig;
  try {
    providerConfig = await resolveSmsSandboxProviderConfig({
      supabase: admin,
      accountOwnerUserId,
      providerName: "twilio",
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!providerConfig.readyForSandboxProviderSubmit) {
    if (providerConfig.blockedReasons.includes("sandbox_send_gate_missing_or_disabled")) {
      redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_send_gate_missing_or_disabled"));
    }

    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_provider_not_ready"));
  }

  // F6C-C3D: Test-recipient dry-run gate.
  // Verify recipient phone matches an active, verified sandbox test recipient for this account.
  let testRecipient;
  try {
    testRecipient = await readSmsSandboxTestRecipientForPhone({
      supabase: admin,
      accountOwnerUserId,
      phoneE164: asTrimmed(intent.recipient_phone_snapshot),
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!testRecipient) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.is_active) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.verified_at) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.verified_by_user_id) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  // All gates passed. Return dry-run ready notice.
  redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_reservation_dry_run_ready"));
}

// ---------------------------------------------------------------------------
// F6C-C4: Manual admin sandbox provider submit action
// ---------------------------------------------------------------------------

async function readMessagingServiceRef(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  providerConfigurationId: string;
}): Promise<string | null> {
  const response = await params.supabase
    .from("sms_provider_configurations")
    .select("default_messaging_service_ref")
    .eq("id", params.providerConfigurationId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  const ref = asTrimmed((response?.data as any)?.default_messaging_service_ref);
  return ref.length > 0 ? ref : null;
}

async function guardedReserveDelivery(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  deliveryId: string;
  now: string;
}): Promise<boolean> {
  const response = await params.supabase
    .from("sms_provider_deliveries")
    .update({ provider_status: "submitted", submitted_at: params.now })
    .eq("id", params.deliveryId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("provider_status", "not_submitted")
    .is("provider_message_id", null)
    .select("id");

  if (response?.error) {
    throw response.error;
  }

  const rows = (response?.data as unknown[]) ?? [];
  return rows.length > 0;
}

function normalizeTwilioStatus(twilioStatus: string): "queued" | "submitted" {
  return twilioStatus === "queued" ? "queued" : "submitted";
}

export async function submitSmsSandboxDeliveryToProviderFromForm(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();

  let accountOwnerUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    accountOwnerUserId = asTrimmed(ctx.internalUser.account_owner_user_id);
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "admin_required"));
  }

  const deliveryId = asTrimmed(formData.get("delivery_id"));
  if (!deliveryId) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_missing"));
  }

  const admin = createAdminClient();

  let delivery: DeliveryRow | null;
  try {
    delivery = await readScopedDelivery({
      supabase: admin,
      accountOwnerUserId,
      deliveryId,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!delivery) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_not_found"));
  }

  if (asTrimmed(delivery.provider_name).toLowerCase() !== "twilio") {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_not_ready"));
  }

  if (isDeliveryAlreadySubmitted(delivery)) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_already_submitted"));
  }

  const intentId = asTrimmed(delivery.sms_message_intent_id);
  if (!intentId) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_intent_not_ready"));
  }

  let intent: IntentRow | null;
  try {
    intent = await readScopedIntent({
      supabase: admin,
      accountOwnerUserId,
      intentId,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!intent || !isIntentReadyForDryRun(intent)) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_intent_not_ready"));
  }

  let providerConfig;
  try {
    providerConfig = await resolveSmsSandboxProviderConfig({
      supabase: admin,
      accountOwnerUserId,
      providerName: "twilio",
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!providerConfig.readyForSandboxProviderSubmit) {
    if (providerConfig.blockedReasons.includes("sandbox_send_gate_missing_or_disabled")) {
      redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_send_gate_missing_or_disabled"));
    }
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_provider_not_ready"));
  }

  // Verify recipient phone matches an active, verified sandbox test recipient.
  let testRecipient;
  try {
    testRecipient = await readSmsSandboxTestRecipientForPhone({
      supabase: admin,
      accountOwnerUserId,
      phoneE164: asTrimmed(intent.recipient_phone_snapshot),
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!testRecipient) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.is_active) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.verified_at) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  if (!testRecipient.verified_by_user_id) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
  }

  // Resolve the messaging service SID from the provider configuration row.
  const providerConfigurationId = asTrimmed(providerConfig.providerConfigurationId);
  let messagingServiceSid: string | null;
  try {
    messagingServiceSid = await readMessagingServiceRef({
      supabase: admin,
      accountOwnerUserId,
      providerConfigurationId,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!messagingServiceSid) {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_provider_not_ready"));
  }

  // Guarded reservation: claim the delivery row before calling the provider.
  const now = new Date().toISOString();
  let reserved: boolean;
  try {
    reserved = await guardedReserveDelivery({
      supabase: admin,
      accountOwnerUserId,
      deliveryId,
      now,
    });
  } catch {
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_internal_error"));
  }

  if (!reserved) {
    // Another process already claimed this delivery.
    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_delivery_reserved"));
  }

  // Call the Twilio sandbox provider.
  const recipientPhone = asTrimmed(intent.recipient_phone_snapshot);
  const messageBody = asTrimmed(intent.message_body_snapshot);

  let twilioMessageSid: string;
  let twilioStatus: string;

  try {
    const result = await sendTwilioSandboxMessage({
      to: recipientPhone,
      body: messageBody,
      messagingServiceSid,
    });
    twilioMessageSid = result.messageSid;
    twilioStatus = result.status;
  } catch (providerError) {
    // On immediate provider failure: update delivery to failed.
    const postNow = new Date().toISOString();
    const errorCode =
      providerError instanceof TwilioMessageError && providerError.code != null
        ? String(providerError.code)
        : null;
    const errorMessage =
      providerError instanceof TwilioMessageError
        ? providerError.message
        : "Provider error";
    const rawStatus =
      providerError instanceof TwilioMessageError && providerError.twilioStatus != null
        ? providerError.twilioStatus
        : null;

    try {
      await admin
        .from("sms_provider_deliveries")
        .update({
          provider_status: "failed",
          failed_at: postNow,
          provider_last_event_at: postNow,
          ...(errorCode != null ? { provider_error_code: errorCode } : {}),
          provider_error_message: errorMessage,
          ...(rawStatus != null ? { provider_raw_status: rawStatus } : {}),
        })
        .eq("id", deliveryId)
        .eq("account_owner_user_id", accountOwnerUserId);
    } catch {
      // Best-effort failure record; do not mask the primary error notice.
    }

    redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_provider_immediate_failure"));
  }

  // On success: update delivery with provider identifiers and normalized status.
  const postNow = new Date().toISOString();
  const normalizedStatus = normalizeTwilioStatus(twilioStatus);

  try {
    await admin
      .from("sms_provider_deliveries")
      .update({
        provider_message_id: twilioMessageSid,
        provider_raw_status: twilioStatus,
        provider_status: normalizedStatus,
        provider_last_event_at: postNow,
      })
      .eq("id", deliveryId)
      .eq("account_owner_user_id", accountOwnerUserId);
  } catch {
    // Best-effort — delivery is already marked submitted; proceed to notice.
  }

  redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_provider_submit_attempted"));
}
