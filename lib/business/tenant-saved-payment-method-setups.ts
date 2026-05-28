import type Stripe from "stripe";
import {
  getStripeServerClient,
  resolvePlatformBillingAppUrl,
} from "@/lib/business/platform-billing-stripe";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function looksLikeUniqueConflict(error: unknown) {
  const code = toCleanString((error as { code?: unknown } | null)?.code);
  if (code === "23505") return true;

  const message = toCleanString((error as { message?: unknown } | null)?.message).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

function safeReturnPath(value: string | null | undefined, fallback: string) {
  const normalizedFallback = toCleanString(fallback) || "/customers";
  const normalized = toCleanString(value);
  if (!normalized) return normalizedFallback;
  if (!normalized.startsWith("/")) return normalizedFallback;
  if (normalized.startsWith("//")) return normalizedFallback;
  return normalized;
}

function mergePathBanner(path: string, banner: string, setupId?: string | null) {
  const url = new URL(path, "https://app.local");
  url.searchParams.set("banner", banner);
  if (toCleanString(setupId)) {
    url.searchParams.set("spm_setup", toCleanString(setupId));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function formatDisplayBrand(value: unknown) {
  const normalized = toCleanString(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "amex") return "American Express";
  return normalized;
}

function formatDisplayWalletType(value: unknown) {
  const normalized = toCleanString(value).toLowerCase();
  return normalized || null;
}

type TenantStripeCustomerProfileRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
  stripe_connected_account_id: string;
  stripe_customer_id: string;
  profile_status: string;
  is_current: boolean;
};

export type EnsureTenantStripeCustomerReferenceParams = {
  admin: any;
  stripe?: Stripe;
  accountOwnerUserId: string;
  customerId: string;
  connectedAccountId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  createdByUserId?: string | null;
};

export async function ensureTenantStripeCustomerReference(
  params: EnsureTenantStripeCustomerReferenceParams,
): Promise<{
  tenantStripeCustomerId: string;
  stripeCustomerId: string;
  reused: boolean;
}> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const customerId = toCleanString(params.customerId);
  const connectedAccountId = toCleanString(params.connectedAccountId);

  if (!accountOwnerUserId || !customerId || !connectedAccountId) {
    throw new Error("accountOwnerUserId, customerId, and connectedAccountId are required.");
  }

  const { data: rows, error: rowError } = await params.admin
    .from("tenant_stripe_customers")
    .select(
      [
        "id",
        "account_owner_user_id",
        "customer_id",
        "stripe_connected_account_id",
        "stripe_customer_id",
        "profile_status",
        "is_current",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("stripe_connected_account_id", connectedAccountId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (rowError) {
    throw new Error(
      `Failed to load tenant Stripe customer reference: ${rowError.message ?? "unknown error"}`,
    );
  }

  const existing = (Array.isArray(rows) ? rows[0] : null) as TenantStripeCustomerProfileRow | null;
  const existingStripeCustomerId = toCleanString(existing?.stripe_customer_id);
  if (existing?.id && existingStripeCustomerId) {
    return {
      tenantStripeCustomerId: toCleanString(existing.id),
      stripeCustomerId: existingStripeCustomerId,
      reused: true,
    };
  }

  const stripe = params.stripe ?? getStripeServerClient();
  const customer = await stripe.customers.create(
    {
      email: toCleanString(params.customerEmail) || undefined,
      name: toCleanString(params.customerName) || undefined,
      phone: toCleanString(params.customerPhone) || undefined,
      metadata: {
        account_owner_user_id: accountOwnerUserId,
        customer_id: customerId,
      },
    },
    {
      stripeAccount: connectedAccountId,
    },
  );

  const stripeCustomerId = toCleanString(customer.id);
  if (!stripeCustomerId) {
    throw new Error("Stripe customer creation returned an empty customer id.");
  }

  const timestamp = nowIso();
  const createdByUserId = toCleanString(params.createdByUserId) || null;
  const upsertPayload = {
    account_owner_user_id: accountOwnerUserId,
    customer_id: customerId,
    stripe_connected_account_id: connectedAccountId,
    stripe_customer_id: stripeCustomerId,
    profile_status: "active",
    is_current: true,
    last_verified_at: timestamp,
    updated_at: timestamp,
    updated_by_user_id: createdByUserId,
    created_at: timestamp,
    created_by_user_id: createdByUserId,
  };

  const { data: inserted, error: insertError } = await params.admin
    .from("tenant_stripe_customers")
    .insert(upsertPayload)
    .select("id")
    .single();

  if (insertError) {
    if (looksLikeUniqueConflict(insertError)) {
      const { data: fallbackRows, error: fallbackError } = await params.admin
        .from("tenant_stripe_customers")
        .select("id, stripe_customer_id")
        .eq("stripe_connected_account_id", connectedAccountId)
        .eq("stripe_customer_id", stripeCustomerId)
        .limit(1);

      if (fallbackError) {
        throw new Error(
          `Failed to recover tenant Stripe customer reference after conflict: ${fallbackError.message ?? "unknown error"}`,
        );
      }

      const fallback = Array.isArray(fallbackRows) ? fallbackRows[0] : null;
      const fallbackId = toCleanString(fallback?.id);
      const fallbackStripeCustomerId = toCleanString(fallback?.stripe_customer_id);
      if (fallbackId && fallbackStripeCustomerId) {
        return {
          tenantStripeCustomerId: fallbackId,
          stripeCustomerId: fallbackStripeCustomerId,
          reused: true,
        };
      }
    }

    throw new Error(
      `Failed to insert tenant Stripe customer reference: ${insertError.message ?? "unknown error"}`,
    );
  }

  const tenantStripeCustomerId = toCleanString(inserted?.id);
  if (!tenantStripeCustomerId) {
    throw new Error("Tenant Stripe customer reference insert returned an empty id.");
  }

  return {
    tenantStripeCustomerId,
    stripeCustomerId,
    reused: false,
  };
}

export type StartTenantSavedCardSetupCheckoutParams = {
  admin: any;
  stripe?: Stripe;
  accountOwnerUserId: string;
  customerId: string;
  connectedAccountId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  initiatedByUserId?: string | null;
  maintenanceAgreementId?: string | null;
  returnPath: string;
};

export async function startTenantSavedCardSetupCheckoutSession(
  params: StartTenantSavedCardSetupCheckoutParams,
): Promise<{
  setupId: string;
  checkoutSessionId: string;
  checkoutSessionUrl: string;
  tenantStripeCustomerId: string;
  stripeCustomerId: string;
}> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const customerId = toCleanString(params.customerId);
  const connectedAccountId = toCleanString(params.connectedAccountId);

  if (!accountOwnerUserId || !customerId || !connectedAccountId) {
    throw new Error("accountOwnerUserId, customerId, and connectedAccountId are required.");
  }

  const appUrl = toCleanString(resolvePlatformBillingAppUrl()).replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("APP_URL is not configured.");
  }

  const returnPath = safeReturnPath(params.returnPath, `/customers/${customerId}`);
  const initiatedByUserId = toCleanString(params.initiatedByUserId) || null;
  const maintenanceAgreementId = toCleanString(params.maintenanceAgreementId) || null;
  const metadataSnapshot = {
    return_path: returnPath,
    maintenance_agreement_id: maintenanceAgreementId,
    setup_kind: "saved_card_setup",
  };

  const { tenantStripeCustomerId, stripeCustomerId } = await ensureTenantStripeCustomerReference({
    admin: params.admin,
    stripe: params.stripe,
    accountOwnerUserId,
    customerId,
    connectedAccountId,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
    createdByUserId: initiatedByUserId,
  });

  const timestamp = nowIso();
  const { data: setupRow, error: setupInsertError } = await params.admin
    .from("tenant_saved_payment_method_setups")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      customer_id: customerId,
      maintenance_agreement_id: maintenanceAgreementId,
      tenant_stripe_customer_id: tenantStripeCustomerId,
      stripe_connected_account_id: connectedAccountId,
      stripe_customer_id: stripeCustomerId,
      setup_flow_kind: "checkout_setup_mode",
      setup_status: "initiated",
      initiated_by_source: "internal_staff",
      initiated_by_user_id: initiatedByUserId,
      return_url_path: returnPath,
      metadata_snapshot_json: metadataSnapshot,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single();

  if (setupInsertError) {
    throw new Error(
      `Failed to create saved payment method setup row: ${setupInsertError.message ?? "unknown error"}`,
    );
  }

  const setupId = toCleanString(setupRow?.id);
  if (!setupId) {
    throw new Error("Saved payment method setup row insert returned an empty id.");
  }

  const metadata: Record<string, string> = {
    setup_id: setupId,
    account_owner_user_id: accountOwnerUserId,
    customer_id: customerId,
    return_path: returnPath,
  };
  if (maintenanceAgreementId) {
    metadata.maintenance_agreement_id = maintenanceAgreementId;
  }

  const stripe = params.stripe ?? getStripeServerClient();

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "setup",
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        metadata,
        setup_intent_data: {
          metadata,
        },
        success_url: `${appUrl}${mergePathBanner(returnPath, "saved_payment_method_setup_returned", setupId)}`,
        cancel_url: `${appUrl}${mergePathBanner(returnPath, "saved_payment_method_setup_cancelled", setupId)}`,
      },
      {
        stripeAccount: connectedAccountId,
      },
    );

    const checkoutSessionId = toCleanString(session.id);
    const checkoutSessionUrl = toCleanString(session.url);

    if (!checkoutSessionId || !checkoutSessionUrl) {
      throw new Error("Stripe checkout setup session response was missing id or url.");
    }

    const now = nowIso();
    const { error: setupUpdateError } = await params.admin
      .from("tenant_saved_payment_method_setups")
      .update({
        setup_status: "pending_customer_action",
        stripe_checkout_session_id: checkoutSessionId,
        stripe_customer_id: stripeCustomerId,
        updated_at: now,
      })
      .eq("id", setupId);

    if (setupUpdateError) {
      throw new Error(
        `Failed to update setup row with checkout session id: ${setupUpdateError.message ?? "unknown error"}`,
      );
    }

    return {
      setupId,
      checkoutSessionId,
      checkoutSessionUrl,
      tenantStripeCustomerId,
      stripeCustomerId,
    };
  } catch (error) {
    const now = nowIso();
    await params.admin
      .from("tenant_saved_payment_method_setups")
      .update({
        setup_status: "failed",
        failure_code: "checkout_session_create_failed",
        failure_message: error instanceof Error ? error.message : "unknown error",
        failed_at: now,
        updated_at: now,
      })
      .eq("id", setupId);

    throw error;
  }
}

