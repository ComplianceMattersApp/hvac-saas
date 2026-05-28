import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function isUniqueConflict(error: unknown) {
  const code = clean((error as { code?: unknown } | null)?.code);
  if (code === "23505") return true;
  const message = clean((error as { message?: unknown } | null)?.message).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

function mapAttemptFailureStatus(params: {
  failureCode?: string | null;
  failureMessage?: string | null;
  paymentIntentStatus?: string | null;
}) {
  const code = clean(params.failureCode).toLowerCase();
  const message = clean(params.failureMessage).toLowerCase();
  const intentStatus = clean(params.paymentIntentStatus).toLowerCase();

  if (intentStatus === "requires_action") {
    return "failed_requires_action" as const;
  }

  if (
    code.includes("authentication")
    || code.includes("requires_action")
    || message.includes("authentication")
    || message.includes("requires action")
  ) {
    return "failed_requires_action" as const;
  }

  return "failed_declined" as const;
}

export type ManualChargeAttemptResult = {
  ok: boolean;
  blockedReason?: string;
  attemptId?: string;
  attemptStatus?:
    | "pending"
    | "submitted"
    | "succeeded"
    | "failed_declined"
    | "failed_requires_action"
    | "blocked_precondition";
  stripePaymentIntentId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
};

type SavedMethodAttemptSubmitParams = {
  admin: any;
  stripe: Stripe;
  accountOwnerUserId: string;
  customerId: string;
  invoiceId: string;
  attemptId: string;
  attemptKind: "manual_saved_method" | "scheduled_autopay";
  amountCents: number;
  connectedAccountId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  stripeIdempotencyKey: string;
  billingPeriodId?: string | null;
  maintenanceAgreementId?: string | null;
};

export async function submitSavedMethodAttemptThroughStripe(
  params: SavedMethodAttemptSubmitParams,
): Promise<ManualChargeAttemptResult> {
  const admin = params.admin;
  const stripe = params.stripe;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  const invoiceId = clean(params.invoiceId);
  const attemptId = clean(params.attemptId);
  const attemptKind = clean(params.attemptKind) === "scheduled_autopay" ? "scheduled_autopay" : "manual_saved_method";
  const amountCents = Number(params.amountCents ?? 0) || 0;
  const connectedAccountId = clean(params.connectedAccountId);
  const stripeCustomerId = clean(params.stripeCustomerId);
  const stripePaymentMethodId = clean(params.stripePaymentMethodId);
  const stripeIdempotencyKey = clean(params.stripeIdempotencyKey);
  const billingPeriodId = clean(params.billingPeriodId) || "";
  const maintenanceAgreementId = clean(params.maintenanceAgreementId) || "";

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          account_owner_user_id: accountOwnerUserId,
          customer_id: customerId,
          invoice_id: invoiceId,
          attempt_id: attemptId,
          attempt_kind: attemptKind,
          billing_period_id: billingPeriodId,
          maintenance_agreement_id: maintenanceAgreementId,
        },
      },
      {
        stripeAccount: connectedAccountId,
        idempotencyKey: stripeIdempotencyKey,
      },
    );

    const paymentIntentId = clean(paymentIntent.id);
    const intentStatus = clean(paymentIntent.status).toLowerCase();
    const paymentError = paymentIntent.last_payment_error ?? null;
    const failedStatus = mapAttemptFailureStatus({
      paymentIntentStatus: intentStatus,
      failureCode: clean(paymentError?.code),
      failureMessage: clean(paymentError?.message),
    });

    let attemptStatus: "submitted" | "failed_declined" | "failed_requires_action" = "submitted";
    const submittedAt: string | null = nowIso();
    let resolvedAt: string | null = null;
    let failureCode: string | null = null;
    let failureMessage: string | null = null;

    if (intentStatus === "succeeded") {
      // Keep success provisional until webhook persists payment truth and links the attempt.
      attemptStatus = "submitted";
      resolvedAt = null;
    } else if (intentStatus === "requires_action" || intentStatus === "requires_payment_method") {
      attemptStatus = failedStatus;
      resolvedAt = nowIso();
      failureCode = clean(paymentError?.code) || intentStatus;
      failureMessage =
        clean(paymentError?.message)
        || "Stripe requires customer action before this saved-card charge can complete.";
    } else if (intentStatus === "canceled") {
      attemptStatus = failedStatus;
      resolvedAt = nowIso();
      failureCode = clean(paymentError?.code) || "payment_intent_canceled";
      failureMessage =
        clean(paymentError?.message) || "Stripe canceled the saved-card charge attempt.";
    }

    const { error: attemptUpdateErr } = await admin
      .from("tenant_saved_method_payment_attempts")
      .update({
        attempt_status: attemptStatus,
        stripe_payment_intent_id: paymentIntentId || null,
        submitted_at: submittedAt,
        resolved_at: resolvedAt,
        failure_code: failureCode,
        failure_message: failureMessage,
        updated_at: nowIso(),
      })
      .eq("id", attemptId);

    if (attemptUpdateErr) {
      throw new Error(
        `Failed to update saved-method payment attempt row after Stripe submit: ${attemptUpdateErr.message ?? "unknown error"}`,
      );
    }

    return {
      ok: true,
      attemptId,
      attemptStatus,
      stripePaymentIntentId: paymentIntentId || null,
      failureCode,
      failureMessage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    await admin
      .from("tenant_saved_method_payment_attempts")
      .update({
        attempt_status: "failed_declined",
        failure_code: "stripe_payment_intent_submit_failed",
        failure_message: message,
        resolved_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", attemptId);

    return {
      ok: true,
      attemptId,
      attemptStatus: "failed_declined",
      stripePaymentIntentId: null,
      failureCode: "stripe_payment_intent_submit_failed",
      failureMessage: message,
    };
  }
}

type StartManualSavedMethodAttemptParams = {
  admin: any;
  stripe?: Stripe;
  accountOwnerUserId: string;
  customerId: string;
  invoiceId: string;
  triggeredByUserId: string;
  selectedTenantCustomerPaymentMethodId?: string | null;
};

export async function startManualSavedMethodPaymentAttempt(
  params: StartManualSavedMethodAttemptParams,
): Promise<ManualChargeAttemptResult> {
  const admin = params.admin;
  const stripe = params.stripe ?? getStripeServerClient();
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  const invoiceId = clean(params.invoiceId);
  const triggeredByUserId = clean(params.triggeredByUserId);
  const selectedMethodId = clean(params.selectedTenantCustomerPaymentMethodId) || null;

  if (!accountOwnerUserId || !customerId || !invoiceId || !triggeredByUserId) {
    return { ok: false, blockedReason: "missing_required_inputs" };
  }

  const { data: invoice, error: invoiceErr } = await admin
    .from("internal_invoices")
    .select("id, account_owner_user_id, customer_id, status")
    .eq("id", invoiceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(
      `Failed to load invoice for saved-method manual charge: ${invoiceErr.message ?? "unknown error"}`,
    );
  }

  if (!invoice?.id) {
    return { ok: false, blockedReason: "invoice_not_found" };
  }

  if (clean(invoice.customer_id) !== customerId) {
    return { ok: false, blockedReason: "invoice_customer_mismatch" };
  }

  const invoiceStatus = clean(invoice.status).toLowerCase();
  if (invoiceStatus !== "issued") {
    return { ok: false, blockedReason: "invoice_not_issued" };
  }

  const summary = await resolveInvoiceCollectedPaymentSummary(
    accountOwnerUserId,
    invoiceId,
    admin,
  );

  if (summary.balanceDueCents <= 0) {
    return { ok: false, blockedReason: "invoice_no_balance_due" };
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  const connectedAccountId = clean(readiness.connectedAccountId);
  if (!readiness.isReady || !connectedAccountId) {
    return { ok: false, blockedReason: "connect_not_ready" };
  }

  const { data: stripeCustomerRows, error: stripeCustomerErr } = await admin
    .from("tenant_stripe_customers")
    .select("id, stripe_connected_account_id, stripe_customer_id, profile_status, is_current")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("stripe_connected_account_id", connectedAccountId)
    .eq("is_current", true)
    .eq("profile_status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (stripeCustomerErr) {
    throw new Error(
      `Failed to resolve tenant Stripe customer for manual saved-method charge: ${stripeCustomerErr.message ?? "unknown error"}`,
    );
  }

  const tenantStripeCustomer = Array.isArray(stripeCustomerRows) ? stripeCustomerRows[0] : null;
  const tenantStripeCustomerId = clean(tenantStripeCustomer?.id);
  const stripeCustomerId = clean(tenantStripeCustomer?.stripe_customer_id);

  if (!tenantStripeCustomerId || !stripeCustomerId) {
    return { ok: false, blockedReason: "missing_active_tenant_stripe_customer" };
  }

  let methodQuery = admin
    .from("tenant_customer_payment_methods")
    .select(
      [
        "id",
        "tenant_stripe_customer_id",
        "stripe_connected_account_id",
        "stripe_customer_id",
        "stripe_payment_method_id",
        "payment_method_status",
        "is_default",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("stripe_connected_account_id", connectedAccountId)
    .eq("payment_method_status", "active");

  if (selectedMethodId) {
    methodQuery = methodQuery.eq("id", selectedMethodId);
  } else {
    methodQuery = methodQuery.order("is_default", { ascending: false }).order("updated_at", { ascending: false });
  }

  const { data: methodRows, error: methodErr } = await methodQuery.limit(1);

  if (methodErr) {
    throw new Error(
      `Failed to resolve active saved method for manual saved-method charge: ${methodErr.message ?? "unknown error"}`,
    );
  }

  const method = Array.isArray(methodRows) ? methodRows[0] : null;
  const tenantCustomerPaymentMethodId = clean(method?.id);
  const stripePaymentMethodId = clean(method?.stripe_payment_method_id);

  if (!tenantCustomerPaymentMethodId || !stripePaymentMethodId) {
    return { ok: false, blockedReason: "missing_active_saved_payment_method" };
  }

  if (clean(method?.tenant_stripe_customer_id) !== tenantStripeCustomerId) {
    return { ok: false, blockedReason: "saved_payment_method_customer_profile_mismatch" };
  }

  if (clean(method?.stripe_customer_id) !== stripeCustomerId) {
    return { ok: false, blockedReason: "saved_payment_method_stripe_customer_mismatch" };
  }

  const { data: setupRows, error: setupErr } = await admin
    .from("tenant_saved_payment_method_setups")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("tenant_stripe_customer_id", tenantStripeCustomerId)
    .eq("tenant_customer_payment_method_id", tenantCustomerPaymentMethodId)
    .eq("stripe_connected_account_id", connectedAccountId)
    .eq("setup_status", "succeeded")
    .order("succeeded_at", { ascending: false })
    .limit(1);

  if (setupErr) {
    throw new Error(
      `Failed to verify saved-method setup authorization: ${setupErr.message ?? "unknown error"}`,
    );
  }

  const setupAuthorized = Boolean(Array.isArray(setupRows) && setupRows[0]?.id);
  if (!setupAuthorized) {
    return { ok: false, blockedReason: "missing_saved_method_reuse_authorization" };
  }

  const { data: inflightRows, error: inflightErr } = await admin
    .from("tenant_saved_method_payment_attempts")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("invoice_id", invoiceId)
    .eq("attempt_kind", "manual_saved_method")
    .in("attempt_status", ["pending", "submitted", "retry_scheduled"])
    .limit(1);

  if (inflightErr) {
    throw new Error(
      `Failed to check in-flight manual saved-method attempts: ${inflightErr.message ?? "unknown error"}`,
    );
  }

  if (Array.isArray(inflightRows) && inflightRows[0]?.id) {
    return { ok: false, blockedReason: "duplicate_inflight_attempt" };
  }

  const { data: billingPeriodRows, error: billingPeriodErr } = await admin
    .from("maintenance_agreement_billing_periods")
    .select("id, maintenance_agreement_id, billing_period_status")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("internal_invoice_id", invoiceId)
    .limit(1);

  if (billingPeriodErr) {
    throw new Error(
      `Failed to resolve billing period snapshot for manual saved-method charge: ${billingPeriodErr.message ?? "unknown error"}`,
    );
  }

  const billingPeriod = Array.isArray(billingPeriodRows) ? billingPeriodRows[0] : null;

  const attemptId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stripeIdempotencyKey = `manual_saved_method:${accountOwnerUserId}:${invoiceId}:${attemptId}`;
  const createdAt = nowIso();

  const attemptInsertPayload = {
    id: attemptId,
    account_owner_user_id: accountOwnerUserId,
    customer_id: customerId,
    invoice_id: invoiceId,
    billing_period_id: clean(billingPeriod?.id) || null,
    maintenance_agreement_id: clean(billingPeriod?.maintenance_agreement_id) || null,
    tenant_stripe_customer_id: tenantStripeCustomerId,
    tenant_customer_payment_method_id: tenantCustomerPaymentMethodId,
    tenant_customer_autopay_consent_id: null,
    stripe_connected_account_id: connectedAccountId,
    stripe_customer_id_snapshot: stripeCustomerId,
    stripe_payment_method_id_snapshot: stripePaymentMethodId,
    attempt_kind: "manual_saved_method",
    attempt_status: "pending",
    amount_cents_snapshot: summary.balanceDueCents,
    currency_code_snapshot: "usd",
    invoice_balance_due_cents_snapshot: summary.balanceDueCents,
    invoice_status_snapshot: invoiceStatus,
    billing_period_status_snapshot: clean(billingPeriod?.billing_period_status) || null,
    consent_status_snapshot: null,
    payment_method_status_snapshot: clean(method?.payment_method_status) || null,
    stripe_idempotency_key: stripeIdempotencyKey,
    triggered_by: "internal_user",
    triggered_by_user_id: triggeredByUserId,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { error: attemptInsertErr } = await admin
    .from("tenant_saved_method_payment_attempts")
    .insert(attemptInsertPayload);

  if (attemptInsertErr) {
    if (isUniqueConflict(attemptInsertErr)) {
      return {
        ok: false,
        blockedReason: "duplicate_inflight_attempt",
      };
    }
    throw new Error(
      `Failed to create manual saved-method payment attempt row: ${attemptInsertErr.message ?? "unknown error"}`,
    );
  }

  return submitSavedMethodAttemptThroughStripe({
    admin,
    stripe,
    accountOwnerUserId,
    customerId,
    invoiceId,
    attemptId,
    attemptKind: "manual_saved_method",
    amountCents: summary.balanceDueCents,
    connectedAccountId,
    stripeCustomerId,
    stripePaymentMethodId,
    stripeIdempotencyKey,
    billingPeriodId: clean(billingPeriod?.id) || null,
    maintenanceAgreementId: clean(billingPeriod?.maintenance_agreement_id) || null,
  });
}

export async function resolveManualSavedMethodAttemptFromWebhook(params: {
  admin: any;
  accountOwnerUserId: string;
  invoiceId: string;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeEventId?: string | null;
  attemptIdFromMetadata?: string | null;
  outcome: "succeeded" | "failed_declined" | "failed_requires_action";
  resolvedInternalInvoicePaymentId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  const admin = params.admin;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const invoiceId = clean(params.invoiceId);
  const paymentIntentId = clean(params.stripePaymentIntentId);
  const chargeId = clean(params.stripeChargeId);
  const eventId = clean(params.stripeEventId);
  const attemptId = clean(params.attemptIdFromMetadata);
  const resolvedPaymentId = clean(params.resolvedInternalInvoicePaymentId) || null;

  if (params.outcome === "succeeded" && !resolvedPaymentId) {
    return {
      matched: false as const,
      reason: "missing_resolved_internal_payment_id",
    };
  }

  if (!accountOwnerUserId || !invoiceId) return { matched: false as const };

  let query = admin
    .from("tenant_saved_method_payment_attempts")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("invoice_id", invoiceId)
    .eq("attempt_kind", "manual_saved_method");

  if (attemptId) {
    query = query.eq("id", attemptId);
  } else if (paymentIntentId) {
    query = query.eq("stripe_payment_intent_id", paymentIntentId).order("created_at", { ascending: false });
  } else {
    return { matched: false as const };
  }

  const { data: rows, error: attemptErr } = await query.limit(1);

  if (attemptErr) {
    throw new Error(
      `Failed to resolve manual saved-method attempt from webhook identity: ${attemptErr.message ?? "unknown error"}`,
    );
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  const matchedAttemptId = clean(row?.id);
  if (!matchedAttemptId) {
    return { matched: false as const };
  }

  const patch: Record<string, unknown> = {
    attempt_status: params.outcome,
    updated_at: nowIso(),
  };

  if (paymentIntentId) patch.stripe_payment_intent_id = paymentIntentId;
  if (chargeId) patch.stripe_charge_id = chargeId;
  if (eventId) patch.stripe_last_event_id = eventId;
  if (resolvedPaymentId) patch.resolved_internal_invoice_payment_id = resolvedPaymentId;
  if (params.outcome === "succeeded" || params.outcome.startsWith("failed_")) {
    patch.resolved_at = nowIso();
  }

  const failureCode = clean(params.failureCode);
  const failureMessage = clean(params.failureMessage);
  if (failureCode) patch.failure_code = failureCode;
  if (failureMessage) patch.failure_message = failureMessage;

  const { error: updateErr } = await admin
    .from("tenant_saved_method_payment_attempts")
    .update(patch)
    .eq("id", matchedAttemptId);

  if (updateErr) {
    throw new Error(
      `Failed to update manual saved-method attempt from webhook outcome: ${updateErr.message ?? "unknown error"}`,
    );
  }

  return {
    matched: true as const,
    attemptId: matchedAttemptId,
  };
}

export { mapAttemptFailureStatus };