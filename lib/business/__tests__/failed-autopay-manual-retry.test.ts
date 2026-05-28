import { describe, expect, it, vi } from "vitest";

const mockRunEligibility = vi.fn();
const mockSubmitAttempts = vi.fn();

vi.mock("@/lib/business/scheduled-autopay-eligibility", () => ({
  runScheduledAutopayEligibilityDryRun: (...args: unknown[]) => mockRunEligibility(...args),
}));

vi.mock("@/lib/business/scheduled-autopay-attempt-submission", () => ({
  submitScheduledAutopayAttempts: (...args: unknown[]) => mockSubmitAttempts(...args),
}));

type TableRow = Record<string, unknown>;

function makeEligibilityResult(overrides?: Partial<Record<string, unknown>>) {
  return {
    accountOwnerUserId: "owner-1",
    evaluatedAt: "2026-05-28T00:00:00.000Z",
    dryRun: {
      mode: "dry_run",
      marker: "scheduled_autopay_eligibility_dry_run",
      noWrites: true,
      noStripeCalls: true,
      mutationInstructions: [],
    },
    invoicesEvaluatedCount: 1,
    eligibleInvoicesCount: 1,
    blockedInvoicesCount: 0,
    blockedReasonCounts: {
      invoice_not_issued: 0,
      invoice_void: 0,
      invoice_no_balance_due: 0,
      invoice_already_paid: 0,
      missing_customer: 0,
      missing_payment_profile: 0,
      payment_profile_inactive: 0,
      missing_saved_payment_method: 0,
      saved_payment_method_inactive: 0,
      missing_autopay_consent: 0,
      autopay_not_enabled: 0,
      autopay_paused_or_revoked: 0,
      amount_exceeds_consent_max: 0,
      connected_account_not_ready: 0,
      connected_account_mismatch: 0,
      billing_period_cancelled: 0,
      maintenance_agreement_not_eligible: 0,
      in_flight_attempt_exists: 0,
      unsupported_invoice_context: 0,
    },
    invoicesEvaluated: [
      {
        invoiceId: "inv-1",
        customerId: "cust-1",
        eligibility: "eligible",
        blockedReasonCodes: [] as string[],
        snapshots: {
          invoice: {
            id: "inv-1",
            status: "issued",
            customerId: "cust-1",
            invoiceTotalCents: 5000,
            amountPaidCents: 0,
            balanceDueCents: 5000,
            proposedAmountCents: 5000,
          },
          connectedAccountReadiness: {
            isReady: true,
            connectedAccountId: "acct_ready_1",
            onboardingStatus: "complete",
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
            disabledReason: null,
            lastSyncedAt: null,
            mismatchWithProfile: false,
            mismatchWithMethod: false,
            mismatchWithConsent: false,
          },
          paymentProfileReadiness: {
            profileFound: true,
            profileId: "tsc-1",
            profileStatus: "active",
            isCurrent: true,
            stripeConnectedAccountId: "acct_ready_1",
            stripeCustomerId: "cus_123",
          },
          savedPaymentMethodReadiness: {
            methodFound: true,
            methodId: "pm-row-1",
            stripePaymentMethodId: "pm_123",
            methodStatus: "active",
            methodType: "card",
            tenantStripeCustomerId: "tsc-1",
            stripeConnectedAccountId: "acct_ready_1",
            detachedAt: null,
            invalidatedAt: null,
          },
          consentReadiness: {
            consentFound: true,
            consentId: "consent-1",
            consentStatus: "enabled",
            isEnabled: true,
            isPausedOrRevoked: false,
            maintenanceAgreementId: "ma-1",
            tenantStripeCustomerId: "tsc-1",
            tenantCustomerPaymentMethodId: "pm-row-1",
            stripeConnectedAccountId: "acct_ready_1",
            maxAmountCents: null,
          },
          billingContext: {
            billingPeriodId: "bp-1",
            billingPeriodStatus: "invoice_linked",
            maintenanceAgreementId: "ma-1",
            maintenanceAgreementStatus: "active",
            maintenanceAgreementCustomerId: "cust-1",
          },
          inFlightAttempt: {
            exists: false,
            attemptId: null,
            attemptKind: null,
            attemptStatus: null,
            stripeIdempotencyKey: null,
          },
        },
      },
    ],
    eligibleInvoices: [],
    blockedInvoices: [],
    ...overrides,
  };
}

function makeBlockedEligibility(reason: string) {
  const result = makeEligibilityResult({
    eligibleInvoicesCount: 0,
    blockedInvoicesCount: 1,
  });
  result.invoicesEvaluated[0] = {
    ...result.invoicesEvaluated[0],
    eligibility: "blocked",
    blockedReasonCodes: [reason] as string[],
  };
  return result;
}