async function insertStripeEventReceipt(params: {
  admin: any;
  accountOwnerUserId: string;
  customerId: string;
  connectedAccountId: string;
  eventId: string;
  eventType: string;
  objectId: string | null;
  processingScope: "setup" | "payment_method" | "saved_method_attempt";
  relatedTableName: string | null;
  relatedRowId: string | null;
  livemode: boolean;
  apiVersion: string | null;
}) {
  const payload = {
    account_owner_user_id: params.accountOwnerUserId,
    customer_id: params.customerId || null,
    stripe_connected_account_id: params.connectedAccountId,
    stripe_event_id: params.eventId,
    stripe_event_type: params.eventType,
    stripe_object_id: params.objectId,
    processing_scope: params.processingScope,
    receipt_status: "received",
    related_table_name: params.relatedTableName,
    related_row_id: params.relatedRowId,
    livemode: params.livemode,
    api_version: params.apiVersion,
    first_received_at: nowIso(),
    created_at: nowIso(),
  };

  const { data, error } = await params.admin
    .from("tenant_stripe_event_receipts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (looksLikeUniqueConflict(error)) {
      return {
        ok: false as const,
        duplicate: true as const,
      };
    }

    throw new Error(
      `Failed to insert Stripe event receipt: ${error.message ?? "unknown error"}`,
    );
  }

  return {
    ok: true as const,
    receiptId: toCleanString(data?.id),
  };
}

