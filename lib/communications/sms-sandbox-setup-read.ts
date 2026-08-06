/**
 * Sandbox setup read model for the Admin Communications page — read-only.
 *
 * Returns browser-safe current values for the provider setup forms: masked
 * messaging service ref, sandbox send gate state, sender identity summary, and
 * the sandbox test recipient list. Raw provider refs and secrets are never
 * returned in full.
 */

type SupabaseLike = {
  from(table: string): any;
};

export type SmsSandboxSetupResult = {
  providerConfig: {
    exists: boolean;
    maskedMessagingServiceRef: string | null;
    maskedProviderAccountRef: string | null;
    readinessStatus: string | null;
    sandboxSendEnabled: boolean;
    liveActivationEnabled: boolean;
  };
  senderIdentity: {
    exists: boolean;
    displayLabel: string | null;
    phoneLast4: string | null;
    verificationStatus: string | null;
    activationStatus: string | null;
  };
  testRecipients: Array<{
    id: string;
    phoneLast4: string;
    phoneLabel: string | null;
    isActive: boolean;
    verifiedAt: string | null;
  }>;
};

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function maskRef(ref: string): string | null {
  if (!ref) return null;
  if (ref.length <= 4) return "••••";
  return `••••${ref.slice(-4)}`;
}

function emptyResult(): SmsSandboxSetupResult {
  return {
    providerConfig: {
      exists: false,
      maskedMessagingServiceRef: null,
      maskedProviderAccountRef: null,
      readinessStatus: null,
      sandboxSendEnabled: false,
      liveActivationEnabled: false,
    },
    senderIdentity: {
      exists: false,
      displayLabel: null,
      phoneLast4: null,
      verificationStatus: null,
      activationStatus: null,
    },
    testRecipients: [],
  };
}

export async function getSmsSandboxSetupForAccount(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
}): Promise<SmsSandboxSetupResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  if (!accountOwnerUserId) {
    return emptyResult();
  }

  const result = emptyResult();

  const configResponse = await params.supabase
    .from("sms_provider_configurations")
    .select(
      "id, default_messaging_service_ref, provider_account_ref, readiness_status, sandbox_send_enabled, activation_status",
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio")
    .eq("provider_environment", "sandbox")
    .maybeSingle();

  if (configResponse?.error) {
    throw configResponse.error;
  }

  const configRow = configResponse?.data as any;
  if (configRow?.id) {
    result.providerConfig = {
      exists: true,
      maskedMessagingServiceRef: maskRef(asTrimmed(configRow.default_messaging_service_ref)),
      maskedProviderAccountRef: maskRef(asTrimmed(configRow.provider_account_ref)),
      readinessStatus: asTrimmed(configRow.readiness_status) || null,
      sandboxSendEnabled: configRow.sandbox_send_enabled === true,
      liveActivationEnabled: asTrimmed(configRow.activation_status) === "active",
    };

    const senderResponse = await params.supabase
      .from("sms_sender_identities")
      .select("id, sender_display_label, phone_last4, verification_status, activation_status")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_configuration_id", asTrimmed(configRow.id))
      .limit(1);

    if (senderResponse?.error) {
      throw senderResponse.error;
    }

    const senderRows = Array.isArray(senderResponse?.data) ? senderResponse.data : [];
    const senderRow = senderRows[0] as any;
    if (senderRow?.id) {
      result.senderIdentity = {
        exists: true,
        displayLabel: asTrimmed(senderRow.sender_display_label) || null,
        phoneLast4: asTrimmed(senderRow.phone_last4) || null,
        verificationStatus: asTrimmed(senderRow.verification_status) || null,
        activationStatus: asTrimmed(senderRow.activation_status) || null,
      };
    }
  }

  const testRecipientResponse = await params.supabase
    .from("sms_sandbox_test_recipients")
    .select("id, phone_e164, phone_label, is_active, verified_at")
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (testRecipientResponse?.error) {
    throw testRecipientResponse.error;
  }

  const testRecipientRows = Array.isArray(testRecipientResponse?.data)
    ? testRecipientResponse.data
    : [];

  result.testRecipients = testRecipientRows.map((row: any) => ({
    id: asTrimmed(row?.id),
    phoneLast4: asTrimmed(row?.phone_e164).replace(/\D/g, "").slice(-4),
    phoneLabel: asTrimmed(row?.phone_label) || null,
    isActive: row?.is_active === true,
    verifiedAt: asTrimmed(row?.verified_at) || null,
  }));

  return result;
}
