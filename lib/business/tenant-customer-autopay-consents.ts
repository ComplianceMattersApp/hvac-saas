function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function toPositiveInt(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.floor(n);
}

function isUniqueConflict(error: unknown) {
  const code = clean((error as { code?: unknown } | null)?.code);
  if (code === "23505") return true;
  const message = clean((error as { message?: unknown } | null)?.message).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

const FORBIDDEN_CREDENTIAL_KEYS = [
  "cardNumber",
  "card_number",
  "cvc",
  "cvv",
  "pan",
  "fullPan",
  "routingNumber",
  "accountNumber",
  "iban",
  "paymentMethodToken",
] as const;

type ConsentStatus = "disabled" | "enabled" | "paused" | "revoked" | "stale_or_invalid";

type ConsentChannel = "hosted_setup" | "hosted_checkout_setup" | "internal_recorded" | "imported_legacy";
type ConsentSource = "customer_approved" | "internal_staff_recorded" | "system_migrated";
type ConsentActorType = "customer_contact" | "internal_user" | "system";

type EnableAutopayConsentParams = {
  admin: any;
  accountOwnerUserId: string;
  customerId: string;
  maintenanceAgreementId: string;
  tenantStripeCustomerId: string;
  tenantCustomerPaymentMethodId: string;
  consentVersion: string;
  consentTextSnapshot: string;
  consentTextHash: string;
  consentChannel: ConsentChannel;
  consentSource: ConsentSource;
  consentedByActorType: ConsentActorType;
  consentedByUserId?: string | null;
  consentedByContactName?: string | null;
  consentedByContactEmail?: string | null;
  consentedByContactPhone?: string | null;
  consentedAt?: string | null;
  consentIpAddress?: string | null;
  consentUserAgent?: string | null;
  maxAmountCents?: number | null;
} & Record<string, unknown>;

type DisableOrRevokeAutopayConsentParams = {
  admin: any;
  accountOwnerUserId: string;
  customerId: string;
  maintenanceAgreementId: string;
  action: "disable" | "revoke";
  reasonCode?: string | null;
  actorUserId?: string | null;
};

type AutopayConsentResult = {
  ok: boolean;
  status: "enabled" | "disabled" | "revoked" | "noop" | "blocked";
  consentId: string | null;
  blockedReason?: string;
  noPaymentRowWrites: true;
  noAllocationRowWrites: true;
  noInvoiceMutations: true;
  noVisitOrNextDueMutations: true;
};

type CustomerRow = {
  id: string;
  owner_user_id: string;
};

type MaintenanceAgreementRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
};

type TenantStripeCustomerRow = {
  id: string;
  customer_id: string;
  account_owner_user_id: string;
  stripe_connected_account_id: string;
  stripe_customer_id: string;
  profile_status: string;
  is_current: boolean;
};

type TenantCustomerPaymentMethodRow = {
  id: string;
  customer_id: string;
  account_owner_user_id: string;
  tenant_stripe_customer_id: string;
  stripe_connected_account_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  payment_method_status: string;
  detached_at: string | null;
  invalidated_at: string | null;
};

type TenantAutopayConsentRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
  maintenance_agreement_id: string;
  tenant_stripe_customer_id: string;
  tenant_customer_payment_method_id: string;
  stripe_connected_account_id: string;
  consent_status: ConsentStatus;
  is_current: boolean;
  consent_version: string;
  consent_text_hash: string;
  max_amount_cents: number | null;
};

function hasForbiddenCredentialInputs(params: Record<string, unknown>) {
  for (const key of FORBIDDEN_CREDENTIAL_KEYS) {
    const value = params[key];
    if (typeof value === "string" && clean(value)) {
      return true;
    }
  }
  return false;
}

