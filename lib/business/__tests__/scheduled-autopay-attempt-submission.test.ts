import { describe, expect, it, vi } from "vitest";
import {
  submitScheduledAutopayAttempts,
  type ScheduledAutopayAttemptSubmitResult,
} from "@/lib/business/scheduled-autopay-attempt-submission";
import { submitSavedMethodAttemptThroughStripe } from "@/lib/business/tenant-saved-method-payment-attempts";
import type { ScheduledAutopayDryRunResult } from "@/lib/business/scheduled-autopay-eligibility";

const OWNER_ID = "owner-1";
const ATTEMPT_ID = "attempt-1";
const INVOICE_ID = "inv-1";

function makeAttemptRow(overrides?: Record<string, unknown>) {
  return {
    id: ATTEMPT_ID,
    account_owner_user_id: OWNER_ID,
    customer_id: "cust-1",
    invoice_id: INVOICE_ID,
    billing_period_id: "bp-1",
    maintenance_agreement_id: "ma-1",
    stripe_connected_account_id: "acct_ready_1",
    stripe_customer_id_snapshot: "cus_123",
    stripe_payment_method_id_snapshot: "pm_123",
    amount_cents_snapshot: 5000,
    attempt_kind: "scheduled_autopay",
    attempt_status: "pending",
    stripe_idempotency_key: "scheduled_autopay:owner-1:inv-1:2026-05-28:1",
    stripe_payment_intent_id: null,
    ...overrides,
  };
}

function makeEligibleRevalidation(): ScheduledAutopayDryRunResult {
  return {
    accountOwnerUserId: OWNER_ID,
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
        invoiceId: INVOICE_ID,
        customerId: "cust-1",
        eligibility: "eligible",
        blockedReasonCodes: [],
        snapshots: {
          invoice: {
            id: INVOICE_ID,
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
            exists: true,
            attemptId: ATTEMPT_ID,
            attemptKind: "scheduled_autopay",
            attemptStatus: "pending",
            stripeIdempotencyKey: "scheduled_autopay:owner-1:inv-1:2026-05-28:1",
          },
        },
      },
    ],
    eligibleInvoices: [],
    blockedInvoices: [],
  } as ScheduledAutopayDryRunResult;
}

function makeBlockedRevalidation(reasons: string | string[]): ScheduledAutopayDryRunResult {
  const base = makeEligibleRevalidation();
  const blockedReasonCodes = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ...base,
    eligibleInvoicesCount: 0,
    blockedInvoicesCount: 1,
    invoicesEvaluated: [
      {
        ...base.invoicesEvaluated[0],
        eligibility: "blocked",
        blockedReasonCodes: blockedReasonCodes as any,
      },
    ],
  };
}

function makeAdmin(rows?: Array<Record<string, unknown>>) {
  const attempts = new Map<string, Record<string, unknown>>();
  const touchedTables: string[] = [];

  for (const row of rows ?? [makeAttemptRow()]) {
    attempts.set(String(row.id), { ...row });
  }

  const from = (table: string) => {
    touchedTables.push(table);

    if (["internal_invoice_payments", "internal_invoice_payment_allocations", "internal_invoices", "maintenance_agreement_visits", "maintenance_agreements"].includes(table)) {
      throw new Error(`Forbidden table touched: ${table}`);
    }

    if (table !== "tenant_saved_method_payment_attempts") {
      throw new Error(`Unexpected table touched: ${table}`);
    }

    const state: {
      eq: Record<string, unknown>;
      neq: Record<string, unknown>;
      in: Record<string, unknown[]>;
    } = {
      eq: {},
      neq: {},
      in: {},
    };

    const chain: any = {
      eq: (column: string, value: unknown) => {
        state.eq[column] = value;
        return chain;
      },
      neq: (column: string, value: unknown) => {
        state.neq[column] = value;
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        state.in[column] = values;
        return chain;
      },
      order: () => chain,
      limit: async () => {
        const list = Array.from(attempts.values()).filter((row) => {
          const eqOk = Object.entries(state.eq).every(([k, v]) => row[k] === v);
          const neqOk = Object.entries(state.neq).every(([k, v]) => row[k] !== v);
          const inOk = Object.entries(state.in).every(([k, values]) => values.includes(row[k]));
          return eqOk && neqOk && inOk;
        });
        return { data: list.slice(0, 1), error: null };
      },
      maybeSingle: async () => {
        const list = Array.from(attempts.values()).filter((row) => {
          const eqOk = Object.entries(state.eq).every(([k, v]) => row[k] === v);
          return eqOk;
        });
        return { data: list[0] ?? null, error: null };
      },
    };

    return {
      select: () => chain,
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, value: unknown) => {
          const row = attempts.get(String(value));
          if (row) {
            attempts.set(String(value), { ...row, ...payload });
          }
          return { error: null };
        },
      }),
    };
  };

  return {
    admin: { from },
    attempts,
    touchedTables,
  };
}

