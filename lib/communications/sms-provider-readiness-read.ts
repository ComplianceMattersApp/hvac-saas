type SupabaseLike = {
  from(table: string): any;
};

export const SMS_PROVIDER_CONFIGURATION_SELECT = [
  "id",
  "provider_name",
  "provider_environment",
  "provider_account_ref",
  "default_messaging_service_ref",
  "readiness_status",
  "activation_status",
  "callback_status_readiness",
  "inbound_webhook_readiness",
  "status_callback_readiness",
  "advanced_opt_out_readiness",
  "created_at",
  "updated_at",
].join(", ");

export const SMS_SENDER_IDENTITY_SELECT = [
  "id",
  "provider_configuration_id",
  "sender_type",
  "sender_display_label",
  "phone_last4",
  "provider_sender_ref",
  "messaging_service_ref",
  "registration_type",
  "provider_brand_ref",
  "provider_campaign_ref",
  "provider_registration_ref",
  "verification_status",
  "activation_status",
  "created_at",
  "updated_at",
].join(", ");

export type SmsChecklistStatus = "complete" | "deferred" | "disabled";

export type SmsCommunicationsStatus = {
  smsEnabled: false;
  liveSendsEnabled: false;
  statusLabel: "SMS is not enabled";
  helperText: "Live sends are disabled. This page is readiness/status only.";
};

export type SmsProviderConfigurationReadinessRow = {
  id: string;
  providerName: string;
  providerEnvironment: string;
  readinessStatus: string;
  readinessLabel: string;
  activationStatus: string;
  activationLabel: string;
  callbackStatusReadiness: string;
  callbackStatusLabel: string;
  inboundWebhookReadiness: string;
  inboundWebhookLabel: string;
  statusCallbackReadiness: string;
  statusCallbackLabel: string;
  advancedOptOutReadiness: string;
  advancedOptOutLabel: string;
  providerAccountConfigured: boolean;
  defaultMessagingServiceConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SmsSenderIdentityReadinessRow = {
  id: string;
  providerConfigurationId: string;
  senderType: string;
  senderTypeLabel: string;
  senderDisplayLabel: string;
  maskedSender: string;
  verificationStatus: string;
  verificationLabel: string;
  activationStatus: string;
  activationLabel: string;
  registrationType: string;
  registrationTypeLabel: string;
  providerSenderConfigured: boolean;
  messagingServiceConfigured: boolean;
  brandRegistrationConfigured: boolean;
  providerRegistrationConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SmsProviderReadinessChecklistItem = {
  key: string;
  label: string;
  status: SmsChecklistStatus;
};

export type SmsProviderReadinessReadResult = {
  accountOwnerUserId: string;
  communicationsStatus: SmsCommunicationsStatus;
  providerConfigurations: SmsProviderConfigurationReadinessRow[];
  senderIdentities: SmsSenderIdentityReadinessRow[];
  providerReadinessSummary: {
    totalCount: number;
    configuredCount: number;
    statusLabel: string;
    helperText: string;
  };
  senderIdentitySummary: {
    totalCount: number;
    configuredCount: number;
    statusLabel: string;
    helperText: string;
  };
  complianceChecklist: SmsProviderReadinessChecklistItem[];
  activationSummary: {
    status: "disabled";
    statusLabel: "SMS is not enabled";
    helperText: "Live sends are disabled. This page is readiness/status only.";
  };
  deferredItems: string[];
  hasProviderConfiguration: boolean;
  hasSenderIdentity: boolean;
};

export type GetSmsProviderReadinessForAccountParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function hasConfiguredValue(value: unknown) {
  return asTrimmed(value).length > 0;
}

function mapProviderReadinessLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase();

  switch (status) {
    case "draft":
      return "Setup required";
    case "sandbox_only":
      return "Sandbox only";
    case "registration_required":
      return "Registration required";
    case "registration_pending":
      return "Registration pending";
    case "provider_review_required":
      return "Provider review required";
    case "ready_for_sandbox":
      return "Ready for sandbox";
    case "ready_for_activation":
      return "Ready for activation";
    case "active":
      return "Provider ready";
    case "paused":
      return "Paused";
    case "rejected":
      return "Rejected";
    default:
      return "Not configured";
  }
}

function mapActivationLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase();

  switch (status) {
    case "pending_activation":
      return "Pending activation";
    case "active":
      return "Configured active; live sends still unavailable";
    case "paused":
      return "Paused";
    case "disabled":
    default:
      return "Disabled";
  }
}

function mapCallbackLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase();

  switch (status) {
    case "pending":
      return "Pending";
    case "ready":
      return "Ready";
    case "failed":
      return "Needs attention";
    case "not_applicable":
      return "Not applicable";
    case "not_configured":
    default:
      return "Not configured";
  }
}

function mapSenderVerificationLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase();

  switch (status) {
    case "pending_verification":
      return "Pending verification";
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    case "active":
      return "Active sender configuration";
    case "paused":
      return "Paused";
    case "draft":
    default:
      return "Draft";
  }
}

