import type Stripe from "stripe";
import {
  runScheduledAutopayEligibilityDryRun,
  type ScheduledAutopayEligibilityBlockedReason,
  type ScheduledAutopayDryRunResult,
  type ScheduledAutopayInvoiceEligibilityResult,
} from "@/lib/business/scheduled-autopay-eligibility";
import {
  submitSavedMethodAttemptThroughStripe,
  type ManualChargeAttemptResult,
} from "@/lib/business/tenant-saved-method-payment-attempts";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

type ScheduledAttemptRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  billing_period_id: string | null;
  maintenance_agreement_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_customer_id_snapshot: string | null;
  stripe_payment_method_id_snapshot: string | null;
  amount_cents_snapshot: number | null;
  attempt_kind: string | null;
  attempt_status: string | null;
  stripe_idempotency_key: string | null;
  stripe_payment_intent_id: string | null;
};

type SubmitAttemptOutcome =
  | "submitted"
  | "already_submitted"
  | "terminal_noop"
  | "blocked_precondition"
  | "blocked_duplicate_inflight"
  | "not_found";

export type ScheduledAutopayAttemptSubmitItemResult = {
  attemptId: string;
  invoiceId: string | null;
  outcome: SubmitAttemptOutcome;
  attemptStatus: string | null;
  stripePaymentIntentId: string | null;
  blockedReasonCodes: string[];
  failureCode: string | null;
  failureMessage: string | null;
};

export type ScheduledAutopayAttemptSubmitResult = {
  accountOwnerUserId: string;
  evaluatedAt: string;
  attemptsRequestedCount: number;
  attemptsProcessedCount: number;
  submittedCount: number;
  alreadySubmittedCount: number;
  terminalNoopCount: number;
  blockedPreconditionCount: number;
  blockedDuplicateInFlightCount: number;
  notFoundCount: number;
  noDirectPaymentRowWrites: true;
  noDirectAllocationRowWrites: true;
  noInvoicePaidMutations: true;
  noVisitOrNextDueMutations: true;
  results: ScheduledAutopayAttemptSubmitItemResult[];
};

type RevalidateDryRun = (params: {
  accountOwnerUserId: string;
  supabase: any;
  evaluatedAt: string;
  candidateInvoiceIds: string[];
}) => Promise<ScheduledAutopayDryRunResult>;

const TERMINAL_ATTEMPT_STATUSES = new Set([
  "succeeded",
  "failed_declined",
  "failed_requires_action",
  "blocked_precondition",
]);

function normalizeAttemptIds(params: {
  attemptId?: string | null;
  attemptIds?: Array<string | null | undefined>;
}) {
  const fromList = Array.isArray(params.attemptIds) ? params.attemptIds : [];
  const fromSingle = clean(params.attemptId);
  const merged = fromSingle ? [fromSingle, ...fromList] : fromList;
  const ids = merged.map((value) => clean(value)).filter(Boolean);
  return Array.from(new Set(ids)).slice(0, 25);
}

