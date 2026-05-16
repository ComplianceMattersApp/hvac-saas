"use server";

import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { resolveSmsSandboxProviderConfig } from "@/lib/communications/sms-provider-config-resolver";
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

  // F6C-C1 lock: verified sandbox test-recipient policy is not modeled yet.
  // F6C-C2 remains evaluation-only and fails closed before any reservation/send path.
  redirect(withNotice(COMMUNICATIONS_PATH, "sandbox_test_recipient_required"));
}