function mapSenderTypeLabel(value: unknown) {
  const senderType = asTrimmed(value).toLowerCase();

  switch (senderType) {
    case "messaging_service":
      return "Messaging service";
    case "long_code":
      return "10DLC / long code";
    case "toll_free":
      return "Toll-free";
    case "short_code":
      return "Short code";
    case "alphanumeric":
      return "Alphanumeric";
    case "sandbox":
      return "Sandbox";
    default:
      return "Not configured";
  }
}

function mapRegistrationTypeLabel(value: unknown) {
  const registrationType = asTrimmed(value).toLowerCase();

  switch (registrationType) {
    case "a2p_10dlc":
      return "A2P 10DLC";
    case "toll_free_verification":
      return "Toll-free verification";
    case "short_code":
      return "Short code";
    case "provider_other":
      return "Other provider registration";
    case "none":
    default:
      return "None";
  }
}

function maskSender(phoneLast4: unknown) {
  const digits = asTrimmed(phoneLast4);
  return digits ? `•••• ${digits}` : "Not configured";
}

function buildChecklist(): SmsProviderReadinessChecklistItem[] {
  return [
    { key: "recipient_registry", label: "Recipient registry", status: "complete" },
    { key: "consent_suppression_foundation", label: "Consent/suppression foundation", status: "complete" },
    { key: "non_sending_eligibility_helper", label: "Non-sending eligibility helper", status: "complete" },
    { key: "intent_delivery_audit_tables", label: "Intent/delivery audit tables", status: "complete" },
    { key: "provider_config_sender_identity_schema", label: "Provider config/sender identity schema", status: "complete" },
    { key: "quiet_hours_send_gate", label: "Quiet-hours send gate", status: "deferred" },
    { key: "template_governance", label: "Template governance", status: "deferred" },
    { key: "provider_webhook_signature_validation", label: "Provider webhook/signature validation", status: "deferred" },
    { key: "sandbox_validation", label: "Sandbox validation", status: "deferred" },
    { key: "legal_provider_review", label: "Legal/provider review", status: "deferred" },
    { key: "explicit_activation", label: "Explicit activation", status: "disabled" },
  ];
}

function emptyResult(accountOwnerUserId: string): SmsProviderReadinessReadResult {
  return {
    accountOwnerUserId,
    communicationsStatus: {
      smsEnabled: false,
      liveSendsEnabled: false,
      statusLabel: "SMS is not enabled",
      helperText: "Live sends are disabled. This page is readiness/status only.",
    },
    providerConfigurations: [],
    senderIdentities: [],
    providerReadinessSummary: {
      totalCount: 0,
      configuredCount: 0,
      statusLabel: "Not configured",
      helperText: "Provider readiness is not configured for this account.",
    },
    senderIdentitySummary: {
      totalCount: 0,
      configuredCount: 0,
      statusLabel: "Not configured",
      helperText: "No sender identities are configured for this account.",
    },
    complianceChecklist: buildChecklist(),
    activationSummary: {
      status: "disabled",
      statusLabel: "SMS is not enabled",
      helperText: "Live sends are disabled. This page is readiness/status only.",
    },
    deferredItems: [
      "Quiet-hours send gate",
      "Template governance",
      "Provider webhook/signature validation",
      "Sandbox validation",
      "Legal/provider review",
      "Explicit activation",
    ],
    hasProviderConfiguration: false,
    hasSenderIdentity: false,
  };
}

function normalizeProviderConfigurationRow(row: any): SmsProviderConfigurationReadinessRow | null {
  const id = asTrimmed(row?.id);
  const providerName = asTrimmed(row?.provider_name);
  const providerEnvironment = asTrimmed(row?.provider_environment);
  const readinessStatus = asTrimmed(row?.readiness_status).toLowerCase() || "draft";
  const activationStatus = asTrimmed(row?.activation_status).toLowerCase() || "disabled";
  const callbackStatusReadiness = asTrimmed(row?.callback_status_readiness).toLowerCase() || "not_configured";
  const inboundWebhookReadiness = asTrimmed(row?.inbound_webhook_readiness).toLowerCase() || "not_configured";
  const statusCallbackReadiness = asTrimmed(row?.status_callback_readiness).toLowerCase() || "not_configured";
  const advancedOptOutReadiness = asTrimmed(row?.advanced_opt_out_readiness).toLowerCase() || "not_configured";
  const createdAt = asTrimmed(row?.created_at);
  const updatedAt = asTrimmed(row?.updated_at);

  if (!id || !providerName || !providerEnvironment || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    providerName,
    providerEnvironment,
    readinessStatus,
    readinessLabel: mapProviderReadinessLabel(readinessStatus),
    activationStatus,
    activationLabel: mapActivationLabel(activationStatus),
    callbackStatusReadiness,
    callbackStatusLabel: mapCallbackLabel(callbackStatusReadiness),
    inboundWebhookReadiness,
    inboundWebhookLabel: mapCallbackLabel(inboundWebhookReadiness),
    statusCallbackReadiness,
    statusCallbackLabel: mapCallbackLabel(statusCallbackReadiness),
    advancedOptOutReadiness,
    advancedOptOutLabel: mapCallbackLabel(advancedOptOutReadiness),
    providerAccountConfigured: hasConfiguredValue(row?.provider_account_ref),
    defaultMessagingServiceConfigured: hasConfiguredValue(row?.default_messaging_service_ref),
    createdAt,
    updatedAt,
  };
}