async function resolveCurrentConsent(params: {
  admin: any;
  accountOwnerUserId: string;
  customerId: string;
  maintenanceAgreementId: string;
}): Promise<TenantAutopayConsentRow | null> {
  const { data, error } = await params.admin
    .from("tenant_customer_autopay_consents")
    .select(
      [
        "id",
        "account_owner_user_id",
        "customer_id",
        "maintenance_agreement_id",
        "tenant_stripe_customer_id",
        "tenant_customer_payment_method_id",
        "stripe_connected_account_id",
        "consent_status",
        "is_current",
        "consent_version",
        "consent_text_hash",
        "max_amount_cents",
        "updated_at",
      ].join(", "),
    )
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("customer_id", params.customerId)
    .eq("maintenance_agreement_id", params.maintenanceAgreementId)
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to resolve current autopay consent: ${error.message ?? "unknown error"}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as TenantAutopayConsentRow) : null;
}

export async function enableTenantCustomerAutopayConsent(
  params: EnableAutopayConsentParams,
): Promise<AutopayConsentResult> {
  const admin = params.admin;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  const maintenanceAgreementId = clean(params.maintenanceAgreementId);
  const tenantStripeCustomerId = clean(params.tenantStripeCustomerId);
  const tenantCustomerPaymentMethodId = clean(params.tenantCustomerPaymentMethodId);
  const consentVersion = clean(params.consentVersion);
  const consentTextSnapshot = clean(params.consentTextSnapshot);
  const consentTextHash = clean(params.consentTextHash);
  const consentChannel = clean(params.consentChannel) as ConsentChannel;
  const consentSource = clean(params.consentSource) as ConsentSource;
  const consentedByActorType = clean(params.consentedByActorType) as ConsentActorType;

  const base: Omit<AutopayConsentResult, "ok" | "status" | "consentId"> = {
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };

  if (hasForbiddenCredentialInputs(params)) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "forbidden_payment_credentials_input",
      ...base,
    };
  }

  if (
    !accountOwnerUserId
    || !customerId
    || !maintenanceAgreementId
    || !tenantStripeCustomerId
    || !tenantCustomerPaymentMethodId
    || !consentVersion
    || !consentTextSnapshot
    || !consentTextHash
  ) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "missing_required_inputs",
      ...base,
    };
  }

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id, owner_user_id")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error(`Failed to resolve customer for autopay consent: ${customerError.message ?? "unknown error"}`);
  }

  if (!customer?.id || clean((customer as CustomerRow).owner_user_id) !== accountOwnerUserId) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "customer_scope_mismatch",
      ...base,
    };
  }

  const { data: agreement, error: agreementError } = await admin
    .from("maintenance_agreements")
    .select("id, account_owner_user_id, customer_id")
    .eq("id", maintenanceAgreementId)
    .maybeSingle();

  if (agreementError) {
    throw new Error(
      `Failed to resolve maintenance agreement for autopay consent: ${agreementError.message ?? "unknown error"}`,
    );
  }

  const agreementRow = agreement as MaintenanceAgreementRow | null;
  if (
    !agreementRow?.id
    || clean(agreementRow.account_owner_user_id) !== accountOwnerUserId
    || clean(agreementRow.customer_id) !== customerId
  ) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "maintenance_agreement_scope_mismatch",
      ...base,
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("tenant_stripe_customers")
    .select(
      [
        "id",
        "customer_id",
        "account_owner_user_id",
        "stripe_connected_account_id",
        "stripe_customer_id",
        "profile_status",
        "is_current",
      ].join(", "),
    )
    .eq("id", tenantStripeCustomerId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Failed to resolve payment profile for autopay consent: ${profileError.message ?? "unknown error"}`,
    );
  }

  const profileRow = profile as TenantStripeCustomerRow | null;
  if (!profileRow?.id) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "missing_payment_profile",
      ...base,
    };
  }

  if (
    clean(profileRow.account_owner_user_id) !== accountOwnerUserId
    || clean(profileRow.customer_id) !== customerId
  ) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "payment_profile_scope_mismatch",
      ...base,
    };
  }

  if (clean(profileRow.profile_status).toLowerCase() !== "active" || !Boolean(profileRow.is_current)) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "payment_profile_inactive",
      ...base,
    };
  }

  const { data: method, error: methodError } = await admin
    .from("tenant_customer_payment_methods")
    .select(
      [
        "id",
        "customer_id",
        "account_owner_user_id",
        "tenant_stripe_customer_id",
        "stripe_connected_account_id",
        "stripe_customer_id",
        "stripe_payment_method_id",
        "payment_method_status",
        "detached_at",
        "invalidated_at",
      ].join(", "),
    )
    .eq("id", tenantCustomerPaymentMethodId)
    .maybeSingle();

  if (methodError) {
    throw new Error(
      `Failed to resolve saved payment method for autopay consent: ${methodError.message ?? "unknown error"}`,
    );
  }

  const methodRow = method as TenantCustomerPaymentMethodRow | null;
  if (!methodRow?.id) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "missing_saved_payment_method",
      ...base,
    };
  }

  if (
    clean(methodRow.account_owner_user_id) !== accountOwnerUserId
    || clean(methodRow.customer_id) !== customerId
  ) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "saved_payment_method_scope_mismatch",
      ...base,
    };
  }

  const methodStatus = clean(methodRow.payment_method_status).toLowerCase();
  if (
    methodStatus !== "active"
    || clean(methodRow.detached_at)
    || clean(methodRow.invalidated_at)
    || !clean(methodRow.stripe_payment_method_id)
  ) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "saved_payment_method_inactive",
      ...base,
    };
  }

  if (clean(methodRow.tenant_stripe_customer_id) !== tenantStripeCustomerId) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "saved_method_profile_mismatch",
      ...base,
    };
  }

  if (clean(methodRow.stripe_customer_id) !== clean(profileRow.stripe_customer_id)) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "saved_method_stripe_customer_mismatch",
      ...base,
    };
  }

  const connectedAccountId = clean(profileRow.stripe_connected_account_id);
  if (!connectedAccountId || connectedAccountId !== clean(methodRow.stripe_connected_account_id)) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "connected_account_mismatch",
      ...base,
    };
  }

  const current = await resolveCurrentConsent({
    admin,
    accountOwnerUserId,
    customerId,
    maintenanceAgreementId,
  });

  if (
    current?.id
    && clean(current.consent_status).toLowerCase() === "enabled"
    && clean(current.tenant_stripe_customer_id) === tenantStripeCustomerId
    && clean(current.tenant_customer_payment_method_id) === tenantCustomerPaymentMethodId
  ) {
    return {
      ok: true,
      status: "noop",
      consentId: clean(current.id),
      ...base,
    };
  }

  const timestamp = nowIso();

  if (current?.id) {
    const { error: currentUpdateError } = await admin
      .from("tenant_customer_autopay_consents")
      .update({
        is_current: false,
        updated_at: timestamp,
      })
      .eq("id", clean(current.id));

    if (currentUpdateError) {
      throw new Error(
        `Failed to archive previous current autopay consent: ${currentUpdateError.message ?? "unknown error"}`,
      );
    }
  }

  const maxAmountCents = toPositiveInt(params.maxAmountCents);
  const consentedByUserId = clean(params.consentedByUserId) || null;

  const insertPayload = {
    account_owner_user_id: accountOwnerUserId,
    customer_id: customerId,
    maintenance_agreement_id: maintenanceAgreementId,
    tenant_stripe_customer_id: tenantStripeCustomerId,
    tenant_customer_payment_method_id: tenantCustomerPaymentMethodId,
    stripe_connected_account_id: connectedAccountId,
    consent_status: "enabled",
    is_current: true,
    consent_version: consentVersion,
    consent_text_snapshot: consentTextSnapshot,
    consent_text_hash: consentTextHash,
    consent_channel: consentChannel,
    consent_source: consentSource,
    consented_by_actor_type: consentedByActorType,
    consented_by_user_id: consentedByUserId,
    consented_by_contact_name: clean(params.consentedByContactName) || null,
    consented_by_contact_email: clean(params.consentedByContactEmail) || null,
    consented_by_contact_phone: clean(params.consentedByContactPhone) || null,
    consented_at: clean(params.consentedAt) || timestamp,
    consent_ip_address: clean(params.consentIpAddress) || null,
    consent_user_agent: clean(params.consentUserAgent) || null,
    max_amount_cents: maxAmountCents,
    pause_reason_code: null,
    revoked_reason_code: null,
    stale_reason_code: null,
    disabled_at: null,
    disabled_by_user_id: null,
    paused_at: null,
    paused_by_user_id: null,
    revoked_at: null,
    revoked_by_user_id: null,
    last_validated_at: timestamp,
    updated_at: timestamp,
    created_at: timestamp,
  };

  const { data: inserted, error: insertError } = await admin
    .from("tenant_customer_autopay_consents")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) {
    if (isUniqueConflict(insertError)) {
      const fallback = await resolveCurrentConsent({
        admin,
        accountOwnerUserId,
        customerId,
        maintenanceAgreementId,
      });
      if (fallback?.id && clean(fallback.consent_status).toLowerCase() === "enabled") {
        return {
          ok: true,
          status: "noop",
          consentId: clean(fallback.id),
          ...base,
        };
      }
    }

    throw new Error(
      `Failed to create enabled autopay consent row: ${insertError.message ?? "unknown error"}`,
    );
  }

  return {
    ok: true,
    status: "enabled",
    consentId: clean(inserted?.id) || null,
    ...base,
  };
}

export async function disableOrRevokeTenantCustomerAutopayConsent(
  params: DisableOrRevokeAutopayConsentParams,
): Promise<AutopayConsentResult> {
  const admin = params.admin;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  const maintenanceAgreementId = clean(params.maintenanceAgreementId);
  const action = params.action;
  const actorUserId = clean(params.actorUserId) || null;
  const reasonCode = clean(params.reasonCode) || null;

  const base: Omit<AutopayConsentResult, "ok" | "status" | "consentId"> = {
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };

  if (!accountOwnerUserId || !customerId || !maintenanceAgreementId) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "missing_required_inputs",
      ...base,
    };
  }

  const current = await resolveCurrentConsent({
    admin,
    accountOwnerUserId,
    customerId,
    maintenanceAgreementId,
  });

  if (!current?.id) {
    return {
      ok: false,
      status: "blocked",
      consentId: null,
      blockedReason: "missing_current_consent",
      ...base,
    };
  }

  const targetStatus: ConsentStatus = action === "revoke" ? "revoked" : "disabled";
  if (clean(current.consent_status).toLowerCase() === targetStatus) {
    return {
      ok: true,
      status: "noop",
      consentId: clean(current.id),
      ...base,
    };
  }

  const patch: Record<string, unknown> = {
    consent_status: targetStatus,
    updated_at: nowIso(),
  };

  if (targetStatus === "disabled") {
    patch.disabled_at = nowIso();
    patch.disabled_by_user_id = actorUserId;
    patch.pause_reason_code = reasonCode;
  } else {
    patch.revoked_at = nowIso();
    patch.revoked_by_user_id = actorUserId;
    patch.revoked_reason_code = reasonCode;
  }

  const { error: updateError } = await admin
    .from("tenant_customer_autopay_consents")
    .update(patch)
    .eq("id", clean(current.id));

  if (updateError) {
    throw new Error(
      `Failed to ${action} autopay consent: ${updateError.message ?? "unknown error"}`,
    );
  }

  return {
    ok: true,
    status: targetStatus,
    consentId: clean(current.id),
    ...base,
  };
}