describe("scheduled autopay attempt submission", () => {
  it("submits one pending scheduled_autopay attempt when the only in-flight blocker is the current attempt", async () => {
    const ctx = makeAdmin();
    const submitMock = vi.fn(async () => ({
      ok: true,
      attemptId: ATTEMPT_ID,
      attemptStatus: "submitted",
      stripePaymentIntentId: "pi_123",
      failureCode: null,
      failureMessage: null,
    }));

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: submitMock as any,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.submittedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("submitted");
    expect(result.results[0]?.stripePaymentIntentId).toBe("pi_123");
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptKind: "scheduled_autopay",
        stripeIdempotencyKey: "scheduled_autopay:owner-1:inv-1:2026-05-28:1",
      }),
    );
    expect(ctx.touchedTables.includes("internal_invoice_payments")).toBe(false);
    expect(ctx.touchedTables.includes("internal_invoice_payment_allocations")).toBe(false);
  });

  it("returns already_submitted noop for submitted attempt with PaymentIntent id", async () => {
    const ctx = makeAdmin([
      makeAttemptRow({ attempt_status: "submitted", stripe_payment_intent_id: "pi_existing" }),
    ]);

    const submitMock = vi.fn();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: submitMock,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.alreadySubmittedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("already_submitted");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("returns terminal noop for terminal attempt statuses", async () => {
    const ctx = makeAdmin([makeAttemptRow({ attempt_status: "failed_declined" })]);

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.terminalNoopCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("terminal_noop");
  });

  it("blocks duplicate/in-flight scheduled attempt for same invoice", async () => {
    const ctx = makeAdmin([
      makeAttemptRow({ id: ATTEMPT_ID }),
      makeAttemptRow({ id: "attempt-2", attempt_status: "submitted", stripe_payment_intent_id: "pi_2" }),
    ]);

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedDuplicateInFlightCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("blocked_duplicate_inflight");
    expect(ctx.attempts.get(ATTEMPT_ID)?.attempt_status).toBe("blocked_precondition");
  });

  it("blocks when another retry_scheduled attempt exists for the same invoice", async () => {
    const ctx = makeAdmin([
      makeAttemptRow({ id: ATTEMPT_ID }),
      makeAttemptRow({ id: "attempt-2", attempt_status: "retry_scheduled", stripe_payment_intent_id: null }),
    ]);

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedDuplicateInFlightCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("blocked_duplicate_inflight");
    expect(result.results[0]?.blockedReasonCodes).toContain("duplicate_inflight_attempt");
  });

  it("blocks when revalidation reports non-issued invoice", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeBlockedRevalidation("invoice_not_issued")),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedPreconditionCount).toBe(1);
    expect(result.results[0]?.blockedReasonCodes).toContain("invoice_not_issued");
  });

  it("blocks when revalidation reports void invoice", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeBlockedRevalidation("invoice_void")),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.results[0]?.blockedReasonCodes).toContain("invoice_void");
  });

  it("blocks when self in-flight is combined with another eligibility blocker", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeBlockedRevalidation(["in_flight_attempt_exists", "invoice_not_issued"])),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedPreconditionCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("blocked_precondition");
    expect(result.results[0]?.blockedReasonCodes).toContain("invoice_not_issued");
  });

  it("blocks when amount snapshot no longer matches proposed amount", async () => {
    const ctx = makeAdmin([makeAttemptRow({ amount_cents_snapshot: 4200 })]);

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.results[0]?.blockedReasonCodes).toContain("amount_snapshot_mismatch");
    expect(ctx.attempts.get(ATTEMPT_ID)?.attempt_status).toBe("blocked_precondition");
  });

  it("blocks a non-pending target attempt before revalidation", async () => {
    const ctx = makeAdmin([makeAttemptRow({ attempt_status: "retry_scheduled", stripe_payment_intent_id: null })]);

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedPreconditionCount).toBe(1);
    expect(result.results[0]?.outcome).toBe("blocked_precondition");
    expect(result.results[0]?.blockedReasonCodes).toContain("attempt_status_not_pending");
  });

  it("blocks when revalidation reports already-paid invoice", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeBlockedRevalidation("invoice_already_paid")),
      submitAttemptThroughStripe: vi.fn(),
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.blockedPreconditionCount).toBe(1);
    expect(result.results[0]?.blockedReasonCodes).toContain("invoice_already_paid");
  });

  it("blocks missing consent/method/profile/connect readiness via revalidation", async () => {
    const ctx = makeAdmin();
    const reasons = [
      "missing_autopay_consent",
      "saved_payment_method_inactive",
      "payment_profile_inactive",
      "connected_account_not_ready",
    ];

    for (const reason of reasons) {
      const next = await submitScheduledAutopayAttempts({
        admin: ctx.admin,
        accountOwnerUserId: OWNER_ID,
        attemptId: ATTEMPT_ID,
        revalidateDryRun: vi.fn(async () => makeBlockedRevalidation(reason)),
        submitAttemptThroughStripe: vi.fn(),
        stripe: { paymentIntents: { create: vi.fn() } } as any,
      });

      expect(next.results[0]?.blockedReasonCodes).toContain(reason);
      ctx.attempts.set(ATTEMPT_ID, makeAttemptRow());
    }
  });

  it("maps requires_action from shared submit helper without payment/allocation writes", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(async () => ({
        ok: true,
        attemptId: ATTEMPT_ID,
        attemptStatus: "failed_requires_action",
        stripePaymentIntentId: "pi_requires_action",
        failureCode: "authentication_required",
        failureMessage: "Authentication required",
      })) as any,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.results[0]?.attemptStatus).toBe("failed_requires_action");
    expect(result.results[0]?.failureCode).toBe("authentication_required");
    expect(ctx.touchedTables.includes("internal_invoice_payments")).toBe(false);
    expect(ctx.touchedTables.includes("internal_invoice_payment_allocations")).toBe(false);
  });

  it("maps decline from shared submit helper and does not mutate visits or next_due_date", async () => {
    const ctx = makeAdmin();

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      submitAttemptThroughStripe: vi.fn(async () => ({
        ok: true,
        attemptId: ATTEMPT_ID,
        attemptStatus: "failed_declined",
        stripePaymentIntentId: "pi_declined",
        failureCode: "card_declined",
        failureMessage: "Card declined",
      })) as any,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.results[0]?.attemptStatus).toBe("failed_declined");
    expect(result.noVisitOrNextDueMutations).toBe(true);
    expect(ctx.touchedTables.includes("maintenance_agreement_visits")).toBe(false);
    expect(ctx.touchedTables.includes("maintenance_agreements")).toBe(false);
  });

  it("scheduled autopay submit includes application_fee_amount and preserves metadata/idempotency", async () => {
    const ctx = makeAdmin();
    const stripeCreate = vi.fn(async () => ({
      id: "pi_fee_1",
      status: "processing",
      last_payment_error: null,
    }));

    const stripe = { paymentIntents: { create: stripeCreate } } as any;

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      stripe,
      submitAttemptThroughStripe: submitSavedMethodAttemptThroughStripe,
    });

    expect(result.submittedCount).toBe(1);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    const firstCall = stripeCreate.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    const requestOptions = firstCall[1];
    expect(payload.amount).toBe(5000);
    expect(payload.application_fee_amount).toBe(13);
    expect(Number(payload.application_fee_amount)).toBeLessThan(Number(payload.amount));
    expect(payload.metadata).toEqual(
      expect.objectContaining({
        account_owner_user_id: OWNER_ID,
        invoice_id: INVOICE_ID,
        attempt_kind: "scheduled_autopay",
      }),
    );
    expect(requestOptions).toEqual(
      expect.objectContaining({
        stripeAccount: "acct_ready_1",
        idempotencyKey: "scheduled_autopay:owner-1:inv-1:2026-05-28:1",
      }),
    );
  });

  it("scheduled autopay amount 17.50 calculates 4-cent application fee", async () => {
    const ctx = makeAdmin([makeAttemptRow({ amount_cents_snapshot: 1750 })]);
    const stripeCreate = vi.fn(async () => ({
      id: "pi_fee_1750",
      status: "processing",
      last_payment_error: null,
    }));
    const stripe = { paymentIntents: { create: stripeCreate } } as any;

    const revalidate = vi.fn(async () => {
      const base = makeEligibleRevalidation();
      return {
        ...base,
        invoicesEvaluated: [
          {
            ...base.invoicesEvaluated[0],
            snapshots: {
              ...base.invoicesEvaluated[0].snapshots,
              invoice: {
                ...base.invoicesEvaluated[0].snapshots.invoice,
                invoiceTotalCents: 1750,
                balanceDueCents: 1750,
                proposedAmountCents: 1750,
              },
            },
          },
        ],
      } as ScheduledAutopayDryRunResult;
    });

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: revalidate,
      stripe,
      submitAttemptThroughStripe: submitSavedMethodAttemptThroughStripe,
    });

    expect(result.submittedCount).toBe(1);
    const firstCall = stripeCreate.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    expect(payload.amount).toBe(1750);
    expect(payload.application_fee_amount).toBe(4);
    expect(Number(payload.application_fee_amount)).toBeLessThan(1750);
  });

  it("scheduled autopay omits application_fee_amount when fee rounds to zero", async () => {
    const ctx = makeAdmin([makeAttemptRow({ amount_cents_snapshot: 1 })]);
    const stripeCreate = vi.fn(async () => ({
      id: "pi_fee_1cent",
      status: "processing",
      last_payment_error: null,
    }));
    const stripe = { paymentIntents: { create: stripeCreate } } as any;

    const revalidate = vi.fn(async () => {
      const base = makeEligibleRevalidation();
      return {
        ...base,
        invoicesEvaluated: [
          {
            ...base.invoicesEvaluated[0],
            snapshots: {
              ...base.invoicesEvaluated[0].snapshots,
              invoice: {
                ...base.invoicesEvaluated[0].snapshots.invoice,
                invoiceTotalCents: 1,
                balanceDueCents: 1,
                proposedAmountCents: 1,
              },
            },
          },
        ],
      } as ScheduledAutopayDryRunResult;
    });

    const result = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: revalidate,
      stripe,
      submitAttemptThroughStripe: submitSavedMethodAttemptThroughStripe,
    });

    expect(result.submittedCount).toBe(1);
    const firstCall = stripeCreate.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    expect(payload.amount).toBe(1);
    expect(payload.application_fee_amount).toBeUndefined();
  });

  it("repeated submit call is idempotent and does not create another PaymentIntent", async () => {
    const ctx = makeAdmin();
    const stripeCreate = vi.fn(async () => ({
      id: "pi_new_1",
      status: "processing",
      last_payment_error: null,
    }));

    const stripe = { paymentIntents: { create: stripeCreate } } as any;

    const first = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      stripe,
      submitAttemptThroughStripe: submitSavedMethodAttemptThroughStripe,
    });

    const second = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptId: ATTEMPT_ID,
      revalidateDryRun: vi.fn(async () => makeEligibleRevalidation()),
      stripe,
      submitAttemptThroughStripe: submitSavedMethodAttemptThroughStripe,
    });

    expect(first.submittedCount).toBe(1);
    expect(second.alreadySubmittedCount).toBe(1);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("supports bounded list input", async () => {
    const ctx = makeAdmin([
      makeAttemptRow({ id: "attempt-1", invoice_id: "inv-1" }),
      makeAttemptRow({ id: "attempt-2", invoice_id: "inv-2", stripe_idempotency_key: "scheduled_autopay:owner-1:inv-2:2026-05-28:1" }),
    ]);

    const submitMock = vi.fn(async (params: any) => ({
      ok: true,
      attemptId: params.attemptId,
      attemptStatus: "submitted",
      stripePaymentIntentId: `pi_${params.attemptId}`,
      failureCode: null,
      failureMessage: null,
    }));

    const revalidate = vi.fn(async (params: any) => {
      const base = makeEligibleRevalidation();
      const invoiceId = String(params.candidateInvoiceIds?.[0] ?? "");
      return {
        ...base,
        invoicesEvaluated: [
          {
            ...base.invoicesEvaluated[0],
            invoiceId,
            snapshots: {
              ...base.invoicesEvaluated[0].snapshots,
              invoice: {
                ...base.invoicesEvaluated[0].snapshots.invoice,
                id: invoiceId,
              },
            },
          },
        ],
      } as ScheduledAutopayDryRunResult;
    });

    const result: ScheduledAutopayAttemptSubmitResult = await submitScheduledAutopayAttempts({
      admin: ctx.admin,
      accountOwnerUserId: OWNER_ID,
      attemptIds: ["attempt-1", "attempt-2"],
      revalidateDryRun: revalidate,
      submitAttemptThroughStripe: submitMock as any,
      stripe: { paymentIntents: { create: vi.fn() } } as any,
    });

    expect(result.attemptsRequestedCount).toBe(2);
    expect(result.submittedCount).toBe(2);
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});