function normalizeSenderIdentityRow(row: any): SmsSenderIdentityReadinessRow | null {
  const id = asTrimmed(row?.id);
  const providerConfigurationId = asTrimmed(row?.provider_configuration_id);
  const senderType = asTrimmed(row?.sender_type).toLowerCase();
  const senderDisplayLabel = asTrimmed(row?.sender_display_label);
  const verificationStatus = asTrimmed(row?.verification_status).toLowerCase() || "draft";
  const activationStatus = asTrimmed(row?.activation_status).toLowerCase() || "disabled";
  const registrationType = asTrimmed(row?.registration_type).toLowerCase() || "none";
  const createdAt = asTrimmed(row?.created_at);
  const updatedAt = asTrimmed(row?.updated_at);

  if (!id || !providerConfigurationId || !senderType || !senderDisplayLabel || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    providerConfigurationId,
    senderType,
    senderTypeLabel: mapSenderTypeLabel(senderType),
    senderDisplayLabel,
    maskedSender: maskSender(row?.phone_last4),
    verificationStatus,
    verificationLabel: mapSenderVerificationLabel(verificationStatus),
    activationStatus,
    activationLabel: mapActivationLabel(activationStatus),
    registrationType,
    registrationTypeLabel: mapRegistrationTypeLabel(registrationType),
    providerSenderConfigured: hasConfiguredValue(row?.provider_sender_ref),
    messagingServiceConfigured: hasConfiguredValue(row?.messaging_service_ref),
    brandRegistrationConfigured: hasConfiguredValue(row?.provider_brand_ref),
    providerRegistrationConfigured:
      hasConfiguredValue(row?.provider_campaign_ref) || hasConfiguredValue(row?.provider_registration_ref),
    createdAt,
    updatedAt,
  };
}

export async function getSmsProviderReadinessForAccount(
  params: GetSmsProviderReadinessForAccountParams,
): Promise<SmsProviderReadinessReadResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const result = emptyResult(accountOwnerUserId);

  if (!accountOwnerUserId) {
    return result;
  }

  const providerConfigurationsQuery = params.supabase
    .from("sms_provider_configurations")
    .select(SMS_PROVIDER_CONFIGURATION_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("provider_name", { ascending: true })
    .order("provider_environment", { ascending: true });

  const senderIdentitiesQuery = params.supabase
    .from("sms_sender_identities")
    .select(SMS_SENDER_IDENTITY_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("sender_display_label", { ascending: true })
    .order("created_at", { ascending: true });

  const [providerConfigurationsResult, senderIdentitiesResult] = await Promise.all([
    providerConfigurationsQuery,
    senderIdentitiesQuery,
  ]);

  if (providerConfigurationsResult?.error) throw providerConfigurationsResult.error;
  if (senderIdentitiesResult?.error) throw senderIdentitiesResult.error;

  result.providerConfigurations = (Array.isArray(providerConfigurationsResult?.data)
    ? providerConfigurationsResult.data
    : []
  )
    .map((row: any) => normalizeProviderConfigurationRow(row))
    .filter(
      (row: SmsProviderConfigurationReadinessRow | null): row is SmsProviderConfigurationReadinessRow => row !== null,
    );

  result.senderIdentities = (Array.isArray(senderIdentitiesResult?.data) ? senderIdentitiesResult.data : [])
    .map((row: any) => normalizeSenderIdentityRow(row))
    .filter((row: SmsSenderIdentityReadinessRow | null): row is SmsSenderIdentityReadinessRow => row !== null);

  result.hasProviderConfiguration = result.providerConfigurations.length > 0;
  result.hasSenderIdentity = result.senderIdentities.length > 0;
  result.providerReadinessSummary = {
    totalCount: result.providerConfigurations.length,
    configuredCount: result.providerConfigurations.filter(
      (row) => row.providerAccountConfigured || row.defaultMessagingServiceConfigured,
    ).length,
    statusLabel: result.hasProviderConfiguration ? "Configured" : "Not configured",
    helperText: result.hasProviderConfiguration
      ? "Provider readiness is configured for this account. Live sends are still disabled."
      : "Provider readiness is not configured for this account.",
  };
  result.senderIdentitySummary = {
    totalCount: result.senderIdentities.length,
    configuredCount: result.senderIdentities.filter(
      (row) =>
        row.providerSenderConfigured ||
        row.messagingServiceConfigured ||
        row.brandRegistrationConfigured ||
        row.providerRegistrationConfigured,
    ).length,
    statusLabel: result.hasSenderIdentity ? "Configured" : "Not configured",
    helperText: result.hasSenderIdentity
      ? "Sender identities are configured for this account. Live sends are still disabled."
      : "No sender identities are configured for this account.",
  };

  return result;
}
