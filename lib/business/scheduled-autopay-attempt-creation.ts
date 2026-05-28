import {
  runScheduledAutopayEligibilityDryRun,
  type ScheduledAutopayDryRunResult,
  type ScheduledAutopayEligibilityBlockedReason,
  type ScheduledAutopayInvoiceEligibilityResult,
} from "@/lib/business/scheduled-autopay-eligibility";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function makeUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isUniqueConflict(error: unknown) {
  const code = clean((error as { code?: unknown } | null)?.code);
  if (code === "23505") return true;
  const message = clean((error as { message?: unknown } | null)?.message).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

function mapReasonCounts(
  reasons: ScheduledAutopayEligibilityBlockedReason[],
  reasonCounts: Record<string, number>,
) {
  for (const reason of reasons) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
}

export type ScheduledAutopayAttemptCreateMode = "dry_run" | "commit";

export type ScheduledAutopayAttemptCreationResult = {
  accountOwnerUserId: string;
  evaluatedAt: string;
  mode: ScheduledAutopayAttemptCreateMode;
  cycleKey: string;
  noStripeSubmit: true;
  noPaymentRowWrites: true;
  noAllocationRowWrites: true;
  noInvoiceMutations: true;
  noVisitOrNextDueMutations: true;
  invoicesEvaluatedCount: number;
  eligibleConsideredCount: number;
  attemptsCreatedCount: number;
  skippedDuplicateOrInFlightCount: number;
  blockedOnRevalidationCount: number;
  createdAttemptIds: string[];
  skippedDuplicateOrInFlightInvoiceIds: string[];
  blockedOnRevalidation: Array<{
    invoiceId: string;
    blockedReasonCodes: ScheduledAutopayEligibilityBlockedReason[];
  }>;
};

function normalizeCycleKey(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 120) || "cycle";
}

function buildScheduledAutopayIdempotencyKey(params: {
  accountOwnerUserId: string;
  invoiceId: string;
  cycleKey: string;
  ordinal: number;
}) {
  return [
    "scheduled_autopay",
    clean(params.accountOwnerUserId),
    clean(params.invoiceId),
    normalizeCycleKey(clean(params.cycleKey)),
    String(params.ordinal),
  ].join(":");
}

type RevalidateDryRun = (params: {
  accountOwnerUserId: string;
  supabase: any;
  evaluatedAt: string;
  candidateInvoiceIds: string[];
}) => Promise<ScheduledAutopayDryRunResult>;

export async function createScheduledAutopayAttemptsFromEligibility(params: {
  admin: any;
  accountOwnerUserId: string;
  eligibilityDryRun: ScheduledAutopayDryRunResult;
  mode: ScheduledAutopayAttemptCreateMode;
  cycleKey?: string;
  triggeredByUserId?: string | null;
  revalidateDryRun?: RevalidateDryRun;
}): Promise<ScheduledAutopayAttemptCreationResult> {
  const admin = params.admin;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const evaluatedAt = clean(params.eligibilityDryRun.evaluatedAt) || nowIso();
  const mode = params.mode;
  const cycleKey = normalizeCycleKey(clean(params.cycleKey) || evaluatedAt);
  const triggeredByUserId = clean(params.triggeredByUserId) || null;
  const revalidateDryRun = params.revalidateDryRun ?? (runScheduledAutopayEligibilityDryRun as RevalidateDryRun);

  const eligibleInvoices = Array.isArray(params.eligibilityDryRun.eligibleInvoices)
    ? params.eligibilityDryRun.eligibleInvoices
    : [];

  const result: ScheduledAutopayAttemptCreationResult = {
    accountOwnerUserId,
    evaluatedAt,
    mode,
    cycleKey,
    noStripeSubmit: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
    invoicesEvaluatedCount: Number(params.eligibilityDryRun.invoicesEvaluatedCount ?? 0) || 0,
    eligibleConsideredCount: eligibleInvoices.length,
    attemptsCreatedCount: 0,
    skippedDuplicateOrInFlightCount: 0,
    blockedOnRevalidationCount: 0,
    createdAttemptIds: [],
    skippedDuplicateOrInFlightInvoiceIds: [],
    blockedOnRevalidation: [],
  };

  if (mode !== "commit") {
    return result;
  }

  for (const eligible of eligibleInvoices) {
    const invoiceId = clean(eligible.invoiceId);
    if (!invoiceId) {
      continue;
    }

    const revalidated = await revalidateDryRun({
      accountOwnerUserId,
      supabase: admin,
      evaluatedAt: nowIso(),
      candidateInvoiceIds: [invoiceId],
    });

    const refreshed = (Array.isArray(revalidated.invoicesEvaluated)
      ? revalidated.invoicesEvaluated[0]
      : null) as ScheduledAutopayInvoiceEligibilityResult | null;

    if (!refreshed || refreshed.eligibility !== "eligible") {
      const blockedReasonCodes = Array.isArray(refreshed?.blockedReasonCodes)
        ? refreshed!.blockedReasonCodes
        : (["unsupported_invoice_context"] as ScheduledAutopayEligibilityBlockedReason[]);
      result.blockedOnRevalidationCount += 1;
      result.blockedOnRevalidation.push({
        invoiceId,
        blockedReasonCodes,
      });
      continue;
    }

    const snapshot = refreshed.snapshots;
    const attemptId = makeUuid();
    const createdAt = nowIso();
    const idempotencyKey = buildScheduledAutopayIdempotencyKey({
      accountOwnerUserId,
      invoiceId,
      cycleKey,
      ordinal: 1,
    });

    const insertPayload = {
      id: attemptId,
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
      stripe_idempotency_key: idempotencyKey,
      triggered_by: "scheduler",
      triggered_by_user_id: triggeredByUserId,
      submitted_at: null,
      resolved_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    if (!insertPayload.stripe_connected_account_id || insertPayload.amount_cents_snapshot <= 0) {
      result.blockedOnRevalidationCount += 1;
      result.blockedOnRevalidation.push({
        invoiceId,
        blockedReasonCodes: ["unsupported_invoice_context"],
      });
      continue;
    }

    const { error } = await admin
      .from("tenant_saved_method_payment_attempts")
      .insert(insertPayload);

    if (error) {
      if (isUniqueConflict(error)) {
        result.skippedDuplicateOrInFlightCount += 1;
        result.skippedDuplicateOrInFlightInvoiceIds.push(invoiceId);
        continue;
      }

      throw new Error(
        `Failed to create scheduled autopay attempt row: ${clean((error as { message?: unknown })?.message) || "unknown error"}`,
      );
    }

    result.attemptsCreatedCount += 1;
    result.createdAttemptIds.push(attemptId);
  }

  return result;
}

export { buildScheduledAutopayIdempotencyKey };
