import type Stripe from "stripe";
import { runScheduledAutopayEligibilityDryRun } from "@/lib/business/scheduled-autopay-eligibility";
import { buildScheduledAutopayIdempotencyKey } from "@/lib/business/scheduled-autopay-attempt-creation";
import { submitScheduledAutopayAttempts } from "@/lib/business/scheduled-autopay-attempt-submission";

type RetryOutcome =
  | "submitted"
  | "failed_declined"
  | "failed_requires_action"
  | "blocked_precondition"
  | "not_found"
  | "not_retryable";

type RetryAttemptRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  billing_period_id: string | null;
  maintenance_agreement_id: string | null;
  tenant_stripe_customer_id: string | null;
  tenant_customer_payment_method_id: string | null;
  tenant_customer_autopay_consent_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_customer_id_snapshot: string | null;
  stripe_payment_method_id_snapshot: string | null;
  attempt_kind: string | null;
  attempt_status: string | null;
  blocked_reason_code: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requires_action_type: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  amount_cents_snapshot: number | null;
  invoice_balance_due_cents_snapshot: number | null;
  invoice_status_snapshot: string | null;
  billing_period_status_snapshot: string | null;
  consent_status_snapshot: string | null;
  payment_method_status_snapshot: string | null;
  stripe_idempotency_key: string | null;
  resolved_internal_invoice_payment_id: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function toPositiveInt(value: unknown) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return normalized > 0 ? Math.floor(normalized) : 0;
}

function buildRetryCycleKey(originalAttemptId: string) {
  return `manual_retry:${clean(originalAttemptId)}`;
}