async function markAttemptBlockedPrecondition(params: {
  admin: any;
  attemptId: string;
  failureCode: string;
  failureMessage: string;
}) {
  await params.admin
    .from("tenant_saved_method_payment_attempts")
    .update({
      attempt_status: "blocked_precondition",
      failure_code: clean(params.failureCode) || "blocked_precondition",
      failure_message: clean(params.failureMessage) || "Blocked by submit precondition.",
      resolved_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", clean(params.attemptId));
}

function normalizeBlockedReasonsForCurrentAttempt(params: {
  blockedReasonCodes: ScheduledAutopayEligibilityBlockedReason[];
  eligibility: ScheduledAutopayInvoiceEligibilityResult;
  attemptId: string;
}) {
  return params.blockedReasonCodes.filter((reason) => {
    if (reason !== "in_flight_attempt_exists") return true;
    const inFlightId = clean(params.eligibility.snapshots.inFlightAttempt.attemptId);
    return inFlightId !== clean(params.attemptId);
  });
}

async function resolvePendingScheduledAttempt(params: {
  admin: any;
  accountOwnerUserId: string;
  attemptId: string;
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
        "stripe_connected_account_id",
        "stripe_customer_id_snapshot",
        "stripe_payment_method_id_snapshot",
        "amount_cents_snapshot",
        "attempt_kind",
        "attempt_status",
        "stripe_idempotency_key",
        "stripe_payment_intent_id",
      ].join(", "),
    )
    .eq("account_owner_user_id", clean(params.accountOwnerUserId))
    .eq("id", clean(params.attemptId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load scheduled autopay attempt for submit: ${error.message ?? "unknown error"}`,
    );
  }

  return data ? (data as ScheduledAttemptRow) : null;
}

async function hasDuplicateInFlightScheduledAttempt(params: {
  admin: any;
  accountOwnerUserId: string;
  invoiceId: string;
  excludeAttemptId: string;
}) {
  const { data, error } = await params.admin
    .from("tenant_saved_method_payment_attempts")
    .select("id")
    .eq("account_owner_user_id", clean(params.accountOwnerUserId))
    .eq("invoice_id", clean(params.invoiceId))
    .eq("attempt_kind", "scheduled_autopay")
    .neq("id", clean(params.excludeAttemptId))
    .in("attempt_status", ["pending", "submitted", "retry_scheduled"])
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to resolve duplicate in-flight scheduled attempts: ${error.message ?? "unknown error"}`,
    );
  }

  return Boolean(Array.isArray(data) && data[0]?.id);
}

export async function submitScheduledAutopayAttempts(params: {
  admin: any;
  stripe?: Stripe;
  accountOwnerUserId: string;
  attemptId?: string | null;
  attemptIds?: Array<string | null | undefined>;
  revalidateDryRun?: RevalidateDryRun;
  submitAttemptThroughStripe?: typeof submitSavedMethodAttemptThroughStripe;
}): Promise<ScheduledAutopayAttemptSubmitResult> {
  const admin = params.admin;
  const stripe = params.stripe ?? getStripeServerClient();
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const attemptIds = normalizeAttemptIds({
    attemptId: params.attemptId,
    attemptIds: params.attemptIds,
  });
  const revalidateDryRun = params.revalidateDryRun ?? (runScheduledAutopayEligibilityDryRun as RevalidateDryRun);
  const submitAttemptThroughStripe = params.submitAttemptThroughStripe ?? submitSavedMethodAttemptThroughStripe;

  const result: ScheduledAutopayAttemptSubmitResult = {
    accountOwnerUserId,
    evaluatedAt: nowIso(),
    attemptsRequestedCount: attemptIds.length,
    attemptsProcessedCount: 0,
    submittedCount: 0,
    alreadySubmittedCount: 0,
    terminalNoopCount: 0,
    blockedPreconditionCount: 0,
    blockedDuplicateInFlightCount: 0,
    notFoundCount: 0,
    noDirectPaymentRowWrites: true,
    noDirectAllocationRowWrites: true,
    noInvoicePaidMutations: true,
    noVisitOrNextDueMutations: true,
    results: [],
  };

  if (!accountOwnerUserId || attemptIds.length === 0) {
    return result;
  }

  for (const attemptId of attemptIds) {
    const attempt = await resolvePendingScheduledAttempt({
      admin,
      accountOwnerUserId,
      attemptId,
    });

    if (!attempt?.id) {
      result.notFoundCount += 1;
      result.results.push({
        attemptId,
        invoiceId: null,
        outcome: "not_found",
        attemptStatus: null,
        stripePaymentIntentId: null,
        blockedReasonCodes: ["attempt_not_found"],
        failureCode: "attempt_not_found",
        failureMessage: "Scheduled autopay attempt was not found in scope.",
      });
      continue;
    }

    const invoiceId = clean(attempt.invoice_id) || null;
    const status = clean(attempt.attempt_status).toLowerCase();
    const kind = clean(attempt.attempt_kind).toLowerCase();
    const currentIntentId = clean(attempt.stripe_payment_intent_id) || null;

    if (kind !== "scheduled_autopay") {
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: status || null,
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["attempt_kind_not_scheduled_autopay"],
        failureCode: "attempt_kind_not_scheduled_autopay",
        failureMessage: "Attempt kind is not scheduled_autopay.",
      });
      continue;
    }

    if (status === "submitted" && currentIntentId) {
      result.alreadySubmittedCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "already_submitted",
        attemptStatus: status,
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: [],
        failureCode: null,
        failureMessage: null,
      });
      continue;
    }

    if (TERMINAL_ATTEMPT_STATUSES.has(status)) {
      result.terminalNoopCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "terminal_noop",
        attemptStatus: status,
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: [],
        failureCode: null,
        failureMessage: null,
      });
      continue;
    }

    if (status !== "pending") {
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: "attempt_status_not_pending",
        failureMessage: "Scheduled autopay attempt must be pending before submit.",
      });
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["attempt_status_not_pending"],
        failureCode: "attempt_status_not_pending",
        failureMessage: "Scheduled autopay attempt must be pending before submit.",
      });
      continue;
    }

    const amountCents = Number(attempt.amount_cents_snapshot ?? 0) || 0;
    const stripeIdempotencyKey = clean(attempt.stripe_idempotency_key);
    const customerId = clean(attempt.customer_id);
    const connectedAccountId = clean(attempt.stripe_connected_account_id);
    const stripeCustomerIdSnapshot = clean(attempt.stripe_customer_id_snapshot);
    const stripePaymentMethodIdSnapshot = clean(attempt.stripe_payment_method_id_snapshot);

    if (
      !invoiceId
      || amountCents <= 0
      || !stripeIdempotencyKey
      || !customerId
      || !connectedAccountId
      || !stripeCustomerIdSnapshot
      || !stripePaymentMethodIdSnapshot
    ) {
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: "missing_attempt_snapshot",
        failureMessage: "Scheduled autopay attempt snapshot is incomplete for Stripe submit.",
      });
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["missing_attempt_snapshot"],
        failureCode: "missing_attempt_snapshot",
        failureMessage: "Scheduled autopay attempt snapshot is incomplete for Stripe submit.",
      });
      continue;
    }

    const duplicateInFlight = await hasDuplicateInFlightScheduledAttempt({
      admin,
      accountOwnerUserId,
      invoiceId,
      excludeAttemptId: attemptId,
    });

    if (duplicateInFlight) {
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: "duplicate_inflight_attempt",
        failureMessage: "Another in-flight scheduled autopay attempt exists for this invoice.",
      });
      result.blockedDuplicateInFlightCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_duplicate_inflight",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["duplicate_inflight_attempt"],
        failureCode: "duplicate_inflight_attempt",
        failureMessage: "Another in-flight scheduled autopay attempt exists for this invoice.",
      });
      continue;
    }

    const revalidated = await revalidateDryRun({
      accountOwnerUserId,
      supabase: admin,
      evaluatedAt: nowIso(),
      candidateInvoiceIds: [invoiceId],
    });

    const eligibility = (Array.isArray(revalidated.invoicesEvaluated)
      ? revalidated.invoicesEvaluated[0]
      : null) as ScheduledAutopayInvoiceEligibilityResult | null;

    if (!eligibility) {
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: "unsupported_invoice_context",
        failureMessage: "Eligibility context is missing for scheduled autopay submit.",
      });
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["unsupported_invoice_context"],
        failureCode: "unsupported_invoice_context",
        failureMessage: "Eligibility context is missing for scheduled autopay submit.",
      });
      continue;
    }

    const normalizedBlockedReasons = normalizeBlockedReasonsForCurrentAttempt({
      blockedReasonCodes: Array.isArray(eligibility.blockedReasonCodes)
        ? eligibility.blockedReasonCodes
        : [],
      eligibility,
      attemptId,
    });

    if (eligibility.eligibility !== "eligible" || normalizedBlockedReasons.length > 0) {
      const reasonCode = normalizedBlockedReasons[0] ?? "blocked_precondition";
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: reasonCode,
        failureMessage: `Scheduled autopay submit blocked by revalidation: ${reasonCode}`,
      });
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: normalizedBlockedReasons,
        failureCode: reasonCode,
        failureMessage: `Scheduled autopay submit blocked by revalidation: ${reasonCode}`,
      });
      continue;
    }

    const currentAmount = Number(eligibility.snapshots.invoice.proposedAmountCents ?? 0) || 0;
    if (currentAmount <= 0 || currentAmount !== amountCents) {
      await markAttemptBlockedPrecondition({
        admin,
        attemptId,
        failureCode: "amount_snapshot_mismatch",
        failureMessage: "Scheduled autopay attempt amount no longer matches invoice balance due.",
      });
      result.blockedPreconditionCount += 1;
      result.results.push({
        attemptId,
        invoiceId,
        outcome: "blocked_precondition",
        attemptStatus: "blocked_precondition",
        stripePaymentIntentId: currentIntentId,
        blockedReasonCodes: ["amount_snapshot_mismatch"],
        failureCode: "amount_snapshot_mismatch",
        failureMessage: "Scheduled autopay attempt amount no longer matches invoice balance due.",
      });
      continue;
    }

    const submitResult: ManualChargeAttemptResult = await submitAttemptThroughStripe({
      admin,
      stripe,
      accountOwnerUserId,
      customerId,
      invoiceId,
      attemptId,
      attemptKind: "scheduled_autopay",
      amountCents,
      connectedAccountId,
      stripeCustomerId: stripeCustomerIdSnapshot,
      stripePaymentMethodId: stripePaymentMethodIdSnapshot,
      stripeIdempotencyKey,
      billingPeriodId: clean(attempt.billing_period_id) || null,
      maintenanceAgreementId: clean(attempt.maintenance_agreement_id) || null,
    });

    if (submitResult.ok && clean(submitResult.attemptStatus).toLowerCase() === "submitted") {
      result.submittedCount += 1;
    } else if (submitResult.ok) {
      result.blockedPreconditionCount += 1;
    }

    result.results.push({
      attemptId,
      invoiceId,
      outcome:
        clean(submitResult.attemptStatus).toLowerCase() === "submitted"
          ? "submitted"
          : "blocked_precondition",
      attemptStatus: clean(submitResult.attemptStatus) || null,
      stripePaymentIntentId: clean(submitResult.stripePaymentIntentId) || null,
      blockedReasonCodes: submitResult.failureCode ? [clean(submitResult.failureCode)] : [],
      failureCode: clean(submitResult.failureCode) || null,
      failureMessage: clean(submitResult.failureMessage) || null,
    });
  }

  result.attemptsProcessedCount = result.results.length;
  return result;
}