async function updateStripeEventReceiptStatus(params: {
  admin: any;
  receiptId: string;
  status: "processed" | "ignored" | "failed";
  failureMessage?: string | null;
  relatedTableName?: string | null;
  relatedRowId?: string | null;
}) {
  const patch: Record<string, unknown> = {
    receipt_status: params.status,
    processed_at: nowIso(),
  };

  const failureMessage = toCleanString(params.failureMessage);
  if (failureMessage) {
    patch.failure_message = failureMessage;
  }

  if (toCleanString(params.relatedTableName)) {
    patch.related_table_name = toCleanString(params.relatedTableName);
  }

  if (toCleanString(params.relatedRowId)) {
    patch.related_row_id = toCleanString(params.relatedRowId);
  }

  const { error } = await params.admin
    .from("tenant_stripe_event_receipts")
    .update(patch)
    .eq("id", params.receiptId);

  if (error) {
    throw new Error(
      `Failed to update Stripe event receipt status: ${error.message ?? "unknown error"}`,
    );
  }
}

export async function recordTenantSavedPaymentMethodSetupFromCheckoutSession(params: {
  session: Stripe.Checkout.Session;
  eventId: string;
  connectedAccountId?: string | null;
  admin?: any;
  stripe?: Stripe;
  eventType?: string | null;
  livemode?: boolean;
  apiVersion?: string | null;
}): Promise<{
  recorded: boolean;
  setupId?: string;
  paymentMethodId?: string;
  reason?: string;
}> {
  const admin = params.admin;
  if (!admin) {
    throw new Error("admin client is required for saved payment method setup webhook handling.");
  }

  const session = params.session;
  const eventId = toCleanString(params.eventId);
  const eventType = toCleanString(params.eventType) || "checkout.session.completed";
  const connectedAccountId = toCleanString(params.connectedAccountId);

  if (!eventId) {
    return {
      recorded: false,
      reason: "Missing event id.",
    };
  }

  if (toCleanString(session.mode).toLowerCase() !== "setup") {
    return {
      recorded: false,
      reason: "Checkout session is not setup mode.",
    };
  }

  const metadata = session.metadata ?? {};
  const setupId = toCleanString(metadata.setup_id);
  const accountOwnerUserId = toCleanString(metadata.account_owner_user_id);
  const customerId = toCleanString(metadata.customer_id);

  if (!setupId || !accountOwnerUserId || !customerId || !connectedAccountId) {
    return {
      recorded: false,
      reason: "Missing setup metadata or connected account context.",
    };
  }

  const receiptInsert = await insertStripeEventReceipt({
    admin,
    accountOwnerUserId,
    customerId,
    connectedAccountId,
    eventId,
    eventType,
    objectId: toCleanString(session.id) || null,
    processingScope: "setup",
    relatedTableName: "tenant_saved_payment_method_setups",
    relatedRowId: setupId,
    livemode: Boolean(params.livemode),
    apiVersion: toCleanString(params.apiVersion) || null,
  });

  if (!receiptInsert.ok) {
    return {
      recorded: false,
      reason: "Event already recorded (idempotency check).",
    };
  }

  const receiptId = receiptInsert.receiptId;

  try {
    const { data: setupRow, error: setupLoadError } = await admin
      .from("tenant_saved_payment_method_setups")
      .select(
        [
          "id",
          "account_owner_user_id",
          "customer_id",
          "tenant_stripe_customer_id",
          "stripe_connected_account_id",
          "stripe_customer_id",
          "setup_status",
        ].join(", "),
      )
      .eq("id", setupId)
      .maybeSingle();

    if (setupLoadError) {
      throw new Error(
        `Failed to load saved payment method setup row: ${setupLoadError.message ?? "unknown error"}`,
      );
    }

    if (!setupRow?.id) {
      await updateStripeEventReceiptStatus({
        admin,
        receiptId,
        status: "ignored",
        failureMessage: "Setup row not found.",
      });

      return {
        recorded: false,
        reason: "Setup row not found.",
      };
    }

    const expectedConnectedAccountId = toCleanString(setupRow.stripe_connected_account_id);
    if (!expectedConnectedAccountId || expectedConnectedAccountId !== connectedAccountId) {
      await updateStripeEventReceiptStatus({
        admin,
        receiptId,
        status: "ignored",
        failureMessage: "Connected account mismatch.",
      });

      return {
        recorded: false,
        reason: "Connected account mismatch.",
      };
    }

    const stripe = params.stripe ?? getStripeServerClient();
    const stripeCustomerId =
      (typeof session.customer === "string" ? toCleanString(session.customer) : "")
      || toCleanString(setupRow.stripe_customer_id);

    if (!stripeCustomerId) {
      throw new Error("Missing Stripe customer id on setup completion.");
    }

    const setupIntentId =
      typeof session.setup_intent === "string"
        ? toCleanString(session.setup_intent)
        : toCleanString((session.setup_intent as { id?: string } | null)?.id);

    if (!setupIntentId) {
      throw new Error("Missing Stripe setup_intent id on setup completion.");
    }

    const setupIntent = await stripe.setupIntents.retrieve(
      setupIntentId,
      {
        expand: ["payment_method"],
      },
      {
        stripeAccount: connectedAccountId,
      },
    );

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? toCleanString(setupIntent.payment_method)
        : toCleanString(setupIntent.payment_method?.id);

    if (!paymentMethodId) {
      const now = nowIso();
      await admin
        .from("tenant_saved_payment_method_setups")
        .update({
          setup_status: "processing",
          requires_action_type: "missing_payment_method",
          stripe_setup_intent_id: setupIntentId,
          stripe_customer_id: stripeCustomerId,
          stripe_checkout_session_id: toCleanString(session.id) || null,
          stripe_last_event_id: eventId,
          last_event_received_at: now,
          updated_at: now,
        })
        .eq("id", setupId);

      await updateStripeEventReceiptStatus({
        admin,
        receiptId,
        status: "ignored",
        failureMessage: "Setup completed without payment method id.",
      });

      return {
        recorded: false,
        reason: "Setup completed without payment method id.",
      };
    }

    const paymentMethodObj =
      typeof setupIntent.payment_method === "string"
        ? null
        : setupIntent.payment_method;

    const tenantStripeCustomer = await ensureTenantStripeCustomerReference({
      admin,
      stripe,
      accountOwnerUserId,
      customerId,
      connectedAccountId,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      createdByUserId: null,
    });

    const tenantStripeCustomerId = tenantStripeCustomer.tenantStripeCustomerId;

    const { data: existingMethodRows, error: existingMethodError } = await admin
      .from("tenant_customer_payment_methods")
      .select("id, is_default, attached_at")
      .eq("stripe_connected_account_id", connectedAccountId)
      .eq("stripe_payment_method_id", paymentMethodId)
      .limit(1);

    if (existingMethodError) {
      throw new Error(
        `Failed to load existing payment method row: ${existingMethodError.message ?? "unknown error"}`,
      );
    }

    const existingMethod = Array.isArray(existingMethodRows) ? existingMethodRows[0] : null;

    let shouldBeDefault = Boolean(existingMethod?.is_default);
    if (!existingMethod) {
      const { data: defaultRows, error: defaultError } = await admin
        .from("tenant_customer_payment_methods")
        .select("id")
        .eq("tenant_stripe_customer_id", tenantStripeCustomerId)
        .eq("payment_method_status", "active")
        .eq("is_default", true)
        .limit(1);

      if (defaultError) {
        throw new Error(
          `Failed to resolve existing default payment method: ${defaultError.message ?? "unknown error"}`,
        );
      }

      shouldBeDefault = !(Array.isArray(defaultRows) && defaultRows.length > 0);
    }

    const card = paymentMethodObj?.type === "card" ? paymentMethodObj.card : null;
    const now = nowIso();

    const paymentMethodPayload = {
      account_owner_user_id: accountOwnerUserId,
      tenant_stripe_customer_id: tenantStripeCustomerId,
      customer_id: customerId,
      stripe_connected_account_id: connectedAccountId,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: paymentMethodId,
      payment_method_type: paymentMethodObj?.type || "unknown",
      payment_method_status: "active",
      is_default: shouldBeDefault,
      display_brand: formatDisplayBrand(card?.brand),
      display_last4: toCleanString(card?.last4) || null,
      display_exp_month: Number.isInteger(card?.exp_month) ? Number(card?.exp_month) : null,
      display_exp_year: Number.isInteger(card?.exp_year) ? Number(card?.exp_year) : null,
      display_funding: toCleanString(card?.funding) || null,
      display_wallet_type: formatDisplayWalletType(card?.wallet?.type),
      attached_at: toCleanString(existingMethod?.attached_at) || now,
      detached_at: null,
      invalidated_at: null,
      last_verified_at: now,
      stale_reason_code: null,
      stale_reason_detail: null,
      updated_at: now,
      updated_by_user_id: null,
    };

    if (!existingMethod) {
      (paymentMethodPayload as Record<string, unknown>).created_at = now;
      (paymentMethodPayload as Record<string, unknown>).created_by_user_id = null;
    }

    const { data: upsertedMethod, error: upsertMethodError } = await admin
      .from("tenant_customer_payment_methods")
      .upsert(paymentMethodPayload, {
        onConflict: "stripe_connected_account_id,stripe_payment_method_id",
      })
      .select("id")
      .single();

    if (upsertMethodError) {
      throw new Error(
        `Failed to upsert tenant customer payment method row: ${upsertMethodError.message ?? "unknown error"}`,
      );
    }

    const tenantCustomerPaymentMethodId = toCleanString(upsertedMethod?.id);
    if (!tenantCustomerPaymentMethodId) {
      throw new Error("Payment method upsert returned an empty id.");
    }

    const { error: setupUpdateError } = await admin
      .from("tenant_saved_payment_method_setups")
      .update({
        setup_status: "succeeded",
        tenant_stripe_customer_id: tenantStripeCustomerId,
        tenant_customer_payment_method_id: tenantCustomerPaymentMethodId,
        stripe_customer_id: stripeCustomerId,
        stripe_setup_intent_id: setupIntentId,
        stripe_checkout_session_id: toCleanString(session.id) || null,
        stripe_payment_method_id: paymentMethodId,
        stripe_last_event_id: eventId,
        last_event_received_at: now,
        succeeded_at: now,
        failed_at: null,
        failure_code: null,
        failure_message: null,
        updated_at: now,
      })
      .eq("id", setupId);

    if (setupUpdateError) {
      throw new Error(
        `Failed to update setup row as succeeded: ${setupUpdateError.message ?? "unknown error"}`,
      );
    }

    await updateStripeEventReceiptStatus({
      admin,
      receiptId,
      status: "processed",
      relatedTableName: "tenant_saved_payment_method_setups",
      relatedRowId: setupId,
    });

    return {
      recorded: true,
      setupId,
      paymentMethodId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    await updateStripeEventReceiptStatus({
      admin,
      receiptId,
      status: "failed",
      failureMessage: message,
      relatedTableName: "tenant_saved_payment_method_setups",
      relatedRowId: setupId,
    });

    const now = nowIso();
    await admin
      .from("tenant_saved_payment_method_setups")
      .update({
        setup_status: "failed",
        failure_code: "checkout_setup_processing_failed",
        failure_message: message,
        failed_at: now,
        stripe_last_event_id: eventId,
        last_event_received_at: now,
        updated_at: now,
      })
      .eq("id", setupId);

    throw error;
  }
}