async function loadRetryableAttempt(params: {
  admin: any;
  accountOwnerUserId: string;
  failedAttemptId: string;
}) {
  const { data, error } = await params.admin
    .from("tenant_saved_method_payment_attempts")
    .select(
      [
        "id",
        "account_owner_user_id",
        "customer_id",
        "invoice_id",
        "billing_period_id",
        "maintenance_agreement_id",
        "tenant_stripe_customer_id",
        "tenant_customer_payment_method_id",
        "tenant_customer_autopay_consent_id",
        "stripe_connected_account_id",
        "stripe_customer_id_snapshot",
        "stripe_payment_method_id_snapshot",
        "attempt_kind",
        "attempt_status",
        "blocked_reason_code",
        "failure_code",
        "failure_message",
        "requires_action_type",
        "retry_count",
        "next_retry_at",
        "amount_cents_snapshot",
        "invoice_balance_due_cents_snapshot",
        "invoice_status_snapshot",
        "billing_period_status_snapshot",
        "consent_status_snapshot",
        "payment_method_status_snapshot",
        "stripe_idempotency_key",
        "resolved_internal_invoice_payment_id",
      ].join(", "),
    )
    .eq("account_owner_user_id", clean(params.accountOwnerUserId))
    .eq("id", clean(params.failedAttemptId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load failed autopay attempt for retry: ${error.message ?? "unknown error"}`,
    );
  }

  return data ? (data as RetryAttemptRow) : null;
}

function isRetryableOriginalStatus(status: string) {
  return status === "failed_declined" || status === "failed_requires_action" || status === "blocked_precondition";
}

function buildRetryBlockedResult(params: {
  failedAttemptId: string;
  invoiceId: string | null;
  blockedReason: string;
}): FailedAutopayManualRetryResult {
  return {
    retryAttemptId: null,
    originalAttemptId: clean(params.failedAttemptId) || null,
    invoiceId: clean(params.invoiceId) || null,
    outcome: "blocked_precondition",
    stripePaymentIntentId: null,
    blockedReason: clean(params.blockedReason) || "blocked_precondition",
    noDirectPaymentRowWrites: true,
    noDirectAllocationRowWrites: true,
    noInvoicePaidMutations: true,
    noVisitOrNextDueMutations: true,
  };
}

export type FailedAutopayManualRetryResult = {
  retryAttemptId: string | null;
  originalAttemptId: string | null;
  invoiceId: string | null;
  outcome: RetryOutcome;
  stripePaymentIntentId: string | null;
  blockedReason: string | null;
  noDirectPaymentRowWrites: true;
  noDirectAllocationRowWrites: true;
  noInvoicePaidMutations: true;
  noVisitOrNextDueMutations: true;
};

export async function retryFailedScheduledAutopayAttemptManually(params: {
  admin: any;
  stripe?: Stripe;
  accountOwnerUserId: string;
  failedAttemptId: string;
  actorUserId: string;
  retryReason?: string | null;
}): Promise<FailedAutopayManualRetryResult> {
  const admin = params.admin;
  const stripe = params.stripe;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const failedAttemptId = clean(params.failedAttemptId);
  const actorUserId = clean(params.actorUserId);
  const retryReason = clean(params.retryReason) || "manual_retry";

  if (!accountOwnerUserId || !failedAttemptId || !actorUserId) {
    return buildRetryBlockedResult({
      failedAttemptId,
      invoiceId: null,
      blockedReason: "missing_required_inputs",
    });
  }

  const originalAttempt = await loadRetryableAttempt({
    admin,
    accountOwnerUserId,
    failedAttemptId,
  });

  if (!originalAttempt?.id) {
    return buildRetryBlockedResult({
      failedAttemptId,
      invoiceId: null,
      blockedReason: "attempt_not_found",
    });
  }

  const originalAttemptStatus = clean(originalAttempt.attempt_status).toLowerCase();
  const invoiceId = clean(originalAttempt.invoice_id) || null;

  if (!isRetryableOriginalStatus(originalAttemptStatus)) {
    return buildRetryBlockedResult({
      failedAttemptId: originalAttempt.id,
      invoiceId,
      blockedReason: "attempt_status_not_retryable",
    });
  }

  if (clean(originalAttempt.resolved_internal_invoice_payment_id)) {
    return buildRetryBlockedResult({
      failedAttemptId: originalAttempt.id,
      invoiceId,
      blockedReason: "attempt_already_resolved",
    });
  }

  if (!invoiceId) {
    return buildRetryBlockedResult({
      failedAttemptId: originalAttempt.id,
      invoiceId: null,
      blockedReason: "invoice_missing",
    });
  }

  const evaluatedAt = nowIso();
  const eligibility = await runScheduledAutopayEligibilityDryRun({
    accountOwnerUserId,
    supabase: admin,
    evaluatedAt,
    candidateInvoiceIds: [invoiceId],
  });

  const refreshed = Array.isArray(eligibility.invoicesEvaluated)
    ? eligibility.invoicesEvaluated[0] ?? null
    : null;

  if (!refreshed || refreshed.invoiceId !== invoiceId || refreshed.eligibility !== "eligible") {
    const blockedReason = refreshed?.blockedReasonCodes?.[0] ?? "retry_not_currently_eligible";
    return buildRetryBlockedResult({
      failedAttemptId: originalAttempt.id,
      invoiceId,
      blockedReason,
    });
  }

  const snapshot = refreshed.snapshots;
  const retryCount = toPositiveInt(originalAttempt.retry_count) + 1;
  const retryAttemptId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stripeIdempotencyKey = buildScheduledAutopayIdempotencyKey({
    accountOwnerUserId,
    invoiceId,
    cycleKey: buildRetryCycleKey(originalAttempt.id),
    ordinal: retryCount,
  });
  const createdAt = nowIso();

  const attemptInsertPayload = {
    id: retryAttemptId,
    account_owner_user_id: accountOwnerUserId,
    customer_id: clean(refreshed.customerId) || null,
    invoice_id: invoiceId,
    billing_period_id: clean(snapshot.billingContext.billingPeriodId) || null,
    maintenance_agreement_id: clean(snapshot.billingContext.maintenanceAgreementId) || null,
    tenant_stripe_customer_id: clean(snapshot.paymentProfileReadiness.profileId) || null,
    tenant_customer_payment_method_id: clean(snapshot.savedPaymentMethodReadiness.methodId) || null,
    tenant_customer_autopay_consent_id: clean(snapshot.consentReadiness.consentId) || null,
    stripe_connected_account_id: clean(snapshot.connectedAccountReadiness.connectedAccountId) || "",
    stripe_customer_id_snapshot: clean(snapshot.paymentProfileReadiness.stripeCustomerId) || null,
    stripe_payment_method_id_snapshot: clean(snapshot.savedPaymentMethodReadiness.stripePaymentMethodId) || null,
    attempt_kind: "scheduled_autopay",
    attempt_status: "pending",
    amount_cents_snapshot: Number(snapshot.invoice.proposedAmountCents ?? 0) || 0,
    currency_code_snapshot: "usd",
    invoice_balance_due_cents_snapshot: Number(snapshot.invoice.balanceDueCents ?? 0) || 0,
    invoice_status_snapshot: clean(snapshot.invoice.status) || "issued",
    billing_period_status_snapshot: clean(snapshot.billingContext.billingPeriodStatus) || null,
    consent_status_snapshot: clean(snapshot.consentReadiness.consentStatus) || null,
    payment_method_status_snapshot: clean(snapshot.savedPaymentMethodReadiness.methodStatus) || null,
    retry_count: retryCount,
    blocked_reason_code: null,
    failure_code: null,
    failure_message: null,
    requires_action_type: null,
    stripe_idempotency_key: stripeIdempotencyKey,
    triggered_by: "internal_user",
    triggered_by_user_id: actorUserId,
    submitted_at: null,
    resolved_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { error: insertErr } = await admin
    .from("tenant_saved_method_payment_attempts")
    .insert(attemptInsertPayload);

  if (insertErr) {
    if (clean((insertErr as { code?: unknown } | null)?.code) === "23505" || clean((insertErr as { message?: unknown } | null)?.message).toLowerCase().includes("unique")) {
      return buildRetryBlockedResult({
        failedAttemptId: originalAttempt.id,
        invoiceId,
        blockedReason: "duplicate_inflight_attempt",
      });
    }

    throw new Error(
      `Failed to create manual retry attempt row: ${insertErr.message ?? "unknown error"}`,
    );
  }

  const submitResult = await submitScheduledAutopayAttempts({
    admin,
    stripe,
    accountOwnerUserId,
    attemptId: retryAttemptId,
  });

  const firstResult = submitResult.results[0] ?? null;
  const outcome = (firstResult?.outcome ?? "blocked_precondition") as RetryOutcome;

  return {
    retryAttemptId,
    originalAttemptId: originalAttempt.id,
    invoiceId,
    outcome,
    stripePaymentIntentId: firstResult?.stripePaymentIntentId ?? null,
    blockedReason: firstResult?.blockedReasonCodes?.[0] ?? null,
    noDirectPaymentRowWrites: true,
    noDirectAllocationRowWrites: true,
    noInvoicePaidMutations: true,
    noVisitOrNextDueMutations: true,
  };
}