function makeAdmin(rows?: TableRow[]) {
  const attempts = new Map<string, TableRow>();
  const touched: Array<{ table: string; op: string }> = [];

  for (const row of rows ?? []) {
    attempts.set(String(row.id), { ...row });
  }

  const from = (table: string) => {
    touched.push({ table, op: "from" });

    const state: {
      eq: Record<string, unknown>;
    } = {
      eq: {},
    };

    const chain: any = {
      eq: (column: string, value: unknown) => {
        state.eq[column] = value;
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: async () => {
        if (table !== "tenant_saved_method_payment_attempts") {
          return { data: [], error: null };
        }

        const list = Array.from(attempts.values()).filter((row) => {
          return Object.entries(state.eq).every(([key, value]) => row[key] === value);
        });
        return { data: list.slice(0, 1), error: null };
      },
      maybeSingle: async () => {
        if (table === "tenant_saved_method_payment_attempts") {
          const list = Array.from(attempts.values()).filter((row) => {
            return Object.entries(state.eq).every(([key, value]) => row[key] === value);
          });
          return { data: list[0] ?? null, error: null };
        }

        return { data: null, error: null };
      },
    };

    return {
      select: () => chain,
      insert: async (payload: TableRow) => {
        touched.push({ table, op: "insert" });
        attempts.set(String(payload.id), { ...payload });
        return { error: null };
      },
      update: async () => ({ error: null }),
    };
  };

  return {
    admin: { from },
    attempts,
    touched,
  };
}

describe("failed autopay manual retry", () => {
  it("allows manual retry for failed_declined when eligibility passes", async () => {
    const ctx = makeAdmin([
      {
        id: "failed-1",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "failed_declined",
        retry_count: 0,
        resolved_internal_invoice_payment_id: null,
      },
    ]);

    mockRunEligibility.mockResolvedValue(makeEligibilityResult());
    mockSubmitAttempts.mockResolvedValue({
      accountOwnerUserId: "owner-1",
      evaluatedAt: "2026-05-28T00:00:00.000Z",
      attemptsRequestedCount: 1,
      attemptsProcessedCount: 1,
      submittedCount: 1,
      alreadySubmittedCount: 0,
      terminalNoopCount: 0,
      blockedPreconditionCount: 0,
      blockedDuplicateInFlightCount: 0,
      notFoundCount: 0,
      noDirectPaymentRowWrites: true,
      noDirectAllocationRowWrites: true,
      noInvoicePaidMutations: true,
      noVisitOrNextDueMutations: true,
      results: [
        {
          attemptId: "retry-1",
          invoiceId: "inv-1",
          outcome: "submitted",
          attemptStatus: "submitted",
          stripePaymentIntentId: "pi_123",
          blockedReasonCodes: [],
          failureCode: null,
          failureMessage: null,
        },
      ],
    });

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "failed-1",
      actorUserId: "user-1",
      retryReason: "manual retry",
    });

    expect(result.outcome).toBe("submitted");
    expect(String(result.retryAttemptId ?? "")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(ctx.attempts.get(String(result.retryAttemptId ?? ""))?.attempt_kind).toBe("scheduled_autopay");
    expect(String(ctx.attempts.get(String(result.retryAttemptId ?? ""))?.stripe_idempotency_key ?? "")).toContain("failed-1");
    expect(ctx.touched.some((entry) => entry.table === "internal_invoice_payments")).toBe(false);
    expect(ctx.touched.some((entry) => entry.table === "internal_invoice_payment_allocations")).toBe(false);
    expect(mockSubmitAttempts).toHaveBeenCalledTimes(1);
  });

  it("allows retry for failed_requires_action only when chargeable again", async () => {
    const ctx = makeAdmin([
      {
        id: "failed-2",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "failed_requires_action",
        retry_count: 1,
        resolved_internal_invoice_payment_id: null,
      },
    ]);

    mockRunEligibility.mockResolvedValue(makeEligibilityResult());
    mockSubmitAttempts.mockResolvedValue({
      accountOwnerUserId: "owner-1",
      evaluatedAt: "2026-05-28T00:00:00.000Z",
      attemptsRequestedCount: 1,
      attemptsProcessedCount: 1,
      submittedCount: 1,
      alreadySubmittedCount: 0,
      terminalNoopCount: 0,
      blockedPreconditionCount: 0,
      blockedDuplicateInFlightCount: 0,
      notFoundCount: 0,
      noDirectPaymentRowWrites: true,
      noDirectAllocationRowWrites: true,
      noInvoicePaidMutations: true,
      noVisitOrNextDueMutations: true,
      results: [
        {
          attemptId: "retry-2",
          invoiceId: "inv-1",
          outcome: "submitted",
          attemptStatus: "submitted",
          stripePaymentIntentId: "pi_456",
          blockedReasonCodes: [],
          failureCode: null,
          failureMessage: null,
        },
      ],
    });

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "failed-2",
      actorUserId: "user-1",
      retryReason: "customer resolved payment method",
    });

    expect(result.outcome).toBe("submitted");
    expect(String(result.retryAttemptId ?? "")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(String(ctx.attempts.get(String(result.retryAttemptId ?? ""))?.stripe_idempotency_key ?? "")).toContain("failed-2");
  });

  it("blocks retry when invoice is already paid", async () => {
    const ctx = makeAdmin([
      {
        id: "failed-3",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "failed_declined",
        retry_count: 0,
        resolved_internal_invoice_payment_id: null,
      },
    ]);

    mockRunEligibility.mockResolvedValue(makeBlockedEligibility("invoice_already_paid"));

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "failed-3",
      actorUserId: "user-1",
      retryReason: "manual retry",
    });

    expect(result.outcome).toBe("blocked_precondition");
    expect(result.blockedReason).toBe("invoice_already_paid");
    expect(ctx.touched.some((entry) => entry.op === "insert")).toBe(false);
  });

  it("blocks retry for non-failed statuses", async () => {
    const ctx = makeAdmin([
      {
        id: "pending-1",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "pending",
        retry_count: 0,
      },
    ]);

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "pending-1",
      actorUserId: "user-1",
      retryReason: "manual retry",
    });

    expect(result.outcome).toBe("blocked_precondition");
    expect(result.blockedReason).toBe("attempt_status_not_retryable");
    expect(ctx.touched.some((entry) => entry.op === "insert")).toBe(false);
  });

  it("blocks when eligibility reports missing consent", async () => {
    const ctx = makeAdmin([
      {
        id: "failed-4",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "failed_declined",
        retry_count: 0,
      },
    ]);

    mockRunEligibility.mockResolvedValue(makeBlockedEligibility("missing_autopay_consent"));

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "failed-4",
      actorUserId: "user-1",
      retryReason: "manual retry",
    });

    expect(result.outcome).toBe("blocked_precondition");
    expect(result.blockedReason).toBe("missing_autopay_consent");
  });

  it("uses Stripe idempotency key and handles missing optional context safely", async () => {
    const ctx = makeAdmin([
      {
        id: "failed-5",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "failed_declined",
        retry_count: null,
        billing_period_id: null,
        maintenance_agreement_id: null,
        tenant_customer_autopay_consent_id: null,
        blocked_reason_code: null,
        failure_code: null,
        failure_message: null,
        requires_action_type: null,
        next_retry_at: null,
        resolved_internal_invoice_payment_id: null,
      },
    ]);

    mockRunEligibility.mockResolvedValue(makeEligibilityResult());
    mockSubmitAttempts.mockResolvedValue({
      accountOwnerUserId: "owner-1",
      evaluatedAt: "2026-05-28T00:00:00.000Z",
      attemptsRequestedCount: 1,
      attemptsProcessedCount: 1,
      submittedCount: 1,
      alreadySubmittedCount: 0,
      terminalNoopCount: 0,
      blockedPreconditionCount: 0,
      blockedDuplicateInFlightCount: 0,
      notFoundCount: 0,
      noDirectPaymentRowWrites: true,
      noDirectAllocationRowWrites: true,
      noInvoicePaidMutations: true,
      noVisitOrNextDueMutations: true,
      results: [
        {
          attemptId: "retry-5",
          invoiceId: "inv-1",
          outcome: "submitted",
          attemptStatus: "submitted",
          stripePaymentIntentId: "pi_789",
          blockedReasonCodes: [],
          failureCode: null,
          failureMessage: null,
        },
      ],
    });

    const stripe = {
      paymentIntents: {
        create: vi.fn(),
      },
    };

    const { retryFailedScheduledAutopayAttemptManually } = await import(
      "@/lib/business/failed-autopay-manual-retry"
    );

    const result = await retryFailedScheduledAutopayAttemptManually({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      failedAttemptId: "failed-5",
      actorUserId: "user-1",
      retryReason: "retry",
    });

    expect(result.outcome).toBe("submitted");
    expect(result.noDirectPaymentRowWrites).toBe(true);
    expect(result.noDirectAllocationRowWrites).toBe(true);
    expect(result.noInvoicePaidMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
    expect(String(result.retryAttemptId ?? "")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(String(ctx.attempts.get(String(result.retryAttemptId ?? ""))?.stripe_idempotency_key ?? "")).toContain("failed-5");
    expect(String(ctx.attempts.get(String(result.retryAttemptId ?? ""))?.stripe_idempotency_key ?? "")).toContain("manual_retry");
  });
});
