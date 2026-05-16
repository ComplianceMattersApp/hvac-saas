type SupabaseLike = {
  from(table: string): any;
};

export type ResolveSmsSandboxProviderConfigParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  providerName?: "twilio" | string | null | undefined;
};

export type ResolveSmsSandboxProviderConfigResult = {
  readyForSandboxProviderSubmit: boolean;
  blockedReasons: string[];
  warnings: string[];
  providerName: "twilio";
  providerEnvironment?: "sandbox";
  providerConfigurationId?: string;
  senderIdentityId?: string;
  messagingServiceConfigured: boolean;
  senderIdentityReady: boolean;
  sandboxSendGateEnabled: boolean;
  liveSendEnabled: false;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => asTrimmed(value)).filter(Boolean)));
}

function blockedResult(input: {
  blockedReasons: string[];
  warnings?: string[];
  providerEnvironment?: "sandbox";
  providerConfigurationId?: string;
  senderIdentityId?: string;
  messagingServiceConfigured?: boolean;
  senderIdentityReady?: boolean;
  sandboxSendGateEnabled?: boolean;
}): ResolveSmsSandboxProviderConfigResult {
  return {
    readyForSandboxProviderSubmit: false,
    blockedReasons: uniqueStrings(input.blockedReasons),
    warnings: uniqueStrings(input.warnings || []),
    providerName: "twilio",
    providerEnvironment: input.providerEnvironment,
    providerConfigurationId: input.providerConfigurationId,
    senderIdentityId: input.senderIdentityId,
    messagingServiceConfigured: Boolean(input.messagingServiceConfigured),
    senderIdentityReady: Boolean(input.senderIdentityReady),
    sandboxSendGateEnabled: Boolean(input.sandboxSendGateEnabled),
    liveSendEnabled: false,
  };
}

async function readProviderConfiguration(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
}) {
  const response = await params.supabase
    .from("sms_provider_configurations")
    .select("*")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("provider_name", "twilio")
    .eq("provider_environment", "sandbox")
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return response?.data || null;
}

async function readSenderIdentity(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  providerConfigurationId: string;
}) {
  const response = await params.supabase
    .from("sms_sender_identities")
    .select("*")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("provider_configuration_id", params.providerConfigurationId)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return response?.data || null;
}

export async function resolveSmsSandboxProviderConfig(
  params: ResolveSmsSandboxProviderConfigParams,
): Promise<ResolveSmsSandboxProviderConfigResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const requestedProviderName = asTrimmed(params.providerName || "twilio").toLowerCase();

  if (!accountOwnerUserId) {
    return blockedResult({
      blockedReasons: ["account_scope_missing"],
    });
  }

  if (requestedProviderName !== "twilio") {
    return blockedResult({
      blockedReasons: ["provider_not_twilio"],
    });
  }

  let providerConfiguration: any;
  try {
    providerConfiguration = await readProviderConfiguration({
      supabase: params.supabase,
      accountOwnerUserId,
    });
  } catch {
    return blockedResult({
      blockedReasons: ["provider_configuration_missing"],
    });
  }

  if (!providerConfiguration) {
    return blockedResult({
      blockedReasons: ["provider_configuration_missing"],
    });
  }

  const providerConfigurationId = asTrimmed(providerConfiguration.id) || undefined;
  const providerName = asTrimmed(providerConfiguration.provider_name).toLowerCase();
  if (providerName !== "twilio") {
    return blockedResult({
      blockedReasons: ["provider_not_twilio"],
      providerConfigurationId,
    });
  }

  const providerEnvironment = asTrimmed(providerConfiguration.provider_environment).toLowerCase();
  if (providerEnvironment !== "sandbox") {
    return blockedResult({
      blockedReasons: ["provider_environment_not_sandbox", "live_sms_not_enabled"],
      providerConfigurationId,
    });
  }

  const readinessStatus = asTrimmed(providerConfiguration.readiness_status).toLowerCase();
  const sandboxReadyStatuses = new Set(["sandbox_only", "ready_for_sandbox", "ready_for_activation", "active"]);
  if (!sandboxReadyStatuses.has(readinessStatus)) {
    return blockedResult({
      blockedReasons: ["provider_not_ready_for_sandbox"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
    });
  }

  const providerMessagingServiceConfigured = asTrimmed(providerConfiguration.default_messaging_service_ref).length > 0;

  if (!providerConfigurationId) {
    return blockedResult({
      blockedReasons: ["provider_configuration_missing"],
      providerEnvironment: "sandbox",
    });
  }

  let senderIdentity: any;
  try {
    senderIdentity = await readSenderIdentity({
      supabase: params.supabase,
      accountOwnerUserId,
      providerConfigurationId,
    });
  } catch {
    return blockedResult({
      blockedReasons: ["sender_identity_missing"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
      messagingServiceConfigured: providerMessagingServiceConfigured,
    });
  }

  if (!senderIdentity) {
    return blockedResult({
      blockedReasons: ["sender_identity_missing"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
      messagingServiceConfigured: providerMessagingServiceConfigured,
    });
  }

  const senderIdentityId = asTrimmed(senderIdentity.id) || undefined;
  const senderVerificationStatus = asTrimmed(senderIdentity.verification_status).toLowerCase();
  const senderActivationStatus = asTrimmed(senderIdentity.activation_status).toLowerCase();
  const senderIdentityReady =
    (senderVerificationStatus === "verified" || senderVerificationStatus === "active") &&
    senderActivationStatus === "active";

  if (!senderIdentityReady) {
    return blockedResult({
      blockedReasons: ["sender_identity_not_ready"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
      senderIdentityId,
      messagingServiceConfigured: providerMessagingServiceConfigured,
      senderIdentityReady: false,
    });
  }

  const senderMessagingServiceConfigured = asTrimmed(senderIdentity.messaging_service_ref).length > 0;
  const messagingServiceConfigured = providerMessagingServiceConfigured || senderMessagingServiceConfigured;

  if (!messagingServiceConfigured) {
    return blockedResult({
      blockedReasons: ["messaging_service_missing"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
      senderIdentityId,
      messagingServiceConfigured: false,
      senderIdentityReady: true,
    });
  }

  if (providerConfiguration?.sandbox_send_enabled !== true) {
    return blockedResult({
      blockedReasons: ["sandbox_send_gate_missing_or_disabled"],
      providerEnvironment: "sandbox",
      providerConfigurationId,
      senderIdentityId,
      messagingServiceConfigured: true,
      senderIdentityReady: true,
      sandboxSendGateEnabled: false,
    });
  }

  return {
    readyForSandboxProviderSubmit: true,
    blockedReasons: [],
    warnings: [],
    providerName: "twilio",
    providerEnvironment: "sandbox",
    providerConfigurationId,
    senderIdentityId,
    messagingServiceConfigured: true,
    senderIdentityReady: true,
    sandboxSendGateEnabled: true,
    liveSendEnabled: false,
  };
}
